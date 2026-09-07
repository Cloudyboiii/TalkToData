def recommend_chart(columns: list[str], rows: list[dict]) -> dict:
    """
    Analyze SQL result shape and recommend the best chart type.

    Rules:
    - Single numeric value → stat card (no chart)
    - 1 text + 1 numeric → bar chart
    - date/time + 1 numeric → line chart
    - 2 text columns → table only
    - 1 text + multiple numeric → grouped bar
    - Multiple rows, 1 numeric column → bar chart
    - Default → table
    """
    if not rows or not columns:
        return {"type": "table", "x": None, "y": None}

    if len(rows) == 1 and len(columns) == 1:
        val = list(rows[0].values())[0]
        if _is_numeric(val):
            return {"type": "stat", "x": None, "y": columns[0]}

    numeric_cols = [c for c in columns if _col_is_numeric(c, rows)]
    text_cols = [c for c in columns if c not in numeric_cols]
    date_cols = [c for c in text_cols if _col_is_date(c)]

    if date_cols and numeric_cols:
        return {"type": "line", "x": date_cols[0], "y": numeric_cols[0]}

    if len(text_cols) == 1 and len(numeric_cols) >= 1:
        return {"type": "bar", "x": text_cols[0], "y": numeric_cols[0]}

    if len(text_cols) == 0 and len(numeric_cols) >= 1:
        return {"type": "bar", "x": None, "y": numeric_cols[0]}

    if len(numeric_cols) >= 1 and len(text_cols) >= 1:
        return {"type": "bar", "x": text_cols[0], "y": numeric_cols[0]}

    return {"type": "table", "x": None, "y": None}


def _is_numeric(val) -> bool:
    try:
        float(val)
        return True
    except (TypeError, ValueError):
        return False


def _col_is_numeric(col: str, rows: list[dict]) -> bool:
    values = [r.get(col) for r in rows if r.get(col) is not None]
    if not values:
        return False
    numeric_count = sum(1 for v in values if _is_numeric(v))
    return numeric_count / len(values) > 0.7


def _col_is_date(col: str) -> bool:
    date_keywords = ["date", "time", "year", "month", "day", "week", "period", "quarter"]
    return any(kw in col.lower() for kw in date_keywords)
