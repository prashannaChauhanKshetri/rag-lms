import React, { useState } from 'react';
import './Login.css';

interface LoginProps {
    onLoginSuccess: (userData: any) => void;
}

type UserRole = 'student' | 'instructor' | 'admin';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [selectedRole, setSelectedRole] = useState<UserRole>('student');
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError(''); // Clear error on input change
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
                credentials: 'include', // Important for cookies
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Login failed');
            }

            // Store token if remember me is checked
            if (rememberMe && data.access_token) {
                localStorage.setItem('access_token', data.access_token);
            }

            // Call success callback with user data
            onLoginSuccess(data.user);
        } catch (err: any) {
            setError(err.message || 'An error occurred during login');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = () => {
        // TODO: Implement Google OAuth
        alert('Google Sign-In coming soon!');
    };

    return (
        <div className="login-page">
            {/* Background Gradient Orbs */}
            <div className="bg-orb orb-1"></div>
            <div className="bg-orb orb-2"></div>
            <div className="bg-orb orb-3"></div>

            {/* Login Container */}
            <div className="login-container animate-slide-up">
                {/* Logo Header */}
                <div className="login-header">
                    <div className="logo-wrapper">
                        <img src="/logo.jpg" alt="Gyana Logo" className="logo-img" />
                    </div>
                    <h1 className="login-title">Gyana</h1>
                    <p className="login-subtitle">AI-Powered Learning Platform</p>
                </div>

                {/* Role Selection Tabs */}
                <div className="role-tabs">
                    <button
                        type="button"
                        className={`role-tab ${selectedRole === 'student' ? 'active' : ''}`}
                        onClick={() => setSelectedRole('student')}
                    >
                        Student
                    </button>
                    <button
                        type="button"
                        className={`role-tab ${selectedRole === 'instructor' ? 'active' : ''}`}
                        onClick={() => setSelectedRole('instructor')}
                    >
                        Instructor
                    </button>
                    <button
                        type="button"
                        className={`role-tab ${selectedRole === 'admin' ? 'active' : ''}`}
                        onClick={() => setSelectedRole('admin')}
                    >
                        Admin
                    </button>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="login-form">
                    {/* Google Sign In Button */}
                    <button
                        type="button"
                        className="btn-google"
                        onClick={handleGoogleSignIn}
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                            <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853" />
                            <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                            <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
                        </svg>
                        Sign in with Google
                    </button>

                    <div className="divider">
                        <span>or</span>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="error-banner">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z" fill="currentColor" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* Email Input */}
                    <div className="input-group">
                        <label htmlFor="username" className="input-label">
                            Email or Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            className="input"
                            placeholder="Enter your email or username"
                            value={formData.username}
                            onChange={handleInputChange}
                            required
                        />
                    </div>

                    {/* Password Input */}
                    <div className="input-group">
                        <label htmlFor="password" className="input-label">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            className="input"
                            placeholder="Enter your password"
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                        />
                    </div>

                    {/* Remember Me & Forgot Password */}
                    <div className="form-options">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            <span>Remember me</span>
                        </label>
                        <a href="#" className="forgot-link">
                            Forgot Password?
                        </a>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className="btn btn-primary btn-submit"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="spinner"></span>
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                {/* Demo Credentials */}
                <div className="demo-credentials">
                    <p className="demo-title">Demo Credentials:</p>
                    <p className="demo-text">Email: demo@gyana.edu • Password: demo123</p>
                </div>
            </div>

            {/* Footer */}
            <footer className="login-footer">
                <p>© 2026 Gyana • AI-Powered Learning</p>
            </footer>
        </div>
    );
};

export default Login;
