// server.js
const express = require('express');
const cheerio = require('cheerio');
const axios = require('axios');
const basicAuth = require('express-basic-auth');
require('dotenv').config();

const { supabase, acortarLink, generarMarketingIA, esProductoPermitido } = require('./servicios');
const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔒 Login de Seguridad Avanzada
if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    app.use(basicAuth({
        users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
        challenge: true,
        realm: 'GenesysAdmin'
    }));
}

// 🎨 UI Frontend (Minimalista, Oscuro y Moderno)
const UI_HEAD = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Genesys Digital - Admin</title><style>
    body { background-color: #1a1e29; color: #fff; font-family: 'Segoe UI', system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background-color: #151b23; border: 1px solid #2d3748; border-radius: 16px; padding: 30px; width: 100%; max-width: 650px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { text-align: center; color: #00d2ff; font-weight: 800; margin-top: 0; margin-bottom: 30px; font-size: 24px; letter-spacing: 1px; }
    h1 span { color: #fff; }
    .stats { display: flex; justify-content: space-between; gap: 15px; margin-bottom: 25px; }
    .stat-box { background-color: #1c2431; border: 1px solid #2d3748; border-radius: 12px; padding: 20px; text-align: center; flex: 1; }
    .stat-num { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
    .stat-label { font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 1px; }
    .num-total { color: #fff; } .num-pub { color: #00d2ff; } .num-cola { color: #f6ad55; }
    textarea { width: 100%; background-color: #1c2431; border: 1px solid #2d3748; border-radius: 12px; color: #a0aec0; padding: 20px; box-sizing: border-box; margin-bottom: 25px; resize: none; font-family: monospace; font-size: 14px; outline: none; }
    textarea:focus { border-color: #00d2ff; }
    .btn { display: block; width: 100%; padding: 16px; border-radius: 25px; border: none; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; transition: 0.3s; font-size: 14px; letter-spacing: 0.5px; box-sizing: border-box; }
    .btn-primary { background: linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%); color: #fff; margin-bottom: 20px; }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .grid-2 { display: flex; gap: 15px; }
    .btn-outline { background: #1c2431; border: 1px solid #2d3748; flex: 1; display: flex; justify-content: center; align-items: center; gap: 8px; color: #fff; }
    .btn-outline:hover { filter: brightness(1.2); }
    .btn-auto { color: #4ade80; } .btn-pub { color: #c084fc; }
    .btn-danger { background: #251414; color: #f87171; border: 1px solid #451a1a; margin-top: 15px; }
    .btn-danger:hover { background: #ef4444; color: #fff; }
    .report-item { background: #1c2431; padding: 12px; border-radius: 8px; margin-bottom: 10px; font-size: 13px; text-align: left; border-left: 4px solid #00d2ff;}
    .success { border-left-color: #4ade80; } .error { border-left-color: #f87171; }
    .status-page { text-align: center; }
</style></head><body>`;

app.get('/', async (req, res) => {
    try {
        const { count: total } = await supabase.from('ofertas').select('*', { count: 'exact', head: true });
        const { count: enviadas } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', true);
        const { count: pend } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);
        
        res.send(`${UI_HEAD}<div class="card"><h1>GENESYS <span>DIGITAL</span></h1>
        <div class="stats">
            <div class="stat-box"><div class="stat-num num-total">${total || 0}</div><div class="stat-label">TOTAL</div></div>
            <div class="stat-box"><div class="stat-num num-pub">${enviadas || 0}</div><div class="stat-label">PUBLICADOS</div></div>
            <div class="stat-box"><div class="stat-num num-cola">${pend || 0}</div><div class="stat-label">EN COLA</div></div>
        </div>
        <form action="/api/manual" method="POST"><textarea name="urls" rows="4" placeholder="Pega los links meli.la aquí..." required></textarea>
        <button type="submit" class="btn btn-primary">🚀 PROCESAR Y ACORTAR</button></form>
        <div class="grid-2">
            <a href="/api/buscar" class="btn btn-outline btn-auto">🔍 AUTO SEARCH</a>
            <a href="/api/publicar" class="btn btn-outline btn-pub">📤 PUBLICAR YA</a>
        </div>
        <a href="/logout" class="btn btn-danger">🚪 SALIR DEL PANEL</a>
        </div></body></html>`);
    } catch (e) { res.status(500).send("Error de DB"); }
});

// ⚡ Proceso Manual Reparado
app.post('/api/manual', async (req, res) => {
    const urls = req.body.urls.split(/\r?\n/).filter(u => u.trim().length > 0);
    let resultados = [];

    for (const url of urls) {
        try {
            const resp = await axios.get(url, { headers: {'User-Agent': 'Mozilla/5.0'} });
            const $ = cheerio.load(resp.data);
            
            // 🛠️ Restauración de selectores que se habían borrado
            let titulo = $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            if(titulo.includes(' - $')) titulo = titulo.split(' - $')[0];
            
            let precioOferta = $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            let precioOriginal = $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOferta;
            let imagen = $('meta[property="og:image"]').attr('content') || '';
            
            if (!(await esProductoPermitido(titulo))) {
                resultados.push({ status: 'error', msg: `Bloqueado por exclusión: ${titulo}` });
                continue;
            }

            const mkt = await generarMarketingIA(titulo);
            if (!mkt.seguro_para_fb) {
                resultados.push({ status: 'error', msg: `Veto IA: ${titulo}` });
                continue;
            }

            let linkAff, linkShort;
            if (url.includes('meli.la')) {
                linkAff = url; linkShort = url;
            } else {
                linkAff = `${url.split('?')[0]}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
                linkShort = await acortarLink(linkAff);
            }

            const { error } = await supabase.from('ofertas').upsert({
                producto: titulo, precio_oferta: parseFloat(precioOferta), precio_original: parseFloat(precioOriginal),
                link_original: url.split('?')[0], link_afiliado: linkAff, link_corto: linkShort,
                frase_persuasiva: mkt.frase, hashtags: mkt.hashtags,
                imagen_url: imagen, status: 'Aprobado', fuente: 'Manual',
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' });

            resultados.push({ status: error ? 'error' : 'success', msg: titulo });
        } catch (e) { resultados.push({ status: 'error', msg: `Fallo al procesar: ${url}` }); }
    }
    
    // 🔙 Botón de regreso para el reporte manual
    res.send(`${UI_HEAD}<div class="card status-page"><h2>📊 Reporte Manual</h2>
    ${resultados.map(r=>`<div class="report-item ${r.status}"><strong>${r.status=='success'?'✅':'❌'}</strong> ${r.msg}</div>`).join('')}
    <br><a href="/" class="btn btn-outline">⬅ VOLVER AL PANEL</a></div></body></html>`);
});

// 🔙 Pantallas con botones de regreso para los procesos automáticos
app.get('/api/buscar', (req, res) => { 
    runScraper(); // Se ejecuta en segundo plano
    res.send(`${UI_HEAD}<div class="card status-page"><h2>🔍 Auto Search Iniciado</h2><p style="color:#a0aec0">El bot está buscando ofertas en segundo plano.<br>Revisa tu consola de Render para ver el progreso en vivo.</p><br><a href="/" class="btn btn-primary">⬅ VOLVER AL PANEL</a></div></body></html>`); 
});

app.get('/api/publicar', (req, res) => { 
    enviarOfertasAprobadas(); // Se ejecuta en segundo plano
    res.send(`${UI_HEAD}<div class="card status-page"><h2>📤 Publicación Iniciada</h2><p style="color:#a0aec0">El bot está publicando los pendientes en Telegram y FB.<br>Esto tomará unos segundos por cada producto.</p><br><a href="/" class="btn btn-primary">⬅ VOLVER AL PANEL</a></div></body></html>`); 
});

// 🚪 Endpoint de Salida (Fuerza Error 401 para limpiar credenciales)
app.get('/logout', (req, res) => {
    res.status(401).send(`${UI_HEAD}<div class="card status-page"><h2>👋 Sesión Cerrada</h2><p style="color:#a0aec0">Has salido del panel de Genesys Digital.</p><br><a href="/" class="btn btn-primary">VOLVER A ENTRAR</a></div></body></html>`);
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Genesys Modular Online"));