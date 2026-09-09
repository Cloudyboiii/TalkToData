import pandas as pd
from fastapi import APIRouter, Header, HTTPException
from services.csv_processor import _sessions

router = APIRouter(tags=["Correlations"])

@router.post("/correlations")
async def get_correlations(x_session_id: str = Header(..., alias="X-Session-ID")):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    conn = session["conn"]
    table_name = session["tables"][0]["name"]
    
    try:
        df = pd.read_sql(f"SELECT * FROM {table_name}", conn)
    except Exception:
        raise HTTPException(status_code=400, detail="Table not found.")
        
    numeric_df = df.select_dtypes(include='number')
    if len(numeric_df.columns) < 2:
        return {"correlations": [], "matrix": [], "columns": []}
        
    corr_matrix = numeric_df.corr().fillna(0)
    
    correlations = []
    cols = corr_matrix.columns
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            col1 = cols[i]
            col2 = cols[j]
            r = corr_matrix.iloc[i, j]
            
            if abs(r) > 0.3:
                strength = "strong" if abs(r) > 0.7 else "moderate" if abs(r) > 0.4 else "weak"
                direction = "positive" if r > 0 else "negative"
                correlations.append({
                    "col1": col1,
                    "col2": col2,
                    "coefficient": float(r),
                    "strength": strength,
                    "direction": direction
                })
                
    correlations.sort(key=lambda x: abs(x["coefficient"]), reverse=True)
    
    matrix = corr_matrix.values.tolist()
    
    return {
        "correlations": correlations,
        "matrix": matrix,
        "columns": cols.tolist()
    }
