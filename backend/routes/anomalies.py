import pandas as pd
from fastapi import APIRouter, Header, HTTPException
from services.csv_processor import _sessions

router = APIRouter(tags=["Anomalies"])

@router.post("/anomalies")
async def get_anomalies(x_session_id: str = Header(..., alias="X-Session-ID")):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    conn = session["conn"]
    table_name = session["tables"][0]["name"]
    
    try:
        df = pd.read_sql(f"SELECT * FROM {table_name}", conn)
    except Exception:
        raise HTTPException(status_code=400, detail="Table not found.")

    anomalies = []
    
    # 1. Duplicate rows
    dupes = df[df.duplicated(keep=False)]
    for idx, row in dupes.iterrows():
        anomalies.append({
            "type": "duplicate_row",
            "column": None,
            "row_index": int(idx),
            "value": None,
            "description": f"Row {idx} is a duplicate.",
            "severity": "medium"
        })

    # 2. All-zero numeric rows
    numeric_df = df.select_dtypes(include='number')
    if not numeric_df.empty:
        zero_rows = numeric_df[(numeric_df == 0).all(axis=1)]
        for idx, row in zero_rows.iterrows():
            anomalies.append({
                "type": "all_zero_row",
                "column": None,
                "row_index": int(idx),
                "value": 0,
                "description": f"Row {idx} has all zero values for numeric columns.",
                "severity": "medium"
            })

    # 3. Z-score anomalies
    for col in numeric_df.columns:
        mean = numeric_df[col].mean()
        std = numeric_df[col].std()
        if pd.notna(std) and std > 0:
            z_scores = ((numeric_df[col] - mean) / std).abs()
            outliers = df[z_scores > 3]
            for idx, row in outliers.iterrows():
                val = row[col]
                z = z_scores[idx]
                anomalies.append({
                    "type": "outlier",
                    "column": col,
                    "row_index": int(idx),
                    "value": float(val) if pd.notna(val) else None,
                    "description": f"Value {val:.2f} in '{col}' is {z:.1f} standard deviations from mean.",
                    "severity": "high" if z > 4 else "medium"
                })

    return {
        "anomalies": anomalies,
        "total_count": len(anomalies)
    }
