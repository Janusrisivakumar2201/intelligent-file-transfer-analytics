const projectSections = [
  {
    title: 'Project Overview',
    text: 'This project presents an intelligent file transfer analytics system designed to predict transfer performance, estimate total transfer time, and identify network-driven risks before sending files across different types of networks.',
  },
  {
    title: 'Problem Statement',
    text: 'Large file transfers are often affected by bandwidth limitations, latency, packet loss, CPU pressure, memory overhead, and physical distance. These factors make transfer outcomes unpredictable and difficult to optimize without data-driven insight.',
  },
  {
    title: 'Objectives',
    text: 'The system aims to estimate transfer times, identify performance classes, classify risk, and provide recommendations that allow users to make informed changes before initiating transfer operations.',
  },
  {
    title: 'Machine Learning Approach',
    text: 'The system trains Random Forest models to predict transfer time and classify performance and risk levels based on several network and system metrics. This approach balances strong predictive performance and explainability.',
  },
  {
    title: 'Technology Stack',
    text: 'The application combines React for the frontend, FastAPI for the backend, scikit-learn for ML modeling, and MongoDB Atlas for prediction history management with an in-memory fallback when the database is unavailable.',
  },
  {
    title: 'System Workflow',
    text: 'Users submit transfer parameters or upload a file, the backend validates inputs, the ML models estimate transfer behavior, and the system stores the prediction and recommendation results for analytics and historical review.',
  },
  {
    title: 'Future Enhancements',
    text: 'The platform can be expanded with live telemetry, real network benchmarking, advanced anomaly detection, and a more adaptive ML recommendation engine tuned on production data.',
  },
];

export default function AboutPage() {
  return (
    <div className="card section-card">
      <div className="panel-header">
        <h3>About the System</h3>
      </div>
      <p className="section-subtitle">
        Intelligent File Transfer Analytics is a final-year CSE project designed to combine data-driven prediction, optimization recommendations, and a professional dashboard for transfer performance analysis.
      </p>

      <div className="about-grid">
        {projectSections.map((section) => (
          <div key={section.title} className="card about-block">
            <h4>{section.title}</h4>
            <p>{section.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
