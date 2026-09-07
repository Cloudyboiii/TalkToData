import google.generativeai as genai
from config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GOOGLE_API_KEY)

SYSTEM_PROMPT = """You are a SQL expert. Your job is to convert natural language questions into correct SQLite SELECT queries.

RULES:
1. ALWAYS return ONLY a valid SQLite SELECT query — no explanation, no markdown, no backticks, no preamble.
2. The table name is always: data
3. Use only column names from the schema provided.
4. Use SQLite syntax (not MySQL or PostgreSQL).
5. For text comparisons, use LIKE with % wildcards and LOWER() for case-insensitive matching.
6. Never use DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, TRUNCATE, or REPLACE.
7. If the question cannot be answered with SQL from the available schema, return: SELECT 'Cannot answer this question from the available data' AS message
8. For date/time operations use SQLite date functions.
9. Always add LIMIT 100 unless the question explicitly asks for all data or an aggregation.

Return ONLY the SQL query, nothing else."""


def generate_sql(question: str, schema: list[dict], sample_rows: list[dict], filename: str) -> str:
    """Use Gemini to convert a natural language question into a SQL query."""

    # Build schema description
    schema_text = "Table: data\nColumns:\n"
    for col in schema:
        samples = ", ".join(str(v) for v in col["sample_values"][:3])
        schema_text += f"  - {col['column']} ({col['type']}) — examples: {samples}\n"

    # Build sample data description
    if sample_rows:
        sample_text = f"\nFirst {len(sample_rows)} rows preview:\n"
        for row in sample_rows[:3]:
            sample_text += f"  {row}\n"
    else:
        sample_text = ""

    user_prompt = f"""Dataset: {filename}
{schema_text}{sample_text}
Question: {question}

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
