import { useState, useEffect } from 'react';
import { api } from './lib/api';
import EnhancedLogin from './components/auth/EnhancedLogin';
import Signup from './components/auth/Signup';
import ResetPassword from './components/auth/ResetPassword';
import SuperAdminDashboard from './components/admin/SuperAdminDashboard';
import { RoleShell } from './components/shared/RoleShell';
import { LoadingState } from './components/shared/States';
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
  BarChart3,
  UserPlus,
  ClipboardCheck,
} from 'lucide-react';
import { InstructorHome } from './components/instructor/InstructorHome';
import { QuizCreator } from './components/instructor/QuizCreator';
import { LessonPlanner } from './components/instructor/LessonPlanner';
import { FlashcardManager } from './components/instructor/FlashcardManager';
import { AssignmentManager } from './components/instructor/AssignmentManager';
import { AnalyticsDashboard } from './components/instructor/AnalyticsDashboard';
import AttendanceManager from './components/instructor/AttendanceManager';
import { QuizReviewManager } from './components/instructor/QuizReviewManager';
import { StudentFlashcards } from './components/student/StudentFlashcards';
import { StudentQuizzes } from './components/student/StudentQuizzes';
import { StudentAssignmentManager } from './components/student/StudentAssignmentManager';
import { AdminTeacherManager } from './components/admin/AdminTeacherManager';
import { EnrolledSections } from './components/student/EnrolledSections';
import { SectionOverview } from './components/student/EnhancedCourseOverview';
import { EnhancedSectionManager } from './components/instructor/EnhancedSectionManager';
import { AttendanceReportView } from './components/instructor/AttendanceReportView';
import AdminEnrollmentCenter from './components/admin/AdminEnrollmentCenter';
import AdminClassManager from './components/admin/AdminClassManager';
import AdminCourseManager from './components/admin/AdminCourseManager';
import AdminDashboard from './components/admin/AdminDashboard';
import { StudentSettings } from './components/student/StudentSettings';
import { InstructorSettings } from './components/instructor/InstructorSettings';
import { AdminSettings } from './components/admin/AdminSettings';
import { SuperAdminSettings } from './components/admin/SuperAdminSettings';
import type { ShellTab, ShellUser } from './components/shared/RoleShell';

interface User {
  id: string;
  username: string;
  role: 'student' | 'instructor' | 'admin' | 'super_admin';
  full_name: string;
  email: string;
  institution?: string;
  institution_name?: string;
}

interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  institution_id: string;
  institution_name?: string;
}

const studentTabs: ShellTab[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'enrolled-sections', label: 'Enrolled Subject', icon: BookOpen },
  { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
  { id: 'assignment-manager', label: 'My Submissions', icon: CheckSquare },
  { id: 'quiz', label: 'Quizzes', icon: Brain },
  { id: 'flashcards', label: 'Flashcards', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const instructorTabs: ShellTab[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'sections', label: 'My Classes', icon: Users },
  { id: 'attendance', label: 'Attendance', icon: Calendar },
  { id: 'attendance-report', label: 'Reports', icon: BarChart3 },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'quizzes', label: 'Quiz Creator', icon: HelpCircle },
  { id: 'quiz-review', label: 'Quiz Review', icon: ClipboardCheck },
  { id: 'flashcards', label: 'Flashcards', icon: CreditCard },
  { id: 'lesson-plans', label: 'Lesson Plans', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: CheckSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const adminTabs: ShellTab[] = [
  { id: 'home', label: 'Dashboard', icon: HomeIcon },
  { id: 'courses', label: 'Course Bots', icon: Brain },
  { id: 'classes', label: 'Classes', icon: BookOpen },
  { id: 'teachers', label: 'Teachers', icon: Users },
  { id: 'enrollments', label: 'Enrollments', icon: UserPlus },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SessionResponse {
  id?: string;
  user_id?: string;
  username: string;
  role: string;
  full_name: string;
  email: string;
  institution_id: string;
  institution_name?: string;
}

function toShellUser(user: User): ShellUser {
  return {
    id: user.id,
    full_name: user.full_name,
    role: user.role,
    email: user.email,
    institution: user.institution,
    institution_name: user.institution_name,
  };
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Shared navigation state for views that hand-off IDs between tabs.
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>(undefined);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // On mount: restore session from HTTP-only cookie if still valid.
  useEffect(() => {
    api.get<SessionResponse>('/auth/session')
      .then((data) => {
        setUser({
          id: data.id || data.user_id || '',
          username: data.username,
          role: data.role as User['role'],
          full_name: data.full_name || data.username,
          email: data.email,
          institution: data.institution_id,
          institution_name: data.institution_name || data.institution_id,
        });
      })
      .catch(() => {/* cookie absent or expired — stay on login */})
      .finally(() => setSessionChecked(true));
  }, []);

  const resetToken = new URLSearchParams(window.location.search).get('token');
  const isResetFlow = !!resetToken && !user;

  const handleLoginSuccess = (userData: AuthUser) => {
    setUser({
      id: userData.id,
      username: userData.username,
      role: userData.role as User['role'],
      full_name: userData.full_name || userData.username,
      email: userData.email,
      institution: userData.institution_id,
      institution_name: userData.institution_name || userData.institution_id,
    });
  };

  const handleLogout = () => {
    api.post('/auth/logout', {}).catch(() => {});
    setUser(null);
  };

  const handleNavigate = (tabId: string, courseId?: string) => {
    setActiveTab(tabId);
    if (courseId) setSelectedCourseId(courseId);
  };

  /* ---------- Session loading / pre-auth screens ---------- */

  if (!sessionChecked) {
    return <LoadingState fullHeight label="Loading session…" />;
  }

  if (isResetFlow) {
    return (
      <ResetPassword
        token={resetToken!}
        onBackToLogin={() => window.history.replaceState({}, '', '/')}
      />
    );
  }

  if (!user) {
    if (isSignupMode) {
      return <Signup onBackToLogin={() => setIsSignupMode(false)} />;
    }
    return (
      <EnhancedLogin
        onLoginSuccess={handleLoginSuccess}
        onSignupClick={() => setIsSignupMode(true)}
      />
    );
  }

  /* ---------- Per-role content routing ---------- */

  const shellUser = toShellUser(user);
  const onSettingsClick = () => setActiveTab('settings');

  if (user.role === 'student') {
    const content = (() => {
      switch (activeTab) {
        case 'home':
          return <StudentHome onNavigate={handleNavigate} />;
        case 'enrolled-sections':
          return (
            <EnrolledSections
              onSectionSelect={(sectionId, _, chatbotId) => {
                setSelectedSectionId(sectionId);
                setSelectedSubjectId(chatbotId || null);
                setActiveTab('course-overview');
              }}
            />
          );
        case 'course-overview':
          return selectedSectionId ? (
            <SectionOverview
              sectionId={selectedSectionId}
              chatbotId={selectedSubjectId || undefined}
            />
          ) : null;
        case 'chat':
          return <ChatInterface courseId={selectedCourseId} onNavigate={handleNavigate} />;
        case 'assignment-manager':
          return <StudentAssignmentManager />;
        case 'flashcards':
          return <StudentFlashcards />;
        case 'quiz':
          return <StudentQuizzes />;
        case 'settings':
          return (
            <StudentSettings
              user={{
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                institution_name: user.institution_name,
              }}
              onLogout={handleLogout}
            />
          );
        default:
          return null;
      }
    })();

    return (
      <RoleShell
        user={shellUser}
        tabs={studentTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNavigate={handleNavigate}
        onSettingsClick={onSettingsClick}
        onLogout={handleLogout}
      >
        {content}
      </RoleShell>
    );
  }

  if (user.role === 'instructor') {
    const content = (() => {
      switch (activeTab) {
        case 'home':
          return <InstructorHome user={user} onNavigate={handleNavigate} />;
        case 'sections':
          return (
            <EnhancedSectionManager
              onSectionSelect={(sectionId) => setSelectedSectionId(sectionId)}
            />
          );
        case 'attendance-report':
          return <AttendanceReportView />;
        case 'attendance':
          return <AttendanceManager sectionId={selectedSectionId || ''} />;
        case 'quizzes':
          return <QuizCreator />;
        case 'quiz-review':
          return <QuizReviewManager />;
        case 'flashcards':
          return <FlashcardManager />;
        case 'lesson-plans':
          return <LessonPlanner />;
        case 'assignments':
          return <AssignmentManager />;
        case 'analytics':
          return <AnalyticsDashboard />;
        case 'settings':
          return (
            <InstructorSettings
              user={{
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                institution_name: user.institution_name,
              }}
              onLogout={handleLogout}
            />
          );
        default:
          return null;
      }
    })();

    return (
      <RoleShell
        user={shellUser}
        tabs={instructorTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNavigate={handleNavigate}
        onSettingsClick={onSettingsClick}
        onLogout={handleLogout}
      >
        {content}
      </RoleShell>
    );
  }

  if (user.role === 'super_admin') {
    if (activeTab === 'settings') {
      return (
        <RoleShell
          user={shellUser}
          tabs={[]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSettingsClick={onSettingsClick}
          onLogout={handleLogout}
          hideNav
        >
          <SuperAdminSettings
            user={{
              id: user.id,
              username: user.username,
              full_name: user.full_name,
              email: user.email,
              role: user.role,
            }}
            onLogout={handleLogout}
          />
        </RoleShell>
      );
    }
    return (
      <RoleShell
        user={shellUser}
        tabs={[]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={onSettingsClick}
        onLogout={handleLogout}
        hideNav
      >
        <SuperAdminDashboard />
      </RoleShell>
    );
  }

  if (user.role === 'admin') {
    const content = (() => {
      switch (activeTab) {
        case 'home':
          return <AdminDashboard onNavigate={handleNavigate} />;
        case 'teachers':
          return <AdminTeacherManager />;
        case 'classes':
          return <AdminClassManager />;
        case 'courses':
          return <AdminCourseManager />;
        case 'enrollments':
          return <AdminEnrollmentCenter />;
        case 'settings':
          return (
            <AdminSettings
              user={{
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                institution_name: user.institution_name,
                institution: user.institution,
              }}
              onLogout={handleLogout}
            />
          );
        default:
          return null;
      }
    })();

    return (
      <RoleShell
        user={shellUser}
        tabs={adminTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNavigate={handleNavigate}
        onSettingsClick={onSettingsClick}
        onLogout={handleLogout}
      >
        {content}
      </RoleShell>
    );
  }

  // Fallback for unknown roles
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 dark:text-white flex flex-col items-center justify-center p-4 transition-colors duration-200">
      <h1 className="text-2xl font-bold mb-4">Welcome, {user.full_name}!</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-8">Dashboard for {user.role} is under construction.</p>
      <button
        onClick={handleLogout}
        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
      >
        Logout
      </button>
    </div>
  );
}

export default App;
