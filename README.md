# Intelligent File Transfer Analytics

A full-stack machine-learning application for estimating file transfer time and assessing network-dependent performance and risk. Select a local file to analyze its metadata and the browser's current connection; only metadata is used by the prediction workflow, not the file contents.

## Main Features

- Automatic file metadata analysis and network measurement on file selection.
- Transfer-time, performance, and risk predictions from the existing trained models.
- Network quality metrics, recommendations, analytics, and monitoring views.
- Searchable prediction history, backed by MongoDB when configured and in-memory storage otherwise.
- Digital Transfer Twin with automatically supplied prediction context and what-if simulation controls.
- Responsive React interface with dashboard, operations, optimization, and history pages.

## Machine Learning

The backend loads the checked-in model artifacts in `backend/ml/`; model training is not required for normal startup. The existing model pipeline includes:

- A Random Forest regressor for predicted transfer time.
- Classifiers for performance level and transfer risk.
- Input features: file size, bandwidth, latency, estimated packet loss, network type, number of files, CPU, memory, and distance.
- Browser-inaccessible CPU, memory, and distance inputs use the existing model fallback values; they are not presented as measurements of the user's device.
- File extension and MIME type are stored as metadata but are not model features.

Training data is in `backend/dataset/file_transfer_dataset.csv`, and evaluation metrics are in `backend/ml/model_metrics.json`. The optional training script is `backend/ml/train_model.py`; it can replace the current model artifacts, so it is not part of routine setup.

## Technology Stack

- Frontend: React 18, Vite 5, React Router, Axios, and Recharts.
- Backend: Python, FastAPI, Uvicorn, and Pydantic.
- ML and data: scikit-learn, pandas, NumPy, and joblib.
- Optional persistence: MongoDB via PyMongo; in-memory fallback is available.

## Project Structure

```text
file-transfer-ml/
├── .gitignore
├── README.md
├── render.yaml                 # Existing configuration; not required for local use
├── backend/
│   ├── .env.example
│   ├── dataset/
│   │   └── file_transfer_dataset.csv
│   ├── ml/
│   │   ├── model_metrics.json
│   │   ├── performance_model.pkl
│   │   ├── risk_model.pkl
│   │   ├── train_model.py
│   │   └── transfer_time_model.pkl
│   ├── services/
│   │   ├── digital_twin_service.py
│   │   ├── history_service.py
│   │   └── prediction_service.py
│   ├── export_test.csv
│   ├── main.py
│   └── requirements.txt
└── frontend/
	├── .env.example
	├── src/
	│   ├── components/
	│   ├── pages/
	│   ├── services/
	│   ├── App.jsx
	│   ├── index.css
	│   └── main.jsx
	├── index.html
	├── package-lock.json
	├── package.json
	└── vite.config.js
```

## Local Setup

Use two terminals from the repository root.

### Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The trained model files are included, so do not run the training script just to start the app. The backend API is available at `http://localhost:8000` and its health check is `http://localhost:8000/api/health`.

### Frontend

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The Vite development proxy forwards `/api` requests to the local backend. Leave `VITE_API_URL` empty for this setup.

## Environment Variables

The repository contains blank-only templates at `backend/.env.example` and `frontend/.env.example`. Copy each template to `.env` in the same directory and keep those local `.env` files out of Git.

| Variable | Location | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Backend | Optional MongoDB connection string. Leave blank to use in-memory history. |
| `FRONTEND_URL` | Backend | Optional allowed frontend origin; the backend has localhost defaults. |
| `VITE_API_URL` | Frontend | Optional API base URL; leave blank to use the Vite local proxy. |
| `VITE_ADMIN_USERNAME` / `VITE_ADMIN_PASSWORD` | Frontend | Optional local demo sign-in values. |
| `VITE_ANALYST_USERNAME` / `VITE_ANALYST_PASSWORD` | Frontend | Optional local demo sign-in values. |

The current sign-in is a client-side demo gate, not production authentication. Vite variables are included in the browser bundle. Use only non-sensitive local demo values; do not put real credentials, API keys, tokens, or database connection strings in frontend variables.

## Basic Usage

1. Start the backend and frontend using the commands above.
2. If using the demo login, set the local demo values in `frontend/.env` and restart Vite.
3. Open **Transfer Prediction** and select or drop a file. The app reads its name, type, and size locally, measures network conditions, and runs the existing ML prediction automatically.
4. Review the prediction and recommendations. Successful predictions appear in **Prediction History** and initialize the **Digital Transfer Twin** context.

The file contents are not sent by the prediction workflow. Network measurements are estimates from small backend responses and lightweight health requests.

## API Overview

- `GET /api/health`
- `GET /api/network-test`
- `GET /api/network-ping`
- `POST /api/predict`
- `GET /api/history`
- `GET /api/dashboard`
- `POST /api/digital-twin/simulate`
- `POST /api/digital-twin/scenarios`
- `POST /api/digital-twin/optimize`
