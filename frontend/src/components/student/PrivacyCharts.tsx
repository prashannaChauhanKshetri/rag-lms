import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const DONUT_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6'];

interface DonutDatum {
    [key: string]: string | number;
    name: string;
    value: number;
}
interface BarDatum {
    [key: string]: string | number | boolean;
    label: string;
    value: number;
    hasData: boolean;
}

export default function PrivacyCharts({
    donutData,
    averagesData,
}: {
    donutData: DonutDatum[];
    averagesData: BarDatum[];
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Attendance Breakdown</p>
                {donutData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                            <Pie
                                data={donutData}
                                cx="50%"
                                cy="50%"
                                innerRadius={48}
                                outerRadius={72}
                                paddingAngle={3}
                                dataKey="value"
                            >
                                {donutData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: unknown) => [value as number, 'Sessions']} />
                            <Legend
                                iconType="circle"
                                iconSize={8}
                                formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[180px] flex items-center justify-center">
                        <p className="text-sm text-gray-400">No attendance data</p>
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Score Averages</p>
                {averagesData.some(d => d.hasData) ? (
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={averagesData} barSize={40}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <Tooltip
                                formatter={(value: unknown, _name: unknown, props: { payload?: { hasData?: boolean } }) =>
                                    props.payload?.hasData ? [`${value as number}`, 'Avg Score'] : ['Not graded yet', 'Avg Score']
                                }
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {averagesData.map((entry, index) => (
                                    <Cell
                                        key={`bar-${index}`}
                                        fill={!entry.hasData ? '#d1d5db' : index === 0 ? '#22c55e' : '#6366f1'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[180px] flex items-center justify-center">
                        <p className="text-sm text-gray-400">No graded scores yet</p>
                    </div>
                )}
            </div>
        </div>
    );
}
