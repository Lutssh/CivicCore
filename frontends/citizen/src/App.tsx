import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import type { AuthData, Citizen } from './types';
import './index.css';

const AuthContext = createContext<{
  auth: AuthData | null;
  login: (data: AuthData) => void;
  logout: () => void;
} | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthData | null>(() => {
    const saved = localStorage.getItem('civiccore_auth_citizen');
    return saved ? JSON.parse(saved) : null;
  });
  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth_citizen', JSON.stringify(data));
  };
  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth_citizen');
  };
  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext)!;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [citizenId, setCitizenId] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const resp = await fetch(`${API_URL}/auth/citizen/verify-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, phone }),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) setStep(2);
    else setError(data.error?.message || 'Verification failed');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const resp = await fetch(`${API_URL}/auth/citizen/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, phone, otp }),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) setStep(3);
    else setError(data.error?.message || 'Invalid code');
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const resp = await fetch(`${API_URL}/auth/citizen/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, phone, password }),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) navigate('/login');
    else setError(data.error?.message || 'Failed to set password');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="card" style={{ width: 360 }}>
        <div className="card-header">Create Citizen Account — Step {step} of 3</div>
        {step === 1 && (
          <form onSubmit={handleVerifyIdentity}>
            <div className="form-group">
              <label>Citizen ID</label>
              <input className="monospace" value={citizenId} onChange={e => setCitizenId(e.target.value)} required placeholder="e.g. CM850001AJR6" />
            </div>
            <div className="form-group">
              <label>Phone Number on Record</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+256..." />
            </div>
            {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Send Verification Code'}
            </button>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <p style={{ fontSize: 13, color: '#555' }}>A 6-digit code was sent to {phone}. (Check server logs in prototype mode.)</p>
            <div className="form-group">
              <label>Verification Code</label>
              <input className="monospace" value={otp} onChange={e => setOtp(e.target.value)} required maxLength={6} placeholder="000000" />
            </div>
            {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Checking...' : 'Verify Code'}
            </button>
          </form>
        )}
        {step === 3 && (
          <form onSubmit={handleSetPassword}>
            <div className="form-group">
              <label>Set Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            </div>
            {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          Already have an account? <a href="/login">Log in</a>
        </div>
      </div>
    </div>
  );
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [id, setId] = useState('CM850001AXMR');
  const [password, setPassword] = useState('Demo@2026');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: id, password }),
      });
      const data = await resp.json();
      if (data.success) { login(data.data); navigate('/'); }
      else setError(data.error.message);
    } catch (err) { setError('Connection failed'); }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form className="card" style={{ width: 320 }} onSubmit={handleSubmit}>
        <div className="card-header">Citizen Portal Login</div>
        <div className="form-group"><label>Citizen ID</label><input type="text" className="monospace" value={id} onChange={e => setId(e.target.value)} /></div>
        <div className="form-group"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit" style={{ width: '100%' }}>View My Records</button>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          No account yet? <a href="/register">Create one</a>
        </div>
      </form>
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app-container">
      <div className="sidebar" style={{ backgroundColor: '#2c3e50' }}>
        <h2>CivicCore</h2>
        <div style={{ fontSize: 12, marginBottom: 16, opacity: 0.8 }}>Citizen Portal</div>
        <div className="sidebar-nav">
          <Link to="/">My Profile</Link>
          <Link to="/records">My Records</Link>
          <Link to="/audit">Access Log</Link>
          <Link to="/dispute">Raise Dispute</Link>
          <a href="#" onClick={() => { logout(); navigate('/login'); }} style={{ marginTop: 'auto' }}>Logout</a>
        </div>
      </div>
      <div className="content">{children}</div>
    </div>
  );
};

const Profile = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [citizen, setCitizen] = useState<Citizen | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/citizens/${auth?.user.citizen_id}`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => {
      if (r.status === 401) { logout(); navigate('/login'); return null; }
      return r.json();
    })
    .then(d => { if (d && d.success) setCitizen(d.data); });
  }, [auth, logout, navigate]);

  if (!citizen) return <div>Loading profile...</div>;

  return (
    <div>
      <h1>My National Identity</h1>
      <div className="card" style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 120, height: 150, backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>PHOTO</div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{citizen.full_name}</div>
          <div className="monospace" style={{ fontSize: 18, color: 'var(--color-primary)', marginBottom: 16 }}>{citizen.citizen_id}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <label>Sex:</label><div>{citizen.sex === 'M' ? 'Male' : 'Female'}</div>
            <label>Year of Birth:</label><div>{citizen.year_of_birth}</div>
            <label>District:</label><div>{citizen.district_of_birth}</div>
            <label>Nationality:</label><div>{citizen.nationality}</div>
            <label>Status:</label><div className="status status-active"><span className="dot"></span> Active</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MyRecords = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [citizen, setCitizen] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/citizens/${auth?.user.citizen_id}`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => {
      if (r.status === 401) { logout(); navigate('/login'); return null; }
      return r.json();
    })
    .then(d => { if (d && d.success) setCitizen(d.data); });
  }, [auth, logout, navigate]);

  if (!citizen) return <div style={{ padding: 24 }}>Loading records...</div>;

  const edu = citizen.sectors.education;
  const rev = citizen.sectors.revenue;
  const lab = citizen.sectors.labour;

  return (
    <div>
      <h1>My Government Records</h1>
      
      {/* Education Sector */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Education Records</span>
          <span style={{ fontSize: 12, fontWeight: 'normal', color: edu.visible ? 'green' : 'red' }}>
            {edu.visible ? '✓ Shared' : '🔒 Restricted'}
          </span>
        </div>
        <div style={{ padding: 16 }}>
          {edu.visible && edu.data ? (
            <div>
              <h4 style={{ marginTop: 0 }}>Enrollment History</h4>
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Type</th>
                    <th>Enrollment Date</th>
                    <th>Completion Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {edu.data.enrollments?.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>No education enrollment records</td></tr>
                  ) : (
                    edu.data.enrollments?.map((r: any) => (
                      <tr key={r.id}>
                        <td><strong>{r.institution_name}</strong></td>
                        <td>{r.institution_type}</td>
                        <td>{r.enrollment_date}</td>
                        <td>{r.completion_date || 'N/A'}</td>
                        <td><span className={`status status-${r.status === 'COMPLETED' ? 'active' : 'inactive'}`}>{r.status}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <h4 style={{ marginTop: 24 }}>National Exam Results</h4>
              <table>
                <thead>
                  <tr>
                    <th>Exam Type</th>
                    <th>Year</th>
                    <th>Grade</th>
                    <th>Institution</th>
                  </tr>
                </thead>
                <tbody>
                  {edu.data.results?.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center' }}>No national examination results</td></tr>
                  ) : (
                    edu.data.results?.map((e: any) => (
                      <tr key={e.id}>
                        <td><strong>{e.exam_type}</strong></td>
                        <td>{e.year_of_exam}</td>
                        <td>{e.grade}</td>
                        <td>{e.institution || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{edu.message}</p>
          )}
        </div>
      </div>

      {/* Revenue Sector */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Revenue & Taxation</span>
          <span style={{ fontSize: 12, fontWeight: 'normal', color: rev.visible ? 'green' : 'red' }}>
            {rev.visible ? '✓ Shared' : '🔒 Restricted'}
          </span>
        </div>
        <div style={{ padding: 16 }}>
          {rev.visible && rev.data ? (
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8 }}>
              <label>Tax ID (TIN):</label><div className="monospace">{rev.data.tax_id}</div>
              <label>Category:</label><div>{rev.data.taxpayer_category}</div>
              <label>Compliance Status:</label>
              <div>
                <span className={`status status-${rev.data.compliance_status === 'COMPLIANT' ? 'active' : 'inactive'}`}>
                  {rev.data.compliance_status}
                </span>
              </div>
              <label>Registration Date:</label><div>{rev.data.registration_date}</div>
              <label>Last Filing Date:</label><div>{rev.data.last_filing_date || 'N/A'}</div>
              <label>Last Period:</label><div>{rev.data.last_filing_period || 'N/A'}</div>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{rev.message}</p>
          )}
        </div>
      </div>

      {/* Labour Sector */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Employment History</span>
          <span style={{ fontSize: 12, fontWeight: 'normal', color: lab.visible ? 'green' : 'red' }}>
            {lab.visible ? '✓ Shared' : '🔒 Restricted'}
          </span>
        </div>
        <div style={{ padding: 16 }}>
          {lab.visible && lab.data ? (
            <table>
              <thead>
                <tr>
                  <th>Employer</th>
                  <th>Job Title</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>NSSF Status</th>
                </tr>
              </thead>
              <tbody>
                {lab.data.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center' }}>No employment records</td></tr>
                ) : (
                  lab.data.map((l: any) => (
                    <tr key={l.id}>
                      <td><strong>{l.employer_name}</strong></td>
                      <td>{l.job_title}</td>
                      <td>{l.employment_type}</td>
                      <td>{l.start_date} to {l.end_date || 'Present'}</td>
                      <td>{l.status}</td>
                      <td>{l.nssf_number ? `${l.nssf_status} (${l.nssf_number})` : l.nssf_status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{lab.message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const AccessLog = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/citizens/${auth?.user.citizen_id}/audit`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => {
      if (r.status === 401) { logout(); navigate('/login'); return null; }
      return r.json();
    })
    .then(d => { if (d && d.success) setLogs(d.data); });
  }, [auth, logout, navigate]);

  return (
    <div>
      <h1>Access Log</h1>
      <p>Full history of every official who accessed your record.</p>
      
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Date/Time</th>
              <th>Who Accessed</th>
              <th>What Was Accessed</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>No access entries recorded</td></tr>
            ) : (
              logs.map((l: any) => {
                let outcomeColor = 'orange';
                if (l.outcome === 'SUCCESS') outcomeColor = 'green';
                else if (l.outcome === 'BLOCKED') outcomeColor = 'red';
                else if (l.outcome === 'SECURITY_ALERT') outcomeColor = 'orange';

                return (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td><strong>{l.actor_role}</strong> ({l.actor_sector || 'SYSTEM'})</td>
                    <td>{l.sector_accessed || l.action || 'PROFILE'}</td>
                    <td>
                      <span style={{ 
                        color: outcomeColor, 
                        fontWeight: 'bold',
                        backgroundColor: outcomeColor === 'green' ? '#e8f5e9' : outcomeColor === 'red' ? '#ffebee' : '#fff3e0',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        {l.outcome}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, fontStyle: 'italic', paddingLeft: 8 }}>
        ⚠️ *This log is permanent. Entries cannot be edited or deleted by anyone.*
      </div>
    </div>
  );
};

const RaiseDispute = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    citizen_id: auth?.user.citizen_id || '',
    dispute_type: 'INCORRECT_PERSONAL_INFO',
    description: '',
    supporting_info: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const resp = await fetch(`${API_URL}/disputes/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify(form)
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) {
        setMessage('Dispute raised successfully! Our registrars will review this under case record ID: ' + (data.dispute_id || ''));
        setForm({
          citizen_id: auth?.user.citizen_id || '',
          dispute_type: 'INCORRECT_PERSONAL_INFO',
          description: '',
          supporting_info: ''
        });
      } else {
        setError(data.error || 'Failed to submit dispute');
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Raise a Dispute</h1>
      <p>Report incorrect information on your record to the Civil Registrar.</p>
      
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group" style={{ padding: '0 16px' }}>
          <label>Citizen ID</label>
          <input type="text" className="monospace" value={form.citizen_id} disabled style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div className="form-group" style={{ padding: '0 16px' }}>
          <label>Dispute Category</label>
          <select 
            value={form.dispute_type} 
            onChange={e => setForm({ ...form, dispute_type: e.target.value })}
            style={{ width: '100%', boxSizing: 'border-box' }}
          >
            <option value="INCORRECT_PERSONAL_INFO">Incorrect Personal Info (Name, Sex, Birth details)</option>
            <option value="INCORRECT_EDUCATION_RECORDS">Incorrect Education Records</option>
            <option value="INCORRECT_TAX_STATUS">Incorrect Revenue / Tax Compliance Status</option>
            <option value="INCORRECT_LABOUR_HISTORY">Incorrect Employment / Labour History</option>
          </select>
        </div>
        <div className="form-group" style={{ padding: '0 16px' }}>
          <label>Detailed Description</label>
          <textarea 
            rows={5} 
            value={form.description} 
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Describe exactly what information is incorrect and what the correct details should be..."
            style={{ width: '100%', boxSizing: 'border-box' }}
            required
          />
        </div>
        <div className="form-group" style={{ padding: '0 16px' }}>
          <label>Supporting Information / References</label>
          <input 
            type="text" 
            value={form.supporting_info} 
            onChange={e => setForm({ ...form, supporting_info: e.target.value })}
            placeholder="e.g. Birth certificate number, TIN, Employer NSSF, or Certificate ID..."
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          {message && <div style={{ color: 'green', marginBottom: 16 }}>{message}</div>}
          {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}

          <button type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Submitting...' : 'Submit Dispute Claim'}
          </button>
        </div>
      </form>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/records" element={<ProtectedRoute><MyRecords /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><AccessLog /></ProtectedRoute>} />
          <Route path="/dispute" element={<ProtectedRoute><RaiseDispute /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
};

export default App;
