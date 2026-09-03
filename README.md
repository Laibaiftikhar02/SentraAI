# SentraAI — AI-Powered Campus Complaint Workflow

**Automated complaint triage, routing, and resolution for universities — with humans in the loop.**

## Problem

Universities receive hundreds of unstructured complaints every week: broken infrastructure, safety issues, billing disputes, and hostel problems. These complaints arrive via email, phone, chat, or in-person, leading to:

- **Misrouting** — urgent issues land in the wrong department.
- **Duplicate noise** — the same broken light is reported ten times, inflating workload without adding information.
- **Lost urgency** — critical issues (fire, safety threats) get buried under routine reports.
- **No visibility** — administrators cannot see where problems cluster or which departments are overloaded.

## Solution

SentraAI is a web platform where students report issues, an AI engine triages them, and department admins review, route, and resolve them. A Super Admin configures departments, categories, and campus zones without writing code.

**Who it serves:**
- **Students** — submit complaints and track status.
- **Department Admins** — review AI recommendations and make final decisions.
- **Super Admins** — configure the organization, categories, departments, and campus zones.

## End-to-End Project Flow

```
Student submits complaint
        ↓
Complaint is saved immediately (AI failure cannot lose it)
        ↓
AI Triage Engine analyzes:
  • Summary
  • Category classification
  • Urgency / priority
  • Duplicate detection & clustering
  • Department routing
        ↓
Complaint appears in the right Department Admin inbox
        ↓
Admin reviews AI summary, accepts or overrides, reassigns if needed
        ↓
Admin resolves the complaint
        ↓
Student sees updated status, notification, and full history
        ↓
Heatmap & Analytics reflect the new data
```

## Key Features

- **Complaint submission** with optional file attachments (images, PDF, DOC, TXT up to 10 MB).
- **AI triage pipeline** — summary, category, priority, duplicate detection, and department routing.
- **Gemini LLM primary AI** with automatic fallback to a zero-cost local rule-based provider.
- **Human-in-the-loop control** — admins accept, modify, reassign, or resolve every complaint.
- **Duplicate clustering** — similar complaints are grouped; originals remain independent records.
- **Department Admin inbox** with search, filters, and duplicate-group visualization.
- **Campus Heatmap** — SVG visualization showing issue concentration (heat) and urgency (markers).
- **Analytics Dashboard** — volume, urgency, category, zone, duplicate-cluster, and department stats.
- **AI reporting chatbot** — English + Roman Urdu conversational issue intake.
- **In-app notifications** for status changes, assignments, and admin responses.
- **Append-only complaint history / audit timeline.**
- **Super Admin configuration** — departments, categories, admin accounts, campus zones, organization name.
- **JWT authentication** with `user`, `admin`, and `super_admin` roles.
- **AI failure safety** — complaints are persisted before AI processing and never lost if AI fails.

## What Makes the AI Meaningful

SentraAI does not replace admins. It gives them a **ranked, pre-analyzed starting point** so they spend less time on manual triage and more time on resolution.

| Capability | Gemini Mode | Local Mode |
|---|---|---|
| Primary engine | `google-genai` LLM with schema-constrained JSON output | Keyword + Jaccard-similarity rule engine |
| Cost | Free tier available via `GEMINI_API_KEY` | $0, no API key, no GPU |
| Triage output | Summary, category, priority, routing, duplicates | Same structured output |
| Chatbot | Multilingual (English + Roman Urdu) with function calling | Keyword-based fallback |
| Fallback | Automatic local fallback on missing key / error / timeout / bad output | — |

Set `AI_PROVIDER=local` for guaranteed zero-cost operation. Leave `AI_PROVIDER=gemini` (default) and the app degrades gracefully to local rules whenever Gemini is unavailable.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic v2 |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Database | PostgreSQL 16+ |
| AI | Gemini LLM (primary) + automatic local rule-based fallback |
| Auth | JWT (HS256), bcrypt password hashing |

## Architecture at a Glance

```
User / Admin
     ↓
JWT + RBAC middleware
     ↓
FastAPI Routers → Services → SQLAlchemy Models → PostgreSQL
     ↓
AI Provider (Gemini / Local)
```

The AI provider returns recommendations only. The backend validates every recommendation against the organization's configured categories, departments, and routing rules before persisting decisions.

## Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- **PostgreSQL 16+** (local install or Docker)

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd SentraAI
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Copy and edit the environment file:

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `JWT_SECRET_KEY`, and the three `SEED_*_PASSWORD` values. See [Environment Variables](#environment-variables) for the full list.

Create the database and seed it:

```bash
psql -U postgres -c "CREATE DATABASE sentraai_dev;"
python -m app.utils.seeding
```

Start the backend:

```bash
uvicorn app.main:app --port 8000 --reload
```

API docs are available at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:3000` and proxies `/api/*` to the backend.

### 4. Production build (optional)

```bash
cd frontend
npm run build
npm start
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and set values before seeding or running.

| Variable | Purpose | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:YOUR_PASSWORD@localhost:5432/sentraai_dev` |
| `JWT_SECRET_KEY` | JWT signing secret | `CHANGE_ME_TO_A_RANDOM_STRING` |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry | `60` |
| `BACKEND_PORT` | Backend port | `8000` |
| `FRONTEND_URL` | CORS origin | `http://localhost:3000` |
| `AI_PROVIDER` | `gemini` or `local` | `gemini` |
| `GEMINI_API_KEY` | Gemini credential (backend-only) | *(empty — get from https://aistudio.google.com/apikey)* |
| `AI_MODEL` | Gemini model | `gemini-3.6-flash` |
| `AI_TIMEOUT_SECONDS` | Gemini timeout | `20` |
| `AI_MAX_RETRIES` | Gemini retries | `1` |
| `SEED_SUPER_ADMIN_PASSWORD` | Super admin seed password | required |
| `SEED_ADMIN_PASSWORD` | Department admin seed password | required |
| `SEED_USER_PASSWORD` | Test student seed password | required |

`GEMINI_API_KEY` is never exposed to the frontend.

## Pre-provisioned Demo Accounts

Created automatically by the seed script:

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@sentraai.dev` | `SEED_SUPER_ADMIN_PASSWORD` |
| IT Admin | `it.admin@sentraai.dev` | `SEED_ADMIN_PASSWORD` |
| Facilities Admin | `facilities.admin@sentraai.dev` | `SEED_ADMIN_PASSWORD` |
| Security Admin | `security.admin@sentraai.dev` | `SEED_ADMIN_PASSWORD` |
| Test Student 1 | `student1@sentraai.dev` | `SEED_USER_PASSWORD` |
| Test Student 2 | `student2@sentraai.dev` | `SEED_USER_PASSWORD` |
| Test Student 3 | `student3@sentraai.dev` | `SEED_USER_PASSWORD` |

## API Overview

All endpoints are under `/api/v1`.

| Group | Examples |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Complaints | `POST /complaints`, `GET /complaints`, `GET /complaints/{id}`, `GET /complaints/{id}/history`, `POST /complaints/{id}/reprocess` |
| Attachments | `GET /complaints/{cid}/attachments/{aid}/download` |
| Notifications | `GET /notifications`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all` |
| Admin | `GET /admin/complaints`, `GET /admin/complaints/{id}`, `PATCH /admin/complaints/{id}`, `GET /admin/clusters/{id}` |
| Analytics | `GET /analytics/heatmap`, `GET /analytics/complaints`, `GET /analytics/urgency`, `GET /analytics/categories`, `GET /analytics/locations`, `GET /analytics/duplicates`, `GET /analytics/departments` |
| Super Admin Config | `GET/POST/PATCH /config/departments`, `/config/categories`, `/config/admins`, `/config/zones`, `/config/org` |
| Chatbot | `POST /chatbot/parse` |
| Health | `GET /health` |

Full interactive docs are at `http://localhost:8000/docs`.

## Demo Scenarios

### Fire Emergency
Submit: *"Fire in the library, emergency!"*  
AI classifies it as **Critical** and routes to **Security & Emergency**. The heatmap shows a red critical marker on the Library zone.

### Repeated Minor Issue
Submit three similar complaints: *"Broken light in Hostel Wing 1."*  
AI detects duplicates, groups them in one cluster, and the admin inbox shows a single row with a report count. **Urgency stays Low/Medium** — report count does not inflate priority.

### Unknown / Vague Issue
Submit: *"Something is wrong."*  
AI returns low confidence. The complaint lands in **General Review** (`department_id = null`) for a human admin to pick up. The complaint is never lost.

### Configurability
As Super Admin, create a new category mapped to a department. Submit a complaint matching that category. AI routes using the **new configuration without any code changes**.

## Quick Judge Demo

A complete happy path in under 5 minutes:

1. **Seed** the database and start the backend + frontend.
2. **Log in as** `student1@sentraai.dev`.
3. **Submit a complaint** via the form or chatbot: *"No water supply in Block A for two days."*
4. **AI triage** classifies it as Water Supply → Facilities & Maintenance.
5. **Log in as Facilities Admin** and open the Admin Inbox.
6. **Click the complaint**, review the AI summary, and transition status to `in_progress` → `resolved`.
7. **Switch back to the student dashboard** to see the updated status and notification.
8. **Open the Heatmap and Analytics** as admin to see Block A reflected in the data.

## Testing

### Backend
```bash
cd backend
pytest
```

Live integration tests (`test_gemini_live.py`, `test_gemini_triage_live.py`, `test_regression.py`) require:
- A running backend at `http://localhost:8000`
- A seeded database
- A valid `GEMINI_API_KEY` in `backend/.env`

### Frontend
```bash
cd frontend
npm run build
npm run lint
```

Manual UI verification is not part of the automated test suite.

## Security Notes

- **Never commit `.env` files.** Use `backend/.env.example` as a template.
- Change `JWT_SECRET_KEY` and all seed passwords before any public or production deployment.
- `GEMINI_API_KEY` is backend-only. Never expose it in frontend code or version control.
- Default database credentials in `config.py` and `alembic.ini` are for local development only.

## Cost

SentraAI supports a **zero-cost local mode** (`AI_PROVIDER=local`). In this mode the rule-based provider handles classification, urgency, routing, and duplicate detection with no external API calls.

By default `AI_PROVIDER=gemini`. With a configured `GEMINI_API_KEY`, the app uses Gemini for triage and the chatbot. If Gemini is unavailable — missing key, timeout, rate limit, or error — the app **automatically falls back** to the local provider. All core dependencies are open-source.

## License

Hackathon project — not for commercial distribution.
