import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Building2, ArrowRight, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface Institution {
  id: string;
  name: string;
  code: string;
  domain?: string;
  logo_url?: string;
}

interface SignupResponse {
  user_id: string;
  role: string;
  verification_token: string;
  message: string;
}

interface VerifyEmailResponse {
  message: string;
}

interface InstitutionsResponse {
  institutions: Institution[];
}

type SignupStep = 'role-selection' | 'form' | 'verification' | 'success';
type UserRole = 'student' | 'instructor' | 'admin';

interface SignupProps {
  onBackToLogin?: () => void;
}

const Signup: React.FC<SignupProps> = ({ onBackToLogin }) => {
  const [step, setStep] = useState<SignupStep>('role-selection');
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState('');
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
    full_name: '',
  });
  
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch institutions on component mount
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await api.get('/auth/institutions') as InstitutionsResponse;
        setInstitutions(response.institutions || []);
        if (response.institutions?.length > 0) {
          setSelectedInstitution(response.institutions[0].id);
        }
      } catch {
        // Fallback: create a default institution option
        setInstitutions([
          { id: 'default', name: 'Default Institution', code: 'default' }
        ]);
        setSelectedInstitution('default');
      }
    };
    fetchInstitutions();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const validateForm = (): boolean => {
    if (!formData.username || formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      setError('Username can only contain alphanumeric characters, underscore, and hyphen');
      return false;
    }
    if (!formData.email || !formData.email.includes('@')) {
      setError('Please enter a valid email');
      return false;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setError('Password must contain at least one uppercase letter');
      return false;
    }
    if (!/[0-9]/.test(formData.password)) {
      setError('Password must contain at least one number');
      return false;
    }
    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return false;
    }
    if (!formData.full_name) {
      setError('Please enter your full name');
      return false;
    }
    return true;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    setError('');

    try {
      await api.post('/auth/signup', {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        confirm_password: formData.confirm_password,
        full_name: formData.full_name,
        role: selectedRole,
        institution_id: selectedInstitution,
      }) as SignupResponse;

      setSuccess('Signup successful! Please check your email for verification link.');
      setStep('verification');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!verificationCode.trim()) {
      setError('Please enter verification code or token');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.post('/auth/verify-email', {
        token: verificationCode,
      }) as VerifyEmailResponse;

      setSuccess('Email verified successfully! You can now login.');
      setStep('success');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Verification failed. Please check your token.');
    } finally {
      setIsLoading(false);
    }
  };

  // Role Selection Step
  if (step === 'role-selection') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#064E3B] to-[#0D7552] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-3xl shadow-2xl p-8 lg:p-12">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-3">Join Gyana</h1>
              <p className="text-lg text-gray-600">Choose your role to get started</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Student Card */}
              <button
                onClick={() => {
                  setSelectedRole('student');
                  setStep('form');
                }}
                className={`p-6 rounded-2xl border-2 transition-all duration-300 text-left hover:shadow-lg ${
                  selectedRole === 'student'
                    ? 'border-[#10B981] bg-green-50'
                    : 'border-gray-200 bg-white hover:border-[#10B981]'
                }`}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-xl flex items-center justify-center mb-4">
                  <User className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Student</h3>
                <p className="text-gray-600 text-sm">Enroll in courses, submit assignments, and learn</p>
              </button>

              {/* Instructor Card */}
              <button
                onClick={() => {
                  setSelectedRole('instructor');
                  setStep('form');
                }}
                className={`p-6 rounded-2xl border-2 transition-all duration-300 text-left hover:shadow-lg ${
                  selectedRole === 'instructor'
                    ? 'border-[#10B981] bg-green-50'
                    : 'border-gray-200 bg-white hover:border-[#10B981]'
                }`}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-xl flex items-center justify-center mb-4">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Instructor</h3>
                <p className="text-gray-600 text-sm">Create courses, assignments, and manage students</p>
              </button>

              {/* Admin Card */}
              <button
                onClick={() => {
                  setSelectedRole('admin');
                  setStep('form');
                }}
                className={`p-6 rounded-2xl border-2 transition-all duration-300 text-left hover:shadow-lg ${
                  selectedRole === 'admin'
                    ? 'border-[#10B981] bg-green-50'
                    : 'border-gray-200 bg-white hover:border-[#10B981]'
                }`}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-xl flex items-center justify-center mb-4">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Institution Admin</h3>
                <p className="text-gray-600 text-sm">Manage your institution's users and courses</p>
              </button>
            </div>

            <button
              onClick={onBackToLogin}
              className="w-full py-3 text-center text-[#10B981] hover:text-[#059669] font-medium transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Signup Form Step
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#064E3B] to-[#0D7552] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {selectedRole === 'student' && 'Student Signup'}
                {selectedRole === 'instructor' && 'Instructor Signup'}
                {selectedRole === 'admin' && 'Admin Signup'}
              </h2>
              <p className="text-gray-600">Create your account to get started</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-green-700 text-sm">{success}</p>
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              {/* Institution Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Institution <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedInstitution}
                  onChange={(e) => setSelectedInstitution(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                >
                  {institutions.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="johndoe123"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">3+ chars, alphanumeric, underscore, hyphen</p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="john@example.com"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">8+ chars, uppercase, number required</p>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-[#10B981] to-[#059669] text-white rounded-xl hover:shadow-lg hover:shadow-green-500/30 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <button
              onClick={() => setStep('role-selection')}
              className="w-full py-3 text-center text-[#10B981] hover:text-[#059669] font-medium transition-colors mt-4"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Email Verification Step
  if (step === 'verification') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#064E3B] to-[#0D7552] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <Mail className="w-16 h-16 bg-green-100 text-[#10B981] rounded-full p-4 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Verify Your Email</h2>
              <p className="text-gray-600">
                We've sent a verification link to<br />
                <span className="font-semibold">{formData.email}</span>
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleVerifyEmail} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Token / Code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Paste the token from your email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Paste the entire verification token from the email link or enter the code
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-[#10B981] to-[#059669] text-white rounded-xl hover:shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <span>Verify Email</span>
                    <CheckCircle className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs text-blue-700">
                <strong>Testing:</strong> For demo, copy the verification_token from the signup response and paste it above.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success Step
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#064E3B] to-[#0D7552] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Email Verified!</h2>
          <p className="text-gray-600 mb-8">
            Your account has been successfully created and verified. You can now login to Gyana.
          </p>
          
          <button
            onClick={onBackToLogin}
            className="w-full py-3 bg-gradient-to-r from-[#10B981] to-[#059669] text-white rounded-xl hover:shadow-lg hover:shadow-green-500/30 transition-all font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Signup;
