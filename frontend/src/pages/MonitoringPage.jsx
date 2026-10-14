import { useEffect, useState } from 'react';
import { getMonitoring } from '../services/api';

export default function MonitoringPage() {
  const [monitoring, setMonitoring] = useState({
    live_metrics: [],
    alerts: [],
    system_status: 'Stable',
    updated_at: '',
  });

  useEffect(() => {
    const fetchMonitoring = async () => {
      try {
        const result = await getMonitoring();
        setMonitoring(result);
      } catch (error) {
        console.error('Monitoring fetch failed:', error);
      }
    };

    fetchMonitoring();
    const interval = setInterval(fetchMonitoring, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card section-card">
      <div className="panel-header">
        <h3>Live Network Monitoring</h3>
        <span className="badge info">Updated {new Date(monitoring.updated_at || Date.now()).toLocaleTimeString()}</span>
      </div>

      <div className="cards-grid grid" style={{ marginBottom: 20 }}>
        {monitoring.live_metrics.map((metric) => (
          <div key={metric.label} className="card metric-card">
            <div className="metric-label">
              <span>{metric.label}</span>
              <span className="badge good">{metric.status}</span>
            </div>
            <div className="metric-value small">{metric.value}{metric.unit}</div>
          </div>
        ))}
      </div>

      <div className="card section-card" style={{ background: 'rgba(15, 23, 42, 0.72)' }}>
        <div className="panel-header">
          <h3>System Alerts</h3>
          <span className={`badge ${monitoring.system_status === 'Warning' ? 'warning' : 'good'}`}>
            {monitoring.system_status}
          </span>
        </div>

        {monitoring.alerts.length === 0 ? (
          <div className="empty-state">No critical transfer alerts at the moment.</div>
        ) : (
          <ul>
            {monitoring.alerts.map((alert) => (
              <li key={alert} style={{ marginBottom: 8 }}>{alert}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
