const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const { DeepgramClient } = require('@deepgram/sdk');
const Groq = require('groq-sdk');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY || '';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const groq = new Groq({ apiKey: GROQ_API_KEY });
const deepgram = new DeepgramClient(DEEPGRAM_API_KEY);

// --- Logger Setup (Structured & Readable) ---
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        // Colorized, structured terminal output for DEV
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, requestId, latency, ...meta }) => {
                    const idTag = requestId ? `[${requestId.split('-')[0]}]` : '';
                    const latencyTag = latency ? ` (${latency}ms)` : '';
                    const metaData = Object.keys(meta).length ? `\n   ${JSON.stringify(meta)}` : '';
                    return `${timestamp} ${level}: ${idTag} ${message}${latencyTag}${metaData}`;
                })
            )
        }),
        // Persistent JSON logs for PROD analysis
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// --- Simple Persistence Helper ---
const DB_PATH = path.join(__dirname, 'database.json');
function getDb() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
        return [];
    }
}
function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const app = express();

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity with external APIs in demo, enable in strict prod
}));
app.use(cors());
app.use(express.json());

// --- Rate Limiting (Prevent API Abuse) ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// --- Request ID & Logging Middleware ---
app.use((req, res, next) => {
    req.id = uuidv4();
    const startTime = Date.now();
    res.on('finish', () => {
        const latency = Date.now() - startTime;
        logger.info('Request Processed', { 
            id: req.id, 
            method: req.method, 
            url: req.url, 
            statusCode: res.statusCode,
            latency 
        });
    });
    next();
});

// --- Validation Schemas ---
const brainSchema = Joi.object({
    text: Joi.string().required().max(1000),
    monster: Joi.string().valid('toby', 'glitch', 'ember').default('toby'),
    session_id: Joi.string().required()
});

const ttsSchema = Joi.object({
    text: Joi.string().required().max(5000),
    monster: Joi.string().valid('toby', 'glitch', 'ember').default('toby')
});

// --- Endpoints ---

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date() });
});

// Events Retrieval
app.get('/api/events', (req, res) => {
    res.json(getDb());
});

// AI Brain Endpoint
app.post('/api/brain', async (req, res) => {
    const { error, value } = brainSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { text, monster, session_id } = value;
    const startTime = Date.now();

    try {
        if (!GROQ_API_KEY) {
            logger.warn('Groq API Key Missing', { requestId: req.id });
            return res.json({ response: "Missing Groq API Key. Check .env", action: null });
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are ${monster}, a witty office assistant. 
                    RULES:
                    1. Return valid JSON only.
                    2. Include 'thinking' (internal monologue), 'response' (spoken reply), and 'action' (null or object).`
                },
                { role: "user", content: text }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        let aiData;
        try {
            aiData = JSON.parse(chatCompletion.choices[0].message.content);
            logger.info('Groq Brain Success', { requestId: req.id, latency: Date.now() - startTime });
        } catch (aiErr) {
            logger.error('Groq Brain Error', { requestId: req.id, error: aiErr.message });
            aiData = { thinking: "Fallback engaged", response: "I'm processing that for you.", action: null };
        }

        if (aiData.action) {
            const db = getDb();
            const newEvent = { ...aiData.action, time: new Date(), id: uuidv4() };
            db.unshift(newEvent);
            saveDb(db);
            triggerN8N(aiData.action, session_id, monster, req.id);
        }

        res.json(aiData);
    } catch (err) {
        logger.error('Critical Brain Error', { requestId: req.id, error: err.message });
        res.status(500).json({ error: 'Internal Brain Error' });
    }
});

// Deepgram TTS Proxy
app.post('/api/tts', async (req, res) => {
    const { error, value } = ttsSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { text, monster } = value;
    
    // Voice mapping for Deepgram Aura
    const voiceMap = { 
        toby: 'aura-asteria-en', 
        glitch: 'aura-zeus-en', 
        ember: 'aura-stella-en' 
    };
    const voiceId = voiceMap[monster] || voiceMap.toby;
    
    const ttsUrl = `https://api.deepgram.com/v1/speak?model=${voiceId}`;

    const ttsReq = https.request(ttsUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${DEEPGRAM_API_KEY}`
        }
    }, (ttsRes) => {
        if (ttsRes.statusCode !== 200) {
            let errorData = '';
            ttsRes.on('data', chunk => errorData += chunk);
            ttsRes.on('end', () => {
                logger.error('Deepgram TTS Error', { requestId: req.id, statusCode: ttsRes.statusCode, body: errorData });
            });
        }
        res.writeHead(ttsRes.statusCode, { 'Content-Type': 'audio/mpeg' });
        ttsRes.pipe(res);
    });

    ttsReq.on('error', (e) => {
        logger.error('TTS Connection Error', { requestId: req.id, error: e.message });
        res.status(500).end();
    });

    ttsReq.write(JSON.stringify({ text }));
    ttsReq.end();
});

// Helper: Trigger n8n
function triggerN8N(action, sessionId, monster, requestId) {
    const n8nUrl = 'https://neo4j.app.n8n.cloud/webhook-test/customer-support';
    const data = JSON.stringify({ channel: 'voice_action', session_id: sessionId, monster, action, requestId });

    const req = https.request(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
        logger.info('n8n Triggered', { requestId, statusCode: res.statusCode });
    });

    req.on('error', (e) => logger.error('n8n Trigger Error', { requestId, error: e.message }));
    req.write(data);
    req.end();
}

// Serve Static Frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Fallback to index.html for SPA behavior
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const server = app.listen(PORT, () => {
    logger.info(`AgentVoice Production Server Running`, { port: PORT, env: process.env.NODE_ENV || 'development' });
});

// --- NEW: Deepgram Streaming WebSocket Server ---
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    logger.info('WebSocket connection established for streaming');
    let dgConnection;

    ws.on('message', async (message) => {
        // Ensure message is string for JSON check
        const messageStr = message.toString();
        
        try {
            const data = JSON.parse(messageStr);
            if (data.type === 'start') {
                logger.info('Starting Deepgram Live Stream');
                dgConnection = await deepgram.listen.v1.connect({
                    model: 'nova-2',
                    smart_format: true,
                    interim_results: true,
                    language: 'en-US',
                });

                dgConnection.on('Open', () => {
                    logger.info('Deepgram connection opened');
                    ws.send(JSON.stringify({ type: 'ready' }));
                });

                dgConnection.on('Results', (data) => {
                    const transcript = data.channel.alternatives[0].transcript;
                    if (transcript) {
                        ws.send(JSON.stringify({
                            type: 'transcript',
                            text: transcript,
                            isFinal: data.is_final
                        }));
                    }
                });

                dgConnection.on('Error', (err) => {
                    logger.error('Deepgram Error', { error: err.message });
                });

                dgConnection.on('Close', () => {
                    logger.info('Deepgram connection closed');
                });
            }
        } catch (err) {
            // Forward raw audio binary to Deepgram (if not JSON control message)
            if (dgConnection && dgConnection.socket && dgConnection.socket.readyState === 1) {
                dgConnection.socket.send(message);
            }
        }
    });

    ws.on('close', () => {
        if (dgConnection) dgConnection.socket.close();
        logger.info('WebSocket connection closed');
    });
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully.');
    server.close(() => {
        logger.info('Process terminated.');
        process.exit(0);
    });
});
