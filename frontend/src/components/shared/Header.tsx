import { Bell, Search } from 'lucide-react';

interface HeaderProps {
    userName: string;
    userRole: string;
    institutionName: string;
}

export function Header({ userName, userRole, institutionName }: HeaderProps) {
    return (
        <header className="h-20 bg-white border-b border-gray-100 px-8 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Welcome back, {userName.split(' ')[0]}! 👋</h2>
                    <p className="text-sm text-gray-500">{institutionName}</p>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="relative hidden md:block">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        <Search className="w-4 h-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search courses, assignments..."
                        className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none w-64"
                    />
                </div>

                <button className="relative p-2 hover:bg-gray-50 rounded-full transition-colors">
                    <Bell className="w-5 h-5 text-gray-600" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>

                <div className="h-8 w-[1px] bg-gray-200"></div>

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-green-500/20">
                        {userName.charAt(0)}
                    </div>
                    <div className="hidden md:block text-left">
                        <p className="text-sm font-semibold text-gray-700 leading-none">{userName}</p>
                        <p className="text-xs text-gray-400 mt-1 capitalize">{userRole}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}
