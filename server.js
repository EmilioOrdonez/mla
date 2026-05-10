const express = require('express');
const { runScraper } = require('./index');
const { enviarOfertasAprobadas } = require('./publicador');

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta principal de salud
app.get('/', (req, res) => {
    res.send('🤖 Motor de Afiliados Activo y Operando');
});

// 🟢 ENDPOINT 1: Disparador del Scraper (Buscador)
app.get('/api/buscar', (req, res) => {
    // Respondemos de inmediato con status 200 para que el que llama no se quede esperando
    res.status(200).send('Búsqueda iniciada en segundo plano.');
    console.log("⏱️ Búsqueda disparada vía Webhook...");
    runScraper();
});

// 🟢 ENDPOINT 2: Disparador del Publicador (Telegram)
app.get('/api/publicar', (req, res) => {
    res.status(200).send('Publicador iniciado en segundo plano.');
    console.log("⏱️ Publicación disparada vía Webhook...");
    enviarOfertasAprobadas();
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor Webhook inicializado en el puerto ${PORT}`);
});