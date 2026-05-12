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
    'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
    'Upgrade-Insecure-Requests': '1'
};

async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data : urlLarga;
    } catch (e) { return urlLarga; }
}

async function generarMarketingIA(titulo) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        // 🧠 PROMPT MEJORADO: Orientado a Macro-Categorías SEO
        const prompt = `Eres un copywriter experto. Analiza este producto: "${titulo}". Genera:
        1. Una frase persuasiva y corta con 1 emoji.
        2. Tres hashtags GENÉRICOS de macro-categoría (Ejemplo: #Tecnologia, #Celulares, #Hogar, #Herramientas, #Moda). PROHIBIDO usar nombres de modelos específicos o características técnicas en los hashtags.
        Devuelve ÚNICAMENTE JSON: {"frase": "frase aquí", "hashtags": "#Tag1 #Tag2 #Tag3"}`;
        
        const result = await model.generateContent(prompt);
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        return { frase: "¡Aprovecha esta increíble oportunidad hoy! 🚀", hashtags: "#Ofertas #Compras #MercadoLibre" };
    }
}

function mezclarArreglo(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function runScraper() {
    console.log("🚀 Iniciando búsqueda automática...");
    
    const rutasDeBusqueda = [
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=2](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=2)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=3](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=3)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=4](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=4)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=5](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=5)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=6](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=6)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=7](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=7)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=8](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=8)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=9](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=9)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=10](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=10)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=11](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=11)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=12](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=12)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=13](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=13)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=14](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=14)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=15](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=15)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=16](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=16)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=17](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=17)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=18](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=18)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=19](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=19)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=20](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=20)",
        "[https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=21](https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=21)"
    ];

    let searchUrlRaw = rutasDeBusqueda[Math.floor(Math.random() * rutasDeBusqueda.length)];
    if (searchUrlRaw.startsWith('[')) searchUrlRaw = searchUrlRaw.match(/\(([^)]+)\)/)[1];
    const searchUrl = new URL(searchUrlRaw.trim()).href;
    
    try {
        const resp = await axios.get(searchUrl, { maxRedirects: 3, headers: headersHumanos });
        const $ = cheerio.load(resp.data);
        let productosExtraidos = [];

        $('.poly-card, .promotion-item, .ui-search-layout__item').each((i, el) => {
            let card = $(el);
            let linkRaw = card.find('a').attr('href') || card.attr('href');
            if (!linkRaw || !linkRaw.startsWith('http') || linkRaw.includes('click1.mercadolibre')) return;
            let linkOriginalLimpio = linkRaw.split('?')[0];

            let titulo = card.find('.poly-component__title, .promotion-item__title, .ui-search-item__title, h2').first().text().trim();
            
            // 🛠️ LÓGICA DE PRECIOS MEJORADA (Separa Precio Original de Oferta)
            // Busca la clase específica del precio tachado anterior
            let precioOriginal = card.find('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            // Busca el precio actual excluyendo la clase del tachado
            let precioOferta = card.find('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');

            // Si no hay precio tachado, significa que no hay descuento, ambos precios son iguales
            if (!precioOriginal) precioOriginal = precioOferta;

            let imagen = card.find('img').attr('data-src') || card.find('img').attr('src') || '';

            if (titulo && precioOferta && !productosExtraidos.find(p => p.linkOriginalLimpio === linkOriginalLimpio)) {
                productosExtraidos.push({ titulo, precioOferta, precioOriginal, linkOriginalLimpio, imagen });
            }
        });

        if (productosExtraidos.length === 0) return console.log("⚠️ La página no devolvió tarjetas válidas.");

        productosExtraidos = mezclarArreglo(productosExtraidos);

        for(const prod of productosExtraidos.slice(0, 5)) {
            try {
                const { data: existe } = await supabase.from('ofertas').select('id').eq('link_original', prod.linkOriginalLimpio).single();
                if (existe) continue; 

                const linkLargo = `${prod.linkOriginalLimpio}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;
                const [linkCorto, marketingData] = await Promise.all([
                    acortarLink(linkLargo),
                    generarMarketingIA(prod.titulo)
                ]);

                await supabase.from('ofertas').upsert({
                    producto: prod.titulo, 
                    precio_oferta: parseFloat(prod.precioOferta),
                    precio_original: parseFloat(prod.precioOriginal), // 👈 Ahora se guardan separados
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

                await new Promise(r => setTimeout(r, 2000));
            } catch (innerError) { console.error(`❌ Falló guardado.`); }
        }
    } catch (e) { console.error("❌ Error en scraper principal:", e.message); }
}

module.exports = { runScraper };