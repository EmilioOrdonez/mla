const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ... (inicio del archivo igual)

// Generamos un hashtag simple del producto (ej: #Monitor)
const categoriaHashtag = `#${record.producto.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}`;
const hashtags = `\n\n${categoriaHashtag} #Ofertas #MercadoLibre #GenesysDigital`;

// --- 📝 FORMATO 1: TELEGRAM ---
const mensajeTG = `🔥 *¡OFERTA DETECTADA!* 🔥\n\n📦 *${record.producto}*\n\n${textoPrecioTG}\n\n🛒 *Cómpralo aquí:* [Enlace de Compra](${record.link_afiliado})\n\n—\n📢 *Genesys Digital - Ofertas*${hashtags}`;

// --- 📝 FORMATO 2: FACEBOOK ---
const mensajeFB = `🔥 ¡OFERTA DETECTADA! 🔥\n\n📦 ${record.producto}\n\n${textoPrecioFB}\n\n🛒 Cómpralo aquí: ${record.link_afiliado}\n\n—\n📢 Genesys Digital - Ofertas\n\n👉 ¡Únete a nuestro canal de Telegram para no perderte nada!\n📲 https://t.me/TU_CANAL_AQUI${hashtags}`;

// ... (resto del archivo igual)

async function enviarOfertasAprobadas() {
    console.log("🔍 Revisando cola de publicaciones multi-canal...");

    try {
        const { data: records, error } = await supabase
            .from('ofertas')
            .select('*')
            .eq('status', 'Aprobado')
            .eq('enviado', false);

        if (error) throw error;
        if (!records || records.length === 0) return console.log("⏳ Nada nuevo para publicar.");

        console.log(`📦 Encontrados ${records.length} productos pendientes.`);

        for (const record of records) {
            try {
                const foto = record.imagen_url && record.imagen_url.startsWith('http')
                    ? record.imagen_url
                    : "https://via.placeholder.com/800x450.png?text=Oferta+Genesys";

                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const precioOf = formateador.format(record.precio_oferta);
                const precioOrig = formateador.format(record.precio_original);

                // --- 📝 FORMATO 1: TELEGRAM (Soporta Markdown) ---
                let textoPrecioTG = `✅ *Precio Especial: ${precioOf}*`;
                if (record.precio_original > record.precio_oferta) {
                    textoPrecioTG = `❌ Antes: ~${precioOrig}~\n✅ *Ahora: ${precioOf}*`;
                }
                const mensajeTG = `🔥 *¡OFERTA DETECTADA!* 🔥\n\n📦 *${record.producto}*\n\n${textoPrecioTG}\n\n🛒 *Cómpralo aquí:* [Enlace de Compra](${record.link_afiliado})\n\n—\n📢 *Genesys Digital - Ofertas*`;

                // --- 📝 FORMATO 2: FACEBOOK (Con Invitación a Telegram) ---
                let textoPrecioFB = `✅ Precio Especial: ${precioOf}`;
                if (record.precio_original > record.precio_oferta) {
                    textoPrecioFB = `❌ Antes: ${precioOrig}\n✅ Ahora: ${precioOf}`;
                }
                const mensajeFB = `🔥 ¡OFERTA DETECTADA! 🔥\n\n📦 ${record.producto}\n\n${textoPrecioFB}\n\n🛒 Cómpralo aquí: ${record.link_afiliado}\n\n—\n📢 Genesys Digital - Ofertas\n\n👉 ¡Únete a nuestro canal de Telegram para no perderte ninguna oferta en tiempo real!\n📲 https://t.me/ofertas_mercado_libre_mexico`;

                // 🚀 DISPARO 1: TELEGRAM
                try {
                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                        chat_id: process.env.TELEGRAM_CHAT_ID,
                        photo: foto,
                        caption: mensajeTG,
                        parse_mode: 'Markdown'
                    });
                    console.log(`✅ [Telegram] Publicado: ${record.producto}`);
                } catch (tgErr) {
                    console.error(`⚠️ Error en Telegram para "${record.producto}":`, tgErr.response?.data?.description || tgErr.message);
                }

                // 🚀 DISPARO 2: FACEBOOK
                try {
                    await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                        url: foto,
                        message: mensajeFB,
                        access_token: process.env.FB_PAGE_TOKEN
                    });
                    console.log(`✅ [Facebook] Publicado: ${record.producto}`);
                } catch (fbErr) {
                    console.error(`⚠️ Error en Facebook para "${record.producto}":`, fbErr.response?.data?.error?.message || fbErr.message);
                }

                // 💾 CIERRE: Marcar como enviado
                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                console.log(`✅ [DB] Registro actualizado a 'enviado'.`);

                await sleep(5000);

            } catch (innerError) {
                console.error(`❌ Error de procesamiento con "${record.producto}":`, innerError.message);
                continue;
            }
        }
    } catch (error) {
        console.error("❌ Error crítico en la orquestación:", error.message);
    }
}

module.exports = { enviarOfertasAprobadas };