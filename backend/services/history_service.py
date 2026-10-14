import os
from datetime import datetime
from typing import Any

from pymongo import MongoClient

_IN_MEMORY_HISTORY: list[dict[str, Any]] = []
_IN_MEMORY_DIGITAL_TWIN: list[dict[str, Any]] = []
_MONGO_CLIENT = None


def get_mongo_client():
    global _MONGO_CLIENT
    if _MONGO_CLIENT is not None:
        return _MONGO_CLIENT

    uri = os.getenv("MONGODB_URI")
    if not uri:
        return None

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        client.admin.command("ping")
        _MONGO_CLIENT = client
        return client
    except Exception:
        _MONGO_CLIENT = None
        return None


def save_prediction(record: dict[str, Any]) -> dict[str, Any]:
    entry = {
        **record,
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }

    client = get_mongo_client()
    if client is not None:
        try:
            db = client["transfer_analytics"]
            collection = db["transfer_predictions"]
            collection.insert_one(entry)
            return entry
        except Exception:
            pass

    _IN_MEMORY_HISTORY.append(entry)
    if len(_IN_MEMORY_HISTORY) > 200:
        _IN_MEMORY_HISTORY.pop(0)
    return entry


def get_prediction_history(limit: int = 30) -> list[dict[str, Any]]:
    client = get_mongo_client()
    if client is not None:
        try:
            db = client["transfer_analytics"]
            collection = db["transfer_predictions"]
            records = list(collection.find().sort("timestamp", -1).limit(limit))
            for item in records:
                item.pop("_id", None)
            return records
        except Exception:
            pass

    return list(reversed(_IN_MEMORY_HISTORY[-limit:]))


def save_digital_twin_simulation(record: dict[str, Any]) -> dict[str, Any]:
    entry = {
        **record,
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }

    client = get_mongo_client()
    if client is not None:
        try:
            collection = client["transfer_analytics"]["digital_twin_simulations"]
            collection.insert_one(entry)
            return entry
        except Exception:
            pass

    _IN_MEMORY_DIGITAL_TWIN.append(entry)
    if len(_IN_MEMORY_DIGITAL_TWIN) > 500:
        _IN_MEMORY_DIGITAL_TWIN.pop(0)
    return entry


def get_digital_twin_simulations(limit: int = 100) -> list[dict[str, Any]]:
    client = get_mongo_client()
    if client is not None:
        try:
            collection = client["transfer_analytics"]["digital_twin_simulations"]
            records = list(collection.find().sort("timestamp", -1).limit(limit))
            for item in records:
                item.pop("_id", None)
            return records
        except Exception:
            pass

    return list(reversed(_IN_MEMORY_DIGITAL_TWIN[-limit:]))


def get_dashboard_summary() -> dict[str, Any]:
    records = get_prediction_history(limit=50)
    if not records:
        return {
            "total_predictions": 0,
            "average_predicted_time_seconds": 0,
            "accuracy": 0,
            "high_risk_transfers": 0,
            "recent_predictions": [],
            "optimization_score": 100,
            "ai_recommendations": [
                "No transfer activity detected yet. Start a prediction to generate optimization insights.",
            ],
        }

    total_predictions = len(records)
    average_time = sum(float(item["predicted_transfer_time_seconds"]) for item in records) / total_predictions
    high_risk_transfers = sum(1 for item in records if str(item.get("transfer_risk", "")).lower() == "high")
    average_latency = sum(float(item.get("latency_ms", 0)) for item in records) / total_predictions
    average_packet_loss = sum(float(item.get("packet_loss_percent", 0)) for item in records) / total_predictions
    average_bandwidth = sum(float(item.get("bandwidth_mbps", 0)) for item in records) / total_predictions

    optimization_score = max(
        0,
        min(
            100,
            100 - (average_latency / 2.5) - (average_packet_loss * 2.2) - (max(0, average_time - 90) / 2.5),
        ),
    )

    recommendations = []
    if average_bandwidth < 30:
        recommendations.append("Use a higher-bandwidth connection for large transfers.")
    if average_latency > 100:
        recommendations.append("Reduce latency by moving workloads closer to the target endpoint.")
    if average_packet_loss > 5:
        recommendations.append("Packet loss is high—switch to more stable routes or reduce concurrency.")
    if average_time > 150:
        recommendations.append("Compress files or split large transfers into smaller payloads.")
    if not recommendations:
        recommendations.append("System health is stable and the transfer pattern is within expected ranges.")

    try:
        from services.prediction_service import get_model_metrics

        metrics = get_model_metrics()
        accuracy = metrics.get("performance_classifier", {}).get("accuracy", 0)
    except Exception:
        accuracy = 0

    return {
        "total_predictions": total_predictions,
        "average_predicted_time_seconds": round(average_time, 2),
        "accuracy": round(float(accuracy), 4),
        "high_risk_transfers": high_risk_transfers,
        "recent_predictions": records[:6],
        "optimization_score": int(round(optimization_score)),
        "ai_recommendations": recommendations,
    }
