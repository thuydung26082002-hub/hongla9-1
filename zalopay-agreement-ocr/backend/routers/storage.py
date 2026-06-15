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
from storage.s3 import get_s3_client, S3_BUCKET, S3_PREFIX, s3_enabled

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/storage", tags=["storage"])

ALLOWED_EXT = (".pdf", ".jpg", ".jpeg", ".png")
ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}


def _require_s3():
    if not s3_enabled():
        raise HTTPException(503, "Kho lưu trữ S3 chưa cấu hình (thiếu S3_ENDPOINT_URL / S3_ACCESS_KEY)")


# ── List files ────────────────────────────────────────────────────────────────
@router.get("/files", response_model=list[StorageFileOut])
async def list_files(db: AsyncSession = Depends(get_db)):
    _require_s3()
    s3 = get_s3_client()

    objects = await asyncio.to_thread(
        lambda: s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=S3_PREFIX).get("Contents", [])
    )
    if not objects:
        return []

    keys = [obj["Key"] for obj in objects]
    rows = (await db.execute(
        select(Agreement.id, Agreement.s3_key, Agreement.status)
        .where(Agreement.s3_key.in_(keys))
    )).all()
    key_map = {row.s3_key: (row.id, row.status) for row in rows}

    result = []
    for obj in sorted(objects, key=lambda x: x["LastModified"], reverse=True):
        key = obj["Key"]
        name = key[len(S3_PREFIX):]
        # Strip uuid prefix: {uuid}_{original_name}
        if "_" in name:
            name = name[name.index("_") + 1:]
        ag = key_map.get(key)
        result.append(StorageFileOut(
            key=key,
            name=name,
            size=obj["Size"],
            last_modified=obj["LastModified"].isoformat(),
            has_agreement=ag is not None,
            agreement_id=ag[0] if ag else None,
            agreement_status=ag[1].value if ag else None,
        ))
    return result


# ── Upload to S3 + trigger OCR ────────────────────────────────────────────────
@router.post("/upload")
async def upload_to_storage(
    file: UploadFile = File(...),
    actor: str = "sales",
    db: AsyncSession = Depends(get_db),
):
    _require_s3()
    fname = file.filename or "upload"
    if (file.content_type not in ALLOWED_MIME
            and not fname.lower().endswith(ALLOWED_EXT)):
        raise HTTPException(400, "Chỉ chấp nhận PDF, JPG, PNG")

    file_bytes = await file.read()
    s3_key = f"{S3_PREFIX}{uuid.uuid4()}_{fname}"

    s3 = get_s3_client()
    await asyncio.to_thread(
        lambda: s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=file_bytes,
            ContentType=file.content_type or "application/octet-stream",
        )
    )

    # Create Agreement and fire OCR in background
    from routers.agreements import _run_ocr_and_update, _log
    agreement_id = str(uuid.uuid4())
    ag = Agreement(
        id=agreement_id,
        status=AgreementStatus.OCR_PROCESSING,
        source_file_name=fname,
        s3_key=s3_key,
    )
    db.add(ag)
    await _log(db, agreement_id, actor, "upload", note=f"Storage upload: {fname}")
    await db.commit()

    asyncio.create_task(_run_ocr_and_update(agreement_id, file_bytes, fname))
    return {"agreement_id": agreement_id, "s3_key": s3_key, "name": fname}


# ── Presigned download URL ────────────────────────────────────────────────────
@router.get("/download")
async def get_download_url(key: str):
    _require_s3()
    s3 = get_s3_client()
    url = await asyncio.to_thread(
        lambda: s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=300,
        )
    )
    return {"url": url}


# ── Delete file ───────────────────────────────────────────────────────────────
@router.delete("/files")
async def delete_file(key: str, db: AsyncSession = Depends(get_db)):
    _require_s3()
    s3 = get_s3_client()
    await asyncio.to_thread(lambda: s3.delete_object(Bucket=S3_BUCKET, Key=key))
    # Nullify s3_key on associated agreement (don't delete the agreement)
    rows = (await db.execute(select(Agreement).where(Agreement.s3_key == key))).scalars().all()
    for ag in rows:
        ag.s3_key = None
    if rows:
        await db.commit()
    return {"ok": True}


# ── Status check ──────────────────────────────────────────────────────────────
@router.get("/status")
async def storage_status():
    return {"configured": s3_enabled(), "bucket": S3_BUCKET if s3_enabled() else None}
