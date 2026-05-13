const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const headersHumanos = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9',
    'Upgrade-Insecure-Requests': '1'
};

async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data.trim() : urlLarga;
    } catch (e) { return urlLarga; }
}

// 🧠 IA NIVEL DIOS: Procesa arreglos (arrays) enteros en una sola llamada
async function generarMarketingIABatch(titulos) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Eres un copywriter experto. Analiza la siguiente lista de productos numerados.
        Genera para CADA UNO:
        1. Una frase persuasiva, creativa y corta con 1 emoji. Varía el estilo entre ellos.
        2. Tres hashtags GENÉRICOS de macro-categoría (Ej: #Tecnologia, #Hogar). PROHIBIDO usar modelos específicos.
        
        Devuelve ÚNICAMENTE un JSON con un arreglo (array) respetando el orden exacto. Formato:
        [
          {"frase": "frase prod 1", "hashtags": "#Tag1 #Tag2 #Tag3"},
          {"frase": "frase prod 2", "hashtags": "#Tag1 #Tag2 #Tag3"}
        ]
        
        Productos a analizar:
        ${titulos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
        
        const result = await model.generateContent(prompt);
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString); 
    } catch (e) {
        console.error("⚠️ Error en Gemini API Batch:", e.message);
        // Si falla, devuelve un arreglo de respaldos genéricos para no detener el sistema
        return titulos.map(() => ({ frase: "¡Descubre esta gran oferta hoy! ⚡", hashtags: "#Oferta #Compras #MercadoLibre" }));
    }
}

async function esProductoPermitido(titulo) {
    try {
        const { data: exclusiones } = await supabase.from('exclusiones_facebook').select('termino').eq('activo', true);
        if (!exclusiones) return true;
        const tituloMinus = titulo.toLowerCase();
        const prohibida = exclusiones.find(e => tituloMinus.includes(e.termino.toLowerCase()));
        if (prohibida) {
            console.log(`🚫 Bloqueado por exclusión de FB: "${prohibida.termino}" -> ${titulo}`);
            return false;
        }
        return true;
    } catch (e) { return true; }
}

function mezclarArreglo(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function runScraper() {
    console.log("🚀 [PASO 1] Iniciando búsqueda dinámica en Supabase...");
    
    try {
        const { data: categorias, error: errCat } = await supabase.from('categorias_busqueda').select('*');
        if (errCat) return console.error("❌ Error de lectura en Supabase:", errCat.message);

        const activas = categorias.filter(c => c.activa === true || c.activa === 'true');
        if (activas.length === 0) return console.log("⚠️ No hay categorías activas en Supabase.");

        const randomCat = activas[Math.floor(Math.random() * activas.length)];
        const searchUrl = new URL(randomCat.url_mercadolibre.trim()).href;
        
        console.log(`🎯 [PASO 2] Explorando categoría: ${searchUrl}`);
        
        const resp = await axios.get(searchUrl, { maxRedirects: 3, headers: headersHumanos, timeout: 15000 });
        const $ = cheerio.load(resp.data);
        let productosExtraidos = [];

        $('.poly-card, .promotion-item, .ui-search-layout__item').each((i, el) => {
            let card = $(el);
            let linkRaw = card.find('a').attr('href') || card.attr('href');
            if (!linkRaw || !linkRaw.startsWith('http') || linkRaw.includes('click1.mercadolibre')) return;
            
            let titulo = card.find('.poly-component__title, .promotion-item__title, .ui-search-item__title, h2').first().text().trim();
            let precioOferta = card.find('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            let precioOriginal = card.find('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || precioOferta;
            let imagen = card.find('img').attr('data-src') || card.find('img').attr('src') || '';

            if (titulo && precioOferta) {
                productosExtraidos.push({ titulo, precioOferta, precioOriginal, linkOriginalLimpio: linkRaw.split('?')[0], imagen });
            }
        });

        productosExtraidos = mezclarArreglo(productosExtraidos);
        
        console.log(`📦 [PASO 3] Filtrando candidatos ideales...`);
        let productosAProcesar = [];

        // 🛡️ PRE-FILTRO: Seleccionamos solo 5 productos que NO existan y NO estén bloqueados
        for(const prod of productosExtraidos) {
            if (productosAProcesar.length >= 5) break; 
            
            if (!(await esProductoPermitido(prod.titulo))) continue;
            
            const { data: existe } = await supabase.from('ofertas').select('id').eq('link_original', prod.linkOriginalLimpio).single();
            if (existe) continue;

            productosAProcesar.push(prod);
        }

        if (productosAProcesar.length === 0) return console.log("⏩ No hay productos nuevos válidos en esta ronda.");

        console.log(`🧠 [PASO 4] Llamando a la IA en Lote (1 petición para ${productosAProcesar.length} productos)...`);
        
        // ⚡ EL DISPARO ÚNICO
        const titulosArray = productosAProcesar.map(p => p.titulo);
        const resultadosIA = await generarMarketingIABatch(titulosArray);

        let guardadosNuevos = 0;

        for (let i = 0; i < productosAProcesar.length; i++) {
            const prod = productosAProcesar[i];
            const marketingData = resultadosIA[i] || { frase: "¡Oferta especial! ⚡", hashtags: "#Ofertas #MercadoLibre" };

            try {
                const linkLargo = `${prod.linkOriginalLimpio}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
                const linkCorto = await acortarLink(linkLargo);

                await supabase.from('ofertas').upsert({
                    producto: prod.titulo, 
                    precio_oferta: parseFloat(prod.precioOferta),
                    precio_original: parseFloat(prod.precioOriginal), 
                    link_original: prod.linkOriginalLimpio, 
                    link_afiliado: linkLargo, 
                    link_corto: linkCorto,
                    hashtags: marketingData.hashtags,
                    frase_persuasiva: marketingData.frase,
                    imagen_url: prod.imagen,
                    status: 'Aprobado', 
                    enviado: false, 
                    fuente: 'Auto',
                    fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
                }, { onConflict: 'link_original' });

                guardadosNuevos++;
                await new Promise(r => setTimeout(r, 1500)); // Pausa breve para no saturar is.gd
            } catch (e) { console.error(`❌ Error guardando: ${prod.titulo}`); }
        }
        
        console.log(`🏁 Fin. ${guardadosNuevos} productos procesados en tiempo récord.`);
    } catch (e) { console.error("❌ Error crítico en scraper dinámico."); }
}

module.exports = { runScraper };