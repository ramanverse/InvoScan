import { useState, useEffect } from 'react';
import { Download, History, RefreshCw, BarChart2, FileText, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { reconcileAPI } from '../api.js';
import toast from 'react-hot-toast';

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'rgba(10,15,40,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
        }}>
            <p style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.fill, fontWeight: 600 }}>{p.name}: {p.value}</p>
            ))}
        </div>
    );
};

export default function Reports() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        reconcileAPI.history()
            .then(setSessions)
            .catch(() => toast.error('Failed to load history'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        let isMounted = true;
        reconcileAPI.history()
            .then(data => {
                if (isMounted) setSessions(data);
            })
            .catch(() => {
                if (isMounted) toast.error('Failed to load history');
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });
        return () => { isMounted = false; };
    }, []);

    const chartData = sessions.slice(0, 8).reverse().map(s => ({
        date: new Date(s.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        Matched: s.matched,
        Mismatched: s.mismatched,
        Missing: s.missing,
        Duplicate: s.duplicate,
    }));

    const totalMatched = sessions.reduce((s, r) => s + r.matched, 0);
    const totalMismatched = sessions.reduce((s, r) => s + r.mismatched, 0);
    const totalMissing = sessions.reduce((s, r) => s + r.missing, 0);
    const totalInvoices = sessions.reduce((s, r) => s + r.total_invoices, 0);
    const avgMatchRate = totalInvoices > 0 ? Math.round((totalMatched / totalInvoices) * 100) : 0;

    return (
        <div className="slide-up">
            <div className="page-header">
                <div>
                    <div className="page-title">Reports & Analytics</div>
                    <div className="page-description">Reconciliation history, export reports, and performance analytics</div>
                </div>
                <button onClick={load} className="btn btn-secondary btn-sm flex items-center gap-2">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Aggregate Stats */}
            <div className="stats-grid mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {[
                    { label: 'Total Sessions', value: sessions.length, color: '#6366f1' },
                    { label: 'Total Matched', value: totalMatched, color: '#22c55e' },
                    { label: 'Total Flagged', value: totalMismatched + totalMissing, color: '#ef4444' },
                    { label: 'Avg Match Rate', value: `${avgMatchRate}%`, color: '#06b6d4' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="stat-card" style={{ '--accent-color': color }}>
                        <div className="stat-info">
                            <div className="stat-label">{label}</div>
                            <div className="stat-value" style={{ fontSize: 26, color }}>{value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
                <div className="chart-card mb-6">
                    <div className="chart-title">Reconciliation History</div>
                    <div className="chart-subtitle">Results breakdown per session</div>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={chartData} barSize={16} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
                            <Bar dataKey="Matched" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Mismatched" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Missing" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Duplicate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Session History Table */}
            <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Session History</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{sessions.length} reconciliation sessions</div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: 40 }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-4 mb-4">
                                <div className="skeleton" style={{ height: 14, width: '20%' }} />
                                <div className="skeleton" style={{ height: 14, width: '15%' }} />
                                <div className="skeleton" style={{ height: 14, width: '10%' }} />
                                <div className="skeleton" style={{ height: 14, width: '10%' }} />
                                <div className="skeleton" style={{ height: 14, width: '10%' }} />
                            </div>
                        ))}
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"><TrendingUp size={48} /></div>
                        <div className="empty-title">No reconciliations yet</div>
                        <div className="empty-subtitle">Run your first reconciliation to see history here</div>
                    </div>
                ) : (
                    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Session ID</th>
                                    <th>Date</th>
                                    <th>Total</th>
                                    <th>Matched</th>
                                    <th>Mismatched</th>
                                    <th>Missing</th>
                                    <th>Duplicate</th>
                                    <th>Match Rate</th>
                                    <th>Export</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map(s => {
                                    const rate = s.total_invoices > 0 ? Math.round((s.matched / s.total_invoices) * 100) : 0;
                                    return (
                                        <tr key={s.id}>
                                            <td className="mono" style={{ fontSize: 11 }}>{s.id.slice(0, 12)}...</td>
                                            <td>{new Date(s.created_at).toLocaleString()}</td>
                                            <td style={{ fontWeight: 600 }}>{s.total_invoices}</td>
                                            <td style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{s.matched}</td>
                                            <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{s.mismatched}</td>
                                            <td style={{ color: 'var(--accent-red)', fontWeight: 600 }}>{s.missing}</td>
                                            <td style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>{s.duplicate}</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="progress-bar" style={{ width: 60 }}>
                                                        <div className="progress-fill" style={{
                                                            width: `${rate}%`,
                                                            background: rate >= 80 ? 'var(--accent-green)' : rate >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: rate >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                                                        {rate}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <a
                                                        href={reconcileAPI.exportCSV(s.id)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="btn btn-secondary btn-sm btn-icon"
                                                        title="Download CSV"
                                                    >
                                                        <Download size={13} />
                                                    </a>
                                                    <a
                                                        href={reconcileAPI.exportPDF(s.id)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="btn btn-secondary btn-sm btn-icon"
                                                        title="Download PDF"
                                                    >
                                                        <FileText size={13} />
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
