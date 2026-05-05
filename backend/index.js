const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
};

const server = http.createServer((req, res) => {
    // Add CORS headers for development flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API Proxy for n8n
    if (req.url === '/api/voice' && req.method === 'POST') {
        const n8nUrl = 'https://aarif01.app.n8n.cloud/webhook/customer-support';
        
        const proxyHeaders = { ...req.headers };
        delete proxyHeaders['host'];
        delete proxyHeaders['origin'];
        delete proxyHeaders['referer'];

        const proxyReq = https.request(n8nUrl, {
            method: 'POST',
            headers: { ...proxyHeaders, 'host': 'aarif01.app.n8n.cloud' }
        }, (proxyRes) => {
            const responseHeaders = { ...proxyRes.headers };
            responseHeaders['Access-Control-Allow-Origin'] = '*';
            res.writeHead(proxyRes.statusCode, responseHeaders);
            proxyRes.pipe(res);
        });

        req.pipe(proxyReq);
        proxyReq.on('error', (e) => {
            console.error('Proxy Error:', e);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Proxy Error', details: e.message }));
        });
        return;
    }

    // ElevenLabs TTS Endpoint
    if (req.url === '/api/tts' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { text, monster } = JSON.parse(body);
            
            // USER: Replace with your ElevenLabs API Key
            const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY || 'sk_7ad4e73263c5bde6ce1f3b3ed4ad42cdea472d0999ca89ca';
            
            // Map monsters to ElevenLabs Voice IDs
            const voiceMap = {
                toby: 'pNInz6obpg8nEmeWscDJ', // Example: Liam
                glitch: 'N2lVS1w4EtoT3dr4eOWO', // Example: Callum
                ember: 'MF3mGyEYCl7XYW7Lec9P'  // Example: Alice
            };

            const voiceId = voiceMap[monster] || voiceMap.toby;
            const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

            const ttsReq = https.request(ttsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVEN_LABS_API_KEY
                }
            }, (ttsRes) => {
                res.writeHead(ttsRes.statusCode, { 
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*'
                });
                ttsRes.pipe(res);
            });

            ttsReq.write(JSON.stringify({
                text: text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: { stability: 0.5, similarity_boost: 0.5 }
            }));
            ttsReq.end();
            
            ttsReq.on('error', (e) => {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'TTS Error', details: e.message }));
            });
        });
        return;
    }

    let filePath = req.url === '/' ? '/index.html' : req.url;
    
    // Serve from frontend folder
    const fullPath = path.join(__dirname, '..', 'frontend', filePath);
    
    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('500 Internal Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('MythicVoice Dashboard running at http://localhost:' + PORT);
    console.log('Serving frontend from: ' + path.join(__dirname, '..', 'frontend'));
});
