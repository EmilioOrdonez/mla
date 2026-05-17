// servicios.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Evitamos que la app colapse si olvidaste poner la llave de Groq en Render
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;


// ✅ Motor de acortado con REDUNDANCIA (Alta Disponibilidad)
async function acortarLink(urlLarga) {
    try {
        // Intento 1: is.gd (Prioridad por redirección rápida)
        const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(urlLarga)}`, { timeout: 8000 });
        if (res.data && res.data.startsWith('http')) return res.data.trim();
        throw new Error("Respuesta de is.gd no válida");
    } catch (e) { 
        // 📡 EL DETECTIVE: Por fin veremos por qué falló
        console.log(`⚠️ is.gd falló (${e.message}). Activando acortador de respaldo...`);
        
        try {
            // Intento 2: El Plan B (TinyURL)
            const res2 = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(urlLarga)}`, { timeout: 8000 });
            if (res2.data && res2.data.startsWith('http')) return res2.data.trim();
            return urlLarga;
        } catch (e2) {
            console.error(`❌ Ambos acortadores fallaron. Usando URL larga como último recurso.`);
            return urlLarga; 
        }
    }
}






// 🛟 RESPALDO EN LOTES (GROQ)
async function respaldoGroqBatch(titulos) {
    console.log("🛟 [FALLBACK] Activando Groq (Llama-3.1) al rescate...");
    if (!groq) {
        console.error("❌ Groq ignorado: No se encontró GROQ_API_KEY en Render.");
        return titulos.map(() => ({ seguro_para_fb: true, frase: "¡Oferta increíble! ⚡", hashtags: "#Ofertas #MercadoLibre" }));
    }

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "Eres un API que devuelve EXCLUSIVAMENTE JSON. No uses markdown. No saludes. No des explicaciones."
                },
                { 
                    role: "user", 
                    content: `Analiza esta lista:
                    ${titulos.map((t, i) => `${i + 1}. ${t}`).join('\n')}
                    Devuelve UN ARREGLO JSON EXACTO con esta estructura por cada producto:
                    [{"seguro_para_fb": true, "frase": "frase corta", "hashtags": "#Tag1 #Tag2"}]
                    Si detectas medicamento/alcohol/tabaco, marca seguro_para_fb como false.` 
                }
            ],
            model: "llama-3.1-8b-instant", // 👈 MODELO ACTUALIZADO
            temperature: 0.1, 
        });
        
        let jsonString = chatCompletion.choices[0]?.message?.content.trim();
        jsonString = jsonString.replace(/^```(json)?/gi, '').replace(/```$/gi, '').trim();
        
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("❌ Error real en Groq Batch:", error.message || error);
        return titulos.map(() => ({ seguro_para_fb: true, frase: "¡Oferta increíble! ⚡", hashtags: "#Ofertas #MercadoLibre" }));
    }
}

// 🧠 IA PRINCIPAL EN LOTES (GEMINI)
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
        if (e.message.includes("429") || e.message.includes("Quota")) {
            console.log("🚦 Gemini llegó a su límite (429). Solicitando relevo a Groq...");
            return await respaldoGroqBatch(titulos);
        }
        console.error("⚠️ Error desconocido en Gemini:", e.message);
        return titulos.map(() => ({ seguro_para_fb: true, frase: "¡Oferta increíble! ⚡", hashtags: "#Ofertas #MercadoLibre" }));
    }
}

// 🛟 RESPALDO INDIVIDUAL (GROQ)
async function respaldoGroqIndividual(titulo) {
    if (!groq) return { seguro_para_fb: true, frase: "¡Adquiérelo ya! 🚀", hashtags: "#Oferta #Compras" };

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You output pure JSON arrays or objects only." },
                { role: "user", content: `Analiza: "${titulo}". Genera EXACTAMENTE: {"seguro_para_fb": true, "frase": "frase", "hashtags": "#tag"}.` }
            ],
            model: "llama-3.1-8b-instant", // 👈 MODELO ACTUALIZADO
            temperature: 0.1,
        });
        let jsonString = chatCompletion.choices[0]?.message?.content.replace(/^```(json)?/gi, '').replace(/```$/gi, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("❌ Error real en Groq Individual:", error.message || error);
        return { seguro_para_fb: true, frase: "¡Adquiérelo ya! 🚀", hashtags: "#Oferta #Compras" };
    }
}

// 🧠 IA PRINCIPAL INDIVIDUAL (GEMINI)
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