"""
OCR client — sends contract file (PDF/image, base64) to GreenNode LLM
and returns structured JSON per the 3-module schema.
"""
import os
import base64
import json
import re
import logging
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

LLM_BASE_URL = os.environ.get("GREENNODE_LLM_BASE_URL", "https://aiplatform.vngcloud.vn/v1")
LLM_API_KEY = os.environ.get("GREENNODE_LLM_API_KEY", "")
LLM_MODEL = os.environ.get("GREENNODE_LLM_MODEL", "minimax-m2.5")

SYSTEM_PROMPT = """Bạn là trợ lý bóc tách hợp đồng tài chính ZaloPay.
Nhận file hợp đồng/phụ lục. Trả về DUY NHẤT một JSON đúng schema được cung cấp (Module 1/2/3).
Trường nào không tìm thấy → null, không suy đoán.
Mỗi trường quan trọng kèm confidence (0-1) và source_text (đoạn text gốc bóc ra).
Số tiền chuẩn hóa về số nguyên VND (bỏ dấu chấm/phẩy ngăn cách).
% để dạng số (2.35 nghĩa là 2.35%).
YES/NO viết hoa.
Không thêm lời giải thích, không markdown, không ```json fence."""

FEE_SCHEMA = {
    "vi_zalopay": {
        ch: {"so_tien_vnd": None, "phan_tram": None, "min": None, "max": None}
        for ch in ["Ví ZaloPay (Balance)", "ATM", "TK ngân hàng", "VietQR", "TKTS", "Số dư sinh lời", "CC (trong nước)", "CC (nước ngoài)"]
    },
    "cong_zalopay": {
        ch: {"so_tien_vnd": None, "phan_tram": None, "min": None, "max": None}
        for ch in ["ATM", "TK ngân hàng", "VietQR", "TKTS", "Số dư sinh lời", "CC (trong nước)", "CC (nước ngoài)"]
    },
}

REFUND_SCHEMA = {
    "vi_zalopay": {
        ch: {"so_tien_vnd": None, "phan_tram": None, "min": None, "max": None, "hoan_phi_co_dinh": None, "hoan_phi_phan_tram": None}
        for ch in ["Ví ZaloPay (Balance)", "ATM", "TK ngân hàng", "VietQR", "TKTS", "Số dư sinh lời", "CC (trong nước)", "CC (nước ngoài)"]
    },
    "cong_zalopay": {
        ch: {"so_tien_vnd": None, "phan_tram": None, "min": None, "max": None, "hoan_phi_co_dinh": None, "hoan_phi_phan_tram": None}
        for ch in ["ATM", "TK ngân hàng", "VietQR", "TKTS", "Số dư sinh lời", "CC (trong nước)", "CC (nước ngoài)"]
    },
}

EXTRACTION_SCHEMA = {
    "partner": {
        "ten_doi_tac": None, "ma_so_thue": None, "dia_chi_xuat_hoa_don": None,
        "ma_agreement": None, "app_payment_channel": None, "ngay_ky": None, "ngay_bat_dau_tinh_phi": None,
    },
    "payment": {
        "so_tai_khoan": None, "ten_chu_tai_khoan": None, "ngan_hang_thu_huong": None, "chi_nhanh": None,
    },
    "fee": {
        "metadata": {
            "stt": None, "ma_agreement": None, "ten_agreement": None,
            "trang_thai_agreement": "Chờ duyệt", "ten_merchant": None, "app_payment": None,
            "thoi_gian_hoan_tien_toi_da_ngay": None, "ngay_bat_dau_tinh_phi": None,
            "ngay_duyet_agreement": None, "thue_vat": None, "loai_cong_thuc": None,
        },
        "phi_giao_dich": FEE_SCHEMA,
        "phi_hoan_tien": REFUND_SCHEMA,
        "cong_thuc_dac_biet": {
            "phi_gd_phan_tram_item": {"phan_tram_phi_chia_se": None, "min": None, "max": None},
            "phi_hoan_phan_tram_item": {"phan_tram_phi_chia_se": None, "min": None, "max": None, "hoan_phi": None, "hoan_phi_khi_hoan_tien_tung_phan": None},
            "phi_gd_so_luong_item": {"so_tien": None, "min": None, "max": None},
            "phi_hoan_so_luong_item": {"so_tien": None, "min": None, "max": None, "hoan_phi": None},
            "phi_hoan_co_dinh_thang": {"so_luong_gd_refund_va_phi_moi_gd": None, "hoan_phi": None},
        },
    },
    "_meta": {"field_confidence": {}, "needs_review": True},
}

USER_PROMPT_TEMPLATE = """Đây là file hợp đồng ZaloPay cần bóc tách.
Schema JSON cần điền:
{schema}

Hãy điền đúng schema trên từ nội dung hợp đồng. Trả về JSON thuần, không markdown."""


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _compute_avg_confidence(data: dict) -> float:
    confidences = []
    for v in data.get("_meta", {}).get("field_confidence", {}).values():
        if isinstance(v, (int, float)):
            confidences.append(float(v))
    return round(sum(confidences) / len(confidences), 2) if confidences else 0.5


async def extract_from_file(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Send file to GreenNode LLM multimodal endpoint and parse extracted JSON."""
    import copy
    schema_copy = copy.deepcopy(EXTRACTION_SCHEMA)

    suffix = Path(filename).suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
        b64 = base64.b64encode(file_bytes).decode()
        content_parts = [
            {"type": "text", "text": USER_PROMPT_TEMPLATE.format(schema=json.dumps(schema_copy, ensure_ascii=False, indent=2))},
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
        ]
    elif suffix == ".png":
        media_type = "image/png"
        b64 = base64.b64encode(file_bytes).decode()
        content_parts = [
            {"type": "text", "text": USER_PROMPT_TEMPLATE.format(schema=json.dumps(schema_copy, ensure_ascii=False, indent=2))},
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
        ]
    else:
        # PDF — convert first page to image
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc[0]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_bytes = pix.tobytes("jpeg")
            b64 = base64.b64encode(img_bytes).decode()
            media_type = "image/jpeg"
            content_parts = [
                {"type": "text", "text": USER_PROMPT_TEMPLATE.format(schema=json.dumps(schema_copy, ensure_ascii=False, indent=2))},
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
            ]
        except Exception as e:
            logger.error("PDF to image failed: %s", e)
            # Fallback: send as text extraction request
            content_parts = [
                {"type": "text", "text": USER_PROMPT_TEMPLATE.format(schema=json.dumps(schema_copy, ensure_ascii=False, indent=2))},
                {"type": "text", "text": f"[File PDF '{filename}' — không thể render ảnh, hãy bóc từ schema]"},
            ]

    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content_parts},
        ],
        "max_tokens": 4096,
        "temperature": 0,
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{LLM_BASE_URL}/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            raw_text = resp.json()["choices"][0]["message"]["content"]
            cleaned = _strip_json_fence(raw_text)
            extracted = json.loads(cleaned)
            extracted.setdefault("_meta", {})
            extracted["_meta"]["needs_review"] = True
            return extracted
    except Exception as e:
        logger.exception("OCR extraction failed: %s", e)
        # Return skeleton so accountant can fill manually
        schema_copy["_meta"]["needs_review"] = True
        schema_copy["_meta"]["ocr_error"] = str(e)
        return schema_copy
