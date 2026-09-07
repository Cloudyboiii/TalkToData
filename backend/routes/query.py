import traceback
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from services.csv_processor import get_session, execute_sql
from services.sql_generator import generate_sql, generate_insights
from services.chart_recommender import recommend_chart

router = APIRouter(tags=["Query"])


class QueryRequest(BaseModel):
    question: str
    sql_override: str | None = None  # Allow user to edit and re-run SQL
    conversation_history: list[dict] | None = None


@router.post("/query")
async def query(
    req: QueryRequest,
    x_session_id: str = Header(alias="X-Session-ID", default="default"),
):
    """Convert a natural language question to SQL, execute it, and return results with chart recommendation."""
    session = get_session(x_session_id)
    if not session or not session.get("tables"):
        raise HTTPException(
            status_code=400,
            detail="No dataset loaded. Please upload a CSV file first.",
        )

    if not req.question.strip() and not req.sql_override:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        # Step 1: Generate SQL (or use override)
        if req.sql_override:
            sql = req.sql_override.strip()
        else:
            sql = generate_sql(
                question=req.question,
                tables=session["tables"],
                conversation_history=req.conversation_history
            )

        # Step 2: Execute SQL
        result = execute_sql(x_session_id, sql)

        # Step 3: Recommend chart
        chart = recommend_chart(result["columns"], result["rows"])

        # Step 4: Generate insights
        insights = []
        if result["rows"]:
            insights = generate_insights(req.question, sql, result["columns"], result["rows"])

        return {
            "question": req.question,
            "sql": sql,
            "columns": result["columns"],
            "rows": result["rows"],
            "row_count": result["row_count"],
            "chart": chart,
            "insights": insights,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
