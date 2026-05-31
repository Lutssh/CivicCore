import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { AuthData } from './types';
import './index.css';

// --- Auth Context (Shared logic, simplified for prototype) ---
const AuthContext = createContext<{
  auth: AuthData | null;
  login: (data: AuthData) => void;
  logout: () => void;
} | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthData | null>(() => {
    const saved = localStorage.getItem('civiccore_auth_verify');
    return saved ? JSON.parse(saved) : null;
  });

  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth_verify', JSON.stringify(data));
  };

  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth_verify');
  };

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext)!;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('border@civiccore.demo');
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
        <div className="card-header">Verification Terminal Login</div>
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

const Terminal = () => {
  const { auth } = useAuth();
  const [query, setQuery] = useState({
    citizen_id: 'CM850001AXMR',
    query_type: 'BORDER_CLEARANCE',
    purpose: 'Travel document verification',
    location: 'Malaba Border Post'
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [healthMode, setHealthMode] = useState('APPROVE');

  const runQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const resp = await fetch(`${API_URL}/verify/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify(query),
      });
      const data = await resp.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError({ message: 'Query failed' });
    } finally {
      setLoading(false);
    }
  };

  const updateHealthMode = async (mode: string) => {
    try {
      await fetch(`${API_URL}/verify/demo/health-mode`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify({ mode }),
      });
      setHealthMode(mode);
      alert(`Health mode set to ${mode}`);
    } catch (err) {
      alert('Failed to update health mode.');
    }
  };

  return (
    <div className="app-container" style={{ flexDirection: 'column', maxWidth: '1000px' }}>
      <header style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--color-primary)', color: 'white' }}>
        <div style={{ fontWeight: 'bold' }}>CivicCore | Automated Verification Terminal</div>
        <div>{auth?.user.full_name} ({auth?.user.role})</div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', flexGrow: 1 }}>
        <div style={{ padding: 24, borderRight: '1px solid var(--color-border)' }}>
          <h3>Run Verification Query</h3>
          <form onSubmit={runQuery}>
            <div className="form-group">
              <label>Citizen ID</label>
              <input type="text" className="monospace" value={query.citizen_id} onChange={e => setQuery({...query, citizen_id: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Query Type</label>
              <select value={query.query_type} onChange={e => setQuery({...query, query_type: e.target.value})}>
                <option value="BORDER_CLEARANCE">BORDER_CLEARANCE</option>
                <option value="WELFARE_ELIGIBILITY">WELFARE_ELIGIBILITY</option>
                <option value="EMPLOYMENT_VERIFICATION">EMPLOYMENT_VERIFICATION</option>
              </select>
            </div>
            <div className="form-group">
              <label>Location</label>
              <input type="text" value={query.location} onChange={e => setQuery({...query, location: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <textarea value={query.purpose} onChange={e => setQuery({...query, purpose: e.target.value})} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'RUNNING QUERY...' : 'RUN QUERY'}
            </button>
          </form>
        </div>

        <div style={{ padding: 24, backgroundColor: '#f9f9f9' }}>
          <h3>Response Display</h3>
          
          {error && (
            <div className="card" style={{ border: '2px solid var(--color-danger)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>⚠️</span>
                <strong style={{ color: 'var(--color-danger)' }}>SECURITY ALERT</strong>
              </div>
              <p>{error.message}</p>
              <div style={{ marginTop: 16, fontSize: 12 }}>
                Outcome: <span style={{ color: 'red', fontWeight: 'bold' }}>INCONCLUSIVE</span><br/>
                Audit entry: <span style={{ color: 'green' }}>✓ Created</span>
              </div>
            </div>
          )}

          {result && (
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{result.query_type}</span>
                <span style={{ fontWeight: 'normal' }}>REQ-{result.request_id.slice(0,8)}</span>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 60, height: 60, backgroundColor: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>PHOTO</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 'bold' }}>{result.citizen?.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Born: {result.citizen?.year_of_birth} | Nationality: {result.citizen?.nationality}
                    </div>
                    <div className="monospace">ID: {result.citizen_id}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>[T1] Identity verified <span style={{ color: 'green' }}>✅</span></div>
                  <div>[T1] Nationality: Kavali <span style={{ color: 'green' }}>✅</span></div>
                  <div>[T1] Status: Active <span style={{ color: 'green' }}>✅</span></div>
                  <div>[T2] Health clearance <span style={{ color: result.clearance === 'APPROVED' ? 'green' : 'orange' }}>
                    {result.clearance === 'APPROVED' ? '✅ APPROVED' : '⚠️ FLAGGED'}
                  </span></div>
                  
                  <div style={{ marginTop: 16, color: 'var(--color-text-muted)' }}>
                    Tax details 🔒 Not included<br/>
                    Employment history 🔒 Not included
                  </div>
                </div>

                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Overall Result:</span>
                  <span style={{ color: result.clearance === 'APPROVED' ? 'green' : 'orange' }}>
                    {result.clearance === 'APPROVED' ? '✅ APPROVED' : '⚠️ MANUAL REVIEW'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {!result && !error && !loading && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 100 }}>
              Enter Citizen ID and run query to see results
            </div>
          )}
        </div>
      </div>

      {auth?.user.role === 'SYSTEM_ADMIN' && (
        <div style={{ padding: 24, borderTop: '2px dashed #ccc', backgroundColor: '#eee' }}>
          <h3>DEMO CONTROL — Health Service Mode (Admin Only)</h3>
          <div style={{ display: 'flex', gap: 16 }}>
            {['APPROVE', 'CITIZEN_FLAGGED', 'INVALID_SIGNATURE', 'TIMEOUT'].map(mode => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" checked={healthMode === mode} onChange={() => updateHealthMode(mode)} />
                {mode}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" />;
  return children;
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Terminal /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
