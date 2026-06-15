from typing import Any, Optional
from datetime import datetime
from pydantic import BaseModel
from .db import AgreementStatus


class AgreementOut(BaseModel):
    id: str
    ma_agreement: Optional[str]
    ten_doi_tac: Optional[str]
    app_payment_channel: Optional[str]
    status: AgreementStatus
    ai_extracted_data: Optional[Any]
    reviewed_data: Optional[Any]
    confidence_avg: Optional[float]
    needs_review: int
    rejection_note: Optional[str]
    source_file_name: Optional[str]
    s3_key: Optional[str]
    created_at: datetime
    updated_at: datetime
    approved_by: Optional[str]
    approved_at: Optional[datetime]

    class Config:
        from_attributes = True


class PaginatedAgreements(BaseModel):
    items: list[AgreementOut]
    total: int
    page: int
    size: int
    pages: int


class StorageFileOut(BaseModel):
    key: str
    name: str
    size: int
    last_modified: str
    has_agreement: bool
    agreement_id: Optional[str] = None
    agreement_status: Optional[str] = None


class AuditLogOut(BaseModel):
    id: int
    agreement_id: str
    actor: str
    action: str
    field_name: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    ai_value: Optional[str]
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class FieldEditRequest(BaseModel):
    field_path: str   # dot-notation: "partner.ten_doi_tac"
    new_value: Any
    actor: str = "kế toán"


class ReviewDataUpdateRequest(BaseModel):
    reviewed_data: Any
    actor: str = "kế toán"


class ApproveRequest(BaseModel):
    actor: str = "kế toán"


class RejectRequest(BaseModel):
    note: str
    actor: str = "kế toán"


class ActivateRequest(BaseModel):
    actor: str = "kế toán"
