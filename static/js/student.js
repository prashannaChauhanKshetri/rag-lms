// Enhanced Student Portal JavaScript with Authentication
const API_BASE = '';
let currentChatbotId = null;
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    loadCourses();
    setupNavigation();
    setupKeyboardShortcuts();
});

// Authentication Check
function checkAuthentication() {
    const userStr = localStorage.getItem('user');
    const sessionToken = localStorage.getItem('session_token');

    if (!userStr || !sessionToken) {
        window.location.href = '/login.html';
        return;
    }

    currentUser = JSON.parse(userStr);

    // Check if user is student
    if (currentUser.role !== 'student' && currentUser.role !== 'admin') {
        alert('Access denied. Student privileges required.');
        window.location.href = '/login.html';
        return;
    }

    // Update UI with user info
    const userNameEl = document.querySelector('.user-name');
    if (userNameEl) {
        userNameEl.textContent = currentUser.full_name || currentUser.username;
    }
}

// Logout
function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('session_token');
    window.location.href = '/login.html';
}

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

    // Load data when switching panels
    if (panelId === 'quizzes' && currentChatbotId) {
        loadQuizzes();
    } else if (panelId === 'flashcards' && currentChatbotId) {
        loadFlashcards();
    }
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
    const titleEl = document.querySelector('.page-title');
    const subtitleEl = document.querySelector('.page-subtitle');

    if (titleEl) titleEl.textContent = info.title;
    if (subtitleEl) subtitleEl.textContent = info.subtitle;
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
    const input = document.getElementById('user-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

// Load Courses
async function loadCourses() {
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || data || [];

        const select = document.getElementById('course-select');
        if (!select) return;

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
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    if (userInput) userInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;

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

        // Load quizzes and flashcards for this course
        loadQuizzes();
        loadFlashcards();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Chat Functions
function clearChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) chatMessages.innerHTML = '';
}

function addMessage(content, type, sources = null) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

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
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function addTypingIndicator() {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

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
    if (!input) return;

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

// Quizzes
async function loadQuizzes() {
    if (!currentChatbotId) return;

    try {
        const response = await fetch(`${API_BASE}/student/quizzes/${currentChatbotId}`);
        const data = await response.json();
        displayQuizzes(data.quizzes || []);
    } catch (error) {
        console.error('Failed to load quizzes:', error);
    }
}

function displayQuizzes(quizzes) {
    const container = document.getElementById('quizzes-list');
    if (!container) return;

    if (quizzes.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><p>No quizzes available yet</p></div>';
        return;
    }

    container.innerHTML = quizzes.map(quiz => `
        <div class="quiz-card">
            <h3>${quiz.title}</h3>
            <p>${quiz.description || 'No description'}</p>
            <div class="quiz-meta">
                <span>📝 ${quiz.question_count || 0} questions</span>
            </div>
            <button class="btn btn-primary" onclick="takeQuiz('${quiz.id}')">
                <i data-lucide="play"></i> Take Quiz
            </button>
        </div>
    `).join('');

    // Reinitialize lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function takeQuiz(quizId) {
    try {
        const response = await fetch(`${API_BASE}/student/quizzes/${quizId}/take`);
        const quiz = await response.json();

        displayQuizTaking(quiz);
    } catch (error) {
        console.error('Failed to load quiz:', error);
        alert('Failed to load quiz. Please try again.');
    }
}

function displayQuizTaking(quiz) {
    const container = document.getElementById('quizzes-list');
    if (!container) return;

    let questionsHTML = quiz.questions.map((q, index) => {
        let optionsHTML = '';

        if (q.question_type === 'mcq' && q.options) {
            optionsHTML = q.options.map((opt, i) => `
                <label class="quiz-option">
                    <input type="radio" name="q_${q.id}" value="${String.fromCharCode(65 + i)}">
                    <span>${opt}</span>
                </label>
            `).join('');
        } else if (q.question_type === 'true_false') {
            optionsHTML = `
                <label class="quiz-option">
                    <input type="radio" name="q_${q.id}" value="true">
                    <span>True</span>
                </label>
                <label class="quiz-option">
                    <input type="radio" name="q_${q.id}" value="false">
                    <span>False</span>
                </label>
            `;
        } else {
            optionsHTML = `
                <textarea class="quiz-text-answer" id="q_${q.id}" rows="3" placeholder="Enter your answer..."></textarea>
            `;
        }

        return `
            <div class="quiz-question">
                <h4>Question ${index + 1}</h4>
                <p>${q.question_text}</p>
                <div class="quiz-options">
                    ${optionsHTML}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="quiz-taking">
            <div class="quiz-header">
                <h2>${quiz.title}</h2>
                <p>${quiz.description || ''}</p>
            </div>
            <div class="quiz-questions">
                ${questionsHTML}
            </div>
            <div class="quiz-actions">
                <button class="btn btn-secondary" onclick="loadQuizzes()">Cancel</button>
                <button class="btn btn-primary" onclick="submitQuiz('${quiz.id}', ${JSON.stringify(quiz.questions).replace(/"/g, '&quot;')})">
                    Submit Quiz
                </button>
            </div>
        </div>
    `;
}

async function submitQuiz(quizId, questions) {
    const answers = {};

    questions.forEach(q => {
        if (q.question_type === 'mcq' || q.question_type === 'true_false') {
            const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
            if (selected) {
                answers[q.id] = selected.value;
            }
        } else {
            const textarea = document.getElementById(`q_${q.id}`);
            if (textarea) {
                answers[q.id] = textarea.value.trim();
            }
        }
    });

    try {
        const response = await fetch(`${API_BASE}/student/quizzes/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quiz_id: quizId,
                student_id: currentUser.id,
                answers: answers
            })
        });

        const result = await response.json();

        showQuizResult(result);
    } catch (error) {
        console.error('Failed to submit quiz:', error);
        alert('Failed to submit quiz. Please try again.');
    }
}

function showQuizResult(result) {
    const container = document.getElementById('quizzes-list');
    if (!container) return;

    const percentage = result.score.toFixed(1);
    const grade = percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'F';

    container.innerHTML = `
        <div class="quiz-result">
            <div class="result-icon">🎉</div>
            <h2>Quiz Completed!</h2>
            <div class="result-score">
                <div class="score-circle">
                    <span class="score-value">${percentage}%</span>
                    <span class="score-grade">Grade: ${grade}</span>
                </div>
            </div>
            <div class="result-details">
                <p>You scored <strong>${result.earned_points}</strong> out of <strong>${result.total_points}</strong> points</p>
            </div>
            <button class="btn btn-primary" onclick="loadQuizzes()">Back to Quizzes</button>
        </div>
    `;
}

// Flashcards
async function loadFlashcards() {
    if (!currentChatbotId) return;

    try {
        const response = await fetch(`${API_BASE}/student/flashcards/${currentChatbotId}`);
        const data = await response.json();
        displayFlashcards(data.flashcards || []);
    } catch (error) {
        console.error('Failed to load flashcards:', error);
    }
}

function displayFlashcards(flashcards) {
    const container = document.getElementById('flashcards-grid');
    if (!container) return;

    if (flashcards.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><p>No flashcards available yet</p></div>';
        return;
    }

    container.innerHTML = flashcards.map(card => `
        <div class="flashcard" onclick="flipCard(this)">
            <div class="flashcard-inner">
                <div class="flashcard-front">
                    <div class="flashcard-label">Question</div>
                    <p>${card.front}</p>
                </div>
                <div class="flashcard-back">
                    <div class="flashcard-label">Answer</div>
                    <p>${card.back}</p>
                </div>
            </div>
        </div>
    `).join('');
}

function flipCard(card) {
    card.classList.toggle('flipped');
}

// Sources Panel
function showSources(sources) {
    const panel = document.getElementById('source-panel');
    const content = document.getElementById('source-content');

    if (!panel || !content) return;

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
    const panel = document.getElementById('source-panel');
    if (panel) panel.classList.toggle('open');
}

// Make functions globally available
window.sendMessage = sendMessage;
window.showSources = showSources;
window.toggleSources = toggleSources;
window.takeQuiz = takeQuiz;
window.submitQuiz = submitQuiz;
window.loadQuizzes = loadQuizzes;
window.flipCard = flipCard;
window.logout = logout;
