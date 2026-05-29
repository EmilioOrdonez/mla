// publicador.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function escapeHTML(str) {
    return str ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

async function enviarOfertasAprobadas() {
    try {
        const { data: records, error } = await supabase.from('ofertas').select('*').eq('status', 'Aprobado').eq('enviado', false);
        if (error || !records || records.length === 0) return console.log("⏳ Nada pendiente para publicar.");

        console.log(`📦 [PUBLICADOR] Se encontraron ${records.length} ofertas listas para despachar.`);

        for (const record of records) {
            try {
                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const pOf = formateador.format(record.precio_oferta);
                const pOrig = formateador.format(record.precio_original);
                
                const ahorro = record.precio_original > record.precio_oferta 
                    ? Math.round(((record.precio_original - record.precio_oferta) / record.precio_original) * 100) 
                    : 0;
                
                const tagTG = ahorro > 5 ? `📉 <b>¡${ahorro}% de DESCUENTO!</b>` : `🔥 <b>¡PRECIO ESPECIAL!</b>`;
                const tagFB = ahorro > 5 ? `📉 ¡${ahorro}% de DESCUENTO!` : `🔥 ¡PRECIO ESPECIAL!`;
                
                const linkFinal = record.link_corto || record.link_afiliado;
                
                const fraseSegura = escapeHTML(record.frase_persuasiva || "¡No te quedes sin el tuyo! ⚡");
                const tituloSeguro = escapeHTML(record.producto);
                const tagsSeguros = escapeHTML(record.hashtags || "#Ofertas #GenesysDigital");

                const fotoSegura = (record.imagen_url && record.imagen_url.startsWith('http')) 
                    ? record.imagen_url 
                    : "https://via.placeholder.com/800x450/1a1a2e/00d2ff.png?text=Oferta+Genesys+Digital";

                const mensajeTG = `${tagTG}\n✨ <i>${fraseSegura}</i>\n\n📦 <b>${tituloSeguro}</b>\n\n❌ Antes: <s>${pOrig}</s>\n✅ <b>Hoy solo: ${pOf}</b>\n\n🎁 <b>Más recomendaciones:</b> https://meli.la/1oWVfrg\n\n—\n📢 <b>Genesys Digital</b> | ${tagsSeguros}`;

                const mensajeFB = `${tagFB}\n\n✨ ${record.frase_persuasiva}\n\n📦 ${record.producto}\n\n❌ Antes: ${pOrig}\n✅ Hoy solo: ${pOf}\n\n🛒 Adquiérelo aquí:\n👉 ${linkFinal}\n\n🎁 Ver más ofertas recomendadas:\n👉 https://meli.la/1oWVfrg\n\n📲 Únete a nuestro Canal VIP en Telegram:\n👉 https://t.me/ofertas_mercado_libre_mexico\n\n${record.hashtags}`;

                const botonCompartirURL = `https://t.me/share/url?url=${encodeURIComponent(linkFinal)}&text=${encodeURIComponent(`¡Mira este ofertón! 📦 ${record.producto} a solo ${pOf}`)}`;
                
                const telegramButtons = {
                    inline_keyboard: [
                        [
                            { text: '🛒 Ir a la oferta', url: linkFinal },
                            { text: '📢 Compartir', url: botonCompartirURL }
                        ]
                    ]
                };

                // 🚀 ENVÍO A TELEGRAM
                try {
                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                        chat_id: process.env.TELEGRAM_CHAT_ID,
                        photo: fotoSegura,
                        caption: mensajeTG,
                        parse_mode: 'HTML',
                        reply_markup: JSON.stringify(telegramButtons)
                    });
                    console.log(`🔹 [TELEGRAM] Éxito: ${record.producto}`);
                } catch (eTG) {
                    console.error("❌ Error en API Telegram:", eTG.response ? eTG.response.data : eTG.message);
                }

                // 🚀 ENVÍO A FACEBOOK (Con el cazador de errores encendido)
                try {
                    await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                        url: fotoSegura, message: mensajeFB, access_token: process.env.FB_PAGE_TOKEN
                    });
                    console.log(`🔹 [FACEBOOK] Éxito: ${record.producto}`);
                } catch (eFB) {
                    console.error("❌ Error Real en API Facebook:", eFB.response ? JSON.stringify(eFB.response.data) : eFB.message);
                }

                // Actualizar estado en Supabase
                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                await sleep(5000);
            } catch (innerE) {
                console.error("❌ Fallo interno en ciclo de iteración:", innerE.message);
            }
        }
    } catch (e) {
        console.error("❌ Fallo general en el publicador:", e.message);
    }
}

module.exports = { enviarOfertasAprobadas };