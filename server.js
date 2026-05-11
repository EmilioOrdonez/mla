const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
const PORT = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✂️ ACORTADOR DE LINK
async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data : urlLarga;
    } catch (e) {
        return urlLarga;
    }
}

// 🧠 CEREBRO DE MARKETING CON IA (VERSIÓN 2.5 FLASH)
async function generarMarketingIA(titulo) {
    try {
        // Actualizado al modelo vigente solicitado
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Eres un copywriter experto en comercio electrónico. Analiza este producto: "${titulo}".
        Genera:
        1. Una frase persuasiva y corta (máximo 12 palabras) que incite a comprar inmediatamente, resaltando el valor o la utilidad. Usa 1 emoji.
        2. Tres hashtags ultra relevantes en formato #CamelCase basados en la categoría real del producto.
        
        Devuelve ÚNICAMENTE un objeto JSON válido con este formato:
        {"frase": "frase persuasiva aquí", "hashtags": "#Tag1 #Tag2 #Tag3"}`;
        
        const result = await model.generateContent(prompt);
        // Limpiar el formato markdown si la IA lo agrega
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("⚠️ Error en IA:", e.message);
        return { frase: "¡No dejes escapar esta increíble oportunidad de mejorar tu día! ⏳", hashtags: "#Oferta #Descuento #CompraInteligente" };
    }
}

// --- ESTILOS DEL DASHBOARD ---
const UI_STYLE = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Genesys Digital - Admin</title><style>:root { --primary: #00d2ff; --secondary: #3a7bd5; --dark: #1a1a2e; --success: #00f2fe; --error: #ff4b2b; --warning: #f6ad55; } body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--dark); color: white; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 15px; box-sizing: border-box; } .container { width: 100%; max-width: 600px; background: #16213e; padding: 25px; border-radius: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.6); border: 1px solid #0f3460; text-align: center; } h1 { color: var(--primary); margin: 0; font-weight: 700; font-size: 1.6rem; } .dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 25px 0; } .stat-box { background: #0f3460; padding: 15px 5px; border-radius: 15px; border: 1px solid #1a1a2e; } .stat-num { font-size: 1.5rem; font-weight: bold; } .stat-label { font-size: 0.6rem; text-transform: uppercase; color: #888; margin-top: 5px; } textarea { width: 100%; background: #0f3460; border: 1px solid #1a1a2e; border-radius: 15px; color: #fff; padding: 15px; box-sizing: border-box; resize: none; margin-bottom: 15px; font-size: 0.9rem; } .btn { display: inline-flex; align-items: center; justify-content: center; padding: 15px 25px; border-radius: 50px; text-decoration: none; font-weight: bold; transition: 0.3s; cursor: pointer; border: none; font-size: 0.9rem; width: 100%; box-sizing: border-box; } .btn-primary { background: linear-gradient(45deg, var(--primary), var(--secondary)); color: #fff; margin-top: 5px; } .btn-back { background: #0f3460; color: #aaa; margin-top: 15px; border: 1px solid #1a1a2e; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; } .card { background: #1a1a2e; padding: 15px; border-radius: 15px; text-align: left; border-left: 4px solid var(--primary); margin-bottom: 10px; font-size: 0.85rem; } .spinner { display: none; width: 18px; height: 18px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s infinite; margin-right: 10px; } @keyframes spin { to { transform: rotate(360deg); } } </style><script>function showLoading(){const btn=document.getElementById('btn-procesar');const txt=document.getElementById('urls-input');if(txt.value.trim()==='')return;btn.disabled=true;document.getElementById('spinner').style.display='block';document.getElementById('btn-text').innerText='Analizando con IA...';document.getElementById('form-manual').submit();}</script></head><body>`;
const UI_FOOTER = `</body></html>`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/', async (req, res) => {
    try {
        const { count: total } = await supabase.from('ofertas').select('*', { count: 'exact', head: true });
        const { count: enviadas } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', true);
        const { count: pendientes } = await supabase.from('ofertas').select('*', { count: 'exact', head: true }).eq('enviado', false);
        res.send(`${UI_STYLE}<div class="container"><h1>GENESYS <span style="color:#fff">DIGITAL</span></h1><div class="dashboard"><div class="stat-box"><div class="stat-num">${total||0}</div><div class="stat-label">Total</div></div><div class="stat-box" style="color:var(--success)"><div class="stat-num">${enviadas||0}</div><div class="stat-label">Publicados</div></div><div class="stat-box" style="color:var(--warning)"><div class="stat-num">${pendientes||0}</div><div class="stat-label">En Cola</div></div></div><form id="form-manual" action="/api/manual" method="POST"><textarea id="urls-input" name="urls" rows="5" placeholder="Pega los links meli.la aquí..." required></textarea><button type="button" id="btn-procesar" class="btn btn-primary" onclick="showLoading()"><span id="spinner" class="spinner"></span><span id="btn-text">🚀 PROCESAR Y ACORTAR</span></button></form><div class="grid"><a href="/api/buscar" class="btn btn-back" style="color: #28a745;">🔍 AUTO SEARCH</a><a href="/api/publicar" class="btn btn-back" style="color: #6f42c1;">📤 PUBLICAR YA</a></div></div>${UI_FOOTER}`);
    } catch (e) { res.status(500).send("Error de DB"); }
});

app.post('/api/manual', async (req, res) => {
    const urls = req.body.urls.split(/\r?\n/).map(u => u.trim()).filter(u => u.length > 0);
    let resultados = [];
    for (const url of urls) {
        try {
            const resp = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
            let realUrl = resp.request.res.responseUrl;
            const mlidMatch = realUrl.match(/MLM-?(\d+)/i);
            const uniqueId = mlidMatch ? mlidMatch[0].toUpperCase() : `MANUAL-${Date.now()}`;
            
            const $ = cheerio.load(resp.data);
            let titulo = $('meta[property="og:title"]').attr('content') || $('h1').text().trim();
            if(titulo.includes(' - $')) titulo = titulo.split(' - $')[0];
            let precioOf = $('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            let precioOrig = $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOf;
            
            const urlObj = new URL(realUrl);
            urlObj.searchParams.set('matt_tool', process.env.ML_MATT_TOOL);
            urlObj.searchParams.set('matt_word', process.env.ML_MATT_WORD);
            const linkLargo = urlObj.toString();
            
            // Procesamiento Paralelo: Acortamos y llamamos a la IA al mismo tiempo
            const [linkCorto, marketingData] = await Promise.all([
                acortarLink(linkLargo),
                generarMarketingIA(titulo)
            ]);

            const { data, error } = await supabase.from('ofertas').upsert({
                producto: titulo, 
                precio_original: parseFloat(precioOrig), 
                precio_oferta: parseFloat(precioOf),
                link_original: uniqueId, 
                link_afiliado: linkLargo, 
                link_corto: linkCorto,
                hashtags: marketingData.hashtags,           // 👈 IA Data
                frase_persuasiva: marketingData.frase,      // 👈 IA Data
                imagen_url: $('meta[property="og:image"]').attr('content'),
                status: 'Aprobado', 
                enviado: false, 
                fuente: 'Manual',
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' }).select();
            
            resultados.push({ status: error ? 'error' : 'success', prod: titulo });
            await sleep(3500);
        } catch (e) { resultados.push({ status: 'error', prod: url }); }
    }
    res.send(`${UI_STYLE}<div class="container"><h2>📊 Reporte</h2>${resultados.map(r=>`<div class="card ${r.status}"><strong>${r.status=='success'?'✅':'❌'}</strong> ${r.prod}</div>`).join('')}<a href="/" class="btn btn-back">VOLVER AL PANEL</a></div>${UI_FOOTER}`);
});

app.get('/api/buscar', async (req, res) => { res.send("Buscando..."); await runScraper(); });
app.get('/api/publicar', async (req, res) => { res.send("Publicando..."); await enviarOfertasAprobadas(); });
app.listen(PORT, () => console.log(`🌐 Genesys Digital activo en puerto ${PORT}`));