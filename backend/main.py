import csv
import io
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from services.history_service import (
    get_dashboard_summary,
    get_digital_twin_simulations,
    get_prediction_history,
    save_digital_twin_simulation,
    save_prediction,
)
from services.digital_twin_service import (
    build_scenarios,
    calculate_improvement,
    calculate_network_health,
    find_optimal_configuration,
    predict_twin_state,
)
from services.prediction_service import get_model_metrics, predict_transfer

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

app = FastAPI(
    title="Intelligent File Transfer Analytics API",
    description="ML-powered file transfer performance prediction and optimization system",
    version="1.0.0",
)

frontend_url = os.getenv("FRONTEND_URL", "")
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in frontend_url.split(",")
    if origin.strip()
]
if not allowed_origins:
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictionRequest(BaseModel):
    file_size_mb: float = Field(..., gt=0)
    bandwidth_mbps: float = Field(..., gt=0)
    latency_ms: float = Field(..., ge=0)
    packet_loss_percent: float = Field(..., ge=0, le=100)
    network_type: str = Field(..., min_length=2)
    number_of_files: int = Field(..., ge=1)
    cpu_usage_percent: float = Field(..., ge=0, le=100)
    memory_usage_percent: float = Field(..., ge=0, le=100)
    distance_km: float = Field(..., ge=0)
    file_name: str | None = None
    file_type: str | None = None
    file_mime_type: str | None = None
    file_size_bytes: int | None = Field(default=None, ge=0)
    model_fallback_inputs: list[str] = Field(default_factory=list)

    @field_validator("network_type")
    @classmethod
    def validate_network_type(cls, value: str) -> str:
        normalized = value.strip().title()
        valid_networks = {"Ethernet", "Wifi", "4g", "5g", "Unknown"}
        if normalized not in {"Ethernet", "Wifi", "4G", "5G", "Unknown"}:
            valid = ", ".join(sorted(valid_networks))
            raise ValueError(f"Network type must be one of: {valid}")
        if normalized == "Wifi":
            return "WiFi"
        if normalized == "4g":
            return "4G"
        if normalized == "5g":
            return "5G"
        return normalized


class DigitalTwinRequest(PredictionRequest):
    scenario_name: str | None = None
    current_conditions: PredictionRequest | None = None


def ensure_models_loaded() -> None:
    if not getattr(app.state, "models_loaded", False):
        raise HTTPException(status_code=503, detail="ML models are not available. Please train the models first.")


def twin_prediction_response(
    conditions: dict[str, Any],
    current_conditions: dict[str, Any],
    file_name: str | None,
) -> dict[str, Any]:
    ensure_models_loaded()
    try:
        prediction = predict_twin_state(conditions)
        current_prediction = predict_twin_state(current_conditions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Digital twin prediction failed: {exc}") from exc

    return {
        **prediction,
        "current_prediction": current_prediction,
        "improvement_percent": calculate_improvement(
            current_prediction["predicted_transfer_time_seconds"],
            prediction["predicted_transfer_time_seconds"],
        ),
        "file_name": file_name,
    }


@app.on_event("startup")
def startup_event() -> None:
    try:
        get_model_metrics()
    except Exception:
        app.state.models_loaded = False
        return
    app.state.models_loaded = True


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Intelligent File Transfer Analytics API is running."}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.get("/api/network-test")
def network_test() -> Response:
    payload_size = 128 * 1024
    return Response(
        content=b"\0" * payload_size,
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Network-Test-Payload-Bytes": str(payload_size),
        },
    )


@app.get("/api/network-ping")
def network_ping() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/predict")
def predict(payload: PredictionRequest) -> dict[str, Any]:
    if not getattr(app.state, "models_loaded", False):
        raise HTTPException(status_code=503, detail="ML models are not available. Please train the models first.")

    try:
        conditions = payload.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs"})
        prediction = predict_transfer({**conditions, "model_fallback_inputs": payload.model_fallback_inputs})
        prediction["network_health_score"] = calculate_network_health(conditions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc

    history_entry = {
        "file_name": payload.file_name,
        "file_type": payload.file_type,
        "file_mime_type": payload.file_mime_type,
        "file_size_bytes": payload.file_size_bytes,
        "model_fallback_inputs": payload.model_fallback_inputs,
        "file_size_mb": payload.file_size_mb,
        "bandwidth_mbps": payload.bandwidth_mbps,
        "latency_ms": payload.latency_ms,
        "packet_loss_percent": payload.packet_loss_percent,
        "network_type": payload.network_type,
        "number_of_files": payload.number_of_files,
        "cpu_usage_percent": payload.cpu_usage_percent,
        "memory_usage_percent": payload.memory_usage_percent,
        "distance_km": payload.distance_km,
        "predicted_transfer_time_seconds": prediction["predicted_transfer_time_seconds"],
        "predicted_transfer_time_minutes": prediction["predicted_transfer_time_minutes"],
        "performance_level": prediction["performance_level"],
        "transfer_risk": prediction["transfer_risk"],
        "recommendations": prediction["recommendations"],
    }
    save_prediction(history_entry)
    return prediction


@app.post("/api/digital-twin/simulate")
def simulate_digital_twin(payload: DigitalTwinRequest) -> dict[str, Any]:
    conditions = payload.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs", "scenario_name", "current_conditions"})
    current_conditions = (
        payload.current_conditions.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs"})
        if payload.current_conditions
        else conditions
    )
    return twin_prediction_response(conditions, current_conditions, payload.file_name)


@app.post("/api/digital-twin/scenarios")
def digital_twin_scenarios(payload: DigitalTwinRequest) -> dict[str, Any]:
    ensure_models_loaded()
    conditions = payload.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs", "scenario_name", "current_conditions"})
    current_conditions = (
        payload.current_conditions.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs"})
        if payload.current_conditions
        else conditions
    )
    try:
        current_prediction = predict_twin_state(current_conditions)
        scenarios = []
        for scenario in build_scenarios(conditions):
            prediction = predict_twin_state(scenario["conditions"])
            scenarios.append({
                **scenario,
                "prediction": prediction,
                "improvement_percent": calculate_improvement(
                    current_prediction["predicted_transfer_time_seconds"],
                    prediction["predicted_transfer_time_seconds"],
                ),
            })
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Scenario prediction failed: {exc}") from exc

    return {"current_prediction": current_prediction, "scenarios": scenarios}


@app.post("/api/digital-twin/optimize")
def optimize_digital_twin(payload: DigitalTwinRequest) -> dict[str, Any]:
    ensure_models_loaded()
    conditions = payload.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs", "scenario_name", "current_conditions"})
    current_conditions = (
        payload.current_conditions.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs"})
        if payload.current_conditions
        else conditions
    )
    try:
        current_prediction = predict_twin_state(current_conditions)
        best = find_optimal_configuration(conditions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Optimization failed: {exc}") from exc

    optimized_prediction = best["prediction"]
    return {
        "optimized_configuration": best["configuration"],
        **optimized_prediction,
        "current_prediction": current_prediction,
        "improvement_percent": calculate_improvement(
            current_prediction["predicted_transfer_time_seconds"],
            optimized_prediction["predicted_transfer_time_seconds"],
        ),
        "file_name": payload.file_name,
    }


@app.post("/api/digital-twin/save")
def save_digital_twin(payload: DigitalTwinRequest) -> dict[str, Any]:
    conditions = payload.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs", "scenario_name", "current_conditions"})
    current_conditions = (
        payload.current_conditions.model_dump(exclude={"file_name", "file_type", "file_mime_type", "file_size_bytes", "model_fallback_inputs"})
        if payload.current_conditions
        else conditions
    )
    result = twin_prediction_response(conditions, current_conditions, payload.file_name)
    record = {
        "file_name": payload.file_name,
        "scenario_name": payload.scenario_name,
        "file_size_mb": conditions["file_size_mb"],
        "current_network_conditions": current_conditions,
        "simulated_network_conditions": conditions,
        "current_prediction": result["current_prediction"],
        "simulated_prediction": {
            key: result[key]
            for key in (
                "predicted_transfer_time_seconds",
                "predicted_transfer_time_minutes",
                "performance_level",
                "transfer_risk",
                "network_health_score",
                "recommendations",
            )
        },
        "predicted_transfer_time_seconds": result["predicted_transfer_time_seconds"],
        "performance_level": result["performance_level"],
        "transfer_risk": result["transfer_risk"],
        "network_health_score": result["network_health_score"],
        "recommendations": result["recommendations"],
        "improvement_percent": result["improvement_percent"],
    }
    saved = save_digital_twin_simulation(record)
    return {"saved": True, "timestamp": saved["timestamp"], "simulation": result}


@app.get("/api/digital-twin/history")
def digital_twin_history() -> dict[str, Any]:
    records = get_digital_twin_simulations(limit=100)
    return {"records": records, "count": len(records)}


@app.get("/api/digital-twin/analytics")
def digital_twin_analytics() -> dict[str, Any]:
    records = get_digital_twin_simulations(limit=100)
    if not records:
        return {
            "simulation_count": 0,
            "average_improvement_percent": 0,
            "average_predicted_transfer_time_seconds": 0,
            "most_common_risk_level": "No data",
            "transfer_time_comparison": [],
            "scenario_comparison": [],
            "network_health_trend": [],
        }

    improvements = [float(item.get("improvement_percent", 0)) for item in records]
    transfer_times = [float(item.get("predicted_transfer_time_seconds", 0)) for item in records]
    risks = [str(item.get("transfer_risk", "Unknown")) for item in records]
    risk_counts = {risk: risks.count(risk) for risk in set(risks)}
    risk_mode = max(risk_counts, key=risk_counts.get)
    chart_records = list(reversed(records))

    return {
        "simulation_count": len(records),
        "average_improvement_percent": round(sum(improvements) / len(improvements), 2),
        "average_predicted_transfer_time_seconds": round(sum(transfer_times) / len(transfer_times), 2),
        "most_common_risk_level": risk_mode,
        "transfer_time_comparison": [
            {
                "name": item.get("scenario_name") or item.get("file_name") or f"Run {index + 1}",
                "current_seconds": item.get("current_prediction", {}).get("predicted_transfer_time_seconds", 0),
                "simulated_seconds": item.get("predicted_transfer_time_seconds", 0),
            }
            for index, item in enumerate(chart_records[-12:])
        ],
        "scenario_comparison": [
            {
                "name": item.get("scenario_name") or item.get("file_name") or f"Run {index + 1}",
                "transfer_seconds": item.get("predicted_transfer_time_seconds", 0),
                "risk": item.get("transfer_risk", "Unknown"),
            }
            for index, item in enumerate(chart_records[-12:])
        ],
        "network_health_trend": [
            {
                "name": item.get("timestamp", "")[11:16] or f"Run {index + 1}",
                "score": item.get("network_health_score", 0),
            }
            for index, item in enumerate(chart_records[-12:])
        ],
    }


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected.")

    content = await file.read()
    size_bytes = len(content)
    if size_bytes == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if size_bytes > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File size exceeds 10MB upload limit.")

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / (1024 * 1024), 4),
        "message": "File accepted and validated. No file was stored permanently.",
    }


@app.get("/api/history")
def history() -> dict[str, Any]:
    records = get_prediction_history(limit=30)
    return {"records": records, "count": len(records)}


@app.get("/api/metrics")
def metrics() -> dict[str, Any]:
    return get_model_metrics()


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    return get_dashboard_summary()


@app.get("/api/optimization")
def optimization() -> dict[str, Any]:
    records = get_prediction_history(limit=20)

    if not records:
        return {
            "overall_score": 100,
            "next_best_action": "Start by running a transfer test.",
            "recommendations": [
                "No transfer events recorded yet. Run a prediction to generate optimization insights.",
            ],
            "scenarios": [
                {"name": "Baseline", "summary": "The environment is empty but ready for benchmarking."},
            ],
            "risk_digest": "No active risk detected because there is no recent transfer history.",
        }

    average_latency = sum(float(item.get("latency_ms", 0)) for item in records) / len(records)
    average_packet_loss = sum(float(item.get("packet_loss_percent", 0)) for item in records) / len(records)
    average_bandwidth = sum(float(item.get("bandwidth_mbps", 0)) for item in records) / len(records)
    average_time = sum(float(item.get("predicted_transfer_time_seconds", 0)) for item in records) / len(records)
    high_risk = sum(1 for item in records if str(item.get("transfer_risk", "")).lower() == "high")

    score = max(
        0,
        min(
            100,
            100
            - (average_latency / 2.5)
            - (average_packet_loss * 2.2)
            - (max(0, average_time - 90) / 2.5)
            - (high_risk * 6),
        ),
    )
    rounded_score = int(round(score))

    recommendations = []
    if average_bandwidth < 30:
        recommendations.append("Upgrade to a stronger network link or prioritize 5G/Ethernet for large transfers.")
    if average_latency > 100:
        recommendations.append("Reduce latency by routing closer to your data source or placing transfer nodes nearer the destination.")
    if average_packet_loss > 5:
        recommendations.append("Stabilize packet loss by switching to lower-noise network paths and reducing concurrent transfers.")
    if average_time > 150:
        recommendations.append("Compress large payloads or split transfers into parallel streams to decrease transfer time.")
    if not recommendations:
        recommendations.append("Current transfer patterns are healthy; continue monitoring for sustained performance consistency.")

    next_best_action = recommendations[0]
    scenarios = [
        {
            "name": "Low-Latency Mode",
            "summary": "Prioritize direct routing and avoid background workloads during large file transfers.",
        },
        {
            "name": "High-Bandwidth Mode",
            "summary": "Shift large transfers to Ethernet or 5G when available to reduce completion time.",
        },
        {
            "name": "Compression Mode",
            "summary": "Apply file compression before upload to improve throughput and reduce failure risk.",
        },
    ]

    risk_digest = (
        "High-risk patterns are increasing."
        if high_risk > 0
        else "Transfer risk is within an acceptable range for the recent workload."
    )

    return {
        "overall_score": rounded_score,
        "next_best_action": next_best_action,
        "recommendations": recommendations,
        "scenarios": scenarios,
        "risk_digest": risk_digest,
    }


@app.get("/api/alerts")
def alerts() -> dict[str, Any]:
    records = get_prediction_history(limit=20)
    alert_list: list[dict[str, str]] = []

    if not records:
        return {
            "alerts": [
                {"title": "No activity", "severity": "info", "message": "No transfer activity detected yet. System is ready for benchmarking."}
            ]
        }

    average_latency = sum(float(item.get("latency_ms", 0)) for item in records) / len(records)
    average_packet_loss = sum(float(item.get("packet_loss_percent", 0)) for item in records) / len(records)
    high_risk_count = sum(1 for item in records if str(item.get("transfer_risk", "")).lower() == "high")

    if average_latency > 120:
        alert_list.append({
            "title": "Latency spike",
            "severity": "warning",
            "message": f"Average latency reached {average_latency:.1f} ms across recent transfers.",
        })
    if average_packet_loss > 10:
        alert_list.append({
            "title": "Packet loss risk",
            "severity": "critical",
            "message": f"Average packet loss reached {average_packet_loss:.1f}% and may impact throughput.",
        })
    if high_risk_count > 0:
        alert_list.append({
            "title": "High-risk queue",
            "severity": "warning",
            "message": f"{high_risk_count} transfer(s) were flagged as high risk and should be reviewed.",
        })
    if not alert_list:
        alert_list.append({
            "title": "Healthy run",
            "severity": "info",
            "message": "Recent transfers are operating within the expected performance envelope.",
        })

    return {"alerts": alert_list}


@app.get("/api/audit")
def audit() -> dict[str, Any]:
    records = get_prediction_history(limit=10)
    events = [
        {"time": datetime.utcnow().isoformat(timespec="seconds") + "Z", "actor": "system", "action": "startup", "result": "healthy"},
        {"time": datetime.utcnow().isoformat(timespec="seconds") + "Z", "actor": "admin", "action": "dashboard_opened", "result": "success"},
    ]

    for index, record in enumerate(records[:5], start=1):
        events.append({
            "time": record.get("timestamp", datetime.utcnow().isoformat(timespec="seconds") + "Z"),
            "actor": "model_engine",
            "action": f"prediction_{index}",
            "result": str(record.get("transfer_risk", "low")).lower(),
        })

    return {"events": events[:8]}


@app.get("/api/monitoring")
def monitoring() -> dict[str, Any]:
    records = get_prediction_history(limit=10)

    if not records:
        return {
            "live_metrics": [
                {"label": "Bandwidth", "value": 0, "unit": " Mbps", "status": "Idle"},
                {"label": "Latency", "value": 0, "unit": " ms", "status": "Idle"},
                {"label": "Throughput", "value": 0, "unit": " s", "status": "Idle"},
                {"label": "Risk Exposure", "value": 0, "unit": "%", "status": "Idle"},
            ],
            "alerts": ["No transfer activity detected yet."],
            "system_status": "Stable",
            "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        }

    average_latency = sum(float(item.get("latency_ms", 0)) for item in records) / len(records)
    average_bandwidth = sum(float(item.get("bandwidth_mbps", 0)) for item in records) / len(records)
    average_transfer_time = sum(float(item.get("predicted_transfer_time_seconds", 0)) for item in records) / len(records)
    risk_ratio = sum(1 for item in records if str(item.get("transfer_risk", "")).lower() == "high") / len(records) * 100

    alerts: list[str] = []
    if average_latency > 120:
        alerts.append("Latency is elevated beyond the recommended threshold for file-heavy transfers.")
    if risk_ratio > 35:
        alerts.append("High-risk transfer volume is increasing and may require optimization.")
    if average_transfer_time > 200:
        alerts.append("Throughput is trending slower than expected across recent transfers.")

    live_metrics = [
        {
            "label": "Bandwidth",
            "value": round(average_bandwidth, 1),
            "unit": " Mbps",
            "status": "Healthy" if average_bandwidth >= 50 else "Warning",
        },
        {
            "label": "Latency",
            "value": round(average_latency, 1),
            "unit": " ms",
            "status": "Healthy" if average_latency < 100 else "Warning",
        },
        {
            "label": "Throughput",
            "value": round(average_transfer_time, 1),
            "unit": " s",
            "status": "Healthy" if average_transfer_time < 120 else "Warning",
        },
        {
            "label": "Risk Exposure",
            "value": round(risk_ratio, 1),
            "unit": "%",
            "status": "Healthy" if risk_ratio < 30 else "Warning",
        },
    ]

    return {
        "live_metrics": live_metrics,
        "alerts": alerts if alerts else ["No critical alerts. System is operating within expected thresholds."],
        "system_status": "Warning" if alerts else "Stable",
        "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


@app.get("/api/export")
def export_history_csv() -> StreamingResponse:
    records = get_prediction_history(limit=200)
    fieldnames = [
        "timestamp",
        "file_size_mb",
        "bandwidth_mbps",
        "latency_ms",
        "packet_loss_percent",
        "network_type",
        "number_of_files",
        "cpu_usage_percent",
        "memory_usage_percent",
        "distance_km",
        "predicted_transfer_time_seconds",
        "predicted_transfer_time_minutes",
        "performance_level",
        "transfer_risk",
    ]

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()

    for record in records:
        writer.writerow({
            "timestamp": record.get("timestamp", ""),
            "file_size_mb": record.get("file_size_mb", ""),
            "bandwidth_mbps": record.get("bandwidth_mbps", ""),
            "latency_ms": record.get("latency_ms", ""),
            "packet_loss_percent": record.get("packet_loss_percent", ""),
            "network_type": record.get("network_type", ""),
            "number_of_files": record.get("number_of_files", ""),
            "cpu_usage_percent": record.get("cpu_usage_percent", ""),
            "memory_usage_percent": record.get("memory_usage_percent", ""),
            "distance_km": record.get("distance_km", ""),
            "predicted_transfer_time_seconds": record.get("predicted_transfer_time_seconds", ""),
            "predicted_transfer_time_minutes": record.get("predicted_transfer_time_minutes", ""),
            "performance_level": record.get("performance_level", ""),
            "transfer_risk": record.get("transfer_risk", ""),
        })

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="transfer_history.csv"'},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
    )
