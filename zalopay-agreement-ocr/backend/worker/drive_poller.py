"""
Drive poller — periodically checks DRIVE_FOLDER_ID for new PDF/image files,
downloads them, triggers OCR, and creates Agreements.
Uses DB to track already-processed file IDs (idempotent).
"""
import os
import logging
import asyncio

logger = logging.getLogger(__name__)

POLL_INTERVAL_SEC = int(os.environ.get("POLL_INTERVAL_SEC", "120"))


async def poll_once(process_fn):
    """
    Single poll iteration.
    process_fn(file_bytes: bytes, filename: str, drive_file_id: str) is called per new file.
    """
    from storage.drive import drive_enabled, drive_list_files, drive_download_file
    from models.database import AsyncSessionLocal
    from models.db import Agreement
    from sqlalchemy import select

    if not drive_enabled():
        return

    try:
        files = await drive_list_files()
    except Exception as e:
        logger.warning("Drive list failed: %s", e)
        return

    if not files:
        return

    file_ids = [f["id"] for f in files]
    async with AsyncSessionLocal() as db:
        processed = set((await db.execute(
            select(Agreement.source_drive_file_id)
            .where(Agreement.source_drive_file_id.in_(file_ids))
        )).scalars().all())

    for f in files:
        fid = f["id"]
        if fid in processed:
            continue
        fname = f.get("name", fid)
        logger.info("New Drive file detected: %s (%s)", fname, fid)
        try:
            content = await drive_download_file(fid)
            await process_fn(content, fname, fid)
        except Exception as e:
            logger.error("Failed to process Drive file %s: %s", fid, e)


async def start_poller(process_fn):
    """Background loop — call in FastAPI lifespan startup."""
    from storage.drive import drive_enabled
    if not drive_enabled():
        logger.info("Drive poller disabled (credentials not configured)")
        return
    logger.info("Drive poller started — checking every %ss", POLL_INTERVAL_SEC)
    while True:
        try:
            await poll_once(process_fn)
        except Exception as e:
            logger.error("Drive poll_once error: %s", e)
        await asyncio.sleep(POLL_INTERVAL_SEC)
