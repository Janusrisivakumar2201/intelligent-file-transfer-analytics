import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  exportHistory,
  getDashboardSummary,
  getHistory,
  getMetrics,
  getMonitoring,
} from '../services/api';

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171'];

export default function DashboardPage() {
  const [summary, setSummary] = useState({
    total_predictions: 0,
    average_predicted_time_seconds: 0,
    accuracy: 0,
    high_risk_transfers: 0,
    recent_predictions: [],
  });
  const [history, setHistory] = useState([]);
  const [metrics, setMetrics] = useState({
    regression: { mae: 0, rmse: 0, r2: 0 },
    performance_classifier: { accuracy: 0 },
  });
  const [monitoring, setMonitoring] = useState({
    live_metrics: [],
    alerts: [],
    system_status: 'Stable',
    updated_at: '',
  });
  const [optimizationScore, setOptimizationScore] = useState(0);
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [dashboardData, records, modelMetrics, monitoringData] = await Promise.all([
          getDashboardSummary(),
          getHistory(),
          getMetrics(),
          getMonitoring(),
        ]);
        setSummary(dashboardData);
        setHistory(records);
        setMetrics(modelMetrics);
        setMonitoring(monitoringData);
        setOptimizationScore(dashboardData.optimization_score || 0);
        setRecommendations(dashboardData.ai_recommendations || []);
      } catch (error) {
        console.error('Dashboard load failed:', error);
      }
    };

    loadDashboard();
  }, []);

  const performanceData = useMemo(() => {
    const data = {
      Excellent: 0,
      Good: 0,
      Moderate: 0,
      Poor: 0,
    };

    history.forEach((item) => {
      const performance = item.performance_level || 'Moderate';
      data[performance] = (data[performance] || 0) + 1;
    });

    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [history]);

  const riskData = useMemo(() => {
    const data = {
      Low: 0,
      Medium: 0,
      High: 0,
    };

    history.forEach((item) => {
      const risk = item.transfer_risk || 'Low';
      data[risk] = (data[risk] || 0) + 1;
    });

    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [history]);

  const trendData = useMemo(() => {
    return history.slice(-8).map((item, index) => ({
      name: `P${index + 1}`,
      time: Number(item.predicted_transfer_time_seconds || 0),
    }));
  }, [history]);

  const tableRows = history.slice(0, 5);

  const handleExport = async () => {
    try {
      const blob = await exportHistory();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'transfer_history.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export failed:', error);
    }
  };

  return (
    <>
      <section className="grid cards-grid">
        <div className="card metric-card">
          <div className="metric-label">
            <span>Total Predictions</span>
            <span className="badge info">Live</span>
          </div>
          <div className="metric-value">{summary.total_predictions}</div>
        </div>

        <div className="card metric-card">
          <div className="metric-label">
            <span>Average Predicted Time</span>
            <span className="badge warning">Avg</span>
          </div>
          <div className="metric-value">{Number(summary.average_predicted_time_seconds || 0).toFixed(1)}s</div>
        </div>

        <div className="card metric-card">
          <div className="metric-label">
            <span>Model Accuracy</span>
            <span className="badge good">Model</span>
          </div>
          <div className="metric-value">{Number(summary.accuracy || 0).toFixed(2)}</div>
        </div>

        <div className="card metric-card">
          <div className="metric-label">
            <span>High Risk Transfers</span>
            <span className="badge danger">Risk</span>
          </div>
          <div className="metric-value">{summary.high_risk_transfers}</div>
        </div>
      </section>

      <section className="card section-card">
        <div className="panel-header">
          <h3>System Monitoring Snapshot</h3>
          <button className="primary-button" type="button" onClick={handleExport}>Export History CSV</button>
        </div>

        <div className="cards-grid grid">
          {monitoring.live_metrics.map((metric) => (
            <div key={metric.label} className="card metric-card">
              <div className="metric-label">
                <span>{metric.label}</span>
                <span className="badge info">{metric.status}</span>
              </div>
              <div className="metric-value small">{metric.value}{metric.unit}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card section-card">
        <div className="panel-header">
          <h3>AI Optimization Summary</h3>
          <span className="badge good">{optimizationScore}/100</span>
        </div>
        <ul>
          {(recommendations.length ? recommendations : ['No performance issues detected yet.']).map((item) => (
            <li key={item} style={{ marginBottom: 10 }}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="dashboard-grid">
        <div className="card section-card">
          <div className="panel-header">
            <h3>Prediction Performance Chart</h3>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" name="Predictions" fill="#60a5fa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card section-card">
          <div className="panel-header">
            <h3>Transfer Time Trend</h3>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip />
                <Area type="monotone" dataKey="time" stroke="#2dd4bf" fill="#0ea5e9" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card section-card">
          <div className="panel-header">
            <h3>Performance Distribution</h3>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={performanceData} dataKey="value" nameKey="name" outerRadius={90} fill="#8884d8" label>
                  {performanceData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card section-card">
          <div className="panel-header">
            <h3>Risk Distribution</h3>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                <XAxis dataKey="name" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip />
                <Bar dataKey="value" name="Transactions" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="card section-card">
        <div className="panel-header">
          <h3>Recent Prediction Table</h3>
        </div>

        {tableRows.length === 0 ? (
          <div className="empty-state">No prediction history yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>File Size</th>
                <th>Bandwidth</th>
                <th>Latency</th>
                <th>Time</th>
                <th>Performance</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.timestamp || `${row.file_size_mb}-${row.bandwidth_mbps}`}>
                  <td>{row.timestamp ? new Date(row.timestamp).toLocaleDateString() : 'N/A'}</td>
                  <td>{Number(row.file_size_mb || 0).toFixed(1)} MB</td>
                  <td>{Number(row.bandwidth_mbps || 0).toFixed(1)} Mbps</td>
                  <td>{Number(row.latency_ms || 0).toFixed(1)} ms</td>
                  <td>{Number(row.predicted_transfer_time_seconds || 0).toFixed(1)} s</td>
                  <td>{row.performance_level || 'N/A'}</td>
                  <td>{row.transfer_risk || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
