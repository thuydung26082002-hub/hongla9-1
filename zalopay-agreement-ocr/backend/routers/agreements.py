import uuid
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from models.db import Agreement, AuditLog, AgreementStatus
from models.schemas import (
    AgreementOut, AuditLogOut, PaginatedAgreements,
    ReviewDataUpdateRequest, ApproveRequest, RejectRequest, ActivateRequest,
)
from models.database import get_db
from ocr.client import extract_from_file, _compute_avg_confidence

router = APIRouter(prefix="/api/agreements", tags=["agreements"])


async def _log(db: AsyncSession, agreement_id: str, actor: str, action: str, **kwargs):
    log = AuditLog(agreement_id=agreement_id, actor=actor, action=action, **kwargs)
    db.add(log)
    await db.flush()


# ── List (paginated) ──────────────────────────────────────────────────────────
@router.get("", response_model=PaginatedAgreements)
async def list_agreements(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    q = select(Agreement).order_by(Agreement.created_at.desc())
    if status:
        q = q.where(Agreement.status == status)

    total: int = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    items = (await db.execute(q.offset((page - 1) * size).limit(size))).scalars().all()
    pages = max(1, (total + size - 1) // size)

    return PaginatedAgreements(items=list(items), total=total, page=page, size=size, pages=pages)


# ── Status counts ─────────────────────────────────────────────────────────────
@router.get("/status-counts")
async def status_counts(db: AsyncSession = Depends(get_db)):
    """Returns total count per status. Used for filter badge numbers."""
    rows = (await db.execute(
        select(Agreement.status, func.count(Agreement.id)).group_by(Agreement.status)
    )).all()
    return {str(row[0].value): row[1] for row in rows}


# ── Get detail ────────────────────────────────────────────────────────────────
@router.get("/{agreement_id}", response_model=AgreementOut)
async def get_agreement(agreement_id: str, db: AsyncSession = Depends(get_db)):
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    return ag


# ── Upload file → OCR → create Agreement ─────────────────────────────────────
@router.post("/upload")
async def upload_and_ocr(
    file: UploadFile = File(...),
    actor: str = Form(default="sales"),
    db: AsyncSession = Depends(get_db),
):
    allowed = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
    if file.content_type not in allowed and not file.filename.lower().endswith((".pdf", ".jpg", ".jpeg", ".png")):
        raise HTTPException(400, "Chỉ chấp nhận PDF, JPG, PNG")

    file_bytes = await file.read()
    agreement_id = str(uuid.uuid4())

    # Create agreement in OCR_PROCESSING state
    ag = Agreement(
        id=agreement_id,
        status=AgreementStatus.OCR_PROCESSING,
        source_file_name=file.filename,
    )
    db.add(ag)
    await db.flush()
    await _log(db, agreement_id, actor, "upload", note=f"Upload file: {file.filename}")
    await db.commit()

    # Run OCR in background (fire & forget, then update)
    import asyncio
    asyncio.create_task(_run_ocr_and_update(agreement_id, file_bytes, file.filename))

    return {"agreement_id": agreement_id, "status": AgreementStatus.OCR_PROCESSING}


async def _run_ocr_and_update(agreement_id: str, file_bytes: bytes, filename: str):
    from models.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            extracted = await extract_from_file(file_bytes, filename)
            conf = _compute_avg_confidence(extracted)
            partner = extracted.get("partner", {})
            ag = await db.get(Agreement, agreement_id)
            if ag:
                ag.ai_extracted_data = extracted
                ag.reviewed_data = extracted        # start with AI data as base
                ag.confidence_avg = conf
                ag.needs_review = 1 if extracted.get("_meta", {}).get("needs_review") else 0
                ag.ma_agreement = partner.get("ma_agreement")
                ag.ten_doi_tac = partner.get("ten_doi_tac")
                ag.app_payment_channel = partner.get("app_payment_channel")
                ag.status = AgreementStatus.PENDING_REVIEW
                ag.updated_at = datetime.now(timezone.utc)
                await _log(db, agreement_id, "system", "ocr_complete",
                           note=f"OCR xong — confidence={conf}")
                await db.commit()
        except Exception as e:
            async with AsyncSessionLocal() as db2:
                ag = await db2.get(Agreement, agreement_id)
                if ag:
                    ag.status = AgreementStatus.PENDING_REVIEW
                    ag.needs_review = 1
                    await _log(db2, agreement_id, "system", "ocr_error", note=str(e))
                    await db2.commit()


# ── Update reviewed data ──────────────────────────────────────────────────────
@router.put("/{agreement_id}/data")
async def update_reviewed_data(
    agreement_id: str,
    body: ReviewDataUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404)
    ag.reviewed_data = body.reviewed_data
    ag.updated_at = datetime.now(timezone.utc)
    await _log(db, agreement_id, body.actor, "data_update", note="Cập nhật dữ liệu review")
    await db.commit()
    return {"ok": True}


# ── Field-level edit ──────────────────────────────────────────────────────────
@router.patch("/{agreement_id}/field")
async def edit_field(
    agreement_id: str,
    field_path: str,
    new_value: str,
    actor: str = "kế toán",
    db: AsyncSession = Depends(get_db),
):
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404)

    # Read old value from reviewed_data
    reviewed = dict(ag.reviewed_data or {})
    keys = field_path.split(".")
    node = reviewed
    ai_val = None
    try:
        for k in keys[:-1]:
            node = node[k]
        old_val = str(node.get(keys[-1]))
        ai_data = ag.ai_extracted_data or {}
        ai_node = ai_data
        for k in keys[:-1]:
            ai_node = ai_node.get(k, {})
        ai_val = str(ai_node.get(keys[-1]))
        node[keys[-1]] = new_value
    except Exception:
        pass

    ag.reviewed_data = reviewed
    ag.updated_at = datetime.now(timezone.utc)
    await _log(db, agreement_id, actor, "field_edit",
               field_name=field_path, old_value=old_val, new_value=new_value, ai_value=ai_val)
    await db.commit()
    return {"ok": True}


# ── Approve ───────────────────────────────────────────────────────────────────
@router.post("/{agreement_id}/approve")
async def approve(
    agreement_id: str,
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404)
    if ag.status not in (AgreementStatus.PENDING_REVIEW,):
        raise HTTPException(400, f"Không thể phê duyệt ở trạng thái: {ag.status}")
    ag.status = AgreementStatus.APPROVED
    ag.approved_by = body.actor
    ag.approved_at = datetime.now(timezone.utc)
    ag.updated_at = datetime.now(timezone.utc)
    await _log(db, agreement_id, body.actor, "approve")
    await db.commit()
    return {"ok": True, "status": ag.status}


# ── Reject ────────────────────────────────────────────────────────────────────
@router.post("/{agreement_id}/reject")
async def reject(
    agreement_id: str,
    body: RejectRequest,
    db: AsyncSession = Depends(get_db),
):
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404)
    if ag.status not in (AgreementStatus.PENDING_REVIEW,):
        raise HTTPException(400, f"Không thể từ chối ở trạng thái: {ag.status}")
    ag.status = AgreementStatus.REJECTED
    ag.rejection_note = body.note
    ag.updated_at = datetime.now(timezone.utc)
    await _log(db, agreement_id, body.actor, "reject", note=body.note)
    await db.commit()
    return {"ok": True, "status": ag.status}


# ── Activate ──────────────────────────────────────────────────────────────────
@router.post("/{agreement_id}/activate")
async def activate(
    agreement_id: str,
    body: ActivateRequest,
    db: AsyncSession = Depends(get_db),
):
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404)
    if ag.status != AgreementStatus.APPROVED:
        raise HTTPException(400, "Chỉ có thể kích hoạt hồ sơ đã duyệt")

    # Push to internal system
    import os, httpx
    push_url = os.environ.get("INTERNAL_PUSH_API_URL", "")
    if push_url:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await client.post(push_url, json={"agreement": ag.reviewed_data})
        except Exception as e:
            raise HTTPException(502, f"Push sang hệ thống chính thức thất bại: {e}")

    ag.status = AgreementStatus.ACTIVATED
    ag.updated_at = datetime.now(timezone.utc)
    await _log(db, agreement_id, body.actor, "activate")
    await db.commit()
    return {"ok": True, "status": ag.status}


# ── Audit log ─────────────────────────────────────────────────────────────────
@router.get("/{agreement_id}/audit", response_model=list[AuditLogOut])
async def get_audit(agreement_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.agreement_id == agreement_id)
        .order_by(AuditLog.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{agreement_id}/reconcile")
async def reconcile_excel(
    agreement_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload Excel nội bộ → đối soát với biểu phí hợp đồng đã OCR."""
    ag = await db.get(Agreement, agreement_id)
    if not ag:
        raise HTTPException(404, "Không tìm thấy hồ sơ")

    data = ag.reviewed_data or ag.ai_extracted_data
    if not data:
        raise HTTPException(400, "Hồ sơ chưa có dữ liệu OCR")

    allowed = {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    }
    fname = (file.filename or "").lower()
    if file.content_type not in allowed and not fname.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Chỉ chấp nhận file Excel (.xlsx, .xls)")

    file_bytes = await file.read()

    from reconcile import reconcile
    result = reconcile(file_bytes, data)
    return result
