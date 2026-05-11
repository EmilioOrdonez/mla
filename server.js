const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Importamos las funciones de tus otros archivos
const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicialización de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middlewares para procesar datos de formularios y JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --------------------------------------------------------------------------
// 1. INTERFAZ: Panel de Control (Manual + Enlaces de Estado)
// --------------------------------------------------------------------------
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 40px auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <h2 style="color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px;">🚀 Genesys Digital: Panel de Control</h2>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                <h4 style="margin-top:0;">📥 Carga Masiva Manual</h4>
                <p style="color: #666; font-size: 0.9em;">Pega tus links (meli.la o directos), uno por línea:</p>
                <form action="/api/manual" method="POST">
                    <textarea name="urls" rows="8" style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px; font-family: monospace;" placeholder="https://meli.la/...\nhttps://articulo.mercadolibre..."></textarea>
                    <button type="submit" style="margin-top: 10px; width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Procesar y Guardar</button>
                </form>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <a href="/api/buscar" style="text-align: center; padding: 15px; background: #28a745; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">🔍 Disparar Búsqueda Auto</a>
                <a href="/api/publicar" style="text-align: center; padding: 15px; background: #6f42c1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">📤 Disparar Publicador</a>
            </div>
            
            <p style="margin-top: 20px; color: #888; font-size: 0.8em; text-align: center;">El servidor responderá a los cron-jobs externos de forma automática.</p>
        </div>
    `);
});

// --------------------------------------------------------------------------
// 2. LÓGICA MANUAL: Procesador Masivo con Scraping de Nivel 3
// --------------------------------------------------------------------------
app.post('/api/manual', async (req, res) => {
    const rawUrls = req.body.urls.split(/\r?\n/);
    const urls = rawUrls.map(u => u.trim()).filter(u => u.length > 0);
    let resultados = [];

    for (const url of urls) {
        try {
            console.log(`🔍 Procesando manual: ${url}`);
            const response = await axios.get(url, { 
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const realUrl = response.request.res.responseUrl.split('?')[0];
            const $ = cheerio.load(response.data);

            // Extracción JSON-LD (Dato estructurado de Google)
            let jsonLd = {};
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const parsed = JSON.parse($(el).html());
                    if (parsed['@type'] === 'Product') jsonLd = parsed;
                } catch (e) {}
            });

            // Mapeo de datos con fallbacks robustos
            let titulo = jsonLd.name || $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            if(titulo && titulo.includes(' - $')) titulo = titulo.substring(0, titulo.lastIndexOf(' - $')).trim();

            let precioOf = (jsonLd.offers && jsonLd.offers.price) ? jsonLd.offers.price :
                           $('meta[itemprop="price"]').attr('content') || 
                           $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');

            let precioOrig = $('.ui-pdp-price__part--original .andes-money-amount__fraction').first().text().replace(/,/g, '') ||
                             $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOf;

            let imagen = $('meta[property="og:image"]').attr('content') || (jsonLd.image && jsonLd.image[0]) || $('.ui-pdp-image').first().attr('src');

            if (!titulo || !precioOf) throw new Error("No se detectaron datos en la página.");

            // Guardar o Actualizar en Supabase (Reiniciando 'enviado' a false)
            const { error } = await supabase.from('ofertas').upsert({
                producto: titulo,
                precio_original: parseFloat(precioOrig),
                precio_oferta: parseFloat(precioOf),
                link_original: realUrl,
                link_afiliado: `${realUrl}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`,
                imagen_url: imagen,
                status: 'Aprobado',
                enviado: false 
            }, { onConflict: 'link_original' });

            if (error) throw error;
            resultados.push({ status: '✅ Éxito', producto: titulo });

        } catch (err) {
            resultados.push({ status: '❌ Error', producto: url, detalle: err.message });
        }
    }

    // Reporte Final
    let report = `<div style="font-family: sans-serif; max-width: 600px; margin: 20px auto;"><h2>Reporte de Carga</h2><ul style="list-style:none; padding:0;">`;
    resultados.forEach(r => {
        const isErr = r.status.includes('Error');
        report += `<li style="padding:10px; margin-bottom:5px; background:${isErr ? '#fff5f5' : '#f0fff4'}; border-left:5px solid ${isErr ? '#fc8181' : '#68d391'};">
            <strong>${r.status}</strong>: ${r.producto} ${r.detalle ? `<br><small>${r.detalle}</small>` : ''}
        </li>`;
    });
    report += `</ul><a href="/">Volver</a></div>`;
    res.send(report);
});

// --------------------------------------------------------------------------
// 3. DISPARADORES AUTOMÁTICOS (Webhooks para Cron-Jobs externos)
// --------------------------------------------------------------------------

// Endpoint para el Scraper automático (Se llama cada 45 min desde cron-job.org)
app.get('/api/buscar', async (req, res) => {
    console.log("🚀 Disparando búsqueda automática...");
    res.status(200).send("Proceso de búsqueda iniciado.");
    try {
        await runScraper();
    } catch (err) {
        console.error("Error en búsqueda auto:", err.message);
    }
});

// Endpoint para el Publicador de Telegram (Se llama cada 60 min desde cron-job.org)
app.get('/api/publicar', async (req, res) => {
    console.log("🚀 Disparando publicación automática...");
    res.status(200).send("Proceso de publicación iniciado.");
    try {
        await enviarOfertasAprobadas();
    } catch (err) {
        console.error("Error en publicación auto:", err.message);
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Genesys Digital activo en puerto ${PORT}`);
});