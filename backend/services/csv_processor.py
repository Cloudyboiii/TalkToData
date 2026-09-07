import io
import sqlite3
import pandas as pd
import re
from config import get_settings

settings = get_settings()

# In-memory session store: session_id -> {db_conn, tables: [ {name, filename, row_count, column_count, schema, sample_rows} ]}
_sessions: dict[str, dict] = {}


def sanitize_table_name(filename: str) -> str:
    name = filename.rsplit(".", 1)[0]
    name = re.sub(r'\W+', '_', name).lower()
    if name[0].isdigit():
        name = "t_" + name
    return name


def ingest_csv(session_id: str, file_content: bytes, filename: str) -> dict:
    """Parse CSV, infer schema, load into in-memory SQLite, return all tables in session."""
    try:
        # Parse CSV
        df = pd.read_csv(io.BytesIO(file_content))

        if df.empty:
            raise ValueError("CSV file is empty.")

        # Clean column names (remove spaces, special chars)
        df.columns = [
            col.strip().replace(" ", "_").replace("-", "_").replace(".", "_").lower()
            for col in df.columns
        ]

        # Infer column types for schema
        schema = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            if "int" in dtype:
                sql_type = "INTEGER"
            elif "float" in dtype:
                sql_type = "REAL"
            else:
                sql_type = "TEXT"
            schema.append({
                "column": col,
                "type": sql_type,
                "pandas_dtype": dtype,
                "sample_values": df[col].dropna().head(3).tolist(),
            })

        table_name = sanitize_table_name(filename)

        if session_id not in _sessions:
            _sessions[session_id] = {
                "conn": sqlite3.connect(":memory:", check_same_thread=False),
                "tables": []
            }
        
        session = _sessions[session_id]
        conn = session["conn"]
        
        # Load into SQLite in-memory
        df.to_sql(table_name, conn, if_exists="replace", index=False)

        # Sample rows for prompt context
        sample_rows = df.head(settings.MAX_ROWS_PREVIEW).to_dict(orient="records")

        table_info = {
            "name": table_name,
            "filename": filename,
            "row_count": len(df),
            "column_count": len(df.columns),
            "schema": schema,
            "sample_rows": sample_rows,
        }
        
        # Check if table already exists and update it, else append
        existing_idx = next((i for i, t in enumerate(session["tables"]) if t["name"] == table_name), None)
        if existing_idx is not None:
            session["tables"][existing_idx] = table_info
        else:
            session["tables"].append(table_info)

        return session["tables"]

    except Exception as e:
        raise ValueError(f"Failed to parse CSV: {str(e)}")


def get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def execute_sql(session_id: str, sql: str) -> dict:
    """Execute SQL on the session's in-memory SQLite DB. Read-only enforcement."""
    session = _sessions.get(session_id)
    if not session:
        raise ValueError("No dataset loaded. Please upload a CSV first.")

    # Read-only enforcement — block dangerous statements
    sql_upper = sql.strip().upper()
    blocked = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "TRUNCATE", "REPLACE"]
    for keyword in blocked:
        if sql_upper.startswith(keyword) or f" {keyword} " in sql_upper:
            raise ValueError(f"Statement type '{keyword}' is not allowed. Only SELECT queries are permitted.")

    try:
        conn = session["conn"]
        cursor = conn.execute(sql)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchall()

        # Convert to list of dicts
        results = [dict(zip(columns, row)) for row in rows]

        return {
            "columns": columns,
            "rows": results,
            "row_count": len(results),
        }
    except sqlite3.Error as e:
        raise ValueError(f"SQL execution error: {str(e)}")


def delete_session(session_id: str) -> bool:
    if session_id in _sessions:
        _sessions[session_id]["conn"].close()
        del _sessions[session_id]
        return True
    return False
