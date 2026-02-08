import { useState } from 'react';
import EnhancedLogin from './components/auth/EnhancedLogin';
import Signup from './components/auth/Signup';
import SuperAdminDashboard from './components/admin/SuperAdminDashboard';
import { Sidebar } from './components/shared/Sidebar';
import { MobileNav } from './components/shared/MobileNav';
import { Header } from './components/shared/Header';
import { StudentHome } from './components/student/StudentHome';
import { ChatInterface } from './components/student/ChatInterface';
import {
  Home as HomeIcon,
  BookOpen,
  MessageSquare,
  FileText,
  CheckSquare,
  Calendar,
  Brain,
  CreditCard,
  LayoutDashboard,
  HelpCircle,
  Users,
  Settings,
  BarChart3
} from 'lucide-react';
import { InstructorHome } from './components/instructor/InstructorHome';
import { CourseManager } from './components/instructor/CourseManager';
import { QuizCreator } from './components/instructor/QuizCreator';
import { LessonPlanner } from './components/instructor/LessonPlanner';
import { FlashcardManager } from './components/instructor/FlashcardManager';
import { AssignmentManager } from './components/instructor/AssignmentManager';
import { AnalyticsDashboard } from './components/instructor/AnalyticsDashboard';
import AttendanceManager from './components/instructor/AttendanceManager';
// import EnhancedSectionManager from './components/instructor/EnhancedSectionManager'; // Replaced with EnhancedSectionManager
import ClassManager from './components/instructor/ClassManager';
import { StudentAssignments } from './components/student/StudentAssignments';
import { StudentFlashcards } from './components/student/StudentFlashcards';
import { StudentQuizzes } from './components/student/StudentQuizzes';
import { StudentAssignmentManager } from './components/student/StudentAssignmentManager';
import { AdminTeacherManager } from './components/admin/AdminTeacherManager';
import { EnrolledSections } from './components/student/EnrolledSections';
import { SectionOverview } from './components/student/EnhancedCourseOverview';
import { EnhancedSectionManager } from './components/instructor/EnhancedSectionManager';
import { AttendanceReportView } from './components/instructor/AttendanceReportView';

interface User {
  id: string;
  username: string;
  role: 'student' | 'instructor' | 'admin' | 'super_admin';
  full_name: string;
  email: string;
  institution?: string;
}

interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  institution_id: string;
}

const studentTabs = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'enrolled-sections', label: 'Enrolled Sections', icon: BookOpen },
  { id: 'course-overview', label: 'Course Details', icon: LayoutDashboard },
  { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'assignment-manager', label: 'My Submissions', icon: CheckSquare },
  { id: 'quiz', label: 'Quizzes', icon: Brain },
  { id: 'flashcards', label: 'Flashcards', icon: CreditCard },
];

const instructorTabs = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'sections', label: 'Sections', icon: Users },
  { id: 'attendance-report', label: 'Reports', icon: BarChart3 },
  { id: 'attendance', label: 'Attendance', icon: Calendar },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'classes', label: 'Classes', icon: BookOpen },
  { id: 'courses', label: 'Course Manager', icon: Brain },
  { id: 'quizzes', label: 'Quiz Creator', icon: HelpCircle },
  { id: 'flashcards', label: 'Flashcards', icon: CreditCard },
  { id: 'lesson-plans', label: 'Lesson Plans', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: CheckSquare },
];

const adminTabs = [
  { id: 'home', label: 'Dashboard', icon: HomeIcon },
  { id: 'teachers', label: 'Teachers', icon: Users },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [isSignupMode, setIsSignupMode] = useState(false);

  const handleLoginSuccess = (userData: AuthUser) => {
    setUser({
      id: userData.id,
      username: userData.username,
      role: userData.role as 'student' | 'instructor' | 'admin' | 'super_admin',
      full_name: userData.username,
      email: userData.email,
      institution: userData.institution_id,
    });
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('access_token');
  };

  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>(undefined);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const handleNavigate = (tabId: string, courseId?: string) => {
    setActiveTab(tabId);
    if (courseId) {
      setSelectedCourseId(courseId);
    }
  };

  const renderContent = () => {
    // Show signup or login based on mode
    if (!user) {
      if (isSignupMode) {
        return (
          <Signup onBackToLogin={() => setIsSignupMode(false)} />
        );
      }
      return (
        <EnhancedLogin
          onLoginSuccess={handleLoginSuccess}
          onSignupClick={() => setIsSignupMode(true)}
        />
      );
    }

    if (user.role === 'student') {
      return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={studentTabs}
          />

          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            <Header
              userName={user.full_name}
              userRole={user.role}
              institutionName={user.institution || 'Institution'}
            />

            <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
              {activeTab === 'home' && <StudentHome onNavigate={handleNavigate} />}
              {activeTab === 'enrolled-sections' && <EnrolledSections onSectionSelect={(sectionId) => {
                setSelectedSectionId(sectionId);
              }} />}
              {activeTab === 'course-overview' && selectedSectionId && (
                <SectionOverview sectionId={selectedSectionId} />
              )}
              {activeTab === 'chat' && (
                <ChatInterface
                  courseId={selectedCourseId}
                  onNavigate={handleNavigate}
                />
              )}
              {activeTab === 'assignments' && <StudentAssignments />}
              {activeTab === 'assignment-manager' && <StudentAssignmentManager />}
              {activeTab === 'flashcards' && <StudentFlashcards />}
              {activeTab === 'quiz' && <StudentQuizzes />}
            </div>
          </main>

          <MobileNav
            tabs={studentTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      );
    }


    if (user.role === 'instructor') {
      return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={instructorTabs}
          />
          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            <Header
              userName={user.full_name}
              userRole={user.role}
              institutionName={user.institution || 'Institution'}
            />
            <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
              {activeTab === 'home' && <InstructorHome user={user} onNavigate={handleNavigate} />}
              {activeTab === 'classes' && <ClassManager />}
              {activeTab === 'sections' && (
                <EnhancedSectionManager
                  onSectionSelect={(sectionId) => {
                    setSelectedSectionId(sectionId);
                  }}
                />
              )}

              {activeTab === 'attendance-report' && (
                <AttendanceReportView />
              )}
              {activeTab === 'attendance' && <AttendanceManager sectionId={selectedSectionId || ""} />}
              {activeTab === 'courses' && <CourseManager />}
              {activeTab === 'quizzes' && <QuizCreator />}
              {activeTab === 'flashcards' && <FlashcardManager />}
              {activeTab === 'lesson-plans' && <LessonPlanner />}
              {activeTab === 'assignments' && <AssignmentManager />}
              {activeTab === 'analytics' && <AnalyticsDashboard />}
            </div>
          </main>
          <MobileNav
            tabs={instructorTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      );
    }

    // Super Admin Dashboard
    if (user.role === 'super_admin') {
      return <SuperAdminDashboard />;
    }

    // Admin Dashboard
    if (user.role === 'admin') {
      return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={adminTabs}
          />
          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            <Header
              userName={user.full_name}
              userRole={user.role}
              institutionName={user.institution || "Gyana University"}
            />
            <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
              {activeTab === 'home' && (
                <div className="text-center">
                  <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
                  <p className="text-gray-600">Welcome to the admin panel</p>
                </div>
              )}
              {activeTab === 'teachers' && <AdminTeacherManager />}
              {activeTab === 'courses' && <CourseManager />}
              {activeTab === 'users' && (
                <div className="text-center">
                  <h1 className="text-2xl font-bold">User Management</h1>
                  <p className="text-gray-600">Coming soon...</p>
                </div>
              )}
              {activeTab === 'settings' && (
                <div className="text-center">
                  <h1 className="text-2xl font-bold">Settings</h1>
                  <p className="text-gray-600">Coming soon...</p>
                </div>
              )}
            </div>
          </main>
          <MobileNav
            tabs={adminTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      );
    }

    // Fallback for other roles for now
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 dark:text-white flex flex-col items-center justify-center p-4 transition-colors duration-200">
        <h1 className="text-2xl font-bold mb-4">Welcome, {user.full_name}!</h1>
        <p className="text-gray-600 mb-8">Dashboard for {user.role} is under construction.</p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          Logout
        </button>
      </div>
    );
  };

  return renderContent();
}

export default App;
