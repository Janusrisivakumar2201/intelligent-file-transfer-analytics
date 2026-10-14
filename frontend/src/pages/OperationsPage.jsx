import { useEffect, useState } from 'react';
import { getAlerts, getAuditTrail } from '../services/api';

export default function OperationsPage() {
  const [alerts, setAlerts] = useState([]);
  const [auditTrail, setAuditTrail] = useState([]);

  useEffect(() => {
    const loadOps = async () => {
      try {
        const [alertData, auditData] = await Promise.all([getAlerts(), getAuditTrail()]);
        setAlerts(alertData.alerts || []);
        setAuditTrail(auditData.events || []);
      } catch (error) {
        console.error('Operations load failed:', error);
      }
    };

    loadOps();
  }, []);

  return (
    <>
      <section className="grid cards-grid">
        {alerts.map((alert) => (
          <div key={alert.title} className="card metric-card">
            <div className="metric-label">
              <span>{alert.title}</span>
              <span className={`badge ${alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good'}`}>
                {alert.severity}
              </span>
            </div>
            <div className="metric-value small">{alert.message}</div>
          </div>
        ))}
      </section>

      <section className="card section-card">
        <div className="panel-header">
          <h3>Audit Trail</h3>
        </div>

        {auditTrail.length === 0 ? (
          <div className="empty-state">No audit events recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.map((event) => (
                <tr key={`${event.time}-${event.action}`}>
                  <td>{new Date(event.time).toLocaleString()}</td>
                  <td>{event.actor}</td>
                  <td>{event.action}</td>
                  <td>{event.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
