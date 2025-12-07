// Student Portal JavaScript
const API_BASE = '';
let currentChatbotId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCourses();
    setupNavigation();
    setupKeyboardShortcuts();
});

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-links li').forEach(item => {
        item.addEventListener('click', () => {
            const panel = item.dataset.panel;
            switchPanel(panel);

            // Update active state
            document.querySelectorAll('.nav-links li').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update header
            updateHeader(panel);
        });
    });
}

function switchPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${panelId}-panel`).classList.add('active');
}

function updateHeader(panel) {
    const titles = {
        chat: { title: 'AI Tutor', subtitle: 'Chat with your AI assistant' },
        flashcards: { title: 'Flashcards', subtitle: 'Study with interactive cards' },
        quizzes: { title: 'Quizzes', subtitle: 'Test your knowledge' },
        history: { title: 'History', subtitle: 'Your conversation history' },
        achievements: { title: 'Achievements', subtitle: 'Your learning milestones' }
    };

    const info = titles[panel] || titles.chat;
    document.querySelector('.page-title').textContent = info.title;
    document.querySelector('.page-subtitle').textContent = info.subtitle;
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.getElementById('user-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Load Courses
async function loadCourses() {
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || data || [];

        const select = document.getElementById('course-select');
        select.innerHTML = '<option value="" disabled selected>Select a Course...</option>';

        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            select.appendChild(option);
        });

        select.addEventListener('change', () => selectCourse(select.value));
    } catch (error) {
        console.error('Failed to load courses:', error);
    }
}

// Select Course
async function selectCourse(courseId) {
    currentChatbotId = courseId;

    // Enable input
    document.getElementById('user-input').disabled = false;
    document.getElementById('send-btn').disabled = false;

    // Get greeting
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || data || [];
        const course = courses.find(c => c.id === courseId);

        if (course) {
            clearChat();
            addMessage(course.greeting || `Welcome to ${course.name}! How can I help you today?`, 'bot');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Chat Functions
function clearChat() {
    document.getElementById('chat-messages').innerHTML = '';
}

function addMessage(content, type, sources = null) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    const avatar = type === 'bot' ? 'AI' : 'You';

    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-bubble">
                <p>${formatMessage(content)}</p>
                ${sources ? `<button class="source-btn" onclick="showSources(${JSON.stringify(sources).replace(/"/g, '&quot;')})">📚 View Sources</button>` : ''}
            </div>
        </div>
    `;

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function formatMessage(text) {
    // Basic markdown-like formatting
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function addTypingIndicator() {
    const messagesDiv = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing';
    typingDiv.id = 'typing-indicator';

    typingDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;

    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

// Send Message
async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();

    if (!message || !currentChatbotId) return;

    input.value = '';
    addMessage(message, 'user');
    addTypingIndicator();

    try {
        const response = await fetch(`${API_BASE}/chatbots/${currentChatbotId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        removeTypingIndicator();

        addMessage(data.response, 'bot', data.sources);
    } catch (error) {
        removeTypingIndicator();
        addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        console.error('Error:', error);
    }
}

// Sources Panel
function showSources(sources) {
    const panel = document.getElementById('source-panel');
    const content = document.getElementById('source-content');

    content.innerHTML = sources.map((source, i) => `
        <div class="source-item card" style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 600;">Source ${i + 1}</span>
                <span style="color: var(--text-muted); font-size: 0.8rem;">Page ${source.page || 'N/A'}</span>
            </div>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">${source.text?.substring(0, 200)}...</p>
        </div>
    `).join('');

    panel.classList.add('open');
}

function toggleSources() {
    document.getElementById('source-panel').classList.toggle('open');
}
