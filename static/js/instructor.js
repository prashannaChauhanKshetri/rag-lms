// Instructor Dashboard JavaScript
const API_BASE = '';
let selectedCourseId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupUploadZone();
    loadCourses();
    setupSlider();
});

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

        // Update course lists
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
        'simulator-course'
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
        // Simulate progress
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
        const documents = await response.json();

        const list = document.getElementById('documents-list');
        if (documents.length === 0) {
            list.innerHTML = '<div class="empty-state-small"><p>No documents uploaded yet</p></div>';
            return;
        }

        list.innerHTML = documents.map(doc => `
            <div class="doc-item">
                <span>📄 ${doc.filename}</span>
                <span style="color: var(--text-muted); font-size: 0.85rem;">${doc.chunks} chunks</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load documents:', error);
    }
}

// Question Generator
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

    const output = document.getElementById('questions-output');
    output.innerHTML = '<div class="empty-state-small"><p>Generating questions... ⏳</p></div>';

    try {
        const response = await fetch(`${API_BASE}/chatbots/${courseId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Generate ${count} ${difficulty} difficulty questions ${topic ? `about "${topic}"` : 'from the course content'}. 
                Include these types: ${types.join(', ')}.
                Format each question clearly with the question number, type, question text, and for MCQ include options (A, B, C, D) with the correct answer marked.`
            })
        });

        const data = await response.json();

        output.innerHTML = `
            <div class="question-item">
                <div class="question-text">${data.response.replace(/\n/g, '<br>')}</div>
            </div>
        `;

        generatedQuestions = data.response;
        document.getElementById('questions-actions').classList.remove('hidden');

    } catch (error) {
        console.error('Failed to generate questions:', error);
        output.innerHTML = '<div class="empty-state-small"><p>Failed to generate questions. Try again.</p></div>';
    }
}

function copyQuestions() {
    navigator.clipboard.writeText(generatedQuestions);
    alert('Questions copied to clipboard!');
}

function downloadQuestions() {
    const blob = new Blob([generatedQuestions], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions.txt';
    a.click();
}

// Flashcard Generator
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
        const response = await fetch(`${API_BASE}/chatbots/${courseId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Create ${count} flashcards ${topic ? `about "${topic}"` : 'from the course content'}.
                Format: For each flashcard, write "FRONT:" followed by the question/term, then "BACK:" followed by the answer/definition.
                Make them clear and educational.`
            })
        });

        const data = await response.json();

        // Parse flashcards from response
        const cards = parseFlashcards(data.response);

        if (cards.length > 0) {
            preview.innerHTML = cards.map((card, i) => `
                <div class="flashcard" onclick="flipCard(this)">
                    <div class="flashcard-front">📝 ${card.front}</div>
                    <div class="flashcard-back" style="display: none;">💡 ${card.back}</div>
                </div>
            `).join('');
        } else {
            preview.innerHTML = `
                <div class="question-item" style="grid-column: span 2;">
                    <div class="question-text">${data.response.replace(/\n/g, '<br>')}</div>
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
window.flipCard = flipCard;
window.sendSimulatorMessage = sendSimulatorMessage;
