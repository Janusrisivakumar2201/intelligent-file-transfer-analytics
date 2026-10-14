import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDataScienceAnalytics } from '../services/api';

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];
const NO_DATA = 'Insufficient data';
const chartTooltipStyle = {
  backgroundColor: '#0f172a',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 10,
  color: '#e5eefc',
};

const formatNumber = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : NO_DATA;

const validPoints = (records, xKey) =>
  records.filter((record) =>
    Number.isFinite(record[xKey]) && Number.isFinite(record.transfer_time_seconds));

function histogram(records) {
  const values = records
    .map((record) => record.transfer_time_seconds)
    .filter(Number.isFinite);
  if (!values.length) return [];

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const binCount = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(values.length))));
  const width = maximum === minimum ? 1 : (maximum - minimum) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = minimum + width * index;
    const end = index === binCount - 1 ? maximum : start + width;
    return {
      name: maximum === minimum ? `${minimum.toFixed(1)}` : `${start.toFixed(1)}–${end.toFixed(1)}`,
      count: 0,
      start,
      end,
    };
  });
  values.forEach((value) => {
    const index = maximum === minimum
      ? 0
      : Math.min(binCount - 1, Math.floor((value - minimum) / width));
    bins[index].count += 1;
  });
  return bins;
}

function EmptyChart({ children }) {
  return <div className="analytics-empty-chart">{children}</div>;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loadError, setLoadError] = useState('');

  const refreshAnalytics = useCallback(async () => {
    try {
      const result = await getDataScienceAnalytics();
      setAnalytics(result);
      setLoadError('');
    } catch (error) {
      console.error('Data science analytics load failed:', error);
      setLoadError('Analytics could not be loaded. Check that the backend is running and try again.');
    }
  }, []);

  useEffect(() => {
    refreshAnalytics();
    window.addEventListener('fta:prediction-created', refreshAnalytics);
    window.addEventListener('focus', refreshAnalytics);
    return () => {
      window.removeEventListener('fta:prediction-created', refreshAnalytics);
      window.removeEventListener('focus', refreshAnalytics);
    };
  }, [refreshAnalytics]);

  const records = analytics?.records || [];
  const featureStatistics = analytics?.feature_statistics || {};
  const transferTimeStats = featureStatistics.transfer_time_seconds;
  const modelMetrics = analytics?.model_metrics || {};

  const fileSizePoints = useMemo(() => validPoints(records, 'file_size_mb'), [records]);
  const bandwidthPoints = useMemo(() => validPoints(records, 'bandwidth_mbps'), [records]);
  const histogramData = useMemo(() => histogram(records), [records]);
  const comparisonData = useMemo(
    () => records.map((record, index) => ({
      name: `R${index + 1}`,
      baseline: record.baseline_transfer_time_seconds,
      predicted: record.predicted_transfer_time_seconds,
      actual: record.actual_transfer_time_seconds,
    })).filter((record) =>
      Number.isFinite(record.baseline)
      || Number.isFinite(record.predicted)
      || Number.isFinite(record.actual)),
    [records],
  );

  const networkDistribution = useMemo(() => {
    const counts = {};
    records.forEach((record) => {
      const network = record.network_type || 'Unknown';
      counts[network] = (counts[network] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [records]);

  const performanceDistribution = useMemo(() => {
    const counts = { Excellent: 0, Good: 0, Moderate: 0, Poor: 0 };
    records.forEach((record) => {
      if (record.performance_level in counts) counts[record.performance_level] += 1;
    });
    return Object.entries(counts).filter(([, value]) => value > 0).map(([name, value]) => ({ name, value }));
  }, [records]);

  const riskDistribution = useMemo(() => {
    const counts = { Low: 0, Medium: 0, High: 0 };
    records.forEach((record) => {
      if (record.transfer_risk in counts) counts[record.transfer_risk] += 1;
    });
    return Object.entries(counts).filter(([, value]) => value > 0).map(([name, value]) => ({ name, value }));
  }, [records]);

  const statsRows = Object.entries(featureStatistics).filter(([key]) => key !== 'transfer_time_seconds');

  return (
    <>
      <section className="analytics-heading">
        <div>
          <p className="eyebrow">Data Science</p>
          <h3>DATA SCIENCE TRANSFER ANALYTICS</h3>
          <p>Descriptive statistics and visual analysis from {analytics?.record_count || 0} saved prediction record(s).</p>
        </div>
        {analytics && <span className="badge info">Transfer-time target: {analytics.time_target_label}</span>}
      </section>

      {loadError && <div className="analytics-error" role="alert">{loadError}</div>}

      <section className="grid cards-grid analytics-summary-cards">
        <div className="card metric-card">
          <div className="metric-label"><span>Average Transfer Time</span><span className="badge info">sec</span></div>
          <div className="metric-value small">{formatNumber(transferTimeStats?.mean)}</div>
        </div>
        <div className="card metric-card">
          <div className="metric-label"><span>Standard Deviation</span><span className="badge info">sec</span></div>
          <div className="metric-value small">{formatNumber(transferTimeStats?.standard_deviation)}</div>
        </div>
        <div className="card metric-card">
          <div className="metric-label"><span>Detected Outliers</span><span className="badge warning">|Z| &gt; 3</span></div>
          <div className="metric-value small">{analytics ? analytics.outliers.count : NO_DATA}</div>
        </div>
        <div className="card metric-card">
          <div className="metric-label"><span>ML R² Score</span><span className="badge good">Evaluation</span></div>
          <div className="metric-value small">{formatNumber(modelMetrics.r2)}</div>
          <small>{modelMetrics.count ? `${modelMetrics.count} actual/predicted pair(s)` : 'Actual transfer times not recorded'}</small>
        </div>
      </section>

      <section className="card section-card">
        <div className="panel-header">
          <h3>Analytics Summary</h3>
        </div>
        {analytics?.summary?.length ? (
          <ul className="analytics-summary-list">
            {analytics.summary.map((statement) => <li key={statement}>{statement}</li>)}
          </ul>
        ) : (
          <div className="empty-state">
            {analytics?.record_count
              ? 'More valid data is needed to generate a statistical summary.'
              : 'No prediction history is available yet. Generate a prediction to begin analytics.'}
          </div>
        )}
        {analytics?.correlation_message && <p className="analytics-note">{analytics.correlation_message}</p>}
      </section>

      <section className="analytics-grid">
        <div className="card section-card">
          <div className="panel-header"><h3>File Size vs Transfer Time</h3></div>
          <div className="chart-box">
            {fileSizePoints.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ bottom: 12, left: 8, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                  <XAxis type="number" dataKey="file_size_mb" name="File Size" unit=" MB" stroke="#cbd5e1" />
                  <YAxis type="number" dataKey="transfer_time_seconds" name="Transfer Time" unit=" sec" stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={fileSizePoints} fill="#60a5fa" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{NO_DATA}: file size and transfer time are required.</EmptyChart>}
          </div>
        </div>

        <div className="card section-card">
          <div className="panel-header"><h3>Bandwidth vs Transfer Time</h3></div>
          <div className="chart-box">
            {bandwidthPoints.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ bottom: 12, left: 8, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                  <XAxis type="number" dataKey="bandwidth_mbps" name="Bandwidth" unit=" Mbps" stroke="#cbd5e1" />
                  <YAxis type="number" dataKey="transfer_time_seconds" name="Transfer Time" unit=" sec" stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={bandwidthPoints} fill="#34d399" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{NO_DATA}: bandwidth and transfer time are required.</EmptyChart>}
          </div>
        </div>

        <div className="card section-card">
          <div className="panel-header"><h3>Baseline, ML Prediction &amp; Actual Time</h3></div>
          <p className="analytics-note">Baseline = (8 × file size in MB) / bandwidth in Mbps. It is a reference, not a replacement for the ML prediction.</p>
          <div className="chart-box">
            {comparisonData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis stroke="#cbd5e1" unit=" sec" />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend />
                  <Line connectNulls type="monotone" dataKey="baseline" stroke="#a78bfa" name="Theoretical baseline" dot={false} />
                  <Line connectNulls type="monotone" dataKey="predicted" stroke="#60a5fa" name="ML predicted" dot={false} />
                  <Line connectNulls type="monotone" dataKey="actual" stroke="#fbbf24" name="Actual measured" dot />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{NO_DATA}: generate at least one prediction.</EmptyChart>}
          </div>
          {!modelMetrics.count && <p className="analytics-note">Actual times are not collected by the current prediction workflow; model evaluation metrics are therefore unavailable.</p>}
        </div>

        <div className="card section-card">
          <div className="panel-header"><h3>Transfer Time Distribution</h3></div>
          <div className="chart-box">
            {histogramData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis allowDecimals={false} stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="count" name="Records" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{NO_DATA}: no valid transfer times are available.</EmptyChart>}
          </div>
        </div>

        <div className="card section-card analytics-heatmap-card">
          <div className="panel-header"><h3>Numerical Feature Correlation Heatmap</h3></div>
          {analytics?.correlation_heatmap?.length ? (
            <div className="analytics-heatmap-scroll">
              <div
                className="analytics-heatmap"
                style={{ gridTemplateColumns: `150px repeat(${analytics.correlation_heatmap.length}, minmax(56px, 1fr))` }}
              >
                <div className="heatmap-label" />
                {analytics.correlation_heatmap.map((row) => (
                  <div className="heatmap-label heatmap-column-label" key={`column-${row.feature}`} title={row.label}>{row.label}</div>
                ))}
                {analytics.correlation_heatmap.map((row) => (
                  <div className="heatmap-row" key={row.feature}>
                    <div className="heatmap-label" title={row.label}>{row.label}</div>
                    {row.values.map((cell) => {
                      const value = cell.value;
                      const opacity = value === null ? 0.08 : 0.15 + Math.abs(value) * 0.6;
                      const color = value === null
                        ? `rgba(148, 163, 184, ${opacity})`
                        : value >= 0
                          ? `rgba(248, 113, 113, ${opacity})`
                          : `rgba(96, 165, 250, ${opacity})`;
                      return (
                        <div
                          className="heatmap-cell"
                          key={`${row.feature}-${cell.feature}`}
                          title={`${row.label} vs ${cell.label}: ${formatNumber(value, 3)}`}
                          style={{ backgroundColor: color }}
                        >
                          {value === null ? '—' : value.toFixed(2)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="analytics-note">Red indicates positive correlation; blue indicates negative correlation. Cells without enough variation or records are unavailable.</p>
            </div>
          ) : <EmptyChart>{NO_DATA}: numerical features are required.</EmptyChart>}
        </div>

        <div className="card section-card">
          <div className="panel-header"><h3>Transfer-Time Correlations</h3></div>
          <div className="correlation-list">
            {Object.entries(analytics?.correlations || {}).map(([key, result]) => (
              <div className="correlation-row" key={key}>
                <div><strong>{result.label}</strong><small>{result.interpretation}</small></div>
                <span>{formatNumber(result.coefficient, 3)}</span>
              </div>
            ))}
          </div>
          <p className="analytics-note">Correlations use {analytics?.time_target_label?.toLowerCase() || 'transfer time'}; they indicate association, not causation.</p>
        </div>

        <div className="card section-card">
          <div className="panel-header"><h3>Outlier Records</h3></div>
          <p className="analytics-note">
            {analytics?.outliers?.message || `${analytics?.outliers?.normal_count || 0} normal record(s); records are never removed automatically.`}
          </p>
          {analytics?.outliers?.records?.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>File</th><th>Transfer Time</th><th>Z-score</th></tr></thead>
                <tbody>
                  {analytics.outliers.records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.file_name || record.timestamp || record.id}</td>
                      <td>{formatNumber(record.transfer_time_seconds)} sec</td>
                      <td>{formatNumber(record.z_score, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyChart>No unusual records detected in the available data.</EmptyChart>}
        </div>

        <div className="card section-card">
          <div className="panel-header"><h3>Descriptive Statistics</h3></div>
          {statsRows.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Feature</th><th>Count</th><th>Mean</th><th>Median</th><th>Minimum</th><th>Maximum</th><th>Std. Dev.</th></tr>
                </thead>
                <tbody>
                  {statsRows.map(([key, stats]) => (
                    <tr key={key}>
                      <td>{stats.label} ({stats.unit})</td>
                      <td>{stats.count}</td>
                      <td>{formatNumber(stats.mean)}</td>
                      <td>{formatNumber(stats.median)}</td>
                      <td>{formatNumber(stats.min)}</td>
                      <td>{formatNumber(stats.max)}</td>
                      <td>{formatNumber(stats.standard_deviation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyChart>No numerical history is available for descriptive statistics.</EmptyChart>}
        </div>
      </section>

      <section className="analytics-grid analytics-existing-grid">
        <div className="card section-card">
          <div className="panel-header"><h3>Performance Distribution</h3></div>
          <div className="chart-box">
            {performanceDistribution.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={performanceDistribution} dataKey="value" nameKey="name" outerRadius={90} label>
                    {performanceDistribution.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart>No performance labels are available in history.</EmptyChart>}
          </div>
        </div>
        <div className="card section-card">
          <div className="panel-header"><h3>Network Type Comparison</h3></div>
          <div className="chart-box">
            {networkDistribution.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={networkDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis allowDecimals={false} stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" name="Predictions" fill="#34d399" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart>No network types are available in history.</EmptyChart>}
          </div>
        </div>
        <div className="card section-card">
          <div className="panel-header"><h3>Risk Distribution</h3></div>
          <div className="chart-box">
            {riskDistribution.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3a4d" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis allowDecimals={false} stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" name="Risk Count" fill="#f87171" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart>No risk labels are available in history.</EmptyChart>}
          </div>
        </div>
      </section>
    </>
  );
}
