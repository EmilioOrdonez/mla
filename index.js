// index.js
const axios = require('axios');
const { supabase, acortarLink, generarMarketingIABatch, esProductoPermitido, mezclarArreglo } = require('./servicios');

async function runScraper() {
    console.log("\n===========================================");
    console.log("🔍 [SCRAPER] Iniciando búsqueda de ofertas vía API Global...");
    try {
        // Endpoint alternativo de alta disponibilidad: Trae los productos más vendidos del sitio (Mercado Libre México)
        // Este endpoint está optimizado para consultas externas masivas y no bloquea IPs de Render
        const apiMeli = 'https://api.mercadolibre.com/sites/MLM/search?search_type=featured&limit=20';
        
        const response = await axios.get(apiMeli, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            console.log("⚠️ [SCRAPER] La API respondió pero el catálogo de destacados venía vacío.");
            return;
        }

        let candidatos = [];
        const results = response.data.results;

        for (const producto of results) {
            let titulo = producto.title;
            let urlOriginal = producto.permalink;
            let precioOferta = producto.price;
            
            // Garantizamos capturar el precio original si existe una oferta activa en el JSON
            let precioOriginal = producto.original_price || producto.price; 
            
            // Convertimos la miniatura típica de la API a una imagen de alta resolución para Facebook
            let img = producto.thumbnail ? producto.thumbnail.replace(/-I\.jpg/g, '-O.jpg') : '';

            // Solo procesamos si el producto tiene un descuento real o es un precio especial válido
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

        console.log(`📦 [SCRAPER] API global entregó ${candidatos.length} productos potenciales.`);
        
        // Mezclamos el arreglo para que no publique siempre lo mismo en cada ronda
        candidatos = mezclarArreglo(candidatos);

        let listaFinal = [];
        for (const p of candidatos) {
            if (listaFinal.length >= 5) break; // Mantenemos el límite de lote configurado
            
            // Validamos contra tu tabla de exclusiones en caliente
            if (await esProductoPermitido(p.titulo)) {
                // Evitamos duplicar enlaces ya existentes en la base de datos
                const { data: ex } = await supabase.from('ofertas').select('id').eq('link_original', p.link).single();
                if (!ex) listaFinal.push(p);
            }
        }

        if (listaFinal.length === 0) {
            console.log("⏩ [SCRAPER] No se encontraron ofertas nuevas libres de exclusión en esta ronda.");
            return;
        }

        console.log(`🧠 [SCRAPER] Enviando ${listaFinal.length} títulos al lote de Inteligencia Artificial...`);
        const mkt = await generarMarketingIABatch(listaFinal.map(l => l.titulo));

        let guardados = 0;
        for (let i = 0; i < listaFinal.length; i++) {
            const p = listaFinal[i];
            const meta = mkt[i] || { seguro_para_fb: true, frase: "¡Excelente oportunidad de compra! ⚡", hashtags: "#Ofertas" };

            // Construcción del enlace de afiliación con tus variables de entorno
            const aff = `${p.link}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
            const short = await acortarLink(aff);

            // Inserción directa en la base de datos compartida de Supabase
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
                enviado: false, // En cola esperando la llamada de tu botón "Publicar Ya"
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' });

            console.log(`✅ [GUARDADO EXITOSO] En cola: ${p.titulo}`);
            guardados++;
        }
        
        console.log(`🏁 [SCRAPER] Ciclo finalizado. Módulo Auto Search listo para despacho.`);
        console.log("===========================================\n");

    } catch (error) {
        console.error("❌ Error crítico en Auto Search Scraper:", error.message);
    }
}

module.exports = { runScraper };