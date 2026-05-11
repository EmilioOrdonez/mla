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

// --- ESTILOS CSS REUTILIZABLES (¡Ahora 100% Mobile First!) ---
const UI_STYLE = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Genesys Digital</title>
    <style>
        :root { --primary: #00d2ff; --secondary: #3a7bd5; --dark: #1a1a2e; --success: #00f2fe; --error: #ff4b2b; --warning: #f6ad55; }
        body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--dark); color: white; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 15px; box-sizing: border-box; }
        .container { width: 100%; max-width: 650px; background: #16213e; padding: 20px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #0f3460; text-align: center; }
        h1 { color: var(--primary); margin-bottom: 5px; font-weight: 300; letter-spacing: 1px; font-size: 1.5rem; }
        h2 { color: #aaa; margin-top: 0; margin-bottom: 25px; font-weight: 300; font-size: 1rem; }
        
        .dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 25px; }
        .stat-box { background: #0f3460; padding: 12px 5px; border-radius: 12px; border: 1px solid #1a1a2e; display: flex; flex-direction: column; justify-content: center; }
        .stat-num { font-size: 1.4rem; font-weight: bold; color: #fff; }
        .stat-label { font-size: 0.65rem; text-transform: uppercase; color: #aaa; margin-top: 5px; letter-spacing: 0.5px; }
        .stat-box.pending .stat-num { color: var(--warning); }
        .stat-box.sent .stat-num { color: var(--success); }

        textarea { width: 100%; background: #0f3460; border: 1px solid #1a1a2e; border-radius: 12px; color: #fff; padding: 15px; font-family: 'Consolas', monospace; box-sizing: border-box; resize: vertical; margin-bottom: 15px; font-size: 0.9rem; }
        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 14px 20px; border-radius: 50px; text-decoration: none; font-weight: bold; transition: 0.3s; cursor: pointer; border: none; font-size: 0.85rem; text-transform: uppercase; }
        .btn-primary { background: linear-gradient(45deg, var(--primary), var(--secondary)); color: #fff; width: 100%; margin-top: 5px; }
        .btn-primary:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 0 15px var(--primary); }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn-back { background: #0f3460; color: #aaa; margin-top: 15px; border: 1px solid #1a1a2e; }
        .btn-back:hover { background: #1a1a2e; color: #fff; }
        
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
        .card { background: #1a1a2e; padding: 15px; border-radius: 12px; text-align: left; margin-bottom: 10px; border-left: 4px solid var(--primary); font-size: 0.85rem;}
        .card.error { border-left-color: var(--error); }
        .card.success { border-left-color: var(--success); }
        .tag { font-size: 0.65rem; padding: 3px 8px; border-radius: 4px; background: #333; margin-right: 5px; }
        
        .spinner { display: none; width: 16px; height: 16px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; margin-right: 10px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        @media (max-width: 480px) { 
            .grid { grid-template-columns: 1fr; } 
            .btn { width: 100%; box-sizing: border-box; }
        }
    </style>
    <script>
        function showLoading() {
            const btn = document.getElementById('btn-procesar');
            const text = document.getElementById('btn-text');
            const spinner = document.getElementById('spinner');
            const textarea = document.getElementById('urls-input');
            
            if(textarea.value.trim() === '') return; 
            
            btn.disabled = true;
            spinner.style.display = 'block';
            text.innerText = 'Procesando Enlaces...';
            document.getElementById('form-manual').submit();
        }
    </script>
</head>
<body>
`;

const UI_FOOTER = `</body></html>`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- RUTA PRINCIPAL ---
app.get('/', async (req, res) => {
    try {
        const { count: total } = await supabase.from('ofertas').select('*', { count: 'exact', head: true });
        const { count: enviadas } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', true);
        const { count: pendientes } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);

        res.send(`
            ${UI_STYLE}
            <div class="container">
                <h1>GENESYS <span style="color:#fff">DIGITAL</span></h1>
                <h2>Control de Afiliados</h2>
                
                <div class="dashboard">
                    <div class="stat-box">
                        <div class="stat-num">${total || 0}</div>
                        <div class="stat-label">Total DB</div>
                    </div>
                    <div class="stat-box sent">
                        <div class="stat-num">${enviadas || 0}</div>
                        <div class="stat-label">Publicadas</div>
                    </div>
                    <div class="stat-box pending">
                        <div class="stat-num">${pendientes || 0}</div>
                        <div class="stat-label">En Cola</div>
                    </div>
                </div>

                <form id="form-manual" action="/api/manual" method="POST">
                    <textarea id="urls-input" name="urls" rows="6" placeholder="Pega los links meli.la aquí (uno por línea)..." required></textarea>
                    <button type="button" id="btn-procesar" class="btn btn-primary" onclick="showLoading()">
                        <span id="spinner" class="spinner"></span>
                        <span id="btn-text">🚀 Procesar y Guardar</span>
                    </button>
                </form>

                <div class="grid">
                    <a href="/api/buscar" class="btn btn-back" style="color: #28a745;">🔍 Buscar Auto</a>
                    <a href="/api/publicar" class="btn btn-back" style="color: #6f42c1;">📤 Publicar Ahora</a>
                </div>
            </div>
            ${UI_FOOTER}
        `);
    } catch (err) {
        res.status(500).send("Error conectando a la base de datos.");
    }
});

// --- PROCESADOR MANUAL ---
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

            let realUrl = response.request.res.responseUrl;
            const mlidMatch = realUrl.match(/MLM-?(\d+)/);
            const uniqueId = mlidMatch ? mlidMatch[0] : realUrl.split('?')[0];

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
            
            const urlObj = new URL(realUrl);
            urlObj.searchParams.set('matt_tool', process.env.ML_MATT_TOOL);
            urlObj.searchParams.set('matt_word', process.env.ML_MATT_WORD);
            const linkAfiliadoFinal = urlObj.toString();

            const { data, error } = await supabase.from('ofertas').upsert({
                producto: titulo,
                precio_original: parseFloat(precioOrig),
                precio_oferta: parseFloat(precioOf),
                link_original: uniqueId, 
                link_afiliado: linkAfiliadoFinal,
                imagen_url: imagen,
                status: 'Aprobado',
                enviado: false,
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' }).select();

            if (error) throw error;

            resultados.push({ status: 'success', prod: titulo, id_db: data[0].id });
            await sleep(4000); 

        } catch (err) {
            resultados.push({ status: 'error', prod: url, detail: err.message });
        }
    }

    let reportHtml = `${UI_STYLE}<div class="container"><h2>📊 Reporte de Operación</h2>`;
    resultados.forEach(r => {
        const ahora = new Date().toLocaleTimeString("es-MX", {timeZone: "America/Mexico_City"});
        reportHtml += `
            <div class="card ${r.status}">
                <span class="tag">${ahora}</span>
                <strong>${r.status === 'success' ? '✅' : '❌'}</strong> ${r.prod}
                ${r.status === 'success' ? `<br><small style="color: #00f2fe">DB ID: ${r.id_db}</small>` : `<br><small style="color: #ff4b2b">${r.detail}</small>`}
            </div>`;
    });
    reportHtml += `<br><a href="/" class="btn btn-back">⬅️ VOLVER AL PANEL</a></div>${UI_FOOTER}`;
    
    res.send(reportHtml);
});

// --- ENDPOINTS AUTOMÁTICOS ---
app.get('/api/buscar', async (req, res) => {
    res.send(`${UI_STYLE}<div class="container"><h2>🔍 Búsqueda Iniciada</h2><p>El bot está explorando ofertas...</p><a href="/" class="btn btn-back">VOLVER</a></div>${UI_FOOTER}`);
    await runScraper();
});

app.get('/api/publicar', async (req, res) => {
    res.send(`${UI_STYLE}<div class="container"><h2>📤 Publicador Iniciado</h2><p>Enviando novedades a Telegram y Facebook...</p><a href="/" class="btn btn-back">VOLVER</a></div>${UI_FOOTER}`);
    await enviarOfertasAprobadas();
});

app.listen(PORT, () => console.log(`🌐 Genesys Digital activo en puerto ${PORT}`));