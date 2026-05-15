// servicios.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk"); // 👈 NUEVO: El escudero de Gemini
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); // 👈 Inicializamos Groq

// ✅ Motor de acortado centralizado (is.gd)
async function acortarLink(urlLarga) {
    try {
        const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(urlLarga)}`, { timeout: 10000 });
        return (res.data && res.data.startsWith('http')) ? res.data.trim() : urlLarga;
    } catch (e) { return urlLarga; }
}

// 🛟 EL RESPALDO: Groq usando Llama-3 para procesar en lote
async function respaldoGroqBatch(titulos) {
    console.log("🛟 [FALLBACK] Activando Groq (Llama-3) al rescate...");
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ 
                role: "user", 
                content: `Eres un copywriter y moderador de políticas de Facebook. Analiza esta lista:
                ${titulos.map((t, i) => `${i + 1}. ${t}`).join('\n')}
                Para cada uno devuelve un JSON: {"seguro_para_fb": bool, "frase": "...", "hashtags": "#Tag1 #Tag2"}. 
                Si es medicamento/alcohol/tabaco, seguro_para_fb es false. Devuelve ÚNICAMENTE un arreglo JSON puro, sin formato markdown.` 
            }],
            model: "llama3-8b-8192", // Modelo ultra rápido
            temperature: 0.5,
        });
        
        const jsonString = chatCompletion.choices[0]?.message?.content.replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("❌ Fallo general. Groq tampoco pudo responder.");
        return titulos.map(() => ({ seguro_para_fb: true, frase: "¡Oferta increíble! ⚡", hashtags: "#Ofertas #MercadoLibre" }));
    }
}

// 🧠 IA Moderadora (GEMINI COMO TITULAR)
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
        // 🚦 Si Gemini choca con el límite 429, pasamos el relevo
        if (e.message.includes("429") || e.message.includes("Quota")) {
            console.log("🚦 Gemini llegó a su límite de cuota (429).");
            return await respaldoGroqBatch(titulos);
        }
        console.error("⚠️ Error desconocido en Gemini:", e.message);
        return titulos.map(() => ({ seguro_para_fb: true, frase: "¡Oferta increíble! ⚡", hashtags: "#Ofertas #MercadoLibre" }));
    }
}

// 🛟 EL RESPALDO INDIVIDUAL: Para cargas manuales
async function respaldoGroqIndividual(titulo) {
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: `Analiza: "${titulo}". Genera JSON: {"seguro_para_fb": bool, "frase": "...", "hashtags": "#Tag1"}. No medicamentos/alcohol.` }],
            model: "llama3-8b-8192",
            temperature: 0.5,
        });
        const jsonString = chatCompletion.choices[0]?.message?.content.replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        return { seguro_para_fb: true, frase: "¡Adquiérelo ya! 🚀", hashtags: "#Oferta #Compras" };
    }
}

// 🧠 IA Individual (GEMINI TITULAR)
async function generarMarketingIA(titulo) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Analiza: "${titulo}". Genera JSON: {"seguro_para_fb": bool, "frase": "...", "hashtags": "#Tag1 #Tag2"}. No medicamentos/alcohol.`;
        const result = await model.generateContent(prompt);
        const jsonString = result.response.text().replace(/```(json)?/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        if (e.message.includes("429") || e.message.includes("Quota")) {
            return await respaldoGroqIndividual(titulo);
        }
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