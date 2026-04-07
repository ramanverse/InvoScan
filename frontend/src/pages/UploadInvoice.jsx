import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader, Eye, Image, Folder, UploadCloud } from 'lucide-react';
import { invoiceAPI, healthAPI } from '../api.js';
import { useEffect } from 'react';

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return <FileText size={16} />;
    if (['jpg', 'jpeg', 'png'].includes(ext)) return <Image size={16} />;
    return <Folder size={16} />;
}

export default function UploadInvoice() {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState([]);
    const navigate = useNavigate();
    const [isWakingUp, setIsWakingUp] = useState(false);

    // Pre-warm the backend (Render cold start)
    useEffect(() => {
        const prewarm = async () => {
            try {
                setIsWakingUp(true);
                await healthAPI.ping();
            } catch (e) {
                console.warn('Backend wake-up ping failed', e);
            } finally {
                setIsWakingUp(false);
            }
        };
        prewarm();
    }, []);

    const onDrop = useCallback((acceptedFiles) => {
        const newFiles = acceptedFiles.map(f => ({
            file: f,
            id: Math.random().toString(36).slice(2),
            status: 'ready',
        }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/tiff': ['.tiff'],
            'image/bmp': ['.bmp'],
            'image/webp': ['.webp'],
        },
        multiple: true,
        maxSize: 20 * 1024 * 1024,
    });

    const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));
    const clearAll = () => { setFiles([]); setResults([]); };

    const handleUpload = async () => {
        if (uploading || files.length === 0) return;
        if (files.length === 0) return toast.error('Please select at least one file');
        setUploading(true);
        setProgress(0);
        setResults([]);

        // Mark all files as processing
        setFiles(prev => prev.map(f => ({ ...f, status: 'processing' })));

        const formData = new FormData();
        files.forEach(f => formData.append('invoices', f.file));

        try {
            const data = await invoiceAPI.upload(formData, (p) => {
                setProgress(p);
            });

            setResults(data.results || []);
            const successCount = (data.results || []).filter(r => r.status === 'success').length;

            // Map results back to files for status display
            setFiles(prev => prev.map(f => {
                const res = data.results.find(r => r.file_name === f.file.name);
                return { ...f, status: res ? res.status : 'ready' };
            }));

            if (successCount > 0) {
                toast.success(`${successCount} invoice${successCount !== 1 ? 's' : ''} processed successfully!`);
            }
        } catch (err) {
            const msg = err.error || err.message || '';
            const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('network');
            toast.error(
                isTimeout
                    ? 'Backend is waking up (Render cold start). Please wait 30s and try again.'
                    : msg || 'Upload failed. Please try again.',
                { duration: 6000 }
            );
            setFiles(prev => prev.map(f => ({ ...f, status: 'ready' })));
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    return (
        <div className="slide-up" style={{ maxWidth: 800 }}>
            <div className="page-header">
                <div>
                    <div className="page-title">Upload Invoices</div>
                    <div className="page-description">Drop PDF or image invoices — OCR runs automatically</div>
                </div>
            </div>

            {/* Dropzone */}
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={{ marginBottom: 24 }}>
                <input {...getInputProps()} />
                <span className="dropzone-icon"><UploadCloud size={48} /></span>
                <div className="dropzone-title">
                    {isDragActive ? 'Drop your invoices here!' : 'Drag & drop invoices'}
                </div>
                <div className="dropzone-subtitle">
                    or <span style={{ color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer' }}>browse files</span> to select
                </div>
                <div className="dropzone-formats">
                    {['PDF', 'PNG', 'JPG', 'JPEG', 'TIFF', 'BMP'].map(f => (
                        <span key={f} className="format-tag">.{f.toLowerCase()}</span>
                    ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>Max 20MB per file · Up to 20 files at once</div>
            </div>

            {/* File list */}
            {files.length > 0 && (
                <div className="card mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div style={{ fontWeight: 600 }}>{files.length} file{files.length !== 1 ? 's' : ''} selected</div>
                        <button onClick={clearAll} className="btn btn-secondary btn-sm flex items-center gap-2">
                            <X size={14} /> Clear all
                        </button>
                    </div>
                    <div className="file-list">
                        {files.map(({ file, id, status }) => (
                            <div key={id} className={`file-item ${status === 'processing' ? 'processing' : ''}`}>
                                <span className="file-icon">
                                    {status === 'processing' ? <Loader className="spin" size={16} /> : getFileIcon(file)}
                                </span>
                                <div className="flex-1">
                                    <div className="file-name">{file.name}</div>
                                    <div className="file-size">{status === 'processing' ? 'Extracting text...' : formatBytes(file.size)}</div>
                                </div>
                                <button
                                    onClick={() => removeFile(id)}
                                    className="btn btn-icon btn-secondary btn-sm"
                                    disabled={uploading}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {uploading && (
                        <div style={{ marginTop: 24, padding: 20, background: 'rgba(99, 102, 241, 0.05)', borderRadius: 12, border: '1px solid var(--border-active)' }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="pulse-dot" />
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>InvoScan Engine Active</span>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)' }}>{progress}%</span>
                            </div>
                            <div className="progress-bar" style={{ height: 8 }}>
                                <div className="progress-fill indigo" style={{ width: `${progress}%`, boxShadow: '0 0 15px var(--accent-primary)' }} />
                            </div>
                            <div className="flex justify-between mt-3" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                <span>{progress < 30 ? 'Uploading...' : progress < 70 ? 'Analyzing layout...' : 'Finalizing OCR extraction...'}</span>
                                {progress > 95 && <span className="pulse">Processing on server (may take up to 60s)...</span>}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={handleUpload}
                            disabled={uploading || files.length === 0}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            {uploading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Processing...</> : <><Upload size={16} /> Upload & Extract</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="card slide-up">
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
                        Extraction Results
                    </div>
                    <div className="flex flex-col gap-3">
                        {results.map((r, i) => (
                            <div key={i} style={{
                                padding: 16,
                                background: r.status === 'success' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                                border: `1px solid ${r.status === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                borderRadius: 12,
                            }}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {r.status === 'success'
                                            ? <CheckCircle size={16} color="var(--accent-green)" />
                                            : <AlertCircle size={16} color="var(--accent-red)" />}
                                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.file_name}</span>
                                        {r.status === 'success' && (
                                            <span className="badge badge-matched" style={{ fontSize: 11 }}>
                                                {r.confidence}% confidence
                                            </span>
                                        )}
                                    </div>
                                    {r.status === 'success' && r.id && (
                                        <button onClick={() => navigate(`/invoices/${r.id}`)} className="btn btn-secondary btn-sm flex items-center gap-1">
                                            <Eye size={13} /> View
                                        </button>
                                    )}
                                </div>
                                {r.status === 'success' && r.extracted && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, fontSize: 13 }}>
                                        {[
                                            { label: 'Vendor', value: r.extracted.vendor_name },
                                            { label: 'Invoice #', value: r.extracted.invoice_number },
                                            { label: 'Date', value: r.extracted.invoice_date },
                                            { label: 'Total', value: r.extracted.total_amount ? `$${Number(r.extracted.total_amount).toFixed(2)}` : '—' },
                                        ].map(({ label, value }) => (
                                            <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 10px' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value || '—'}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {r.status === 'error' && (
                                    <div style={{ fontSize: 13, color: 'var(--accent-red)' }}>Error: {r.error}</div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={() => navigate('/invoices')} className="btn btn-primary btn-sm">
                            View Invoice Library →
                        </button>
                        <button onClick={() => navigate('/reconcile')} className="btn btn-success btn-sm">
                            Run Reconciliation →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
