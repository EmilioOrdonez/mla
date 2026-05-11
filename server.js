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
// 🟢 LÓGICA: Procesador Masivo con Extracción JSON-LD y Diagnóstico
app.post('/api/manual', async (req, res) => {
    const rawUrls = req.body.urls.split(/\r?\n/);
    const urls = rawUrls.map(u => u.trim()).filter(u => u.length > 0);

    let resultados = [];

    for (const url of urls) {
        try {
            console.log(`🔍 Procesando: ${url}`);

            const response = await axios.get(url, {
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept-Language': 'es-MX,es;q=0.9'
                }
            });

            const realUrl = response.request.res.responseUrl.split('?')[0];

            // 1. Detección de link expirado (Redirección al inicio)
            if (realUrl.includes('/gz/home') || realUrl === 'https://www.mercadolibre.com.mx/') {
                throw new Error("El enlace redireccionó al inicio (Link expirado o producto eliminado).");
            }

            const $ = cheerio.load(response.data);

            // 2. Detección de bloqueo anti-bots
            const pageTitle = $('title').text().toLowerCase();
            if (pageTitle.includes('robot') || pageTitle.includes('captcha') || pageTitle.includes('verifica')) {
                throw new Error("Bloqueo temporal de Mercado Libre (Captcha detectado).");
            }

            // 3. Extracción Nivel 3: Buscar el objeto JSON-LD estructurado
            let jsonLdData = {};
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const parsed = JSON.parse($(el).html());
                    if (parsed['@type'] === 'Product') {
                        jsonLdData = parsed;
                    }
                } catch (e) { }
            });

            // Título: Agregamos la etiqueta <h1> como último recurso infalible
            let titulo = jsonLdData.name || $('meta[property="og:title"]').attr('content') || $('.ui-pdp-title').text().trim() || $('h1').text().trim();
            if (titulo && titulo.includes(' - $')) {
                titulo = titulo.substring(0, titulo.lastIndexOf(' - $')).trim();
            }

            // Búsqueda exhaustiva del precio (Fuerza Bruta para páginas /p/ de catálogo)
            let precioOfertaStr = (jsonLdData.offers && jsonLdData.offers.price) ? jsonLdData.offers.price :
                $('meta[itemprop="price"]').attr('content') ||
                $('.ui-pdp-price__second-line .andes-money-amount__fraction').first().text().replace(/,/g, '') ||
                $('.ui-pdp-buybox .andes-money-amount__fraction').first().text().replace(/,/g, '') ||
                // Selector global: Encuentra el primer precio que NO sea un precio original/tachado
                $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').not('.ui-pdp-price__part--original .andes-money-amount__fraction').first().text().replace(/,/g, '');

            let precioOriginalStr = $('.ui-pdp-price__part--original .andes-money-amount__fraction').first().text().replace(/,/g, '') ||
                $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');

            let imagen = $('meta[property="og:image"]').attr('content');
            if (!imagen && jsonLdData.image) {
                imagen = Array.isArray(jsonLdData.image) ? jsonLdData.image[0] : jsonLdData.image;
            }
            if (!imagen) imagen = $('.ui-pdp-gallery__figure__image').first().attr('src') || $('.ui-pdp-image').first().attr('src');

            // 4. Diagnóstico de Catálogo y Stock
            if (!titulo || !precioOfertaStr || precioOfertaStr === '') {
                const bodyText = $('body').text().toLowerCase();
                if (bodyText.includes('sin stock') || bodyText.includes('agotado')) {
                    throw new Error("El producto está agotado (Sin stock disponible).");
                }
                const isPaused = bodyText.includes('publicación pausada');
                if (isPaused) throw new Error("La publicación se encuentra pausada o finalizada.");

                throw new Error("Estructura encriptada. No se encontró el precio.");
            }

            // 3. Guardar en Supabase con reporte de estado
            const { data, error, status } = await supabase
                .from('ofertas')
                .upsert({
                    producto: titulo,
                    precio_original: parseFloat(precioOriginalStr) || parseFloat(precioOfertaStr),
                    precio_oferta: parseFloat(precioOfertaStr),
                    link_original: realUrl,
                    link_afiliado: `${realUrl}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`,
                    imagen_url: imagen,
                    status: 'Aprobado',
                    enviado: false // Forzamos a que se vuelva a enviar si lo estamos metiendo manual
                }, { onConflict: 'link_original' })
                .select(); // Esto nos devuelve el registro afectado

            if (error) throw error;

            console.log(`📡 Supabase respondió con status: ${status}`);

            resultados.push({
                url,
                status: '✅ Éxito',
                producto: titulo,
                detalle: data && data.length > 0 ? "Registro actualizado/insertado" : "Sin cambios"
            });

            if (error) throw error;
            resultados.push({ url, status: '✅ Éxito', producto: titulo });

        } catch (err) {
            console.error(`❌ Error en ${url}:`, err.message);
            resultados.push({ url, status: '❌ Error', detalle: err.message });
        }
    }

    // Renderizado del reporte
    let htmlReport = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 40px auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">📊 Reporte de Procesamiento</h2>
            <ul style="list-style: none; padding: 0;">
    `;
    resultados.forEach(r => {
        const color = r.status.includes('Éxito') ? '#28a745' : '#dc3545';
        htmlReport += `
            <li style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-left: 4px solid ${color}; border-radius: 4px;">
                <strong style="color: ${color}; font-size: 1.1em;">${r.status}</strong><br>
                <span style="color: #333; font-weight: 500;">${r.producto || r.url}</span><br>
                ${r.detalle ? `<small style="color: #666; font-family: monospace;">Detalle: ${r.detalle}</small>` : ''}
            </li>`;
    });
    htmlReport += `</ul><a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Volver al Panel</a></div>`;

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