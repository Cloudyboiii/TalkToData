import pandas as pd
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.csv_processor import _sessions

router = APIRouter()

class CleanRequest(BaseModel):
    table_name: str

class FixRequest(BaseModel):
    table_name: str
    fix_type: str
    column: Optional[str] = None

@router.post("/clean")
async def analyze_data(req: CleanRequest, x_session_id: str = Header(..., alias="X-Session-ID")):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    conn = session["conn"]
    
    try:
        df = pd.read_sql(f"SELECT * FROM {req.table_name}", conn)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Table {req.table_name} not found.")

    issues = []
    score = 100
    
    # 1. Duplicates
    dup_count = df.duplicated().sum()
    if dup_count > 0:
        score -= 15
        issues.append({
            "type": "drop_duplicates",
            "column": None,
            "description": f"Found {dup_count} duplicate rows.",
            "severity": "high",
            "fix_available": True
        })

    # Columns loop
    for col in df.columns:
        # 2. Missing values
        missing = int(df[col].isnull().sum())
        if missing > 0:
            missing_pct = missing / len(df)
            sev = "high" if missing_pct > 0.05 else "medium"
            if missing_pct > 0.05:
                score -= 10
            
            is_num = pd.api.types.is_numeric_dtype(df[col])
            fix_type = "fill_missing_mean" if is_num else "fill_missing_mode"
            
            issues.append({
                "type": fix_type,
                "column": col,
                "description": f"Column '{col}' has {missing} missing values ({missing_pct:.1%}).",
                "severity": sev,
                "fix_available": True
            })

        # 3. Single unique value
        if df[col].nunique() == 1:
            score -= 5
            issues.append({
                "type": "single_value",
                "column": col,
                "description": f"Column '{col}' has only 1 unique value.",
                "severity": "low",
                "fix_available": False
            })

        # 4. Outliers (Numeric only)
        if pd.api.types.is_numeric_dtype(df[col]):
            mean = df[col].mean()
            std = df[col].std()
            if pd.notnull(std) and std > 0:
                outliers = ((df[col] - mean).abs() > 3 * std).sum()
                if outliers > 0:
                    score -= 5
                    issues.append({
                        "type": "outliers",
                        "column": col,
                        "description": f"Column '{col}' has {outliers} potential outliers (>3 std devs).",
                        "severity": "medium",
                        "fix_available": False
                    })

        # 5. Inconsistent casing (Text only)
        if pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
            # dropna before checking string properties
            valid_strs = df[col].dropna().astype(str)
            if not valid_strs.empty:
                # check if same word exists in different cases
                lower_counts = valid_strs.str.lower().value_counts()
                cased_counts = valid_strs.value_counts()
                # If there are fewer unique lowercased values than original cased values, there's a collision
                if len(lower_counts) < len(cased_counts):
                    score -= 5
                    issues.append({
                        "type": "fix_casing",
                        "column": col,
                        "description": f"Column '{col}' has inconsistent text casing.",
                        "severity": "medium",
                        "fix_available": True
                    })

    # Floor score at 0
    score = max(0, score)

    return {
        "health_score": score,
        "issues": issues
    }

@router.post("/clean/fix")
async def fix_data(req: FixRequest, x_session_id: str = Header(..., alias="X-Session-ID")):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    conn = session["conn"]
    
    try:
        df = pd.read_sql(f"SELECT * FROM {req.table_name}", conn)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Table {req.table_name} not found.")

    # Apply fix
    if req.fix_type == "drop_duplicates":
        df = df.drop_duplicates()
    elif req.fix_type == "fill_missing_mean" and req.column:
        mean_val = df[req.column].mean()
        df[req.column] = df[req.column].fillna(mean_val)
    elif req.fix_type == "fill_missing_mode" and req.column:
        mode_series = df[req.column].mode()
        if not mode_series.empty:
            df[req.column] = df[req.column].fillna(mode_series[0])
    elif req.fix_type == "fix_casing" and req.column:
        df[req.column] = df[req.column].astype(str).str.title()
    else:
        raise HTTPException(status_code=400, detail="Invalid fix type or missing column.")

    # Save back to SQLite
    df.to_sql(req.table_name, conn, if_exists="replace", index=False)

    # Regenerate schema for this table
    table_info = None
    for t in session["tables"]:
        if t["name"] == req.table_name:
            table_info = t
            break
            
    if table_info:
        schema = []
        for col in df.columns:
            dtype = "TEXT"
            if pd.api.types.is_integer_dtype(df[col]):
                dtype = "INTEGER"
            elif pd.api.types.is_numeric_dtype(df[col]):
                dtype = "REAL"
                
            sample = df[col].dropna().unique()[:5].tolist()
            schema.append({
                "column": col,
                "type": dtype,
                "sample_values": sample
            })
        
        table_info["schema"] = schema
        table_info["row_count"] = len(df)
        table_info["sample_rows"] = df.head(10).to_dict(orient="records")

    return {"status": "success"}
