import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Menu, X, Settings } from 'lucide-react';

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
                className="fixed top-4 left-4 z-50 lg:hidden bg-[#064E3B] text-white p-3 rounded-xl shadow-lg"
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
            <aside className={cn(
                "fixed lg:sticky top-0 left-0 h-screen bg-[#064E3B] text-white transition-transform duration-300 z-40 flex flex-col w-64 flex-shrink-0",
                isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            )}>
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                            <span className="font-bold text-white text-lg">G</span>
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
                                        ? "bg-[#10B981] text-white shadow-lg"
                                        : "text-white/70 hover:text-white hover:bg-white/10"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="font-medium">{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all">
                        <Settings className="w-5 h-5" />
                        <span>Settings</span>
                    </button>
                </div>
            </aside>
        </>
    );
}

