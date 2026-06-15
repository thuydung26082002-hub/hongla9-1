"""
OCR client v3 — "Read-all, transcribe-first, self-organize".
Sends ALL pages to GreenNode LLM, gets free-form JSON, maps to internal schema.
"""
import os
import base64
import json
import re
import unicodedata
import logging
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

LLM_BASE_URL = os.environ.get("GREENNODE_LLM_BASE_URL", "https://aiplatform.vngcloud.vn/v1")
LLM_API_KEY = os.environ.get("GREENNODE_LLM_API_KEY", "")
LLM_MODEL = os.environ.get("GREENNODE_LLM_MODEL", "minimax-m2.5")

MAX_PDF_PAGES = 40  # render at most 40 pages; resolution auto-scales down for large docs

# ── Prompt v3: read-all, transcribe-first ─────────────────────────────────────
SYSTEM_PROMPT = """Bạn là chuyên gia đọc hợp đồng/phụ lục dịch vụ thanh toán. Đầu vào là TOÀN BỘ file
(có thể nhiều trang). Hãy đọc HẾT mọi trang, KHÔNG bỏ sót trang nào, KHÔNG tóm tắt.

Làm theo 2 bước trong đầu (chỉ xuất kết quả cuối):

B1. ĐỌC & CHÉP NGUYÊN VĂN
   - Với MỖI bảng (đặc biệt bảng phí): chép lại TỪNG Ô — đủ mọi dòng, mọi cột,
     kể cả ô trống (ghi ""). Bảng có ô gộp / tiêu đề nhiều tầng thì LÀM PHẲNG tên cột
     thành đường dẫn, vd "Kênh khác > Zalopay Gateway > Thẻ nội địa".
   - Với phần văn xuôi: trích MỌI cặp "thông tin : giá trị" gặp được
     (tên đối tác, mã số thuế, địa chỉ, mã hợp đồng, số tài khoản, ngân hàng,
      ngày tháng, kênh thanh toán... và bất cứ gì khác có trong tài liệu).

B2. TỰ TỔ CHỨC (KHÔNG ép khuôn)
   - Nhóm các mẩu thông tin LIÊN QUAN lại với nhau dựa trên nội dung ĐỌC ĐƯỢC,
     tự đặt tên trường theo đúng cách tài liệu gọi. KHÔNG bắt buộc phải có trường nào.
   - Mẩu nào không chắc thuộc nhóm nào → vẫn GIỮ LẠI trong "khac", đừng bỏ.

QUY TẮC:
- Giữ NGUYÊN VĂN giá trị: "1.1%/giá trị giao dịch", "Miễn phí", "Hoàn lại",
  "Không hoàn lại khoản Phí hỗ trợ dịch vụ đã tính trước đó"... KHÔNG quy đổi, KHÔNG diễn giải.
- Đọc được mục VAT ở header bảng ("đã/chưa bao gồm VAT") thì ghi lại.
- Không tìm thấy → để "" hoặc bỏ trống. TUYỆT ĐỐI KHÔNG bịa.
- Mỗi mục kèm "confidence" 0–1.
- Mọi giá trị trường phải là STRING THUẦN hoặc null — TUYỆT ĐỐI KHÔNG dùng object {"value","confidence"}.
- Tên Merchant (đối tác) = công ty ký HĐ với Zion/ZaloPay — KHÔNG phải Zion, KHÔNG phải ZaloPay.
- TỰ KIỂM trước khi trả: (a) đã đọc hết mọi trang chưa? (b) mỗi bảng phí đã chép đủ
  MỌI dòng và MỌI ô chưa? Nếu còn thiếu, đọc lại rồi mới xuất.

TRẢ VỀ DUY NHẤT một JSON (không markdown, không ```):
{
  "so_trang_da_doc": 0,
  "muc_tim_thay": [],
  "thong_tin": [
    { "truong": "", "gia_tri": "", "confidence": 0.9, "vi_tri": "" }
  ],
  "bang_phi": [
    {
      "tieu_de": "",
      "bao_gom_vat": null,
      "cot": [],
      "dong": [ { "loai_phi": "", "o": { "<tên cột>": "<giá trị nguyên văn hoặc ''>" } } ],
      "ghi_chu": []
    }
  ],
  "khac": []
}"""

USER_PROMPT = "File hợp đồng ZaloPay — {n} ảnh/trang. Đọc HẾT, trả JSON theo schema, không markdown, không ```."

# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_values(obj: Any) -> Any:
    """Flatten {value, confidence, source_text} objects the model sometimes returns."""
    if isinstance(obj, dict):
        if "value" in obj and set(obj.keys()) <= {"value", "confidence", "source_text"}:
            return obj["value"]
        return {k: _normalize_values(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_values(i) for i in obj]
    return obj


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


_ZION_TOKENS = {"zion", "zalopay", "zalo pay", "zalo"}


def _is_zion(name: str) -> bool:
    if not name:
        return False
    low = name.lower()
    return any(t in low for t in _ZION_TOKENS)


def _find(thong_tin: list, *keywords) -> tuple[str | None, float]:
    """Return first (gia_tri, confidence) where truong contains any keyword."""
    for item in thong_tin:
        truong = str(item.get("truong", "")).lower()
        if any(kw in truong for kw in keywords):
            val = item.get("gia_tri", "")
            return (str(val).strip() or None), float(item.get("confidence", 0.7) or 0.7)
    return None, 0.5


def _find_merchant(thong_tin: list) -> tuple[str | None, float]:
    """Find the merchant company name — not Zion/ZaloPay."""
    # Priority 1: field explicitly named as partner/merchant
    for kw in ("đối tác", "merchant", "tên công ty", "tên đơn vị", "bên a", "bên b"):
        for item in thong_tin:
            if kw in str(item.get("truong", "")).lower():
                val = str(item.get("gia_tri", "") or "").strip()
                if val and not _is_zion(val):
                    return val, float(item.get("confidence", 0.7) or 0.7)
    # Priority 2: any company name that isn't Zion
    for item in thong_tin:
        val = str(item.get("gia_tri", "") or "").strip()
        if "công ty" in val.lower() and not _is_zion(val):
            return val, float(item.get("confidence", 0.6) or 0.6)
    return None, 0.5


def _detect_merchant_party(
    thong_tin: list, ten_doi_tac: str | None
) -> tuple[str | None, str | None]:
    """
    Return (merchant_party, zion_party) — e.g. ("bên a", "bên b").
    Identifies which "Bên X" label in thong_tin belongs to the non-Zion merchant.
    """
    merchant_party: str | None = None

    # Try to pin from the already-resolved company name
    if ten_doi_tac:
        prefix = ten_doi_tac[:8].lower()
        for item in thong_tin:
            val = str(item.get("gia_tri", "") or "").strip()
            t = str(item.get("truong", "")).lower()
            if val and (prefix in val.lower() or val[:8].lower() in ten_doi_tac.lower()):
                if "bên a" in t:
                    merchant_party = "bên a"
                    break
                if "bên b" in t:
                    merchant_party = "bên b"
                    break

    # Fallback: scan for a company-like value that is not Zion
    if not merchant_party:
        for item in thong_tin:
            val = str(item.get("gia_tri", "") or "").strip()
            t = str(item.get("truong", "")).lower()
            if ("bên" in t or "party" in t) and not _is_zion(val) and len(val) > 3:
                if "bên a" in t:
                    merchant_party = "bên a"
                    break
                if "bên b" in t:
                    merchant_party = "bên b"
                    break

    if merchant_party == "bên a":
        return "bên a", "bên b"
    if merchant_party == "bên b":
        return "bên b", "bên a"
    return None, None


def _find_for_party(
    thong_tin: list,
    merchant_party: str | None,
    zion_party: str | None,
    keywords: tuple,
) -> tuple[str | None, float]:
    """
    Find a field value preferring the merchant party label, skipping Zion's party.
    Falls back to plain _find() if party info is unavailable.
    """
    # 1. Field explicitly tagged with the merchant party label
    if merchant_party:
        for item in thong_tin:
            tr = str(item.get("truong", "")).lower()
            if any(k in tr for k in keywords) and merchant_party in tr:
                v = str(item.get("gia_tri", "") or "").strip()
                return (v or None), float(item.get("confidence", 0.7) or 0.7)
    # 2. Any match that does NOT belong to Zion's party
    for item in thong_tin:
        tr = str(item.get("truong", "")).lower()
        if zion_party and zion_party in tr:
            continue
        if any(k in tr for k in keywords):
            v = str(item.get("gia_tri", "") or "").strip()
            return (v or None), float(item.get("confidence", 0.7) or 0.7)
    # 3. Plain fallback
    return _find(thong_tin, *keywords)


def _find_merchant_payment(
    thong_tin: list,
    merchant_party: str | None,
    zion_party: str | None,
) -> tuple[str | None, str | None, str | None, str | None, float]:
    """Return (so_tai_khoan, ten_chu, ngan_hang, chi_nhanh, conf_stk) for the merchant."""
    so_tk, c_stk = _find_for_party(thong_tin, merchant_party, zion_party,
                                    ("số tài khoản", "stk", "số tk", "account number"))
    ten_chu, _ = _find_for_party(thong_tin, merchant_party, zion_party,
                                  ("tên tài khoản", "tên chủ", "chủ tài khoản", "account holder", "tên tk"))
    ngan_hang, _ = _find_for_party(thong_tin, merchant_party, zion_party,
                                    ("ngân hàng", "bank", "nhà băng"))
    chi_nhanh, _ = _find_for_party(thong_tin, merchant_party, zion_party,
                                    ("chi nhánh", "branch", "cn "))
    return so_tk, ten_chu, ngan_hang, chi_nhanh, c_stk


# ── T1 template auto-assignment ───────────────────────────────────────────────

def _vi_norm(s: str) -> str:
    """Lowercase, strip diacritics for fuzzy matching."""
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


_T1_ROWS = [
    "Phí dịch vụ",
    "Phí xử lý hoàn trả",
    "Hoàn phí giao dịch thanh toán thành công cho đơn hàng hoàn trả",
]
_T1_COLS = [
    "Kênh Zalopay App",
    "Kênh khác > Zalopay Gateway > Thẻ nội địa",
    "Kênh khác > Zalopay Gateway > Thẻ quốc tế",
    "Kênh khác > Quét Mã QR đa năng",
]
# Keyword lists — row 3 checked before row 2 to avoid false "hoan" match
_T1_ROW_KEYS = [
    ["phi dich vu", "dich vu", "service fee", "phi gd"],
    ["hoan tra", "xu ly hoan tra", "xu ly hoan", "phi hoan tra", "refund fee"],
    ["hoan phi giao dich", "hoan lai giao dich", "hoan phi", "hoan lai"],
]
_T1_COL_KEYS = [
    ["zalopay app", "kenh zalopay", "app zalopay", "vi zalopay", "balance"],
    ["noi dia", "the noi dia", "atm noi", "gateway noi dia"],
    ["quoc te", "the quoc te", "visa", "mastercard", "gateway quoc te"],
    ["qr", "quet ma", "ma qr", "qr da nang"],
]


def _match_t1_row(loai_phi: str) -> str | None:
    if not loai_phi:
        return None
    norm = _vi_norm(loai_phi)
    for row in _T1_ROWS:
        if _vi_norm(row) == norm:
            return row
    # Check more specific rows first (row index 2, then 1, then 0)
    for i in [2, 1, 0]:
        for key in _T1_ROW_KEYS[i]:
            if key in norm:
                return _T1_ROWS[i]
    return None


def _match_t1_col(col_name: str) -> str | None:
    if not col_name:
        return None
    norm = _vi_norm(col_name)
    for col in _T1_COLS:
        if _vi_norm(col) == norm:
            return col
    for i, keys in enumerate(_T1_COL_KEYS):
        for key in keys:
            if key in norm:
                return _T1_COLS[i]
    return None


def _map_freeform_to_schema(raw: dict) -> dict:
    """
    Map v3 free-form OCR output → internal partner/payment/fee schema.
    Raw keys: so_trang_da_doc, thong_tin, bang_phi, khac, muc_tim_thay
    """
    thong_tin: list = raw.get("thong_tin") or []
    bang_phi: list = raw.get("bang_phi") or []

    # ── Identify merchant party once, reuse across all fields ────────────────
    ten_doi_tac, c_tdt = _find_merchant(thong_tin)
    merchant_party, zion_party = _detect_merchant_party(thong_tin, ten_doi_tac)

    # ── Partner ──────────────────────────────────────────────────────────────
    ma_so_thue, c_mst = _find_for_party(thong_tin, merchant_party, zion_party,
                                         ("mã số thuế", "mst", "msdn", "tax"))
    dia_chi, _ = _find_for_party(thong_tin, merchant_party, zion_party,
                                  ("địa chỉ xuất hóa đơn", "địa chỉ xuất", "địa chỉ hóa đơn",
                                   "trụ sở chính", "địa chỉ đăng ký", "địa chỉ"))
    ma_agreement, c_ma = _find(thong_tin,
                                "mã agreement", "mã hợp đồng", "số hợp đồng",
                                "phụ lục số", "số phụ lục", "agreement no")
    app_channel, _ = _find(thong_tin, "kênh thanh toán", "app payment", "payment channel", "kênh dịch vụ")
    ngay_ky, _ = _find(thong_tin, "ngày ký kết", "ngày ký", "ngày lập", "ngày hợp đồng",
                        "ký ngày", "ký vào ngày")
    ngay_tinh_phi, _ = _find(thong_tin, "ngày bắt đầu tính phí", "ngày áp dụng", "hiệu lực từ")

    # ── Payment — merchant-party-aware to exclude Zion's account ─────────────
    so_tk, _ten_chu_ocr, ngan_hang, chi_nhanh, c_stk = _find_merchant_payment(
        thong_tin, merchant_party, zion_party
    )
    # Tên chủ tài khoản = tên partner (không cần OCR riêng)
    ten_chu = ten_doi_tac or _ten_chu_ocr

    # ── Fee cells (flattened from bang_phi) ───────────────────────────────────
    cells: list = []
    auto_assignments: dict = {}
    notes: list = []
    source_section: str | None = None
    vat_included: bool | None = None

    for table in bang_phi:
        if not source_section and table.get("tieu_de"):
            source_section = str(table["tieu_de"]).strip()
        if vat_included is None and table.get("bao_gom_vat") is not None:
            raw_vat = table["bao_gom_vat"]
            if isinstance(raw_vat, bool):
                vat_included = raw_vat
            else:
                s = str(raw_vat).lower()
                # "chưa bao gồm" / "excl" → False; "đã bao gồm" / "incl" → True
                if any(k in s for k in ("chưa", "chua", "excl", "không gồm")):
                    vat_included = False
                elif any(k in s for k in ("đã bao gồm", "da bao gom", "incl", "including")):
                    vat_included = True
        notes.extend(str(n) for n in (table.get("ghi_chu") or []) if n)

        for row in (table.get("dong") or []):
            loai_phi = str(row.get("loai_phi") or "").strip()
            o: dict = row.get("o") or {}
            for col_name, value in o.items():
                val_str = str(value).strip() if value is not None else ""
                if val_str and val_str not in ('""', "''", "-", "—"):
                    label = f"{loai_phi} — {col_name}" if loai_phi else col_name
                    cell = {
                        "label": label.strip(" —"),
                        "raw": val_str,
                        "confidence": 0.9,
                    }
                    cells.append(cell)
                    # Auto-assign to T1 grid (first match wins per slot)
                    matched_row = _match_t1_row(loai_phi)
                    matched_col = _match_t1_col(col_name)
                    if matched_row and matched_col:
                        key = f"{matched_row}|||{matched_col}"
                        if key not in auto_assignments:
                            auto_assignments[key] = cell

    # ── field_confidence ──────────────────────────────────────────────────────
    field_confidence: dict = {}
    if c_tdt > 0.5: field_confidence["partner.ten_doi_tac"] = c_tdt
    if c_mst > 0.5: field_confidence["partner.ma_so_thue"] = c_mst
    if c_ma  > 0.5: field_confidence["partner.ma_agreement"] = c_ma
    if c_stk > 0.5: field_confidence["payment.so_tai_khoan"] = c_stk

    return {
        "partner": {
            "ten_doi_tac": ten_doi_tac,
            "ma_so_thue": ma_so_thue,
            "dia_chi_xuat_hoa_don": dia_chi,
            "ma_agreement": ma_agreement,
            "app_payment_channel": app_channel,
            "ngay_ky": ngay_ky,
            "ngay_bat_dau_tinh_phi": ngay_tinh_phi,
        },
        "payment": {
            "so_tai_khoan": so_tk,
            "ten_chu_tai_khoan": ten_chu,
            "ngan_hang_thu_huong": ngan_hang,
            "chi_nhanh": chi_nhanh,
        },
        "fee": {
            "source_section": source_section,
            "vat_included": vat_included,
            "cells": cells,
            "assignments": auto_assignments,
            "notes": notes,
            "metadata": {
                "stt": None,
                "ma_agreement": ma_agreement,
                "ten_agreement": None,
                "trang_thai_agreement": "Chờ duyệt",
                "ten_merchant": ten_doi_tac,
                "app_payment": app_channel,
                "thoi_gian_hoan_tien_toi_da_ngay": None,
                "ngay_bat_dau_tinh_phi": ngay_tinh_phi,
                "ngay_duyet_agreement": None,
                "thue_vat": None,
                "loai_cong_thuc": None,
            },
        },
        "_meta": {
            "field_confidence": field_confidence,
            "needs_review": True,
            "_raw_ocr": raw,  # keep raw output for debugging
        },
    }


# ── Empty skeleton returned on total failure ──────────────────────────────────
def _empty_skeleton(error: str) -> dict:
    return {
        "partner": {
            "ten_doi_tac": None, "ma_so_thue": None, "dia_chi_xuat_hoa_don": None,
            "ma_agreement": None, "app_payment_channel": None,
            "ngay_ky": None, "ngay_bat_dau_tinh_phi": None,
        },
        "payment": {
            "so_tai_khoan": None, "ten_chu_tai_khoan": None,
            "ngan_hang_thu_huong": None, "chi_nhanh": None,
        },
        "fee": {
            "source_section": None, "vat_included": None,
            "cells": [], "notes": [],
            "metadata": {
                "stt": None, "ma_agreement": None, "ten_agreement": None,
                "trang_thai_agreement": "Chờ duyệt", "ten_merchant": None,
                "app_payment": None, "thoi_gian_hoan_tien_toi_da_ngay": None,
                "ngay_bat_dau_tinh_phi": None, "ngay_duyet_agreement": None,
                "thue_vat": None, "loai_cong_thuc": None,
            },
        },
        "_meta": {"field_confidence": {}, "needs_review": True, "ocr_error": error},
    }


# ── Main extraction entry point ───────────────────────────────────────────────

async def extract_from_file(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Send ALL pages/images to GreenNode LLM and return mapped schema."""
    suffix = Path(filename).suffix.lower()
    content_parts: list = []
    num_images = 0

    if suffix in (".jpg", ".jpeg"):
        b64 = base64.b64encode(file_bytes).decode()
        content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        num_images = 1

    elif suffix == ".png":
        b64 = base64.b64encode(file_bytes).decode()
        content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
        num_images = 1

    else:
        # PDF — render ALL pages (up to MAX_PDF_PAGES)
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            total = len(doc)
            num_images = min(total, MAX_PDF_PAGES)
            if total > MAX_PDF_PAGES:
                logger.warning("PDF has %d pages; sending first %d", total, MAX_PDF_PAGES)
            # Use lower resolution for large PDFs to avoid token overflow
            scale = 1.5 if num_images > 15 else 2.0
            for i in range(num_images):
                pix = doc[i].get_pixmap(matrix=fitz.Matrix(scale, scale))
                b64 = base64.b64encode(pix.tobytes("jpeg", jpg_quality=75)).decode()
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                })
        except Exception as e:
            logger.error("PDF render failed: %s", e)
            content_parts.append({
                "type": "text",
                "text": f"[File PDF '{filename}' không render được: {e}]",
            })
            num_images = 0

    # Prepend user instruction text
    content_parts.insert(0, {"type": "text", "text": USER_PROMPT.format(n=num_images or 1)})

    headers = {"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": content_parts},
        ],
        "max_tokens": 4096,
        "temperature": 0,
    }

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(f"{LLM_BASE_URL}/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            raw_text = resp.json()["choices"][0]["message"]["content"]
            logger.info("OCR raw response length=%d pages_sent=%d", len(raw_text), num_images)
            logger.debug("OCR raw: %s", raw_text[:2000])

            cleaned = _strip_json_fence(raw_text)
            freeform = json.loads(cleaned)
            freeform = _normalize_values(freeform)  # safety net

            mapped = _map_freeform_to_schema(freeform)
            mapped["_meta"]["needs_review"] = True
            return mapped

    except Exception as e:
        logger.exception("OCR extraction failed: %s", e)
        return _empty_skeleton(str(e))
