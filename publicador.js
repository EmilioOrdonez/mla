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

        for (const record of records) {
            try {
                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const pOf = formateador.format(record.precio_oferta);
                const pOrig = formateador.format(record.precio_original);
                
                // Cálculo matemático del descuento
                const ahorro = Math.round(((record.precio_original - record.precio_oferta) / record.precio_original) * 100);
                
                // Formatos condicionales
                const tagTG = ahorro > 5 ? `📉 <b>¡${ahorro}% de DESCUENTO!</b>` : `🔥 <b>¡PRECIO ESPECIAL!</b>`;
                const tagFB = ahorro > 5 ? `📉 ¡${ahorro}% de DESCUENTO!` : `🔥 ¡PRECIO ESPECIAL!`;
                
                const linkFinal = record.link_corto || record.link_afiliado;
                
                const fraseSegura = escapeHTML(record.frase_persuasiva || "¡No te quedes sin el tuyo! ⚡");
                const tituloSeguro = escapeHTML(record.producto);
                const tagsSeguros = escapeHTML(record.hashtags || "#Ofertas #GenesysDigital");

                const fotoSegura = (record.imagen_url && record.imagen_url.startsWith('http')) 
                    ? record.imagen_url 
                    : "https://via.placeholder.com/800x450/1a1a2e/00d2ff.png?text=Oferta+Genesys+Digital";

                // --- 📝 TELEGRAM (Estructura HTML Limpia sin enlaces de compra en texto) ---
                const mensajeTG = `${tagTG}\n✨ <i>${fraseSegura}</i>\n\n📦 <b>${tituloSeguro}</b>\n\n❌ Antes: <s>${pOrig}</s>\n✅ <b>Hoy solo: ${pOf}</b>\n\n🎁 <b>Más recomendaciones:</b> https://meli.la/1oWVfrg\n\n—\n📢 <b>Genesys Digital</b> | ${tagsSeguros}`;

                // --- 📝 FACEBOOK ---
                const mensajeFB = `${tagFB}\n\n✨ ${record.frase_persuasiva}\n\n📦 ${record.producto}\n\n❌ Antes: ${pOrig}\n✅ Hoy solo: ${pOf}\n\n🛒 Adquiérelo aquí:\n👉 ${linkFinal}\n\n🎁 Ver más ofertas recomendadas:\n👉 https://meli.la/1oWVfrg\n\n📲 Únete a nuestro Canal VIP en Telegram:\n👉 https://t.me/ofertas_mercado_libre_mexico\n\n${record.hashtags}`;

                // --- 🎛️ BOTONES PARA TELEGRAM (Inline Keyboard) ---
                const botonCompartirURL = `https://t.me/share/url?url=${encodeURIComponent(linkFinal)}&text=${encodeURIComponent(`¡Mira este ofertón! 📦 ${record.producto} a solo ${pOf}`)}`;
                
                const telegramButtons = {
                    inline_keyboard: [
                        [
                            { text: '🛒 Ir a la oferta', url: linkFinal },
                            { text: '📢 Compartir', url: botonCompartirURL }
                        ]
                    ]
                };

                // DISPAROS
                try {
                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                        chat_id: process.env.TELEGRAM_CHAT_ID,
                        photo: fotoSegura,
                        caption: mensajeTG,
                        parse_mode: 'HTML',
                        reply_markup: JSON.stringify(telegramButtons) // Adjuntamos los botones como string JSON
                    });
                } catch (eTG) {
                    console.error("Error Telegram:", eTG.response ? eTG.response.data : eTG.message);
                }

                try {
                    await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                        url: fotoSegura, message: mensajeFB, access_token: process.env.FB_PAGE_TOKEN
                    });
                } catch (eFB) {}

                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                await sleep(5000);
            } catch (innerE) {}
        }
    } catch (e) {}
}

module.exports = { enviarOfertasAprobadas };