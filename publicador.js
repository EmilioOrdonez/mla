const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🛡️ Filtro de seguridad: Limpia caracteres que rompen Telegram
function escapeHTML(str) {
    return str ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

async function enviarOfertasAprobadas() {
    try {
        const { data: records, error } = await supabase.from('ofertas').select('*').eq('status', 'Aprobado').eq('enviado', false);
        if (error || !records || records.length === 0) return console.log("⏳ Nada pendiente para publicar.");

        for (const record of records) {
            try {
                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const pOf = formateador.format(record.precio_oferta);
                const pOrig = formateador.format(record.precio_original);
                
                const ahorro = Math.round(((record.precio_original - record.precio_oferta) / record.precio_original) * 100);
                
                // Formatos HTML para Telegram y texto plano para FB
                const tagTG = ahorro > 5 ? `📉 <b>¡${ahorro}% de DESCUENTO!</b>` : `🔥 <b>¡PRECIO ESPECIAL!</b>`;
                const tagFB = ahorro > 5 ? `📉 ¡${ahorro}% de DESCUENTO!` : `🔥 ¡PRECIO ESPECIAL!`;
                
                const linkFinal = record.link_corto || record.link_afiliado;
                
                // Extraemos IA y aplicamos escudo protector de caracteres para Telegram
                const fraseSegura = escapeHTML(record.frase_persuasiva || "¡No te quedes sin el tuyo! ⚡");
                const tituloSeguro = escapeHTML(record.producto);
                const tagsSeguros = escapeHTML(record.hashtags || "#Ofertas #GenesysDigital");

                // 🛡️ VALIDACIÓN DE IMAGEN ESTRICTA
                // Si ML no dio imagen, usamos una de respaldo profesional para evitar el Error 400
                const fotoSegura = (record.imagen_url && record.imagen_url.startsWith('http')) 
                    ? record.imagen_url 
                    : "https://via.placeholder.com/800x450/1a1a2e/00d2ff.png?text=Oferta+Genesys+Digital";

                // --- 📝 TELEGRAM (Ahora usa sintaxis HTML, 100% a prueba de errores) ---
                const mensajeTG = `${tagTG}\n✨ <i>${fraseSegura}</i>\n\n📦 <b>${tituloSeguro}</b>\n\n❌ Antes: <s>${pOrig}</s>\n✅ <b>Hoy solo: ${pOf}</b>\n\n🛒 <b>COMPRA AQUÍ:</b> ${linkFinal}\n\n—\n📢 <b>Genesys Digital</b> | ${tagsSeguros}`;

                // --- 📝 FACEBOOK ---
                const mensajeFB = `${tagFB}\n✨ ${record.frase_persuasiva}\n\n🔥 ${record.producto}\n\n💰 Precio: ${pOf} (Antes: ${pOrig})\n🛒 Cómpralo aquí: ${linkFinal}\n\n✨ Únete a nuestro canal VIP para más exclusivas:\n👉 https://t.me/ofertas_mercado_libre_mexico\n\n${record.hashtags} #MercadoLibre`;

                // 🚀 DISPARO 1: TELEGRAM
                try {
                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                        chat_id: process.env.TELEGRAM_CHAT_ID, 
                        photo: fotoSegura, 
                        caption: mensajeTG, 
                        parse_mode: 'HTML' // 👈 El secreto para que Telegram no rechace el texto
                    });
                    console.log(`✅ [Telegram] Publicado: ${record.producto}`);
                } catch (eTG) {
                    // Si falla, imprimimos el motivo real del rechazo
                    console.error("❌ Telegram rechazó el post:", eTG.response?.data?.description || eTG.message);
                }

                // 🚀 DISPARO 2: FACEBOOK
                try {
                    await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                        url: fotoSegura, 
                        message: mensajeFB, 
                        access_token: process.env.FB_PAGE_TOKEN
                    });
                    console.log(`✅ [Facebook] Publicado: ${record.producto}`);
                } catch (eFB) {
                    console.error("❌ Facebook rechazó el post:", eFB.response?.data?.error?.message || eFB.message);
                }

                // Finalmente actualizamos la base de datos
                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                await sleep(5000);
            } catch (innerE) { 
                console.error("⚠️ Error procesando registro:", innerE.message); 
            }
        }
    } catch (e) { 
        console.error("❌ Error general:", e.message); 
    }
}

module.exports = { enviarOfertasAprobadas };