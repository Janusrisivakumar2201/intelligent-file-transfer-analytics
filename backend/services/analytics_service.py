from __future__ import annotations

import math
import statistics
from typing import Any


NUMERIC_FIELDS = {
    "file_size_mb": ("File Size (MB)", "MB"),
    "bandwidth_mbps": ("Bandwidth", "Mbps"),
    "latency_ms": ("Latency", "ms"),
    "packet_loss_percent": ("Packet Loss", "%"),
    "number_of_files": ("Number of Files", "files"),
    "cpu_usage_percent": ("CPU Usage", "%"),
    "memory_usage_percent": ("Memory Usage", "%"),
    "distance_km": ("Distance", "km"),
}
PREDICTED_TIME_KEYS = ("predicted_transfer_time_seconds", "predicted_time_seconds")
ACTUAL_TIME_KEYS = (
    "actual_transfer_time_seconds",
    "actual_transfer_time",
    "transfer_time_seconds",
)
CORRELATION_FEATURES = ("file_size_mb", "bandwidth_mbps", "latency_ms", "packet_loss_percent")
HEATMAP_FEATURES = (*NUMERIC_FIELDS, "transfer_time_seconds")


def _finite_number(record: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = record.get(key)
        if value is None or isinstance(value, bool):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            return number
    return None


def _statistics(values: list[float]) -> dict[str, float | int] | None:
    if not values:
        return None
    return {
        "count": len(values),
        "mean": statistics.fmean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "standard_deviation": statistics.stdev(values) if len(values) > 1 else 0.0,
    }


def _pearson(x_values: list[float], y_values: list[float]) -> float | None:
    if len(x_values) < 2 or len(x_values) != len(y_values):
        return None
    x_mean = statistics.fmean(x_values)
    y_mean = statistics.fmean(y_values)
    x_deviations = [value - x_mean for value in x_values]
    y_deviations = [value - y_mean for value in y_values]
    x_sum_squares = sum(value * value for value in x_deviations)
    y_sum_squares = sum(value * value for value in y_deviations)
    if x_sum_squares == 0 or y_sum_squares == 0:
        return None
    coefficient = sum(x * y for x, y in zip(x_deviations, y_deviations)) / math.sqrt(
        x_sum_squares * y_sum_squares
    )
    return max(-1.0, min(1.0, coefficient))


def _correlation_description(coefficient: float | None) -> tuple[str, str]:
    if coefficient is None:
        return "Insufficient data", "More valid, varying records are required for correlation analysis."
    magnitude = abs(coefficient)
    if magnitude < 0.3:
        return "Weak relationship", "There is a weak linear relationship."
    strength = "Moderate" if magnitude < 0.7 else "Strong"
    direction = "positive" if coefficient > 0 else "negative"
    return f"{strength} {direction} relationship", f"There is a {strength.lower()} {direction} relationship."


def _model_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    pairs = []
    for record in records:
        actual = _finite_number(record, ACTUAL_TIME_KEYS)
        predicted = _finite_number(record, PREDICTED_TIME_KEYS)
        if actual is not None and predicted is not None:
            pairs.append((actual, predicted))

    if not pairs:
        return {"count": 0, "mae": None, "rmse": None, "r2": None}

    actual_values = [actual for actual, _ in pairs]
    errors = [actual - predicted for actual, predicted in pairs]
    mae = statistics.fmean(abs(error) for error in errors)
    rmse = math.sqrt(statistics.fmean(error * error for error in errors))
    total_sum_squares = sum((actual - statistics.fmean(actual_values)) ** 2 for actual in actual_values)
    r2 = None if total_sum_squares == 0 else 1 - sum(error * error for error in errors) / total_sum_squares
    return {"count": len(pairs), "mae": mae, "rmse": rmse, "r2": r2}


def calculate_transfer_analytics(records: list[dict[str, Any]]) -> dict[str, Any]:
    actual_records = [
        record for record in records if _finite_number(record, ACTUAL_TIME_KEYS) is not None
    ]
    use_actual = bool(actual_records)
    target_records = actual_records if use_actual else [
        record for record in records if _finite_number(record, PREDICTED_TIME_KEYS) is not None
    ]
    target_key = ACTUAL_TIME_KEYS if use_actual else PREDICTED_TIME_KEYS
    target_name = "Actual transfer time" if use_actual else "ML-predicted transfer time"

    normalized_records = []
    for index, record in enumerate(records):
        row: dict[str, Any] = {
            "id": str(record.get("timestamp") or f"record-{index + 1}"),
            "timestamp": record.get("timestamp"),
            "file_name": record.get("file_name"),
            "network_type": record.get("network_type"),
            "performance_level": record.get("performance_level"),
            "transfer_risk": record.get("transfer_risk"),
        }
        for field in NUMERIC_FIELDS:
            row[field] = _finite_number(record, (field,))
        predicted = _finite_number(record, PREDICTED_TIME_KEYS)
        actual = _finite_number(record, ACTUAL_TIME_KEYS)
        row["predicted_transfer_time_seconds"] = predicted
        row["actual_transfer_time_seconds"] = actual
        row["baseline_transfer_time_seconds"] = None
        file_size = row["file_size_mb"]
        bandwidth = row["bandwidth_mbps"]
        if file_size is not None and bandwidth is not None and bandwidth > 0:
            row["baseline_transfer_time_seconds"] = 8 * file_size / bandwidth
        selected_time = _finite_number(record, target_key)
        row["transfer_time_seconds"] = selected_time
        normalized_records.append(row)

    target_times = [
        value for record in target_records if (value := _finite_number(record, target_key)) is not None
    ]
    feature_stats: dict[str, dict[str, Any]] = {}
    for field, (label, unit) in NUMERIC_FIELDS.items():
        values = [
            value for record in records if (value := _finite_number(record, (field,))) is not None
        ]
        summary = _statistics(values)
        if summary is not None:
            feature_stats[field] = {"label": label, "unit": unit, **summary}

    predicted_values = [
        value for record in records if (value := _finite_number(record, PREDICTED_TIME_KEYS)) is not None
    ]
    actual_values = [
        value for record in records if (value := _finite_number(record, ACTUAL_TIME_KEYS)) is not None
    ]
    feature_stats["predicted_transfer_time_seconds"] = {
        "label": "ML Predicted Transfer Time",
        "unit": "sec",
        **(_statistics(predicted_values) or {}),
    } if predicted_values else None
    feature_stats["actual_transfer_time_seconds"] = {
        "label": "Actual Transfer Time",
        "unit": "sec",
        **(_statistics(actual_values) or {}),
    } if actual_values else None
    feature_stats = {key: value for key, value in feature_stats.items() if value is not None}
    feature_stats["transfer_time_seconds"] = {
        "label": target_name,
        "unit": "sec",
        **(_statistics(target_times) or {}),
    } if target_times else None

    time_mean = statistics.fmean(target_times) if target_times else None
    time_std = statistics.stdev(target_times) if len(target_times) > 1 else 0.0
    outlier_records = []
    normal_count = 0
    for index, record in enumerate(target_records):
        transfer_time = _finite_number(record, target_key)
        if transfer_time is None:
            continue
        if time_std > 0 and abs((transfer_time - time_mean) / time_std) > 3:
            outlier_records.append({
                "id": str(record.get("timestamp") or f"record-{index + 1}"),
                "timestamp": record.get("timestamp"),
                "file_name": record.get("file_name"),
                "transfer_time_seconds": transfer_time,
                "z_score": (transfer_time - time_mean) / time_std,
            })
        elif time_std > 0:
            normal_count += 1

    correlations = {}
    for field in CORRELATION_FEATURES:
        x_values = []
        y_values = []
        for record in target_records:
            x = _finite_number(record, (field,))
            y = _finite_number(record, target_key)
            if x is not None and y is not None:
                x_values.append(x)
                y_values.append(y)
        coefficient = _pearson(x_values, y_values)
        interpretation, explanation = _correlation_description(coefficient)
        correlations[field] = {
            "label": NUMERIC_FIELDS[field][0],
            "coefficient": coefficient,
            "count": len(x_values),
            "interpretation": interpretation,
            "explanation": explanation,
        }

    heatmap = []
    for y_field in HEATMAP_FEATURES:
        if y_field == "transfer_time_seconds":
            y_accessor = lambda record: _finite_number(record, target_key)
            y_label = target_name
        else:
            y_accessor = lambda record, field=y_field: _finite_number(record, (field,))
            y_label = NUMERIC_FIELDS[y_field][0]
        cells = []
        for x_field in HEATMAP_FEATURES:
            if x_field == "transfer_time_seconds":
                x_accessor = lambda record: _finite_number(record, target_key)
                x_label = target_name
            else:
                x_accessor = lambda record, field=x_field: _finite_number(record, (field,))
                x_label = NUMERIC_FIELDS[x_field][0]
            pairs = [
                (x, y)
                for record in records
                if (x := x_accessor(record)) is not None and (y := y_accessor(record)) is not None
            ]
            coefficient = _pearson([pair[0] for pair in pairs], [pair[1] for pair in pairs])
            cells.append({"feature": x_field, "label": x_label, "value": coefficient})
        heatmap.append({"feature": y_field, "label": y_label, "values": cells})

    paired_predictions = [
        {
            "id": row["id"],
            "name": row["file_name"] or row["timestamp"] or row["id"],
            "actual": row["actual_transfer_time_seconds"],
            "predicted": row["predicted_transfer_time_seconds"],
        }
        for row in normalized_records
        if row["actual_transfer_time_seconds"] is not None
        and row["predicted_transfer_time_seconds"] is not None
    ]

    summary = []
    for field, result in correlations.items():
        coefficient = result["coefficient"]
        if coefficient is not None and abs(coefficient) >= 0.3:
            summary.append(f'{result["label"]} has a {result["interpretation"].lower()} with {target_name.lower()}.')
    if target_times:
        summary.append(
            f"{len(outlier_records)} unusual transfer-time record(s) detected using the |Z| > 3 threshold."
        )
    model_metrics = _model_metrics(records)
    if model_metrics["r2"] is not None:
        summary.append(f'The ML model achieved an R² score of {model_metrics["r2"]:.2f}.')
    elif model_metrics["count"] == 0:
        summary.append("ML evaluation metrics require records containing both actual and predicted transfer times.")

    return {
        "record_count": len(records),
        "time_target": "actual" if use_actual else "predicted",
        "time_target_label": target_name,
        "feature_statistics": feature_stats,
        "baseline_formula": "(8 × File Size in MB) / Bandwidth in Mbps",
        "correlations": correlations,
        "correlation_message": (
            "More prediction records are required for correlation analysis."
            if len(target_records) < 2
            else None
        ),
        "outliers": {
            "threshold": 3,
            "count": len(outlier_records),
            "records": outlier_records,
            "normal_count": normal_count,
            "message": (
                "More records with non-zero variation are required for outlier detection."
                if len(target_times) < 2 or time_std == 0
                else None
            ),
        },
        "model_metrics": model_metrics,
        "paired_predictions": paired_predictions,
        "records": normalized_records,
        "correlation_heatmap": heatmap,
        "summary": summary,
    }
