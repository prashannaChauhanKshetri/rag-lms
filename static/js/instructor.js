// RAG-LMS Instructor Dashboard Logic

const API_BASE = "http://127.0.0.1:8000";

// --- Navigation ---
document.querySelectorAll('.nav-links li').forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

        // Add active to clicked
        item.classList.add('active');
        const panelId = item.getAttribute('data-panel') + '-panel';
        document.getElementById(panelId).classList.add('active');

        // Refresh data based on panel
        if (item.getAttribute('data-panel') === 'training') loadChatbots('training-bot-select');
        if (item.getAttribute('data-panel') === 'students') {
            // Future: Load students
        }
        if (item.getAttribute('data-panel') === 'testing') loadChatbots('testing-bot-select');
        if (item.getAttribute('data-panel') === 'monitoring') {
            loadChatbots('monitoring-bot-select').then(() => loadHistory());
        }
    });
});

// --- Creation Panel ---
document.getElementById('bot-ratio').addEventListener('input', (e) => {
    document.getElementById('ratio-value').innerText = (e.target.value * 100) + '%';
});

document.getElementById('bot-greeting').addEventListener('input', (e) => {
    document.getElementById('preview-greeting').innerText = e.target.value || "Hello! I'm here to help you...";
});

async function createChatbot() {
    const name = document.getElementById('bot-name').value;
    const greeting = document.getElementById('bot-greeting').value;
    const ratio = document.getElementById('bot-ratio').value;

    if (!name) return alert("Please enter a course name");

    const formData = new FormData();
    formData.append('name', name);
    formData.append('greeting', greeting);
    formData.append('external_knowledge_ratio', ratio);

    try {
        const res = await fetch(`${API_BASE}/chatbots/create`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        alert(`Course '${data.name}' created successfully!`);
        // Reset form
        document.getElementById('bot-name').value = '';
    } catch (e) {
        alert("Error creating course: " + e);
    }
}

// --- Shared: Load Chatbots ---
async function loadChatbots(selectId) {
    try {
        const res = await fetch(`${API_BASE}/chatbots/list`);
        const data = await res.json();
        const select = document.getElementById(selectId);
        select.innerHTML = '';

        data.chatbots.forEach(bot => {
            const option = document.createElement('option');
            option.value = bot.id;
            option.innerText = bot.name;
            select.appendChild(option);
        });

        // Trigger change event to load dependent data
        if (select.options.length > 0) select.dispatchEvent(new Event('change'));

    } catch (e) {
        console.error("Error loading chatbots:", e);
    }
}

// --- Training Panel ---
async function loadDocuments() {
    const botId = document.getElementById('training-bot-select').value;
    if (!botId) return;

    const container = document.getElementById('doc-list-container');
    container.innerHTML = '<div class="empty-state">Loading...</div>';

    try {
        const res = await fetch(`${API_BASE}/chatbots/${botId}/documents`);
        const data = await res.json();

        container.innerHTML = '';
        if (data.documents.length === 0) {
            container.innerHTML = '<div class="empty-state">No documents uploaded yet.</div>';
            return;
        }

        data.documents.forEach(doc => {
            const div = document.createElement('div');
            div.className = 'doc-item';
            div.innerHTML = `
                <span>📄 ${doc.filename}</span>
                <span style="color:var(--text-secondary); font-size:0.8rem">${doc.chunk_count} chunks</span>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error loading documents</div>';
    }
}

async function handleFileUpload(files) {
    const botId = document.getElementById('training-bot-select').value;
    if (!botId) return alert("Please select a course first");

    const file = files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const btn = document.querySelector('.upload-area');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<h3>⏳ Uploading & Processing...</h3><p>This may take a minute for OCR</p>';

    try {
        const res = await fetch(`${API_BASE}/chatbots/${botId}/upload`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            alert("Document uploaded successfully!");
            loadDocuments();
        } else {
            alert("Upload failed");
        }
    } catch (e) {
        alert("Error uploading: " + e);
    } finally {
        btn.innerHTML = originalText;
    }
}

// --- Testing Panel ---
function handleTestEnter(e) {
    if (e.key === 'Enter') sendTestMessage();
}

async function sendTestMessage() {
    const input = document.getElementById('test-input');
    const text = input.value.trim();
    const botId = document.getElementById('testing-bot-select').value;

    if (!text || !botId) return;

    // Add user message
    const history = document.getElementById('test-chat-history');
    history.innerHTML += `
        <div class="message user-message">
            <div class="bubble">${text}</div>
        </div>
    `;
    input.value = '';
    history.scrollTop = history.scrollHeight;

    // Show loading
    const loadingId = 'loading-' + Date.now();
    history.innerHTML += `
        <div class="message bot-message" id="${loadingId}">
            <div class="avatar">AI</div>
            <div class="bubble">Thinking...</div>
        </div>
    `;

    const formData = new FormData();
    formData.append('question', text);
    formData.append('top_k', 5);

    try {
        const res = await fetch(`${API_BASE}/chatbots/${botId}/chat`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        // Remove loading
        document.getElementById(loadingId).remove();

        // Add bot response
        history.innerHTML += `
            <div class="message bot-message">
                <div class="avatar">AI</div>
                <div class="bubble">${data.answer.replace(/\n/g, '<br>')}</div>
            </div>
        `;

        // Update debug info
        const debug = document.getElementById('retrieval-debug');
        let debugHtml = '<h4>Retrieval Debug Info</h4>';
        data.sources.forEach((src, i) => {
            debugHtml += `
                <div style="margin-bottom:0.5rem; border-bottom:1px solid #333; padding-bottom:0.5rem">
                    <strong>#${i + 1} (Score: ${src.hybrid_score.toFixed(3)})</strong><br>
                    <span style="color:#aaa">Page ${src.page}</span><br>
                    <em>${src.text.substring(0, 100)}...</em>
                </div>
            `;
        });
        debug.innerHTML = debugHtml;

    } catch (e) {
        document.getElementById(loadingId).innerHTML = `<div class="bubble" style="color:red">Error: ${e}</div>`;
    }
    history.scrollTop = history.scrollHeight;
}

// --- Monitoring Panel ---
async function loadHistory() {
    const botId = document.getElementById('monitoring-bot-select').value;
    if (!botId) return;

    const container = document.getElementById('history-container');
    container.innerHTML = 'Loading...';

    try {
        const res = await fetch(`${API_BASE}/chatbots/${botId}/history`);
        const data = await res.json();

        document.getElementById('stat-total').innerText = data.history.length;

        container.innerHTML = '';
        data.history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-q">Q: ${item.question}</div>
                <div class="history-a">A: ${item.answer}</div>
                <div class="feedback-actions">
                    <button class="btn-correct" onclick="submitCorrection('${item.id}', '${item.question.replace(/'/g, "\\'")}')">📝 Submit Correction</button>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        container.innerHTML = 'Error loading history';
    }
}

async function submitCorrection(convId, question) {
    const newAnswer = prompt(`Enter correct answer for: "${question}"`);
    if (!newAnswer) return;

    const formData = new FormData();
    formData.append('conversation_id', convId);
    formData.append('corrected_answer', newAnswer);

    try {
        await fetch(`${API_BASE}/feedback/submit`, {
            method: 'POST',
            body: formData
        });
        alert("Correction submitted! The model will learn from this.");
        loadHistory();
    } catch (e) {
        alert("Error submitting feedback");
    }
}

// Init
loadChatbots('training-bot-select'); // Pre-load for first tab if needed
