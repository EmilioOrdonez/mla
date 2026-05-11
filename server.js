const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🟢 INTERFAZ: Formulario para envío masivo
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 40px auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">🚀 Panel de Carga Masiva</h2>
            <p style="color: #666;">Pega una o varias URLs (una por línea):</p>
            <form action="/api/manual" method="POST">
                <textarea name="urls" rows="10" style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px; font-family: monospace; resize: vertical;" placeholder="https://meli.la/...\nhttps://articulo.mercadolibre.com.mx/..." required></textarea>
                <button type="submit" style="margin-top: 15px; width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Procesar y Guardar en Supabase</button>
            </form>
            <div style="margin-top: 20px; font-size: 0.9em; color: #888;">
                Endpoints: <a href="/api/buscar">/buscar</a> | <a href="/api/publicar">/publicar</a>
            </div>
        </div>
    `);
});

// 🟢 LÓGICA: Procesador Masivo con Scraping de Detalle
app.post('/api/manual', async (req, res) => {
    // Dividimos el contenido del textarea por saltos de línea y limpiamos espacios
    const rawUrls = req.body.urls.split(/\r?\n/);
    const urls = rawUrls.map(u => u.trim()).filter(u => u.length > 0);
    
    let resultados = [];

    for (const url of urls) {
        try {
            console.log(`🔍 Procesando: ${url}`);
            
            // 1. Expandir URL y obtener HTML
            const response = await axios.get(url, { 
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const realUrl = response.request.res.responseUrl.split('?')[0];
            const $ = cheerio.load(response.data);

            // 2. Selectores específicos para la página de PRODUCTO (PDP)
            const titulo = $('.ui-pdp-title').text().trim();
            
            // Extraer precios (ML usa clases diferentes en la página de detalle)
            const precioOfertaStr = $('.ui-pdp-price__second-line .andes-money-amount__fraction').first().text().replace(/,/g, '');
            const precioOriginalStr = $('.ui-pdp-price__part--original .andes-money-amount__fraction').first().text().replace(/,/g, '');
            
            // URL de la imagen (usualmente es la primera de la galería)
            const imagen = $('.ui-pdp-gallery__figure__image').first().attr('src') || $('.ui-pdp-image').first().attr('src');

            if (!titulo || !precioOfertaStr) {
                throw new Error("No se pudieron extraer los datos esenciales.");
            }

            // 3. Guardar en Supabase
            const { error } = await supabase.from('ofertas').upsert({
                producto: titulo,
                precio_original: parseFloat(precioOriginalStr) || parseFloat(precioOfertaStr),
                precio_oferta: parseFloat(precioOfertaStr),
                link_original: realUrl,
                link_afiliado: `${realUrl}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`,
                imagen_url: imagen,
                status: 'Aprobado'
            }, { onConflict: 'link_original' });

            if (error) throw error;
            resultados.push({ url, status: '✅ Éxito', producto: titulo });

        } catch (err) {
            console.error(`❌ Error en ${url}:`, err.message);
            resultados.push({ url, status: '❌ Error', detalle: err.message });
        }
    }

    // Generar reporte de salida
    let htmlReport = `<h2>Reporte de Carga</h2><ul>`;
    resultados.forEach(r => {
        htmlReport += `<li><strong>${r.status}</strong>: ${r.producto || r.url} ${r.detalle ? `(${r.detalle})` : ''}</li>`;
    });
    htmlReport += `</ul><a href="/">Volver al panel</a>`;
    
    res.send(htmlReport);
});

// Endpoints de automatización (sin cambios)
app.get('/api/buscar', (req, res) => {
    res.status(200).send('Búsqueda iniciada.');
    runScraper();
});

app.get('/api/publicar', (req, res) => {
    res.status(200).send('Publicador iniciado.');
    enviarOfertasAprobadas();
});

app.listen(PORT, () => console.log(`🌐 Servidor en puerto ${PORT}`));