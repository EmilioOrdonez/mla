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

// --- ESTILOS CSS REUTILIZABLES (Diseño Responsive & Elegante) ---
const UI_STYLE = `
<style>
    :root { --primary: #00d2ff; --secondary: #3a7bd5; --dark: #1a1a2e; --success: #00f2fe; --error: #ff4b2b; }
    body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--dark); color: white; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { width: 90%; max-width: 650px; background: #16213e; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #0f3460; text-align: center; }
    h1, h2 { color: var(--primary); margin-bottom: 20px; font-weight: 300; letter-spacing: 1px; }
    textarea { width: 100%; background: #0f3460; border: 1px solid #1a1a2e; border-radius: 12px; color: #fff; padding: 15px; font-family: 'Consolas', monospace; box-sizing: border-box; resize: vertical; margin-bottom: 15px; }
    .btn { display: inline-block; padding: 12px 25px; border-radius: 50px; text-decoration: none; font-weight: bold; transition: 0.3s; cursor: pointer; border: none; font-size: 14px; text-transform: uppercase; }
    .btn-primary { background: linear-gradient(45deg, var(--primary), var(--secondary)); color: #fff; width: 100%; margin-top: 10px; }
    .btn-primary:hover { transform: scale(1.02); box-shadow: 0 0 15px var(--primary); }
    .btn-back { background: #0f3460; color: #aaa; margin-top: 20px; border: 1px solid #1a1a2e; }
    .btn-back:hover { background: #1a1a2e; color: #fff; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; }
    .card { background: #1a1a2e; padding: 15px; border-radius: 12px; text-align: left; margin-bottom: 10px; border-left: 4px solid var(--primary); }
    .card.error { border-left-color: var(--error); }
    .card.success { border-left-color: var(--success); }
    .tag { font-size: 10px; padding: 3px 8px; border-radius: 4px; background: #333; margin-right: 5px; }
    @media (max-width: 480px) { .grid { grid-template-columns: 1fr; } }
</style>
`;

// --- RUTA PRINCIPAL (Dashboard) ---
app.get('/', (req, res) => {
    res.send(`
        ${UI_STYLE}
        <div class="container">
            <h1 style="font-size: 1.5em;">GENESYS <span style="color:#fff">DIGITAL</span></h1>
            <h2>Control de Afiliados</h2>
            
            <form action="/api/manual" method="POST">
                <textarea name="urls" rows="6" placeholder="Pega los links meli.la aquí (uno por línea)..." required></textarea>
                <button type="submit" class="btn btn-primary">🚀 Procesar y Guardar</button>
            </form>

            <div class="grid">
                <a href="/api/buscar" class="btn btn-back" style="color: #28a745;">🔍 Buscar Auto</a>
                <a href="/api/publicar" class="btn btn-back" style="color: #6f42c1;">📤 Publicar Ahora</a>
            </div>
            
            <p style="color: #555; font-size: 12px; margin-top: 30px;">Infraestructura Activa 24/7</p>
        </div>
    `);
});

// --- PROCESADOR MANUAL MEJORADO ---
app.post('/api/manual', async (req, res) => {
    const rawUrls = req.body.urls.split(/\r?\n/);
    const urls = rawUrls.map(u => u.trim()).filter(u => u.length > 0);
    let resultados = [];

    for (const url of urls) {
        try {
            const response = await axios.get(url, { 
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const realUrl = response.request.res.responseUrl.split('?')[0];
            const $ = cheerio.load(response.data);

            let jsonLd = {};
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const parsed = JSON.parse($(el).html());
                    if (parsed['@type'] === 'Product') jsonLd = parsed;
                } catch (e) {}
            });

            let titulo = jsonLd.name || $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            if(titulo && titulo.includes(' - $')) titulo = titulo.substring(0, titulo.lastIndexOf(' - $')).trim();

            let precioOf = (jsonLd.offers && jsonLd.offers.price) ? jsonLd.offers.price :
                           $('meta[itemprop="price"]').attr('content') || 
                           $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');

            let precioOrig = $('.ui-pdp-price__part--original .andes-money-amount__fraction').first().text().replace(/,/g, '') ||
                             $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOf;

            let imagen = $('meta[property="og:image"]').attr('content') || (jsonLd.image && jsonLd.image[0]) || $('.ui-pdp-image').first().attr('src');

            if (!titulo || !precioOf) throw new Error("Datos incompletos.");

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
            resultados.push({ status: 'success', prod: titulo });

        } catch (err) {
            resultados.push({ status: 'error', prod: url, detail: err.message });
        }
    }

    let reportHtml = `${UI_STYLE}<div class="container"><h2>Reporte de Carga</h2>`;
    resultados.forEach(r => {
        reportHtml += `
            <div class="card ${r.status}">
                <strong>${r.status === 'success' ? '✅' : '❌'}</strong> ${r.prod}
                ${r.detail ? `<br><small style="color:#ff4b2b">${r.detail}</small>` : ''}
            </div>`;
    });
    reportHtml += `<a href="/" class="btn btn-back">⬅️ VOLVER AL PANEL</a></div>`;
    res.send(reportHtml);
});

// --- ENDPOINTS AUTOMÁTICOS ---
app.get('/api/buscar', async (req, res) => {
    res.send(`${UI_STYLE}<div class="container"><h2>🔍 Búsqueda Iniciada</h2><p>El bot está explorando ofertas...</p><a href="/" class="btn btn-back">VOLVER</a></div>`);
    await runScraper();
});

app.get('/api/publicar', async (req, res) => {
    res.send(`${UI_STYLE}<div class="container"><h2>📤 Publicador Iniciado</h2><p>Enviando novedades a Telegram...</p><a href="/" class="btn btn-back">VOLVER</a></div>`);
    await enviarOfertasAprobadas();
});

app.listen(PORT, () => console.log(`🌐 Genesys Digital activo en puerto ${PORT}`));