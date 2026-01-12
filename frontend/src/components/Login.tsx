import React, { useState } from 'react';
import { User, Lock, LogIn, GraduationCap, BookOpen, Shield, Building2, Eye, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

// Import logo from public folder
const LOGO_PATH = "/logo.jpg";

interface LoginProps {
    onLoginSuccess: (userData: {
        id: string;
        username: string;
        full_name: string;
        email: string;
        role: 'student' | 'instructor' | 'admin';
        institution?: string;
    }) => void;
}

type UserRole = 'student' | 'instructor' | 'admin';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [selectedRole, setSelectedRole] = useState<UserRole>('student');
    const [selectedInstitution, setSelectedInstitution] = useState('');
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const institutions = [
        'Harvard University',
        'Stanford University',
        'MIT',
        'Oxford University',
        'Cambridge University',
        'Yale University',
        'Princeton University',
        'Columbia University'
    ];

    const roles = [
        {
            id: 'student' as const,
            title: 'Student',
            description: 'Access courses, chat with AI, and take quizzes',
            icon: GraduationCap,
            color: 'from-blue-500 to-blue-600',
            activeColor: 'text-blue-600',
            borderColor: 'border-blue-200'
        },
        {
            id: 'instructor' as const,
            title: 'Instructor',
            description: 'Manage courses, create content, and grade students',
            icon: BookOpen,
            color: 'from-green-500 to-green-600',
            activeColor: 'text-green-600',
            borderColor: 'border-green-200'
        },
        {
            id: 'admin' as const,
            title: 'Admin',
            description: 'System analytics, user management, and monitoring',
            icon: Shield,
            color: 'from-purple-500 to-purple-600',
            activeColor: 'text-purple-600',
            borderColor: 'border-purple-200'
        }
    ];

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
                credentials: 'include',
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Login failed');
            }

            if (rememberMe && data.access_token) {
                localStorage.setItem('access_token', data.access_token);
            }

            onLoginSuccess({ ...data.user, institution: selectedInstitution });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred during login');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#064E3B] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background patterns */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none"></div>

            {/* Showcase Badge */}
            <div className="fixed top-4 right-4 z-50 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl flex items-center gap-2 border border-white/20">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Gyana v1.0</span>
            </div>

            <div className="w-full max-w-6xl relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    {/* Left Side - Branding */}
                    <div className="text-center lg:text-left">
                        <div className="flex flex-col items-center lg:items-start mb-8">
                            <div className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-6 p-4">
                                <img src={LOGO_PATH} alt="Gyana Logo" className="w-full h-full object-contain" />
                            </div>
                            <div>
                                <h1 className="text-6xl font-bold text-white mb-2 tracking-tight">Gyana</h1>
                                <p className="text-xl text-[#10B981] font-medium">AI-Powered Learning Platform</p>
                            </div>
                        </div>

                        <div className="space-y-6 max-w-md mx-auto lg:mx-0 hidden lg:block">
                            <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                <div className="w-12 h-12 bg-[#10B981] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-500/20">
                                    <GraduationCap className="w-6 h-6 text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-white text-lg font-semibold mb-1">Smart Learning</h3>
                                    <p className="text-sm text-white/70">RAG-powered AI assistance with source citations from your textbooks.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                <div className="w-12 h-12 bg-[#10B981] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-500/20">
                                    <BookOpen className="w-6 h-6 text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-white text-lg font-semibold mb-1">Auto-Generate Content</h3>
                                    <p className="text-sm text-white/70">Create lesson plans, quizzes, and flashcards instantly with AI.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side - Login Form */}
                    <div className="bg-white rounded-3xl shadow-2xl p-8 lg:p-10 backdrop-blur-xl border border-white/20">
                        {/* Institution Selection */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Select Institution</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-[#10B981]">
                                    <Building2 className="w-5 h-5 text-gray-400" />
                                </div>
                                <select
                                    value={selectedInstitution}
                                    onChange={(e) => setSelectedInstitution(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent text-gray-900 appearance-none cursor-pointer transition-all hover:bg-gray-50/80"
                                >
                                    <option value="">Choose your university...</option>
                                    {institutions.map((institution) => (
                                        <option key={institution} value={institution}>
                                            {institution}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Role Selection */}
                        <div className="mb-8">
                            <label className="block text-sm font-medium text-gray-700 mb-3">I am a...</label>
                            <div className="grid grid-cols-3 gap-3">
                                {roles.map((role) => {
                                    const Icon = role.icon;
                                    const isSelected = selectedRole === role.id;
                                    return (
                                        <button
                                            key={role.id}
                                            type="button"
                                            onClick={() => setSelectedRole(role.id)}
                                            className={cn(
                                                "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 relative overflow-hidden",
                                                isSelected
                                                    ? `border-[#10B981] bg-[#10B981]/5 shadow-sm`
                                                    : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center transition-transform",
                                                isSelected ? "bg-[#10B981] text-white scale-110" : "bg-gray-100 text-gray-500"
                                            )}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <p className={cn(
                                                "text-xs font-semibold",
                                                isSelected ? "text-[#10B981]" : "text-gray-500"
                                            )}>
                                                {role.title}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                                    <Shield className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Username or Email</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-[#10B981]">
                                        <User className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        placeholder="Enter your username"
                                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent text-gray-900 placeholder:text-gray-400 transition-all"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-[#10B981]">
                                        <Lock className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        placeholder="••••••••"
                                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent text-gray-900 placeholder:text-gray-400 transition-all font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="w-4 h-4 text-[#10B981] rounded border-gray-300 focus:ring-[#10B981] accent-[#10B981] cursor-pointer"
                                    />
                                    <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Remember me</span>
                                </label>
                                <button type="button" className="text-sm font-medium text-[#10B981] hover:text-[#059669] hover:underline transition-colors">
                                    Forgot Password?
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 bg-gradient-to-r from-[#10B981] to-[#059669] text-white rounded-xl hover:shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2 group font-semibold text-lg disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Signing in...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Sign In</span>
                                        <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Demo Credentials */}
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                                <p className="text-xs font-semibold text-blue-800 mb-2 uppercase tracking-wider">Demo Access</p>
                                <div className="flex gap-4 text-xs text-blue-700 font-mono">
                                    <span>User: <span className="font-bold">demo</span></span>
                                    <span>Pass: <span className="font-bold">demo123</span></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
