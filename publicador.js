const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ⏱️ Función para crear pausas en el código
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function enviarOfertasAprobadas() {
    console.log("🔍 Buscando registros para publicar en Telegram...");

    try {
        const { data: records, error } = await supabase
            .from('ofertas')
            .select('*')
            .eq('status', 'Aprobado')
            .eq('enviado', false);

        if (error) throw error;
        if (!records || records.length === 0) return console.log("⏳ Sin novedades.");

        for (const record of records) {
            const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
            const precioFormateado = formateador.format(record.precio_oferta);
            
            let textoPrecio = `💰 Precio: *${precioFormateado}*`;
            if (record.precio_original > record.precio_oferta) {
                textoPrecio = `❌ Antes: ~${formateador.format(record.precio_original)}~\n✅ *Ahora: ${precioFormateado}*`;
            }

            const mensaje = `🔥 *¡OFERTA DETECTADA!* 🔥\n\n📦 *${record.producto}*\n\n${textoPrecio}\n\n🛒 *Cómpralo aquí:* [Enlace de Compra](${record.link_afiliado})\n\n—\n📢 *Síguenos en Telegram:*\n👉 [t.me/ofertas\\_mercado\\_libre\\_mexico](https://t.me/ofertas_mercado_libre_mexico)`;

            await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                chat_id: process.env.TELEGRAM_CHAT_ID,
                photo: record.imagen_url,
                caption: mensaje,
                parse_mode: 'Markdown'
            });

            await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
            console.log(`✅ Publicado: ${record.producto}`);

            await sleep(5000);
        }
        console.log("✅ Ronda de publicaciones terminada exitosamente.");
    } catch (error) {
        console.error("❌ Error de publicación:", error.message);
    }
}
module.exports = { enviarOfertasAprobadas };