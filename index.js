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

// 🧠 CEREBRO DE MARKETING CON IA (VERSIÓN 2.5 FLASH)
async function generarMarketingIA(titulo) {
    try {
        // Actualizado al modelo vigente
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Eres un copywriter experto. Analiza este producto: "${titulo}". Genera:
        1. Una frase persuasiva y corta (máximo 12 palabras) que incite a comprar, resaltando el valor. Usa 1 emoji.
        2. Tres hashtags relevantes en formato #CamelCase.
        Devuelve ÚNICAMENTE un JSON con formato: {"frase": "frase aquí", "hashtags": "#Tag1 #Tag2 #Tag3"}`;
        
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

        $('.promotion-item__link-container').each((i, el) => {
            const link = $(el).attr('href');
            if(link) links.push(link);
        });

        for(const url of links.slice(0, 5)) {
            try {
                const pResp = await axios.get(url, { maxRedirects: 5 });
                let realUrl = pResp.request.res.responseUrl;
                const mlidMatch = realUrl.match(/MLM-?(\d+)/i);
                const uniqueId = mlidMatch ? mlidMatch[0].toUpperCase() : `AUTO-${Date.now()}`;
                const $$ = cheerio.load(pResp.data);

                let titulo = $$('meta[property="og:title"]').attr('content');
                let precio = $$('.andes-money-amount__fraction').first().text().replace(/,/g, '');

                const linkLargo = `${realUrl.split('?')[0]}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;
                
                const [linkCorto, marketingData] = await Promise.all([
                    acortarLink(linkLargo),
                    generarMarketingIA(titulo)
                ]);

                await supabase.from('ofertas').upsert({
                    producto: titulo, 
                    precio_oferta: parseFloat(precio),
                    precio_original: parseFloat(precio), 
                    link_original: uniqueId, 
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

                console.log(`✅ Guardado IA: ${titulo}`);
                await new Promise(r => setTimeout(r, 4000));
            } catch (e) { console.error("Error procesando link individual"); }
        }
    } catch (e) { console.error("Error en scraper"); }
}

module.exports = { runScraper };