import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
    CheckCircle, AlertTriangle, XCircle, Copy, GitMerge,
    Upload, Play, Download, Info, RefreshCw, Clipboard, Lightbulb
} from 'lucide-react';
import { registerAPI, reconcileAPI } from '../api.js';

const FLAG_ICONS = {
    matched: <CheckCircle size={15} color="var(--accent-green)" />,
    mismatch: <AlertTriangle size={15} color="var(--accent-yellow)" />,
    missing: <XCircle size={15} color="var(--accent-red)" />,
    duplicate: <Copy size={15} color="var(--accent-secondary)" />,
};

export default function Reconciliation() {
    const [registerRecords, setRegisterRecords] = useState([]);
    const [registerLoaded, setRegisterLoaded] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [linking, setLinking] = useState(false);

    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('register', file);
        try {
            const data = await registerAPI.upload(formData);
            setRegisterRecords(data.records || []);
            setRegisterLoaded(true);
            toast.success(`${data.count} payment records loaded`);
        } catch (err) {
            toast.error(err.error || 'Failed to upload register');
        } finally {
            setUploading(false);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'text/csv': ['.csv'], 'application/json': ['.json'] },
        multiple: false,
    });

    const handleReconcile = async () => {
        if (!registerLoaded || registerRecords.length === 0) {
            return toast.error('Please upload a payment register first');
        }
        setRunning(true);
        try {
            const data = await reconcileAPI.run({ register_records: registerRecords });
            setResults(data);
            setSessionId(data.session_id);
            toast.success(`Reconciliation complete! ${data.summary.matched} matched, ${data.summary.mismatched + data.summary.missing_invoices} flagged.`);
        } catch (err) {
            toast.error(err.error || 'Reconciliation failed');
        } finally {
            setRunning(false);
        }
    };

    const handleManualLink = async (invoiceId, recordId) => {
        setLinking(true);
        try {
            await reconcileAPI.link({ invoice_id: invoiceId, record_id: recordId, session_id: sessionId });
            toast.success('Successfully linked invoice!');
            // Update local state to reflect the change
            setResults(prev => {
                const newResults = prev.results.map(r => {
                    if (r.invoice_id === invoiceId) {
                        return { ...r, match_status: 'matched', record_id: recordId, discrepancy: 0, flag_reason: 'Manually linked' };
                    }
                    return r;
                });
                return { ...prev, results: newResults };
            });
            setSelectedInvoice(null);
        } catch (err) {
            toast.error(err.error || 'Failed to link invoice');
        } finally {
            setLinking(false);
        }
    };

    const summary = results?.summary;

    return (
        <div className="slide-up">
            <div className="page-header">
                <div>
                    <div className="page-title">Reconciliation Engine</div>
                    <div className="page-description">Upload a payment register CSV and match invoices using fuzzy logic</div>
                </div>
            </div>

            {/* Step 1: Upload Register */}
            <div className="card mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: 'white', flexShrink: 0,
                    }}>1</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>Upload Payment Register</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>CSV or JSON with columns: vendor_name, expected_amount, due_date, reference_number</div>
                    </div>
                </div>

                {!registerLoaded ? (
                    <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={{ padding: 40 }}>
                        <input {...getInputProps()} />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="spinner" style={{ width: 32, height: 32 }} />
                                <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Processing register file...</span>
                            </div>
                        ) : (
                            <>
                                <span className="dropzone-icon"><Clipboard size={48} /></span>
                                <div className="dropzone-title" style={{ fontSize: 16 }}>
                                    {isDragActive ? 'Drop your register!' : 'Drop payment register here'}
                                </div>
                                <div className="dropzone-subtitle">Supports .csv and .json format</div>
                            </>
                        )}
                    </div>
                ) : (
                    <div style={{
                        background: 'rgba(74, 222, 128, 0.05)',
                        border: '1px solid rgba(74, 222, 128, 0.1)',
                        borderRadius: 20,
                        padding: '24px',
                    }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle size={20} color="var(--accent-green)" />
                                <div>
                                    <div style={{ fontWeight: 600 }}>{registerRecords.length} payment records loaded</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ready for reconciliation</div>
                                </div>
                            </div>
                            <button onClick={() => { setRegisterLoaded(false); setRegisterRecords([]); setResults(null); }}
                                className="btn btn-secondary btn-sm flex items-center gap-2">
                                <RefreshCw size={14} /> Replace
                            </button>
                        </div>
                        {/* Preview */}
                        <div className="table-container" style={{ marginTop: 16 }}>
                            <table>
                                <thead>
                                    <tr><th>Vendor</th><th>Expected Amount</th><th>Due Date</th><th>Ref #</th></tr>
                                </thead>
                                <tbody>
                                    {registerRecords.slice(0, 5).map((r, i) => (
                                        <tr key={i}>
                                            <td className="primary">{r.vendor_name}</td>
                                            <td>${(r.expected_amount || 0).toFixed(2)}</td>
                                            <td>{r.due_date || '—'}</td>
                                            <td className="mono">{r.reference_number || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {registerRecords.length > 5 && (
                                <div style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                                    + {registerRecords.length - 5} more records...
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Step 2: Run */}
            <div className="card mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: registerLoaded ? 'var(--accent-primary)' : 'var(--bg-card-hover)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: registerLoaded ? 'white' : 'var(--text-muted)', flexShrink: 0,
                    }}>2</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>Run Reconciliation</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>All pending invoices will be matched against the register using Fuse.js fuzzy logic</div>
                    </div>
                </div>
                <button
                    onClick={handleReconcile}
                    disabled={!registerLoaded || running}
                    className="btn btn-primary flex items-center gap-2"
                >
                    {running ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Reconciling...</> : <><Play size={16} /> Run Reconciliation</>}
                </button>
            </div>

            {/* Results */}
            {results && (
                <div className="slide-up">
                    {/* Summary */}
                    <div className="reconcile-summary mb-6">
                        {[
                            { label: 'Matched', count: summary.matched, color: 'var(--accent-green)' },
                            { label: 'Mismatched', count: summary.mismatched, color: 'var(--accent-yellow)' },
                            { label: 'Missing', count: summary.missing_invoices, color: 'var(--accent-red)' },
                            { label: 'Duplicate', count: summary.duplicate, color: 'var(--accent-secondary)' },
                            { label: 'Total Invoiced', count: `$${(summary.total_amount_invoiced || 0).toFixed(0)}`, color: 'var(--accent-cyan)' },
                            { label: 'Total Expected', count: `$${(summary.total_amount_expected || 0).toFixed(0)}`, color: 'var(--accent-primary)' },
                        ].map(({ label, count, color }) => (
                            <div key={label} className="summary-item">
                                <div className="summary-count" style={{ color }}>{count}</div>
                                <div className="summary-label">{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Export Actions */}
                    {sessionId && (
                        <div className="flex gap-3 mb-6">
                            <a href={reconcileAPI.exportCSV(sessionId)} target="_blank" className="btn btn-secondary btn-sm flex items-center gap-2">
                                <Download size={14} /> Export CSV
                            </a>
                            <a href={reconcileAPI.exportPDF(sessionId)} target="_blank" className="btn btn-secondary btn-sm flex items-center gap-2">
                                <Download size={14} /> Export PDF
                            </a>
                        </div>
                    )}

                    {/* Results Table */}
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>Reconciliation Results</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{results.results.length} invoices processed</div>
                        </div>
                        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th>Vendor</th>
                                        <th>Invoice #</th>
                                        <th>Invoice Amount</th>
                                        <th>Expected Amount</th>
                                        <th>Discrepancy</th>
                                        <th>Confidence</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.results.map((r, i) => (
                                        <tr key={i}>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {FLAG_ICONS[r.match_status]}
                                                    <span className={`badge badge-${r.match_status}`}>{r.match_status}</span>
                                                </div>
                                            </td>
                                            <td className="primary">{r.invoice?.vendor_name || '—'}</td>
                                            <td className="mono">{r.invoice?.invoice_number || '—'}</td>
                                            <td>${(r.invoice?.total_amount || 0).toFixed(2)}</td>
                                            <td>{r.record ? `$${(r.record.expected_amount || 0).toFixed(2)}` : '—'}</td>
                                            <td style={{ color: r.discrepancy > 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 600 }}>
                                                {r.discrepancy > 0 ? `-$${r.discrepancy.toFixed(2)}` : '✓'}
                                            </td>
                                            <td>
                                                <div className="confidence-bar">
                                                    <div style={{ flex: 1 }}>
                                                        <div className="progress-bar" style={{ height: 4 }}>
                                                            <div className="progress-fill" style={{
                                                                width: `${r.confidence_score}%`,
                                                                background: r.confidence_score >= 80 ? 'var(--accent-green)' : r.confidence_score >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                                                            }} />
                                                        </div>
                                                    </div>
                                                    <span className="confidence-label">{r.confidence_score}%</span>
                                                </div>
                                            </td>
                                            <td>
                                                {r.match_status !== 'matched' && r.suggestions?.length > 0 ? (
                                                    <button
                                                        onClick={() => setSelectedInvoice(r)}
                                                        className="btn btn-secondary btn-sm flex items-center gap-1"
                                                        style={{ whiteSpace: 'nowrap' }}
                                                    >
                                                        <Info size={13} /> Suggestions
                                                    </button>
                                                ) : r.flag_reason ? (
                                                    <span title={r.flag_reason} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        {r.flag_reason.slice(0, 20)}...
                                                    </span>
                                                ) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {/* Suggestions Modal */}
            {selectedInvoice && (
                <div className="modal-overlay" onClick={() => setSelectedInvoice(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 18 }}>Smart Suggestions</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    Potential matches for <span className="text-primary">{selectedInvoice.invoice?.vendor_name}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedInvoice(null)} className="btn btn-icon btn-secondary">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
                            <strong>Invoice Details:</strong> #{selectedInvoice.invoice?.invoice_number} · ${selectedInvoice.invoice?.total_amount?.toFixed(2)}
                            {selectedInvoice.flag_reason && (
                                <div style={{ color: 'var(--accent-yellow)', marginTop: 4 }}>
                                    <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {selectedInvoice.flag_reason}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            {selectedInvoice.suggestions.map((s, i) => (
                                <div key={i} style={{
                                    padding: 16,
                                    background: 'rgba(239, 68, 68, 0.03)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'between',
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span style={{ fontWeight: 600 }}>{s.record.vendor_name}</span>
                                            <span className="badge badge-success" style={{ fontSize: 10 }}>{s.confidence}% Match</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            Expected: ${s.record.expected_amount?.toFixed(2)} · Ref: {s.record.reference_number || '—'}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--accent-primary)', marginTop: 4 }}>
                                            <Lightbulb size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {s.reason}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleManualLink(selectedInvoice.invoice_id, s.record.id)}
                                        disabled={linking}
                                        className="btn btn-primary btn-sm flex items-center gap-2"
                                    >
                                        {linking ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <GitMerge size={14} />} Link
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
