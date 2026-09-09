import pandas as pd
import numpy as np
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from services.csv_processor import _sessions

router = APIRouter(tags=["Forecast"])

class ForecastRequest(BaseModel):
    date_column: str
    value_column: str
    periods: int = 3

@router.post("/forecast")
async def generate_forecast(req: ForecastRequest, x_session_id: str = Header(..., alias="X-Session-ID")):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    conn = session["conn"]
    table_name = session["tables"][0]["name"]
    
    try:
        df = pd.read_sql(f"SELECT {req.date_column}, {req.value_column} FROM {table_name}", conn)
    except Exception:
        raise HTTPException(status_code=400, detail="Table or columns not found.")
        
    df = df.dropna()
    df = df.sort_values(by=req.date_column)
    
    if len(df) < 2:
        raise HTTPException(status_code=400, detail="Not enough data points to forecast.")
        
    y = df[req.value_column].values
    x = np.arange(len(y))
    
    m, b = np.polyfit(x, y, 1)
    
    y_pred = m * x + b
    residuals = y - y_pred
    rse = np.sqrt(np.sum(residuals**2) / (len(y) - 2)) if len(y) > 2 else 0
    
    ss_res = np.sum(residuals**2)
    ss_tot = np.sum((y - np.mean(y))**2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
    
    historical = [{"date": str(d), "value": float(v)} for d, v in zip(df[req.date_column], y)]
    
    forecast = []
    
    # Try to infer frequency or just append "Period + i"
    for i in range(1, req.periods + 1):
        idx = len(y) - 1 + i
        val = m * idx + b
        forecast.append({
            "date": f"Period +{i}",
            "value": float(val),
            "lower_bound": float(val - 1.5 * rse),
            "upper_bound": float(val + 1.5 * rse)
        })
        
    trend = "stable"
    if m > 0.01:
        trend = "increasing"
    elif m < -0.01:
        trend = "decreasing"
        
    return {
        "historical": historical,
        "forecast": forecast,
        "trend": trend,
        "r_squared": float(r_squared)
    }
