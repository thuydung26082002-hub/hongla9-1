# ZaloPay Agreement Automation — OCR-powered Partner Onboarding

Web app tự động hóa việc trích xuất dữ liệu từ hợp đồng/phụ lục ZaloPay, tạo hồ sơ đối tác (Agreement), và cho kế toán review → phê duyệt/từ chối.

**Luồng:** Upload PDF/ảnh → GreenNode AI OCR → tạo Agreement (Chờ duyệt) → kế toán review + phê duyệt → Kích hoạt → push sang hệ thống chính thức.

---

## Cấu trúc dự án

```
zalopay-agreement-ocr/
├── frontend/          # React + TypeScript + Tailwind (SPA)
├── backend/           # FastAPI: REST API + Worker OCR + static serve
│   ├── main.py
│   ├── ocr/client.py  # GreenNode LLM multimodal OCR
│   ├── routers/       # agreements CRUD + approve/reject/activate
│   ├── models/        # SQLAlchemy (SQLite dev / Postgres prod)
│   └── worker/        # Drive poller (cron)
├── Dockerfile         # Multi-stage: node build → python runtime
└── .env.example       # Template env vars
```

---

## Quick start (local dev)

### Backend

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in values
uvicorn main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # proxies /api → localhost:8080
```

Mở http://localhost:5173

---

## Build & Deploy lên GreenNode AgentBase

```bash
# 1. Cấu hình IAM
export GREENNODE_CLIENT_ID="..."
export GREENNODE_CLIENT_SECRET="..."

# 2. Build + push image
/agentbase-deploy build
/agentbase-deploy push

# 3. Deploy Custom Agent Runtime PUBLIC
/agentbase-deploy deploy \
  --visibility PUBLIC \
  --port 8080 \
  --env-file .env.runtime

# 4. Lấy URL endpoint
/agentbase-deploy runtime list
```

---

## Biến môi trường cần thiết

| Biến | Ý nghĩa |
|------|---------|
| `GREENNODE_LLM_BASE_URL` | Endpoint OpenAI-compatible GreenNode |
| `GREENNODE_LLM_API_KEY` | API key LLM (tạo bằng `/agentbase-llm`) |
| `GREENNODE_LLM_MODEL` | Model multimodal (vd: `minimax-m2.5`) |
| `DRIVE_FOLDER_ID` | `1HTQghNunhDvIKbx_IRMH_j6YXVNBZbdp` |
| `DRIVE_GATEWAY_URL` | MCP gateway tới Google Drive |
| `INTERNAL_PUSH_API_URL` | Endpoint hệ thống chính thức |
| `DATABASE_URL` | Postgres (prod) hoặc SQLite (dev) |

Xem đầy đủ tại `.env.example`.
