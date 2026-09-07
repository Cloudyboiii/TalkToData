import json
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
import google.generativeai as genai

from services.csv_processor import _sessions, execute_sql
from services.sql_generator import generate_sql, generate_insights, settings
from services.chart_recommender import recommend_chart

router = APIRouter()

@router.post("/dashboard")
async def generate_dashboard(x_session_id: str = Header(..., alias="X-Session-ID")):
    session = _sessions.get(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(
            status_code=400,
            detail="No dataset loaded. Please upload a CSV file first.",
        )

    tables = session["tables"]
    
    # Build schema description
    schema_text = "Available Tables:\n"
    for table in tables:
        schema_text += f"\nTable: {table['name']} (from {table['filename']})\nColumns:\n"
        for col in table["schema"]:
            samples = ", ".join(str(v) for v in col["sample_values"][:3])
            schema_text += f"  - {col['column']} ({col['type']}) — examples: {samples}\n"
            
        if table.get("sample_rows"):
            schema_text += f"First {len(table['sample_rows'])} rows preview:\n"
            for row in table["sample_rows"][:3]:
                schema_text += f"  {row}\n"

    prompt = f"""You are a data analyst. Given this dataset schema and sample data, generate exactly 6 dashboard queries that would give the best overview of this data. Return ONLY a JSON array of 6 objects, each with: {{"title": "string", "question": "string"}}. Make them diverse — include totals, comparisons, distributions, and trends.

{schema_text}"""

    try:
        model = genai.GenerativeModel(settings.GEMINI_MODEL)
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Clean up markdown block if present
        if text.startswith("```"):
            lines = text.split("\n")
            if len(lines) > 2:
                text = "\n".join(lines[1:-1])
        text = text.replace("`", "").strip()
        
        queries = json.loads(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate dashboard queries: {str(e)}")

    if not isinstance(queries, list) or len(queries) < 1:
        raise HTTPException(status_code=500, detail="Invalid response from AI model")

    # Limit to 6 just in case
    queries = queries[:6]

    dashboard_results = []
    
    for q in queries:
        title = q.get("title", "Dashboard Item")
        question = q.get("question", "")
        
        if not question:
            continue
            
        try:
            sql = generate_sql(question=question, tables=tables)
            result = execute_sql(x_session_id, sql)
            chart = recommend_chart(result["columns"], result["rows"])
            
            insights = []
            if result["rows"]:
                insights = generate_insights(question, sql, result["columns"], result["rows"])
                
            dashboard_results.append({
                "title": title,
                "question": question,
                "sql": sql,
                "columns": result["columns"],
                "rows": result["rows"],
                "row_count": result["row_count"],
                "chart": chart,
                "insights": insights,
            })
        except Exception as e:
            # If a query fails, just skip it or log it
            print(f"Error generating dashboard item '{question}': {str(e)}")
            pass

    return {
        "status": "success",
        "results": dashboard_results
    }
