const express = require('express');
const cron = require('node-cron');
const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Ruta HTTP de salud (Evita que Render marque error de puerto)
app.get('/', (req, res) => {
    res.send('🤖 Motor de Afiliados Activo y Operando 24/7');
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor inicializado en el puerto ${PORT}`);
    console.log("⚙️ Cron jobs programados e iniciando...");

    // 2. Programamos el Scraper para buscar ofertas (ej. cada 45 minutos)
    cron.schedule('*/45 * * * *', async () => {
        console.log("⏱️ Ejecutando búsqueda automática de ofertas...");
        await runScraper();
    });

    // 3. Programamos el Publicador para Telegram (ej. cada hora, en el minuto 0)
    cron.schedule('0 * * * *', async () => {
        console.log("⏱️ Ejecutando publicación en Telegram...");
        await enviarOfertasAprobadas();
    });

    // 4. Ejecución inicial de arranque
    runScraper().then(() => {
        setTimeout(enviarOfertasAprobadas, 10000); // Publica 10 segs después de buscar
    });
});