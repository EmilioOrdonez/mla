const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function enviarOfertasAprobadas() {
    try {
        const { data: records, error } = await supabase.from('ofertas').select('*').eq('status', 'Aprobado').eq('enviado', false);
        if (error || !records || records.length === 0) return console.log("⏳ Nada pendiente.");

        for (const record of records) {
            try {
                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const pOf = formateador.format(record.precio_oferta);
                const pOrig = formateador.format(record.precio_original);
                
                // Psicología: Etiqueta de impacto inicial
                const ahorro = Math.round(((record.precio_original - record.precio_oferta) / record.precio_original) * 100);
                const tagImpacto = ahorro > 5 ? `📉 *¡${ahorro}% de DESCUENTO!*` : `🔥 *¡PRECIO ESPECIAL!*`;
                
                // Le quitamos asteriscos para Facebook
                const tagFB = tagImpacto.replace(/\*/g, ''); 
                
                const linkFinal = record.link_corto || record.link_afiliado;
                
                // Extracción de la IA desde la base de datos
                const fraseIA = record.frase_persuasiva || "¡No te quedes sin el tuyo! ⚡";
                const tagsIA = record.hashtags || "#Ofertas #GenesysDigital";

                // --- 📝 TELEGRAM ---
                const mensajeTG = `${tagImpacto}\n✨ _${fraseIA}_\n\n📦 *${record.producto}*\n\n❌ Antes: ~${pOrig}~\n✅ *Hoy solo: ${pOf}*\n\n🛒 *COMPRA AQUÍ:* ${linkFinal}\n\n—\n📢 *Genesys Digital* | ${tagsIA}`;

                // --- 📝 FACEBOOK ---
                const mensajeFB = `${tagFB}\n✨ ${fraseIA}\n\n🔥 ${record.producto}\n\n💰 Precio: ${pOf} (Antes: ${pOrig})\n🛒 Cómpralo aquí: ${linkFinal}\n\n✨ Únete a nuestro canal VIP para más exclusivas:\n👉 https://t.me/ofertas_mercado_libre_mexico\n\n${tagsIA} #MercadoLibre`;

                // DISPAROS
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                    chat_id: process.env.TELEGRAM_CHAT_ID, photo: record.imagen_url, caption: mensajeTG, parse_mode: 'Markdown'
                });

                await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                    url: record.imagen_url, message: mensajeFB, access_token: process.env.FB_PAGE_TOKEN
                });

                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                console.log(`✅ Publicado: ${record.producto}`);
                await sleep(5000);
            } catch (e) { console.error("Error enviando:", e.message); }
        }
    } catch (e) { console.error("Error crítico"); }
}

module.exports = { enviarOfertasAprobadas };