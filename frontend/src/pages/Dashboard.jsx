import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    FileText, CheckCircle, AlertTriangle, Clock, TrendingUp,
    DollarSign, Zap, Activity, ArrowRight, BarChart2
} from 'lucide-react';
import { statsAPI } from '../api.js';

const COLORS = ['#4ADE80', '#F87171', '#FBAD37', '#38BDF8'];

function StatCard({ label, value, trend, color, prefix = '' }) {
    return (
        <div className="stat-card">
            <div className="stat-info">
                <div className="stat-label">{label}</div>
                <div className="stat-value" style={{ color: label.toLowerCase().includes('overdue') ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                    {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {trend && <div className="stat-trend" style={{ color }}>{trend}</div>}
            </div>
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'rgba(13, 13, 13, 0.95)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)'
        }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color, fontWeight: 800, fontSize: 14 }}>
                    {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('amount')
                        ? `$${p.value.toLocaleString()}`
                        : p.value}
                </p>
            ))}
        </div>
    );
};

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await statsAPI.get();
            setStats(data);
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
            setError('Failed to load dashboard data. Please check your connection or try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div>
                <div className="stats-grid">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="stat-card">
                            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12 }} />
                            <div style={{ flex: 1 }}>
                                <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 8 }} />
                                <div className="skeleton" style={{ height: 28, width: '40%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-state-container" style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ marginBottom: 20 }}><AlertTriangle size={48} color="var(--accent-yellow)" /></div>
                <h3 style={{ marginBottom: 16, color: 'var(--text-primary)' }}>Dashboard Unreachable</h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto 24px' }}>{error}</p>
                <button className="btn btn-primary" onClick={fetchStats}>
                    <Zap size={16} /> Try Again
                </button>
            </div>
        );
    }

    const pieData = stats ? [
        { name: 'Matched', value: stats.matchedInvoices },
        { name: 'Pending', value: stats.pendingInvoices },
        { name: 'Flagged', value: stats.flaggedItems },
    ] : [];

    const matchRate = stats && stats.totalInvoices > 0
        ? Math.round((stats.matchedInvoices / stats.totalInvoices) * 100)
        : 0;

    return (
        <div className="slide-up">
            {/* Welcome Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.08) 50%, rgba(153, 27, 27, 0.06) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 20,
                padding: '32px',
                marginBottom: 32,
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute',
                    right: -20,
                    top: -20,
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
                }} />
                <div className="flex items-center gap-3 mb-4">
                    <div style={{
                        background: 'linear-gradient(135deg, #EF4444, #B91C1C)',
                        borderRadius: 10,
                        width: 40,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Zap size={20} color="white" />
                    </div>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>
                            Welcome to InvoScan
                        </div>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>
                            AI-powered OCR · Intelligent reconciliation · Real-time analytics
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                    <Link to="/upload" className="btn btn-primary btn-sm">
                        <FileText size={14} /> Upload Invoice
                    </Link>
                    <Link to="/reconcile" className="btn btn-secondary btn-sm">
                        <Activity size={14} /> Run Reconciliation
                    </Link>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <StatCard
                    label="Draft Invoices"
                    value={0}
                    color="var(--text-muted)"
                    trend="0 Invoices"
                />
                <StatCard
                    label="Unpaid Invoices"
                    value={stats?.pendingInvoices ?? 0}
                    color="var(--accent-yellow)"
                    trend={`${stats?.pendingInvoices ?? 0} Invoices`}
                />
                <StatCard
                    label="Overdue Invoices"
                    value={stats?.flaggedItems ?? 0}
                    color="var(--accent-red)"
                    trend={stats?.flaggedItems > 0 ? "Immediate action" : "No issues"}
                />
                <StatCard
                    label="Paid Invoices"
                    value={stats?.matchedInvoices ?? 0}
                    color="var(--accent-green)"
                    prefix=""
                    trend={`${matchRate}% match rate`}
                />
            </div>

            {/* Charts Row */}
            <div className="grid-2" style={{ marginBottom: 28 }}>
                {/* Monthly Volume Chart */}
                <div className="chart-card">
                    <div className="chart-title">Invoice Volume Over Time</div>
                    <div className="chart-subtitle">Monthly invoice processing activity</div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={stats?.monthlyData || []}>
                            <defs>
                                <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="count" name="Invoices" stroke="var(--accent-primary)" fill="url(#colorInv)" strokeWidth={3} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Status Breakdown Pie */}
                <div className="chart-card">
                    <div className="chart-title">Invoice Status Breakdown</div>
                    <div className="chart-subtitle">Current status distribution</div>
                    {pieData.some(d => d.value > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {pieData.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 13 }}>{v}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="empty-state" style={{ padding: 40 }}>
                            <div className="empty-icon"><BarChart2 size={48} /></div>
                            <div className="empty-title">No data yet</div>
                            <div className="empty-subtitle">Upload invoices to see stats</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Recent Invoices */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Recent Invoices</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Last 5 processed invoices</div>
                    </div>
                    <Link to="/invoices" className="btn btn-secondary btn-sm flex items-center gap-2">
                        View All <ArrowRight size={14} />
                    </Link>
                </div>
                {stats?.recentInvoices?.length > 0 ? (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Vendor</th>
                                    <th>Invoice #</th>
                                    <th>Amount</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentInvoices.map(inv => (
                                    <tr key={inv.id}>
                                        <td className="primary">{inv.vendor_name}</td>
                                        <td className="mono">{inv.invoice_number}</td>
                                        <td>${(inv.total_amount || 0).toFixed(2)}</td>
                                        <td>{inv.invoice_date || '—'}</td>
                                        <td>
                                            <span className={`badge badge-${inv.status}`}>
                                                {inv.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon"><FileText size={48} /></div>
                        <div className="empty-title">No invoices yet</div>
                        <div className="empty-subtitle">
                            <Link to="/upload" className="text-accent">Upload your first invoice</Link> to get started
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
