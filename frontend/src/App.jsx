import React, { useState, useEffect, useRef } from 'react';

// Translation characters for welcome screen background
const TRANSLATION_CHARS = [
  'A', '文', 'Translate', '译', 'A龉', 'G', 'あ', '한', 'T', 'σ', 'R', 'E', 
  'Ω', 'Ø', 'Ç', 'Ñ', 'ß', 'И', 'ע', 'ع', 'हि', 'ไทย'
];

// Helper to rewrite gs:// GCS URLs directly to GCS HTTP URLs (authenticated browser links)
const getDownloadUrl = (path) => {
  if (path && path.startsWith('gs://')) {
    return path.replace('gs://', 'https://storage.cloud.google.com/');
  }
  return path;
};

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');

  // Main UI views: 'user' or 'admin'
  const [activeView, setActiveView] = useState('user');

  // Error/Info state
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const showError = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 5000);
  };

  // Auth logout
  const handleLogout = () => {
    setUser(null);
    setToken('');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  if (!token || !user) {
    return (
      <WelcomeScreen 
        setToken={(t) => { setToken(t); localStorage.setItem('token', t); }}
        setUser={(u) => { setUser(u); localStorage.setItem('user', JSON.stringify(u)); }}
        showError={showError}
        errorMessage={errorMessage}
      />
    );
  }

  return (
    <div>
      {/* Top Banner & Header */}
      <header className="glass-panel" style={{ borderRadius: '0 0 16px 16px', marginBottom: '24px', padding: '16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="logo-container">
            <div className="logo-icon">T</div>
            <div className="logo-text">Translation Center</div>
          </div>

          <div className="user-tag">
            <span style={{ fontSize: '14px', color: '#9ca3af' }}>
              Logged in as <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong>
            </span>
            <span className="role-badge">{user.role}</span>
            
            {user.role === 'admin' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className={`btn ${activeView === 'user' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '8px 16px' }}
                  onClick={() => setActiveView('user')}
                >
                  Translations
                </button>
                <button 
                  className={`btn ${activeView === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '8px 16px' }}
                  onClick={() => setActiveView('admin')}
                >
                  Admin Control
                </button>
              </div>
            )}

            <button className="btn btn-secondary" style={{ padding: '8px 16px' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {successMessage && <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--status-approved)', padding: '12px', color: 'var(--status-approved)', borderRadius: '8px', marginBottom: '20px' }}>{successMessage}</div>}
        {errorMessage && <div className="alert-error">{errorMessage}</div>}

        {activeView === 'admin' && user.role === 'admin' ? (
          <AdminDashboard token={token} onLogout={handleLogout} showError={showError} showSuccess={showSuccess} />
        ) : (
          <UserDashboard token={token} user={user} onLogout={handleLogout} showError={showError} showSuccess={showSuccess} />
        )}
      </main>
    </div>
  );
}

/* ==========================================
   WELCOME LOGIN SCREEN
   ========================================== */
function WelcomeScreen({ setToken, setUser, showError, errorMessage }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return showError('Please fill in all fields.');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      
      setToken(data.token);
      setUser({ username: data.username, role: data.role });
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome-container">
      {/* Dynamic typography background */}
      <div className="translation-char-bg">
        {Array.from({ length: 60 }).map((_, idx) => (
          <div key={idx} style={{ animationDelay: `${idx * 0.1}s`, transform: `rotate(${idx * 15}deg)` }}>
            {TRANSLATION_CHARS[idx % TRANSLATION_CHARS.length]}
          </div>
        ))}
      </div>

      <div className="glass-panel login-card">
        <div className="login-header">
          <div className="logo-icon" style={{ margin: '0 auto 16px', width: '54px', height: '54px', fontSize: '28px' }}>T</div>
          <h1>Translation Center</h1>
          <p>Sign in to access document translations</p>
        </div>

        {errorMessage && <div className="alert-error" style={{ marginBottom: '20px' }}>{errorMessage}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input 
              type="text" 
              placeholder="e.g. user1" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ==========================================
   USER & VIEWER DASHBOARD
   ========================================== */
function UserDashboard({ token, user, onLogout, showError, showSuccess }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // Poll updates every 8 seconds
    const interval = setInterval(fetchJobs, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (id) => {
    try {
      const res = await fetch(`/api/jobs/${id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to approve job');
      }
      showSuccess(`Job #${id} translation successfully approved.`);
      fetchJobs();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleReject = async (id) => {
    try {
      const res = await fetch(`/api/jobs/${id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to reject job');
      }
      showSuccess(`Job #${id} translation rejected.`);
      fetchJobs();
    } catch (err) {
      showError(err.message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const displayedJobs = jobs.slice(startIndex, endIndex);

  return (
    <div className="dashboard-grid">
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '700' }}>Document Translation Jobs</h2>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Monitor translation pipeline status and review candidate versions</p>
          </div>
          {user.role !== 'viewer' && (
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
              + Request Translation
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty-state">Loading translation jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">No translation requests found. Create a new job to start.</div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Job ID</th>
                    <th>Job Name</th>
                    <th>Source File</th>
                    <th>Candidate Translation</th>
                    <th>Approved Translation</th>
                    <th>Tokens</th>
                    <th>Created At</th>
                    <th>Status</th>
                    {user.role !== 'viewer' && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayedJobs.map((job) => {
                    const isRejected = job.status === 'REJECTED';
                    const isFailed = job.status === 'FAILED';
                    const displayRowClass = (isRejected || isFailed) ? 'row-rejected' : '';
                    
                    return (
                      <tr key={job.id} className={displayRowClass}>
                        <td>
                          <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
                            #{job.id}
                          </span>
                        </td>
                        <td>
                          <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{job.job_name}</strong>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>
                            {job.source_lang} → {job.target_lang} ({job.model_used})
                          </span>
                        </td>
                        <td>
                          <a href={getDownloadUrl(job.source_file_path)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            Source ({job.file_type.toUpperCase()})
                          </a>
                        </td>
                        <td>
                          {job.candidate_file_path && job.status !== 'APPROVED' ? (
                            <a href={getDownloadUrl(job.candidate_file_path)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                              Candidate
                            </a>
                          ) : (
                            <span style={{ color: '#6b7280' }}>-</span>
                          )}
                        </td>
                        <td>
                          {job.status === 'APPROVED' && job.output_file_path ? (
                            <a href={getDownloadUrl(job.output_file_path)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-neon)', textDecoration: 'none', fontWeight: '500' }}>
                              Translated
                            </a>
                          ) : (
                            <span style={{ color: '#6b7280' }}>Not Approved</span>
                          )}
                        </td>
                        <td>
                          {job.tokens_consumed > 0 ? (
                            <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                              {job.tokens_consumed.toLocaleString()}
                            </span>
                          ) : (
                            <span style={{ color: '#6b7280' }}>-</span>
                          )}
                        </td>
                        <td>{new Date(job.created_at).toLocaleString()}</td>
                        <td>
                          <span className={`status-pill status-${job.status.toLowerCase()}`}>
                            {job.status}
                          </span>
                        </td>
                        {user.role !== 'viewer' && (
                          <td>
                            {job.status === 'PENDING_REVIEW' ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleApprove(job.id)}>
                                  Approve
                                </button>
                                <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleReject(job.id)}>
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: '#6b7280', fontSize: '13px' }}>Locked</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '10px 0', borderTop: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Jobs per page:</span>
                <select 
                  value={pageSize} 
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--panel-border)',
                    background: 'var(--panel-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Showing {jobs.length > 0 ? startIndex + 1 : 0}–{Math.min(endIndex, jobs.length)} of {jobs.length}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={safeCurrentPage === 1}
                  >
                    &larr; Previous
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={safeCurrentPage === totalPages}
                  >
                    Next &rarr;
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <NewJobModal 
          token={token} 
          onClose={() => setModalOpen(false)} 
          fetchJobs={fetchJobs} 
          showError={showError} 
          showSuccess={showSuccess} 
        />
      )}
    </div>
  );
}

/* ==========================================
   NEW JOB MODAL DIALOG
   ========================================== */
function NewJobModal({ token, onClose, fetchJobs, showError, showSuccess }) {
  const [jobName, setJobName] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [sourceLang, setSourceLang] = useState('Spanish');
  const [targetLang, setTargetLang] = useState('English');
  const [driveUrl, setDriveUrl] = useState('');
  const [destDriveUrl, setDestDriveUrl] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [gcpProjectId, setGcpProjectId] = useState('');

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.models) {
            setAvailableModels(data.models);
          }
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    const fetchProjectInfo = async () => {
      try {
        const res = await fetch('/api/project-info', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.project_id) {
            setGcpProjectId(data.project_id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch project info:', err);
      }
    };
    fetchModels();
    fetchProjectInfo();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jobName.trim()) return showError('Job name is required.');
    if (!file && !driveUrl.trim()) return showError('Provide either a file or a Google Drive link.');
    
    setLoading(true);

    const formData = new FormData();
    formData.append('job_name', jobName);
    formData.append('model_override', modelOverride);
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);
    formData.append('verbose', verbose);
    
    if (file) {
      formData.append('file', file);
    } else {
      formData.append('drive_url', driveUrl);
      if (destDriveUrl.trim()) {
        formData.append('destination_url', destDriveUrl.trim());
      }
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit job');
      
      showSuccess('Translation request successfully submitted.');
      fetchJobs();
      onClose();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content">
        <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
          New Translation Job
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Job Name</label>
            <input 
              type="text" 
              placeholder="e.g. Q3 Sales Report Translation" 
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Source Language</label>
              <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                <option value="Spanish">Spanish</option>
                <option value="English">English</option>
                <option value="French">French</option>
                <option value="Portuguese">Portuguese</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
              </select>
            </div>

            <div className="form-group">
              <label>Destination Language</label>
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="Portuguese">Portuguese</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Model Override (Optional)</label>
            <select value={modelOverride} onChange={(e) => setModelOverride(e.target.value)}>
              <option value="">Use Default Configured Model</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div style={{ border: '1px dashed var(--panel-border)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
            <div className="form-group">
              <label>Option A: Upload Local Document (.pdf)</label>
              <input 
                type="file" 
                accept=".pdf" 
                onChange={(e) => {
                  setFile(e.target.files[0]);
                  setDriveUrl('');
                  setDestDriveUrl('');
                }}
              />
            </div>
            
            <div style={{ textAlign: 'center', color: '#6b7280', margin: '10px 0', fontSize: '12px', fontWeight: '600' }}>OR</div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Option B: Paste Google Drive Document URL</label>
              <input 
                type="text" 
                placeholder="https://docs.google.com/document/d/..." 
                value={driveUrl}
                onChange={(e) => {
                  setDriveUrl(e.target.value);
                  setFile(null);
                  if (!e.target.value.includes('document/d/') && !e.target.value.includes('docs.google.com')) {
                    setDestDriveUrl('');
                  }
                }}
              />
            </div>

            {(driveUrl.includes('document/d/') || driveUrl.includes('docs.google.com')) && (
              <div className="form-group" style={{ marginTop: '16px', marginBottom: 0 }}>
                <label>Destination Google Doc URL (Optional)</label>
                <input 
                  type="text" 
                  placeholder="https://docs.google.com/document/d/..." 
                  value={destDriveUrl}
                  onChange={(e) => setDestDriveUrl(e.target.value)}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.4' }}>
                  <strong>Reminder:</strong> Make sure you share this destination Google Doc with Editor access to <code style={{ background: 'var(--panel-border)', padding: '2px 4px', borderRadius: '4px' }}>{`translation-center-sa@${gcpProjectId || '[GCP_PROJECT]'}.iam.gserviceaccount.com`}</code> so the app has write permissions.
                </p>
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={verbose} 
                onChange={(e) => setVerbose(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Enable Verbose Logging (log actual prompts to system logs)</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ==========================================
   ADMIN CONTROL PANEL
   ========================================== */
function AdminDashboard({ token, onLogout, showError, showSuccess }) {
  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics', 'users', 'logs', 'config'

  return (
    <div>
      <div className="admin-header-tabs">
        <div className={`admin-tab ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>
          Usage Metrics
        </div>
        <div className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          User Management
        </div>
        <div className={`admin-tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          System Logs
        </div>
        <div className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          Translation Config
        </div>
      </div>

      {activeTab === 'metrics' && <MetricsPanel token={token} onLogout={onLogout} showError={showError} />}
      {activeTab === 'users' && <UsersPanel token={token} onLogout={onLogout} showError={showError} showSuccess={showSuccess} />}
      {activeTab === 'logs' && <LogsPanel token={token} onLogout={onLogout} showError={showError} />}
      {activeTab === 'config' && <ConfigPanel token={token} onLogout={onLogout} showError={showError} showSuccess={showSuccess} />}
    </div>
  );
}

/* --- Admin - Horizontal scrolling SVG chart component --- */
function Chart({ data, valueKey, fillGradient }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.scrollLeft = chartRef.current.scrollWidth;
    }
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No data recorded in this time range.
      </div>
    );
  }

  const barWidth = 24;
  const barGap = 12;
  const chartHeight = 180;
  const totalBars = data.length;
  const chartWidth = totalBars * (barWidth + barGap) + 30;
  const maxValue = Math.max(...data.map(d => Number(d[valueKey] || 0))) || 1;

  const formatYValue = (val) => {
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (val >= 1000) {
      return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return Math.round(val).toString();
  };

  return (
    <div style={{ display: 'flex', width: '100%', alignItems: 'stretch', marginTop: '15px' }}>
      {/* Y-Axis Label and Ticks (Fixed on Left) */}
      <svg width={50} height={220} style={{ overflow: 'visible', flexShrink: 0 }}>
        {[20, 65, 110, 155, 200].map((yVal, i) => {
          const tickVal = maxValue * (1 - i * 0.25);
          return (
            <g key={i}>
              <text
                x={40}
                y={yVal + 4}
                fill="var(--text-secondary)"
                fontSize={10}
                fontWeight={500}
                textAnchor="end"
              >
                {formatYValue(tickVal)}
              </text>
              <line
                x1={42}
                y1={yVal}
                x2={45}
                y2={yVal}
                stroke="var(--panel-border)"
                strokeWidth={1}
              />
            </g>
          );
        })}
        {/* Y-Axis Line */}
        <line
          x1={45}
          y1={20}
          x2={45}
          y2={200}
          stroke="var(--panel-border)"
          strokeWidth={1}
        />
      </svg>

      {/* Horizontal Scrolling Bars Chart */}
      <div className="chart-container-wrapper" ref={chartRef} style={{ flexGrow: 1, overflowX: 'auto', marginTop: 0 }}>
        <div style={{ width: `${chartWidth}px`, height: '220px', position: 'relative' }}>
          <svg width={chartWidth} height={220} style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id={`grad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillGradient.start} />
                <stop offset="100%" stopColor={fillGradient.end} stopOpacity={0.2} />
              </linearGradient>
            </defs>

            {/* Render Grid Lines */}
            {[20, 65, 110, 155, 200].map((yVal, i) => (
              <line
                key={i}
                x1={0}
                y1={yVal}
                x2={chartWidth}
                y2={yVal}
                stroke="var(--panel-border)"
                strokeOpacity={0.5}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            ))}

            {/* Render bars */}
            {data.map((item, index) => {
              const val = Number(item[valueKey] || 0);
              const height = (val / maxValue) * chartHeight;
              const x = index * (barWidth + barGap) + 15;
              const y = chartHeight - height + 20;

              return (
                <g key={index} style={{ cursor: 'pointer' }}>
                  {/* Tooltip hover title */}
                  <title>{`${item.period}: ${val.toLocaleString()}`}</title>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                    fill={`url(#grad-${valueKey})`}
                    rx={4}
                  />
                  {/* Label */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 35}
                    fill="var(--text-secondary)"
                    fontSize={10}
                    textAnchor="middle"
                    transform={`rotate(-45, ${x + barWidth / 2}, ${chartHeight + 35})`}
                  >
                    {item.period}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* --- Admin - Usage Metrics Tab --- */
function MetricsPanel({ token, onLogout, showError }) {
  const [axis, setAxis] = useState('days'); // 'days', 'weeks', 'months'
  const [stats, setStats] = useState({ translations: [], tokens: [] });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/admin/usage-stats?axis=${axis}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch statistics');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [axis]);

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Platform Translation Activity</h3>
          <p style={{ color: '#9ca3af', fontSize: '13px' }}>Daily operations and volume consumed across the workspace</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {['days', 'weeks', 'months'].map((option) => (
            <button
              key={option}
              className={`btn ${axis === option ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setAxis(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading metrics...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Total Translation Pipelines Executed</h4>
            <Chart data={stats.translations} valueKey="count" fillGradient={{ start: 'var(--primary)', end: '#4f46e5' }} />
          </div>

          <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '30px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Gemini Tokens Consumed</h4>
            <Chart data={stats.tokens} valueKey="tokens" fillGradient={{ start: 'var(--accent-neon)', end: '#047857' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Admin - User Management Tab --- */
function UsersPanel({ token, onLogout, showError, showSuccess }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleToggle = async (username, selectedRole) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, role: selectedRole })
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to update role');
      
      showSuccess(`Role for ${username} successfully updated to ${selectedRole}`);
      fetchUsers();
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className="glass-panel">
      <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>User Roles and Credentials</h3>
      <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '20px' }}>Manage workspace permissions by toggling user, viewer, or admin role mappings</p>

      {loading ? (
        <div className="empty-state">Loading user configuration...</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Roles Mapping</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username}>
                  <td>
                    <strong style={{ color: 'var(--text-primary)' }}>{u.username}</strong>
                  </td>
                  <td>
                    <div className="checkbox-group">
                      {['user', 'viewer', 'admin'].map((roleOpt) => (
                        <label key={roleOpt} className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={u.role === roleOpt}
                            onChange={() => handleRoleToggle(u.username, roleOpt)}
                          />
                          <span style={{ textTransform: 'capitalize' }}>{roleOpt}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --- Admin - System Logs Tab --- */
function LogsPanel({ token, onLogout, showError }) {
  const [logs, setLogs] = useState([]);
  const [severity, setSeverity] = useState('ALL');
  const [timeframe, setTimeframe] = useState('1d');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/logs?severity=${severity}&timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch system logs');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [severity, timeframe]);

  return (
    <div className="glass-panel">
      <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>System Logs and Audit Events</h3>
      
      <div className="logs-filter-bar">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Filter Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="ALL">All Event Severities</option>
            <option value="INFO">Information (INFO)</option>
            <option value="ERROR">Errors (ERROR)</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Time Window</label>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            <option value="1h">Last 1 Hour</option>
            <option value="1d">Last 24 Hours</option>
            <option value="1w">Last 7 Days</option>
            <option value="1m">Last 30 Days</option>
            <option value="1y">Last 365 Days</option>
          </select>
        </div>

        <button className="btn btn-secondary" style={{ alignSelf: 'flex-end', height: '42px' }} onClick={fetchLogs}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading application log entries...</div>
      ) : logs.length === 0 ? (
        <div className="empty-state">No matching log records found in selected interval.</div>
      ) : (
        <div className="table-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Timestamp</th>
                <th style={{ width: '100px' }}>Severity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ color: '#9ca3af' }}>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>
                    <span className={log.severity === 'ERROR' ? 'logs-severity-error' : 'logs-severity-info'}>
                      {log.severity}
                    </span>
                  </td>
                  <td>{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --- Admin - Translation Config Tab --- */
function ConfigPanel({ token, onLogout, showError, showSuccess }) {
  const [configContent, setConfigContent] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const fetchConfigs = async () => {
    try {
      // Config Fetch
      const resConfig = await fetch('/api/admin/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resConfig.status === 401 || resConfig.status === 403) {
        onLogout();
        return;
      }
      const dataConfig = await resConfig.json();
      setConfigContent(dataConfig.content || '');

      // Prompt Fetch
      const resPrompt = await fetch('/api/admin/prompt', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resPrompt.status === 401 || resPrompt.status === 403) {
        onLogout();
        return;
      }
      const dataPrompt = await resPrompt.json();
      setPromptContent(dataPrompt.content || '');
    } catch (err) {
      showError('Failed to fetch GCS configurations: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: configContent })
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Save configuration failed');
      showSuccess('General translation configuration updated (previous file backed up).');
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      const res = await fetch('/api/admin/prompt', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: promptContent })
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Save prompt failed');
      showSuccess('Instructional translation prompt template updated (previous file backed up).');
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingPrompt(false);
    }
  };

  if (loading) return <div className="empty-state">Loading GCS configurations...</div>;

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>GCP Config File Configurator</h3>
        <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '16px' }}>
          Edits parameters inside the GCS config bucket (`translation_config.md`). Saving triggers auto-backups.
        </p>
        <div className="form-group">
          <textarea 
            rows={8}
            value={configContent}
            onChange={(e) => setConfigContent(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
          />
        </div>
        <button className="btn btn-primary" onClick={handleSaveConfig} disabled={savingConfig}>
          {savingConfig ? 'Saving Configuration...' : 'Save Configuration'}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '30px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Gemini Prompt Instructions Editor</h3>
        <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '16px' }}>
          Updates prompt instruction template (`translation_prompt.md`). Renames previous versions with timestamp backup.
        </p>
        <div className="form-group">
          <textarea 
            rows={12}
            value={promptContent}
            onChange={(e) => setPromptContent(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
          />
        </div>
        <button className="btn btn-primary" onClick={handleSavePrompt} disabled={savingPrompt}>
          {savingPrompt ? 'Saving Prompt Template...' : 'Save Prompt Template'}
        </button>
      </div>
    </div>
  );
}
