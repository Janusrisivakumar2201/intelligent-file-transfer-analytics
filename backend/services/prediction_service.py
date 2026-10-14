import json
from pathlib import Path

import joblib
import pandas as pd

MODEL_DIR = Path(__file__).resolve().parent.parent / "ml"
MODEL_PATHS = {
    "transfer": MODEL_DIR / "transfer_time_model.pkl",
    "performance": MODEL_DIR / "performance_model.pkl",
    "risk": MODEL_DIR / "risk_model.pkl",
}
METRICS_PATH = MODEL_DIR / "model_metrics.json"
NETWORK_TYPE_MAP = {"Ethernet": 0, "WiFi": 1, "4G": 2, "5G": 3}
PERFORMANCE_LABELS = {0: "Excellent", 1: "Good", 2: "Moderate", 3: "Poor"}
RISK_LABELS = {0: "Low", 1: "Medium", 2: "High"}


def get_model_metrics() -> dict:
    if not METRICS_PATH.exists():
        raise FileNotFoundError("Model metrics are not available. Train the models first.")

    with METRICS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def _load_model(model_name: str):
    model_path = MODEL_PATHS[model_name]
    if not model_path.exists():
        raise FileNotFoundError(f"Model {model_path.name} was not found.")
    return joblib.load(model_path)


def _prepare_input(payload: dict) -> pd.DataFrame:
    network_type = str(payload.get("network_type", "WiFi")).strip().title()
    if network_type == "Wifi":
        network_type = "WiFi"
    if network_type == "Unknown":
        network_type = "WiFi"
    if network_type not in NETWORK_TYPE_MAP:
        raise ValueError("Unsupported network type. Use Ethernet, WiFi, 4G, or 5G.")

    record = {
        "file_size_mb": float(payload["file_size_mb"]),
        "bandwidth_mbps": float(payload["bandwidth_mbps"]),
        "latency_ms": float(payload["latency_ms"]),
        "packet_loss_percent": float(payload["packet_loss_percent"]),
        "network_type": NETWORK_TYPE_MAP[network_type],
        "number_of_files": int(payload["number_of_files"]),
        "cpu_usage_percent": float(payload["cpu_usage_percent"]),
        "memory_usage_percent": float(payload["memory_usage_percent"]),
        "distance_km": float(payload["distance_km"]),
    }
    return pd.DataFrame([record])


def generate_recommendations(payload: dict) -> list[str]:
    recommendations: list[str] = []
    fallback_inputs = set(payload.get("model_fallback_inputs", []))

    if float(payload.get("bandwidth_mbps", 0)) < 30:
        recommendations.append("Consider using a higher-bandwidth network.")
    if float(payload.get("latency_ms", 0)) > 120:
        recommendations.append("High latency detected. A closer or more stable network may improve transfer performance.")
    if float(payload.get("packet_loss_percent", 0)) > 10:
        recommendations.append("High packet loss detected. Consider switching to a more stable connection.")
    if float(payload.get("file_size_mb", 0)) > 800:
        recommendations.append("Consider compressing the file before transfer.")
    if "cpu_usage_percent" not in fallback_inputs and float(payload.get("cpu_usage_percent", 0)) > 75:
        recommendations.append("High CPU usage may affect transfer performance.")
    if "memory_usage_percent" not in fallback_inputs and float(payload.get("memory_usage_percent", 0)) > 75:
        recommendations.append("Reduce unnecessary background applications.")
    if "distance_km" not in fallback_inputs and float(payload.get("distance_km", 0)) > 500:
        recommendations.append("Distance is high. Use a local-edge or nearby transfer endpoint for better speed.")

    if not recommendations:
        recommendations.append("Current configuration is in a healthy range. Continue monitoring to maintain stable transfer performance.")

    return recommendations[:5]


def predict_transfer(payload: dict) -> dict:
    transfer_model = _load_model("transfer")
    performance_model = _load_model("performance")
    risk_model = _load_model("risk")

    features = _prepare_input(payload)
    transfer_time = float(transfer_model.predict(features)[0])
    performance_value = int(performance_model.predict(features)[0])
    risk_value = int(risk_model.predict(features)[0])

    predicted_time = max(transfer_time, 0.0)
    prediction = {
        "predicted_transfer_time_seconds": round(predicted_time, 2),
        "predicted_transfer_time_minutes": round(predicted_time / 60, 2),
        "performance_level": PERFORMANCE_LABELS.get(performance_value, "Moderate"),
        "transfer_risk": RISK_LABELS.get(risk_value, "Medium"),
        "recommendations": generate_recommendations(payload),
    }
    return prediction
