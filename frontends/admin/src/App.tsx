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
    const saved = localStorage.getItem('civiccore_auth_admin');
    return saved ? JSON.parse(saved) : null;
  });
  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth_admin', JSON.stringify(data));
  };
  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth_admin');
  };
  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext)!;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@civiccore.demo');
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
        <div className="card-header">System Admin Console Login</div>
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
      <div className="sidebar" style={{ backgroundColor: '#111' }}>
        <h2>CivicCore</h2>
        <div style={{ fontSize: 12, marginBottom: 16, opacity: 0.8 }}>System Administration</div>
        <div className="sidebar-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/citizens">Citizen Registry</Link>
          <Link to="/audit">System Audit Log</Link>
          <Link to="/disputes">Citizen Disputes</Link>
          <Link to="/sectors">Sector Health</Link>
          <Link to="/users">User Management</Link>
          <a href="#" onClick={() => { logout(); navigate('/login'); }} style={{ marginTop: 'auto' }}>Logout</a>
        </div>
      </div>
      <div className="content">
        <header style={{ marginBottom: 24 }}>Logged in as: <strong>{auth?.user.full_name}</strong></header>
        {children}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { auth } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentAudit, setRecentAudit] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => r.json())
    .then(d => { if (d.success) setStats(d.data); });

    fetch(`${API_URL}/admin/audit`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => r.json())
    .then(d => { if (d.success) setRecentAudit(d.data.slice(0, 5)); });
  }, [auth]);

  return (
    <div>
      <h1>System Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">Total Citizens</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.total_citizens ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Active / Deceased</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>
            {stats ? `${stats.active_citizens} / ${stats.deceased_citizens}` : '...'}
          </div>
        </div>
        <div className="card">
          <div className="card-header">Queries Today</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.queries_today ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Security Events</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: (stats?.security_events_today ?? 0) > 0 ? 'red' : 'inherit' }}>
            {stats?.security_events_today ?? '...'}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">Recent System Activity</div>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Citizen ID</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {recentAudit.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No recent activity</td></tr>
            ) : (
              recentAudit.map((a: any) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleTimeString()}</td>
                  <td className="monospace">{a.citizen_id || 'N/A'}</td>
                  <td>{a.action}</td>
                  <td>{a.actor_role} ({a.actor_sector || 'SYSTEM'})</td>
                  <td style={{ color: a.outcome === 'SUCCESS' ? 'green' : a.outcome === 'BLOCKED' ? 'red' : 'orange' }}>
                    {a.outcome}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SectorHealth = () => {
  const { auth } = useAuth();
  const [sectors, setSectors] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/admin/sectors`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => r.json())
    .then(d => { if (d.success) setSectors(d.data); });
  }, [auth]);

  return (
    <div>
      <h1>Sector Health & Connectivity</h1>
      <table>
        <thead>
          <tr>
            <th>Sector</th>
            <th>Record Count</th>
            <th>Last Write</th>
            <th>Key Status</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s: any, idx: number) => (
            <tr key={idx}>
              <td><strong>{s.name}</strong></td>
              <td>{s.record_count}</td>
              <td>{s.last_write ? new Date(s.last_write).toLocaleString() : 'Never'}</td>
              <td><span style={{ color: s.key_status === 'ACTIVE' ? 'green' : 'red' }}>● {s.key_status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SystemAuditLog = () => {
  const { auth } = useAuth();
  const [audit, setAudit] = useState<any[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/admin/audit`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => r.json())
    .then(d => { if (d.success) setAudit(d.data); });
  }, [auth]);

  const filtered = audit.filter(a => 
    !filter || 
    (a.citizen_id && a.citizen_id.toLowerCase().includes(filter.toLowerCase())) ||
    a.action.toLowerCase().includes(filter.toLowerCase()) ||
    a.actor_role.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <h1>System Audit Log (Full)</h1>
      <p>Full immutable log view filtered by all citizens.</p>
      <div className="form-group" style={{ maxWidth: 300, marginBottom: 16 }}>
        <input 
          type="text" 
          placeholder="Filter by Citizen ID, Action, Role..." 
          value={filter} 
          onChange={e => setFilter(e.target.value)} 
        />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Citizen ID</th>
              <th>Actor Role</th>
              <th>Action</th>
              <th>Sector</th>
              <th>Outcome</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center' }}>No audit entries found</td></tr>
            ) : (
              filtered.map((a: any) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td className="monospace">{a.citizen_id || 'N/A'}</td>
                  <td>{a.actor_role}</td>
                  <td>{a.action}</td>
                  <td>{a.sector_accessed || a.actor_sector || 'N/A'}</td>
                  <td style={{ color: a.outcome === 'SUCCESS' ? 'green' : a.outcome === 'BLOCKED' ? 'red' : 'orange' }}>
                    {a.outcome}
                  </td>
                  <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.details ? JSON.stringify(a.details) : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CitizenRegistry = () => {
  const { auth } = useAuth();
  const [citizens, setCitizens] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/admin/citizens`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) setCitizens(d.data); });
  }, [auth]);

  return (
    <div>
      <h1>Citizen Registry</h1>
      <p>Civil records in <code>core.citizens</code>. Separate from portal user accounts.</p>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Citizen ID</th>
              <th>Full Name</th>
              <th>Sex</th>
              <th>Year of Birth</th>
              <th>District</th>
              <th>Status</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {citizens.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center' }}>No citizens found</td></tr>
            ) : (
              citizens.map((c: any) => (
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
                  <td>{new Date(c.registered_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const UserManagement = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [tab, setTab] = useState<'OFFICIALS' | 'CITIZENS'>('OFFICIALS');

  useEffect(() => {
    fetch(`${API_URL}/admin/users`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => {
        if (r.status === 401) { logout(); navigate('/login'); return null; }
        return r.json();
      })
      .then(d => { if (d && d.success) setUsers(d.data); });
  }, [auth, logout, navigate]);

  const OFFICIAL_ROLES = ['CIVIL_REGISTRAR', 'EDUCATION_OFFICER', 'REVENUE_OFFICER',
                          'LABOUR_OFFICER', 'BORDER_OFFICER', 'SYSTEM_ADMIN'];
  const officials = users.filter(u => OFFICIAL_ROLES.includes(u.role));
  const citizens  = users.filter(u => u.role === 'CITIZEN');
  const displayed = tab === 'OFFICIALS' ? officials : citizens;

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px',
    cursor: 'pointer',
    fontWeight: active ? 'bold' : 'normal',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #4a6fa5' : '2px solid transparent',
  } as React.CSSProperties);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>User Management</h1>
        <Link to="/provision"><button>Provision New Official</button></Link>
      </div>
      <p>Portal login accounts (<code>core.users</code>). Does not include citizens without a portal account.</p>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #ddd' }}>
        <button style={tabStyle(tab === 'OFFICIALS')} onClick={() => setTab('OFFICIALS')}>
          Officials ({officials.length})
        </button>
        <button style={tabStyle(tab === 'CITIZENS')} onClick={() => setTab('CITIZENS')}>
          Citizen Accounts ({citizens.length})
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email / Citizen ID</th>
              <th>Role</th>
              <th>Sector</th>
              <th>Status</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((u: any) => (
              <tr key={u.id}>
                <td><strong>{u.full_name}</strong></td>
                <td className="monospace" style={{ fontSize: 13 }}>{u.email}</td>
                <td className="monospace">{u.role}</td>
                <td>{u.sector || 'N/A'}</td>
                <td><span style={{ color: u.is_active ? 'green' : 'red' }}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}</td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>No {tab.toLowerCase()} found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ProvisionOfficial = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'CIVIL_REGISTRAR',
    sector: 'CIVIL_REGISTRY',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const resp = await fetch(`${API_URL}/admin/officials/provision`, {
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
        alert(`Official account provisioned. Temporary password: ${data.temp_password}\nPlease provide this password to the official.`);
        navigate('/users');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection failed');
    }
  };

  return (
    <div>
      <h1>Provision New Official</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
        <div className="form-group">
          <label>Full Name</label>
          <input type="text" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Work Email (@*.civiccore.demo)</label>
          <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
            <option value="CIVIL_REGISTRAR">Civil Registrar</option>
            <option value="EDUCATION_OFFICER">Education Officer</option>
            <option value="REVENUE_OFFICER">Revenue Officer</option>
            <option value="LABOUR_OFFICER">Labour Officer</option>
            <option value="BORDER_OFFICER">Border Officer</option>
            <option value="SYSTEM_ADMIN">System Admin</option>
          </select>
        </div>
        <div className="form-group">
          <label>Sector / Ministry</label>
          <select value={form.sector} onChange={e => setForm({...form, sector: e.target.value})}>
            <option value="CIVIL_REGISTRY">Civil Registry</option>
            <option value="EDUCATION_AUTHORITY">Education Authority</option>
            <option value="REVENUE_SERVICE">Revenue Service</option>
            <option value="LABOUR_AUTHORITY">Labour Authority</option>
            <option value="BORDER_CONTROL">Border Control</option>
            <option value="ICT_AUTHORITY">ICT Authority</option>
          </select>
        </div>
        {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
        <button type="submit">Create Account</button>
      </form>
    </div>
  );
};

const DisputesPage = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDisputes = () => {
    setLoading(true);
    fetch(`${API_URL}/disputes`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
    .then(r => {
      if (r.status === 401) { logout(); navigate('/login'); return; }
      return r.json();
    })
    .then(d => {
      if (d?.success) setDisputes(d.disputes);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  const handleResolve = async (id: string) => {
    const notes = prompt('Enter resolution notes:');
    if (notes === null) return;
    
    try {
      const resp = await fetch(`${API_URL}/disputes/${id}/resolve`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify({ status: 'RESOLVED', resolution_notes: notes }),
      });
      const data = await resp.json();
      if (data.success) {
        alert('Dispute resolved');
        fetchDisputes();
      } else {
        alert('Failed to resolve dispute: ' + data.error);
      }
    } catch (err) {
      alert('Connection failed');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>Citizen Disputes</h1>
        <button onClick={fetchDisputes}>Refresh</button>
      </div>

      {loading ? <p>Loading disputes...</p> : (
        <table className="card" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: 12 }}>Citizen ID</th>
              <th style={{ padding: 12 }}>Type</th>
              <th style={{ padding: 12 }}>Description</th>
              <th style={{ padding: 12 }}>Status</th>
              <th style={{ padding: 12 }}>Date</th>
              <th style={{ padding: 12 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 12 }}>{d.citizen_id}</td>
                <td style={{ padding: 12 }}>{d.dispute_type}</td>
                <td style={{ padding: 12, maxWidth: 300, fontSize: 13 }}>{d.description}</td>
                <td style={{ padding: 12 }}>
                  <span className={`badge ${d.status === 'PENDING' ? 'badge-warning' : 'badge-success'}`}>
                    {d.status}
                  </span>
                </td>
                <td style={{ padding: 12 }}>{new Date(d.created_at).toLocaleDateString()}</td>
                <td style={{ padding: 12 }}>
                  {d.status === 'PENDING' && (
                    <button onClick={() => handleResolve(d.id)} className="btn-small">Resolve</button>
                  )}
                  {d.status === 'RESOLVED' && (
                    <div style={{ fontSize: 11, color: '#666' }}>{d.resolution_notes}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <Route path="/citizens" element={<ProtectedRoute><CitizenRegistry /></ProtectedRoute>} />
          <Route path="/sectors" element={<ProtectedRoute><SectorHealth /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><SystemAuditLog /></ProtectedRoute>} />
          <Route path="/disputes" element={<ProtectedRoute><DisputesPage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/provision" element={<ProtectedRoute><ProvisionOfficial /></ProtectedRoute>} />
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
