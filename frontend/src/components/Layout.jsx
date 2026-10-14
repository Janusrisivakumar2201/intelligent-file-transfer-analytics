import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Transfer Prediction', to: '/predict' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Prediction History', to: '/history' },
  { label: 'Live Monitoring', to: '/monitoring' },
  { label: 'Optimization', to: '/optimization' },
  { label: 'Operations', to: '/operations' },
  { label: '🧬 Digital Transfer Twin', to: '/digital-twin' },
  { label: 'About System', to: '/about' },
];

export default function Layout() {
  const user = JSON.parse(localStorage.getItem('fta_user') || 'null');

  const handleLogout = () => {
    localStorage.removeItem('fta_user');
    window.location.href = '/login';
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-badge">IT</div>
          <div>
            <h1>Intelligent File Transfer Analytics</h1>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="user-panel">
          <div className="user-name">{user?.username || 'Admin'}</div>
          <div className="user-role">{(user?.role || 'admin').toUpperCase()}</div>
          <button className="secondary-button full-width" type="button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Machine Learning-Based Transfer Performance Prediction &amp; Optimization</p>
            <h2>Intelligent File Transfer Analytics</h2>
          </div>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
