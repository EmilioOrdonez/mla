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

// ✅ Habilitar archivos estáticos (para style.css)
app.use(express.static('public'));

// 🔒 Candado de Seguridad
let candado;
if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    candado = basicAuth({
        users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
        challenge: true,
        realm: 'GenesysAdmin'
    });
} else {
    candado = (req, res, next) => next(); 
}

// 🖥️ Layout con Bootstrap y CSS Externo
const UI_LAYOUT = (content) => `
<!DOCTYPE html>
<html lang="es" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Genesys Admin</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
</head>
<body class="d-flex align-items-center justify-content-center py-4">
    <div class="container">
        <div class="row justify-content-center">
            <div class="col-12 col-md-10 col-lg-8">
                <div class="genesys-card p-4 p-md-5">
                    ${content}
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

app.get('/', candado, async (req, res) => {
    try {
        const { count: total } = await supabase.from('ofertas').select('*', { count: 'exact', head: true });
        const { count: enviadas } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', true);
        const { count: pend } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);
        
        const content = `
            <h1 class="text-center mb-4 fw-bold">GENESYS <span class="text-genesys">DIGITAL</span></h1>
            
            <div class="row g-3 mb-4">
                <div class="col-4">
                    <div class="stat-box p-3 text-center">
                        <div class="h3 mb-0">${total || 0}</div>
                        <div class="small text-secondary">TOTAL</div>
                    </div>
                </div>
                <div class="col-4">
                    <div class="stat-box p-3 text-center">
                        <div class="h3 mb-0 text-genesys">${enviadas || 0}</div>
                        <div class="small text-secondary">PUBLICADOS</div>
                    </div>
                </div>
                <div class="col-4">
                    <div class="stat-box p-3 text-center">
                        <div class="h3 mb-0 text-warning">${pend || 0}</div>
                        <div class="small text-secondary">EN COLA</div>
                    </div>
                </div>
            </div>

            <form action="/api/manual" method="POST" class="mb-4">
                <textarea name="urls" class="form-control mb-3" rows="4" placeholder="Pega los links meli.la aquí..." required></textarea>
                <button type="submit" class="btn btn-genesys w-100 py-3">🚀 PROCESAR Y ACORTAR</button>
            </form>

            <div class="row g-2">
                <div class="col-6">
                    <a href="/api/buscar" class="btn btn-outline-secondary w-100 py-2 text-success border-secondary-subtle">🔍 AUTO SEARCH</a>
                </div>
                <div class="col-6">
                    <a href="/api/publicar" class="btn btn-outline-secondary w-100 py-2 text-info border-secondary-subtle">📤 PUBLICAR YA</a>
                </div>
            </div>

            <div class="text-center mt-4">
                <a href="/logout" class="text-danger text-decoration-none small">🚪 SALIR DEL PANEL</a>
            </div>
        `;
        res.send(UI_LAYOUT(content));
    } catch (e) { res.status(500).send("Error de DB"); }
});

// Los procesos manuales, buscar y publicar ahora usan UI_LAYOUT para ser consistentes
app.post('/api/manual', candado, async (req, res) => {
    const urls = req.body.urls.split(/\r?\n/).filter(u => u.trim().length > 0);
    let resultados = [];

    for (const url of urls) {
        try {
            const resp = await axios.get(url, { headers: {'User-Agent': 'Mozilla/5.0'} });
            const $ = cheerio.load(resp.data);
            let titulo = $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            if(titulo.includes(' - $')) titulo = titulo.split(' - $')[0];
            
            let precioOferta = $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            let precioOriginal = $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOferta;
            let imagen = $('meta[property="og:image"]').attr('content') || '';
            
            if (!(await esProductoPermitido(titulo))) {
                resultados.push({ status: 'error', msg: `Bloqueado: ${titulo}` });
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

            await supabase.from('ofertas').upsert({
                producto: titulo, precio_oferta: parseFloat(precioOferta), precio_original: parseFloat(precioOriginal),
                link_original: url.split('?')[0], link_afiliado: linkAff, link_corto: linkShort,
                frase_persuasiva: mkt.frase, hashtags: mkt.hashtags, imagen_url: imagen, 
                status: 'Aprobado', fuente: 'Manual'
            }, { onConflict: 'link_original' });

            resultados.push({ status: 'success', msg: titulo });
        } catch (e) { resultados.push({ status: 'error', msg: `Fallo: ${url}` }); }
    }
    
    const content = `
        <h2 class="h4 mb-4">📊 Reporte Manual</h2>
        ${resultados.map(r => `<div class="report-item p-3 mb-2 rounded shadow-sm ${r.status}">${r.status === 'success' ? '✅' : '❌'} ${r.msg}</div>`).join('')}
        <a href="/" class="btn btn-outline-secondary w-100 mt-3 border-secondary-subtle">⬅ VOLVER AL PANEL</a>
    `;
    res.send(UI_LAYOUT(content));
});

// Endpoints de automatización (libres para cron-job)
app.get('/api/buscar', (req, res) => { 
    runScraper(); 
    const content = `
        <div class="text-center py-4">
            <h2 class="text-success mb-3">🔍 Auto Search Iniciado</h2>
            <p class="text-secondary">Buscando nuevas ofertas en Supabase...</p>
            <a href="/" class="btn btn-genesys px-5 mt-3">⬅ VOLVER AL PANEL</a>
        </div>
    `;
    res.send(UI_LAYOUT(content));
});

app.get('/api/publicar', (req, res) => { 
    enviarOfertasAprobadas(); 
    const content = `
        <div class="text-center py-4">
            <h2 class="text-info mb-3">📤 Publicación Iniciada</h2>
            <p class="text-secondary">Enviando productos a Telegram y Facebook...</p>
            <a href="/" class="btn btn-genesys px-5 mt-3">⬅ VOLVER AL PANEL</a>
        </div>
    `;
    res.send(UI_LAYOUT(content));
});

app.get('/logout', candado, (req, res) => {
    res.status(401).send(UI_LAYOUT(`<div class="text-center py-4"><h2>👋 Sesión Cerrada</h2><br><a href="/" class="btn btn-genesys px-5">VOLVER A ENTRAR</a></div>`));
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Genesys Modular Online"));