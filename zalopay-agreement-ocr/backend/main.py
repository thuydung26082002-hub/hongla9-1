import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from models.database import init_db
from routers.agreements import router as agreements_router
from worker.drive_poller import start_poller

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"


async def _process_drive_file(file_bytes: bytes, filename: str, drive_file_id: str):
    """Callback for drive poller — creates Agreement from downloaded file."""
    from models.database import AsyncSessionLocal
    from models.db import Agreement, AgreementStatus
    from ocr.client import extract_from_file, _compute_avg_confidence
    import uuid
    from datetime import datetime

    agreement_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        ag = Agreement(
            id=agreement_id,
            status=AgreementStatus.OCR_PROCESSING,
            source_file_name=filename,
            source_drive_file_id=drive_file_id,
        )
        db.add(ag)
        await db.commit()

    from routers.agreements import _run_ocr_and_update
    await _run_ocr_and_update(agreement_id, file_bytes, filename)
    logger.info("Drive file processed: %s → agreement %s", filename, agreement_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialized")
    asyncio.create_task(start_poller(_process_drive_file))
    yield


app = FastAPI(title="ZaloPay Agreement Automation", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agreements_router)


@app.get("/healthz")
async def health():
    return {"status": "ok"}


# Serve React SPA (must be LAST — catches all unmatched routes)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        return FileResponse(STATIC_DIR / "index.html")
else:
    @app.get("/")
    async def root():
        return {"message": "ZaloPay Agreement API", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
