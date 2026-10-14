import { useEffect, useMemo, useState } from 'react';
import { getHistory } from '../services/api';

const formatFileSize = (record) => {
  const bytes = Number(record.file_size_bytes);
  if (bytes > 0) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} bytes`;
  }
  return `${Number(record.file_size_mb || 0).toFixed(1)} MB`;
};

export default function HistoryPage() {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await getHistory();
        setRecords(history);
      } catch (error) {
        console.error('History load failed:', error);
      }
    };

    loadHistory();
  }, []);

  const filteredRecords = useMemo(() => {
    const keyword = search.toLowerCase();
    let items = [...records].filter((item) => {
      const matchesText =
        `${item.file_name || ''}`.toLowerCase().includes(keyword) ||
        `${item.file_type || ''}`.toLowerCase().includes(keyword) ||
        `${item.network_type || ''}`.toLowerCase().includes(keyword) ||
        `${item.performance_level || ''}`.toLowerCase().includes(keyword) ||
        `${item.transfer_risk || ''}`.toLowerCase().includes(keyword);

      const matchesPerformance = performanceFilter === 'All' || item.performance_level === performanceFilter;
      const matchesRisk = riskFilter === 'All' || item.transfer_risk === riskFilter;

      return matchesText && matchesPerformance && matchesRisk;
    });

    items.sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
    });

    return items;
  }, [records, search, performanceFilter, riskFilter, sortDirection]);

  return (
    <div className="card section-card">
      <div className="panel-header">
        <h3>Prediction History</h3>
      </div>

      <div className="toolbar">
        <input type="text" placeholder="Search by file, network, risk or performance" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)}>
          <option value="All">All performance</option>
          <option value="Excellent">Excellent</option>
          <option value="Good">Good</option>
          <option value="Moderate">Moderate</option>
          <option value="Poor">Poor</option>
        </select>
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="All">All risk</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value)}>
          <option value="desc">Sort newest first</option>
          <option value="asc">Sort oldest first</option>
        </select>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="empty-state">No matching prediction history found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th>Type</th>
                <th>File Size</th>
                <th>Bandwidth</th>
                <th>Latency</th>
                <th>Packet Loss</th>
                <th>Predicted Time</th>
                <th>Performance</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((item, index) => (
                <tr key={`${item.timestamp || 'record'}-${index}`}>
                  <td>{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}</td>
                  <td title={item.file_name || ''}>{item.file_name || 'N/A'}</td>
                  <td>{item.file_type || 'N/A'}</td>
                  <td>{formatFileSize(item)}</td>
                  <td>{Number(item.bandwidth_mbps || 0).toFixed(1)} Mbps</td>
                  <td>{Number(item.latency_ms || 0).toFixed(1)} ms</td>
                  <td>{Number(item.packet_loss_percent || 0).toFixed(1)}%</td>
                  <td>{Number(item.predicted_transfer_time_seconds || 0).toFixed(1)} s</td>
                  <td>{item.performance_level || 'N/A'}</td>
                  <td>{item.transfer_risk || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
