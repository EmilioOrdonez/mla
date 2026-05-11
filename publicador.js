const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function enviarOfertasAprobadas() {
    console.log("🔍 Revisando cola de publicaciones en Supabase...");

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
                // Validación de seguridad: Si no hay imagen, usamos un placeholder para que Telegram no rechace el post
                const foto = record.imagen_url && record.imagen_url.startsWith('http') 
                    ? record.imagen_url 
                    : "https://via.placeholder.com/800x450.png?text=Oferta+Sin+Imagen";

                const formateador = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                const precioOf = formateador.format(record.precio_oferta);
                const precioOrig = formateador.format(record.precio_original);
                
                let textoPrecio = `✅ *Precio Especial: ${precioOf}*`;
                if (record.precio_original > record.precio_oferta) {
                    textoPrecio = `❌ Antes: ~${precioOrig}~\n✅ *Ahora: ${precioOf}*`;
                }

                const mensaje = `🔥 *¡OFERTA DETECTADA!* 🔥\n\n📦 *${record.producto}*\n\n${textoPrecio}\n\n🛒 *Cómpralo aquí:* [Enlace de Compra](${record.link_afiliado})\n\n—\n📢 *Genesys Digital - Ofertas*`;

                // Intento de envío a Telegram
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                    chat_id: process.env.TELEGRAM_CHAT_ID,
                    photo: foto,
                    caption: mensaje,
                    parse_mode: 'Markdown'
                });

                // Si llegamos aquí, el envío fue exitoso. Marcamos como enviado.
                await supabase.from('ofertas').update({ enviado: true }).eq('id', record.id);
                console.log(`✅ Publicado con éxito: ${record.producto}`);

                // Pausa anti-spam de 3 segundos
                await sleep(3000);

            } catch (innerError) {
                // Si este producto falló, lo marcamos para que no trabe a los demás
                console.error(`⚠️ Error al publicar "${record.producto}": ${innerError.message}`);
                // Opcional: Podrías marcarlo como 'Error' en Supabase para revisarlo luego
                continue; 
            }
        }
    } catch (error) {
        console.error("❌ Error crítico en el publicador:", error.message);
    }
}

module.exports = { enviarOfertasAprobadas };