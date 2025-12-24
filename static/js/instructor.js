// Enhanced Instructor Dashboard JavaScript with Authentication
const API_BASE = '';
let selectedCourseId = null;
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupNavigation();
    setupUploadZone();
    loadCourses();
    setupSlider();
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

    // Check if user is instructor or admin
    if (currentUser.role !== 'instructor' && currentUser.role !== 'admin') {
        alert('Access denied. Instructor privileges required.');
        window.location.href = '/login.html';
        return;
    }

    // Update UI with user info
    document.querySelector('.user-name').textContent = currentUser.full_name || currentUser.username;
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

            document.querySelectorAll('.nav-links li').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function switchPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${panelId}-panel`).classList.add('active');

    // Load data when switching to certain panels
    if (panelId === 'quizzes') {
        loadQuizzes();
    } else if (panelId === 'flashcards') {
        loadFlashcards();
    } else if (panelId === 'lesson-plans') {
        loadLessonPlans();
    }
}

// Slider
function setupSlider() {
    const slider = document.getElementById('course-ratio');
    const display = document.getElementById('ratio-value');

    if (slider && display) {
        slider.addEventListener('input', () => {
            display.textContent = Math.round(slider.value * 100) + '%';
        });
    }
}

// Load Courses
async function loadCourses() {
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || data || [];

        updateCoursesList(courses);
        updateCourseSelects(courses);
    } catch (error) {
        console.error('Failed to load courses:', error);
    }
}

function updateCoursesList(courses) {
    const list = document.getElementById('courses-list');
    if (!list) return;

    if (courses.length === 0) {
        list.innerHTML = '<div class="empty-state-small"><p>No courses yet. Create one!</p></div>';
        return;
    }

    list.innerHTML = courses.map(course => `
        <div class="course-item" data-id="${course.id}">
            <span class="course-name">${course.name}</span>
            <div class="course-actions">
                <button class="btn-icon" onclick="selectCourse('${course.id}')" title="Select">
                    ✓
                </button>
                <button class="btn-icon" onclick="deleteCourse('${course.id}')" title="Delete">
                    🗑
                </button>
            </div>
        </div>
    `).join('');
}

function updateCourseSelects(courses) {
    const selects = [
        'content-course-select',
        'questions-course',
        'flashcards-course',
        'simulator-course',
        'quiz-course-select',
        'lesson-plan-course'
    ];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;

        select.innerHTML = '<option value="" disabled selected>Select Course...</option>';
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            selectedCourseId = select.value;
            if (selectId === 'content-course-select') loadDocuments();
            if (selectId === 'simulator-course') enableSimulator();
            if (selectId === 'quiz-course-select') loadQuizzes();
        });
    });
}

// Create Course
async function createCourse() {
    const name = document.getElementById('course-name').value.trim();
    const greeting = document.getElementById('course-greeting').value.trim();
    const ratio = document.getElementById('course-ratio').value;

    if (!name) {
        alert('Please enter a course name');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('greeting', greeting || `Welcome to ${name}! How can I help you today?`);
        formData.append('external_knowledge_ratio', ratio);

        const response = await fetch(`${API_BASE}/chatbots/create`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            document.getElementById('course-name').value = '';
            document.getElementById('course-greeting').value = '';
            loadCourses();
        }
    } catch (error) {
        console.error('Failed to create course:', error);
    }
}

// Delete Course
async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course?')) return;

    try {
        await fetch(`${API_BASE}/chatbots/${courseId}`, { method: 'DELETE' });
        loadCourses();
    } catch (error) {
        console.error('Failed to delete course:', error);
    }
}

// Upload Zone
function setupUploadZone() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileUpload(files[0]);
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });
}

async function handleFileUpload(file) {
    const courseId = document.getElementById('content-course-select').value;
    if (!courseId) {
        alert('Please select a course first');
        return;
    }

    const progress = document.getElementById('upload-progress');
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('progress-text');

    progress.classList.remove('hidden');
    fill.style.width = '10%';
    text.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        let progressValue = 10;
        const progressInterval = setInterval(() => {
            progressValue = Math.min(progressValue + 5, 90);
            fill.style.width = progressValue + '%';
            text.textContent = progressValue < 50 ? 'Uploading...' : 'Processing PDF...';
        }, 500);

        const response = await fetch(`${API_BASE}/chatbots/${courseId}/upload`, {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);

        if (response.ok) {
            fill.style.width = '100%';
            text.textContent = 'Complete!';
            setTimeout(() => {
                progress.classList.add('hidden');
                fill.style.width = '0%';
                loadDocuments();
            }, 1500);
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        text.textContent = 'Upload failed. Please try again.';
    }
}

async function loadDocuments() {
    const courseId = document.getElementById('content-course-select').value;
    if (!courseId) return;

    try {
        const response = await fetch(`${API_BASE}/chatbots/${courseId}/documents`);
        const data = await response.json();
        const documents = data.documents || [];

        const list = document.getElementById('documents-list');
        if (documents.length === 0) {
            list.innerHTML = '<div class="empty-state-small"><p>No documents uploaded yet</p></div>';
            return;
        }

        list.innerHTML = documents.map(doc => `
            <div class="doc-item">
                <span>📄 ${doc.filename}</span>
                <span style="color: var(--text-muted); font-size: 0.85rem;">${doc.chunk_count} chunks</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load documents:', error);
    }
}

// Question Generator (ENHANCED)
let generatedQuestions = [];

async function generateQuestions() {
    const courseId = document.getElementById('questions-course').value;
    const topic = document.getElementById('questions-topic').value;
    const count = document.getElementById('questions-count').value;
    const difficulty = document.getElementById('questions-difficulty').value;

    if (!courseId) {
        alert('Please select a course');
        return;
    }

    const types = [];
    if (document.getElementById('q-mcq').checked) types.push('mcq');
    if (document.getElementById('q-tf').checked) types.push('true_false');
    if (document.getElementById('q-short').checked) types.push('short_answer');
    if (document.getElementById('q-long').checked) types.push('long_answer');

    if (types.length === 0) {
        alert('Please select at least one question type');
        return;
    }

    const output = document.getElementById('questions-output');
    output.innerHTML = '<div class="empty-state-small"><p>Generating questions... ⏳</p></div>';

    try {
        const response = await fetch(`${API_BASE}/instructor/generate-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatbot_id: courseId,
                topic: topic,
                count: parseInt(count),
                difficulty: difficulty,
                types: types
            })
        });

        const data = await response.json();
        const questions = data.questions || [];

        if (!Array.isArray(questions) || questions.length === 0) {
            // Fallback if API returned raw text or error
            output.innerHTML = `<div class="question-item"><div class="question-text">${(data.raw_text || "No questions generated").replace(/\n/g, '<br>')}</div></div>`;
            generatedQuestions = []; // Can't save easily
            document.getElementById('questions-actions').classList.add('hidden');
            return;
        }

        generatedQuestions = questions;

        // Render detailed questions
        output.innerHTML = questions.map((q, idx) => `
            <div class="question-item">
                <h5>${idx + 1}. ${q.question_text}</h5>
                <span class="badge badge-secondary" style="font-size: 0.7rem; margin-bottom: 0.5rem;">${q.question_type}</span>
                ${q.options ? `<div style="margin-left: 1rem; color: var(--text-secondary);">Options: ${q.options.join(', ')}</div>` : ''}
                <div style="margin-top: 0.5rem; color: var(--primary-color);"><strong>Answer:</strong> ${q.correct_answer}</div>
            </div>
        `).join('');

        // Show actions
        const actionsDiv = document.getElementById('questions-actions');
        actionsDiv.classList.remove('hidden');

        // Add Save Button if not present
        if (!document.getElementById('btn-save-quiz')) {
            actionsDiv.innerHTML = `
                <button class="btn btn-secondary" onclick="copyQuestions()">Copy</button>
                <button class="btn btn-secondary" onclick="downloadQuestions()">Download</button>
                <button id="btn-save-quiz" class="btn btn-primary" onclick="saveGeneratedQuiz()">Save as Quiz</button>
             `;
        }

    } catch (error) {
        console.error('Failed to generate questions:', error);
        output.innerHTML = '<div class="empty-state-small"><p>Failed to generate questions. Try again.</p></div>';
    }
}

async function saveGeneratedQuiz() {
    if (!generatedQuestions || generatedQuestions.length === 0) {
        alert("No questions to save!");
        return;
    }

    const title = prompt("Enter a title for this Quiz:");
    if (!title) return;

    const description = prompt("Enter a description (optional):") || "";
    const courseId = document.getElementById('questions-course').value;

    try {
        const response = await fetch(`${API_BASE}/instructor/quizzes/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatbot_id: courseId,
                title: title,
                description: description,
                questions: generatedQuestions
            })
        });

        if (response.ok) {
            alert("Quiz created/saved successfully! It is currently a draft.");
            loadQuizzes(); // Refresh list to see it
        } else {
            throw new Error("Failed to create quiz");
        }
    } catch (e) {
        console.error("Error saving quiz:", e);
        alert("Error saving quiz: " + e.message);
    }
}

function copyQuestions() {
    const text = generatedQuestions.map(q =>
        `Q: ${q.question_text}\nA: ${q.correct_answer}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    alert('Questions copied to clipboard!');
}

function downloadQuestions() {
    const text = generatedQuestions.map(q =>
        `Q: ${q.question_text}\nA: ${q.correct_answer}`
    ).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions.txt';
    a.click();
}

// Flashcard Generator (ENHANCED)
async function generateFlashcards() {
    const courseId = document.getElementById('flashcards-course').value;
    const topic = document.getElementById('flashcards-topic').value;
    const count = document.getElementById('flashcards-count').value;

    if (!courseId) {
        alert('Please select a course');
        return;
    }

    const preview = document.getElementById('flashcards-preview');
    preview.innerHTML = '<div class="empty-state-small"><p>Generating flashcards... ⏳</p></div>';

    try {
        const response = await fetch(`${API_BASE}/instructor/flashcards/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatbot_id: courseId,
                topic: topic,
                count: parseInt(count)
            })
        });

        const data = await response.json();
        const cards = parseFlashcards(data.flashcards);

        if (cards.length > 0) {
            preview.innerHTML = cards.map((card, i) => `
                <div class="flashcard" onclick="flipCard(this)">
                    <div class="flashcard-front">📝 ${card.front}</div>
                    <div class="flashcard-back" style="display: none;">💡 ${card.back}</div>
                </div>
            `).join('');

            // Store for saving
            window.generatedFlashcards = cards;

            // Show save button
            const actionsDiv = document.getElementById('flashcard-actions');
            if (actionsDiv) {
                actionsDiv.classList.remove('hidden');
            } else {
                // Create actions div if it doesn't exist
                const actionsHTML = `
                    <div id="flashcard-actions" class="card-actions" style="margin-top: 1rem;">
                        <button class="btn btn-primary" onclick="saveFlashcards()">
                            <i data-lucide="save"></i> Save Flashcards
                        </button>
                    </div>
                `;
                preview.insertAdjacentHTML('afterend', actionsHTML);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } else {
            preview.innerHTML = `
                <div class="question-item" style="grid-column: span 2;">
                    <div class="question-text">${data.flashcards.replace(/\n/g, '<br>')}</div>
                </div>
            `;
        }

    } catch (error) {
        console.error('Failed to generate flashcards:', error);
        preview.innerHTML = '<div class="empty-state-small"><p>Failed to generate flashcards. Try again.</p></div>';
    }
}

function parseFlashcards(text) {
    const cards = [];
    const regex = /FRONT:\s*(.*?)(?=BACK:)/gis;
    const backRegex = /BACK:\s*(.*?)(?=FRONT:|$)/gis;

    const fronts = [...text.matchAll(regex)];
    const backs = [...text.matchAll(backRegex)];

    for (let i = 0; i < Math.min(fronts.length, backs.length); i++) {
        cards.push({
            front: fronts[i][1].trim(),
            back: backs[i][1].trim()
        });
    }

    return cards;
}

function flipCard(card) {
    const front = card.querySelector('.flashcard-front');
    const back = card.querySelector('.flashcard-back');

    if (front.style.display !== 'none') {
        front.style.display = 'none';
        back.style.display = 'block';
    } else {
        front.style.display = 'block';
        back.style.display = 'none';
    }
}

async function saveFlashcards() {
    const courseId = document.getElementById('flashcards-course').value;
    const cards = window.generatedFlashcards;

    if (!courseId || !cards || cards.length === 0) {
        alert('No flashcards to save');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/instructor/flashcards/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatbot_id: courseId,
                flashcards: cards
            })
        });

        if (response.ok) {
            alert('Flashcards saved successfully!');
            document.getElementById('flashcard-actions').classList.add('hidden');
            loadSavedFlashcards(); // Refresh list
        } else {
            throw new Error('Failed to save');
        }
    } catch (error) {
        console.error('Save error:', error);
        alert('Failed to save flashcards');
    }
}

async function loadFlashcards() {
    // Wrapper to load based on context, primarily for the panel switch
    const courseId = document.getElementById('flashcards-course')?.value || selectedCourseId;
    if (courseId) {
        loadSavedFlashcards();
    }
}

async function loadSavedFlashcards() {
    const courseId = document.getElementById('flashcards-course').value;
    if (!courseId) return;

    try {
        const response = await fetch(`${API_BASE}/student/flashcards/${courseId}`);
        const data = await response.json();

        // Render saved flashcards (bottom section)
        // Note: You might want to add a specific container in HTML for 'Saved Flashcards' 
        // For now, we'll log them or append if a container exists
        console.log("Loaded saved cards:", data.flashcards);

    } catch (error) {
        console.error('Failed to load saved flashcards:', error);
    }
}

// Quiz Management (NEW)
async function loadQuizzes() {
    const courseId = selectedCourseId || document.getElementById('quiz-course-select')?.value;
    if (!courseId) return;

    try {
        const response = await fetch(`${API_BASE}/instructor/quizzes/${courseId}`);
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
        container.innerHTML = '<div class="empty-state-small"><p>No quizzes yet. Create one!</p></div>';
        return;
    }

    container.innerHTML = quizzes.map(quiz => `
        <div class="quiz-card">
            <h4>${quiz.title}</h4>
            <p>${quiz.description || 'No description'}</p>
            <div class="quiz-meta">
                <span>${quiz.question_count || 0} questions</span>
                <span class="badge ${quiz.is_published ? 'badge-success' : 'badge-secondary'}">
                    ${quiz.is_published ? 'Published' : 'Draft'}
                </span>
            </div>
            <div class="quiz-actions">
                <button class="btn btn-sm btn-secondary" onclick="editQuiz('${quiz.id}')">Edit</button>
                ${quiz.is_published ?
            `<button class="btn btn-sm btn-secondary" onclick="unpublishQuiz('${quiz.id}')">Unpublish</button>` :
            `<button class="btn btn-sm btn-primary" onclick="publishQuiz('${quiz.id}')">Publish</button>`
        }
                <button class="btn btn-sm btn-danger" onclick="deleteQuiz('${quiz.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function publishQuiz(quizId) {
    try {
        await fetch(`${API_BASE}/instructor/quizzes/${quizId}/publish`, { method: 'POST' });
        loadQuizzes();
        alert('Quiz published successfully!');
    } catch (error) {
        console.error('Failed to publish quiz:', error);
    }
}

async function unpublishQuiz(quizId) {
    try {
        await fetch(`${API_BASE}/instructor/quizzes/${quizId}/unpublish`, { method: 'POST' });
        loadQuizzes();
        alert('Quiz unpublished');
    } catch (error) {
        console.error('Failed to unpublish quiz:', error);
    }
}

async function deleteQuiz(quizId) {
    if (!confirm('Are you sure you want to delete this quiz?')) return;

    try {
        await fetch(`${API_BASE}/instructor/quizzes/${quizId}`, { method: 'DELETE' });
        loadQuizzes();
    } catch (error) {
        console.error('Failed to delete quiz:', error);
    }
}

// Simulator
function enableSimulator() {
    document.getElementById('simulator-input').disabled = false;
    document.getElementById('simulator-send').disabled = false;

    const messages = document.getElementById('simulator-messages');
    messages.innerHTML = `
        <div class="message bot-message">
            <div class="message-avatar">AI</div>
            <div class="message-bubble">
                <p>Ready to test! Ask me anything.</p>
            </div>
        </div>
    `;
}

async function sendSimulatorMessage() {
    const input = document.getElementById('simulator-input');
    const message = input.value.trim();
    const courseId = document.getElementById('simulator-course').value;

    if (!message || !courseId) return;

    input.value = '';

    const messages = document.getElementById('simulator-messages');
    messages.innerHTML += `
        <div class="message user-message">
            <div class="message-avatar">You</div>
            <div class="message-bubble"><p>${message}</p></div>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/chatbots/${courseId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        messages.innerHTML += `
            <div class="message bot-message">
                <div class="message-avatar">AI</div>
                <div class="message-bubble"><p>${data.response.replace(/\n/g, '<br>')}</p></div>
            </div>
        `;

        messages.scrollTop = messages.scrollHeight;
    } catch (error) {
        console.error('Error:', error);
    }
}

// Make functions globally available
window.createCourse = createCourse;
window.deleteCourse = deleteCourse;
window.selectCourse = (id) => { selectedCourseId = id; };
window.generateQuestions = generateQuestions;
window.copyQuestions = copyQuestions;
window.downloadQuestions = downloadQuestions;
window.generateFlashcards = generateFlashcards;
window.saveFlashcards = saveFlashcards;
window.loadSavedFlashcards = loadSavedFlashcards;
window.publishFlashcard = publishFlashcard;
window.deleteFlashcard = deleteFlashcard;
window.flipCard = flipCard;
window.sendSimulatorMessage = sendSimulatorMessage;
window.publishQuiz = publishQuiz;
window.unpublishQuiz = unpublishQuiz;
window.deleteQuiz = deleteQuiz;

// Lesson Plan Generator
let generatedLessonPlan = "";

async function generateLessonPlan() {
    const courseId = document.getElementById('lesson-plan-course').value;
    const topic = document.getElementById('lesson-plan-topic').value;
    const duration = document.getElementById('lesson-plan-duration').value;

    if (!courseId) {
        alert('Please select a course');
        return;
    }

    if (!topic) {
        alert('Please enter a topic');
        return;
    }

    const output = document.getElementById('lesson-plan-output');
    output.innerHTML = '<div class="empty-state-small"><p>Generating lesson plan... ⏳</p></div>';

    try {
        const response = await fetch(`${API_BASE}/instructor/lesson-plans/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatbot_id: courseId,
                topic: topic,
                duration: duration
            })
        });

        const data = await response.json();

        // Format the output
        const formattedPlan = data.lesson_plan.replace(/\n/g, '<br>');

        output.innerHTML = `
            <div class="question-item">
                <div class="question-text" style="font-size: 0.95rem; line-height: 1.6;">${formattedPlan}</div>
            </div>
        `;

        generatedLessonPlan = data.lesson_plan;
        document.getElementById('lesson-plan-actions').classList.remove('hidden');

    } catch (error) {
        console.error('Failed to generate lesson plan:', error);
        output.innerHTML = '<div class="empty-state-small"><p>Failed to generate lesson plan. Try again.</p></div>';
    }
}

function copyLessonPlan() {
    navigator.clipboard.writeText(generatedLessonPlan);
    alert('Lesson plan copied to clipboard!');
}

function downloadLessonPlan() {
    const blob = new Blob([generatedLessonPlan], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lesson_plan.txt';
    a.click();
}

window.logout = logout;
window.generateLessonPlan = generateLessonPlan;
window.copyLessonPlan = copyLessonPlan;
window.downloadLessonPlan = downloadLessonPlan;
