require('dotenv').config();
const https = require('https');

async function listModelsRaw() {
    const key = process.env.GEMINI_API_KEY;
    console.log("📡 Fetching available models list directly from Google...");

    const url = `https://generativelanguage.googleapis.com/v1/models?key=${key}`;

    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            const result = JSON.parse(data);
            if (result.error) {
                console.error("❌ API Error:", result.error.message);
                if (result.error.status === "PERMISSION_DENIED") {
                    console.log("👉 Suggestion: Go to Google AI Studio and ensure your API key is active.");
                }
            } else if (result.models) {
                console.log("✅ Available Models found:");
                result.models.forEach(m => console.log(` - ${m.name.split('/').pop()}`));
            } else {
                console.log("❓ No models returned. This key might not have Generative Language permissions.");
            }
        });
    }).on('error', (err) => {
        console.error("💥 Connection Error:", err.message);
    });
}

listModelsRaw();
