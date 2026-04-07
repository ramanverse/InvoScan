const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Tesseract = require('tesseract.js');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { parseInvoice } = require('./invoiceParser');
const { reconcile } = require('./reconciliationEngine');

// --- Environment Validation --------------------------------------------------
const REQUIRED_ENV = ['JWT_SECRET'];
if (process.env.DATABASE_URL) {
    // If we have DATABASE_URL, assume we are in production/cloud
  console.log('Production Environment detected');
} else {
    console.log('Local Environment detected');
}

REQUIRED_ENV.forEach(key => {
    if (!process.env[key] && key === 'JWT_SECRET') {
          console.warn(`WARNING: ${key} is not set. Using insecure default.`);
    }
});

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345';

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Auth Middleware ----------------------------------------------------------

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
          token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
          return res.status(401).json({ error: 'Not authorized, no token' });
    }

    try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const user = await db.get('SELECT id, name, email, avatar FROM users WHERE id = ?', [decoded.id]);
          if (!user) return res.status(401).json({ error: 'Not authorized, user not found' });
          req.user = user;
          next();
    } catch (err) {
          res.status(401).json({ error: 'Not authorized, token failed' });
    }
};

const generateToken = (id) => {
    return jwt.sign({ id }, JWT_SECRET, { expiresIn: '24h' });
};

// Upload directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const REGISTER_DIR = path.join(__dirname, 'registers');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(REGISTER_DIR)) fs.mkdirSync(REGISTER_DIR, { recursive: true });

// Multer configuration
const invoiceStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
          const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
          cb(null, unique);
    },
});
const registerStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, REGISTER_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const uploadInvoice = multer({
    storage: invoiceStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
          const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'];
          const ext = path.extname(file.originalname).toLowerCase();
          if (allowed.includes(ext)) cb(null, true);
          else cb(new Error('Only PDF and image files are allowed'));
    },
});

const uploadRegister = multer({
    storage: registerStorage,
    fileFilter: (req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          if (['.csv', '.json'].includes(ext)) cb(null, true);
          else cb(new Error('Only CSV and JSON files are allowed'));
    },
});

// --- Helper Functions ---------------------------------------------------------

let ocrWorker = null;
let ocrWorkerInitializing = false;

async function getOCRWorker() {
    if (ocrWorker) return ocrWorker;
    // Prevent multiple simultaneous initializations
  if (ocrWorkerInitializing) {
        // Wait for existing init to complete
      await new Promise(resolve => setTimeout(resolve, 500));
        return getOCRWorker();
  }
    ocrWorkerInitializing = true;
    console.log('Initializing OCR Worker...');
    try {
          // Use local eng.traineddata file to avoid downloading it at runtime
      // This is critical on Render where internet access for ML models can be slow/blocked
      const worker = await Tesseract.createWorker('eng', 1, {
              langPath: __dirname,  // tells Tesseract to look for eng.traineddata in the backend folder
              cacheMethod: 'readOnly', // don't try to write to cache
      });
          ocrWorker = worker;
          console.log('OCR Worker ready');
    } catch (err) {
          console.error('OCR Worker init failed:', err.message);
          ocrWorker = null;
    } finally {
          ocrWorkerInitializing = false;
    }
    return ocrWorker;
}

// Wrap OCR with a 25-second timeout so the upload route always responds
async function runOCR(filePath) {
    const OCR_TIMEOUT_MS = 25000;
    try {
          const worker = await getOCRWorker();
          if (!worker) {
                  console.warn('OCR worker unavailable, returning empty text');
                  return '';
          }
          const ocrPromise = worker.recognize(filePath);
          const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('OCR timed out after 25s')), OCR_TIMEOUT_MS)
                                                 );
          const { data } = await Promise.race([ocrPromise, timeoutPromise]);
          return data.text || '';
    } catch (err) {
          console.error('OCR Error:', err.message);
          // Reset worker so it reinitialises on the next request
      ocrWorker = null;
          return '';
    }
}

// Pre-warm OCR worker in the background after server starts
setTimeout(() => {
    console.log('Pre-warming OCR worker in background...');
    getOCRWorker().catch(err => console.error('Pre-warm failed:', err.message));
}, 2000);

function parseCSVRegister(filePath) {
    return new Promise((resolve, reject) => {
          const records = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                      // Normalize column names (case-insensitive)
                        const normalized = {};
                      for (const [k, v] of Object.entries(row)) {
                                  normalized[k.toLowerCase().replace(/\s+/g, '_')] = v;
                      }
                      records.push({
                                  id: uuidv4(),
                                  vendor_name: normalized.vendor_name || normalized.vendor || normalized.company || normalized.name || '',
                                  expected_amount: parseFloat((normalized.expected_amount || normalized.amount || normalized.total || '0').replace(/[$,]/g, '')) || 0,
                                  due_date: normalized.due_date || normalized.due || normalized.date || null,
                                  reference_number: normalized.reference_number || normalized.ref || normalized.invoice_number || normalized.invoice_no || null,
                                  status: normalized.status || 'unpaid',
                      });
            })
            .on('end', () => resolve(records))
            .on('error', reject);
    });
}

// --- Auth Routes --------------------------------------------------------------

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please provide all fields' });

           try {
                 const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
                 if (existing) return res.status(400).json({ error: 'User already exists' });

      const salt = await bcrypt.genSalt(10);
                 const hashedPassword = await bcrypt.hash(password, salt);
                 const userId = uuidv4();

      await db.run('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)', [userId, name, email, hashedPassword]);

      res.status(201).json({
              id: userId,
              name,
              email,
              token: generateToken(userId),
      });
           } catch (err) {
                 res.status(500).json({ error: err.message });
           }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Please provide email and password' });

           try {
                 const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
                 if (user && user.password_hash) {
                         const isMatch = await bcrypt.compare(password, user.password_hash);
                         if (isMatch) {
                                   return res.json({
                                               id: user.id,
                                               name: user.name,
                                               email: user.email,
                                               avatar: user.avatar,
                                               token: generateToken(user.id),
                                   });
                         }
                 }
                 res.status(401).json({ error: 'Invalid email or password' });
           } catch (err) {
                 res.status(500).json({ error: err.message });
           }
});

// Get current user info
app.get('/api/auth/me', protect, (req, res) => {
    res.json(req.user);
});

// --- Protected Routes (Health & Dashboard) ------------------------------------

// Health check
app.get('/', (req, res) => {
    res.send('Invoice OCR Backend is running!');
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0', ocr_ready: !!ocrWorker });
});

// Lightweight ping endpoint for keep-alive (call this from frontend or uptime monitor)
app.get('/api/ping', (req, res) => {
    res.json({ pong: true, t: Date.now() });
});

// Dashboard stats
app.get('/api/stats', protect, async (req, res) => {
    try {
          const userId = req.user.id;

      // Execute multiple independent queries in parallel
      const [
              totalInvoicesRes,
              pendingInvoicesRes,
              matchedInvoicesRes,
              totalAmountRes,
              sessionsRes,
              flaggedRes,
              recentInvoices
            ] = await Promise.all([
              db.get('SELECT COUNT(*) as count FROM invoices WHERE user_id = ?', [userId]),
              db.get("SELECT COUNT(*) as count FROM invoices WHERE status = 'pending' AND user_id = ?", [userId]),
              db.get("SELECT COUNT(*) as count FROM invoices WHERE status = 'matched' AND user_id = ?", [userId]),
              db.get('SELECT SUM(total_amount) as sum FROM invoices WHERE user_id = ?', [userId]),
              db.get('SELECT COUNT(*) as count FROM reconciliation_sessions WHERE user_id = ?', [userId]),
              db.get(`
                      SELECT COUNT(*) as count 
                              FROM reconciliation_results rr
                                      JOIN invoices i ON rr.invoice_id = i.id
                                              WHERE i.user_id = ? AND rr.match_status != 'matched'
                                                    `, [userId]),
              db.all('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId])
            ]);

      // Cross-database compatible monthly data
      const isPostgres = !!process.env.DATABASE_URL;
          const monthlyQuery = isPostgres
            ? `SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count, SUM(total_amount) as total 
                     FROM invoices WHERE user_id = ? GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 6`
                  : `SELECT SUBSTR(created_at, 1, 7) as month, COUNT(*) as count, SUM(total_amount) as total 
                           FROM invoices WHERE user_id = ? GROUP BY SUBSTR(created_at, 1, 7) ORDER BY month DESC LIMIT 6`;

      const monthlyData = await db.all(monthlyQuery, [userId]);

      res.json({
              totalInvoices: totalInvoicesRes.count || 0,
              pendingInvoices: pendingInvoicesRes.count || 0,
              matchedInvoices: matchedInvoicesRes.count || 0,
              totalAmount: totalAmountRes.sum || 0,
              reconciliationSessions: sessionsRes.count || 0,
              flaggedItems: flaggedRes.count || 0,
              recentInvoices,
              monthlyData: monthlyData.reverse(),
      });
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Upload & OCR invoice
app.post('/api/invoices/upload', protect, uploadInvoice.array('invoices', 20), async (req, res) => {
    if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
    }

           const userId = req.user.id;
    const results = [];
    for (const file of req.files) {
          try {
                  const rawText = await runOCR(file.path);
                  const parsed = parseInvoice(rawText);
                  const invoiceId = uuidv4();

            await db.run(`
                    INSERT INTO invoices (id, user_id, vendor_name, invoice_number, invoice_date, due_date, subtotal, tax, total_amount, currency, file_path, file_name, ocr_raw_text, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                                  `, [
                      invoiceId,
                      userId,
                      parsed.vendor_name,
                      parsed.invoice_number,
                      parsed.invoice_date,
                      parsed.due_date,
                      parsed.subtotal,
                      parsed.tax,
                      parsed.total_amount,
                      parsed.currency,
                      file.path,
                      file.originalname,
                      rawText,
                    ]);

            // Insert line items
            if (parsed.line_items && parsed.line_items.length > 0) {
                      for (const item of parsed.line_items) {
                                  await db.run(`
                                              INSERT INTO line_items (invoice_id, description, quantity, unit_price, amount)
                                                          VALUES (?, ?, ?, ?, ?)
                                                                    `, [invoiceId, item.description, item.quantity, item.unit_price, item.amount]);
                      }
            }

            results.push({
                      id: invoiceId,
                      file_name: file.originalname,
                      status: 'success',
                      extracted: parsed,
                      confidence: parsed.confidence,
            });
          } catch (err) {
                  results.push({
                            file_name: file.originalname,
                            status: 'error',
                            error: err.message,
                  });
          }
    }

           res.json({ processed: results.length, results });
});
// Get all invoices with pagination and filtering
app.get('/api/invoices', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const { page = 1, limit = 20, status, search, sort = 'created_at', order = 'DESC' } = req.query;
          const offset = (parseInt(page) - 1) * parseInt(limit);

      let where = ["user_id = ?"];
          let params = [userId];

      if (status) { where.push("status = ?"); params.push(status); }
          if (search) {
                  where.push("(vendor_name LIKE ? OR invoice_number LIKE ?)");
                  params.push(`%${search}%`, `%${search}%`);
          }

      const whereClause = `WHERE ${where.join(' AND ')}`;
          const allowedSorts = ['created_at', 'vendor_name', 'total_amount', 'invoice_date'];
          const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
          const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

      const invoices = await db.all(`SELECT * FROM invoices ${whereClause} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
          const totalRes = await db.get(`SELECT COUNT(*) as count FROM invoices ${whereClause}`, params);

      res.json({
              invoices,
              total: totalRes.count,
              page: parseInt(page),
              limit: parseInt(limit),
              totalPages: Math.ceil(totalRes.count / parseInt(limit))
      });
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Get single invoice with line items
app.get('/api/invoices/:id', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const invoice = await db.get('SELECT * FROM invoices WHERE id = ? AND user_id = ?', [req.params.id, userId]);
          if (!invoice) return res.status(404).json({ error: 'Invoice not found or unauthorized' });
          const lineItems = await db.all('SELECT * FROM line_items WHERE invoice_id = ?', [req.params.id]);
          const reconciliationResult = await db.get('SELECT * FROM reconciliation_results WHERE invoice_id = ?', [req.params.id]);
          res.json({ ...invoice, line_items: lineItems, reconciliation: reconciliationResult });
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Update invoice fields manually
app.put('/api/invoices/:id', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const { vendor_name, invoice_number, invoice_date, due_date, subtotal, tax, total_amount, currency, line_items } = req.body;

      // Transaction start (simplified for async/dual-db)
      await db.run('BEGIN TRANSACTION');

      try {
              const info = await db.run(`
                      UPDATE invoices SET vendor_name=?, invoice_number=?, invoice_date=?, due_date=?, subtotal=?, tax=?, total_amount=?, currency=?, updated_at=CURRENT_TIMESTAMP
                              WHERE id=? AND user_id=?
                                    `, [vendor_name, invoice_number, invoice_date, due_date, subtotal, tax, total_amount, currency, req.params.id, userId]);

            if (info.rowCount === 0 && info.changes === 0) throw new Error('Invoice not found or unauthorized');

            if (line_items && Array.isArray(line_items)) {
                      await db.run('DELETE FROM line_items WHERE invoice_id = ?', [req.params.id]);
                      for (const item of line_items) {
                                  await db.run(`
                                              INSERT INTO line_items (invoice_id, description, quantity, unit_price, amount)
                                                          VALUES (?, ?, ?, ?, ?)
                                                                    `, [req.params.id, item.description, item.quantity, item.unit_price, item.amount]);
                      }
            }

            await db.run('COMMIT');
              res.json({ success: true });
      } catch (innerErr) {
              await db.run('ROLLBACK');
              throw innerErr;
      }
    } catch (err) {
          const status = err.message.includes('not found') ? 404 : 500;
          res.status(status).json({ error: err.message });
    }
});

// Delete invoice
app.delete('/api/invoices/:id', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const invoice = await db.get('SELECT * FROM invoices WHERE id = ? AND user_id = ?', [req.params.id, userId]);
          if (!invoice) return res.status(404).json({ error: 'Invoice not found or unauthorized' });

      if (invoice.file_path && fs.existsSync(invoice.file_path)) {
              fs.unlinkSync(invoice.file_path);
      }
          await db.run('DELETE FROM invoices WHERE id = ?', [req.params.id]);
          res.json({ success: true });
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Upload payment register CSV
app.post('/api/register/upload', protect, uploadRegister.single('register'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No register file uploaded' });
    try {
          const ext = path.extname(req.file.originalname).toLowerCase();
          let records = [];
          if (ext === '.csv') {
                  records = await parseCSVRegister(req.file.path);
          } else if (ext === '.json') {
                  const raw = JSON.parse(fs.readFileSync(req.file.path, 'utf-8'));
                  records = Array.isArray(raw) ? raw.map(r => ({ id: uuidv4(), ...r })) : [];
          }
          res.json({ success: true, records, count: records.length });
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Manual link reconciliation
app.post('/api/reconcile/link', protect, async (req, res) => {
    try {
          const { invoice_id, record_id, session_id, discrepancy = 0 } = req.body;
          if (!invoice_id || !record_id) return res.status(400).json({ error: 'invoice_id and record_id required' });

      await db.run('BEGIN TRANSACTION');
          try {
                  // Update invoice status
            await db.run("UPDATE invoices SET status = 'matched', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [invoice_id]);

            // Update or insert reconciliation result
            const existing = await db.get('SELECT id FROM reconciliation_results WHERE invoice_id = ?', [invoice_id]);
                  if (existing) {
                            await db.run(`
                                      UPDATE reconciliation_results 
                                                SET record_id = ?, match_status = 'matched', discrepancy = ?, flag_reason = 'Manually reconciled', confidence_score = 100 
                                                          WHERE id = ?
                                                                  `, [record_id, discrepancy, existing.id]);
                  } else {
                            await db.run(`
                                      INSERT INTO reconciliation_results (id, invoice_id, record_id, match_status, discrepancy, flag_reason, confidence_score, session_id)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                                        `, [uuidv4(), invoice_id, record_id, 'matched', discrepancy, 'Manually reconciled', 100, session_id || 'manual']);
                  }

            await db.run('COMMIT');
                  res.json({ success: true });
          } catch (innerErr) {
                  await db.run('ROLLBACK');
                  throw innerErr;
          }
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Run reconciliation
app.post('/api/reconcile', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const { register_records, invoice_ids } = req.body;
          if (!register_records || !Array.isArray(register_records)) {
                  return res.status(400).json({ error: 'register_records array required' });
          }

      let invoices;
          if (invoice_ids && Array.isArray(invoice_ids) && invoice_ids.length > 0) {
                  const placeholders = invoice_ids.map(() => '?').join(',');
                  invoices = await db.all(`SELECT * FROM invoices WHERE id IN (${placeholders}) AND user_id = ?`, [...invoice_ids, userId]);
          } else {
                  invoices = await db.all("SELECT * FROM invoices WHERE status IN ('pending', 'mismatch', 'missing', 'duplicate') AND user_id = ?", [userId]);
          }

      if (invoices.length === 0) {
              return res.status(400).json({ error: 'No invoices found to reconcile' });
      }

      const sessionId = uuidv4();
          const { results, summary, missingRecords } = reconcile(invoices, register_records);

      await db.run('BEGIN TRANSACTION');
          try {
                  for (const result of results) {
                            await db.run(`
                                      INSERT INTO reconciliation_results (id, invoice_id, record_id, match_status, discrepancy, flag_reason, confidence_score, session_id)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                                        `, [uuidv4(), result.invoice_id, result.record_id, result.match_status, result.discrepancy, result.flag_reason, result.confidence_score, sessionId]);

                    await db.run("UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [result.match_status, result.invoice_id]);
                  }

            await db.run(`
                    INSERT INTO reconciliation_sessions (id, user_id, register_file_name, total_invoices, matched, mismatched, missing, duplicate)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                  `, [sessionId, userId, 'Uploaded Register', summary.total_invoices, summary.matched, summary.mismatched, summary.missing_invoices, summary.duplicate]);

            await db.run('COMMIT');
          } catch (innerErr) {
                  await db.run('ROLLBACK');
                  throw innerErr;
          }

      const enrichedResults = results.map(r => {
              const invoice = invoices.find(i => i.id === r.invoice_id);
              const record = register_records.find(rec => rec.id === r.record_id);
              return { ...r, invoice, record };
      });

      res.json({ session_id: sessionId, summary, results: enrichedResults, missing_records: missingRecords });
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Get reconciliation history
app.get('/api/reconciliations', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const sessions = await db.all('SELECT * FROM reconciliation_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
          res.json(sessions);
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Export report as CSV
app.get('/api/report/:sessionId/csv', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const session = await db.get('SELECT id FROM reconciliation_sessions WHERE id = ? AND user_id = ?', [req.params.sessionId, userId]);
          if (!session) return res.status(404).json({ error: 'Session not found or unauthorized' });

      const results = await db.all(`
            SELECT rr.*, i.vendor_name, i.invoice_number, i.total_amount, i.invoice_date, i.file_name
                  FROM reconciliation_results rr
                        LEFT JOIN invoices i ON rr.invoice_id = i.id
                              WHERE rr.session_id = ?
                                  `, [req.params.sessionId]);

      if (results.length === 0) return res.status(404).json({ error: 'Session not found' });

      const fields = ['vendor_name', 'invoice_number', 'total_amount', 'invoice_date', 'match_status', 'discrepancy', 'flag_reason', 'confidence_score'];
          const parser = new Parser({ fields });
          const csvData = parser.parse(results);

      res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${req.params.sessionId}.csv"`);
          res.send(csvData);
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Export report as PDF
app.get('/api/report/:sessionId/pdf', protect, async (req, res) => {
    try {
          const userId = req.user.id;
          const session = await db.get('SELECT * FROM reconciliation_sessions WHERE id = ? AND user_id = ?', [req.params.sessionId, userId]);
          if (!session) return res.status(444).json({ error: 'Session not found or unauthorized' });

      const results = await db.all(`
            SELECT rr.*, i.vendor_name, i.invoice_number, i.total_amount, i.invoice_date
                  FROM reconciliation_results rr
                        LEFT JOIN invoices i ON rr.invoice_id = i.id
                              WHERE rr.session_id = ?
                                  `, [req.params.sessionId]);

      const doc = new PDFDocument({ margin: 50 });
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${req.params.sessionId}.pdf"`);
          doc.pipe(res);

      doc.fontSize(22).fillColor('#EF4444').text('Invoice Reconciliation Report', { align: 'center' });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#888').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
          doc.moveDown(1);

      if (session) {
              doc.fontSize(14).fillColor('#333').text('Summary');
              doc.moveDown(0.3);
              doc.fontSize(11).fillColor('#555');
              doc.text(`Total Invoices: ${session.total_invoices}`);
              doc.text(`Matched: ${session.matched}`);
              doc.text(`Mismatched: ${session.mismatched}`);
              doc.text(`Missing: ${session.missing}`);
              doc.text(`Duplicates: ${session.duplicate}`);
              doc.moveDown(1);
      }

      doc.fontSize(14).fillColor('#333').text('Reconciliation Results');
          doc.moveDown(0.5);

      const statusColors = { matched: '#22c55e', mismatch: '#f59e0b', missing: '#ef4444', duplicate: '#8b5cf6' };
          for (const r of results) {
                  doc.fontSize(10).fillColor(statusColors[r.match_status] || '#333');
                  doc.text(`[${(r.match_status || '').toUpperCase()}] ${r.vendor_name || 'Unknown'} - Invoice #${r.invoice_number || 'N/A'} - $${(r.total_amount || 0).toFixed(2)}`);
                  if (r.flag_reason) {
                            doc.fontSize(9).fillColor('#888').text(`  WARN ${r.flag_reason}`);
                  }
                  doc.moveDown(0.3);
          }

      doc.end();
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Error handler
app.use((err, req, res, next) => {
    console.error('Fatal Server Error:', err.stack);
    res.status(500).json({ error: 'Interval Server Error. Please contact support.' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Invoice OCR Reconciler API running on http://localhost:${PORT}`);
});
