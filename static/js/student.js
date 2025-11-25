// RAG-LMS Student Portal Logic
const API_BASE = "http://127.0.0.1:8000";
let currentBotId = null;
let currentSources = [];

// Init
document.addEventListener('DOMContentLoaded', loadSubjects);

async function loadSubjects() {
    try {
        const res = await fetch(`${API_BASE}/chatbots/list`);
        const data = await res.json();
        const select = document.getElementById('subject-select');

        data.chatbots.forEach(bot => {
            const option = document.createElement('option');
            option.value = bot.id;
            option.innerText = bot.name;
            option.dataset.greeting = bot.greeting;
            select.appendChild(option);
        });
    } catch (e) {
        console.error("Error loading subjects:", e);
    }
}

function changeSubject() {
    const select = document.getElementById('subject-select');
    currentBotId = select.value;
    const greeting = select.options[select.selectedIndex].dataset.greeting;

    // Enable input
    document.getElementById('user-input').disabled = false;
    document.getElementById('send-btn').disabled = false;

    // Clear history and show greeting
    const history = document.getElementById('chat-history');
    history.innerHTML = `
        <div class="message bot-message">
            <div class="avatar">AI</div>
            <div class="bubble">
                <p>${greeting}</p>
            </div>
        </div>
    `;
}

function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

async function sendMessage() {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text || !currentBotId) return;

    // Add user message
    appendMessage(text, 'user');
    input.value = '';

    // Show loading
    const loadingId = 'loading-' + Date.now();
    appendLoading(loadingId);

    const formData = new FormData();
    formData.append('question', text);
    formData.append('top_k', 5);

    try {
        const res = await fetch(`${API_BASE}/chatbots/${currentBotId}/chat`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        // Remove loading
        document.getElementById(loadingId).remove();

        // Add bot response
        appendMessage(data.answer, 'bot', data.sources);

    } catch (e) {
        document.getElementById(loadingId).innerHTML = `<div class="bubble" style="color:red">Error: ${e}</div>`;
    }
}

function appendMessage(text, sender, sources = null) {
    const history = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;

    let content = text.replace(/\n/g, '<br>');

    // Add source button if bot message
    if (sender === 'bot' && sources && sources.length > 0) {
        currentSources = sources; // Store for panel
        content += `
            <button class="view-sources-btn" onclick="showSources()">
                📚 View ${sources.length} Sources
            </button>
        `;
    }

    div.innerHTML = `
        <div class="avatar">${sender === 'bot' ? 'AI' : 'Me'}</div>
        <div class="bubble">${content}</div>
    `;

    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
}

function appendLoading(id) {
    const history = document.getElementById('chat-history');
    history.innerHTML += `
        <div class="message bot-message" id="${id}">
            <div class="avatar">AI</div>
            <div class="bubble">Thinking...</div>
        </div>
    `;
    history.scrollTop = history.scrollHeight;
}

// Source Panel
function showSources() {
    const panel = document.getElementById('source-panel');
    const content = document.getElementById('source-content');

    content.innerHTML = '';
    currentSources.forEach((src, i) => {
        content.innerHTML += `
            <div class="source-item">
                <div class="source-meta">
                    <span>Source #${i + 1}</span>
                    <span>Page ${src.page}</span>
                </div>
                <div class="source-text">${src.text}</div>
            </div>
        `;
    });

    panel.classList.add('open');
}

function toggleSources() {
    document.getElementById('source-panel').classList.remove('open');
}
