import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import type { AuthData } from './types';
import './index.css';

const AuthContext = createContext<{
  auth: AuthData | null;
  login: (data: AuthData) => void;
  logout: () => void;
} | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthData | null>(() => {
    const saved = localStorage.getItem('civiccore_auth_edu');
    return saved ? JSON.parse(saved) : null;
  });
  const login = (data: AuthData) => {
    setAuth(data);
    localStorage.setItem('civiccore_auth_edu', JSON.stringify(data));
  };
  const logout = () => {
    setAuth(null);
    localStorage.removeItem('civiccore_auth_edu');
  };
  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext)!;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('education@civiccore.demo');
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
        <div className="card-header">Education Authority Portal Login</div>
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
      <div className="sidebar" style={{ backgroundColor: '#2980b9' }}>
        <h2>CivicCore</h2>
        <div style={{ fontSize: 12, marginBottom: 16, opacity: 0.8 }}>Education Authority</div>
        <div className="sidebar-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/enroll">Enroll Student</Link>
          <Link to="/results">Record Results</Link>
          <Link to="/search">Search Students</Link>
          <a href="#" onClick={() => { logout(); navigate('/login'); }} style={{ marginTop: 'auto' }}>Logout</a>
        </div>
      </div>
      <div className="content">{children}</div>
    </div>
  );
};

const Dashboard = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/education/stats`, {
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
      <h1>Education Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-header">Total Students</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.total_students ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Results Recorded</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.results_recorded ?? '...'}</div>
        </div>
        <div className="card">
          <div className="card-header">Recorded Today</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats?.recorded_today ?? '...'}</div>
        </div>
      </div>
    </div>
  );
};

const EnrollForm = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    citizen_id: '',
    institution_name: '',
    institution_type: 'PRIMARY',
    enrollment_date: new Date().toISOString().split('T')[0],
  });
  const [citizenName, setCitizenName] = useState('');

  const lookupCitizen = async () => {
    if (form.citizen_id.length === 12) {
      const resp = await fetch(`${API_URL}/citizens/${form.citizen_id}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) setCitizenName(data.data.full_name);
      else setCitizenName('Citizen not found');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resp = await fetch(`${API_URL}/education/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` },
      body: JSON.stringify(form),
    });
    if (resp.status === 401) { logout(); navigate('/login'); return; }
    const data = await resp.json();
    if (data.success) {
      alert('Student enrolled successfully');
      setForm({ ...form, citizen_id: '' });
      setCitizenName('');
    } else {
      alert('Error: ' + data.error);
    }
  };

  return (
    <div>
      <h1>Enroll New Student</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
        <div className="form-group">
          <label>Citizen ID <span className="required">*</span></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" className="monospace" value={form.citizen_id} onChange={e => setForm({...form, citizen_id: e.target.value})} onBlur={lookupCitizen} required />
            <button type="button" onClick={lookupCitizen}>Lookup</button>
          </div>
          {citizenName && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 'bold' }}>Name: {citizenName}</div>}
        </div>
        <div className="form-group">
          <label>Institution Name <span className="required">*</span></label>
          <input type="text" value={form.institution_name} onChange={e => setForm({...form, institution_name: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Institution Type <span className="required">*</span></label>
          <select value={form.institution_type} onChange={e => setForm({...form, institution_type: e.target.value})}>
            <option value="PRIMARY">Primary</option>
            <option value="SECONDARY">Secondary</option>
            <option value="TERTIARY">Tertiary</option>
            <option value="VOCATIONAL">Vocational</option>
          </select>
        </div>
        <div className="form-group">
          <label>Enrollment Date <span className="required">*</span></label>
          <input type="date" value={form.enrollment_date} onChange={e => setForm({...form, enrollment_date: e.target.value})} required />
        </div>
        <button type="submit">Enroll Student</button>
      </form>
    </div>
  );
};

const ResultsForm = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    citizen_id: '',
    exam_type: 'PLE',
    year_of_exam: new Date().getFullYear(),
    grade: '',
    institution: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resp = await fetch(`${API_URL}/education/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` },
      body: JSON.stringify(form),
    });
    if (resp.status === 401) { logout(); navigate('/login'); return; }
    const data = await resp.json();
    if (data.success) {
      alert('Exam result recorded');
      setForm({ ...form, citizen_id: '', grade: '' });
    } else {
      alert('Error: ' + data.error);
    }
  };

  return (
    <div>
      <h1>Record Exam Results</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
        <div className="form-group">
          <label>Citizen ID <span className="required">*</span></label>
          <input type="text" className="monospace" value={form.citizen_id} onChange={e => setForm({...form, citizen_id: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Exam Type</label>
          <select value={form.exam_type} onChange={e => setForm({...form, exam_type: e.target.value})}>
            <option value="PLE">PLE (Primary)</option>
            <option value="UCE">UCE (O-Level)</option>
            <option value="UACE">UACE (A-Level)</option>
            <option value="DIPLOMA">Diploma</option>
            <option value="DEGREE">Degree</option>
          </select>
        </div>
        <div className="form-group">
          <label>Year</label>
          <input type="number" value={form.year_of_exam} onChange={e => setForm({...form, year_of_exam: parseInt(e.target.value)})} />
        </div>
        <div className="form-group">
          <label>Grade / Aggregate</label>
          <input type="text" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Institution (Optional)</label>
          <input type="text" value={form.institution} onChange={e => setForm({...form, institution: e.target.value})} />
        </div>
        <button type="submit">Record Results</button>
      </form>
    </div>
  );
};

const SearchStudents = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/education/search?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${auth?.token}` }
      });
      if (resp.status === 401) { logout(); navigate('/login'); return; }
      const data = await resp.json();
      if (data.success) setResults(data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h1>Search Students</h1>
      <div className="card">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Search by Name, Citizen ID, or Institution..." 
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
                <th>Latest Institution</th>
                <th>Current Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any) => (
                <tr key={r.id}>
                  <td className="monospace">{r.citizen_id}</td>
                  <td><strong>{r.full_name}</strong></td>
                  <td>{r.institution_name} ({r.institution_type})</td>
                  <td>
                    <span className={`badge ${r.status === 'ENROLLED' ? 'badge-blue' : 'badge-green'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <Link to={`/student/${r.citizen_id}`} className="button-small">View Details</Link>
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

const StudentDetail = () => {
  const { citizen_id } = useParams();
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const resp = await fetch(`${API_URL}/education/${citizen_id}`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    });
    if (resp.status === 401) { logout(); navigate('/login'); return; }
    const d = await resp.json();
    if (d.success) setData(d.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [citizen_id]);

  const markCompleted = async (enrollmentId: string) => {
    const completion_date = new Date().toISOString().split('T')[0];
    const resp = await fetch(`${API_URL}/education/enrollments/${enrollmentId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` },
      body: JSON.stringify({ completion_date, status: 'COMPLETED' }),
    });
    if (resp.ok) fetchData();
  };

  if (loading) return <div>Loading student records...</div>;
  if (!data) return <div>Student not found</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Student Profile: {citizen_id}</h1>
        <Link to="/search" style={{ textDecoration: 'none' }}>&larr; Back to Search</Link>
      </div>

      <div className="card">
        <div className="card-header">Enrollment History</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Institution</th>
              <th style={{ padding: 12 }}>Type</th>
              <th style={{ padding: 12 }}>Enrolled</th>
              <th style={{ padding: 12 }}>Completed</th>
              <th style={{ padding: 12 }}>Status</th>
              <th style={{ padding: 12 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.enrollments.map((e: any) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                <td style={{ padding: 12 }}>{e.institution_name}</td>
                <td style={{ padding: 12 }}>{e.institution_type}</td>
                <td style={{ padding: 12 }}>{e.enrollment_date}</td>
                <td style={{ padding: 12 }}>{e.completion_date || '-'}</td>
                <td style={{ padding: 12 }}>
                  <span className={`badge ${e.status === 'ENROLLED' ? 'badge-blue' : 'badge-green'}`}>
                    {e.status}
                  </span>
                </td>
                <td style={{ padding: 12 }}>
                  {e.status === 'ENROLLED' && (
                    <button onClick={() => markCompleted(e.id)} className="button-small">Mark Completed</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">Examination Results</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Exam</th>
              <th style={{ padding: 12 }}>Year</th>
              <th style={{ padding: 12 }}>Grade</th>
              <th style={{ padding: 12 }}>Institution</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r: any) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                <td style={{ padding: 12 }}>{r.exam_type}</td>
                <td style={{ padding: 12 }}>{r.year_of_exam}</td>
                <td style={{ padding: 12 }}><strong>{r.grade}</strong></td>
                <td style={{ padding: 12 }}>{r.institution}</td>
              </tr>
            ))}
            {data.results.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#999' }}>No results recorded</td></tr>
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
          <Route path="/enroll" element={<ProtectedRoute><EnrollForm /></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute><ResultsForm /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchStudents /></ProtectedRoute>} />
          <Route path="/student/:citizen_id" element={<ProtectedRoute><StudentDetail /></ProtectedRoute>} />
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
