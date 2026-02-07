import React, { useState, useCallback } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  ArrowRight,
  Settings,
} from 'lucide-react';
import { api } from '../../lib/api';

interface EnrollmentData {
  username: string;
  email: string;
  full_name: string;
  department?: string;
}

type StepType = 'method' | 'data' | 'review' | 'success';

const StudentEnrollmentWizard: React.FC = () => {
  const [step, setStep] = useState<StepType>('method');
  const [enrollmentMethod, setEnrollmentMethod] = useState<'csv' | 'manual'>('csv');

  const [students, setStudents] = useState<EnrollmentData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');


  // Manual entry
  const [manualEntry, setManualEntry] = useState<EnrollmentData>({
    username: '',
    email: '',
    full_name: '',
    department: '',
  });

  const handleCSVUpload = useCallback((file: File) => {
    setError('');

    // Parse CSV
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const lines = content.split('\n');
        const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
        const parsed: EnrollmentData[] = [];

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;

          const values = lines[i].split(',').map((v) => v.trim());
          const student: EnrollmentData = {
            username: values[headers.indexOf('username')] || '',
            email: values[headers.indexOf('email')] || '',
            full_name: values[headers.indexOf('full_name')] || values[headers.indexOf('name')] || '',
            department: values[headers.indexOf('department')] || '',
          };

          if (student.username && student.email && student.full_name) {
            parsed.push(student);
          }
        }

        if (parsed.length === 0) {
          setError('No valid student records found in CSV');
          return;
        }

        setStudents(parsed);
        setStep('review');
      } catch {
        setError('Failed to parse CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleAddManual = () => {
    if (!manualEntry.username || !manualEntry.email || !manualEntry.full_name) {
      setError('Please fill in all required fields');
      return;
    }

    setStudents([...students, manualEntry]);
    setManualEntry({ username: '', email: '', full_name: '', department: '' });
  };

  const handleRemoveStudent = (index: number) => {
    setStudents(students.filter((_, i) => i !== index));
  };

  const handleEnroll = async () => {
    setIsProcessing(true);
    setError('');

    try {
      await api.post('/admin/institution/enroll-bulk', { students });
      setStep('success');
      setStudents([]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to enroll students');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'Username,Email,Full Name,Department\nstudent1,student1@example.com,John Doe,Engineering\nstudent2,student2@example.com,Jane Smith,Science';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enrollment_template.csv';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Enroll Students</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Bulk import or manually add students to your institution</p>
        </div>

        {/* Step Indicator */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {['method', 'data', 'review', 'success'].map((s, idx, arr) => (
              <React.Fragment key={s}>
                <div
                  className={`flex-1 h-1 sm:h-2 rounded-full ${
                    arr.indexOf(step) >= idx ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              </React.Fragment>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs sm:text-sm font-medium text-gray-600">
            <span className={step === 'method' ? 'text-blue-600' : ''}>Method</span>
            <span className={step === 'data' ? 'text-blue-600' : ''}>Data</span>
            <span className={step === 'review' ? 'text-blue-600' : ''}>Review</span>
            <span className={step === 'success' ? 'text-blue-600' : ''}>Done</span>
          </div>
        </div>

        {/* Error/Success Alerts */}
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-red-700">{error}</p>
          </div>
        )}

        {/* Step 1: Method Selection */}
        {step === 'method' && (
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Choose an enrollment method</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* CSV Upload */}
              <button
                onClick={() => setEnrollmentMethod('csv')}
                className={`p-6 rounded-lg border-2 transition-all text-left ${
                  enrollmentMethod === 'csv'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <Upload className={`w-8 h-8 mb-3 ${enrollmentMethod === 'csv' ? 'text-blue-600' : 'text-gray-400'}`} />
                <h3 className="font-bold text-gray-900 mb-1">CSV Upload</h3>
                <p className="text-sm text-gray-600">Import multiple students at once from a CSV file</p>
              </button>

              {/* Manual Entry */}
              <button
                onClick={() => setEnrollmentMethod('manual')}
                className={`p-6 rounded-lg border-2 transition-all text-left ${
                  enrollmentMethod === 'manual'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <Settings className={`w-8 h-8 mb-3 ${enrollmentMethod === 'manual' ? 'text-blue-600' : 'text-gray-400'}`} />
                <h3 className="font-bold text-gray-900 mb-1">Manual Entry</h3>
                <p className="text-sm text-gray-600">Add students one by one manually</p>
              </button>
            </div>

            <button
              onClick={() => setStep('data')}
              className="mt-8 w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step 2: Data Input */}
        {step === 'data' && (
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
              {enrollmentMethod === 'csv' ? 'Upload CSV File' : 'Add Students'}
            </h2>

            {enrollmentMethod === 'csv' ? (
              <div>
                {/* CSV Upload Area */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-medium text-gray-900 mb-1">Upload CSV File</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    File should contain: Username, Email, Full Name, Department
                  </p>
                  <label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => e.target.files?.[0] && handleCSVUpload(e.target.files[0])}
                      className="hidden"
                    />
                    <span className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium">
                      Select CSV File
                    </span>
                  </label>
                  <button
                    onClick={downloadTemplate}
                    className="ml-3 px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Template
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Manual Entry Form */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username *</label>
                    <input
                      type="text"
                      value={manualEntry.username}
                      onChange={(e) => setManualEntry({ ...manualEntry, username: e.target.value })}
                      placeholder="student123"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                    <input
                      type="email"
                      value={manualEntry.email}
                      onChange={(e) => setManualEntry({ ...manualEntry, email: e.target.value })}
                      placeholder="student@example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={manualEntry.full_name}
                      onChange={(e) => setManualEntry({ ...manualEntry, full_name: e.target.value })}
                      placeholder="John Doe"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                    <input
                      type="text"
                      value={manualEntry.department}
                      onChange={(e) => setManualEntry({ ...manualEntry, department: e.target.value })}
                      placeholder="Engineering"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <button
                    onClick={handleAddManual}
                    type="button"
                    className="w-full py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
                  >
                    Add Student
                  </button>
                </div>
              </div>
            )}

            {/* Student Count */}
            {students.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-6">
                <p className="text-sm text-blue-900">
                  <strong>{students.length}</strong> student{students.length !== 1 ? 's' : ''} ready to enroll
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep('method')}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Back
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={students.length === 0}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                Review ({students.length})
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 'review' && (
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Review Students</h2>

            {/* Students List */}
            <div className="space-y-3 mb-8 max-h-96 overflow-y-auto">
              {students.map((student, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{student.full_name}</p>
                    <p className="text-sm text-gray-600 truncate">{student.email}</p>
                    {student.department && (
                      <p className="text-xs text-gray-500 truncate">{student.department}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveStudent(idx)}
                    className="ml-4 text-red-600 hover:text-red-800 flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div>
                <p className="text-xs text-blue-700">Total Students</p>
                <p className="text-2xl font-bold text-blue-900">{students.length}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700">With Department</p>
                <p className="text-2xl font-bold text-blue-900">{students.filter((s) => s.department).length}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep('data')}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Back
              </button>
              <button
                onClick={handleEnroll}
                disabled={isProcessing}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                Confirm Enrollment
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Successfully Enrolled!</h2>
            <p className="text-gray-600 mb-8">All students have been added to your institution</p>

            <button
              onClick={() => {
                setStep('method');
                setStudents([]);
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium mx-auto"
            >
              Enroll More Students
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentEnrollmentWizard;
