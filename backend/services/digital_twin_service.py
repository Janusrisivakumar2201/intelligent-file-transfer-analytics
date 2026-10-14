from copy import deepcopy
from typing import Any

from services.prediction_service import predict_transfer


RISK_ORDER = {"Low": 0, "Medium": 1, "High": 2}
PERFORMANCE_ORDER = {"Excellent": 0, "Good": 1, "Moderate": 2, "Poor": 3}


def calculate_network_health(conditions: dict[str, Any]) -> int:
    bandwidth_score = min(max(float(conditions["bandwidth_mbps"]), 0) / 100, 1) * 100
    latency_score = (1 - min(max(float(conditions["latency_ms"]), 0) / 200, 1)) * 100
    packet_loss_score = (1 - min(max(float(conditions["packet_loss_percent"]), 0) / 10, 1)) * 100
    cpu_score = 100 - float(conditions["cpu_usage_percent"])
    memory_score = 100 - float(conditions["memory_usage_percent"])

    score = (
        bandwidth_score * 0.25
        + latency_score * 0.20
        + packet_loss_score * 0.20
        + cpu_score * 0.175
        + memory_score * 0.175
    )
    return int(round(max(0, min(100, score))))


def predict_twin_state(conditions: dict[str, Any]) -> dict[str, Any]:
    prediction = predict_transfer(conditions)
    return {
        **prediction,
        "network_health_score": calculate_network_health(conditions),
    }


def calculate_improvement(current_seconds: float, simulated_seconds: float) -> float:
    if current_seconds <= 0:
        return 0.0
    return round((current_seconds - simulated_seconds) / current_seconds * 100, 2)


def build_scenarios(current: dict[str, Any]) -> list[dict[str, Any]]:
    optimized = deepcopy(current)
    optimized.update(
        bandwidth_mbps=min(float(current["bandwidth_mbps"]) * 1.5, 1000),
        latency_ms=max(float(current["latency_ms"]) * 0.5, 1),
        packet_loss_percent=max(float(current["packet_loss_percent"]) * 0.5, 0),
        cpu_usage_percent=max(float(current["cpu_usage_percent"]) - 15, 5),
        memory_usage_percent=max(float(current["memory_usage_percent"]) - 15, 5),
    )

    poor = deepcopy(current)
    poor.update(
        bandwidth_mbps=max(float(current["bandwidth_mbps"]) * 0.4, 1),
        latency_ms=min(float(current["latency_ms"]) * 2, 500),
        packet_loss_percent=min(float(current["packet_loss_percent"]) * 2.5, 100),
        cpu_usage_percent=min(float(current["cpu_usage_percent"]) + 25, 100),
        memory_usage_percent=min(float(current["memory_usage_percent"]) + 20, 100),
    )

    return [
        {"name": "Current Network", "conditions": deepcopy(current)},
        {"name": "Optimized Network", "conditions": optimized},
        {"name": "Poor Network", "conditions": poor},
    ]


def find_optimal_configuration(current: dict[str, Any]) -> dict[str, Any]:
    candidate_profiles = [
        (1.15, 0.8, 0.75, 8, 8),
        (1.35, 0.65, 0.5, 12, 12),
        (1.6, 0.5, 0.35, 18, 16),
        (2.0, 0.35, 0.2, 25, 22),
        (2.5, 0.25, 0.1, 30, 28),
    ]
    candidates = [deepcopy(current)]

    for bandwidth_factor, latency_factor, loss_factor, cpu_reduction, memory_reduction in candidate_profiles:
        candidate = deepcopy(current)
        candidate.update(
            bandwidth_mbps=min(float(current["bandwidth_mbps"]) * bandwidth_factor, 1000),
            latency_ms=max(float(current["latency_ms"]) * latency_factor, 1),
            packet_loss_percent=max(float(current["packet_loss_percent"]) * loss_factor, 0),
            cpu_usage_percent=max(float(current["cpu_usage_percent"]) - cpu_reduction, 5),
            memory_usage_percent=max(float(current["memory_usage_percent"]) - memory_reduction, 5),
        )
        candidates.append(candidate)

    evaluated = [
        {"configuration": candidate, "prediction": predict_twin_state(candidate)}
        for candidate in candidates
    ]
    low_risk = [item for item in evaluated if item["prediction"]["transfer_risk"] == "Low"]
    eligible = low_risk or evaluated

    if not low_risk:
        lowest_risk = min(RISK_ORDER[item["prediction"]["transfer_risk"]] for item in eligible)
        eligible = [
            item for item in eligible
            if RISK_ORDER[item["prediction"]["transfer_risk"]] == lowest_risk
        ]

    return min(
        eligible,
        key=lambda item: (
            item["prediction"]["predicted_transfer_time_seconds"],
            PERFORMANCE_ORDER.get(item["prediction"]["performance_level"], 2),
        ),
    )