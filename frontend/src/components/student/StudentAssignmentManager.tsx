import { useState, useEffect } from 'react';
import { FileText, Upload, CheckCircle, Clock, AlertCircle, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Textarea } from '../ui/Textarea';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  points?: number;
  section_id?: string;
  attachment_url?: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  file_name: string;
  submitted_at: string;
  grade?: number;
  feedback?: string;
  score?: number;
  text?: string;
}

export function StudentAssignmentManager() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<{ assignments: Assignment[] }>('/student/assignments');
      setAssignments(data.assignments);
      setError(null);
    } catch (err) {
      setError('Failed to load assignments');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAssignment = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    // Load submissions for this assignment
    try {
      const data = await api.get<{ submissions: Submission[] }>(`/instructor/assignments/${assignment.id}/submissions`);
      setSubmissions(prev => ({
        ...prev,
        [assignment.id]: data.submissions
      }));
    } catch (err) {
      console.error('Failed to load submissions:', err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAssignment || !uploadFile) {
      setError('Please select an assignment and file');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('notes', uploadNotes);

      const data = await api.post<{ submission_id: string; message: string }>(
        `/student/assignments/${selectedAssignment.id}/submit`,
        formData
      );

      setError(null);
      setUploadFile(null);
      setUploadNotes('');

      // Show success message
      alert(`Assignment submitted successfully!\nSubmission ID: ${data.submission_id}`);

      // Refresh submissions
      await handleSelectAssignment(selectedAssignment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit assignment');
    } finally {
      setIsUploading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-foreground">My Assignments</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg border border-red-300 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignments List */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold text-foreground mb-4">Assignments</h2>
          {isLoading ? (
            <p className="text-muted-foreground">Loading assignments...</p>
          ) : assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No assignments yet</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  onClick={() => handleSelectAssignment(assignment)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${selectedAssignment?.id === assignment.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-card text-foreground border border-border hover:border-blue-400'
                    }`}
                >
                  <p className="font-medium truncate">{assignment.title}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs opacity-75">
                    {isOverdue(assignment.due_date) && (
                      <AlertCircle className="w-3 h-3" />
                    )}
                    {!isOverdue(assignment.due_date) && (
                      <Clock className="w-3 h-3" />
                    )}
                    <span>{formatDate(assignment.due_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignment Details & Submission */}
        <div className="lg:col-span-2">
          {selectedAssignment ? (
            <div className="space-y-6">
              {/* Assignment Info */}
              <Card className="rounded-lg p-6" elevated>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">{selectedAssignment.title}</h3>
                    <div className={`flex items-center gap-2 mt-2 text-sm ${isOverdue(selectedAssignment.due_date)
                      ? 'text-red-600 dark:text-red-300'
                      : 'text-blue-600 dark:text-blue-300'
                      }`}>
                      {isOverdue(selectedAssignment.due_date) ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      <span>
                        {isOverdue(selectedAssignment.due_date) ? 'Overdue' : 'Due'}: {' '}
                        {formatDate(selectedAssignment.due_date)}
                      </span>
                    </div>
                  </div>
                  {selectedAssignment.points && (
                    <div className="text-right">
                      <p className="text-3xl font-bold text-foreground">{selectedAssignment.points}</p>
                      <p className="text-xs text-muted-foreground">points</p>
                    </div>
                  )}
                </div>

                {selectedAssignment.description && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="font-semibold text-foreground mb-2">Description</h4>
                    <p className="text-muted-foreground text-sm leading-relaxed">{selectedAssignment.description}</p>
                  </div>
                )}

                {selectedAssignment.attachment_url && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="font-semibold text-foreground mb-2">Instructor Attachment</h4>
                    <a
                      href={`${api.getBaseUrl()}/${selectedAssignment.attachment_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-200 dark:border-blue-900/40 w-fit"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Attachment</span>
                    </a>
                  </div>
                )}
              </Card>

              {/* Upload Section */}
              <Card className="rounded-lg p-6" elevated>
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Submit Your Work
                </h4>

                <div className="space-y-4">
                  {/* File Input */}
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      className="w-full"
                      accept=".pdf,.doc,.docx,.xlsx,.txt,.ppt,.pptx,.zip"
                    />
                    {uploadFile && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-green-600 dark:text-green-300">
                        <CheckCircle className="w-5 h-5" />
                        <span>{uploadFile.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <Textarea
                    placeholder="Add notes or comments about your submission (optional)"
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    rows={3}
                  />

                  {/* Submit Button */}
                  <Button
                    onClick={handleSubmit}
                    disabled={!uploadFile || isUploading}
                    className={`w-full ${uploadFile && !isUploading
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-300 cursor-not-allowed'
                      }`}
                  >
                    {isUploading ? 'Uploading...' : 'Submit Assignment'}
                  </Button>
                </div>
              </Card>

              {/* Submission History */}
              {submissions[selectedAssignment.id] && submissions[selectedAssignment.id].length > 0 && (
                <Card className="rounded-lg p-6" elevated>
                  <h4 className="font-semibold text-foreground mb-4">Submission History</h4>
                  <div className="space-y-3">
                    {submissions[selectedAssignment.id].map((sub) => (
                      <div key={sub.id} className="p-3 bg-muted/40 rounded-lg border border-border">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-foreground">{sub.file_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Submitted: {formatDate(sub.submitted_at)}
                            </p>
                            {sub.feedback && (
                              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-900/40">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Feedback:</p>
                                <p className="text-xs text-blue-600 dark:text-blue-300">{sub.feedback}</p>
                              </div>
                            )}
                          </div>
                          {typeof sub.grade === 'number' && (
                            <div className="text-right">
                              <p className="text-2xl font-bold text-blue-600">{sub.grade}</p>
                              <p className="text-xs text-muted-foreground">grade</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <Card className="p-12 rounded-lg text-center" elevated>
              <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">Select an assignment to submit</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
