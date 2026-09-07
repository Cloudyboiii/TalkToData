# TalkToData 📊

**Natural Language SQL — Ask Your Data Questions in Plain English**

Upload a CSV. Ask questions. Get SQL queries, sortable tables, and interactive charts instantly.

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)

---

## What is TalkToData?

TalkToData lets non-technical users query CSV datasets using plain English. Behind the scenes, Gemini converts the question to SQL, executes it against a session-scoped SQLite database, recommends the best chart type, and returns interactive visualizations.

**Try it live:** [talktodata.vercel.app](#)

---

## Features

- **Natural Language to SQL** — Gemini converts plain English to SQLite queries with schema-aware prompting
- **Auto-Generated Charts** — Bar, line charts based on result shape; single values shown as stat cards
- **Editable SQL View** — Power users can view, edit, and re-run any generated SQL query
- **Suggested Questions** — Gemini generates 5 relevant questions from your dataset schema on upload
- **Schema Viewer** — Browse all columns, types, and sample values in a collapsible panel
- **Read-Only Safety** — SQL validation blocks DROP, DELETE, INSERT, UPDATE and all write operations
- **Session Isolation** — Each browser gets its own SQLite database via session UUID in localStorage

---

## How It Works

```
Upload CSV
  → Pandas reads and cleans column names
  → Auto-detect column types (INTEGER, REAL, TEXT)
  → Load into in-memory SQLite via pandas.to_sql()
  → Gemini generates 5 suggested questions from schema

Ask question
  → Gemini generates SQLite SELECT query (schema-aware)
  → Read-only validation (block writes)
  → Execute against SQLite
  → Chart recommender analyzes result shape
  → Return SQL + rows + chart config
```

---

## Chart Recommendation Logic

| Result Shape | Chart Type |
|---|---|
| 1 row, 1 numeric column | Stat card |
| Date column + numeric column | Line chart |
| Text column + numeric column | Bar chart |
| Multiple columns | Table |

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| LLM | Google Gemini API | gemini-3.6-flash for NL-to-SQL |
| Backend | Python + FastAPI | Upload, query, session management |
| Database | SQLite (in-memory) | Per-session query engine |
| Data Processing | Pandas | CSV parsing, type inference |
| Frontend | Next.js 14 + React + Tailwind | Light enterprise UI |
| Charts | Recharts | Bar, line charts |
| Hosting | Render + Vercel | Free tier |

---

## Quick Start

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
echo "GOOGLE_API_KEY=your_key" > .env
uvicorn main:app --reload --port 10000
```

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:10000" > .env.local
npm run dev
```

---

## Deployment

| Component | Platform | Configuration |
|---|---|---|
| Backend | [Render](https://render.com) — Free | Root: `backend`, Runtime: Docker, Env: `GOOGLE_API_KEY` |
| Frontend | [Vercel](https://vercel.com) — Free | Root: `frontend`, Env: `NEXT_PUBLIC_API_URL` = Render URL |

---

Built by **[Badal Gupta](https://github.com/Cloudyboiii)** — MS Data Science, University at Albany (SUNY)
