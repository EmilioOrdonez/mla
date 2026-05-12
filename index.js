const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data : urlLarga;
    } catch (e) { return urlLarga; }
}

async function generarMarketingIA(titulo) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Eres un copywriter experto. Analiza este producto: "${titulo}". Genera:
        1. Una frase persuasiva y corta con 1 emoji.
        2. Tres hashtags relevantes en #CamelCase.
        Devuelve ÚNICAMENTE JSON: {"frase": "frase aquí", "hashtags": "#Tag1 #Tag2 #Tag3"}`;
        
        const result = await model.generateContent(prompt);
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        return { frase: "¡Adquiere el tuyo hoy antes de que cambie el precio! 🚀", hashtags: "#Oferta #Descuento #Shopping" };
    }
}

// Función auxiliar para mezclar un arreglo (Fisher-Yates Shuffle)
function mezclarArreglo(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function runScraper() {
    console.log("🚀 Iniciando búsqueda automática multipista...");
    
    // 🗂️ BATERÍA DE CATEGORÍAS (Puedes agregar o quitar enlaces de Mercado Libre aquí)
    const rutasDeBusqueda = [
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1)", // General P1
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=2](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=2)", // General P2
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=3](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=3)", // General P3
        "[https://www.mercadolibre.com.mx/ofertas/computacion](https://www.mercadolibre.com.mx/ofertas/computacion)",                     // Cómputo
        "[https://www.mercadolibre.com.mx/ofertas/celulares-y-telefonia](https://www.mercadolibre.com.mx/ofertas/celulares-y-telefonia)",           // Celulares
        "[https://www.mercadolibre.com.mx/ofertas/herramientas](https://www.mercadolibre.com.mx/ofertas/herramientas)",                    // Herramientas
        "[https://www.mercadolibre.com.mx/ofertas/electronica-audio-y-video](https://www.mercadolibre.com.mx/ofertas/electronica-audio-y-video)",       // Electrónica
        "[https://www.mercadolibre.com.mx/ofertas/hogar-muebles-y-jardin](https://www.mercadolibre.com.mx/ofertas/hogar-muebles-y-jardin)"           // Hogar
    ];

    // 🎲 Seleccionamos una ruta al azar en cada ejecución para simular a un humano
    const searchUrl = rutasDeBusqueda[Math.floor(Math.random() * rutasDeBusqueda.length)];
    console.log(`🎯 Explorando categoría: ${searchUrl}`);
    
    try {
        const resp = await axios.get(searchUrl, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'es-MX,es;q=0.9'
            } 
        });
        const $ = cheerio.load(resp.data);
        let links = [];

        $('.promotion-item__link-container, .poly-component__title, a.ui-search-link, a[href*="/MLM"]').each((i, el) => {
            const link = $(el).attr('href');
            if(link && !links.includes(link) && link.startsWith('http')) links.push(link);
        });

        console.log(`📦 Encontrados ${links.length} enlaces en esta página.`);

        if (links.length === 0) return console.log("⚠️ No se encontraron productos. ML pudo haber bloqueado la vista.");

        // 🎲 Mezclamos los links para no agarrar siempre los primeros 5 de la lista
        links = mezclarArreglo(links);

        let guardadosNuevos = 0;

        for(const url of links.slice(0, 5)) {
            try {
                const pResp = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
                let realUrl = pResp.request.res.responseUrl;
                
                const linkOriginalLimpio = realUrl.split('?')[0];
                const $$ = cheerio.load(pResp.data);
                let titulo = $$('meta[property="og:title"]').attr('content');
                let precio = $$('.andes-money-amount__fraction').first().text().replace(/,/g, '');

                if (!titulo || !precio) continue;

                // 🛑 Verificación Rápida: Consultamos si ya existe ANTES de gastar API de IA y TinyURL
                const { data: existe } = await supabase.from('ofertas').select('id').eq('link_original', linkOriginalLimpio).single();
                
                if (existe) {
                    console.log(`⏩ Saltando (Ya en DB): ${titulo}`);
                    continue; // Pasamos al siguiente producto del ciclo
                }

                console.log(`✨ Procesando Nuevo: ${titulo}`);

                const linkLargo = `${linkOriginalLimpio}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;
                
                const [linkCorto, marketingData] = await Promise.all([
                    acortarLink(linkLargo),
                    generarMarketingIA(titulo)
                ]);

                await supabase.from('ofertas').upsert({
                    producto: titulo, 
                    precio_oferta: parseFloat(precio),
                    precio_original: parseFloat(precio), 
                    link_original: linkOriginalLimpio, 
                    link_afiliado: linkLargo, 
                    link_corto: linkCorto,
                    hashtags: marketingData.hashtags,
                    frase_persuasiva: marketingData.frase,
                    imagen_url: $$('meta[property="og:image"]').attr('content'),
                    status: 'Aprobado', 
                    enviado: false, 
                    fuente: 'Auto',
                    fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
                }, { onConflict: 'link_original' });

                console.log(`✅ Guardado Exitoso: ${titulo}`);
                guardadosNuevos++;
                await new Promise(r => setTimeout(r, 4500));

            } catch (e) { console.error("Error procesando link individual"); }
        }
        
        console.log(`🏁 Fin de la exploración. ${guardadosNuevos} productos nuevos listos para publicar.`);

    } catch (e) { console.error("❌ Error en scraper:", e.message); }
}

module.exports = { runScraper };