// index.js
const axios = require('axios');
const cheerio = require('cheerio');
const { supabase, acortarLink, generarMarketingIABatch, esProductoPermitido, mezclarArreglo } = require('./servicios');

async function runScraper() {
    console.log("🚀 Iniciando Auto Search Modular...");
    try {
        const { data: cats } = await supabase.from('categorias_busqueda').select('*').eq('activa', true);
        if (!cats || cats.length === 0) return;

        const searchUrl = cats[Math.floor(Math.random() * cats.length)].url_mercadolibre;
        const resp = await axios.get(searchUrl, { headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 15000 });
        const $ = cheerio.load(resp.data);
        
        let candidatos = [];
        $('.poly-card, .promotion-item').each((i, el) => {
            const link = $(el).find('a').attr('href')?.split('?')[0];
            const titulo = $(el).find('.poly-component__title, .promotion-item__title').text().trim();
            const precio = $(el).find('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '');
            const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            if (link && titulo && precio) candidatos.push({ titulo, precio, link, img });
        });

        candidatos = mezclarArreglo(candidatos);
        let listaFinal = [];
        for (const p of candidatos) {
            if (listaFinal.length >= 5) break;
            if (await esProductoPermitido(p.titulo)) {
                const { data: ex } = await supabase.from('ofertas').select('id').eq('link_original', p.link).single();
                if (!ex) listaFinal.push(p);
            }
        }

        if (listaFinal.length === 0) return;

        const mkt = await generarMarketingIABatch(listaFinal.map(l => l.titulo));

        for (let i = 0; i < listaFinal.length; i++) {
            const p = listaFinal[i];
            const meta = mkt[i];
            if (!meta?.seguro_para_fb) continue;

            const aff = `${p.link}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
            const short = await acortarLink(aff);

            await supabase.from('ofertas').upsert({
                producto: p.titulo, precio_oferta: parseFloat(p.precio),
                link_original: p.link, link_afiliado: aff, link_corto: short,
                frase_persuasiva: meta.frase, hashtags: meta.hashtags,
                imagen_url: p.img, status: 'Aprobado', fuente: 'Auto'
            });
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log("🏁 Proceso Auto Search terminado.");
    } catch (e) { console.error("❌ Falló el scraper."); }
}

module.exports = { runScraper };