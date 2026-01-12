import { useState } from 'react';
import { CourseManager } from './CourseManager';
import { InstructorHome } from './InstructorHome';
import { QuizCreator } from './QuizCreator';
import { LessonPlanner } from './LessonPlanner';
import {
    BookOpen,
    HelpCircle,
    CreditCard,
    Home, // Added for Home tab
    LayoutDashboard
} from 'lucide-react';
import type { User } from '../../types'; // Import User type

/* 
  Instructor Dashboard Component 
  Manages tab navigation for instructor features.
*/

// Add props to accept User
interface InstructorDashboardProps {
    user?: User; // Optional initially but should be passed often
}

export function InstructorDashboard({ user }: InstructorDashboardProps) {
    const [activeTab, setActiveTab] = useState('home');

    const tabs = [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'courses', label: 'Course Manager', icon: BookOpen },
        { id: 'quizzes', label: 'Quiz Creator', icon: HelpCircle },
        { id: 'lesson-plans', label: 'Lesson Plans', icon: LayoutDashboard }, // Using Layout icon for plans for now
        // { id: 'flashcards', label: 'Flashcards', icon: CreditCard }, // Placeholder
    ];

    // Navigation handler passed to Home
    const handleNavigate = (tabId: string) => setActiveTab(tabId);

    return (
        <div className="h-full flex flex-col">
            <div className="mb-6 flex space-x-4 border-b pb-1 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                            ${activeTab === tab.id
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                        `}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === 'home' && user && <InstructorHome user={user} onNavigate={handleNavigate} />}
                {activeTab === 'courses' && <CourseManager />}
                {activeTab === 'quizzes' && <QuizCreator />}
                {activeTab === 'lesson-plans' && <LessonPlanner />}

                {/* Fallbacks / Placeholders */}
                {activeTab === 'flashcards' && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                            <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Flashcard Management Coming Soon</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
