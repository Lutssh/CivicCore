import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import type { AuthData } from './types';
import './index.css';

const AuthContext = createContext<{
  auth: AuthData | null;
  login: (data: AuthData) => void;
  logout: () => void;
} | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthData | null>(() => {
    const saved = localStorage.getItem('civiccore_auth_rev');
    return saved ? JSON.parse(saved) : null;
  });
  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth_rev', JSON.stringify(data));
  };
  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth_rev');
  };
  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext)!;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('revenue@civiccore.demo');
  const [password, setPassword] = useState('Demo@2026');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (data.success) { login(data.data); navigate('/'); }
      else setError(data.error.message);
    } catch (err) { setError('Connection failed'); }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form className="card" style={{ width: 320 }} onSubmit={handleSubmit}>
        <div className="card-header">Revenue Service Portal Login</div>
        <div className="form-group"><label>Email</label><input type="text" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-group"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit" style={{ width: '100%' }}>Login</button>
      </form>
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app-container">
      <div className="sidebar" style={{ backgroundColor: '#16a085' }}>
        <h2>CivicCore</h2>
        <div style={{ fontSize: 12, marginBottom: 16, opacity: 0.8 }}>Revenue Service</div>
        <div className="sidebar-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/register">Register Taxpayer</Link>
          <Link to="/compliance">Update Compliance</Link>
          <Link to="/search">Search Records</Link>
          <a href="#" onClick={() => { logout(); navigate('/login'); }} style={{ marginTop: 'auto' }}>Logout</a>
        </div>
      </div>
      <div className="content">
        <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
          <div>Logged in as: <strong>{auth?.user.full_name}</strong> ({auth?.user.role})</div>
        </header>
        {children}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/revenue/stats`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => {
        if (r.status === 401) { logout(); navigate('/login'); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => { if (d && d.success) setStats(d.data); });
  }, [auth, logout, navigate]);

  return (
    <div>
      <h1>Revenue Service Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-header">Total Taxpayers</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.total_taxpayers ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Compliant Taxpayers</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.compliant_taxpayers ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Registered Today</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.registrations_today ?? '...'}</div>
        </div>
      </div>
    </div>
  );
};

const RegisterTaxpayer = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ citizen_id: '', taxpayer_category: 'INDIVIDUAL' });
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const resp = await fetch(`${API_URL}/revenue/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` },
        body: JSON.stringify(form),
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) setSuccess(data.data);
      else setError(data.error);
    } catch (err) { setError('Submission failed'); }
  };

  if (success) return (
    <div className="card" style={{ border: '2px solid var(--color-success)' }}>
      <h2 style={{ color: 'var(--color-success)' }}>Taxpayer Registered</h2>
      <p>Tax ID (TIN): <strong className="monospace">{success.tax_id}</strong></p>
      <button onClick={() => setSuccess(null)}>Back</button>
    </div>
  );

  return (
    <div>
      <h1>Register Taxpayer</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
        <div className="form-group">
          <label>Citizen ID <span className="required">*</span></label>
          <input type="text" className="monospace" value={form.citizen_id} onChange={e => setForm({...form, citizen_id: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Taxpayer Category <span className="required">*</span></label>
          <select value={form.taxpayer_category} onChange={e => setForm({...form, taxpayer_category: e.target.value})}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="SOLE_PROPRIETOR">Sole Proprietor</option>
            <option value="COMPANY_DIRECTOR">Company Director</option>
          </select>
        </div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit">Register</button>
      </form>
    </div>
  );
};

const UpdateCompliance = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [citizenId, setCitizenId] = useState('');
  const [record, setRecord] = useState<any>(null);
  const [form, setForm] = useState({ compliance_status: 'COMPLIANT', last_filing_period: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRecord = async () => {
    if (!citizenId.trim()) return;
    setLoading(true);
    setError('');
    setRecord(null);
    try {
      const resp = await fetch(`${API_URL}/revenue/${citizenId}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) {
        setRecord(data.data);
        setForm({ 
          compliance_status: data.data.compliance_status, 
          last_filing_period: data.data.last_filing_period || '' 
        });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch record');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${API_URL}/revenue/${citizenId}/compliance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` },
        body: JSON.stringify(form),
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) {
        alert('Compliance updated successfully');
        fetchRecord();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Failed to update compliance');
    }
  };

  return (
    <div>
      <h1>Update Compliance Status</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Enter Citizen ID..." 
            className="monospace"
            value={citizenId} 
            onChange={e => setCitizenId(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={fetchRecord} disabled={loading}>{loading ? 'Searching...' : 'Find'}</button>
        </div>
      </div>

      {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}

      {record && (
        <form className="card" onSubmit={handleSubmit} style={{ marginTop: 16, maxWidth: 500 }}>
          <div style={{ marginBottom: 16 }}>
            <div>Tax ID: <strong className="monospace">{record.tax_id}</strong></div>
            <div>Full Name: <strong>{record.full_name || '...'}</strong></div>
          </div>
          <div className="form-group">
            <label>Compliance Status</label>
            <select value={form.compliance_status} onChange={e => setForm({...form, compliance_status: e.target.value})}>
              <option value="COMPLIANT">Compliant</option>
              <option value="NON_COMPLIANT">Non-Compliant</option>
              <option value="FLAGGED">Flagged for Audit</option>
              <option value="PENDING">Pending Review</option>
            </select>
          </div>
          <div className="form-group">
            <label>Last Filing Period (e.g. 2026-Q1)</label>
            <input type="text" value={form.last_filing_period} onChange={e => setForm({...form, last_filing_period: e.target.value})} />
          </div>
          <button type="submit">Update Record</button>
        </form>
      )}
    </div>
  );
};

const SearchTaxpayers = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/revenue/search?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) setResults(data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    handleSearch();
  }, [auth]);

  return (
    <div>
      <h1>Search Taxpayers</h1>
      <div className="card">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Search by Name, Citizen ID, or TIN..." 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Citizen ID</th>
              <th>Full Name</th>
              <th>TIN</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r: any) => (
              <tr key={r.id}>
                <td className="monospace">{r.citizen_id}</td>
                <td><strong>{r.full_name}</strong></td>
                <td className="monospace">{r.tax_id}</td>
                <td>{r.taxpayer_category}</td>
                <td>
                  <span style={{ color: r.compliance_status === 'COMPLIANT' ? 'green' : 'red' }}>
                    {r.compliance_status}
                  </span>
                </td>
              </tr>
            ))}
            {results.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No taxpayers found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/register" element={<ProtectedRoute><RegisterTaxpayer /></ProtectedRoute>} />
          <Route path="/compliance" element={<ProtectedRoute><UpdateCompliance /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchTaxpayers /></ProtectedRoute>} />
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
