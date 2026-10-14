import { useEffect, useState } from 'react';
import { getOptimizationInsights } from '../services/api';

export default function OptimizationPage() {
  const [insights, setInsights] = useState({
    overall_score: 0,
    next_best_action: '',
    recommendations: [],
    scenarios: [],
    risk_digest: '',
  });

  useEffect(() => {
    const loadInsights = async () => {
      try {
        const result = await getOptimizationInsights();
        setInsights(result);
      } catch (error) {
        console.error('Optimization insights failed:', error);
      }
    };

    loadInsights();
  }, []);

  return (
    <>
      <section className="grid cards-grid">
        <div className="card metric-card">
          <div className="metric-label">
            <span>Optimization Score</span>
            <span className="badge good">AI</span>
          </div>
          <div className="metric-value">{insights.overall_score}/100</div>
        </div>

        <div className="card metric-card">
          <div className="metric-label">
            <span>Next Best Action</span>
            <span className="badge info">Priority</span>
          </div>
          <div className="metric-value small">{insights.next_best_action || 'Monitor'}</div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="card section-card">
          <div className="panel-header">
            <h3>AI Recommendations</h3>
          </div>
          <ul>
            {(insights.recommendations || []).map((item) => (
              <li key={item} style={{ marginBottom: 10 }}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="card section-card">
          <div className="panel-header">
            <h3>Scenario Planning</h3>
          </div>
          <ul>
            {(insights.scenarios || []).map((item) => (
              <li key={item.name} style={{ marginBottom: 10 }}>
                <strong>{item.name}:</strong> {item.summary}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card section-card">
        <div className="panel-header">
          <h3>Risk Digest</h3>
        </div>
        <div className="empty-state">{insights.risk_digest || 'System is behaving within expected boundaries.'}</div>
      </section>
    </>
  );
}
