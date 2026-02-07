import { useState, useRef } from 'react';
import { api } from '../../lib/api';
import {
  Upload,
  X,
  Check,
  AlertCircle,
  Loader2,
  Users,
  Download,
} from 'lucide-react';

interface EnrollmentManagerProps {
  sectionId: string;
  sectionName: string;
}

export function EnrollmentManager({
  sectionId,
  sectionName,
}: EnrollmentManagerProps) {
  const [bulkInput, setBulkInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'add' | 'list'>('add');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk enroll students
  const bulkEnroll = async () => {
    if (!bulkInput.trim()) {
      setError('Please enter student IDs');
      return;
    }

    try {
      setIsLoading(true);
      const studentIds = bulkInput
        .split('\n')
        .map((id: string) => id.trim())
        .filter((id: string) => id);

      await api.post<{
        enrolled: string[];
        skipped: Array<{ student_id: string; reason: string }>;
      }>(`/instructor/sections/${sectionId}/bulk-enroll`, {
        student_ids: studentIds,
      });

      setSuccessMessage(
        `Enrolled ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}`
      );
      setBulkInput('');
      setError(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setError(`Bulk enrollment failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle CSV file upload
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());

      // Extract student IDs (assuming CSV with student_id in first column or line-separated)
      const studentIds = lines
        .map((line) => {
          const id = line.split(',')[0]?.trim().toLowerCase();
          return id;
        })
        .filter((id) => id);

      setBulkInput(studentIds.join('\n'));
      setError(null);
    } catch {
      setError('Failed to parse CSV file');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Manage Enrollment
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Section: <span className="font-medium">{sectionName}</span>
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {error}
            </p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              {successMessage}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('add')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'add'
              ? 'border-emerald-600 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          <Upload className="h-4 w-4 inline mr-2" />
          Add Students
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-emerald-600 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          <Users className="h-4 w-4 inline mr-2" />
          Enrolled Students
        </button>
      </div>

      {/* Add Students Tab */}
      {activeTab === 'add' && (
        <div className="space-y-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manual Input */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Paste Student IDs (one per line)
                </label>
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="student_1&#10;student_2&#10;student_3"
                  className="w-full h-48 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent"
                />
              </div>
              <button
                onClick={bulkEnroll}
                disabled={isLoading || !bulkInput.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enrolling...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Bulk Enroll
                  </>
                )}
              </button>
            </div>

            {/* File Upload */}
            <div className="space-y-3 flex flex-col">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Or upload CSV file
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Download className="h-8 w-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Click to upload
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    CSV or TXT file with one ID per line
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          {bulkInput && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Preview ({bulkInput.split('\n').filter((l) => l.trim()).length} IDs)
              </p>
              <div className="max-h-24 overflow-y-auto text-xs text-gray-700 dark:text-gray-300 space-y-1">
                {bulkInput
                  .split('\n')
                  .filter((l) => l.trim())
                  .slice(0, 5)
                  .map((id, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-gray-400 dark:text-gray-600">•</span>
                      <code className="font-mono">{id.trim()}</code>
                    </div>
                  ))}
                {bulkInput.split('\n').filter((l) => l.trim()).length > 5 && (
                  <p className="text-gray-500 dark:text-gray-400">
                    ... and{' '}
                    {bulkInput.split('\n').filter((l) => l.trim()).length - 5}{' '}
                    more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enrolled Students Tab */}
      {activeTab === 'list' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-12">
            Enrolled students will appear here. Students are added when you use
            the "Add Students" tab.
          </p>
        </div>
      )}
    </div>
  );
}
