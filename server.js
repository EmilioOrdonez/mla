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

// 🖥️ Layout Base con Bootstrap e inyección de Scripts
const UI_LAYOUT = (content, script = "") => `
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
    ${script}
</body>
</html>`;

// ⏱️ Script de redirección automática (3 segundos)
const SCRIPT_REDIRECCION = `
<script>
    let segundos = 3;
    const contador = document.getElementById('contador');
    const intervalo = setInterval(() => {
        segundos--;
        if(contador) contador.innerText = segundos;
        if(segundos <= 0) {
            clearInterval(intervalo);
            window.location.href = '/';
        }
    }, 1000);
</script>`;

// 🏠 PANEL PRINCIPAL (Dashboard + Administrador de Exclusiones)
app.get('/', candado, async (req, res) => {
    try {
        // 1. Datos del Dashboard
        const { count: total } = await supabase.from('ofertas').select('*', { count: 'exact', head: true });
        const { count: enviadas } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', true);
        const { count: pend } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);
        
        // 2. Traer Exclusiones desde Supabase
        const { data: exclusiones } = await supabase.from('exclusiones_facebook').select('*').eq('activo', true).order('created_at', { ascending: false });

        const content = `
            <h1 class="text-center mb-4 fw-bold">GENESYS <span class="text-genesys">DIGITAL</span></h1>
            
            <!-- Dashboard KPIs -->
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

            <!-- Procesamiento Manual -->
            <form action="/api/manual" method="POST" class="mb-4">
                <textarea name="urls" class="form-control mb-3" rows="3" placeholder="Pega los links meli.la aquí..." required></textarea>
                <button type="submit" class="btn btn-genesys w-100 py-2">🚀 PROCESAR Y ACORTAR</button>
            </form>

            <!-- Acciones de Automatización -->
            <div class="row g-2 mb-4">
                <div class="col-6">
                    <a href="/api/buscar" class="btn btn-outline-secondary w-100 py-2 text-success border-secondary-subtle">🔍 AUTO SEARCH</a>
                </div>
                <div class="col-6">
                    <a href="/api/publicar" class="btn btn-outline-secondary w-100 py-2 text-info border-secondary-subtle">📤 PUBLICAR YA</a>
                </div>
            </div>

            <hr class="border-secondary my-4">

            <!-- 🛡️ SECCIÓN: ADMINISTRADOR DE EXCLUSIONES -->
            <h3 class="h5 mb-3 text-genesys fw-bold">🛡️ Lista Negra de Palabras (Facebook)</h3>
            
            <!-- Formulario para agregar exclusión -->
            <form action="/api/exclusiones/agregar" method="POST" class="row g-2 mb-3">
                <div class="col-8">
                    <input type="text" name="termino" class="form-control" placeholder="Ej: medicamento, alcohol, vape..." required>
                </div>
                <div class="col-4">
                    <button type="submit" class="btn btn-success w-100">➕ Añadir</button>
                </div>
            </form>

            <!-- Lista de términos actuales -->
            <div class="stat-box p-3 style-scroll" style="max-height: 200px; overflow-y: auto;">
                ${exclusiones && exclusiones.length > 0 ? `
                    <div class="d-flex flex-wrap gap-2">
                        ${exclusiones.map(e => `
                            <span class="badge bg-dark border border-secondary text-light p-2 d-flex align-items-center gap-2">
                                ${e.termino}
                                <a href="/api/exclusiones/eliminar/${e.id}" class="text-danger fw-bold text-decoration-none" title="Eliminar">✕</a>
                            </span>
                        `).join('')}
                    </div>
                ` : `<p class="text-secondary small mb-0 text-center">No hay términos excluidos activos.</p>`}
            </div>

            <div class="text-center mt-4">
                <a href="/logout" class="text-danger text-decoration-none small">🚪 SALIR DEL PANEL</a>
            </div>
        `;
        res.send(UI_LAYOUT(content));
    } catch (e) { res.status(500).send("Error de DB"); }
});

// 🛠️ RUTAS CRUD PARA EXCLUSIONES
app.post('/api/exclusiones/agregar', candado, async (req, res) => {
    const termino = req.body.termino.trim();
    if (termino) {
        try {
            await supabase.from('exclusiones_facebook').insert([{ termino: termino, activo: true }]);
        } catch (e) { console.error("Error al añadir exclusión:", e.message); }
    }
    res.redirect('/');
});

app.get('/api/exclusiones/eliminar/:id', candado, async (req, res) => {
    const { id } = req.params;
    try {
        // Hacemos un soft-delete cambiando activo a false o delete directo si lo prefieres
        await supabase.from('exclusiones_facebook').update({ activo: false }).eq('id', id);
    } catch (e) { console.error("Error al eliminar exclusión:", e.message); }
    res.redirect('/');
});

// ⚡ ENDPOINTS CON REDIRECCIÓN AUTOMÁTICA DE 3 SEGUNDOS
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

            let linkAff = url.includes('meli.la') ? url : `${url.split('?')[0]}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
            let linkShort = await acortarLink(linkAff);

            await supabase.from('ofertas').upsert({
                producto: titulo, precio_oferta: parseFloat(precioOferta), precio_original: parseFloat(precioOriginal),
                link_original: url.split('?')[0], link_afiliado: linkAff, link_corto: linkShort,
                frase_persuasiva: mkt.frase, hashtags: mkt.hashtags, imagen_url: imagen, 
                status: 'Aprobado', fuente: 'Manual',
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' });

            resultados.push({ status: 'success', msg: titulo });
        } catch (e) { resultados.push({ status: 'error', msg: `Fallo: ${url}` }); }
    }
    
    const content = `
        <h2 class="h4 mb-4">📊 Reporte Manual</h2>
        ${resultados.map(r => `<div class="report-item p-3 mb-2 rounded shadow-sm ${r.status}">${r.status === 'success' ? '✅' : '❌'} ${r.msg}</div>`).join('')}
        <p class="text-center text-secondary small mt-3">Regresando automáticamente en <span id="contador" class="text-genesys fw-bold">3</span> segundos...</p>
        <a href="/" class="btn btn-outline-secondary w-100 mt-1 border-secondary-subtle">⬅ VOLVER YA</a>
    `;
    res.send(UI_LAYOUT(content, SCRIPT_REDIRECCION));
});

// =========================================================================
// 🔍 ENDPOINT: AUTO SEARCH (Sincronizado con await para actualizar estadísticas)
// =========================================================================
// =========================================================================
// 🔍 ENDPOINT: AUTO SEARCH (Liberado de contraseña para Cron-Job)
// =========================================================================
// =========================================================================
// 🔍 ENDPOINT: AUTO SEARCH (Soporta UI síncrona y Cron-Job asíncrono)
// =========================================================================
app.get('/api/buscar', async (req, res) => {
    const esCron = req.query.fuente === 'cron';

    if (esCron) {
        console.log("⚡ [CRON-JOB] Ejecutando scraper en segundo plano de forma inmediata...");
        // Disparamos sin 'await' para responder rápido al Cron-Job y evitar el timeout de 30s
        runScraper().catch(err => console.error("❌ Error diferido en runScraper via Cron:", err.message));
        return res.status(200).send({ status: "success", message: "Scraper iniciado en segundo plano" });
    }

    // Si viene de la interfaz web (UI), sí esperamos con 'await' para refrescar estadísticas
    console.log("🖥️ [UI Web] Ejecutando scraper en modo síncrono para actualizar panel...");
    try {
        await runScraper();
    } catch (error) {
        console.error("❌ Error en ruta /api/buscar (UI):", error.message);
    }

    const content = `
        <div class="text-center py-4">
            <h2 class="text-success mb-3">🔍 Auto Search Finalizado</h2>
            <p class="text-secondary">El bot ha leído tus categorías de Supabase y actualizado la cola de ofertas con éxito.</p>
            <p class="text-secondary small">Regresando al panel en <span id="contador" class="text-genesys fw-bold">3</span> segundos...</p>
            <a href="/" class="btn btn-genesys px-5 mt-1">⬅ VOLVER YA</a>
        </div>
    `;
    res.send(UI_LAYOUT(content, SCRIPT_REDIRECCION));
});

// =========================================================================
// 📤 ENDPOINT: PUBLICAR YA (Sincronizado con await para actualizar estadísticas)
// =========================================================================
// =========================================================================
// 📤 ENDPOINT: PUBLICAR YA (Liberado de contraseña para Cron-Job)
// =========================================================================
// =========================================================================
// 📤 ENDPOINT: PUBLICAR YA (Soporta UI síncrona y Cron-Job asíncrono)
// =========================================================================
app.get('/api/publicar', async (req, res) => {
    const esCron = req.query.fuente === 'cron';

    if (esCron) {
        console.log("⚡ [CRON-JOB] Despachando publicaciones en segundo plano inmediatamente...");
        // Disparamos sin 'await' para liberar la conexión del Cron-Job en menos de 1 segundo
        enviarOfertasAprobadas().catch(err => console.error("❌ Error diferido en enviarOfertas via Cron:", err.message));
        return res.status(200).send({ status: "success", message: "Publicador iniciado en segundo plano" });
    }

    // Si el usuario presiona el botón físico en la web, esperamos a que despache para refrescar los contadores
    console.log("🖥️ [UI Web] Despachando publicaciones en modo síncrono...");
    try {
        await enviarOfertasAprobadas();
    } catch (error) {
        console.error("❌ Error en ruta /api/publicar (UI):", error.message);
    }
    
    const content = `
        <div class="text-center py-4">
            <h2 class="text-info mb-3">📤 Publicación Completada</h2>
            <p class="text-secondary">Todos los artículos aprobados han sido enviados a tus canales de Telegram y Facebook.</p>
            <p class="text-secondary small">Regresando al panel en <span id="contador" class="text-genesys fw-bold">3</span> segundos...</p>
            <a href="/" class="btn btn-genesys px-5 mt-1">⬅ VOLVER YA</a>
        </div>
    `;
    res.send(UI_LAYOUT(content, SCRIPT_REDIRECCION));
});

app.get('/logout', candado, (req, res) => {
    res.status(401).send(UI_LAYOUT(`<div class="text-center py-4"><h2>👋 Sesión Cerrada</h2><br><a href="/" class="btn btn-genesys px-5">VOLVER A ENTRAR</a></div>`));
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Genesys Panel V2.1 Online"));