import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import PredictionPage from './pages/PredictionPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HistoryPage from './pages/HistoryPage';
import AboutPage from './pages/AboutPage';
import MonitoringPage from './pages/MonitoringPage';
import OptimizationPage from './pages/OptimizationPage';
import OperationsPage from './pages/OperationsPage';
import DigitalTwin from './pages/DigitalTwin';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/predict" element={<PredictionPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/optimization" element={<OptimizationPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/digital-twin" element={<DigitalTwin />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
