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

// 🖥️ UI Estilo Genesys Digital
const UI_HEAD = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Genesys Admin</title><style>body{background:#1a1a2e;color:#fff;font-family:sans-serif;text-align:center;padding:20px} .card{background:#16213e;padding:20px;border-radius:15px;max-width:500px;margin:auto;border:1px solid #0f3460} textarea{width:100%;background:#0f3460;color:#fff;border:none;padding:10px;border-radius:10px} .btn{display:block;width:100%;padding:12px;margin:10px 0;border-radius:25px;border:none;font-weight:bold;cursor:pointer;text-decoration:none} .btn-primary{background:#00d2ff;color:#fff}</style></head><body>`;

app.get('/', async (req, res) => {
    const { count: pend } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);
    res.send(`${UI_HEAD}<div class="card"><h1>GENESYS <span style="color:#00d2ff">DIGITAL</span></h1><p>Pendientes: ${pend || 0}</p><form action="/api/manual" method="POST"><textarea name="urls" rows="4" placeholder="Links meli.la aquí..."></textarea><button class="btn btn-primary">PROCESAR MANUAL</button></form><a href="/api/buscar" class="btn" style="background:#28a745;color:#fff">AUTO SEARCH</a><a href="/api/publicar" class="btn" style="background:#6f42c1;color:#fff">PUBLICAR YA</a></div></body></html>`);
});

// ⚡ Proceso Manual Inteligente
app.post('/api/manual', async (req, res) => {
    const urls = req.body.urls.split(/\r?\n/).filter(u => u.trim().length > 0);
    for (const url of urls) {
        try {
            const resp = await axios.get(url, { headers: {'User-Agent': 'Mozilla/5.0'} });
            const $ = cheerio.load(resp.data);
            const titulo = $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            
            if (!(await esProductoPermitido(titulo))) continue;

            const mkt = await generarMarketingIA(titulo);
            if (!mkt.seguro_para_fb) continue;

            let linkAff, linkShort;
            if (url.includes('meli.la')) {
                linkAff = url; linkShort = url;
            } else {
                linkAff = `${url.split('?')[0]}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
                linkShort = await acortarLink(linkAff);
            }

            await supabase.from('ofertas').upsert({
                producto: titulo, link_original: url.split('?')[0],
                link_afiliado: linkAff, link_corto: linkShort,
                frase_persuasiva: mkt.frase, hashtags: mkt.hashtags,
                status: 'Aprobado', fuente: 'Manual'
            });
        } catch (e) { console.error("Error manual"); }
    }
    res.redirect('/');
});

app.get('/api/buscar', async (req, res) => { res.send("Buscando..."); runScraper(); });
app.get('/api/publicar', async (req, res) => { res.send("Publicando..."); enviarOfertasAprobadas(); });

app.listen(process.env.PORT || 3000, () => console.log("🚀 Genesys Modular Online"));