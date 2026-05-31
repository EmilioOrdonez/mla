// index.js
const axios = require('axios');
const cheerio = require('cheerio');
const { supabase, acortarLink, generarMarketingIABatch, esProductoPermitido, mezclarArreglo } = require('./servicios');

async function runScraper() {
    console.log("\n===========================================");
    console.log("🔍 [SCRAPER] Iniciando Auto Search desde Supabase con Extracción de Precios...");
    
    try {
        // 1. Leer tus categorías configuradas en la DB
        const { data: tareas, error: dbError } = await supabase
            .from('categorias_busqueda')
            .select('url_mercado_libre')
            .eq('activo', true);

        if (dbError || !tareas || tareas.length === 0) {
            console.log("⚠️ [SCRAPER] No se encontraron URLs activas en 'categorias_busqueda'.");
            return;
        }

        console.log(`📋 [SCRAPER] Se encontraron ${tareas.length} rutas para analizar.`);
        let todasLasOfertas = [];

        // 2. Recorremos cada URL de tu tabla
        for (const tarea of tareas) {
            try {
                console.log(`🔗 Analizando canal: ${tarea.url_mercado_libre}`);
                
                const resp = await axios.get(tarea.url_mercaydo_libre || tarea.url_mercado_libre, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
                    },
                    timeout: 10000
                });

                const $ = cheerio.load(resp.data);
                
                // Selector robusto para los bloques de productos de Mercado Libre
                $('.ui-search-result__wrapper, .promotion-item, .andes-card, .ui-search-layout__item').each((i, elem) => {
                    const link = $(elem).find('a').attr('href');
                    const titulo = $(elem).find('.ui-search-item__title, .promotion-item__title, .poly-component__title').text().trim();
                    
                    // 📸 Extracción de la imagen
                    let imgRaw = $(elem).find('.ui-search-result-image__element, .poly-component__picture, img').first().attr('data-src') || 
                                 $(elem).find('.ui-search-result-image__element, .poly-component__picture, img').first().attr('src') || '';

                    let img = imgRaw;
                    if (img.includes('mlstatic.com')) {
                        img = img.replace(/-[IVX]\.jpg/g, '-O.jpg')
                                 .replace(/-[IVX]\.webp/g, '-O.webp');
                    }

                    // 💰 ─── EXTRACCIÓN DINÁMICA DE PRECIOS ───
                    // 1. Buscamos el precio de oferta actual (el que no está tachado)
                    let precioOfertaRaw = $(elem).find('.andes-money-amount__fraction').not('.ui-search-price__part--expanded .andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '').trim();
                    
                    // 2. Buscamos el precio anterior tachado (si existe)
                    let precioOriginalRaw = $(elem).find('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '').trim();

                    // Fallback de seguridad por si el producto no tiene descuento (ambos precios se vuelven el mismo)
                    if (!precioOfertaRaw) {
                        precioOfertaRaw = $(elem).find('.ui-search-price__part .andes-money-amount__fraction').first().text().replace(/,/g, '').trim() || '0';
                    }
                    if (!precioOriginalRaw) {
                        precioOriginalRaw = precioOfertaRaw;
                    }
                    
                    if (link && titulo) {
                        todasLasOfertas.push({
                            titulo,
                            url: link.split('#')[0],
                            img,
                            precioOferta: parseFloat(precioOfertaRaw) || 0,
                            precioOriginal: parseFloat(precioOriginalRaw) || 0
                        });
                    }
                });

            } catch (errAnidado) {
                console.log(`⚠️ Error al raspar la ruta individual: ${errAnidado.message}`);
            }
        }

        console.log(`📦 [SCRAPER] Total de productos extraídos: ${todasLasOfertas.length}`);
        todasLasOfertas = mezclarArreglo(todasLasOfertas);

        // 3. Filtrar y seleccionar un lote de 5 nuevos
        let listaFinal = [];
        for (const item of todasLasOfertas) {
            if (listaFinal.length >= 5) break;

            if (await esProductoPermitido(item.titulo)) {
                const { data: existe } = await supabase
                    .from('ofertas')
                    .select('id')
                    .eq('link_original', item.url)
                    .single();

                if (!existe) {
                    listaFinal.push(item);
                }
            }
        }

        if (listaFinal.length === 0) {
            console.log("⏩ [SCRAPER] No hay novedades que guardar en esta ronda.");
            return;
        }

        // 4. Procesar lote con la IA y guardar
        console.log(`🧠 Procesando lote de ${listaFinal.length} con IA...`);
        const mkt = await generarMarketingIABatch(listaFinal.map(l => l.titulo));

        for (let i = 0; i < listaFinal.length; i++) {
            const p = listaFinal[i];
            const meta = mkt[i] || { seguro_para_fb: true, frase: "¡Precio especial de liquidación! ⚡", hashtags: "#Ofertas" };

            let linkAff = `${p.url}?matt_d2id=${process.env.ML_MATT_D2ID}&matt_event_ts=${Date.now()}`;
            let linkShort = await acortarLink(aff || linkAff);

            // Insertamos el registro completo con los precios reales capturados del HTML
            await supabase.from('ofertas').upsert({
                producto: p.titulo,
                precio_oferta: p.precioOferta,       // 📊 Ahora sí inyecta el número real
                precio_original: p.precioOriginal,   // 📊 Ahora sí inyecta el número real
                link_original: p.url,
                link_afiliado: linkAff,
                link_corto: linkShort,
                frase_persuasiva: meta.frase,
                hashtags: meta.hashtags,
                imagen_url: p.img,
                status: 'Aprobado',
                fuente: 'Auto',
                enviado: false,
                fecha_mexico: new Date().toLocaleString("en-US", {timeZone: "America/Mexico_City"})
            }, { onConflict: 'link_original' });

            console.log(`✅ [GUARDADO COMPLETO] $${p.precioOferta} - ${p.titulo}`);
        }

        console.log("🏁 [SCRAPER] Ciclo automático completado.");
        console.log("===========================================\n");

    } catch (error) {
        console.error("❌ Error crítico general en runScraper:", error.message);
    }
}

module.exports = { runScraper };