// servicios.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Motor de acortado centralizado (is.gd)
async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data.trim() : urlLarga;
    } catch (e) { return urlLarga; }
}

// 🧠 IA Moderadora (Para el proceso automático en lotes)
async function generarMarketingIABatch(titulos) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Eres un copywriter experto y moderador de políticas de Facebook. Analiza esta lista:
        ${titulos.map((t, i) => `${i + 1}. ${t}`).join('\n')}
        Para cada uno devuelve un JSON: {"seguro_para_fb": bool, "frase": "...", "hashtags": "#Tag1 #Tag2"}. 
        Si es medicamento/alcohol/tabaco, seguro_para_fb es false. Solo JSON puro.`;
        
        const result = await model.generateContent(prompt);
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString); 
    } catch (e) {
        return titulos.map(() => ({ seguro_para_fb: true, frase: "¡Oferta increíble! ⚡", hashtags: "#Ofertas #MercadoLibre" }));
    }
}

// 🧠 IA Individual (Para el proceso manual)
async function generarMarketingIA(titulo) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Analiza: "${titulo}". Genera JSON: {"seguro_para_fb": bool, "frase": "...", "hashtags": "#Tag1 #Tag2"}. No medicamentos/alcohol.`;
        const result = await model.generateContent(prompt);
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        return { seguro_para_fb: true, frase: "¡Adquiérelo ya! 🚀", hashtags: "#Oferta #Compras" };
    }
}

// 🛡️ Filtro de Lista Negra
async function esProductoPermitido(titulo) {
    try {
        const { data: exclusiones } = await supabase.from('exclusiones_facebook').select('termino').eq('activo', true);
        if (!exclusiones) return true;
        const tituloMinus = titulo.toLowerCase();
        return !exclusiones.find(e => tituloMinus.includes(e.termino.toLowerCase()));
    } catch (e) { return true; }
}

function mezclarArreglo(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = { 
    supabase, acortarLink, generarMarketingIABatch, 
    generarMarketingIA, esProductoPermitido, mezclarArreglo 
};