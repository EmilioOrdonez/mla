const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializamos Supabase en el servidor para el guardado manual
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middlewares necesarios para que Express pueda leer los datos del formulario web
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🟢 ENDPOINT PRINCIPAL: Interfaz visual (Formulario)
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
            <h2>⚙️ Admin: Ingreso Manual de Ofertas</h2>
            <p>Pega aquí el link corto (meli.la) o largo de Mercado Libre:</p>
            <form action="/api/manual" method="POST" style="display: flex; gap: 10px;">
                <input type="text" name="url" placeholder="https://meli.la/..." style="flex: 1; padding: 8px;" required>
                <button type="submit" style="padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Guardar</button>
            </form>
        </div>
    `);
});

// 🟢 ENDPOINT POST: Procesador del formulario (Tu código)
app.post('/api/manual', async (req, res) => {
    const shortUrl = req.body.url;
    try {
        console.log(`🔗 Procesando link manual: ${shortUrl}`);
        // 1. Expandir la URL (Seguir el redireccionamiento)
        const response = await axios.get(shortUrl, { maxRedirects: 5 });
        const realUrl = response.request.res.responseUrl.split('?')[0];

        // 2. Scrapear datos mínimos de esa página específica
        const $ = cheerio.load(response.data);
        const titulo = $('.ui-pdp-title').text().trim() || "Producto Manual";
        const precio = $('.andes-money-amount__fraction').first().text().replace(/,/g, '');
        const imagen = $('.ui-pdp-image').first().attr('src');

        // 3. Guardar en Supabase
        const { error } = await supabase.from('ofertas').upsert({
            producto: titulo,
            precio_oferta: parseFloat(precio),
            link_original: realUrl,
            link_afiliado: `${realUrl}?matt_tool=${process.env.ML_MATT_TOOL}&matt_word=${process.env.ML_MATT_WORD}`,
            imagen_url: imagen,
            status: 'Aprobado'
        }, { onConflict: 'link_original' });

        if (error) throw error;
        res.send(`<h3 style="color: green;">✅ Oferta añadida con éxito.</h3><p>${titulo}</p><a href="/">Volver</a>`);
    } catch (error) {
        res.status(500).send(`<h3 style="color: red;">❌ Error al procesar el link:</h3><p>${error.message}</p><a href="/">Volver</a>`);
    }
});

// 🟢 ENDPOINT: Disparador del Scraper
app.get('/api/buscar', (req, res) => {
    res.status(200).send('Búsqueda iniciada en segundo plano.');
    console.log("⏱️ Búsqueda disparada vía Webhook...");
    runScraper();
});

// 🟢 ENDPOINT: Disparador del Publicador (Telegram)
app.get('/api/publicar', (req, res) => {
    res.status(200).send('Publicador iniciado en segundo plano.');
    console.log("⏱️ Publicación disparada vía Webhook...");
    enviarOfertasAprobadas();
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor Webhook inicializado en el puerto ${PORT}`);
});