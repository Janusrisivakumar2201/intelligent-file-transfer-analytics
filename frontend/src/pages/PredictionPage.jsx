import { useRef, useState } from 'react';
import { getNetworkPing, getNetworkTestPayload, predictTransfer } from '../services/api';

const modelInputDefaults = { cpu_usage_percent: 49.31, memory_usage_percent: 52.265, distance_km: 889.34 };
const initialForm = {
  file_size_mb: 0,
  bandwidth_mbps: 0,
  latency_ms: 0,
  packet_loss_percent: 0,
  network_type: 'Unknown',
  number_of_files: 1,
  ...modelInputDefaults,
};

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(Math.round(totalSeconds % 60)).padStart(2, '0')}`;
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
};

const getFileExtension = (file) => (file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : '');

const getFileType = (file) => {
  const extension = getFileExtension(file).toLowerCase();
  const types = {
    zip: 'ZIP File', rar: 'RAR File', '7z': '7-Zip File', gz: 'GZip File',
    pdf: 'PDF File', docx: 'DOCX File', doc: 'DOC File', csv: 'CSV File', txt: 'Text File', json: 'JSON File',
    png: 'PNG Image', jpg: 'JPEG Image', jpeg: 'JPEG Image', mp4: 'MP4 Video',
  };
  return types[extension] || (extension ? `.${extension.toUpperCase()} File` : file.type || 'Unknown file type');
};

export const calculateConnectionQuality = ({ bandwidth_mbps, latency_ms, packet_loss_percent }) => {
  if (![bandwidth_mbps, latency_ms, packet_loss_percent].every(Number.isFinite)) return 'Unavailable';
  if (bandwidth_mbps >= 100 && latency_ms <= 30 && packet_loss_percent < 1) return 'Excellent';
  if (bandwidth_mbps >= 25 && latency_ms <= 80 && packet_loss_percent < 3) return 'Good';
  if (bandwidth_mbps >= 5 && latency_ms <= 150 && packet_loss_percent < 10) return 'Moderate';
  return 'Poor';
};

const getNetworkConnection = () => (typeof navigator === 'undefined'
  ? null
  : navigator.connection || navigator.mozConnection || navigator.webkitConnection || null);

const detectNetworkType = (connection) => {
  if (!connection) return 'Unknown';
  const type = String(connection.type || '').toLowerCase();
  if (type === 'wifi') return 'WiFi';
  if (type === 'ethernet') return 'Ethernet';
  if (connection.effectiveType === '4g') return '4G';
  if (connection.effectiveType === '5g') return '5G';
  return 'Unknown';
};

const measureBandwidth = async () => {
  const startedAt = performance.now();
  const payload = await getNetworkTestPayload();
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  if (!payload.byteLength || elapsedSeconds <= 0) throw new Error('Bandwidth test returned no measurable data.');
  return (payload.byteLength * 8) / elapsedSeconds / 1_000_000;
};

const measureLatencyAndLoss = async () => {
  const samples = await Promise.all(Array.from({ length: 3 }, async () => {
    const startedAt = performance.now();
    try {
      await getNetworkPing();
      return performance.now() - startedAt;
    } catch {
      return null;
    }
  }));
  const successful = samples.filter((value) => value !== null);
  return {
    latency_ms: successful.length ? successful.reduce((sum, value) => sum + value, 0) / successful.length : null,
    packet_loss_percent: ((samples.length - successful.length) / samples.length) * 100,
    successful_samples: successful.length,
  };
};

const riskStyles = { Low: 'good', Medium: 'warning', High: 'danger', Good: 'good', Excellent: 'good', Moderate: 'warning', Poor: 'danger' };
const qualityStyles = { Excellent: 'good', Good: 'good', Moderate: 'warning', Poor: 'danger' };
const scanStepOrder = [
  { key: 'readingMetadata', label: 'Reading file metadata' },
  { key: 'detectFileSize', label: 'Detecting file size' },
  { key: 'detectNetwork', label: 'Detecting network' },
  { key: 'measureBandwidth', label: 'Measuring bandwidth' },
  { key: 'measureLatency', label: 'Measuring latency' },
  { key: 'estimatePacketLoss', label: 'Estimating packet loss' },
  { key: 'prepareFeatures', label: 'Preparing ML features' },
  { key: 'runningMLPrediction', label: 'Running ML prediction' },
];
const scanStepIcons = { waiting: '○', running: '⟳', completed: '✓', failed: '⚠' };
const defaultScanState = {
  isActive: false,
  isComplete: false,
  currentStatus: 'Reading file metadata…',
  progress: 0,
  steps: {
    readingMetadata: 'waiting',
    detectFileSize: 'waiting',
    detectNetwork: 'waiting',
    measureBandwidth: 'waiting',
    measureLatency: 'waiting',
    estimatePacketLoss: 'waiting',
    prepareFeatures: 'waiting',
    runningMLPrediction: 'waiting',
  },
};

export default function PredictionPage() {
  const [form, setForm] = useState(initialForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [measurement, setMeasurement] = useState({ bandwidth: 'idle', latency: 'idle', type: 'idle' });
  const [manualOverride, setManualOverride] = useState(false);
  const [manualTouched, setManualTouched] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [scanState, setScanState] = useState(defaultScanState);
  const [connectionDetails, setConnectionDetails] = useState(null);
  const fileInput = useRef(null);
  const analysisRun = useRef(0);

  const openFilePicker = () => {
    fileInput.current?.click();
  };

  const applySelectedFile = (file) => {
    if (!file) return;
    analysisRun.current += 1;
    sessionStorage.removeItem('fta_transfer_context');
    setSelectedFile(file);
    setForm({ ...initialForm, file_size_mb: file.size / (1024 * 1024), number_of_files: 1 });
    setMeasurement({ bandwidth: 'idle', latency: 'idle', type: 'idle' });
    setManualTouched({});
    setConnectionDetails(null);
    setLoading(false);
    setResult(null);
    setError('');
    setNotice('');
    setScanState(defaultScanState);
    if (file.size === 0) {
      setError('This file is empty and cannot be scored by the transfer model.');
      setScanState((previous) => ({
        ...previous,
        currentStatus: 'Empty file cannot be analyzed.',
        steps: { ...previous.steps, readingMetadata: 'completed', detectFileSize: 'failed' },
        progress: Math.round((1 / scanStepOrder.length) * 100),
      }));
      return;
    }
    setScanState({
      ...defaultScanState,
      isActive: true,
      currentStatus: 'Reading file metadata…',
      steps: {
        readingMetadata: 'running',
        detectFileSize: 'waiting',
        detectNetwork: 'waiting',
        measureBandwidth: 'waiting',
        measureLatency: 'waiting',
        estimatePacketLoss: 'waiting',
        prepareFeatures: 'waiting',
        runningMLPrediction: 'waiting',
      },
    });
  };

  const updateScanStep = (key, status) => {
    setScanState((previous) => {
      const nextSteps = { ...previous.steps, [key]: status };
      const totalSteps = scanStepOrder.length;
      const completedSteps = Object.values(nextSteps).filter((current) => current === 'completed').length;
      const nextProgress = Math.round((completedSteps / totalSteps) * 100);
      return { ...previous, steps: nextSteps, progress: nextProgress };
    });
  };

  const updateScanStatus = (message) => {
    setScanState((previous) => ({ ...previous, currentStatus: message }));
  };

  const resetScanState = () => {
    setScanState({ ...defaultScanState, currentStatus: 'Reading file metadata…' });
  };

  const markScanFailure = (key, message) => {
    setScanState((previous) => ({
      ...previous,
      isActive: false,
      currentStatus: message,
      steps: { ...previous.steps, [key]: 'failed' },
      progress: Math.round((Object.values(previous.steps).filter((status) => status === 'completed').length / scanStepOrder.length) * 100),
    }));
  };

  const runAnalysis = async (fileOverride, { useManualOverrides = true } = {}) => {
    const file = fileOverride || selectedFile;
    if (!file) return;
    if (file.size === 0) {
      setError('This file is empty and cannot be scored by the transfer model.');
      return;
    }

    const runId = ++analysisRun.current;
    setLoading(true);
    setError('');
    setNotice('');
    setResult(null);
    setScanState({
      ...defaultScanState,
      isActive: true,
      currentStatus: 'Reading file metadata…',
      steps: {
        readingMetadata: 'running',
        detectFileSize: 'waiting',
        detectNetwork: 'waiting',
        measureBandwidth: 'waiting',
        measureLatency: 'waiting',
        estimatePacketLoss: 'waiting',
        prepareFeatures: 'waiting',
        runningMLPrediction: 'waiting',
      },
    });

    const connection = getNetworkConnection();
    const networkType = useManualOverrides && manualTouched.network_type ? form.network_type : detectNetworkType(connection);
    const networkTypeSource = useManualOverrides && manualTouched.network_type
      ? 'manual'
      : connection ? 'detected' : 'unavailable';
    setConnectionDetails(connection ? {
      effectiveType: connection.effectiveType || 'Unavailable',
      downlink: Number(connection.downlink) > 0 ? Number(connection.downlink) : null,
      rtt: Number(connection.rtt) > 0 ? Number(connection.rtt) : null,
      saveData: typeof connection.saveData === 'boolean' ? connection.saveData : null,
    } : null);
    setMeasurement({ bandwidth: 'measuring', latency: 'measuring', type: networkTypeSource });

    try {
      updateScanStep('readingMetadata', 'completed');
      updateScanStatus('Detecting file size…');
      updateScanStep('detectFileSize', 'running');
      const fileSizeMb = file.size / (1024 * 1024);
      updateScanStep('detectFileSize', 'completed');
      updateScanStatus('Detecting network conditions…');
      updateScanStep('detectNetwork', 'running');
      setForm((previous) => ({ ...previous, network_type: networkType }));
      updateScanStep('detectNetwork', 'completed');

      let bandwidth = null;
      let bandwidthSource = 'unavailable';
      updateScanStep('measureBandwidth', 'running');
      updateScanStatus('Measuring bandwidth…');
      if (useManualOverrides && manualTouched.bandwidth_mbps && form.bandwidth_mbps > 0) {
        bandwidth = Number(form.bandwidth_mbps);
        bandwidthSource = 'manual';
      } else {
        try {
          bandwidth = await measureBandwidth();
          if (runId !== analysisRun.current) return;
          bandwidthSource = 'measured';
        } catch {
          if (runId !== analysisRun.current) return;
          if (Number(connection?.downlink) > 0) {
            bandwidth = Number(connection.downlink);
            bandwidthSource = 'browser-estimate';
          }
        }
      }
      updateScanStep('measureBandwidth', bandwidth ? 'completed' : 'failed');
      if (!bandwidth) {
        setMeasurement((previous) => ({ ...previous, bandwidth: 'unavailable' }));
        markScanFailure('measureBandwidth', 'Automatic bandwidth measurement unavailable.');
        throw new Error('Automatic bandwidth measurement unavailable.');
      }

      updateScanStatus('Measuring latency…');
      updateScanStep('measureLatency', 'running');
      const ping = await measureLatencyAndLoss();
      if (runId !== analysisRun.current) return;
      const latency = useManualOverrides && manualTouched.latency_ms
        ? Number(form.latency_ms)
        : ping.latency_ms;
      const packetLoss = useManualOverrides && manualTouched.packet_loss_percent
        ? Number(form.packet_loss_percent)
        : ping.successful_samples
        ? ping.packet_loss_percent
        : null;

      setMeasurement({
        bandwidth: bandwidthSource === 'unavailable' ? 'unavailable' : bandwidthSource,
        latency: latency === null ? 'unavailable' : useManualOverrides && manualTouched.latency_ms ? 'manual' : ping.successful_samples ? 'measured' : 'manual',
        type: networkTypeSource,
      });
      updateScanStep('measureLatency', latency === null ? 'failed' : 'completed');
      if (latency === null) {
        markScanFailure('measureLatency', 'Latency measurement unavailable.');
        throw new Error('Latency measurement unavailable.');
      }

      updateScanStatus('Estimating connection quality…');
      updateScanStep('estimatePacketLoss', 'running');
      if (packetLoss === null) {
        updateScanStep('estimatePacketLoss', 'failed');
        markScanFailure('estimatePacketLoss', 'Packet-loss estimate unavailable.');
        throw new Error('Packet-loss estimate unavailable.');
      }
      updateScanStep('estimatePacketLoss', 'completed');

      updateScanStatus('Preparing ML features…');
      updateScanStep('prepareFeatures', 'running');
      const nextForm = {
        ...(useManualOverrides && (manualTouched.network_type || manualTouched.bandwidth_mbps || manualTouched.latency_ms || manualTouched.packet_loss_percent) ? form : initialForm),
        file_size_mb: fileSizeMb,
        number_of_files: 1,
        network_type: networkType,
        bandwidth_mbps: bandwidth,
        latency_ms: latency,
        packet_loss_percent: packetLoss,
      };
      setForm(nextForm);
      updateScanStep('prepareFeatures', 'completed');
      const quality = calculateConnectionQuality({ bandwidth_mbps: bandwidth, latency_ms: latency, packet_loss_percent: packetLoss });
      updateScanStatus('Running machine learning prediction…');
      updateScanStep('runningMLPrediction', 'running');

      let prediction;
      try {
        prediction = await predictTransfer({
          ...nextForm,
          file_name: file.name,
          file_type: getFileExtension(file) || file.type || 'Unknown',
          file_mime_type: file.type || 'Unavailable',
          file_size_bytes: file.size,
          model_fallback_inputs: [
            'cpu_usage_percent',
            'memory_usage_percent',
            'distance_km',
            ...(networkType === 'Unknown' ? ['network_type'] : []),
          ],
          file_size_mb: Number(nextForm.file_size_mb),
          bandwidth_mbps: Number(nextForm.bandwidth_mbps),
          latency_ms: Number(nextForm.latency_ms),
          packet_loss_percent: Number(nextForm.packet_loss_percent),
        });
        if (runId !== analysisRun.current) return;
      } catch (predictionError) {
        if (runId !== analysisRun.current) return;
        updateScanStep('runningMLPrediction', 'failed');
        if (!predictionError?.response) {
          throw new Error('Prediction service unavailable. Check that the backend is running and try again.');
        }
        throw new Error(predictionError.response.data?.detail || 'Prediction failed. Check the measured values and try again.');
      }

      setResult({
        ...prediction,
        file_name: file.name,
        file_type: getFileExtension(file) || file.type || 'Unknown',
        file_mime_type: file.type || 'Unavailable',
        file_size_bytes: file.size,
        connection_quality: quality,
        network_type_label: networkType === 'Unknown' ? 'Unknown' : networkType,
        bandwidth_source: bandwidthSource,
        latency_samples: ping.successful_samples,
      });
      setMeasurement((previous) => ({
        ...previous,
        latency: useManualOverrides && (manualTouched.latency_ms || manualTouched.packet_loss_percent)
          ? 'manual'
          : ping.successful_samples ? 'measured' : 'manual',
      }));
      sessionStorage.setItem('fta_transfer_context', JSON.stringify({
        conditions: nextForm,
        file: { name: file.name, type: file.type, size: file.size },
        prediction: { ...prediction, network_health_score: prediction.network_health_score },
      }));
      updateScanStep('runningMLPrediction', 'completed');
      setScanState((previous) => ({
        ...previous,
        isActive: false,
        isComplete: true,
        currentStatus: 'Analysis completed successfully.',
      }));
      setNotice('Analysis completed successfully.');
    } catch (submitError) {
      if (runId !== analysisRun.current) return;
      setError(submitError.message || 'Network analysis failed. Review measurements and try again.');
      setNotice('');
      setScanState((previous) => ({
        ...previous,
        isActive: false,
        isComplete: false,
        currentStatus: submitError.message || 'Analysis could not be completed.',
      }));
    } finally {
      if (runId === analysisRun.current) setLoading(false);
    }
  };

  const updateManualField = (field) => (event) => {
    const value = field === 'network_type' ? event.target.value : Number(event.target.value);
    setForm((previous) => ({ ...previous, [field]: value }));
    setManualTouched((previous) => ({ ...previous, [field]: true }));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    applySelectedFile(file);
    void runAnalysis(file, { useManualOverrides: false });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  };

  const handleReset = () => {
    analysisRun.current += 1;
    sessionStorage.removeItem('fta_transfer_context');
    setForm(initialForm);
    setSelectedFile(null);
    setLoading(false);
    setMeasurement({ bandwidth: 'idle', latency: 'idle', type: 'idle' });
    setManualTouched({});
    setConnectionDetails(null);
    setNotice('');
    setError('');
    setResult(null);
    resetScanState();
    if (fileInput.current) fileInput.current.value = '';
  };

  const retryAnalysis = () => {
    if (!selectedFile) return;
    void runAnalysis(selectedFile);
  };

  const quality = calculateConnectionQuality({
    bandwidth_mbps: form.bandwidth_mbps,
    latency_ms: form.latency_ms,
    packet_loss_percent: form.packet_loss_percent,
  });

  return (
    <div className="card section-card prediction-page">
      <div className="panel-header">
        <div><h3>Transfer Prediction</h3><p className="prediction-intro">Read file metadata locally, measure this browser’s connection, then score it with the trained models.</p></div>
      </div>

      <section className="prediction-section">
          <div className="prediction-section-heading"><span>01</span><div><h4>File</h4><p>The file contents stay on your device.</p></div></div>

          <div
            className={`prediction-upload-card ${selectedFile ? 'has-file' : ''} ${isDragActive ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={selectedFile ? undefined : openFilePicker}
            role={selectedFile ? undefined : 'button'}
            tabIndex={selectedFile ? undefined : 0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openFilePicker();
              }
            }}
          >
            <input
              ref={fileInput}
              id="file-upload"
              className="prediction-upload-input"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                applySelectedFile(file);
                void runAnalysis(file, { useManualOverrides: false });
              }}
            />

            {selectedFile ? (
              <div className="prediction-upload-selected" aria-label="Selected file">
                <div className="prediction-upload-status">✓ File Selected</div>
                <div className="prediction-upload-file-row">
                  <span className="prediction-upload-icon" aria-hidden="true">📄</span>
                  <div className="prediction-upload-file-meta" title={selectedFile.name}>
                    <strong>{selectedFile.name}</strong>
                    <span>{getFileType(selectedFile)} • {selectedFile.type || 'MIME type unavailable'} • {formatFileSize(selectedFile.size)} • 1 file</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="secondary-button prediction-upload-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openFilePicker();
                  }}
                >
                  Change File
                </button>
              </div>
            ) : (
              <div className="prediction-upload-empty">
                <div className="prediction-upload-icon" aria-hidden="true">📁</div>
                <h5>{isDragActive ? 'Drop file to analyze' : '🧬 SMART FILE TRANSFER ANALYZER'}</h5>
                <p>Upload a file to automatically analyze its transfer performance.</p>
                <small>File name, type and size are read locally; contents stay on your device.</small>
                <button
                  type="button"
                  className="primary-button prediction-upload-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openFilePicker();
                  }}
                >
                  Choose File
                </button>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className={`smart-file-scanner ${scanState.isActive ? 'is-active' : ''} ${scanState.isComplete ? 'is-complete' : ''} ${error ? 'is-error' : ''}`}>
              <div className="smart-scan-header">
                <span className="smart-scan-title">{scanState.isComplete ? '✓ ANALYSIS COMPLETE' : error ? '⚠ ANALYSIS FAILED' : '🔍 SMART FILE SCANNER'}</span>
              </div>

              <div className="smart-scan-body">
                <div className="smart-scan-file-summary">
                  <div className={`smart-scan-file-icon ${scanState.isComplete ? 'complete' : ''} ${scanState.isActive && !scanState.isComplete ? 'active' : ''}`} aria-hidden="true">
                    {scanState.isComplete ? '✓ 📄' : '📄'}
                  </div>
                  <div className="smart-scan-file-meta">
                    <strong>{selectedFile.name}</strong>
                    <span>{getFileType(selectedFile)} • {selectedFile.type || 'MIME type unavailable'} • {formatFileSize(selectedFile.size)} • {selectedFile.size.toLocaleString()} bytes • 1 file</span>
                  </div>
                </div>

                <div className="smart-scan-wave" aria-hidden="true">
                  <span className="smart-scan-line" />
                </div>

                <div className="smart-scan-status-message">{error || scanState.currentStatus}</div>

                <div className="smart-scan-steps">
                  {scanStepOrder.map((step) => (
                    <div key={step.key} className={`smart-scan-step ${scanState.steps[step.key]}`}>
                      <span className="smart-scan-step-marker">{scanStepIcons[scanState.steps[step.key]] || scanStepIcons.waiting}</span>
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>

                <div className="smart-scan-progress-block">
                  <div className="smart-scan-progress-header">
                    <span>ANALYSIS PROGRESS</span>
                    <strong>{scanState.progress}%</strong>
                  </div>
                  <div className="smart-scan-progress-bar">
                    <span style={{ width: `${scanState.progress}%` }} />
                  </div>
                  <div className="smart-scan-progress-label">{scanState.isComplete ? 'Analysis complete' : error ? 'Analysis failed' : scanState.currentStatus}</div>
                </div>

                {error ? (
                  <button type="button" className="secondary-button prediction-upload-button" onClick={retryAnalysis}>
                    Retry Analysis
                  </button>
                ) : null}
              </div>
            </div>
          )}
      </section>

      {selectedFile ? <section className="prediction-section">
          <div className="prediction-section-heading"><span>02</span><div><h4>Automatic Network Analysis</h4><p>Throughput uses a 128 KiB backend sample; latency and loss are browser-observed estimates.</p></div></div>
          <div className="prediction-network-grid">
            <div className="prediction-network-value"><span>Network type</span><strong>{measurement.type === 'unavailable' || form.network_type === 'Unknown' ? 'Unavailable' : form.network_type}</strong><small>{measurement.type === 'manual' ? 'Advanced manual override.' : measurement.type === 'unavailable' || form.network_type === 'Unknown' ? 'Network type unavailable from browser connection information.' : 'Reported by browser connection information.'}</small></div>
            <div className="prediction-network-value"><span>Bandwidth</span><strong>{form.bandwidth_mbps > 0 ? `${Number(form.bandwidth_mbps).toFixed(1)} Mbps` : 'Measuring…'}</strong><small>{measurement.bandwidth === 'measured' ? 'Measured using the small backend sample.' : measurement.bandwidth === 'browser-estimate' ? 'Browser estimate; not a measured download.' : measurement.bandwidth === 'manual' ? 'Advanced override.' : measurement.bandwidth === 'unavailable' ? 'Automatic bandwidth measurement unavailable.' : 'Measured when analysis starts.'}</small></div>
            <div className="prediction-network-value"><span>Latency</span><strong>{measurement.latency === 'unavailable' ? 'Unavailable' : measurement.latency === 'measured' || measurement.latency === 'manual' ? `${Number(form.latency_ms).toFixed(1)} ms` : 'Measuring…'}</strong><small>{measurement.latency === 'measured' ? `Average of ${result?.latency_samples ?? 3} successful ping samples.` : 'Average round-trip time from three lightweight requests.'}</small></div>
            <div className="prediction-network-value"><span>Estimated packet loss</span><strong>{measurement.latency === 'measured' || measurement.latency === 'manual' ? `${Number(form.packet_loss_percent).toFixed(1)}%` : 'Measuring…'}</strong><small>Estimated from failed browser ping requests.</small></div>
            <div className="prediction-network-value"><span>Connection quality</span><strong className={`badge ${qualityStyles[quality] || 'info'}`}>{quality}</strong><small>Calculated from measured bandwidth, latency and estimated loss.</small></div>
            <div className="prediction-network-value"><span>Browser connection details</span><strong>{connectionDetails?.effectiveType || 'Unavailable'}</strong><small>Downlink {connectionDetails?.downlink ? `${connectionDetails.downlink} Mbps` : 'unavailable'} · RTT {connectionDetails?.rtt ? `${connectionDetails.rtt} ms` : 'unavailable'} · Data saver {connectionDetails?.saveData === null || !connectionDetails ? 'unavailable' : connectionDetails.saveData ? 'on' : 'off'}</small></div>
          </div>
          {notice ? <div className="prediction-note">{notice}</div> : null}
      </section> : null}

      <details className="prediction-advanced" open={manualOverride} onToggle={(event) => setManualOverride(event.currentTarget.open)}>
          <summary>Advanced Manual Override</summary>
          <p>Optional simulation controls. The default prediction uses automatic measurements; model fallback inputs remain internal.</p>
          <div className="form-grid">
            <label className="form-control" htmlFor="bandwidth_mbps"><span>Bandwidth (Mbps)</span><input id="bandwidth_mbps" type="number" min="0.01" step="0.01" value={form.bandwidth_mbps || ''} onChange={updateManualField('bandwidth_mbps')} /></label>
            <label className="form-control" htmlFor="latency_ms"><span>Latency (ms)</span><input id="latency_ms" type="number" min="0" step="0.1" value={form.latency_ms || ''} onChange={updateManualField('latency_ms')} /></label>
            <label className="form-control" htmlFor="packet_loss_percent"><span>Estimated packet loss (%)</span><input id="packet_loss_percent" type="number" min="0" max="100" step="0.1" value={form.packet_loss_percent} onChange={updateManualField('packet_loss_percent')} /></label>
            <label className="form-control" htmlFor="network_type"><span>Network type</span><select id="network_type" value={form.network_type} onChange={updateManualField('network_type')}><option>Unknown</option><option>WiFi</option><option>Ethernet</option><option>4G</option><option>5G</option></select></label>
          </div>
          <button className="secondary-button" type="button" onClick={() => {
            const connection = getNetworkConnection();
            if (Number(connection?.downlink) > 0) {
              setForm((previous) => ({ ...previous, bandwidth_mbps: Number(connection.downlink) }));
              setManualTouched((previous) => ({ ...previous, bandwidth_mbps: true }));
              setMeasurement((previous) => ({ ...previous, bandwidth: 'browser-estimate' }));
              setNotice('Using the browser-reported downlink estimate; this is not a measured download speed.');
            } else {
              setNotice('Browser connection estimates are unavailable. Enter bandwidth manually.');
            }
          }}>Use Browser Estimate</button>
      </details>

      <div className="prediction-actions">
        {selectedFile && !loading ? <button className="primary-button" type="button" onClick={retryAnalysis}>{error ? 'Retry Analysis' : 'Re-analyze'}</button> : null}
        <button type="button" className="secondary-button" onClick={handleReset} disabled={loading}>Reset</button>
      </div>

      {error ? <div className="alert" role="alert" style={{ marginTop: 16 }}>{error}</div> : null}
      {result ? (
        <section className="result-panel prediction-result" aria-label="Transfer prediction result">
          <div className="panel-header"><div><h3>Prediction completed</h3><p className="prediction-intro">Scored by the existing trained transfer models.</p></div><span className="badge good">ML prediction</span></div>
          <div className="prediction-result-grid">
            <div><span>File</span><strong title={selectedFile.name}>{selectedFile.name}</strong><small>{getFileType(selectedFile)} · {formatFileSize(selectedFile.size)}</small></div>
            <div><span>Network</span><strong>{result.network_type_label}</strong><small>{Number(form.bandwidth_mbps).toFixed(1)} Mbps · {Number(form.latency_ms).toFixed(1)} ms · {Number(form.packet_loss_percent).toFixed(0)}% estimated loss</small></div>
            <div><span>Predicted Transfer Time</span><strong>{formatDuration(result.predicted_transfer_time_seconds)}</strong><small>{Number(result.predicted_transfer_time_seconds).toFixed(1)} seconds</small></div>
            <div><span>Performance</span><strong><span className={`badge ${riskStyles[result.performance_level] || 'info'}`}>{result.performance_level}</span></strong></div>
            <div><span>Transfer Risk</span><strong><span className={`badge ${riskStyles[result.transfer_risk] || 'info'}`}>{result.transfer_risk}</span></strong></div>
            <div><span>Network Health</span><strong>{result.network_health_score ?? 'Unavailable'}{result.network_health_score !== undefined ? '/100' : ''}</strong><small>Uses the existing Digital Twin health calculation.</small></div>
            <div><span>Connection Quality</span><strong><span className={`badge ${qualityStyles[result.connection_quality] || 'info'}`}>{result.connection_quality}</span></strong></div>
          </div>
          <div className="result-callout"><h4>Recommendations</h4><ul>{result.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <p className="prediction-twin-note">These file metadata and network inputs are ready to initialize the Digital Transfer Twin.</p>
        </section>
      ) : null}
    </div>
  );
}