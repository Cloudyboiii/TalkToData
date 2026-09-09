from fastapi import APIRouter
from pydantic import BaseModel
import google.generativeai as genai
from config import get_settings

router = APIRouter(tags=["Filter"])
settings = get_settings()

class FilterRequest(BaseModel):
    filter_text: str
    schema: list[dict]

@router.post("/filter")
async def generate_filter(req: FilterRequest):
    try:
        schema_text = ", ".join(f"{col['column']} ({col['type']})" for col in req.schema)
        prompt = f"""You are a SQL expert. Convert this natural language filter into a SQL WHERE clause.
        
Filter: "{req.filter_text}"
Available Columns: {schema_text}

Return ONLY the WHERE clause (e.g., "WHERE category = 'Electronics'").
Do not include the SELECT part. Do not include markdown or backticks."""

        model = genai.GenerativeModel(settings.GEMINI_MODEL)
        response = model.generate_content(prompt)
        
        where_clause = response.text.strip()
        if where_clause.startswith("```"):
            lines = where_clause.split("\n")
            where_clause = "\n".join(lines[1:-1]) if len(lines) > 2 else where_clause
        where_clause = where_clause.replace("`", "").strip()
        
        if not where_clause.upper().startswith("WHERE"):
            where_clause = "WHERE " + where_clause
            
        return {"where_clause": where_clause}
    except Exception as e:
        return {"where_clause": "", "error": str(e)}
