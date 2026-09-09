import google.generativeai as genai
from config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GOOGLE_API_KEY)

SYSTEM_PROMPT = """You are a SQL expert. Your job is to convert natural language questions into correct SQLite SELECT queries.

RULES:
1. ALWAYS return ONLY a valid SQLite SELECT query — no explanation, no markdown, no backticks, no preamble.
2. Use ONLY the tables and columns from the schema provided. You may JOIN multiple tables if necessary.
3. Use SQLite syntax (not MySQL or PostgreSQL).
4. For text comparisons, use LIKE with % wildcards and LOWER() for case-insensitive matching.
5. Never use DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, TRUNCATE, or REPLACE.
6. If the question cannot be answered with SQL from the available schema, return: SELECT 'Cannot answer this question from the available data' AS message
7. For date/time operations use SQLite date functions.
8. Always add LIMIT 100 unless the question explicitly asks for all data or an aggregation.

Return ONLY the SQL query, nothing else."""


def generate_sql(question: str, tables: list[dict], conversation_history: list[dict] = None, active_filter: str = None) -> str:
    """Use Gemini to convert a natural language question into a SQL query."""

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

    history_text = ""
    if conversation_history:
        history_text = "Recent queries for context:\n"
        for entry in conversation_history:
            history_text += f"Q: {entry['question']} → SQL: {entry['sql']}\n"
        history_text += "\n"

    filter_text = ""
    if active_filter:
        filter_text = f"IMPORTANT: You MUST include this filter clause in your query: {active_filter}\n"

    user_prompt = f"""{schema_text}
{history_text}{filter_text}Question: {question}

Generate the SQLite SELECT query to answer this question."""

    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
    )

    response = model.generate_content(user_prompt)
    sql = response.text.strip()

    # Clean up any accidental markdown
    if sql.startswith("```"):
        lines = sql.split("\n")
        sql = "\n".join(lines[1:-1]) if len(lines) > 2 else sql
    sql = sql.replace("`", "").strip()

    return sql


def generate_suggested_questions(schema: list[dict], filename: str, row_count: int) -> list[str]:
    """Generate suggested questions based on the dataset schema."""
    schema_text = ", ".join(
        f"{col['column']} ({col['type']})" for col in schema
    )

    prompt = f"""Given a dataset called '{filename}' with {row_count} rows and these columns: {schema_text}

Generate exactly 5 natural language questions a business analyst would ask about this data.
Return ONLY the 5 questions as a numbered list (1. ... 2. ... etc), no other text."""

    model = genai.GenerativeModel(settings.GEMINI_MODEL)
    response = model.generate_content(prompt)

    lines = response.text.strip().split("\n")
    questions = []
    for line in lines:
        line = line.strip()
        if line and line[0].isdigit():
            # Remove numbering
            q = line.split(".", 1)[-1].strip()
            if q:
                questions.append(q)

    return questions[:5]

def generate_insights(question: str, sql: str, columns: list[str], rows: list[dict]) -> list[str]:
    """Generate 2-3 specific insights based on the SQL result."""
    prompt = f"""Given this question: {question}
SQL result columns: {columns}
Data (first 10 rows): {rows[:10]}
Generate exactly 2-3 concise, specific, data-driven insights about this result. Each insight should reference specific numbers from the data. Return ONLY the bullet points starting with •"""

    model = genai.GenerativeModel(settings.GEMINI_MODEL)
    response = model.generate_content(prompt)
    
    lines = response.text.strip().split("\n")
    insights = [line.strip().lstrip("•").strip() for line in lines if line.strip().startswith("•")]
    
    return insights[:3]
