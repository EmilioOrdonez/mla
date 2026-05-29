// index.js
const axios = require('axios');
const { supabase, acortarLink, generarMarketingIABatch, esProductoPermitido, mezclarArreglo } = require('./servicios');

async function runScraper() {
    console.log("\n===========================================");
    console.log("🔍 [SCRAPER] Iniciando búsqueda de ofertas dinámicas vía API...");
    try {
        const apiMeli = 'https://api.mercadolibre.com/sites/MLM/search?q=ofertas&shipping_cost=free&limit=15';
        
        const response = await axios.get(apiMeli, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        if (!response.data || !response.data.results) {
            console.log("⚠️ [SCRAPER] No se recibieron resultados válidos de la API.");
            return;
        }

        let candidatos = [];
        const results = response.data.results;

        for (const producto of results) {
            let titulo = producto.title;
            let urlOriginal = producto.permalink;
            // Captura de precios nativos desde la API de Mercado Libre
            let precioOferta = producto.price;
            let precioOriginal = producto.original_price || producto.price; 
            let img = producto.thumbnail ? producto.thumbnail.replace(/-I\.jpg/g, '-O.jpg') : ''; // Imagen en alta resolución

            if (titulo && urlOriginal && precioOferta) {
                candidatos.push({
                    titulo,
                    precioOferta,
                    precioOriginal,
                    link: urlOriginal.split('#')[0],
                    img
                });
            }
        }

        console.log(`📦 [SCRAPER] API entregó ${candidatos.length} productos crudos.`);
        candidatos = mezclarArreglo(candidatos);

        let listaFinal = [];
        for (const p of candidatos) {
            if (listaFinal.length >= 5) break; // Lote de 5 por ronda
            if (await esProductoPermitido(p.titulo)) {
                const { data: ex } = await supabase.from('ofertas').select('id').eq('link_original', p.link).single();
                if (!ex) listaFinal.push(p);
            }
        }

        if (listaFinal.length === 0) {
            console.log("⏩ [SCRAPER] No hay productos nuevos o permitidos en esta ronda.");
            return;
        }

        console.log(`🧠 [SCRAPER] Procesando ${listaFinal.length} ofertas con la IA...`);
        const mkt = await generarMarketingIABatch(listaFinal.map(l => l.titulo));

        let guardados = 0;
        for (let i = 0; i < listaFinal.length; i++) {
            const p = listaFinal[i];
            const meta = mkt[i] || { seguro_para_fb: true, frase: "¡Ofertón imperdible! ⚡", hashtags: "#Ofertas" };

            const aff = `${p.link}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
            const short = await acortarLink(aff);

            await supabase.from('ofertas').upsert({
                producto: p.titulo,
                precio_oferta: parseFloat(p.precioOferta),
                precio_original: parseFloat(p.precioOriginal),
                link_original: p.link,
                link_afiliado: aff,
                link_corto: short,
                frase_persuasiva: meta.frase,
                hashtags: meta.hashtags,
                imagen_url: p.img,
                status: 'Aprobado',
                fuente: 'Auto',
                enviado: false, // Forzar en falso para que el publicador lo tome
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' });

            console.log(`✅ [GUARDADO] ${p.titulo}`);
            guardados++;
        }
        console.log(`🏁 [SCRAPER] Auto Search finalizado con éxito. (${guardados} en cola).`);
        console.log("===========================================\n");

    } catch (error) {
        console.error("❌ Error crítico en Auto Search Scraper:", error.message);
    }
}

module.exports = { runScraper };