const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function enviarOfertasAprobadas() {
    try {
        const { data: records, error } = await supabase.from('ofertas').select('*').eq('status', 'Aprobado').eq('enviado', false);
        if (error || !records || records.length === 0) return;

        for (const record of records) {
            try {
                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const pOf = formateador.format(record.precio_oferta);
                const pOrig = formateador.format(record.precio_original);
                
                // Psicología: Calcular porcentaje de ahorro para impacto
                const ahorro = Math.round(((record.precio_original - record.precio_oferta) / record.precio_original) * 100);
                const tagAhorro = ahorro > 5 ? `📉 *¡${ahorro}% de DESCUENTO!*` : `🔥 *¡PRECIO ESPECIAL!*`;

                const hashtag = `#${record.producto.split(' ')[0].replace(/[^a-zA-Z]/g, '')}`;
                
                // --- 📝 TELEGRAM: Elegante y Persuasivo ---
                const mensajeTG = `${tagAhorro}\n\n📦 *${record.producto}*\n\n❌ Antes: ~${pOrig}~\n✅ *Hoy solo: ${pOf}*\n\n🛒 *ADQUIÉRELO AQUÍ:* ${record.link_afiliado}\n\n—\n📢 *Genesys Digital* | ${hashtag} #Ofertas`;

                // --- 📝 FACEBOOK: Compacto y Profesional ---
                // Aquí usamos el link de Telegram como invitación VIP
                const mensajeFB = `🔥 ${record.producto}\n\n💰 Precio: ${pOf} (Antes: ${pOrig})\n🛒 Cómpralo aquí: ${record.link_afiliado}\n\n✨ Únete a nuestro canal VIP para ofertas exclusivas:\n👉 https://t.me/ofertas_mercado_libre_mexico\n\n${hashtag} #MercadoLibre #Ahorro`;

                // DISPAROS
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                    chat_id: process.env.TELEGRAM_CHAT_ID, photo: record.imagen_url, caption: mensajeTG, parse_mode: 'Markdown'
                });

                await axios.post(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`, {
                    url: record.imagen_url, message: mensajeFB, access_token: process.env.FB_PAGE_TOKEN
                });

                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                await sleep(5000);
            } catch (e) { console.error("Error publicando:", e.message); }
        }
    } catch (e) { console.error("Error crítico:", e.message); }
}

module.exports = { enviarOfertasAprobadas };