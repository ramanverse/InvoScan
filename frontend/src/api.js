import axios from 'axios';

const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
    timeout: 15000,
});

// Request interceptor
API.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor
API.interceptors.response.use(
    (res) => res.data,
    (err) => Promise.reject(err.response?.data || err)
);

export const invoiceAPI = {
    upload: (formData, onProgress) =>
        API.post('/invoices/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
            timeout: 120000,
        }),

    getAll: (params) => API.get('/invoices', { params }),
    getOne: (id) => API.get(`/invoices/${id}`),
    update: (id, data) => API.put(`/invoices/${id}`, data),
    delete: (id) => API.delete(`/invoices/${id}`),
};

export const registerAPI = {
    upload: (formData) =>
        API.post('/register/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
};

export const reconcileAPI = {
    run: (data) => API.post('/reconcile', data),
    link: (data) => API.post('/reconcile/link', data),
    history: () => API.get('/reconciliations'),
    exportCSV: (sessionId) => `${API.defaults.baseURL}/report/${sessionId}/csv`,
    exportPDF: (sessionId) => `${API.defaults.baseURL}/report/${sessionId}/pdf`,
};

export const statsAPI = {
    get: () => API.get('/stats'),
};

export const healthAPI = {
    ping: () => API.get('/ping'),
};

export default API;
