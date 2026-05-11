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

async function runScraper() {
    console.log("🚀 Iniciando búsqueda automática...");
    const searchUrl = "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1";
    
    try {
        const resp = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(resp.data);
        const links = [];

        $('.promotion-item__link-container, .poly-component__title, a.ui-search-link, a[href*="/MLM"]').each((i, el) => {
            const link = $(el).attr('href');
            if(link && !links.includes(link) && link.startsWith('http')) links.push(link);
        });

        for(const url of links.slice(0, 5)) {
            try {
                const pResp = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
                let realUrl = pResp.request.res.responseUrl;
                
                // 🛠️ LÓGICA CORREGIDA: link_original ahora guarda la URL limpia (sin ?)
                const linkOriginalLimpio = realUrl.split('?')[0];

                const $$ = cheerio.load(pResp.data);
                let titulo = $$('meta[property="og:title"]').attr('content');
                let precio = $$('.andes-money-amount__fraction').first().text().replace(/,/g, '');

                if (!titulo || !precio) continue;

                const linkLargo = `${linkOriginalLimpio}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;
                
                const [linkCorto, marketingData] = await Promise.all([
                    acortarLink(linkLargo),
                    generarMarketingIA(titulo)
                ]);

                await supabase.from('ofertas').upsert({
                    producto: titulo, 
                    precio_oferta: parseFloat(precio),
                    precio_original: parseFloat(precio), 
                    link_original: linkOriginalLimpio, // 👈 URL limpia
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

                console.log(`✅ Guardado IA Automático: ${titulo}`);
                await new Promise(r => setTimeout(r, 4500));
            } catch (e) { console.error("Error procesando link"); }
        }
    } catch (e) { console.error("Error en scraper"); }
}

module.exports = { runScraper };