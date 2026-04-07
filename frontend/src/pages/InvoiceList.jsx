import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Eye, Trash2, FileText, Filter, RefreshCw, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { invoiceAPI } from '../api.js';

const STATUS_OPTIONS = ['', 'pending', 'matched', 'mismatch', 'missing', 'duplicate'];

export default function InvoiceList() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [deleting, setDeleting] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const data = await invoiceAPI.getAll({ page, limit: 15, search: search || undefined, status: status || undefined });
            setInvoices(data.invoices || []);
            setTotal(data.total || 0);
        } catch {
            toast.error('Failed to load invoices');
        } finally {
            setLoading(false);
        }
    }, [page, search, status]);

    useEffect(() => {
        const timer = setTimeout(fetchInvoices, 300);
        return () => clearTimeout(timer);
    }, [page, search, status, fetchInvoices]);

    const handleDelete = async (id, name) => {
        if (!confirm(`Delete invoice from "${name}"? This cannot be undone.`)) return;
        setDeleting(id);
        try {
            await invoiceAPI.delete(id);
            toast.success('Invoice deleted');
            setSelectedIds(prev => prev.filter(sid => sid !== id));
            fetchInvoices();
        } catch {
            toast.error('Failed to delete invoice');
        } finally {
            setDeleting(null);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.length} selected invoices?`)) return;
        setActionLoading(true);
        try {
            // We'll delete them sequentially for simplicity as there's no bulk delete endpoint yet
            // but in a real app we might want a bulk delete API.
            await Promise.all(selectedIds.map(id => invoiceAPI.delete(id)));
            toast.success(`Deleted ${selectedIds.length} invoices`);
            setSelectedIds([]);
            fetchInvoices();
        } catch {
            toast.error('Failed to delete some invoices');
        } finally {
            setActionLoading(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === invoices.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(invoices.map(inv => inv.id));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const totalPages = Math.ceil(total / 15);

    return (
        <div className="slide-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
                <div>
                    <h1 className="header-title">Invoice Library</h1>
                    <p className="header-subtitle">{total} invoices processed</p>
                </div>
                <div className="flex gap-4">
                    <button onClick={fetchInvoices} className="btn btn-secondary">
                        <RefreshCw size={18} />
                    </button>
                    <Link to="/upload" className="btn btn-primary">
                        <FileText size={18} /> NEW INVOICE
                    </Link>
                </div>
            </div>

            {/* Filters and Batch Actions */}
            <div className="card mb-6">
                <div className="flex gap-4 items-center justify-between">
                    <div className="flex gap-3 flex-wrap items-center" style={{ flex: 1 }}>
                        <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 200, maxWidth: 400 }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input
                                type="text"
                                placeholder="Search vendor, invoice #..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                className="input"
                                style={{ flex: 1 }}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter size={16} color="var(--text-muted)" />
                            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input" style={{ width: 160 }}>
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Status'}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="fade-in flex items-center gap-3 bg-secondary p-2 rounded-lg border border-accent-primary/20">
                            <span className="text-sm font-medium ml-2">{selectedIds.length} Selected</span>
                            <div className="divider-v" style={{ height: 20, width: 1, background: 'var(--border)', margin: '0 8px' }} />
                            <button
                                onClick={handleBulkDelete}
                                disabled={actionLoading}
                                className="btn btn-danger btn-sm px-3"
                            >
                                <Trash2 size={13} /> Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ padding: 40 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex gap-4 items-center mb-4">
                                <div className="skeleton" style={{ height: 14, width: '25%' }} />
                                <div className="skeleton" style={{ height: 14, width: '15%' }} />
                                <div className="skeleton" style={{ height: 14, width: '10%' }} />
                                <div className="skeleton" style={{ height: 14, width: '10%' }} />
                                <div className="skeleton" style={{ height: 14, width: '10%' }} />
                            </div>
                        ))}
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"><FolderOpen size={48} /></div>
                        <div className="empty-title">{search || status ? 'No invoices match your filters' : 'No invoices yet'}</div>
                        <div className="empty-subtitle">
                            {!search && !status && <Link to="/upload" className="text-accent">Upload your first invoice</Link>}
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            checked={invoices.length > 0 && selectedIds.length === invoices.length}
                                            onChange={toggleSelectAll}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </th>
                                    <th>Vendor Name</th>
                                    <th>Invoice #</th>
                                    <th>Date</th>
                                    <th>Amount</th>
                                    <th>Currency</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map(inv => (
                                    <tr key={inv.id} className={selectedIds.includes(inv.id) ? 'row-selected' : ''}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(inv.id)}
                                                onChange={() => toggleSelect(inv.id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td className="primary">{inv.vendor_name || '—'}</td>
                                        <td className="mono">{inv.invoice_number || '—'}</td>
                                        <td>{inv.invoice_date || '—'}</td>
                                        <td style={{ fontWeight: 600 }}>${Number(inv.total_amount || 0).toFixed(2)}</td>
                                        <td style={{ fontSize: 12 }}>{inv.currency || 'USD'}</td>
                                        <td>
                                            <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                <Link to={`/invoices/${inv.id}`} className="btn btn-secondary btn-sm btn-icon" title="View">
                                                    <Eye size={14} />
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(inv.id, inv.vendor_name)}
                                                    className="btn btn-danger btn-sm btn-icon"
                                                    title="Delete"
                                                    disabled={deleting === inv.id}
                                                >
                                                    {deleting === inv.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            Page {page} of {totalPages} · {total} total
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary btn-sm">← Prev</button>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-secondary btn-sm">Next →</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
