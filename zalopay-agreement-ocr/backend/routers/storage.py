import uuid
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db import Agreement, AgreementStatus
from models.database import get_db
from models.schemas import StorageFileOut
from storage.drive import (
    drive_enabled, drive_upload_file, drive_list_files,
    drive_web_link_from_id, DRIVE_FOLDER_ID,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/storage", tags=["storage"])

ALLOWED_EXT  = (".pdf", ".jpg", ".jpeg", ".png")
ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}


def _require_drive():
    if not drive_enabled():
        raise HTTPException(503, "Kho lưu trữ chưa cấu hình (thiếu DRIVE_SERVICE_ACCOUNT_JSON / DRIVE_SERVICE_ACCOUNT_FILE)")


# ── List files ────────────────────────────────────────────────────────────────
@router.get("/files", response_model=list[StorageFileOut])
async def list_files(db: AsyncSession = Depends(get_db)):
    _require_drive()

    drive_files = await drive_list_files()
    if not drive_files:
        return []

    file_ids = [f["id"] for f in drive_files]
    rows = (await db.execute(
        select(Agreement.id, Agreement.source_drive_file_id, Agreement.status)
        .where(Agreement.source_drive_file_id.in_(file_ids))
    )).all()
    id_map = {row.source_drive_file_id: (row.id, row.status) for row in rows}

    result = []
    for f in sorted(drive_files, key=lambda x: x.get("modifiedTime", ""), reverse=True):
        fid  = f["id"]
        ag   = id_map.get(fid)
        result.append(StorageFileOut(
            key=fid,
            name=f.get("name", fid),
            size=int(f.get("size") or 0),
            last_modified=f.get("modifiedTime", ""),
            web_link=f.get("webViewLink") or drive_web_link_from_id(fid),
            has_agreement=ag is not None,
            agreement_id=ag[0] if ag else None,
            agreement_status=ag[1].value if ag else None,
        ))
    return result


# ── Upload to Drive + trigger OCR ─────────────────────────────────────────────
@router.post("/upload")
async def upload_to_storage(
    file: UploadFile = File(...),
    actor: str = "sales",
    db: AsyncSession = Depends(get_db),
):
    _require_drive()
    fname = file.filename or "upload"
    if file.content_type not in ALLOWED_MIME and not fname.lower().endswith(ALLOWED_EXT):
        raise HTTPException(400, "Chỉ chấp nhận PDF, JPG, PNG")

    file_bytes = await file.read()
    mime       = file.content_type or "application/octet-stream"

    drive_result   = await drive_upload_file(file_bytes, fname, mime)
    drive_file_id  = drive_result["id"]
    drive_web_link = drive_result.get("webViewLink") or drive_web_link_from_id(drive_file_id)

    from routers.agreements import _run_ocr_and_update, _log
    agreement_id = str(uuid.uuid4())
    ag = Agreement(
        id=agreement_id,
        status=AgreementStatus.OCR_PROCESSING,
        source_file_name=fname,
        source_drive_file_id=drive_file_id,
        drive_web_link=drive_web_link,
    )
    db.add(ag)
    await _log(db, agreement_id, actor, "upload", note=f"Drive upload: {fname}")
    await db.commit()

    asyncio.create_task(_run_ocr_and_update(agreement_id, file_bytes, fname))
    return {"agreement_id": agreement_id, "drive_file_id": drive_file_id, "name": fname, "web_link": drive_web_link}


# ── Status check ──────────────────────────────────────────────────────────────
@router.get("/status")
async def storage_status():
    return {"configured": drive_enabled(), "folder_id": DRIVE_FOLDER_ID if drive_enabled() else None}
