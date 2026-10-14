import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = ROOT / "dataset"
DATASET_PATH = DATASET_DIR / "file_transfer_dataset.csv"
MODEL_DIR = ROOT / "ml"
METRICS_PATH = MODEL_DIR / "model_metrics.json"

FEATURE_COLUMNS = [
    "file_size_mb",
    "bandwidth_mbps",
    "latency_ms",
    "packet_loss_percent",
    "network_type",
    "number_of_files",
    "cpu_usage_percent",
    "memory_usage_percent",
    "distance_km",
]

NETWORK_MAP = {"Ethernet": 0, "WiFi": 1, "4G": 2, "5G": 3}
PERFORMANCE_MAP = {"Excellent": 0, "Good": 1, "Moderate": 2, "Poor": 3}
RISK_MAP = {"Low": 0, "Medium": 1, "High": 2}


def generate_dataset() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    rows = []
    network_types = ["Ethernet", "WiFi", "4G", "5G"]
    network_weights = [0.2, 0.35, 0.25, 0.2]

    for _ in range(700):
        file_size_mb = float(rng.uniform(5, 1800))
        bandwidth_mbps = float(rng.choice([10, 20, 50, 75, 100, 150, 200, 500], p=[0.10, 0.15, 0.18, 0.15, 0.20, 0.12, 0.06, 0.04]))
        latency_ms = float(rng.uniform(5, 220))
        packet_loss_percent = float(rng.uniform(0.1, 18))
        network_type = str(rng.choice(network_types, p=network_weights))
        number_of_files = int(rng.integers(1, 20))
        cpu_usage_percent = float(rng.uniform(10, 90))
        memory_usage_percent = float(rng.uniform(15, 95))
        distance_km = float(rng.uniform(1, 1800))

        network_factor = {"Ethernet": 0.75, "WiFi": 1.0, "4G": 1.45, "5G": 0.9}[network_type]
        transfer_time = (
            (file_size_mb / max(bandwidth_mbps, 1)) * 9.5 * network_factor
            + latency_ms * 0.22
            + packet_loss_percent * 2.1
            + (cpu_usage_percent / 100) * 28
            + (memory_usage_percent / 100) * 18
            + (distance_km / 100) * 3.2
            + number_of_files * 4.2
            + rng.normal(0, 4)
        )
        transfer_time = max(8.0, float(transfer_time))

        if transfer_time <= 35:
            performance_level = "Excellent"
        elif transfer_time <= 90:
            performance_level = "Good"
        elif transfer_time <= 180:
            performance_level = "Moderate"
        else:
            performance_level = "Poor"

        if packet_loss_percent > 12 or latency_ms > 180 or bandwidth_mbps < 25 or cpu_usage_percent > 82:
            transfer_risk = "High"
        elif packet_loss_percent > 4 or latency_ms > 110 or bandwidth_mbps < 60:
            transfer_risk = "Medium"
        else:
            transfer_risk = "Low"

        rows.append(
            {
                "file_size_mb": round(file_size_mb, 2),
                "bandwidth_mbps": round(bandwidth_mbps, 2),
                "latency_ms": round(latency_ms, 2),
                "packet_loss_percent": round(packet_loss_percent, 2),
                "network_type": network_type,
                "number_of_files": number_of_files,
                "cpu_usage_percent": round(cpu_usage_percent, 2),
                "memory_usage_percent": round(memory_usage_percent, 2),
                "distance_km": round(distance_km, 2),
                "transfer_time_seconds": round(transfer_time, 2),
                "performance_level": performance_level,
                "transfer_risk": transfer_risk,
            }
        )

    df = pd.DataFrame(rows)
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(DATASET_PATH, index=False)
    return df


def train_models() -> dict:
    if not DATASET_PATH.exists():
        df = generate_dataset()
    else:
        df = pd.read_csv(DATASET_PATH)

    df["network_type"] = df["network_type"].map(NETWORK_MAP)
    df["performance_level"] = df["performance_level"].map(PERFORMANCE_MAP)
    df["transfer_risk"] = df["transfer_risk"].map(RISK_MAP)

    X = df[FEATURE_COLUMNS]
    y_time = df["transfer_time_seconds"]
    y_performance = df["performance_level"]
    y_risk = df["transfer_risk"]

    X_train, X_test, y_train, y_test = train_test_split(X, y_time, test_size=0.2, random_state=42)
    model_time = RandomForestRegressor(n_estimators=300, random_state=42, max_depth=15)
    model_time.fit(X_train, y_train)
    time_pred = model_time.predict(X_test)
    mae = mean_absolute_error(y_test, time_pred)
    rmse = np.sqrt(mean_squared_error(y_test, time_pred))
    r2 = r2_score(y_test, time_pred)

    performance_model = RandomForestClassifier(n_estimators=300, random_state=42, max_depth=12)
    performance_model.fit(X, y_performance)
    perf_pred = performance_model.predict(X)
    perf_accuracy = accuracy_score(y_performance, perf_pred)

    risk_model = RandomForestClassifier(n_estimators=300, random_state=42, max_depth=12)
    risk_model.fit(X, y_risk)
    risk_pred = risk_model.predict(X)
    risk_accuracy = accuracy_score(y_risk, risk_pred)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_time, MODEL_DIR / "transfer_time_model.pkl")
    joblib.dump(performance_model, MODEL_DIR / "performance_model.pkl")
    joblib.dump(risk_model, MODEL_DIR / "risk_model.pkl")

    metrics = {
        "regression": {
            "mae": round(float(mae), 4),
            "rmse": round(float(rmse), 4),
            "r2": round(float(r2), 4),
            "model": "RandomForestRegressor",
        },
        "performance_classifier": {
            "accuracy": round(float(perf_accuracy), 4),
            "model": "RandomForestClassifier",
            "classes": ["Excellent", "Good", "Moderate", "Poor"],
        },
        "risk_classifier": {
            "accuracy": round(float(risk_accuracy), 4),
            "model": "RandomForestClassifier",
            "classes": ["Low", "Medium", "High"],
        },
    }

    with METRICS_PATH.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)

    return metrics


if __name__ == "__main__":
    metrics = train_models()
    print("Model training complete.")
    print(json.dumps(metrics, indent=2))
