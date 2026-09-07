import traceback
from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from config import get_settings
from services.csv_processor import ingest_csv, delete_session
from services.sql_generator import generate_suggested_questions

router = APIRouter(tags=["Upload"])
settings = get_settings()


@router.post("/upload")
async def upload_csv(
    file: UploadFile = File(...),
    x_session_id: str = Header(alias="X-Session-ID", default="default"),
):
    """Upload a CSV file and ingest it into a session-scoped SQLite database."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    content = await file.read()

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit.")

    try:
        result = ingest_csv(x_session_id, content, file.filename)

        # Generate suggested questions from schema
        suggested_questions = generate_suggested_questions(
            schema=result["schema"],
            filename=result["filename"],
            row_count=result["row_count"],
        )

        return {
            "status": "success",
            "filename": result["filename"],
            "row_count": result["row_count"],
            "column_count": result["column_count"],
            "schema": result["schema"],
            "sample_rows": result["sample_rows"],
            "suggested_questions": suggested_questions,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.delete("/dataset")
async def delete_dataset(
    x_session_id: str = Header(alias="X-Session-ID", default="default"),
):
    """Delete the current session's dataset."""
    deleted = delete_session(x_session_id)
    return {"status": "deleted" if deleted else "not_found"}
