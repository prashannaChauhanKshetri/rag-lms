import React, { useState } from 'react';
import { User, Lock, ArrowRight, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '../../lib/api';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    full_name: string;
    role: string;
    institution_id: string;
    institution_name?: string;
  };
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

interface LoginProps {
  onLoginSuccess?: (user: AuthUser) => void;
  onSignupClick?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onSignupClick }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!credentials.username || !credentials.password) {
      setError('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', {
        username: credentials.username,
        password: credentials.password,
      }) as LoginResponse;

      if (onLoginSuccess) {
        onLoginSuccess(response.user);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Invalid username or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!forgotPasswordEmail) {
      setForgotPasswordMessage('Please enter your email address');
      return;
    }

    setForgotPasswordLoading(true);
    setForgotPasswordMessage('');

    try {
      await api.post('/auth/forgot-password', { email: forgotPasswordEmail });
      setForgotPasswordMessage('Password reset link sent. Check your inbox.');
      setForgotPasswordEmail('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setForgotPasswordMessage(
        error.response?.data?.detail || 'Failed to send reset link. Please try again.'
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  // ── Forgot Password view ──────────────────────────────────────────────────
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#064E3B] to-[#0D7552] dark:from-[#052e25] dark:to-[#0a4a3a] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Reset Password</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Enter your email to receive a password reset link</p>
            </div>

            {forgotPasswordMessage && (
              <div
                className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${forgotPasswordMessage.includes('sent')
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/40'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40'
                  }`}
              >
                <AlertCircle
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${forgotPasswordMessage.includes('sent') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                />
                <p
                  className={`text-sm ${forgotPasswordMessage.includes('sent') ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                    }`}
                >
                  {forgotPasswordMessage}
                </p>
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={e => setForgotPasswordEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={forgotPasswordLoading}
                className="w-full py-3 bg-gradient-to-r from-[#10B981] to-[#059669] text-white rounded-xl hover:shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {forgotPasswordLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <button
              onClick={() => {
                setShowForgotPassword(false);
                setForgotPasswordMessage('');
                setForgotPasswordEmail('');
              }}
              className="w-full py-3 text-center text-[#10B981] hover:text-[#059669] font-medium transition-colors mt-4"
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main login view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#064E3B] to-[#0D7552] dark:from-[#052e25] dark:to-[#0a4a3a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 lg:p-10">

          {/* Brand */}
          <div className="text-center mb-6">
            <div className="w-24 h-24 mx-auto mb-2 flex items-center justify-center">
              <img src="/logo.png" alt="Gyana" className="w-full h-full object-contain scale-[2.2] drop-shadow-sm" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Gyana</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Learning with Intelligence</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <User className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  name="username"
                  value={credentials.username}
                  onChange={handleInputChange}
                  placeholder="Enter your username"
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-[#10B981] hover:text-[#059669] font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Lock className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={credentials.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  className="w-full pl-12 pr-12 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-[#10B981] to-[#059669] text-white rounded-xl hover:shadow-lg hover:shadow-green-500/30 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Signup */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Don't have an account?</p>
            <button
              onClick={onSignupClick}
              className="w-full py-2.5 text-[#10B981] hover:text-[#059669] font-medium transition-colors border border-[#10B981] rounded-xl hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              Create Account
            </button>
          </div>


        </div>
      </div>
    </div>
  );
};

export default Login;
