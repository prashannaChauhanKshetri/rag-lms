// Admin Dashboard JavaScript
const API_BASE = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    loadDashboardStats();
    loadCoursesTable();
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

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || data || [];

        document.getElementById('total-courses').textContent = courses.length;

        // Calculate totals
        let totalDocs = 0;
        let totalChunks = 0;
        let totalConversations = 0;

        for (const course of courses) {
            try {
                const statsResponse = await fetch(`${API_BASE}/chatbots/${course.id}/stats`);
                if (statsResponse.ok) {
                    const stats = await statsResponse.json();
                    totalDocs += stats.document_count || 0;
                    totalChunks += stats.chunk_count || 0;
                    totalConversations += stats.conversation_count || 0;
                }
            } catch (e) {
                // Skip if stats endpoint fails
            }
        }

        document.getElementById('total-documents').textContent = totalDocs;
        document.getElementById('total-chunks').textContent = totalChunks;
        document.getElementById('total-conversations').textContent = totalConversations;

    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load Courses Table
async function loadCoursesTable() {
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || data || [];

        const tbody = document.getElementById('courses-table-body');

        if (courses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-secondary);">
                        No courses yet
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';

        for (const course of courses) {
            let stats = { document_count: 0, chunk_count: 0, conversation_count: 0 };

            try {
                const statsResponse = await fetch(`${API_BASE}/chatbots/${course.id}/stats`);
                if (statsResponse.ok) {
                    stats = await statsResponse.json();
                }
            } catch (e) {
                // Use defaults
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${course.name}</strong>
                </td>
                <td>${stats.document_count || 0}</td>
                <td>${stats.chunk_count || 0}</td>
                <td>${stats.conversation_count || 0}</td>
                <td>
                    <button class="btn btn-ghost" onclick="viewCourse('${course.id}')">View</button>
                    <button class="btn btn-ghost" style="color: var(--error);" onclick="deleteCourse('${course.id}')">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        }

    } catch (error) {
        console.error('Failed to load courses:', error);
    }
}

// Course Actions
function viewCourse(courseId) {
    window.location.href = `instructor.html`;
}

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/chatbots/${courseId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadDashboardStats();
            loadCoursesTable();
        }
    } catch (error) {
        console.error('Failed to delete course:', error);
    }
}

// Make functions global
window.viewCourse = viewCourse;
window.deleteCourse = deleteCourse;
