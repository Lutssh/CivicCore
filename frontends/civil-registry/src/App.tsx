import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import type { AuthData } from './types';
import './index.css';

// --- Auth Context ---
const AuthContext = createContext<{
  auth: AuthData | null;
  login: (data: AuthData) => void;
  logout: () => void;
} | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthData | null>(() => {
    const saved = localStorage.getItem('civiccore_auth');
    return saved ? JSON.parse(saved) : null;
  });

  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth', JSON.stringify(data));
  };

  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth');
  };

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext)!;

// --- API ---
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

// --- Components ---

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('registrar@civiccore.demo');
  const [password, setPassword] = useState('Demo@2026');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const resp = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (data.success) {
        login(data.data);
        navigate('/');
      } else {
        setError(data.error.message);
      }
    } catch (err) {
      setError('Connection failed');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form className="card" style={{ width: 320 }} onSubmit={handleSubmit}>
        <div className="card-header">Civil Registry Login</div>
        <div className="form-group">
          <label>Email</label>
          <input type="text" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit" style={{ width: '100%' }}>Login</button>
      </form>
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2>CivicCore</h2>
        <div style={{ fontSize: 12, marginBottom: 16, opacity: 0.8 }}>Civil Registry</div>
        <div className="sidebar-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/register-birth">Register Birth</Link>
          <Link to="/register-death">Register Death</Link>
          <Link to="/search">Search Citizens</Link>
          <a href="#" onClick={handleLogout} style={{ marginTop: 'auto' }}>Logout</a>
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
  const { auth } = useAuth();
  const [stats, setStats] = useState<{ total_citizens: number; registrations_today: number } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/citizens/stats`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); });
  }, [auth]);

  return (
    <div>
      <h1>Civil Registry Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">System Status</div>
          <div>Total Citizens: <strong>{stats?.total_citizens ?? '...'}</strong></div>
          <div>Registrations today: <strong>{stats?.registrations_today ?? '...'}</strong></div>
        </div>
        <div className="card">
          <div className="card-header">Quick Actions</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/register-birth"><button>Register New Birth</button></Link>
          </div>
        </div>
      </div>
    </div>
  );
};

const BirthRegistration = () => {
  const { auth } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    sex: 'M',
    year_of_birth: new Date().getFullYear(),
    month_of_birth: 1,
    day_of_birth: 1,
    district_of_birth: 'Kampala',
    place_of_birth: '',
    father_citizen_id: '',
    mother_citizen_id: '',
  });
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Normalize empty strings to null for optional ID fields
      const payload = {
        ...form,
        father_citizen_id: form.father_citizen_id.trim() || null,
        mother_citizen_id: form.mother_citizen_id.trim() || null,
      };

      const resp = await fetch(`${API_URL}/citizens/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.success) {
        setSuccess(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Submission failed');
    }
  };

  if (success) {
    return (
      <div className="card" style={{ border: '2px solid var(--color-success)' }}>
        <h2 style={{ color: 'var(--color-success)' }}>Birth Registered Successfully</h2>
        <div style={{ fontSize: 24, marginBottom: 16 }}>
          Citizen ID: <span className="monospace" style={{ fontWeight: 'bold' }}>{success.citizen_id}</span>
        </div>
        <p>Name: <strong>{success.full_name}</strong></p>
        <button onClick={() => setSuccess(null)}>Register Another</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Birth Registration</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
        <div className="form-group">
          <label>Full Name <span className="required">*</span></label>
          <input type="text" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Sex <span className="required">*</span></label>
            <select value={form.sex} onChange={e => setForm({...form, sex: e.target.value})} required>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 16, flex: 2 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Day <span className="required">*</span></label>
              <input
                type="number" min={1} max={31}
                value={form.day_of_birth}
                onChange={e => setForm({ ...form, day_of_birth: parseInt(e.target.value) })}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Month <span className="required">*</span></label>
              <select value={form.month_of_birth} onChange={e => setForm({ ...form, month_of_birth: parseInt(e.target.value) })} required>
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Year <span className="required">*</span></label>
              <input
                type="number" min={1900} max={new Date().getFullYear()}
                value={form.year_of_birth}
                onChange={e => setForm({ ...form, year_of_birth: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>
        </div>
        <div className="form-group">
          <label>District of Birth <span className="required">*</span></label>
          <input type="text" value={form.district_of_birth} onChange={e => setForm({...form, district_of_birth: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Place of Birth</label>
          <input type="text" placeholder="Hospital or Home" value={form.place_of_birth} onChange={e => setForm({...form, place_of_birth: e.target.value})} />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Father's Citizen ID</label>
            <input type="text" className="monospace" value={form.father_citizen_id} onChange={e => setForm({...form, father_citizen_id: e.target.value})} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Mother's Citizen ID</label>
            <input type="text" className="monospace" value={form.mother_citizen_id} onChange={e => setForm({...form, mother_citizen_id: e.target.value})} />
          </div>
        </div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit">Register Citizen</button>
      </form>
    </div>
  );
};

const CitizenSearch = () => {
  const { auth } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_URL}/citizens/search?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      const data = await resp.json();
      if (data.success) {
        setResults(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Search Citizens</h1>
      <div className="card">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Search by Name or Citizen ID..." 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}

      {results.length > 0 && (
        <div className="card" style={{ padding: 0, marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Citizen ID</th>
                <th>Full Name</th>
                <th>Sex</th>
                <th>Year of Birth</th>
                <th>District</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c: any) => (
                <tr key={c.citizen_id}>
                  <td className="monospace">{c.citizen_id}</td>
                  <td><strong>{c.full_name}</strong></td>
                  <td>{c.sex === 'M' ? 'Male' : 'Female'}</td>
                  <td>{c.year_of_birth}</td>
                  <td>{c.district}</td>
                  <td>
                    <span style={{ color: c.status === 'ACTIVE' ? 'green' : c.status === 'DECEASED' ? '#666' : 'red' }}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && query && results.length === 0 && !error && (
        <div style={{ textAlign: 'center', marginTop: 32, color: '#666' }}>
          No citizens found matching "{query}"
        </div>
      )}
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
};

const DeathRegistration = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [citizenId, setCitizenId] = useState('');
  const [form, setForm] = useState({
    date_of_death: new Date().toISOString().split('T')[0],
    place_of_death: 'Kampala',
    cause_of_death: '',
    informant_name: '',
    informant_relationship: 'SPOUSE',
  });
  const [citizen, setCitizen] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const lookupCitizen = async () => {
    if (!citizenId.trim()) return;
    setLoading(true);
    setError('');
    setCitizen(null);
    try {
      const resp = await fetch(`${API_URL}/citizens/${citizenId}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) {
        if (data.data.status === 'DECEASED') {
          setError('Citizen is already marked as deceased.');
        } else {
          setCitizen(data.data);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Are you sure you want to register the death of ${citizen.full_name}? This action is irreversible.`)) return;

    try {
      const resp = await fetch(`${API_URL}/citizens/${citizenId}/death`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify(form),
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Submission failed');
    }
  };

  if (success) {
    return (
      <div className="card" style={{ border: '2px solid #666' }}>
        <h2>Death Registered</h2>
        <p>Citizen record updated to <strong>DECEASED</strong>.</p>
        <p>System-wide cascade notifications triggered.</p>
        <button onClick={() => { setSuccess(false); setCitizen(null); setCitizenId(''); }}>Register Another</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Register Death</h1>
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
          <button onClick={lookupCitizen} disabled={loading}>{loading ? 'Searching...' : 'Find Citizen'}</button>
        </div>
      </div>

      {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}

      {citizen && (
        <form className="card" onSubmit={handleSubmit} style={{ marginTop: 16, maxWidth: 600 }}>
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #ddd' }}>
            <div>Registering death for: <strong>{citizen.full_name}</strong></div>
            <div className="monospace" style={{ fontSize: 14 }}>{citizen.citizen_id}</div>
          </div>
          
          <div className="form-group">
            <label>Date of Death <span className="required">*</span></label>
            <input type="date" value={form.date_of_death} onChange={e => setForm({...form, date_of_death: e.target.value})} required />
          </div>
          
          <div className="form-group">
            <label>Place of Death <span className="required">*</span></label>
            <input type="text" value={form.place_of_death} onChange={e => setForm({...form, place_of_death: e.target.value})} required />
          </div>

          <div className="form-group">
            <label>Cause of Death (Optional)</label>
            <input type="text" value={form.cause_of_death} onChange={e => setForm({...form, cause_of_death: e.target.value})} />
          </div>

          <div className="form-group">
            <label>Informant Name <span className="required">*</span></label>
            <input type="text" value={form.informant_name} onChange={e => setForm({...form, informant_name: e.target.value})} required />
          </div>

          <div className="form-group">
            <label>Informant Relationship <span className="required">*</span></label>
            <select value={form.informant_relationship} onChange={e => setForm({...form, informant_relationship: e.target.value})}>
              <option value="SPOUSE">Spouse</option>
              <option value="CHILD">Child</option>
              <option value="PARENT">Parent</option>
              <option value="SIBLING">Sibling</option>
              <option value="DOCTOR">Medical Professional</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <button type="submit" style={{ backgroundColor: '#c0392b' }}>Register Death</button>
        </form>
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
          <Route path="/register-birth" element={<ProtectedRoute><BirthRegistration /></ProtectedRoute>} />
          <Route path="/register-death" element={<ProtectedRoute><DeathRegistration /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><CitizenSearch /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
