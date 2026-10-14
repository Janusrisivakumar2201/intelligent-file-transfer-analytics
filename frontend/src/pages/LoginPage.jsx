import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const validUsers = [
  { username: import.meta.env.VITE_ADMIN_USERNAME, password: import.meta.env.VITE_ADMIN_PASSWORD, role: 'admin' },
  { username: import.meta.env.VITE_ANALYST_USERNAME, password: import.meta.env.VITE_ANALYST_PASSWORD, role: 'analyst' },
].filter((user) => user.username?.trim() && user.password);

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleChange = (field) => (event) => {
    setCredentials((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!validUsers.length) {
      setError('Local demo sign-in is not configured. Set the VITE demo login variables in frontend/.env.');
      return;
    }

    const normalizedUsername = credentials.username.trim().toLowerCase();
    const matchingUser = validUsers.find(
      (user) => user.username.toLowerCase() === normalizedUsername && user.password === credentials.password
    );

    if (matchingUser) {
      localStorage.setItem(
        'fta_user',
        JSON.stringify({ username: matchingUser.username, role: matchingUser.role })
      );
      const redirectTo = location.state?.from || '/';
      navigate(redirectTo, { replace: true });
      return;
    }

    setError('Invalid username or password.');
  };

  return (
    <div className="login-shell">
      <div className="login-card card section-card">
        <div className="panel-header">
          <h3>Secure Admin Access</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="form-control">
              <label htmlFor="username">Username</label>
              <input id="username" type="text" value={credentials.username} onChange={handleChange('username')} />
            </div>

            <div className="form-control">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={credentials.password} onChange={handleChange('password')} />
            </div>
          </div>

          {error ? <div className="alert" style={{ marginTop: 16 }}>{error}</div> : null}

          <div style={{ marginTop: 16 }}>
            <button className="primary-button" type="submit">Login</button>
          </div>
        </form>
      </div>
    </div>
  );
}
