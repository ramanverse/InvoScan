import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit2, Save, X, FileText, DollarSign, Calendar, Hash, Tag, CheckCircle, Clock, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { invoiceAPI } from '../api.js';

function Field({ label, value, icon }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
        }}>
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15, wordBreak: 'break-word' }}>
                {value || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not extracted</span>}
            </div>
        </div>
    );
}

const STATUS_MAP = {
    matched: { color: 'var(--accent-green)', bg: 'rgba(34,197,94,0.1)', label: <span className="flex items-center gap-1"><CheckCircle size={14} /> Matched</span> },
    pending: { color: 'var(--accent-yellow)', bg: 'rgba(245,158,11,0.1)', label: <span className="flex items-center gap-1"><Clock size={14} /> Pending</span> },
    mismatch: { color: 'var(--accent-red)', bg: 'rgba(239,68,68,0.1)', label: <span className="flex items-center gap-1"><AlertTriangle size={14} /> Mismatch</span> },
    missing: { color: '#f87171', bg: 'rgba(239,68,68,0.07)', label: <span className="flex items-center gap-1"><XCircle size={14} /> Missing</span> },
    duplicate: { color: 'var(--accent-secondary)', bg: 'rgba(139,92,246,0.1)', label: <span className="flex items-center gap-1"><RefreshCw size={14} /> Duplicate</span> },
};

export default function InvoiceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        invoiceAPI.getOne(id).then(data => {
            setInvoice(data);
            setForm({
                vendor_name: data.vendor_name || '',
                invoice_number: data.invoice_number || '',
                invoice_date: data.invoice_date || '',
                due_date: data.due_date || '',
                subtotal: parseFloat(data.subtotal) || 0,
                tax: parseFloat(data.tax) || 0,
                total_amount: parseFloat(data.total_amount) || 0,
                currency: data.currency || 'USD',
                line_items: (data.line_items || []).map(li => ({ ...li })),
            });
        }).catch(() => {
            toast.error('Invoice not found');
            navigate('/invoices');
        }).finally(() => setLoading(false));
    }, [id, navigate]);

    const handleSave = async () => {
        setSaving(true);
        // Basic validation: ensure amounts are numbers
        const cleanedForm = {
            ...form,
            subtotal: parseFloat(form.subtotal) || 0,
            tax: parseFloat(form.tax) || 0,
            total_amount: parseFloat(form.total_amount) || 0,
            line_items: form.line_items.map(li => ({
                ...li,
                quantity: parseFloat(li.quantity) || 0,
                unit_price: parseFloat(li.unit_price) || 0,
                amount: parseFloat(li.amount) || 0,
            })),
        };

        try {
            await invoiceAPI.update(id, cleanedForm);
            setInvoice(prev => ({ ...prev, ...cleanedForm }));
            setEditing(false);
            toast.success('Invoice updated successfully');
        } catch (err) {
            toast.error(err.error || 'Failed to update invoice');
        } finally {
            setSaving(false);
        }
    };

    const updateLineItem = (index, field, value) => {
        const newItems = [...form.line_items];
        newItems[index] = { ...newItems[index], [field]: value };

        // Auto-calculate amount if qty or price changes
        if (field === 'quantity' || field === 'unit_price') {
            const qty = parseFloat(field === 'quantity' ? value : newItems[index].quantity) || 0;
            const price = parseFloat(field === 'unit_price' ? value : newItems[index].unit_price) || 0;
            newItems[index].amount = qty * price;
        }

        setForm(p => {
            const updatedForm = { ...p, line_items: newItems };
            // Auto-calculate subtotal and total
            const newSubtotal = newItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            updatedForm.subtotal = newSubtotal;
            updatedForm.total_amount = newSubtotal + (parseFloat(p.tax) || 0);
            return updatedForm;
        });
    };

    const addLineItem = () => {
        setForm(p => ({
            ...p,
            line_items: [...p.line_items, { description: '', quantity: 1, unit_price: 0, amount: 0 }]
        }));
    };

    const removeLineItem = (index) => {
        setForm(p => {
            const newItems = p.line_items.filter((_, i) => i !== index);
            const newSubtotal = newItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            return {
                ...p,
                line_items: newItems,
                subtotal: newSubtotal,
                total_amount: newSubtotal + (parseFloat(p.tax) || 0)
            };
        });
    };

    if (loading) {
        return (
            <div className="slide-up">
                <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 24 }} />
                <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
            </div>
        );
    }

    const statusInfo = STATUS_MAP[invoice.status] || STATUS_MAP.pending;

    return (
        <div className="slide-up" style={{ maxWidth: 860 }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm btn-icon">
                    <ArrowLeft size={16} />
                </button>
                <div style={{ flex: 1 }}>
                    <div className="page-title">{invoice.vendor_name || 'Invoice Details'}</div>
                    <div className="page-description">Invoice #{invoice.invoice_number}</div>
                </div>
                <div style={{
                    background: statusInfo.bg,
                    color: statusInfo.color,
                    border: `1px solid ${statusInfo.color}40`,
                    padding: '8px 16px',
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 600,
                }}>
                    {statusInfo.label}
                </div>
                {editing ? (
                    <div className="flex gap-2">
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm flex items-center gap-2">
                            {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />} Save
                        </button>
                        <button onClick={() => setEditing(false)} className="btn btn-secondary btn-sm"><X size={14} /></button>
                    </div>
                ) : (
                    <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm flex items-center gap-2">
                        <Edit2 size={14} /> Edit
                    </button>
                )}
            </div>

            {/* Fields */}
            {editing ? (
                <div className="slide-up">
                    <div className="card mb-6">
                        <div className="flex items-center justify-between mb-5">
                            <div style={{ fontWeight: 700, fontSize: 18 }}>Edit Header Information</div>
                            <div className="badge badge-pending">Manual Correction Mode</div>
                        </div>
                        <div className="grid-2" style={{ gap: 20 }}>
                            {[
                                { key: 'vendor_name', label: 'Vendor Name', type: 'text', icon: <Tag size={14} /> },
                                { key: 'invoice_number', label: 'Invoice Number', type: 'text', icon: <Hash size={14} /> },
                                { key: 'invoice_date', label: 'Invoice Date', type: 'text', icon: <Calendar size={14} /> },
                                { key: 'due_date', label: 'Due Date', type: 'text', icon: <Calendar size={14} /> },
                                { key: 'subtotal', label: 'Subtotal ($)', type: 'number', icon: <DollarSign size={14} /> },
                                { key: 'tax', label: 'Tax ($)', type: 'number', icon: <DollarSign size={14} /> },
                                { key: 'total_amount', label: 'Total Amount ($)', type: 'number', icon: <DollarSign size={14} /> },
                                { key: 'currency', label: 'Currency', type: 'text', icon: <Tag size={14} /> },
                            ].map(({ key, label, type, icon }) => (
                                <div key={key} className="form-group">
                                    <label className="form-label flex items-center gap-2">
                                        <span style={{ color: 'var(--accent-primary)' }}>{icon}</span> {label}
                                    </label>
                                    <input
                                        type={type}
                                        value={form[key]}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setForm(p => ({
                                                ...p,
                                                [key]: val,
                                                total_amount: key === 'tax' || key === 'subtotal'
                                                    ? (parseFloat(key === 'subtotal' ? val : p.subtotal) || 0) + (parseFloat(key === 'tax' ? val : p.tax) || 0)
                                                    : p.total_amount
                                            }));
                                        }}
                                        className="input"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div style={{ fontWeight: 700, fontSize: 18 }}>Edit Line Items</div>
                            <button onClick={addLineItem} className="btn btn-secondary btn-sm flex items-center gap-2">
                                <X size={14} style={{ transform: 'rotate(45deg)' }} /> Add Item
                            </button>
                        </div>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Description</th>
                                        <th style={{ width: 80 }}>Qty</th>
                                        <th style={{ width: 120 }}>Unit Price</th>
                                        <th style={{ width: 120 }}>Amount</th>
                                        <th style={{ width: 50 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.line_items.map((item, i) => (
                                        <tr key={i}>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={e => updateLineItem(i, 'description', e.target.value)}
                                                    className="input input-sm"
                                                    placeholder="Item description"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                                                    className="input input-sm"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    value={item.unit_price}
                                                    onChange={e => updateLineItem(i, 'unit_price', e.target.value)}
                                                    className="input input-sm"
                                                />
                                            </td>
                                            <td style={{ fontWeight: 600 }}>
                                                ${(parseFloat(item.amount) || 0).toFixed(2)}
                                            </td>
                                            <td>
                                                <button onClick={() => removeLineItem(i)} className="btn btn-icon btn-secondary btn-sm" style={{ color: 'var(--accent-red)' }}>
                                                    <X size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                    <Field label="Vendor" value={invoice.vendor_name} icon={<Tag size={12} color="var(--accent-primary)" />} />
                    <Field label="Invoice #" value={invoice.invoice_number} icon={<Hash size={12} color="var(--accent-cyan)" />} />
                    <Field label="Invoice Date" value={invoice.invoice_date} icon={<Calendar size={12} color="var(--accent-yellow)" />} />
                    <Field label="Due Date" value={invoice.due_date} icon={<Calendar size={12} color="var(--accent-red)" />} />
                    <Field label="Subtotal" value={invoice.subtotal ? `$${Number(invoice.subtotal).toFixed(2)}` : null} icon={<DollarSign size={12} color="var(--accent-green)" />} />
                    <Field label="Tax" value={invoice.tax ? `$${Number(invoice.tax).toFixed(2)}` : null} icon={<DollarSign size={12} color="var(--accent-yellow)" />} />
                    <Field label="Total Amount" value={invoice.total_amount ? `$${Number(invoice.total_amount).toFixed(2)}` : null} icon={<DollarSign size={12} color="var(--accent-green)" />} />
                    <Field label="Currency" value={invoice.currency} icon={<Tag size={12} color="var(--accent-secondary)" />} />
                </div>
            )}

            {/* Line Items */}
            {!editing && invoice.line_items?.length > 0 && (
                <div className="card mb-6">
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Line Items</div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.line_items.map((item, i) => (
                                    <tr key={i}>
                                        <td className="primary">{item.description}</td>
                                        <td>{item.quantity}</td>
                                        <td>${Number(item.unit_price || 0).toFixed(2)}</td>
                                        <td style={{ fontWeight: 600 }}>${Number(item.amount || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Reconciliation Result */}
            {invoice.reconciliation && (
                <div className="card mb-6" style={{
                    border: `1px solid ${statusInfo.color}30`,
                    background: statusInfo.bg,
                }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Reconciliation Result</div>
                    <div style={{ fontSize: 14, display: 'grid', gap: 8 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Status: </span><span style={{ color: statusInfo.color, fontWeight: 700 }}>{invoice.reconciliation.match_status?.toUpperCase()}</span></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Confidence: </span><span style={{ fontWeight: 600 }}>{invoice.reconciliation.confidence_score}%</span></div>
                        {invoice.reconciliation.discrepancy > 0 && (
                            <div><span style={{ color: 'var(--text-muted)' }}>Discrepancy: </span><span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>${Number(invoice.reconciliation.discrepancy).toFixed(2)}</span></div>
                        )}
                        {invoice.reconciliation.flag_reason && (
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                                <strong>Flag Reason:</strong> {invoice.reconciliation.flag_reason}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Raw OCR Text */}
            {invoice.ocr_raw_text && (
                <details className="card">
                    <summary className="flex items-center gap-2" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>
                        <FileText size={16} /> View Raw OCR Text
                    </summary>
                    <pre style={{
                        marginTop: 16,
                        padding: 16,
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 8,
                        fontSize: 12,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--text-muted)',
                        overflow: 'auto',
                        maxHeight: 300,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                    }}>
                        {invoice.ocr_raw_text}
                    </pre>
                </details>
            )}
        </div>
    );
}
