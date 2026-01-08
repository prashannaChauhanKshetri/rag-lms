import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

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
    return (
        <aside className="w-64 bg-slate-900 h-screen hidden lg:flex flex-col text-white flex-shrink-0">
            <div className="p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <span className="font-bold text-white text-lg">G</span>
                    </div>
                    <span className="font-bold text-xl">Gyana</span>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                activeTab === tab.id
                                    ? "bg-green-500 text-white shadow-lg shadow-green-500/20"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10">
                <div className="bg-slate-800 rounded-xl p-4">
                    <p className="text-sm text-slate-400 mb-2">My Progress</p>
                    <div className="w-full bg-slate-700 h-2 rounded-full mb-2">
                        <div className="bg-green-500 h-2 rounded-full w-3/4"></div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                        <span>Course Completion</span>
                        <span className="text-white">75%</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
