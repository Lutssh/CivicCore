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
    const saved = localStorage.getItem('civiccore_auth_lab');
    return saved ? JSON.parse(saved) : null;
  });
  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth_lab', JSON.stringify(data));
  };
  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth_lab');
  };
  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext)!;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('labour@civiccore.demo');
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
        <div className="card-header">Labour Authority Portal Login</div>
        <div className="form-group"><label>Email</label><input type="text" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-group"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit" style={{ width: '100%' }}>Login</button>
      </form>
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app-container">
      <div className="sidebar" style={{ backgroundColor: '#e67e22' }}>
        <h2>CivicCore</h2>
        <div style={{ fontSize: 12, marginBottom: 16, opacity: 0.8 }}>Labour Authority</div>
        <div className="sidebar-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/register">Register Employment</Link>
          <Link to="/close">Close Employment</Link>
          <Link to="/search">Search Records</Link>
          <a href="#" onClick={() => { logout(); navigate('/login'); }} style={{ marginTop: 'auto' }}>Logout</a>
        </div>
      </div>
      <div className="content">{children}</div>
    </div>
  );
};

const Dashboard = () => {
  const { auth } = useAuth();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/labour/stats`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.success) setStats(d.data); });
  }, [auth]);

  return (
    <div>
      <h1>Labour Authority Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-header">Total Records</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.total_records ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Active Employment</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.active_employment ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Recorded Today</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.recorded_today ?? '...'}</div>
        </div>
      </div>
    </div>
  );
};

const RegisterEmployment = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    citizen_id: '',
    employer_name: '',
    job_title: '',
    employment_type: 'FORMAL',
    start_date: new Date().toISOString().split('T')[0],
    nssf_number: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${API_URL}/labour/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` },
        body: JSON.stringify(form),
      });
      
      if (resp.status === 401) {
        alert('Session expired. Please log in again.');
        logout();
        navigate('/login');
        return;
      }

      const data = await resp.json();
      if (data.success) {
        alert('Employment record created');
        setForm({ ...form, citizen_id: '', employer_name: '', job_title: '' });
      } else {
        alert('Error: ' + (data.error || 'Failed to register'));
      }
    } catch (err) {
      alert('Network error. Check console.');
      console.error(err);
    }
  };

  return (
    <div>
      <h1>Register Employment</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
        <div className="form-group">
          <label>Citizen ID <span className="required">*</span></label>
          <input type="text" className="monospace" value={form.citizen_id} onChange={e => setForm({...form, citizen_id: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Employer Name <span className="required">*</span></label>
          <input type="text" value={form.employer_name} onChange={e => setForm({...form, employer_name: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Job Title <span className="required">*</span></label>
          <input type="text" value={form.job_title} onChange={e => setForm({...form, job_title: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Employment Type</label>
          <select value={form.employment_type} onChange={e => setForm({...form, employment_type: e.target.value})}>
            <option value="FORMAL">Formal</option>
            <option value="INFORMAL">Informal</option>
            <option value="CONTRACT">Contract</option>
            <option value="SELF_EMPLOYED">Self-Employed</option>
          </select>
        </div>
        <div className="form-group">
          <label>NSSF Number</label>
          <input type="text" value={form.nssf_number} onChange={e => setForm({...form, nssf_number: e.target.value})} />
        </div>
        <button type="submit">Register Employment</button>
      </form>
    </div>
  );
};

const SearchRecords = () => {
  const { auth } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/labour/search?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) setResults(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Search Employment Records</h1>
      <div className="card">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Search by Name, Citizen ID, or Employer..." 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
        </form>
      </div>

      {results.length > 0 && (
        <div className="card" style={{ padding: 0, marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Citizen ID</th>
                <th>Full Name</th>
                <th>Employer</th>
                <th>Job Title</th>
                <th>Status</th>
                <th>Start Date</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any) => (
                <tr key={r.id}>
                  <td className="monospace">{r.citizen_id}</td>
                  <td><strong>{r.full_name}</strong></td>
                  <td>{r.employer_name}</td>
                  <td>{r.job_title}</td>
                  <td>
                    <span style={{ color: r.status === 'ACTIVE' ? 'green' : 'red' }}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.start_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const CloseEmployment = () => {
  const { auth } = useAuth();
  const [citizenId, setCitizenId] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRecords = async () => {
    if (!citizenId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_URL}/labour/${citizenId}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          setRecords(data.data);
        } else {
          setError(data.error);
        }
      } else {
        setError('Request failed with status ' + resp.status);
      }
    } catch (err) {
      setError('Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (id: string) => {
    const endDate = new Date().toISOString().split('T')[0];
    if (!confirm(`Close this employment record as of ${endDate}?`)) return;

    try {
      const resp = await fetch(`${API_URL}/labour/${id}/close`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}` 
        },
        body: JSON.stringify({ end_date: endDate })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          alert('Employment record closed successfully');
          fetchRecords();
        } else {
          alert('Error: ' + data.error);
        }
      } else {
        alert('Failed to close record. Status: ' + resp.status);
      }
    } catch (err) {
      alert('Failed to close record');
    }
  };

  return (
    <div>
      <h1>Close Employment Record</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Enter Citizen ID (e.g. CM850001AJR6)" 
            value={citizenId} 
            onChange={e => setCitizenId(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={fetchRecords} disabled={loading}>
            {loading ? 'Searching...' : 'Find Records'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}

      {records.length > 0 && (
        <div className="card" style={{ padding: 0, marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Employer</th>
                <th>Job Title</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td><strong>{r.employer_name}</strong></td>
                  <td>{r.job_title}</td>
                  <td>
                    <span style={{ color: r.status === 'ACTIVE' ? 'green' : '#666' }}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.start_date}</td>
                  <td>
                    {r.status === 'ACTIVE' && (
                      <button className="btn-secondary" onClick={() => handleClose(r.id)}>
                        Terminate / Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
          <Route path="/register" element={<ProtectedRoute><RegisterEmployment /></ProtectedRoute>} />
          <Route path="/close" element={<ProtectedRoute><CloseEmployment /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchRecords /></ProtectedRoute>} />
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
