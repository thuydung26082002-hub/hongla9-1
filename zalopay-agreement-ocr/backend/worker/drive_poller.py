"""
Drive poller — periodically checks DRIVE_FOLDER_ID for new PDF/image files,
downloads them, triggers OCR, and creates Agreements.
Uses agentbase-memory (or local DB) to track already-processed file IDs (idempotent).
"""
import os
import logging
import asyncio
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "")
DRIVE_GATEWAY_URL = os.environ.get("DRIVE_GATEWAY_URL", "")
POLL_INTERVAL_SEC = int(os.environ.get("POLL_INTERVAL_SEC", "60"))

# In-memory set of already processed Drive file IDs (persisted to DB in production)
_processed_ids: set[str] = set()


async def _list_new_files() -> list[dict]:
    """Call Drive Gateway MCP to list files in folder."""
    if not DRIVE_GATEWAY_URL or not DRIVE_FOLDER_ID:
        return []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{DRIVE_GATEWAY_URL}/files",
                params={"folder_id": DRIVE_FOLDER_ID, "mime_types": "application/pdf,image/jpeg,image/png"},
            )
            resp.raise_for_status()
            files = resp.json().get("files", [])
            return [f for f in files if f["id"] not in _processed_ids]
    except Exception as e:
        logger.warning("Drive poll failed: %s", e)
        return []


async def _download_file(file_id: str) -> bytes | None:
    if not DRIVE_GATEWAY_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(f"{DRIVE_GATEWAY_URL}/files/{file_id}/content")
            resp.raise_for_status()
            return resp.content
    except Exception as e:
        logger.warning("Drive download failed for %s: %s", file_id, e)
        return None


async def poll_once(process_fn):
    """Single poll iteration. process_fn(file_bytes, filename, drive_file_id) called per new file."""
    new_files = await _list_new_files()
    for f in new_files:
        fid = f["id"]
        fname = f.get("name", fid)
        logger.info("New Drive file: %s (%s)", fname, fid)
        content = await _download_file(fid)
        if content:
            try:
                await process_fn(content, fname, fid)
                _processed_ids.add(fid)
            except Exception as e:
                logger.error("Failed to process Drive file %s: %s", fid, e)


async def start_poller(process_fn):
    """Background loop — call in FastAPI lifespan startup."""
    if not DRIVE_FOLDER_ID or not DRIVE_GATEWAY_URL:
        logger.info("Drive poller disabled (DRIVE_FOLDER_ID or DRIVE_GATEWAY_URL not set)")
        return
    logger.info("Drive poller started — interval=%ss folder=%s", POLL_INTERVAL_SEC, DRIVE_FOLDER_ID)
    while True:
        await poll_once(process_fn)
        await asyncio.sleep(POLL_INTERVAL_SEC)
