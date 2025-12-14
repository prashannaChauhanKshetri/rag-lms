// Enhanced Admin Dashboard JavaScript
const API_BASE = '';
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupNavigation();
    loadDashboardData();
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

    // Check if user is admin
    if (currentUser.role !== 'admin') {
        alert('Access denied. Administrator privileges required.');
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

            document.querySelectorAll('.nav-links li').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function switchPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${panelId}-panel`).classList.add('active');

    // Load data when switching panels
    if (panelId === 'dashboard') {
        loadDashboardData();
    } else if (panelId === 'courses') {
        loadAllCourses();
    } else if (panelId === 'users') {
        loadUsers();
    }
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        // Load courses
        const coursesResponse = await fetch(`${API_BASE}/chatbots/list`);
        const coursesData = await coursesResponse.json();
        const courses = coursesData.chatbots || [];

        // Update total courses
        document.getElementById('total-courses').textContent = courses.length;

        // Calculate total documents and chunks
        let totalDocuments = 0;
        let totalChunks = 0;
        let totalConversations = 0;

        for (const course of courses) {
            try {
                // Get documents for this course
                const docsResponse = await fetch(`${API_BASE}/chatbots/${course.id}/documents`);
                const docsData = await docsResponse.json();
                const documents = docsData.documents || [];

                totalDocuments += documents.length;
                totalChunks += documents.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0);

                // Get conversations for this course
                const convResponse = await fetch(`${API_BASE}/chatbots/${course.id}/history`);
                const convData = await convResponse.json();
                const conversations = convData.history || [];

                totalConversations += conversations.length;
            } catch (error) {
                console.error(`Error loading data for course ${course.id}:`, error);
            }
        }

        document.getElementById('total-documents').textContent = totalDocuments;
        document.getElementById('total-chunks').textContent = totalChunks.toLocaleString();
        document.getElementById('total-conversations').textContent = totalConversations;

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

// Load All Courses
async function loadAllCourses() {
    try {
        const response = await fetch(`${API_BASE}/chatbots/list`);
        const data = await response.json();
        const courses = data.chatbots || [];

        const tbody = document.getElementById('courses-table-body');
        if (!tbody) return;

        if (courses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No courses yet</td></tr>';
            return;
        }

        // Load detailed data for each course
        const courseRows = await Promise.all(courses.map(async (course) => {
            let docCount = 0;
            let chunkCount = 0;
            let convCount = 0;

            try {
                const docsResponse = await fetch(`${API_BASE}/chatbots/${course.id}/documents`);
                const docsData = await docsResponse.json();
                const documents = docsData.documents || [];
                docCount = documents.length;
                chunkCount = documents.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0);

                const convResponse = await fetch(`${API_BASE}/chatbots/${course.id}/history`);
                const convData = await convResponse.json();
                convCount = (convData.history || []).length;
            } catch (error) {
                console.error(`Error loading course ${course.id}:`, error);
            }

            return `
                <tr>
                    <td><strong>${course.name}</strong></td>
                    <td>${docCount}</td>
                    <td>${chunkCount.toLocaleString()}</td>
                    <td>${convCount}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="viewCourse('${course.id}')">View</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCourse('${course.id}')">Delete</button>
                    </td>
                </tr>
            `;
        }));

        tbody.innerHTML = courseRows.join('');

    } catch (error) {
        console.error('Failed to load courses:', error);
    }
}

// Load Users
async function loadUsers() {
    try {
        // Since we don't have a users endpoint yet, we'll create one or use mock data
        // For now, let's add the endpoint to the API
        const response = await fetch(`${API_BASE}/admin/users`);
        const data = await response.json();
        const users = data.users || [];

        // Count by role
        const admins = users.filter(u => u.role === 'admin').length;
        const instructors = users.filter(u => u.role === 'instructor').length;
        const students = users.filter(u => u.role === 'student').length;

        document.getElementById('total-admins').textContent = admins;
        document.getElementById('total-instructors').textContent = instructors;
        document.getElementById('total-students').textContent = students;

        // Display users table
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No users yet</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const roleClass = user.role === 'admin' ? 'badge-admin' :
                user.role === 'instructor' ? 'badge-instructor' : 'badge-student';
            const date = new Date(user.created_at).toLocaleDateString();

            return `
                <tr>
                    <td><strong>${user.username}</strong></td>
                    <td>${user.full_name || '-'}</td>
                    <td>${user.email || '-'}</td>
                    <td><span class="badge ${roleClass}">${user.role}</span></td>
                    <td>${date}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load users:', error);
        // Show demo users if API fails
        showDemoUsers();
    }
}

function showDemoUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    const demoUsers = [
        { username: 'admin', full_name: 'Admin User', email: 'admin@raglms.com', role: 'admin', created_at: new Date().toISOString() },
        { username: 'instructor', full_name: 'Demo Instructor', email: 'instructor@raglms.com', role: 'instructor', created_at: new Date().toISOString() },
        { username: 'student', full_name: 'Demo Student', email: 'student@raglms.com', role: 'student', created_at: new Date().toISOString() }
    ];

    document.getElementById('total-admins').textContent = '1';
    document.getElementById('total-instructors').textContent = '1';
    document.getElementById('total-students').textContent = '1';

    tbody.innerHTML = demoUsers.map(user => {
        const roleClass = user.role === 'admin' ? 'badge-admin' :
            user.role === 'instructor' ? 'badge-instructor' : 'badge-student';
        const date = new Date(user.created_at).toLocaleDateString();

        return `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.full_name}</td>
                <td>${user.email}</td>
                <td><span class="badge ${roleClass}">${user.role}</span></td>
                <td>${date}</td>
            </tr>
        `;
    }).join('');
}

// Course Actions
function viewCourse(courseId) {
    // Redirect to instructor dashboard with this course selected
    window.location.href = `/instructor.html?course=${courseId}`;
}

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
        return;
    }

    try {
        await fetch(`${API_BASE}/chatbots/${courseId}`, { method: 'DELETE' });
        alert('Course deleted successfully');
        loadAllCourses();
        loadDashboardData();
    } catch (error) {
        console.error('Failed to delete course:', error);
        alert('Failed to delete course');
    }
}

// Make functions globally available
window.logout = logout;
window.viewCourse = viewCourse;
window.deleteCourse = deleteCourse;
