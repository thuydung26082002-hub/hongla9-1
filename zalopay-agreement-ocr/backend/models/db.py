from datetime import datetime
from sqlalchemy import Column, String, Text, Float, Integer, DateTime, JSON, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import declarative_base, relationship
import enum

Base = declarative_base()


class AgreementStatus(str, enum.Enum):
    OCR_PROCESSING = "Đang xử lý OCR"
    PENDING_REVIEW = "Chờ duyệt"
    APPROVED = "Đã duyệt"
    REJECTED = "Từ chối"
    ACTIVATED = "Đã kích hoạt"


class Agreement(Base):
    __tablename__ = "agreements"

    id = Column(String, primary_key=True)
    ma_agreement = Column(String, index=True)
    ten_doi_tac = Column(String)
    app_payment_channel = Column(String)
    status = Column(SAEnum(AgreementStatus), default=AgreementStatus.OCR_PROCESSING)
    # Raw AI extraction result (full JSON)
    ai_extracted_data = Column(JSON, nullable=True)
    # Human-reviewed/edited data
    reviewed_data = Column(JSON, nullable=True)
    confidence_avg = Column(Float, nullable=True)
    needs_review = Column(Integer, default=0)
    rejection_note = Column(Text, nullable=True)
    source_file_name = Column(String, nullable=True)
    source_drive_file_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)

    audit_logs = relationship("AuditLog", back_populates="agreement", order_by="AuditLog.created_at")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agreement_id = Column(String, ForeignKey("agreements.id"), index=True)
    actor = Column(String)
    action = Column(String)          # e.g. field_edit, approve, reject, activate
    field_name = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    ai_value = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agreement = relationship("Agreement", back_populates="audit_logs")
