# ZaloPay Agreement OCR

Hệ thống tự động hóa quy trình xử lý hợp đồng/phụ lục dịch vụ thanh toán ZaloPay — từ file PDF thô đến Agreement đã duyệt sẵn sàng kích hoạt.

**Luồng chính:**  
`Upload PDF` → `AI đọc & trích xuất` → `Kế toán review` → `Phê duyệt` → `Kích hoạt & push hệ thống`

---

## Tính năng

- **OCR đa trang**: Render toàn bộ trang PDF thành ảnh, gửi một lần cho GreenNode LLM (Gemma 4 31B multimodal) — đọc được cả hợp đồng scan, nhiều trang, bảng phí nhiều tầng header
- **Tự động mapping biểu phí**: Nhận dạng và map vào schema T1 chuẩn (ZaloPay App / Thẻ nội địa / Thẻ quốc tế / QR đa năng)
- **3 nguồn nhận file**: Upload trực tiếp trên web, bỏ file vào S3 bucket, hoặc Google Drive
- **Workflow duyệt**: Sales upload → Kế toán nhận thông báo → review/sửa từng trường → Phê duyệt / Từ chối → Kích hoạt
- **Audit log**: Ghi lại toàn bộ lịch sử thao tác (ai, lúc nào, giá trị cũ/mới)
- **Đối soát Excel**: Upload file Excel nội bộ → so sánh tự động với biểu phí từ hợp đồng
- **Kho lưu trữ**: Quản lý toàn bộ file trên S3, xem trạng thái OCR và duyệt

---

## Kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                    │
│  Tab: Danh sách hồ sơ  │  Tab: Kho lưu trữ (S3)        │
└──────────────┬──────────────────────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────────────────────┐
│                   BACKEND (FastAPI)                     │
│                                                         │
│  /api/agreements   — CRUD, approve, reject, activate    │
│  /api/storage      — S3 list, upload, download          │
│                                                         │
│  Background workers:                                    │
│  ├── S3 Poller     — scan S3 uploads/ mỗi 60s           │
│  └── Drive Poller  — scan Google Drive folder           │
│                                                         │
│  OCR Pipeline:                                          │
│  PDF/IMG → PyMuPDF render → base64 images               │
│         → GreenNode LLM (Gemma 4 31B) → JSON tự do     │
│         → _map_freeform_to_schema() → Agreement DB      │
└──────────┬──────────────────┬───────────────────────────┘
           │                  │
    ┌──────▼──────┐   ┌───────▼────────┐
    │  SQLite DB  │   │  VNG vStorage  │
    │ (agreements │   │  S3 bucket     │
    │  audit log) │   │  (file gốc)    │
    └─────────────┘   └────────────────┘
```

---

## Cấu trúc dự án

```
zalopay-agreement-ocr/
├── Dockerfile                  # Multi-stage: Node build → Python runtime
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Root component, routing, role switching
│   │   ├── components/
│   │   │   ├── AgreementTable.tsx   # Bảng danh sách + filter + pagination
│   │   │   ├── ReviewModal.tsx      # Full-screen modal review hồ sơ
│   │   │   ├── StorageTab.tsx       # Kho lưu trữ S3
│   │   │   ├── AiField.tsx          # Field hiển thị giá trị AI + inline edit
│   │   │   └── UploadZone.tsx       # Drag & drop upload
│   │   └── hooks/useApi.ts          # API client hooks
│   └── package.json
└── backend/
    ├── main.py                 # FastAPI app, lifespan, poller startup
    ├── requirements.txt
    ├── ocr/
    │   └── client.py           # OCR pipeline: render → LLM → mapping
    ├── routers/
    │   ├── agreements.py       # CRUD, upload, approve/reject/activate
    │   └── storage.py          # S3 list/upload/download/delete
    ├── models/
    │   ├── db.py               # SQLAlchemy models (Agreement, AuditLog)
    │   ├── database.py         # DB session, init
    │   └── schemas.py          # Pydantic response schemas
    ├── worker/
    │   ├── s3_poller.py        # Poll S3 uploads/ cho file mới
    │   └── drive_poller.py     # Poll Google Drive folder
    ├── storage/
    │   ├── s3.py               # boto3 S3 client wrapper
    │   └── drive.py            # Google Drive API wrapper
    └── reconcile.py            # Đối soát Excel vs biểu phí hợp đồng
```

---

## Biến môi trường

Tạo file `.env.runtime` từ mẫu dưới đây:

```env
# ── GreenNode LLM (OCR) ───────────────────────────────────
GREENNODE_LLM_BASE_URL=https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1
GREENNODE_LLM_API_KEY=<api-key>
GREENNODE_LLM_MODEL=google/gemma-3-27b-it

# ── VNG Cloud vStorage S3 ────────────────────────────────
S3_ENDPOINT_URL=https://hcm04.vstorage.vngcloud.vn
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>
S3_BUCKET_NAME=zalopay-agreements

# ── Google Drive (tuỳ chọn) ──────────────────────────────
DRIVE_FOLDER_ID=<folder-id>
DRIVE_SERVICE_ACCOUNT_JSON=<base64-encoded-service-account-json>

# ── Hệ thống nội bộ (tuỳ chọn) ──────────────────────────
INTERNAL_PUSH_API_URL=<url-nhận-agreement-khi-kích-hoạt>

# ── Poller ───────────────────────────────────────────────
POLL_INTERVAL_SEC=60
```

---

## Chạy local

### Yêu cầu
- Python 3.12+
- Node.js 20+
- (Tuỳ chọn) Docker Desktop

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env.runtime   # điền thông tin credentials
uvicorn main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # dev server tại http://localhost:5173, proxy /api → :8080
```

### Docker (all-in-one)

```bash
docker build --platform linux/amd64 -t zalopay-agreement-ocr .
docker run -p 8080:8080 --env-file .env.runtime zalopay-agreement-ocr
```

Mở http://localhost:8080

---

## Deploy lên GreenNode AgentBase

### 1. Build & push image

```bash
# Đăng nhập container registry
bash .claude/skills/agentbase/scripts/cr.sh credentials docker-login

# Build
docker build --platform linux/amd64 \
  -t vcr.vngcloud.vn/<repo>/zalopay-agreement-ocr:latest .

# Push
docker push vcr.vngcloud.vn/<repo>/zalopay-agreement-ocr:latest
```

### 2. Tạo hoặc update runtime

```bash
# Tạo mới
bash .claude/skills/agentbase/scripts/runtime.sh create \
  --name zalopay-agreement-ocr \
  --image vcr.vngcloud.vn/<repo>/zalopay-agreement-ocr:latest \
  --flavor runtime-s2-general-2x4 \
  --env-file .env.runtime \
  --from-cr

# Update image (giữ nguyên cấu hình)
bash .claude/skills/agentbase/scripts/runtime.sh update <runtime-id> \
  --image vcr.vngcloud.vn/<repo>/zalopay-agreement-ocr:latest \
  --flavor runtime-s2-general-2x4 \
  --env-file .env.runtime \
  --from-cr
```

> **Lưu ý:** Luôn truyền `--env-file` khi update — nếu bỏ qua, env vars sẽ bị reset và S3/LLM mất kết nối.

---

## Cài ổ đĩa S3 trên Windows (rclone)

Nhân viên có thể mount S3 bucket thành ổ đĩa `S:\` để bỏ file PDF trực tiếp — hệ thống sẽ tự nhận và OCR.

### Yêu cầu
- [rclone](https://rclone.org/downloads/) v1.74+
- [WinFSP](https://winfsp.dev/rel/) 2.x

### Cấu hình rclone

Thêm vào `%AppData%\rclone\rclone.conf`:

```ini
[zalopay-s3]
type = s3
provider = Other
endpoint = https://hcm04.vstorage.vngcloud.vn
access_key_id = <access-key>
secret_access_key = <secret-key>
region = hcm04
acl = private
```

### Mount ổ đĩa

```powershell
rclone mount zalopay-s3:zalopay-agreements/uploads S: `
  --vfs-cache-mode full --vfs-cache-max-age 24h `
  --dir-cache-time 30s --poll-interval 15s --volname ZaloPay-S3
```

### Tự động mount khi khởi động

Đăng ký 2 trigger trong Task Scheduler (AtLogon + AtStartup với delay 30s) chạy script mount. Xem hướng dẫn chi tiết tại `SETUP-MAY-MOI.ps1`.

---

## Workflow duyệt hồ sơ

```
[Sales]                          [Kế toán]
   │                                 │
   ▼                                 │
Upload PDF/IMG                       │
   │                                 │
   ▼                                 │
Đang xử lý OCR                       │
(AI đọc hợp đồng ~30-60s)            │
   │                                 │
   ▼                                 ▼
Chờ duyệt ──────────────────► Review hồ sơ
                                     │ (sửa trường sai nếu cần)
                              ┌──────┴──────┐
                              ▼             ▼
                           Đã duyệt     Từ chối
                              │
                              ▼
                           Kích hoạt
                    (push sang hệ thống chính thức)
```

---

## Schema biểu phí (T1)

Hệ thống tự động map biểu phí hợp đồng vào schema chuẩn:

| Loại phí | Kênh ZaloPay App | Thẻ nội địa | Thẻ quốc tế | QR đa năng |
|----------|-----------------|-------------|-------------|-----------|
| Phí dịch vụ | ... | ... | ... | ... |
| Phí xử lý hoàn trả | ... | ... | ... | ... |
| Hoàn phí giao dịch | ... | ... | ... | ... |

Hỗ trợ nhiều cấu trúc bảng: header 2 tầng (`Zalopay Gateway > Thẻ nội địa`), bảng row-based (tên kênh trong cột loại phí), bảng phụ lục bổ sung.

---

## Lưu ý vận hành

| Vấn đề | Giải pháp |
|--------|----------|
| SQLite mất data khi container restart | Migrate sang Postgres hoặc gắn persistent volume |
| Ổ S: mất kết nối | Chạy lại `mount-s3-drive.ps1` hoặc kiểm tra Task Scheduler |
| OCR đọc sai biểu phí | Chạy `python debug_ocr.py <file.pdf>` trong thư mục `backend/` |
| S3 hiện "Kho lưu trữ chưa cấu hình" | Kiểm tra env vars `S3_*`, re-deploy với `--env-file` |
| File bỏ vào S:\ không trigger OCR | Đảm bảo mount trỏ vào `zalopay-agreements/uploads`, không phải root bucket |

---

## Tech stack

| Layer | Công nghệ |
|-------|----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite, Lucide icons |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| OCR | PyMuPDF (render PDF), GreenNode MAAS Gemma 4 31B-IT |
| Storage | VNG Cloud vStorage (S3-compatible), Google Drive API |
| Deploy | Docker, GreenNode AgentBase Runtime |
| Windows sync | rclone v1.74, WinFSP 2.x, Windows Task Scheduler |
