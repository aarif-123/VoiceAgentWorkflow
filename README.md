# 🎙️ AgentVoice: Enterprise AI Voice Agent

> **Production-Ready Voice Intelligence with Zero Latency & Multi-Modal Brain**  
> AgentVoice is a high-performance, voice-driven AI assistant designed for customer support and office automation. It leverages **Groq (Llama 3.3 70B)** for reasoning, **Deepgram Nova-2** for real-time STT, and **Deepgram Aura** for neural TTS.

---

## 🚀 Key Features

### 🧠 Advanced AI Brain
- **Groq Llama 3.3 70B**: Lightning-fast reasoning and structured JSON output.
- **Thinking Mode**: Internal monologue for complex reasoning before responding.
- **Action Engine**: Triggers real-world workflows (Webhooks/n8n) based on user intent.

### 🎤 Real-Time Voice Processing
- **Deepgram Nova-2 STT**: ultra-low latency speech-to-text via WebSockets.
- **Deepgram Aura TTS**: Human-like neural text-to-speech with multiple personas (Toby, Glitch, Ember).
- **Interim Results**: Immediate transcript feedback in the UI for a "live" feel.

### 🛡️ Production-Grade Architecture
- **Express.js Backend**: Robust API with Joi validation and rate limiting.
- **Observability Layer**: 
  - Structured logging with **Winston** (Request IDs, Latency Tracking).
  - Health check endpoint (`/api/health`) for monitoring.
- **Security Suite**: **Helmet.js** and **CORS** pre-configured for safe deployments.
- **Persistence**: File-based JSON storage for event tracking and session continuity.

### 🔗 Workflow Integration
- **n8n Webhooks**: Native support for triggering external automation workflows.
- **PM2 Ready**: Includes `ecosystem.config.js` for clustering and auto-restarts.

---

## 🛠 Tech Stack

| Component | Technology |
|---|---|
| **Backend** | Node.js, Express, Winston, Helmet, Joi |
| **Reasoning** | Groq (Llama 3.3 70B) |
| **Speech-to-Text** | Deepgram Nova-2 (WebSocket) |
| **Text-to-Speech** | Deepgram Aura (REST) |
| **Automation** | n8n Webhooks |
| **Process Management** | PM2 |

---

## 📦 Setup & Deployment

### 1. Prerequisites
- Node.js v18+
- Groq API Key
- Deepgram API Key

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root:
```env
PORT=3000
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
```

### 4. Running the Application

**Development Mode:**
```bash
npm run dev
```

**Production Mode (PM2):**
```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
```

---

## 📈 Observability & Logs

Logs are stored in the `/logs` directory:
- `combined.log`: All system events and metadata.
- `error.log`: Critical failures and stack traces.

Check the health status:
`GET http://localhost:3000/api/health`

---

## 📂 Project Structure

```
AgentVoice/
├── backend/
│   ├── index.js          # Core Express & WebSocket Server
│   └── database.json     # Local persistence
├── frontend/
│   ├── index.html        # UI Entry
│   ├── script.js         # Voice & Audio Logic
│   └── style.css         # Modern Glassmorphism Design
├── logs/                 # Auto-generated system logs
└── ecosystem.config.js   # PM2 configuration
```

---

## 📄 License

MIT License. Built with ❤️ for the AI community.
