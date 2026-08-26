from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, complaints, admin, analytics, config

settings = get_settings()

app = FastAPI(
    title="SentraAI",
    description="Configurable AI-Powered Complaint Workflow Platform",
    version="0.1.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(complaints.router)
app.include_router(admin.router)
app.include_router(analytics.router)
app.include_router(config.router)


@app.get("/api/v1/health")
def health_check():
    return {"status": "ok"}
