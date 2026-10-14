import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  compareDigitalTwinScenarios,
  getDigitalTwinAnalytics,
  optimizeDigitalTwin,
  predictTransfer,
  saveDigitalTwinSimulation,
  simulateDigitalTwin,
} from '../services/api';

const initialConditions = {
  file_size_mb: 500,
  bandwidth_mbps: 50,
  latency_ms: 20,
  packet_loss_percent: 0.5,
  network_type: 'WiFi',
  number_of_files: 1,
  cpu_usage_percent: 40,
  memory_usage_percent: 55,
  distance_km: 5,
};

const networkFields = [
  { key: 'bandwidth_mbps', label: 'Bandwidth', unit: 'Mbps', min: 0.1, step: 0.1 },
  { key: 'latency_ms', label: 'Latency', unit: 'ms', min: 0, step: 1 },
  { key: 'packet_loss_percent', label: 'Packet loss', unit: '%', min: 0, max: 100, step: 0.1 },
  { key: 'cpu_usage_percent', label: 'CPU usage', unit: '%', min: 0, max: 100, step: 1 },
  { key: 'memory_usage_percent', label: 'Memory usage', unit: '%', min: 0, max: 100, step: 1 },
];

const riskClass = (value) => ({
  Low: 'good', Medium: 'warning', High: 'danger',
  Excellent: 'good', Good: 'good', Moderate: 'warning', Poor: 'danger',
}[value] || 'info');

const formatSize = (megabytes) => {
  const size = Number(megabytes) || 0;
  if (size >= 1024) return `${(size / 1024).toFixed(2)} GB`;
  return `${size.toFixed(size < 10 ? 2 : 1)} MB`;
};

const formatDuration = (seconds) => {
  const value = Number(seconds) || 0;
  if (value >= 3600) return `${(value / 3600).toFixed(1)} hr`;
  if (value >= 60) return `${(value / 60).toFixed(1)} min`;
  return `${value.toFixed(1)} sec`;
};

const healthLabel = (score) => {
  if (score <= 40) return 'Poor';
  if (score <= 70) return 'Moderate';
  if (score <= 85) return 'Good';
  return 'Excellent';
};

const calculateHealth = (conditions) => {
  const bandwidth = Math.min(Number(conditions.bandwidth_mbps) / 100, 1) * 100;
  const latency = (1 - Math.min(Number(conditions.latency_ms) / 200, 1)) * 100;
  const packetLoss = (1 - Math.min(Number(conditions.packet_loss_percent) / 10, 1)) * 100;
  const cpu = 100 - Number(conditions.cpu_usage_percent);
  const memory = 100 - Number(conditions.memory_usage_percent);
  return Math.round(Math.max(0, Math.min(100, bandwidth * 0.25 + latency * 0.2 + packetLoss * 0.2 + cpu * 0.175 + memory * 0.175)));
};

const validateConditions = (conditions) => {
  if (!Number.isFinite(Number(conditions.file_size_mb)) || Number(conditions.file_size_mb) <= 0) return 'File size must be greater than zero.';
  if (!Number.isFinite(Number(conditions.bandwidth_mbps)) || Number(conditions.bandwidth_mbps) <= 0) return 'Bandwidth must be greater than zero.';
  if (Number(conditions.latency_ms) < 0) return 'Latency cannot be negative.';
  if (Number(conditions.packet_loss_percent) < 0 || Number(conditions.packet_loss_percent) > 100) return 'Packet loss must be between 0 and 100%.';
  if (!Number.isInteger(Number(conditions.number_of_files)) || Number(conditions.number_of_files) < 1) return 'Number of files must be a positive whole number.';
  if (Number(conditions.cpu_usage_percent) < 0 || Number(conditions.cpu_usage_percent) > 100) return 'CPU usage must be between 0 and 100%.';
  if (Number(conditions.memory_usage_percent) < 0 || Number(conditions.memory_usage_percent) > 100) return 'Memory usage must be between 0 and 100%.';
  if (Number(conditions.distance_km) < 0) return 'Distance cannot be negative.';
  return '';
};

const predictionRequest = (conditions, fileName, currentConditions, scenarioName = null) => ({
  ...conditions,
  file_size_mb: Number(conditions.file_size_mb),
  bandwidth_mbps: Number(conditions.bandwidth_mbps),
  latency_ms: Number(conditions.latency_ms),
  packet_loss_percent: Number(conditions.packet_loss_percent),
  number_of_files: Number(conditions.number_of_files),
  cpu_usage_percent: Number(conditions.cpu_usage_percent),
  memory_usage_percent: Number(conditions.memory_usage_percent),
  distance_km: Number(conditions.distance_km),
  file_name: fileName || null,
  scenario_name: scenarioName,
  current_conditions: currentConditions,
});

function PredictionSummary({ prediction }) {
  if (!prediction) return <div className="twin-empty">Run a prediction to see model output for this state.</div>;

  return (
    <div className="twin-prediction-values">
      <div className="twin-value-row">
        <span>Predicted transfer time</span>
        <strong>{formatDuration(prediction.predicted_transfer_time_seconds)}</strong>
      </div>
      <div className="twin-value-row">
        <span>Performance</span>
        <span className={`badge ${riskClass(prediction.performance_level)}`}>{prediction.performance_level}</span>
      </div>
      <div className="twin-value-row">
        <span>Transfer risk</span>
        <span className={`badge ${riskClass(prediction.transfer_risk)}`}>{prediction.transfer_risk}</span>
      </div>
    </div>
  );
}

export default function DigitalTwin() {
  const [conditions, setConditions] = useState(initialConditions);
  const [draft, setDraft] = useState(initialConditions);
  const [files, setFiles] = useState([]);
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [baselineConditions, setBaselineConditions] = useState(null);
  const [selectedComparison, setSelectedComparison] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState({ current: false, simulation: false, scenarios: false, optimize: false, save: false, analytics: true });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fileName = files.map((file) => file.name).join(', ');
  const currentHealth = currentPrediction?.network_health_score ?? (baselineConditions ? calculateHealth(baselineConditions) : null);
  const comparisonPrediction = selectedComparison?.prediction;
  const scenarioChartData = scenarios.map((item) => ({
    name: item.name.replace(' Network', ''),
    minutes: Number((item.prediction.predicted_transfer_time_seconds / 60).toFixed(2)),
  }));
  const transferAnalytics = (analytics?.transfer_time_comparison || []).map((item) => ({
    ...item,
    current_minutes: Number((Number(item.current_seconds) / 60).toFixed(2)),
    simulated_minutes: Number((Number(item.simulated_seconds) / 60).toFixed(2)),
  }));
  const savedScenarioAnalytics = (analytics?.scenario_comparison || []).map((item) => ({
    ...item,
    minutes: Number((Number(item.transfer_seconds) / 60).toFixed(2)),
  }));

  const refreshAnalytics = async () => {
    setLoading((previous) => ({ ...previous, analytics: true }));
    try {
      setAnalytics(await getDigitalTwinAnalytics());
    } catch {
      setAnalytics(null);
    } finally {
      setLoading((previous) => ({ ...previous, analytics: false }));
    }
  };

  useEffect(() => {
    refreshAnalytics();
  }, []);

  useEffect(() => {
    const storedContext = sessionStorage.getItem('fta_transfer_context');
    if (!storedContext) return;

    try {
      const { conditions: detectedConditions, file, prediction } = JSON.parse(storedContext);
      if (!detectedConditions || !file) return;
      sessionStorage.removeItem('fta_transfer_context');
      setConditions(detectedConditions);
      setDraft(detectedConditions);
      setFiles([file]);
      setCurrentPrediction(prediction || null);
      setBaselineConditions(detectedConditions);
      setSelectedComparison(null);
      setScenarios([]);
      setNotice('Initialized from the latest automatic file and network prediction. What-if controls are ready.');
    } catch {
      sessionStorage.removeItem('fta_transfer_context');
    }
  }, []);

  const resetPredictions = () => {
    setCurrentPrediction(null);
    setBaselineConditions(null);
    setSelectedComparison(null);
    setScenarios([]);
    setNotice('');
  };

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    const totalMegabytes = selectedFiles.reduce((total, file) => total + file.size, 0) / (1024 * 1024);
    setFiles(selectedFiles);
    setConditions((previous) => ({
      ...previous,
      file_size_mb: Number(totalMegabytes.toFixed(4)),
      number_of_files: selectedFiles.length,
    }));
    setDraft((previous) => ({
      ...previous,
      file_size_mb: Number(totalMegabytes.toFixed(4)),
      number_of_files: selectedFiles.length,
    }));
    resetPredictions();
    setError('');
  };

  const handleConditionChange = (field, rawValue) => {
    const value = field === 'network_type' ? rawValue : (rawValue === '' ? '' : Number(rawValue));
    setConditions((previous) => ({ ...previous, [field]: value }));
    resetPredictions();
    setError('');
  };

  const handleCurrentPrediction = async (event) => {
    event.preventDefault();
    const validationError = validateConditions(conditions);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading((previous) => ({ ...previous, current: true }));
    setError('');
    setNotice('');
    try {
      const request = predictionRequest(conditions, fileName, null);
      const result = await predictTransfer(request);
      const network_health_score = calculateHealth(conditions);
      setCurrentPrediction({ ...result, network_health_score });
      setBaselineConditions({ ...conditions });
      setDraft({ ...conditions });
      setNotice('Current state prediction generated by the trained ML models.');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Current prediction failed. Check that the backend and trained models are available.');
    } finally {
      setLoading((previous) => ({ ...previous, current: false }));
    }
  };

  const handleDraftChange = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: Number(value) }));
    setSelectedComparison(null);
    setNotice('');
  };

  const handleSimulation = async () => {
    if (!baselineConditions) {
      setError('Run the current state prediction before simulating a what-if scenario.');
      return;
    }
    const validationError = validateConditions(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading((previous) => ({ ...previous, simulation: true }));
    setError('');
    setNotice('');
    try {
      const result = await simulateDigitalTwin(predictionRequest(draft, fileName, baselineConditions));
      setSelectedComparison({ name: 'Simulated State', conditions: { ...draft }, prediction: result });
      setNotice('Simulation complete. Results are from the trained ML models.');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Simulation failed. Please try again.');
    } finally {
      setLoading((previous) => ({ ...previous, simulation: false }));
    }
  };

  const handleScenarios = async () => {
    if (!baselineConditions) {
      setError('Run the current state prediction before comparing scenarios.');
      return;
    }

    setLoading((previous) => ({ ...previous, scenarios: true }));
    setError('');
    setNotice('');
    try {
      const result = await compareDigitalTwinScenarios(predictionRequest(draft, fileName, baselineConditions));
      setScenarios(result.scenarios);
      setNotice('Three network scenarios have been evaluated by the ML models.');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Scenario comparison failed.');
    } finally {
      setLoading((previous) => ({ ...previous, scenarios: false }));
    }
  };

  const handleOptimize = async () => {
    if (!baselineConditions) {
      setError('Run the current state prediction before finding an optimal configuration.');
      return;
    }

    setLoading((previous) => ({ ...previous, optimize: true }));
    setError('');
    setNotice('');
    try {
      const result = await optimizeDigitalTwin(predictionRequest(draft, fileName, baselineConditions));
      setSelectedComparison({
        name: 'Optimal Configuration',
        conditions: result.optimized_configuration,
        prediction: result,
      });
      setNotice('Optimal configuration selected from ML-scored network candidates.');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Configuration optimization failed.');
    } finally {
      setLoading((previous) => ({ ...previous, optimize: false }));
    }
  };

  const handleSave = async () => {
    if (!selectedComparison || !baselineConditions) return;
    setLoading((previous) => ({ ...previous, save: true }));
    setError('');
    setNotice('');
    try {
      await saveDigitalTwinSimulation(predictionRequest(selectedComparison.conditions, fileName, baselineConditions, selectedComparison.name));
      setNotice('Simulation saved to Digital Twin history.');
      await refreshAnalytics();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to save this simulation.');
    } finally {
      setLoading((previous) => ({ ...previous, save: false }));
    }
  };

  const selectScenario = (scenario) => {
    setSelectedComparison({
      name: scenario.name,
      conditions: scenario.conditions,
      prediction: {
        ...scenario.prediction,
        current_prediction: currentPrediction,
        improvement_percent: scenario.improvement_percent,
      },
    });
    setNotice(`${scenario.name} selected. Save it to add this comparison to Twin analytics.`);
  };

  return (
    <div className="twin-page">
      <header className="twin-heading">
        <div>
          <p className="eyebrow">Pre-transfer simulation workspace</p>
          <h1>Digital Transfer Twin</h1>
          <p className="section-subtitle">Simulate and optimize file transfer performance before the actual transfer.</p>
        </div>
        <div className="twin-status"><span />Twin Status: Active</div>
      </header>

      {error ? <div className="alert" role="alert">{error}</div> : null}
      {notice ? <div className="success" role="status">{notice}</div> : null}

      <div className="twin-main-grid">
        <section className="card section-card twin-section">
          <div className="panel-header">
            <div>
              <h3>File &amp; Current Network</h3>
              <p className="twin-help">Set the transfer payload and the network state to benchmark.</p>
            </div>
            <span className="twin-step">01 / INPUT</span>
          </div>

          <div className="twin-file-picker">
            <label htmlFor="twin-file">Select file(s)</label>
            <input id="twin-file" type="file" multiple onChange={handleFileChange} />
            <small>File metadata is read locally. File contents are not uploaded for this simulation.</small>
          </div>

          <div className="twin-file-summary">
            <div className="twin-file-glyph">📁</div>
            {files.length ? (
              <div className="twin-file-details">
                <strong title={fileName}>{files.length === 1 ? files[0].name : `${files.length} selected files`}</strong>
                <span>{files.map((file) => file.type || 'Unknown type').filter((value, index, list) => list.indexOf(value) === index).join(', ') || 'Unknown type'}</span>
                <span>{formatSize(conditions.file_size_mb)} · {files.length} file{files.length === 1 ? '' : 's'}</span>
              </div>
            ) : (
              <div className="twin-file-details">
                <strong>No file selected</strong>
                <span>Set a size manually or select local file(s).</span>
                <span>{formatSize(conditions.file_size_mb)} · {conditions.number_of_files} file</span>
              </div>
            )}
          </div>

          <form onSubmit={handleCurrentPrediction}>
            <div className="twin-input-grid">
              <label className="form-control" htmlFor="twin-size">
                <span>File size (MB)</span>
                <input id="twin-size" type="number" min="0.01" step="0.01" value={conditions.file_size_mb} onChange={(event) => handleConditionChange('file_size_mb', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-count">
                <span>Number of files</span>
                <input id="twin-count" type="number" min="1" step="1" value={conditions.number_of_files} onChange={(event) => handleConditionChange('number_of_files', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-bandwidth">
                <span>Bandwidth (Mbps)</span>
                <input id="twin-bandwidth" type="number" min="0.1" step="0.1" value={conditions.bandwidth_mbps} onChange={(event) => handleConditionChange('bandwidth_mbps', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-latency">
                <span>Latency (ms)</span>
                <input id="twin-latency" type="number" min="0" step="0.1" value={conditions.latency_ms} onChange={(event) => handleConditionChange('latency_ms', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-loss">
                <span>Packet loss (%)</span>
                <input id="twin-loss" type="number" min="0" max="100" step="0.1" value={conditions.packet_loss_percent} onChange={(event) => handleConditionChange('packet_loss_percent', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-network">
                <span>Network type</span>
                <select id="twin-network" value={conditions.network_type} onChange={(event) => handleConditionChange('network_type', event.target.value)}>
                  <option>Unknown</option><option>WiFi</option><option>Ethernet</option><option>4G</option><option>5G</option>
                </select>
              </label>
              <label className="form-control" htmlFor="twin-cpu">
                <span>CPU usage (%)</span>
                <input id="twin-cpu" type="number" min="0" max="100" step="1" value={conditions.cpu_usage_percent} onChange={(event) => handleConditionChange('cpu_usage_percent', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-memory">
                <span>Memory usage (%)</span>
                <input id="twin-memory" type="number" min="0" max="100" step="1" value={conditions.memory_usage_percent} onChange={(event) => handleConditionChange('memory_usage_percent', event.target.value)} required />
              </label>
              <label className="form-control" htmlFor="twin-distance">
                <span>Distance (km)</span>
                <input id="twin-distance" type="number" min="0" step="0.1" value={conditions.distance_km} onChange={(event) => handleConditionChange('distance_km', event.target.value)} required />
              </label>
            </div>
            <button className="primary-button twin-current-button" type="submit" disabled={loading.current}>
              {loading.current ? 'Predicting current state…' : 'Run Current Prediction'}
            </button>
          </form>
        </section>

        <section className="card section-card twin-section twin-current-panel">
          <div className="panel-header">
            <div>
              <h3>Current State Prediction</h3>
              <p className="twin-help">Baseline from the existing transfer prediction model.</p>
            </div>
            <span className="twin-step">02 / BASELINE</span>
          </div>
          <PredictionSummary prediction={currentPrediction} />
          <div className="twin-health">
            <div className="twin-health-heading">
              <div><span>Network Health Score</span><strong>{currentHealth === null ? '--' : `${currentHealth} / 100`}</strong></div>
              {currentHealth !== null ? <span className={`badge ${currentHealth > 85 ? 'good' : currentHealth > 70 ? 'info' : currentHealth > 40 ? 'warning' : 'danger'}`}>{healthLabel(currentHealth)}</span> : null}
            </div>
            <div className="twin-progress"><span style={{ width: `${currentHealth ?? 0}%` }} /></div>
            <small>Weighted from bandwidth, latency, packet loss, CPU and memory usage.</small>
          </div>
          <div className="twin-baseline-meta">
            <span>Network <strong>{baselineConditions?.network_type || conditions.network_type}</strong></span>
            <span>Distance <strong>{baselineConditions?.distance_km ?? conditions.distance_km} km</strong></span>
          </div>
        </section>
      </div>

      <section className="twin-flow-section" aria-label="Digital twin transfer flow">
        <div className="twin-flow-title"><span className="twin-step">MODEL PIPELINE</span><h3>Transfer environment, mirrored in the twin</h3></div>
        <div className="twin-flow">
          {[
            ['📁', 'File', files.length ? formatSize(conditions.file_size_mb) : 'Payload'],
            ['🌐', 'Network', `${draft.network_type} · ${draft.bandwidth_mbps} Mbps`],
            ['🤖', 'ML Engine', 'Trained models'],
            ['🧬', 'Digital Twin', selectedComparison ? 'Scenario updated' : 'Ready to simulate'],
            ['⏱️', 'Prediction', comparisonPrediction ? formatDuration(comparisonPrediction.predicted_transfer_time_seconds) : 'Awaiting run'],
            ['⚠️', 'Risk', comparisonPrediction?.transfer_risk || 'Awaiting run'],
          ].map(([icon, label, detail], index) => (
            <div className={`twin-flow-node ${index <= (comparisonPrediction ? 5 : currentPrediction ? 3 : 1) ? 'is-active' : ''}`} key={label}>
              <span className="twin-flow-icon" aria-hidden="true">{icon}</span>
              <strong>{label}</strong>
              <small>{detail}</small>
              {index < 5 ? <span className="twin-flow-arrow" aria-hidden="true">→</span> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card section-card twin-section">
        <div className="panel-header">
          <div>
            <h3>Interactive What-if Simulator</h3>
            <p className="twin-help">Adjust a draft environment. No API request is made until you run the simulation.</p>
          </div>
          <span className="twin-step">03 / SIMULATE</span>
        </div>
        <div className="twin-slider-grid">
          {networkFields.map((field) => {
            const max = field.max ?? ({ bandwidth_mbps: 1000, latency_ms: 500 }[field.key]);
            return (
              <label className="twin-slider" htmlFor={`slider-${field.key}`} key={field.key}>
                <span><strong>{field.label}</strong><output>{draft[field.key]} {field.unit}</output></span>
                <input
                  id={`slider-${field.key}`}
                  type="range"
                  min={field.min}
                  max={max}
                  step={field.step}
                  value={draft[field.key]}
                  onChange={(event) => handleDraftChange(field.key, event.target.value)}
                />
                <small>{field.min} {field.unit}<span>{max} {field.unit}</span></small>
              </label>
            );
          })}
        </div>
        <div className="twin-action-row">
          <button className="primary-button" type="button" onClick={handleSimulation} disabled={loading.simulation || !baselineConditions}>
            {loading.simulation ? 'Running model…' : 'Run Simulation'}
          </button>
          <button className="secondary-button" type="button" onClick={handleScenarios} disabled={loading.scenarios || !baselineConditions}>
            {loading.scenarios ? 'Comparing…' : 'Compare Scenarios'}
          </button>
          <button className="secondary-button twin-optimize-button" type="button" onClick={handleOptimize} disabled={loading.optimize || !baselineConditions}>
            {loading.optimize ? 'Testing configurations…' : 'Find Optimal Configuration'}
          </button>
        </div>
      </section>

      <section className="card section-card twin-section">
        <div className="panel-header">
          <div>
            <h3>Current vs Simulated</h3>
            <p className="twin-help">Predictions are generated by the trained transfer, performance and risk models.</p>
          </div>
          {selectedComparison ? <span className="badge info">{selectedComparison.name}</span> : null}
        </div>
        <div className="twin-comparison-grid">
          <div className="twin-comparison-state">
            <span className="twin-comparison-label">CURRENT STATE</span>
            <PredictionSummary prediction={currentPrediction} />
          </div>
          <div className="twin-comparison-divider" aria-hidden="true">→</div>
          <div className="twin-comparison-state is-simulated">
            <span className="twin-comparison-label">{selectedComparison?.name?.toUpperCase() || 'SIMULATED STATE'}</span>
            <PredictionSummary prediction={comparisonPrediction} />
          </div>
        </div>
        <div className="twin-improvement-row">
          <div><span>Time improvement</span><strong>{comparisonPrediction ? `${Number(comparisonPrediction.improvement_percent).toFixed(1)}% ${comparisonPrediction.improvement_percent >= 0 ? 'faster' : 'slower'}` : '--'}</strong></div>
          <div><span>Simulated network health</span><strong>{comparisonPrediction ? `${comparisonPrediction.network_health_score} / 100 · ${healthLabel(comparisonPrediction.network_health_score)}` : '--'}</strong></div>
          <button className="secondary-button" type="button" onClick={handleSave} disabled={!selectedComparison || loading.save}>
            {loading.save ? 'Saving…' : 'Save Simulation'}
          </button>
        </div>
      </section>

      {comparisonPrediction?.recommendations?.length ? (
        <section className="card section-card twin-section twin-recommendations">
          <div className="panel-header"><div><h3>💡 AI Optimization Recommendations</h3><p className="twin-help">Generated from the selected network and file conditions.</p></div></div>
          <ul>{comparisonPrediction.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      <section className="card section-card twin-section">
        <div className="panel-header">
          <div>
            <h3>Scenario Simulation</h3>
            <p className="twin-help">Current, optimized and degraded networks scored with the same file workload.</p>
          </div>
          <span className="twin-step">04 / COMPARE</span>
        </div>
        {scenarios.length ? (
          <div className="twin-scenario-grid">
            <div className="twin-table-wrap">
              <table className="twin-table">
                <thead><tr><th>Scenario</th><th>Transfer time</th><th>Performance</th><th>Risk</th><th>Health</th><th /></tr></thead>
                <tbody>
                  {scenarios.map((scenario) => (
                    <tr key={scenario.name}>
                      <td>{scenario.name}</td>
                      <td>{formatDuration(scenario.prediction.predicted_transfer_time_seconds)}</td>
                      <td>{scenario.prediction.performance_level}</td>
                      <td><span className={`badge ${riskClass(scenario.prediction.transfer_risk)}`}>{scenario.prediction.transfer_risk}</span></td>
                      <td>{scenario.prediction.network_health_score}/100</td>
                      <td><button className="twin-text-button" type="button" onClick={() => selectScenario(scenario)}>Compare</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="twin-chart-wrap">
              <h4>Predicted transfer time</h4>
              <div className="twin-chart twin-scenario-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scenarioChartData} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#9fb8d8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#9fb8d8" tick={{ fontSize: 11 }} unit="m" />
                    <Tooltip contentStyle={{ background: '#101c2d', border: '1px solid #334155', borderRadius: 8 }} />
                    <Bar dataKey="minutes" name="Minutes" fill="#4dd3c3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="twin-empty">Run the scenario comparison to see ML predictions for current, optimized and poor network conditions.</div>
        )}
      </section>

      <section className="twin-analytics-section">
        <div className="twin-section-heading">
          <div><span className="twin-step">05 / HISTORY</span><h3>Digital Twin Analytics</h3></div>
          <button className="secondary-button" type="button" onClick={refreshAnalytics} disabled={loading.analytics}>{loading.analytics ? 'Refreshing…' : 'Refresh analytics'}</button>
        </div>
        <div className="twin-stat-grid">
          <div className="card twin-stat"><span>Saved simulations</span><strong>{analytics?.simulation_count ?? '--'}</strong></div>
          <div className="card twin-stat"><span>Average improvement</span><strong>{analytics ? `${analytics.average_improvement_percent}%` : '--'}</strong></div>
          <div className="card twin-stat"><span>Average predicted time</span><strong>{analytics ? formatDuration(analytics.average_predicted_transfer_time_seconds) : '--'}</strong></div>
          <div className="card twin-stat"><span>Most common risk</span><strong>{analytics?.most_common_risk_level ?? '--'}</strong></div>
        </div>
        <div className="twin-analytics-grid">
          <div className="card section-card twin-chart-panel">
            <h4>Current vs saved simulation</h4>
            {transferAnalytics.length ? (
              <div className="twin-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={transferAnalytics} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#9fb8d8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9fb8d8" tick={{ fontSize: 11 }} unit="m" />
                    <Tooltip contentStyle={{ background: '#101c2d', border: '1px solid #334155', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="current_minutes" name="Current (min)" fill="#7890a8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="simulated_minutes" name="Twin (min)" fill="#4dd3c3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="twin-empty">Save a simulation to build your transfer-time analytics.</div>}
          </div>
          <div className="card section-card twin-chart-panel">
            <h4>Saved scenario comparison</h4>
            {savedScenarioAnalytics.length ? (
              <div className="twin-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={savedScenarioAnalytics} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#9fb8d8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9fb8d8" tick={{ fontSize: 11 }} unit="m" />
                    <Tooltip contentStyle={{ background: '#101c2d', border: '1px solid #334155', borderRadius: 8 }} />
                    <Bar dataKey="minutes" name="Saved prediction (min)" fill="#f3b85f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="twin-empty">Save a selected scenario to compare it with future runs.</div>}
          </div>
          <div className="card section-card twin-chart-panel">
            <h4>Network health trend</h4>
            {analytics?.network_health_trend?.length ? (
              <div className="twin-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.network_health_trend} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#9fb8d8" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} stroke="#9fb8d8" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#101c2d', border: '1px solid #334155', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="score" name="Health score" stroke="#f3b85f" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="twin-empty">Health history appears here after you save a simulation.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}