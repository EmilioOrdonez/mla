const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data : urlLarga;
    } catch (e) {
        return urlLarga;
    }
}

async function runScraper() {
    console.log("🚀 Iniciando búsqueda automática...");
    // Ejemplo de URL de ofertas, puedes cambiarla por la categoría que prefieras
    const searchUrl = "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1";

    try {
        const resp = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(resp.data);
        const links = [];

        $('.promotion-item__link-container').each((i, el) => {
            const link = $(el).attr('href');
            if (link) links.push(link);
        });

        console.log(`📦 Encontrados ${links.length} enlaces potenciales.`);

        for (const url of links.slice(0, 5)) { // Procesamos 5 para no saturar
            try {
                const pResp = await axios.get(url, { maxRedirects: 5 });
                let realUrl = pResp.request.res.responseUrl;
                const uniqueId = realUrl.match(/MLM-?(\d+)/) ? realUrl.match(/MLM-?(\d+)/)[0] : realUrl.split('?')[0];
                const $$ = cheerio.load(pResp.data);

                let titulo = $$('meta[property="og:title"]').attr('content');
                let precio = $$('.andes-money-amount__fraction').first().text().replace(/,/g, '');

                const linkLargo = `${realUrl.split('?')[0]}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;
                const linkCorto = await acortarLink(linkLargo);

                await supabase.from('ofertas').upsert({
                    producto: titulo,
                    precio_oferta: parseFloat(precio),
                    precio_original: parseFloat(precio),
                    link_original: uniqueId,
                    link_afiliado: linkLargo,
                    link_corto: linkCorto,
                    imagen_url: $$('meta[property="og:image"]').attr('content'),
                    status: 'Aprobado',
                    enviado: false,
                    fuente: 'Auto', // 👈 NUEVA COLUMNA
                    fecha_mexico: new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
                }, { onConflict: 'link_original' });

                console.log(`✅ Guardado: ${titulo}`);
                await new Promise(r => setTimeout(r, 4000));
            } catch (e) { console.error("Error procesando link"); }
        }
    } catch (e) { console.error("Error en scraper"); }
}

module.exports = { runScraper };