const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'translation-center-secret';
const GCP_PROJECT = process.env.GCP_PROJECT || 'translation-center';

// Storage Buckets Setup
const INPUT_BUCKET = `${GCP_PROJECT}_translation_input_files`;
const OUTPUT_BUCKET = `${GCP_PROJECT}_translation_output_files`;
const CONFIG_BUCKET = `${GCP_PROJECT}_translation_config`;

const storage = new Storage();
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

app.use(cors());
app.use(express.json());

// Serve Static Frontend Assets (React bundle)
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Database Connection Pool
let dbPool = null;

async function getDb() {
  if (dbPool) return dbPool;
  try {
    const config = {
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'translation_center',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    if (process.env.DB_SOCKET_PATH) {
      config.socketPath = process.env.DB_SOCKET_PATH;
    } else {
      config.host = process.env.DB_HOST || 'localhost';
      config.port = parseInt(process.env.DB_PORT || '3306');
    }

    dbPool = mysql.createPool(config);
    // Test connection
    const conn = await dbPool.getConnection();
    conn.release();
    return dbPool;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    // Avoid circular logging if database connection is failing
    if (err.message.indexOf('Database connection failed') === -1) {
      logToDb('ERROR', `Database connection failed: ${err.message}`).catch(() => {});
    }
    throw err;
  }
}

// Helpers for Database Logs
async function logToDb(severity, message) {
  try {
    const pool = await getDb();
    await pool.query('INSERT INTO app_logs (severity, message) VALUES (?, ?)', [severity, message]);
  } catch (err) {
    console.error(`Failed to write log to DB [${severity}]: ${message}`, err.message);
  }
}

// Read users local DB file
const USERS_FILE = path.join(__dirname, 'users.json');
function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read users file:', err.message);
    return [];
  }
}

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write users file:', err.message);
    return false;
  }
}

// JWT Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Role authorization
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied for this role' });
    }
    next();
  };
}

// Helper to fetch GCP OIDC Identity Token from local Metadata Server
async function getGcpIdToken(audience) {
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, {
      headers: { 'Metadata-Flavor': 'Google' }
    });
    if (!res.ok) throw new Error(`Metadata server returned ${res.status}`);
    const token = await res.text();
    return token.trim();
  } catch (err) {
    console.error('Failed to retrieve GCP ID token:', err.message);
    return null;
  }
}

// --- API ROUTES ---

// 1. Auth Endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) {
    await logToDb('ERROR', `Failed login attempt for user: ${username}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    await logToDb('ERROR', `Failed login attempt for user: ${username}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  await logToDb('INFO', `User logged in successfully: ${username}`);
  res.json({ token, username: user.username, role: user.role });
});

// 2. Jobs List Endpoint
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const pool = await getDb();
    const [rows] = await pool.query(`
      SELECT j.*, COALESCE(SUM(u.tokens_consumed), 0) AS tokens_consumed 
      FROM jobs j 
      LEFT JOIN usage_logs u ON j.id = u.job_id 
      GROUP BY j.id 
      ORDER BY j.created_at DESC
    `);
    
    // Map gs:// paths directly to GCS HTTP object URLs (authenticated browser links)
    const mappedRows = rows.map(row => {
      const mapped = { ...row };
      if (mapped.source_file_path && mapped.source_file_path.startsWith('gs://')) {
        mapped.source_file_path = mapped.source_file_path.replace('gs://', 'https://storage.cloud.google.com/');
      }
      if (mapped.candidate_file_path && mapped.candidate_file_path.startsWith('gs://')) {
        mapped.candidate_file_path = mapped.candidate_file_path.replace('gs://', 'https://storage.cloud.google.com/');
      }
      if (mapped.output_file_path && mapped.output_file_path.startsWith('gs://')) {
        mapped.output_file_path = mapped.output_file_path.replace('gs://', 'https://storage.cloud.google.com/');
      }
      return mapped;
    });

    res.json(mappedRows);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch jobs: ${err.message}` });
  }
});

// 2b. Download GCS File Endpoint
app.get('/api/download', authenticateToken, async (req, res) => {
  const { path: gsPath } = req.query;
  if (!gsPath || !gsPath.startsWith('gs://')) {
    return res.status(400).json({ error: 'Invalid GCS path' });
  }

  try {
    const parts = gsPath.replace('gs://', '').split('/');
    const bucketName = parts[0];
    const fileName = parts.slice(1).join('/');

    // Security check: restrict downloads to our application buckets only
    if (bucketName !== INPUT_BUCKET && bucketName !== OUTPUT_BUCKET && bucketName !== CONFIG_BUCKET) {
      return res.status(403).json({ error: 'Access to this bucket is restricted' });
    }

    const file = storage.bucket(bucketName).file(fileName);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set response headers for file transfer
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fileName)}"`);
    
    // Attempt to read the content type from file metadata or default
    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');

    // Pipe file stream directly to response
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: `Download failed: ${err.message}` });
  }
});

// 3. Create Translation Request
app.post('/api/jobs', authenticateToken, requireRole(['user', 'admin']), upload.single('file'), async (req, res) => {
  const { job_name, model_override, source_lang, target_lang, drive_url, verbose, destination_url } = req.body;
  const file = req.file;

  if (!job_name || !source_lang || !target_lang) {
    return res.status(400).json({ error: 'Missing required translation job details.' });
  }

  if (!file && !drive_url) {
    return res.status(400).json({ error: 'Please provide either a local file or a Google Drive URL.' });
  }

  let file_type = 'pdf';
  let storage_type = 'gcs';
  let source_file_path = '';

  try {
    const pool = await getDb();

    if (drive_url) {
      storage_type = 'drive';
      source_file_path = drive_url;
      // Google Docs check based on standard drive link contents
      if (drive_url.includes('document/d/') || drive_url.includes('docs.google.com')) {
        file_type = 'gdoc';
      } else {
        file_type = 'pdf';
      }
    } else {
      storage_type = 'gcs';
      file_type = file.originalname.endsWith('.pdf') ? 'pdf' : 'gdoc';
      
      // Upload to GCS
      const destination = `${Date.now()}_${file.originalname}`;
      await storage.bucket(INPUT_BUCKET).upload(file.path, {
        destination,
        metadata: { contentType: file.mimetype }
      });
      source_file_path = `gs://${INPUT_BUCKET}/${destination}`;
      
      // Clean local temporary file
      fs.unlinkSync(file.path);
    }

    // Determine model to use (default to flash if override not set)
    const activeModel = model_override || 'Gemini 3.5 Flash';
    const verboseVal = (verbose === 'true' || verbose === true) ? 1 : 0;

    const [result] = await pool.query(
      `INSERT INTO jobs (job_name, model_override, model_used, source_lang, target_lang, status, source_file_path, candidate_file_path, file_type, storage_type, verbose) 
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)`,
      [job_name, model_override, activeModel, source_lang, target_lang, source_file_path, destination_url || null, file_type, storage_type, verboseVal]
    );

    const newJobId = result.insertId;
    await logToDb('INFO', `Job queued: "${job_name}" (ID: ${newJobId})`);

    // Trigger backend translator service
    const translatorUrl = process.env.TRANSLATION_BACKEND_URL || 'http://localhost:5000/translate';
    
    // Asynchronous trigger of the translation backend
    (async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        
        // Fetch GCP ID Token if invoking an HTTPS endpoint (GCP Cloud Run)
        if (translatorUrl.startsWith('https://')) {
          const idToken = await getGcpIdToken(translatorUrl);
          if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
          }
        }
        
        const res = await fetch(translatorUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ job_id: newJobId })
        });
        
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Backend returned ${res.status}: ${errText}`);
        }
        console.log(`Successfully triggered backend translation for Job ${newJobId}`);
      } catch (err) {
        console.error(`Failed to trigger translation backend for Job ${newJobId}:`, err.message);
        await logToDb('ERROR', `Backend trigger failed for Job ${newJobId}: ${err.message}`);
      }
    })();

    res.json({ success: true, job_id: newJobId });
  } catch (err) {
    console.error('Job submission error:', err);
    await logToDb('ERROR', `Job submission failed: ${err.message}`);
    res.status(500).json({ error: `Failed to create job: ${err.message}` });
  }
});

// 4. Approve Job
app.post('/api/jobs/:id/approve', authenticateToken, requireRole(['user', 'admin']), async (req, res) => {
  const jobId = req.params.id;
  try {
    const pool = await getDb();
    const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = rows[0];
    if (job.status !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: 'Job is not pending review' });
    }

    let finalOutputPath = '';
    if (job.storage_type === 'gcs') {
      // Suffix renaming inside GCS
      const candUri = job.candidate_file_path;
      if (candUri && candUri.startsWith('gs://')) {
        const parts = candUri.replace('gs://', '').split('/');
        const bucketName = parts[0];
        const candFile = parts.slice(1).join('/');
        
        // Final file name replacement
        const finalFile = candFile.replace('_translation_candidate_', '_translated_');
        
        // Copy in GCS
        await storage.bucket(bucketName).file(candFile).copy(storage.bucket(bucketName).file(finalFile));
        finalOutputPath = `gs://${bucketName}/${finalFile}`;
      }
    } else {
      // In Google Drive, rename/make a new copy (or backend handles it, here we assume renaming)
      // For simplicity, we create the new path string; our backend or frontend client does Google Drive rename
      finalOutputPath = job.candidate_file_path.replace('_translation_candidate_', '_translated_');
    }

    await pool.query(
      `UPDATE jobs SET status = 'APPROVED', output_file_path = ?, updated_at = NOW() WHERE id = ?`,
      [finalOutputPath, jobId]
    );

    await logToDb('INFO', `Job ID ${jobId} approved by admin/user`);
    res.json({ success: true, output_file_path: finalOutputPath });
  } catch (err) {
    await logToDb('ERROR', `Job approval error for ID ${jobId}: ${err.message}`);
    res.status(500).json({ error: `Failed to approve job: ${err.message}` });
  }
});

// 5. Reject Job
app.post('/api/jobs/:id/reject', authenticateToken, requireRole(['user', 'admin']), async (req, res) => {
  const jobId = req.params.id;
  try {
    const pool = await getDb();
    const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = rows[0];
    if (job.status !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: 'Job is not pending review' });
    }

    await pool.query(
      `UPDATE jobs SET status = 'REJECTED', updated_at = NOW() WHERE id = ?`,
      [jobId]
    );

    await logToDb('INFO', `Job ID ${jobId} rejected`);
    res.json({ success: true });
  } catch (err) {
    await logToDb('ERROR', `Job rejection error for ID ${jobId}: ${err.message}`);
    res.status(500).json({ error: `Failed to reject job: ${err.message}` });
  }
});

// --- ADMIN API ENDPOINTS ---

// 1. Get Usage Stats (Translations counts & tokens grouped by day/week/month)
app.get('/api/admin/usage-stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { axis } = req.query; // 'days', 'weeks', 'months'
  try {
    const pool = await getDb();
    let dateFormat = '%Y-%m-%d';
    let groupExpr = 'date';
    
    if (axis === 'weeks') {
      dateFormat = '%Y-%u';
      groupExpr = "DATE_FORMAT(date, '%Y-%u')";
    } else if (axis === 'months') {
      dateFormat = '%Y-%m';
      groupExpr = "DATE_FORMAT(date, '%Y-%m')";
    }

    // Daily translations performed in past year
    const [transRows] = await pool.query(`
      SELECT DATE_FORMAT(created_at, ?) as period, COUNT(*) as count 
      FROM jobs 
      WHERE created_at >= NOW() - INTERVAL 1 YEAR 
      GROUP BY period 
      ORDER BY period ASC
    `, [dateFormat]);

    // Daily token consumption in past year
    const [tokenRows] = await pool.query(`
      SELECT DATE_FORMAT(date, ?) as period, SUM(tokens_consumed) as tokens 
      FROM usage_logs 
      WHERE date >= NOW() - INTERVAL 1 YEAR 
      GROUP BY period 
      ORDER BY period ASC
    `, [dateFormat]);

    res.json({ translations: transRows, tokens: tokenRows });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch usage statistics: ${err.message}` });
  }
});

// 2. Get Users and Roles
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  const users = readUsers().map(u => ({ username: u.username, role: u.role }));
  res.json(users);
});

// 3. Update User Roles
app.put('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  const { username, role } = req.body;
  if (!username || !role) {
    return res.status(400).json({ error: 'Username and role required' });
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.username === username);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  users[userIndex].role = role;
  if (writeUsers(users)) {
    logToDb('INFO', `User ${username} role updated to ${role}`);
    return res.json({ success: true });
  } else {
    return res.status(500).json({ error: 'Failed to update users file' });
  }
});

// 4. Get System Logs with filters
app.get('/api/admin/logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { severity, timeframe } = req.query; // timeframe: '1h', '1d', '1w', '1m', '1y'
  try {
    const pool = await getDb();
    let query = 'SELECT * FROM app_logs WHERE 1=1';
    const params = [];

    if (severity && severity !== 'ALL') {
      query += ' AND severity = ?';
      params.push(severity);
    }

    if (timeframe) {
      let interval = '1 YEAR';
      if (timeframe === '1h') interval = '1 HOUR';
      else if (timeframe === '1d') interval = '1 DAY';
      else if (timeframe === '1w') interval = '1 WEEK';
      else if (timeframe === '1m') interval = '1 MONTH';
      
      query += ` AND timestamp >= NOW() - INTERVAL ${interval}`;
    }

    query += ' ORDER BY timestamp DESC LIMIT 500';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch logs: ${err.message}` });
  }
});

// Helper to handle GCS configuration file updates with backup
async function updateConfigInGcs(fileName, content) {
  const file = storage.bucket(CONFIG_BUCKET).file(fileName);
  
  // Try to rename/backup existing file
  try {
    const [exists] = await file.exists();
    if (exists) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      const backupName = `${base}_backup_${timestamp}${ext}`;
      
      await file.copy(storage.bucket(CONFIG_BUCKET).file(backupName));
      await logToDb('INFO', `Backed up existing ${fileName} to ${backupName}`);
    }
  } catch (err) {
    console.error(`Backup failed for ${fileName}:`, err.message);
    await logToDb('ERROR', `Backup failed for ${fileName}: ${err.message}`);
  }

  // Upload new content
  await file.save(content, {
    metadata: { contentType: 'text/markdown' }
  });
  await logToDb('INFO', `Updated GCS config file: ${fileName}`);
}

// Get list of models (accessible by any logged in user)
app.get('/api/models', authenticateToken, async (req, res) => {
  try {
    let content = "";
    try {
      const [contents] = await storage.bucket(CONFIG_BUCKET).file('translation_config.md').download();
      content = contents.toString('utf8');
    } catch (err) {
      content = `# Translation Configuration\n\n- **Model**: gemini-3.5-flash, gemini-3.1-pro, gemini-3.1-flash\n- **Supported Languages**: Spanish, English, French, Portuguese, German\n- **Translation Knowledge Base CSV**: translation_corpus.csv\n- **Do Not Translate CSV**: do_not_translate.csv\n`;
    }
    
    // Parse model list using regex (matches - **Model**: values)
    const modelMatch = content.match(/-\s+\*\*Model\*\*:\s*(.*)/i);
    if (modelMatch) {
      const modelsStr = modelMatch[1].trim();
      const modelsList = modelsStr.split(',').map(m => m.trim()).filter(m => m);
      res.json({ models: modelsList });
    } else {
      res.json({ models: ["gemini-3.5-flash", "gemini-3.1-pro", "gemini-3.1-flash"] });
    }
  } catch (err) {
    console.error('Error fetching models:', err);
    res.json({ models: ["gemini-3.5-flash", "gemini-3.1-pro", "gemini-3.1-flash"] });
  }
});

// 5. Get Configs
app.get('/api/admin/config', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [contents] = await storage.bucket(CONFIG_BUCKET).file('translation_config.md').download();
    res.json({ content: contents.toString('utf8') });
  } catch (err) {
    // If not exists, return initial configuration layout template
    const initialConfig = `# Translation Configuration\n\n- **Model**: Gemini 3.5 Flash\n- **Supported Languages**: Spanish, English, French, Portuguese, German\n- **Translation Knowledge Base CSV**: translation_corpus.csv\n- **Do Not Translate CSV**: do_not_translate.csv\n`;
    res.json({ content: initialConfig });
  }
});

// 6. Update Configs
app.post('/api/admin/config', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Config content required' });
  try {
    // Update translation_config.md
    await updateConfigInGcs('translation_config.md', content);
    res.json({ success: true });
  } catch (err) {
    await logToDb('ERROR', `Failed to update configuration: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Prompt Template
app.get('/api/admin/prompt', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [contents] = await storage.bucket(CONFIG_BUCKET).file('translation_prompt.md').download();
    res.json({ content: contents.toString('utf8') });
  } catch (err) {
    // Read from the local root workspace if GCS is empty
    try {
      const localPrompt = fs.readFileSync(path.join(__dirname, '../translation_prompt.md'), 'utf8');
      res.json({ content: localPrompt });
    } catch (localErr) {
      res.status(500).json({ error: 'Prompt file not found' });
    }
  }
});

// 8. Update Prompt Template
app.post('/api/admin/prompt', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Prompt content required' });
  try {
    await updateConfigInGcs('translation_prompt.md', content);
    res.json({ success: true });
  } catch (err) {
    await logToDb('ERROR', `Failed to update prompt: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Fallback to React index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Initialize server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
