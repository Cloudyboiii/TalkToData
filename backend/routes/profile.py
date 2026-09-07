import pandas as pd
import numpy as np
from fastapi import APIRouter, Header, HTTPException

from services.csv_processor import _sessions

router = APIRouter()

@router.get("/profile/{table_name}/{column_name}")
async def profile_column(
    table_name: str, 
    column_name: str, 
    x_session_id: str = Header(..., alias="X-Session-ID")
):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    conn = session["conn"]
    
    try:
        df = pd.read_sql(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Table {table_name} not found.")

    if column_name not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column {column_name} not found in table.")

    col_data = df[column_name]
    
    # Base stats
    count = len(col_data)
    null_count = int(col_data.isnull().sum())
    null_percent = null_count / count if count > 0 else 0
    unique_count = int(col_data.nunique())
    
    # Most common
    val_counts = col_data.value_counts().head(5)
    most_common = [{"value": str(k), "count": int(v)} for k, v in val_counts.items()]

    is_num = pd.api.types.is_numeric_dtype(col_data)
    
    profile = {
        "column_name": column_name,
        "type": "numeric" if is_num else "text",
        "count": count,
        "null_count": null_count,
        "null_percent": null_percent,
        "unique_count": unique_count,
        "most_common": most_common
    }

    if is_num:
        # Numeric stats
        profile["min"] = float(col_data.min()) if pd.notnull(col_data.min()) else None
        profile["max"] = float(col_data.max()) if pd.notnull(col_data.max()) else None
        profile["mean"] = float(col_data.mean()) if pd.notnull(col_data.mean()) else None
        profile["median"] = float(col_data.median()) if pd.notnull(col_data.median()) else None
        profile["std_dev"] = float(col_data.std()) if pd.notnull(col_data.std()) else None
        
        # Histogram (10 buckets)
        clean_data = col_data.dropna()
        if not clean_data.empty and unique_count > 1:
            counts, bin_edges = np.histogram(clean_data, bins=10)
            histogram = []
            for i in range(len(counts)):
                label = f"{bin_edges[i]:.1f} - {bin_edges[i+1]:.1f}"
                histogram.append({
                    "bucket_label": label,
                    "count": int(counts[i])
                })
            profile["histogram"] = histogram
        else:
            profile["histogram"] = []
    else:
        # Text stats
        clean_text = col_data.dropna().astype(str)
        if not clean_text.empty:
            lengths = clean_text.str.len()
            profile["min_length"] = int(lengths.min())
            profile["max_length"] = int(lengths.max())
            profile["avg_length"] = float(lengths.mean())
        else:
            profile["min_length"] = 0
            profile["max_length"] = 0
            profile["avg_length"] = 0

    return profile
