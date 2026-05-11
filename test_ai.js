require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function diagnostic() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("❌ No GEMINI_API_KEY found in .env file!");
        return;
    }

    console.log("🔍 Checking API Key and listing available models...");
    const genAI = new GoogleGenerativeAI(key);

    try {
        // We use the v1 API to list models
        const modelList = await genAI.getGenerativeModel({ model: "gemini-pro" }); // placeholder to get the object
        
        // Use the native fetch or the SDK's internal mechanisms to list
        // Note: SDK 0.11.0 might not have a direct listModels, so we'll try a few common ones
        const modelsToTest = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"];
        
        console.log("\n🧪 Testing model connectivity:");
        for (const modelName of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Say 'Model " + modelName + " is working!'");
                console.log(`✅ ${modelName}: SUCCESS -> "${result.response.text().trim()}"`);
            } catch (e) {
                console.log(`❌ ${modelName}: FAILED (${e.message.split('\n')[0]})`);
            }
        }

    } catch (err) {
        console.error("💥 Critical Error during diagnostic:", err.message);
    }
}

diagnostic();
