import { useState } from 'react';
import Login from './components/Login';
import { Sidebar } from './components/shared/Sidebar';
import { MobileNav } from './components/shared/MobileNav';
import { Header } from './components/shared/Header';
import { StudentHome } from './components/student/StudentHome';
import {
  Home as HomeIcon,
  BookOpen,
  MessageSquare,
  FileText,
  CheckSquare,
  Calendar,
  Brain,
  CreditCard
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: 'student' | 'instructor' | 'admin';
  full_name: string;
  email: string;
  institution?: string;
}

const studentTabs = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'courses', label: 'My Courses', icon: BookOpen },
  { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'attendance', label: 'Attendance', icon: CheckSquare },
  { id: 'timetable', label: 'Time-Table', icon: Calendar },
  { id: 'quiz', label: 'Quizzes', icon: Brain },
  { id: 'flashcards', label: 'Flashcards', icon: CreditCard },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    console.log('Login successful:', userData);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('access_token');
  };

  const renderContent = () => {
    if (!user) return <Login onLoginSuccess={handleLoginSuccess} />;

    if (user.role === 'student') {
      return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={studentTabs}
          />

          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            <Header
              userName={user.full_name}
              userRole={user.role}
              userEmail={user.email}
              institutionName={user.institution || "Gyana University"}
            />

            <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
              {activeTab === 'home' && <StudentHome onNavigate={setActiveTab} />}
              {activeTab === 'courses' && <div className="p-8 text-center text-gray-500">My Courses Component Coming Soon...</div>}
              {activeTab === 'chat' && <div className="p-8 text-center text-gray-500">AI Assistant Component Coming Soon...</div>}
              {/* Add other components here */}
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

    // Fallback for other roles for now
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
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
