import { AlertCircle, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface LoadingStateProps {
    label?: string;
    fullHeight?: boolean;
    className?: string;
}

export function LoadingState({ label = 'Loading…', fullHeight = false, className }: LoadingStateProps) {
    return (
        <div
            className={cn(
                'flex items-center justify-center',
                fullHeight ? 'min-h-screen' : 'h-96',
                className,
            )}
        >
            <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">{label}</p>
            </div>
        </div>
    );
}

interface ErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
    retryLabel?: string;
    className?: string;
}

export function ErrorState({
    title = 'Something went wrong',
    message,
    onRetry,
    retryLabel = 'Try again',
    className,
}: ErrorStateProps) {
    return (
        <div
            className={cn(
                'max-w-xl mx-auto mt-16 p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl flex items-start gap-4',
                className,
            )}
            role="alert"
        >
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
                <p className="font-semibold text-red-800 dark:text-red-200">{title}</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{message}</p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-3 text-sm font-medium text-red-700 dark:text-red-300 underline hover:text-red-900 dark:hover:text-red-100"
                    >
                        {retryLabel}
                    </button>
                )}
            </div>
        </div>
    );
}

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-10 text-center',
                className,
            )}
        >
            {Icon && <Icon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />}
            <p className="text-gray-500 dark:text-gray-400">{title}</p>
            {description && (
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
