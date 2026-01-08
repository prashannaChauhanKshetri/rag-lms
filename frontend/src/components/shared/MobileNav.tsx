import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileNavProps {
    activeTab: string;
    onTabChange: (id: string) => void;
    tabs: {
        id: string;
        label: string;
        icon: LucideIcon;
    }[];
}

export function MobileNav({ activeTab, onTabChange, tabs }: MobileNavProps) {
    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 px-6 py-2 pb-safe">
            <div className="flex justify-between items-center">
                {tabs.slice(0, 5).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className="flex flex-col items-center gap-1 p-2"
                        >
                            <div className={cn(
                                "p-2 rounded-xl transition-all",
                                isActive ? "bg-green-100 text-green-600" : "text-gray-400"
                            )}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <span className={cn(
                                "text-[10px] font-medium",
                                isActive ? "text-green-600" : "text-gray-400"
                            )}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
