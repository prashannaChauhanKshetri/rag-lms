import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Tab {
    id: string;
    label: string;
    icon: LucideIcon;
}

interface MobileNavProps {
    activeTab: string;
    onTabChange: (id: string) => void;
    tabs: Tab[];
}

const VISIBLE_TABS = 4;

export function MobileNav({ activeTab, onTabChange, tabs }: MobileNavProps) {
    const [showMore, setShowMore] = useState(false);

    const primary = tabs.slice(0, VISIBLE_TABS);
    const overflow = tabs.slice(VISIBLE_TABS);
    const activeInOverflow = overflow.some(t => t.id === activeTab);

    // Close the sheet whenever the active tab changes (after user taps an overflow item)
    useEffect(() => {
        setShowMore(false);
    }, [activeTab]);

    // Close on Escape
    useEffect(() => {
        if (!showMore) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowMore(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showMore]);

    const renderTabButton = (tab: Tab, isActive: boolean) => {
        const Icon = tab.icon;
        return (
            <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center gap-1 p-2 min-w-0 flex-1"
            >
                <div className={cn(
                    "p-2 rounded-xl transition-all",
                    isActive ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
                )}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                    "text-[10px] font-medium truncate max-w-full",
                    isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
                )}>
                    {tab.label}
                </span>
            </button>
        );
    };

    return (
        <>
            <nav
                aria-label="Primary navigation"
                className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-40 px-2 py-2 pb-safe"
            >
                <div className="flex justify-between items-center gap-1">
                    {primary.map(tab => renderTabButton(tab, activeTab === tab.id))}
                    {overflow.length > 0 && (
                        <button
                            onClick={() => setShowMore(true)}
                            aria-label="More navigation options"
                            aria-haspopup="menu"
                            aria-expanded={showMore}
                            className="flex flex-col items-center gap-1 p-2 min-w-0 flex-1"
                        >
                            <div className={cn(
                                "p-2 rounded-xl transition-all",
                                activeInOverflow
                                    ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                                    : "text-gray-400 dark:text-gray-500"
                            )}>
                                <MoreHorizontal className="w-5 h-5" />
                            </div>
                            <span className={cn(
                                "text-[10px] font-medium",
                                activeInOverflow ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
                            )}>
                                More
                            </span>
                        </button>
                    )}
                </div>
            </nav>

            {/* Overflow sheet */}
            {showMore && (
                <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More navigation">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowMore(false)}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe shadow-2xl animate-in slide-in-from-bottom duration-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">More</h3>
                            <button
                                onClick={() => setShowMore(false)}
                                aria-label="Close"
                                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {overflow.map(tab => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => onTabChange(tab.id)}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                                            isActive
                                                ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                                : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                        )}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span className="text-[11px] font-medium text-center leading-tight">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
