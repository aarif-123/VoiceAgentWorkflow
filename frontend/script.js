document.addEventListener('DOMContentLoaded', () => {
    const voiceBtn = document.getElementById('voiceBtn');
    const captureBtn = document.getElementById('captureBtn');
    const captureLabel = document.getElementById('captureLabel');
    const transcriptText = document.getElementById('transcriptText');
    const pupils = document.querySelectorAll('.pupil');
    const canvas = document.getElementById('audioVisualizer');
    const ctx = canvas.getContext('2d');
    const characterCards = document.querySelectorAll('.character-card');
    
    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    let audioContext;
    let analyser;
    let dataArray;
    let source;
    let animationId;

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

    async function toggleRecording() {
        if (!mediaRecorder) {
            const success = await initAudio();
            if (!success) return;
        }

        isRecording = !isRecording;
        
        if (isRecording) {
            audioChunks = [];
            mediaRecorder.start();
            voiceBtn.classList.add('recording');
            captureBtn.classList.add('active');
            captureLabel.innerText = "Stop";
            transcriptText.innerText = "Listening... Toby is all ears!";
            transcriptText.classList.remove('placeholder');
            if (audioContext.state === 'suspended') audioContext.resume();
            drawVisualizer();
        } else {
            mediaRecorder.stop();
            voiceBtn.classList.remove('recording');
            captureBtn.classList.remove('active');
            captureLabel.innerText = "Capture";
            transcriptText.innerText = "Toby is thinking...";
            cancelAnimationFrame(animationId);
        }
    }

    async function sendAudioToN8N() {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('channel', 'voice');
        formData.append('session_id', generateSessionId());
        
        // Add current monster context
        const activeMonster = document.querySelector('.character-card.active').dataset.monster;
        formData.append('monster', activeMonster);

        await processN8NRequest(formData);
    }

    // Text Input Handling
    const searchInput = document.querySelector('.search-bar input');
    const manualInput = document.getElementById('manualInput');
    const sendManualBtn = document.getElementById('sendManualBtn');

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            sendTextToN8N(searchInput.value.trim());
            searchInput.value = '';
        }
    });

    sendManualBtn.addEventListener('click', () => {
        if (manualInput.value.trim()) {
            sendTextToN8N(manualInput.value.trim());
            manualInput.value = '';
        }
    });

    async function sendTextToN8N(text) {
        transcriptText.innerText = "Processing text...";
        transcriptText.classList.remove('placeholder');
        
        const formData = new FormData();
        formData.append('channel', 'text');
        formData.append('text', text);
        formData.append('session_id', generateSessionId());
        
        const activeMonster = document.querySelector('.character-card.active').dataset.monster;
        formData.append('monster', activeMonster);

        await processN8NRequest(formData);
    }

    async function processN8NRequest(formData) {
        try {
            const response = await fetch('/api/voice', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('audio')) {
                const blob = await response.blob();
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                
                transcriptText.innerText = "Toby is speaking...";
                
                // Mouth animation for audio playback
                audio.onplay = () => document.querySelector('.mouth').classList.add('talking');
                audio.onended = () => {
                    document.querySelector('.mouth').classList.remove('talking');
                    transcriptText.innerText = "Command processed. Need anything else?";
                };
                
                audio.play();
            } else {
                const data = await response.json();
                
                // n8n workflow might return an object with 'output' or 'response'
                const msg = data.output?.response || data.response || data.message || "Toby has finished!";
                transcriptText.innerText = msg;

                const intent = data.output?.intent || data.intent;
                if (intent) {
                    addFeedItem(intent.type || 'task', intent.title || 'Action Complete', 'Processed by n8n');
                }

                // Speak the response text
                speakText(msg);
            }
        } catch (err) {
            console.error("Failed to send to n8n:", err);
            transcriptText.innerText = "Error: Couldn't reach Toby's brain.";
        }
    }

    async function speakText(text) {
        const activeMonster = document.querySelector('.character-card.active').dataset.monster;
        
        try {
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
                if (transcriptText.innerText === "Toby is speaking...") {
                    transcriptText.innerText = "Command processed. Need anything else?";
                }
            };
            
            audio.play();
        } catch (err) {
            console.error("ElevenLabs TTS failed, falling back to browser synthesis:", err);
            
            // Fallback to browser synthesis if API fails
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onstart = () => document.querySelector('.mouth').classList.add('talking');
            utterance.onend = () => document.querySelector('.mouth').classList.remove('talking');
            window.speechSynthesis.speak(utterance);
        }
    }

    voiceBtn.addEventListener('click', toggleRecording);
    captureBtn.addEventListener('click', toggleRecording);

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

    function addFeedItem(type, title, desc) {
        const feed = document.getElementById('actionFeed');
        const item = document.createElement('div');
        item.className = 'feed-item';
        const icons = { calendar: '📅', mail: '📧', task: '✅', escalation: '🆘' };
        
        item.innerHTML = `
            <div class="item-icon">${icons[type] || '✨'}</div>
            <div class="item-content">
                <span class="item-title">${title}</span>
                <span class="item-desc">${desc}</span>
            </div>
            <span class="item-time">Just now</span>
        `;
        
        feed.prepend(item);
        if (feed.children.length > 5) feed.lastElementChild.remove();
    }
});
