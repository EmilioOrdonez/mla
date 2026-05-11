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

// --- FUNCIÓN ACORTADORA (TinyURL con protección de tiempo) ---
async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data : urlLarga;
    } catch (e) {
        console.error("⚠️ Error acortando link con TinyURL:", e.message);
        return urlLarga; // Si falla, devuelve el link original para no detener el sistema
    }
}

const UI_STYLE = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Genesys Digital - Admin</title>
    <style>
        :root { 
            --primary: #00d2ff; 
            --secondary: #3a7bd5; 
            --dark: #1a1a2e; 
            --success: #00f2fe; 
            --error: #ff4b2b; 
            --warning: #f6ad55; 
        }
        body { 
            font-family: 'Segoe UI', Roboto, sans-serif; 
            background: var(--dark); 
            color: white; 
            margin: 0; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            min-height: 100vh; 
            padding: 15px; 
            box-sizing: border-box; 
        }
        .container { 
            width: 100%; 
            max-width: 600px; 
            background: #16213e; 
            padding: 25px; 
            border-radius: 24px; 
            box-shadow: 0 15px 35px rgba(0,0,0,0.6); 
            border: 1px solid #0f3460; 
            text-align: center; 
        }
        h1 { 
            color: var(--primary); 
            margin: 0; 
            font-weight: 700; 
            letter-spacing: 1px; 
            font-size: 1.6rem; 
        }
        .dashboard { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 10px; 
            margin: 25px 0; 
        }
        .stat-box { 
            background: #0f3460; 
            padding: 15px 5px; 
            border-radius: 15px; 
            border: 1px solid #1a1a2e; 
        }
        .stat-num { 
            font-size: 1.5rem; 
            font-weight: bold; 
        }
        .stat-label { 
            font-size: 0.6rem; 
            text-transform: uppercase; 
            color: #888; 
            margin-top: 5px; 
        }
        textarea { 
            width: 100%; 
            background: #0f3460; 
            border: 1px solid #1a1a2e; 
            border-radius: 15px; 
            color: #fff; 
            padding: 15px; 
            box-sizing: border-box; 
            resize: none; 
            margin-bottom: 15px; 
            font-size: 0.9rem; 
        }
        .btn { 
            display: inline-flex; 
            align-items: center; 
            justify-content: center; 
            padding: 15px 25px; 
            border-radius: 50px; 
            text-decoration: none; 
            font-weight: bold; 
            transition: 0.3s; 
            cursor: pointer; 
            border: none; 
            font-size: 0.9rem; 
            width: 100%; 
            box-sizing: border-box; 
        }
        .btn-primary { 
            background: linear-gradient(45deg, var(--primary), var(--secondary)); 
            color: #fff; 
            margin-top: 5px; 
        }
        .btn-back { 
            background: #0f3460; 
            color: #aaa; 
            margin-top: 15px; 
            border: 1px solid #1a1a2e; 
        }
        .grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 10px; 
            margin-top: 20px; 
        }
        .card { 
            background: #1a1a2e; 
            padding: 15px; 
            border-radius: 15px; 
            text-align: left; 
            border-left: 4px solid var(--primary); 
            margin-bottom: 10px; 
            font-size: 0.85rem; 
        }
        .spinner { 
            display: none; 
            width: 18px; 
            height: 18px; 
            border: 3px solid rgba(255,255,255,0.3); 
            border-radius: 50%; 
            border-top-color: #fff; 
            animation: spin 1s infinite; 
            margin-right: 10px; 
        }
        @keyframes spin { 
            to { transform: rotate(360deg); } 
        }
    </style>
    <script>
        function showLoading() {
            const btn = document.getElementById('btn-procesar');
            const textarea = document.getElementById('urls-input');
            if(textarea.value.trim() === '') return;
            
            btn.disabled = true;
            document.getElementById('spinner').style.display = 'block';
            document.getElementById('btn-text').innerText = 'Acortando y Guardando...';
            document.getElementById('form-manual').submit();
        }
    </script>
</head>
<body>
`;

const UI_FOOTER = `</body></html>`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- DASHBOARD (PANTALLA PRINCIPAL) ---
app.get('/', async (req, res) => {
    try {
        const { count: total } = await supabase.from('ofertas').select('*', { count: 'exact', head: true });
        const { count: enviadas } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', true);
        const { count: pendientes } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);
        
        res.send(`
            ${UI_STYLE}
            <div class="container">
                <h1>GENESYS <span style="color:#fff">DIGITAL</span></h1>
                
                <div class="dashboard">
                    <div class="stat-box">
                        <div class="stat-num">${total || 0}</div>
                        <div class="stat-label">Total</div>
                    </div>
                    <div class="stat-box" style="color:var(--success)">
                        <div class="stat-num">${enviadas || 0}</div>
                        <div class="stat-label">Enviados</div>
                    </div>
                    <div class="stat-box" style="color:var(--warning)">
                        <div class="stat-num">${pendientes || 0}</div>
                        <div class="stat-label">Pendientes</div>
                    </div>
                </div>
                
                <form id="form-manual" action="/api/manual" method="POST">
                    <textarea id="urls-input" name="urls" rows="5" placeholder="Pega los links meli.la aquí..." required></textarea>
                    <button type="button" id="btn-procesar" class="btn btn-primary" onclick="showLoading()">
                        <span id="spinner" class="spinner"></span>
                        <span id="btn-text">🚀 PROCESAR OFERTAS</span>
                    </button>
                </form>
                
                <div class="grid">
                    <a href="/api/buscar" class="btn btn-back" style="color: #28a745;">🔍 AUTO SEARCH</a>
                    <a href="/api/publicar" class="btn btn-back" style="color: #6f42c1;">📤 PUBLICAR YA</a>
                </div>
            </div>
            ${UI_FOOTER}
        `);
    } catch (e) { 
        res.status(500).send("Error conectando a la base de datos"); 
    }
});

// --- PROCESADOR MANUAL ---
app.post('/api/manual', async (req, res) => {
    const urls = req.body.urls.split(/\r?\n/).map(u => u.trim()).filter(u => u.length > 0);
    let resultados = [];
    
    for (const url of urls) {
        try {
            console.log(`🔍 Procesando manual: ${url}`);
            const resp = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
            let realUrl = resp.request.res.responseUrl;
            
            // Extraer ID único para evitar colisiones
            const uniqueId = realUrl.match(/MLM-?(\d+)/) ? realUrl.match(/MLM-?(\d+)/)[0] : realUrl.split('?')[0];
            
            const $ = cheerio.load(resp.data);
            
            let titulo = $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            if(titulo.includes(' - $')) titulo = titulo.split(' - $')[0];
            
            let precioOf = $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            let precioOrig = $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOf;
            
            // Inyectar afiliado y acortar la URL
            const urlObj = new URL(realUrl);
            urlObj.searchParams.set('matt_tool', process.env.ML_MATT_TOOL);
            urlObj.searchParams.set('matt_word', process.env.ML_MATT_WORD);
            const linkAcortado = await acortarLink(urlObj.toString());

            const { data, error } = await supabase.from('ofertas').upsert({
                producto: titulo, 
                precio_original: parseFloat(precioOrig), 
                precio_oferta: parseFloat(precioOf),
                link_original: uniqueId, 
                link_afiliado: linkAcortado, 
                imagen_url: $('meta[property="og:image"]').attr('content'),
                status: 'Aprobado', 
                enviado: false, 
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' }).select();
            
            resultados.push({ status: error ? 'error' : 'success', prod: titulo });
            await sleep(3000); // Pausa de seguridad
            
        } catch (e) { 
            resultados.push({ status: 'error', prod: url }); 
        }
    }
    
    // Generar reporte final
    res.send(`
        ${UI_STYLE}
        <div class="container">
            <h2>📊 Reporte</h2>
            ${resultados.map(r => `<div class="card ${r.status}"><strong>${r.status == 'success' ? '✅' : '❌'}</strong> ${r.prod}</div>`).join('')}
            <a href="/" class="btn btn-back">VOLVER AL INICIO</a>
        </div>
        ${UI_FOOTER}
    `);
});

// --- ENDPOINTS AUTOMÁTICOS ---
app.get('/api/buscar', async (req, res) => { 
    res.send(`${UI_STYLE}<div class="container"><h2>Buscando Ofertas...</h2><a href="/" class="btn btn-back">VOLVER</a></div>${UI_FOOTER}`); 
    await runScraper(); 
});

app.get('/api/publicar', async (req, res) => { 
    res.send(`${UI_STYLE}<div class="container"><h2>Publicador Iniciado...</h2><a href="/" class="btn btn-back">VOLVER</a></div>${UI_FOOTER}`); 
    await enviarOfertasAprobadas(); 
});

app.listen(PORT, () => console.log(`🌐 Genesys Digital activo en puerto ${PORT}`));