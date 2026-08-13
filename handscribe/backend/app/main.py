"""
HandScribe backend entrypoint.

Importing app.config at module load time is what makes startup fail fast:
if GROQ_API_KEY or GOOGLE_APPLICATION_CREDENTIALS is missing/invalid, the
process exits immediately with a clear message instead of the failure
surfacing later inside a request handler.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings  # noqa: F401  (triggers startup validation)
from app.database import init_db
from app.routers import extract, history, templates

app = FastAPI(title="HandScribe API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception) -> JSONResponse:
    # Last-resort catch so the frontend always gets a JSON error body with a
    # message, never a raw stack trace / connection reset.
    return JSONResponse(
        status_code=500,
        content={"detail": f"Unexpected server error: {exc}"},
    )


app.include_router(templates.router)
app.include_router(extract.router)
app.include_router(history.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
