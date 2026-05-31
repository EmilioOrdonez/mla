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

        // 2. Recorremos cada URL de tu tabla (page=1, page=2, etc.)
        for (const tarea of tareas) {
            try {
                if (!tarea.url_mercado_libre) continue;
                
                console.log(`🔗 Analizando canal: ${tarea.url_mercado_libre}`);
                
                const resp = await axios.get(tarea.url_mercado_libre.trim(), {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept-Language': 'es-MX,es;q=0.9'
                    },
                    timeout: 12000
                });

                const $ = cheerio.load(resp.data);
                
                // 🕵️ SCENARIO A: Si por error se cuela una página de producto único (/p/)
                if (tarea.url_mercado_libre.includes('/p/') || $('.pdp-container').length > 0) {
                    let titulo = $('meta[property="og:title"]').attr('content') || $('h1.ui-pdp-title').text().trim();
                    if (titulo.includes(' - $')) titulo = titulo.split(' - $')[0];
                    let img = $('meta[property="og:image"]').attr('content') || '';
                    
                    let precioOfertaRaw = $('.ui-pdp-price__part:not(.ui-pdp-price__part--expanded) .andes-money-amount__fraction').first().text().replace(/,/g, '').trim();
                    let precioOriginalRaw = $('.ui-pdp-price__part--expanded .andes-money-amount__fraction').first().text().replace(/,/g, '').trim();

                    if (!precioOfertaRaw) precioOfertaRaw = $('.ui-pdp-price__fraction').first().text().replace(/,/g, '').trim() || '0';
                    if (!precioOriginalRaw) precioOriginalRaw = precioOfertaRaw;

                    if (titulo) {
                        todasLasOfertas.push({
                            titulo, url: tarea.url_mercado_libre.split('?')[0], img,
                            precioOferta: parseFloat(precioOfertaRaw) || 0,
                            precioOriginal: parseFloat(precioOriginalRaw) || 0
                        });
                    }
                    continue; 
                }

                // 🕵️ SCENARIO B: Tu cuadrícula de Ofertas Masiva (?container_id=OFFERS_LIST)
                $('.ui-search-result__wrapper, .promotion-item, .andes-card, .ui-search-layout__item, .promotion-item__container').each((i, elem) => {
                    const link = $(elem).find('a').attr('href');
                    const titulo = $(elem).find('.ui-search-item__title, .promotion-item__title, .poly-component__title').text().trim();
                    
                    let imgRaw = $(elem).find('.ui-search-result-image__element, .promotion-item__img-container img, .poly-component__picture img, img').first().attr('data-src') || 
                                 $(elem).find('.ui-search-result-image__element, .promotion-item__img-container img, .poly-component__picture img, img').first().attr('src') || '';

                    let img = imgRaw;
                    if (img.includes('mlstatic.com')) {
                        img = img.replace(/-[IVX]\.jpg/g, '-O.jpg')
                                 .replace(/-[IVX]\.webp/g, '-O.webp');
                    }

                    // 💰 EXTRAER PRECIOS MEDIANTE ESTRUCTURA JERÁRQUICA EXACTA
                    // 1. Intentar buscar el precio original tachado primero (si existe)
                    let precioOriginalRaw = $(elem).find('.andes-money-amount--previous .andes-money-amount__fraction').first().text().replace(/,/g, '').trim();
                    
                    // 2. Intentar buscar el precio de oferta actual (en la etiqueta de precio nuevo)
                    let precioOfertaRaw = $(elem).find('.andes-money-amount--cents-superscript .andes-money-amount__fraction').first().text().replace(/,/g, '').trim() ||
                                          $(elem).find('.promotion-item__price .andes-money-amount__fraction').first().text().replace(/,/g, '').trim();

                    // Si los selectores específicos de ofertas fallan, recurrimos a los selectores generales
                    if (!precioOfertaRaw) {
                        // Buscamos cualquier fraccion de dinero que NO esté dentro del bloque tachado (previous)
                        $(elem).find('.andes-money-amount__fraction').each((j, priceElem) => {
                            if (!$(priceElem).closest('.andes-money-amount--previous').length && !precioOfertaRaw) {
                                precioOfertaRaw = $(priceElem).text().replace(/,/g, '').trim();
                            }
                        });
                    }

                    // Ajustes de cierre: si no hay descuento real, el precio de oferta y el original son idénticos
                    if (!precioOfertaRaw) precioOfertaRaw = '0';
                    if (!precioOriginalRaw) precioOriginalRaw = precioOfertaRaw;
                    
                    // Asegurar que si encontramos el precio original pero el de oferta falló, no queden invertidos
                    if (precioOfertaRaw === '0' && precioOriginalRaw !== '0') {
                        precioOfertaRaw = precioOriginalRaw;
                    }

                    if (link && titulo) {
                        todasLasOfertas.push({
                            titulo,
                            url: link.split('#')[0].split('?')[0],
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

        console.log(`📦 [SCRAPER] Total de productos extraídos en crudo: ${todasLasOfertas.length}`);
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
            let linkShort = await acortarLink(linkAff);

            await supabase.from('ofertas').upsert({
                producto: p.titulo,
                precio_oferta: p.precioOferta,       
                precio_original: p.precioOriginal,   
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

            console.log(`✅ [GUARDADO] Oferta: $${p.precioOferta} | Original: $${p.precioOriginal} -> ${p.titulo}`);
        }

        console.log("🏁 [SCRAPER] Ciclo automático completado con éxito.");
        console.log("===========================================\n");

    } catch (error) {
        console.error("❌ Error crítico general en runScraper:", error.message);
    }
}

module.exports = { runScraper };