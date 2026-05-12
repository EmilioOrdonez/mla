async function runScraper() {
    console.log("🚀 [PASO 1] Iniciando búsqueda automática multipista...");
    
    // 🗂️ BATERÍA DE RUTAS ESTRUCTURALES
    const rutasDeBusqueda = [
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=1",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=2",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=3",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=4",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=5",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=6",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=7",
        "https://www.mercadolibre.com.mx/ofertas?container_id=OFFERS_LIST&page=8"
    ];

    let searchUrlRaw = rutasDeBusqueda[Math.floor(Math.random() * rutasDeBusqueda.length)];
    
    // 🛡️ ESCUDO ANTI-MARKDOWN: Si el enlace se pegó con corchetes [url](url), extraemos solo el texto limpio
    if (searchUrlRaw.startsWith('[')) {
        const match = searchUrlRaw.match(/\(([^)]+)\)/);
        if (match) searchUrlRaw = match[1];
    }
    
    // Construimos un objeto URL válido
    const searchUrl = new URL(searchUrlRaw.trim()).href;
    
    console.log(`🎯 [PASO 2] Explorando página maestra segura: ${searchUrl}`);
    
    try {
        const resp = await axios.get(searchUrl, { 
            maxRedirects: 3, 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-MX,es;q=0.9'
            } 
        });
        
        console.log("✅ [PASO 3] Conexión a Mercado Libre exitosa. Leyendo página...");
        
        const $ = cheerio.load(resp.data);
        let links = [];

        $('.promotion-item__link-container, .poly-component__title, a.ui-search-link, a[href*="/MLM"]').each((i, el) => {
            let link = $(el).attr('href');
            if(link && typeof link === 'string') {
                link = link.trim();
                if(link.startsWith('https://') && !links.includes(link)) {
                    links.push(link);
                }
            }
        });

        console.log(`📦 [PASO 4] Encontrados ${links.length} enlaces URL válidos.`);

        if (links.length === 0) return console.log("⚠️ No se encontraron productos. ML pudo haber bloqueado la vista o cambiado el código.");

        links = mezclarArreglo(links);
        let guardadosNuevos = 0;

        for(const url of links.slice(0, 5)) {
            try {
                console.log(`🔍 [PASO 5] Analizando enlace individual: ${url}`);
                const pResp = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
                
                let realUrl = pResp.request?.res?.responseUrl || url;
                const linkOriginalLimpio = realUrl.split('?')[0];
                
                const $$ = cheerio.load(pResp.data);
                let titulo = $$('meta[property="og:title"]').attr('content');
                let precio = $$('.andes-money-amount__fraction').first().text().replace(/,/g, '');

                if (!titulo || !precio) {
                    console.log("⚠️ Faltan datos (título o precio). Se salta el producto.");
                    continue;
                }

                const { data: existe } = await supabase.from('ofertas').select('id').eq('link_original', linkOriginalLimpio).single();
                
                if (existe) {
                    console.log(`⏩ Saltando (Ya en DB): ${titulo}`);
                    continue; 
                }

                console.log(`✨ Procesando Nuevo Producto y llamando a IA: ${titulo}`);

                const linkLargo = `${linkOriginalLimpio}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`;
                
                const [linkCorto, marketingData] = await Promise.all([
                    acortarLink(linkLargo),
                    generarMarketingIA(titulo)
                ]);

                await supabase.from('ofertas').upsert({
                    producto: titulo, 
                    precio_oferta: parseFloat(precio),
                    precio_original: parseFloat(precio), 
                    link_original: linkOriginalLimpio, 
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

                console.log(`✅ Guardado Exitoso: ${titulo}`);
                guardadosNuevos++;
                await new Promise(r => setTimeout(r, 4500));

            } catch (innerError) { 
                console.error(`❌ [ERROR INTERNO] Falló al procesar el enlace individual.`);
            }
        }
        
        console.log(`🏁 Fin de la exploración. ${guardadosNuevos} productos nuevos listos para publicar.`);

    } catch (e) { 
        console.error("❌ Error CRÍTICO en scraper principal:", e.message); 
    }
}