// index.js
const axios = require('axios');
const { supabase, acortarLink, generarMarketingIABatch, esProductoPermitido, mezclarArreglo } = require('./servicios');

async function runScraper() {
    console.log("\n===========================================");
    console.log("🔍 [SCRAPER] Iniciando búsqueda de ofertas vía Puente Google...");
    
    const puenteUrl = process.env.GOOGLE_BRIDGE_URL;
    
    if (!puenteUrl) {
        console.error("❌ Error: Falta la variable GOOGLE_BRIDGE_URL en Render.");
        return;
    }

    try {
        // Configuración avanzada de Axios para seguir redirecciones 302 de Google Apps Script
        const response = await axios.get(puenteUrl, { 
            timeout: 15000,
            maxRedirects: 5, // Obliga a Axios a seguir el redireccionamiento de Google
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        // Verificación y parseo manual de seguridad por si viene como String o como Objeto
        let data = response.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.error("❌ Error al parsear la respuesta del puente como JSON:", e.message);
                return;
            }
        }

        if (!data || !data.results || !Array.isArray(data.results) || data.results.length === 0) {
            console.log("⚠️ [SCRAPER] El puente respondió pero el nodo 'results' no contiene un arreglo válido.");
            console.log("Estructura recibida:", JSON.stringify(data).substring(0, 200)); // Imprime los primeros 200 caracteres para auditar
            return;
        }

        let candidatos = [];
        const results = data.results;

        for (const producto of results) {
            let titulo = producto.title;
            let urlOriginal = producto.permalink;
            let precioOferta = producto.price;
            let precioOriginal = producto.original_price || producto.price; 
            let img = producto.thumbnail ? producto.thumbnail.replace(/-I\.jpg/g, '-O.jpg') : '';

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

        console.log(`📦 [SCRAPER] El puente entregó ${candidatos.length} productos potenciales organizados.`);
        candidatos = mezclarArreglo(candidatos);

        let listaFinal = [];
        for (const p of candidatos) {
            if (listaFinal.length >= 5) break; 
            
            if (await esProductoPermitido(p.titulo)) {
                const { data: ex } = await supabase.from('ofertas').select('id').eq('link_original', p.link).single();
                if (!ex) listaFinal.push(p);
            }
        }

        if (listaFinal.length === 0) {
            console.log("⏩ [SCRAPER] No hay ofertas nuevas libres de filtros en esta ronda.");
            return;
        }

        console.log(`🧠 [SCRAPER] Enviando ${listaFinal.length} títulos a la capa de Inteligencia Artificial...`);
        const mkt = await generarMarketingIABatch(listaFinal.map(l => l.titulo));

        let guardados = 0;
        for (let i = 0; i < listaFinal.length; i++) {
            const p = listaFinal[i];
            const meta = mkt[i] || { seguro_para_fb: true, frase: "¡Excelente oportunidad de compra! ⚡", hashtags: "#Ofertas" };

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
                enviado: false, 
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' });

            console.log(`✅ [GUARDADO] Listo en cola: ${p.titulo}`);
            guardados++;
        }
        
        console.log(`🏁 [SCRAPER] Procesamiento completado. Datos listos en Supabase.`);
        console.log("===========================================\n");

    } catch (error) {
        console.error("❌ Error crítico en Auto Search Scraper:", error.message);
    }
}

module.exports = { runScraper };