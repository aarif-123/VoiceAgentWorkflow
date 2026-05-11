document.addEventListener('DOMContentLoaded', () => {
    const voiceBtn = document.getElementById('voiceBtn');
    const captureBtn = document.getElementById('captureBtn');
    const captureLabel = document.getElementById('captureLabel');
    const transcriptText = document.getElementById('transcriptText');
    const pupils = document.querySelectorAll('.pupil');
    const canvas = document.getElementById('audioVisualizer');
    const ctx = canvas.getContext('2d');
    const characterCards = document.querySelectorAll('.character-card');
    const searchInput = document.querySelector('.search-bar input');
    const manualInput = document.getElementById('manualInput');
    const sendManualBtn = document.getElementById('sendManualBtn');
    
    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    let audioContext;
    let analyser;
    let dataArray;
    let source;
    let animationId;
    let socket;
    let liveTranscript = '';

    // Initialize Web Audio API for Real Visualizer
    async function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = sendAudioToN8N;
            return true;
        } catch (err) {
            console.error("Microphone access denied:", err);
            transcriptText.innerText = "Error: Microphone access denied.";
            return false;
        }
    }

    // Resize Visualizer
    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Eye Tracking Logic
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;

        pupils.forEach(pupil => {
            const moveX = (x - 50) / 6;
            const moveY = (y - 50) / 6;
            pupil.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
        });
    });

    // Real Audio Visualizer
    function drawVisualizer() {
        if (!isRecording) return;
        
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const bars = dataArray.length;
        const radius = 115;

        for (let i = 0; i < bars; i++) {
            const angle = (i / bars) * Math.PI * 2;
            const barHeight = (dataArray[i] / 255) * 80;
            
            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = `hsl(${280 + (i * 2)}, 100%, 50%)`;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        
        animationId = requestAnimationFrame(drawVisualizer);
    }

    // Toggle Recording
    // Session Management
    function generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9);
    }

    let recognition;
    let isSpeaking = false;

    // Initialize Speech Recognition
    function initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported in this browser.");
            return null;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (interimTranscript || finalTranscript) {
                transcriptText.innerText = finalTranscript || interimTranscript;
                transcriptText.classList.remove('placeholder');
            }
        };

        recognition.onerror = (event) => {
            console.error("Recognition error:", event.error);
            if (isRecording) toggleRecording();
        };

        return recognition;
    }

    async function toggleRecording() {
        if (!mediaRecorder) {
            const success = await initAudio();
            if (!success) return;
        }

        isRecording = !isRecording;
        
        if (isRecording) {
            // Setup WebSocket for Streaming
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(`${protocol}//${window.location.host}`);
            
            socket.onopen = () => {
                socket.send(JSON.stringify({ type: 'start' }));
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'ready') {
                    mediaRecorder.start(100); // Send chunks every 100ms
                } else if (data.type === 'transcript') {
                    if (data.isFinal) {
                        liveTranscript += ' ' + data.text;
                    }
                    transcriptText.innerText = liveTranscript + (data.isFinal ? '' : ' ' + data.text);
                    transcriptText.classList.remove('placeholder');
                }
            };

            liveTranscript = '';
            voiceBtn.classList.add('recording');
            captureBtn.classList.add('active');
            captureLabel.innerText = "Stop";
            transcriptText.innerText = "Listening with Deepgram...";
            transcriptText.classList.remove('placeholder');
            if (audioContext.state === 'suspended') audioContext.resume();
            drawVisualizer();
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                    socket.send(event.data);
                }
            };
        } else {
            mediaRecorder.stop();
            if (socket) socket.close();
            
            voiceBtn.classList.remove('recording');
            captureBtn.classList.add('thinking'); // Added a thinking state
            captureBtn.classList.remove('active');
            captureLabel.innerText = "Capture";
            
            const finalSpeech = transcriptText.innerText;
            if (finalSpeech && !finalSpeech.includes("Listening...")) {
                showThoughts(true);
                updateThoughtStep('think', 'active');
                transcriptText.innerText = "Toby is processing...";
                sendTextToBrain(finalSpeech);
            } else {
                transcriptText.innerText = "Toby didn't catch that.";
            }
            
            cancelAnimationFrame(animationId);
        }
    }

    function showThoughts(show) {
        const panel = document.getElementById('thoughtPanel');
        if (show) {
            panel.classList.remove('hidden');
            document.querySelectorAll('.thought-step').forEach(s => s.classList.remove('active', 'completed'));
        } else {
            panel.classList.add('hidden');
        }
    }

    function updateThoughtStep(stepId, state) {
        const step = document.getElementById('step' + stepId.charAt(0).toUpperCase() + stepId.slice(1));
        if (state === 'active') {
            step.classList.add('active');
            step.classList.remove('completed');
        } else if (state === 'completed') {
            step.classList.remove('active');
            step.classList.add('completed');
        }
    }

    async function sendTextToBrain(text) {
        const activeMonster = document.querySelector('.character-card.active').dataset.monster;
        
        try {
            const response = await fetch('/api/brain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: text, 
                    monster: activeMonster,
                    session_id: generateSessionId()
                })
            });

            if (!response.ok) throw new Error('Brain request failed');

            const data = await response.json();
            
            // Transition Thoughts
            updateThoughtStep('think', 'completed');
            updateThoughtStep('process', 'active');
            if (data.thinking) {
                document.querySelector('#stepProcess .step-text').innerText = data.thinking;
            }

            // Small delay to let user read the thought
            await new Promise(r => setTimeout(r, 1000));
            
            // Update UI with the AI's response
            transcriptText.innerText = data.response;
            updateThoughtStep('process', 'completed');
            
            // Trigger n8n if an action was detected
            if (data.action) {
                addFeedItem(data.action.type, data.action.title, data.action.description);
            }

            // Speak the response
            speakText(data.response);
            setTimeout(() => showThoughts(false), 2000);
            
        } catch (err) {
            console.error("Brain error:", err);
            transcriptText.innerText = "Error: Toby's brain is fuzzy right now.";
        }
    }

    async function speakText(text) {
        const activeMonster = document.querySelector('.character-card.active').dataset.monster;
        if (isSpeaking) return;
        
        try {
            isSpeaking = true;
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, monster: activeMonster })
            });

            if (!response.ok) throw new Error('TTS request failed');

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            
            audio.onplay = () => document.querySelector('.mouth').classList.add('talking');
            audio.onended = () => {
                document.querySelector('.mouth').classList.remove('talking');
                isSpeaking = false;
            };
            
            audio.play();
        } catch (err) {
            console.error("TTS failed:", err);
            isSpeaking = false;
            // Fallback to browser synthesis
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onstart = () => document.querySelector('.mouth').classList.add('talking');
            utterance.onend = () => {
                document.querySelector('.mouth').classList.remove('talking');
            };
            window.speechSynthesis.speak(utterance);
        }
    }

    // Keep legacy n8n audio support if needed, but we prefer sendTextToBrain
    async function sendAudioToN8N() {
        // We now use real-time transcription, so we don't strictly need to send raw audio to n8n 
        // unless you want n8n to do the processing.
    }

    // ... (rest of the event listeners)
    voiceBtn.addEventListener('click', toggleRecording);
    captureBtn.addEventListener('click', toggleRecording);

    async function sendTextToWebhook(message) {
        transcriptText.innerText = "Sending instruction...";
        transcriptText.classList.remove('placeholder');
        
        const payload = {
            channel: "text",
            message: message,
            session_id: generateSessionId()
        };
        
        try {
            const response = await fetch('https://neo4j.app.n8n.cloud/webhook/customer-support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) throw new Error('Webhook failed');
            
            transcriptText.innerText = "Instruction sent successfully!";
            addFeedItem('task', 'Manual Instruction', message);
        } catch (err) {
            console.error("Webhook error:", err);
            transcriptText.innerText = "Error sending to workflow.";
        }
    }

    // Inputs now send directly to the n8n webhook
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            sendTextToWebhook(searchInput.value.trim());
            searchInput.value = '';
        }
    });

    sendManualBtn.addEventListener('click', () => {
        if (manualInput.value.trim()) {
            sendTextToWebhook(manualInput.value.trim());
            manualInput.value = '';
        }
    });

    // Character Selection
    characterCards.forEach(card => {
        card.addEventListener('click', () => {
            characterCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const monster = card.dataset.monster;
            updateMonsterTheme(monster);
        });
    });

    function updateMonsterTheme(type) {
        const colors = {
            toby: 'linear-gradient(135deg, #ff007a, #7000ff)',
            glitch: 'linear-gradient(135deg, #00f2ff, #0070ff)',
            ember: 'linear-gradient(135deg, #ff7a00, #ff0000)'
        };
        
        const sounds = {
            toby: 'assets/aarif.ogg',
            glitch: 'assets/euphoric.wav',
            ember: 'assets/surprised.wav'
        };

        voiceBtn.style.background = colors[type];
        voiceBtn.style.boxShadow = `0 0 100px ${type === 'toby' ? 'rgba(112, 0, 255, 0.3)' : 'rgba(0, 242, 255, 0.3)'}`;

        // Play character sound
        const audio = new Audio(sounds[type]);
        audio.volume = 0.4;
        audio.play().catch(e => console.log("Sound autoplay blocked or file missing:", e));
    }

    async function updateFeed() {
        try {
            const response = await fetch('/api/events');
            if (!response.ok) throw new Error('Failed to fetch events');
            const events = await response.json();
            
            const feed = document.getElementById('actionFeed');
            feed.innerHTML = ''; // Clear existing
            
            events.forEach(event => {
                const timeStr = new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                addFeedItem(event.type, event.title, event.description, timeStr);
            });
        } catch (err) {
            console.error("Feed update error:", err);
        }
    }

    function addFeedItem(type, title, desc, time = 'Just now') {
        const feed = document.getElementById('actionFeed');
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.onclick = () => alert(`Event Details:\n\nTitle: ${title}\nType: ${type}\nTime: ${time}\n\nDescription: ${desc}`);
        
        const icons = { calendar: '📅', mail: '📧', task: '✅', escalation: '🆘' };
        
        item.innerHTML = `
            <div class="item-icon">${icons[type] || '✨'}</div>
            <div class="item-content">
                <span class="item-title">${title}</span>
                <span class="item-desc">${desc}</span>
            </div>
            <span class="item-time">${time}</span>
        `;
        
        feed.prepend(item);
    }

    // Initial feed load
    updateFeed();
    
    // Add refresh listener
    document.querySelector('.refresh').addEventListener('click', updateFeed);
});
