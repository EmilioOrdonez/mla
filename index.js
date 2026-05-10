const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runScraper() {
    console.log("🔍 Iniciando búsqueda con normalización de enlaces...");
    const url = 'https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&category=MLM1648#menu=categories';

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });

        const $ = cheerio.load(data);
        let items = [];

        $('.promotion-item, .poly-card, .ui-search-layout__item').each((i, el) => {
            const titulo = $(el).find('.promotion-item__title, .poly-component__title, .ui-search-item__title').text().trim();
            const linkSucio = $(el).find('a').attr('href');
            
            if (titulo && linkSucio) {
                // --- 🛠️ NORMALIZACIÓN DE URL ---
                // Eliminamos todo después del '?' o '#' para tener la URL base del producto
                const linkLimpio = linkSucio.split('?')[0].split('#')[0];

                let precioOrig = $(el).find('s .andes-money-amount__fraction, .andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || "0";
                let precioOf = $(el).find('.andes-money-amount__fraction').not('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '') || "0";
                const imagen = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');

                const linkAfiliado = `${linkLimpio}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;

                items.push({
                    producto: titulo,
                    precio_original: parseFloat(precioOrig) || parseFloat(precioOf),
                    precio_oferta: parseFloat(precioOf),
                    link_original: linkLimpio, // Esta es la llave que Postgres usará para detectar duplicados
                    link_afiliado: linkAfiliado,
                    imagen_url: imagen || "https://via.placeholder.com/150",
                    status: 'Aprobado'
                });
            }
        });

        if (items.length === 0) return console.log("⏳ No se encontraron productos nuevos.");

        // Usamos upsert con onConflict para que si el link_original ya existe, NO haga nada (ignore el insert)
        const { error } = await supabase
            .from('ofertas')
            .upsert(items, { onConflict: 'link_original', ignoreDuplicates: true });

        if (error) throw error;
        console.log(`🎉 Sincronización terminada. Se procesaron ${items.length} productos.`);

    } catch (error) {
        console.error("❌ Error en el scraper:", error.message);
    }
}

runScraper();