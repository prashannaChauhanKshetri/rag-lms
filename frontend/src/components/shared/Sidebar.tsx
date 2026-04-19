import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Menu, X } from 'lucide-react';

interface SidebarProps {
    activeTab: string;
    onTabChange: (id: string) => void;
    tabs: {
        id: string;
        label: string;
        icon: LucideIcon;
    }[];
}

export function Sidebar({ activeTab, onTabChange, tabs }: SidebarProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isOpen}
                className="fixed top-4 left-4 z-50 lg:hidden bg-emerald-900 dark:bg-gray-900 text-white p-3 rounded-xl shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
                {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                aria-label="Primary navigation"
                className={cn(
                    "fixed lg:sticky top-0 left-0 h-screen bg-emerald-900 dark:bg-gray-900 text-white transition-all duration-300 z-40 flex flex-col w-64 flex-shrink-0 border-r border-white/10 dark:border-gray-800",
                    isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                )}>
                <div className="p-6 border-b border-white/10 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden shrink-0">
                            <img src="/logo.png" alt="Gyana" className="w-full h-full object-contain scale-[1.7]" />
                        </div>
                        <div>
                            <span className="font-bold text-xl block">Gyana</span>
                            <span className="text-xs text-white/60">AI-Powered Learning</span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    onTabChange(tab.id);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                    activeTab === tab.id
                                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                        : "text-white/70 hover:text-white hover:bg-white/10"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="font-medium">{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>

            </aside>
        </>
    );
}

