import React, { useState } from 'react';
import { X, User, Mail, Building2, Shield, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';

interface ProfileUser {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role: string;
    institution?: string;
}

interface ProfileModalProps {
    user: ProfileUser;
    isOpen: boolean;
    onClose: () => void;
    /** If true, shows editable full_name + email fields */
    canEdit?: boolean;
}

const roleColor: Record<string, string> = {
    student: 'bg-green-100 text-green-800',
    instructor: 'bg-blue-100 text-blue-800',
    admin: 'bg-purple-100 text-purple-800',
    super_admin: 'bg-rose-100 text-rose-800',
};

const roleLabel: Record<string, string> = {
    student: 'Student',
    instructor: 'Instructor',
    admin: 'Admin',
    super_admin: 'Super Admin',
};

export function ProfileModal({ user, isOpen, onClose, canEdit = false }: ProfileModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [fullName, setFullName] = useState(user.full_name);
    const [email, setEmail] = useState(user.email);
    const [isSaving, setIsSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const initial = (user.full_name || user.username || '?').charAt(0).toUpperCase();

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/auth/profile', { full_name: fullName, email });
            setSuccess('Profile updated successfully');
            setIsEditing(false);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setError(e.response?.data?.detail || 'Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setFullName(user.full_name);
        setEmail(user.email);
        setIsEditing(false);
        setError('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">My Profile</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Avatar + Role */}
                <div className="flex flex-col items-center gap-3 pt-6 pb-2">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-green-500/30">
                        {initial}
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{user.full_name || user.username}</p>
                        <span className={`inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${roleColor[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
                            {roleLabel[user.role] ?? user.role}
                        </span>
                    </div>
                </div>

                {/* Status messages */}
                {success && (
                    <div className="mx-6 mt-3 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        {success}
                    </div>
                )}
                {error && (
                    <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Info Fields */}
                <div className="p-6 space-y-4">
                    <InfoRow
                        icon={<User className="w-4 h-4" />}
                        label="Username"
                        value={user.username}
                        readOnly
                    />

                    <InfoRow
                        icon={<User className="w-4 h-4" />}
                        label="Full Name"
                        value={fullName}
                        readOnly={!isEditing}
                        onChange={setFullName}
                    />

                    <InfoRow
                        icon={<Mail className="w-4 h-4" />}
                        label="Email"
                        value={email}
                        readOnly={!isEditing}
                        onChange={setEmail}
                        type="email"
                    />

                    {user.institution && (
                        <InfoRow
                            icon={<Building2 className="w-4 h-4" />}
                            label="Institution"
                            value={user.institution}
                            readOnly
                        />
                    )}

                    <InfoRow
                        icon={<Shield className="w-4 h-4" />}
                        label="Role"
                        value={roleLabel[user.role] ?? user.role}
                        readOnly
                    />
                </div>

                {/* Footer Actions */}
                {canEdit && (
                    <div className="px-6 pb-6 flex gap-3">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={handleCancel}
                                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                                >
                                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    <Save className="w-4 h-4" />
                                    Save
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => { setIsEditing(true); setSuccess(''); }}
                                className="w-full px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium transition-colors"
                            >
                                Edit Profile
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

interface InfoRowProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    readOnly?: boolean;
    onChange?: (val: string) => void;
    type?: string;
}

function InfoRow({ icon, label, value, readOnly = true, onChange, type = 'text' }: InfoRowProps) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
                <span className="text-gray-400">{icon}</span>
                {label}
            </label>
            {readOnly ? (
                <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 font-medium">
                    {value || '—'}
                </p>
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                    className="w-full px-3 py-2 border border-green-300 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                />
            )}
        </div>
    );
}
