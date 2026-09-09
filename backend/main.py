import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes.upload import router as upload_router
from routes.query import router as query_router
from routes.health import router as health_router
from routes.dashboard import router as dashboard_router
from routes.clean import router as clean_router
from routes.profile import router as profile_router
from routes.filter import router as filter_router
from routes.anomalies import router as anomalies_router
from routes.forecast import router as forecast_router
from routes.correlations import router as correlations_router

app = FastAPI(title="TalkToData API", version="1.0.0")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://talk-to-data-gold.vercel.app",
]

prod_url = os.getenv("FRONTEND_URL")
if prod_url:
    origins.append(prod_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(query_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(clean_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(filter_router, prefix="/api")
app.include_router(anomalies_router, prefix="/api")
app.include_router(forecast_router, prefix="/api")
app.include_router(correlations_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=10000, reload=True)
