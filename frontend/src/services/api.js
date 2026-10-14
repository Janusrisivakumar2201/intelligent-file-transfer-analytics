import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

export const getHealth = async () => {
  const response = await api.get('/api/health');
  return response.data;
};

export const getNetworkTestPayload = async () => {
  const response = await api.get('/api/network-test', {
    params: { sample: Date.now() },
    responseType: 'arraybuffer',
    headers: { 'Cache-Control': 'no-cache' },
  });
  return response.data;
};

export const getNetworkPing = async () => {
  const response = await api.get('/api/network-ping', { params: { sample: Math.random() } });
  return response.data;
};

export const getDashboardSummary = async () => {
  const response = await api.get('/api/dashboard');
  return response.data;
};

export const getMetrics = async () => {
  const response = await api.get('/api/metrics');
  return response.data;
};

export const getHistory = async () => {
  const response = await api.get('/api/history');
  return response.data.records || [];
};

export const getDataScienceAnalytics = async () => {
  const response = await api.get('/api/digital-twin/analytics');
  return response.data;
};

export const predictTransfer = async (payload) => {
  const response = await api.post('/api/predict', payload);
  return response.data;
};

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getMonitoring = async () => {
  const response = await api.get('/api/monitoring');
  return response.data;
};

export const getOptimizationInsights = async () => {
  const response = await api.get('/api/optimization');
  return response.data;
};

export const getAlerts = async () => {
  const response = await api.get('/api/alerts');
  return response.data;
};

export const getAuditTrail = async () => {
  const response = await api.get('/api/audit');
  return response.data;
};

export const simulateDigitalTwin = async (payload) => {
  const response = await api.post('/api/digital-twin/simulate', payload);
  return response.data;
};

export const compareDigitalTwinScenarios = async (payload) => {
  const response = await api.post('/api/digital-twin/scenarios', payload);
  return response.data;
};

export const optimizeDigitalTwin = async (payload) => {
  const response = await api.post('/api/digital-twin/optimize', payload);
  return response.data;
};

export const saveDigitalTwinSimulation = async (payload) => {
  const response = await api.post('/api/digital-twin/save', payload);
  return response.data;
};

export const getDigitalTwinAnalytics = async () => {
  const response = await api.get('/api/digital-twin/analytics');
  return response.data;
};

export const getDigitalTwinHistory = async () => {
  const response = await api.get('/api/digital-twin/history');
  return response.data;
};

export const exportHistory = async () => {
  const response = await api.get('/api/export', { responseType: 'blob' });
  return response.data;
};

export default api;
