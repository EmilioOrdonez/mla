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

                // 🛡️ DECLARACIÓN ÚNICA Y SEGURA DE LA IMAGEN (Evita el SyntaxError)
                let fotoSegura = (record.imagen_url && record.imagen_url.trim().startsWith('http'))
                    ? record.imagen_url.trim()
                    : "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=1200&auto=format&fit=crop";

                // Formatos de Mensajes
                const mensajeTG = `${tagTG}\n✨ <i>${fraseSegura}</i>\n\n📦 <b>${tituloSeguro}</b>\n\n❌ Antes: <s>${pOrig}</s>\n✅ <b>Hoy solo: ${pOf}</b>\n\n🎁 <b>Más recomendaciones:</b> https://meli.la/1oWVfrg\n\n—\n📢 <b>Genesys Digital</b> | ${tagsSeguros}`;
                const mensajeFB = `${tagFB}\n\n✨ ${record.frase_persuasiva}\n\n📦 ${record.producto}\n\n❌ Antes: ${pOrig}\n✅ Hoy solo: ${pOf}\n\n🛒 Adquiérelo aquí:\n👉 ${linkFinal}\n\n🎁 Ver más ofertas recomendadas:\n👉 https://meli.la/1oWVfrg\n\n📲 Únete a nuestro Canal VIP en Telegram:\n👉 https://t.me/ofertas_mercado_libre_mexico\n\n${record.hashtags}`;

                // Botones Inline de Telegram
                const botonCompartirURL = `https://t.me/share/url?url=${encodeURIComponent(linkFinal)}&text=${encodeURIComponent(`¡Mira este ofertón! 📦 ${record.producto} a solo ${pOf}`)}`;
                const telegramButtons = {
                    inline_keyboard: [
                        [
                            { text: '🛒 Ir a la oferta', url: linkFinal },
                            { text: '📢 Compartir', url: botonCompartirURL }
                        ]
                    ]
                };

                // 🚀 DISPARO TELEGRAM
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
                    console.error(`⚠️ [TELEGRAM] Falló con la foto original. Reintentando con texto plano...`);
                    try {
                        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                            chat_id: process.env.TELEGRAM_CHAT_ID,
                            text: mensajeTG,
                            parse_mode: 'HTML',
                            reply_markup: JSON.stringify(telegramButtons)
                        });
                        console.log(`🔹 [TELEGRAM-FALLBACK] Enviado como texto sin foto.`);
                    } catch (eTG2) {
                        console.error("❌ Error definitivo en Telegram:", eTG2.message);
                    }
                }

                // 🚀 DISPARO FACEBOOK
                try {
                    // Intento 1: Publicar con la foto del producto
                    await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                        url: fotoSegura,
                        message: mensajeFB,
                        access_token: process.env.FB_PAGE_TOKEN
                    });
                    console.log(`🔹 [FACEBOOK] Éxito (Post con Foto): ${record.producto}`);
                } catch (eFB) {
                    console.error(`⚠️ [FACEBOOK] Foto rechazada por la API. Activando Fallback a Texto Plano (/feed)...`);

                    // FALLBACK FACEBOOK: Si la foto falla, mutamos a una publicación de texto en el muro
                    // Facebook generará automáticamente la vista previa del link corto
                    try {
                        await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/feed`, {
                            message: mensajeFB,
                            access_token: process.env.FB_PAGE_TOKEN
                        });
                        console.log(`🔹 [FACEBOOK-FALLBACK] Éxito (Post de Texto sin imagen): ${record.producto}`);
                    } catch (eFB2) {
                        console.error("❌ Error definitivo en API Facebook:", eFB2.response ? JSON.stringify(eFB2.response.data) : eFB2.message);
                    }
                }

                // Marcar como enviado en Supabase
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