# SentraAI — AI-Powered Complaint Workflow Platform

**Hackathon MVP** — Configurable AI-powered complaint triage, routing, and management platform for universities and campuses.

## Overview

SentraAI automates complaint intake with a 6-stage AI pipeline (summarization, classification, urgency assessment, duplicate detection, department routing) while keeping human admins in the decision loop. It includes a Campus Heatmap visualization, analytics dashboard, and Super Admin configuration layer.

**Key features:**
- Complaint submission with optional file attachments
- AI triage pipeline (rule-based local provider, swappable to external LLM)
- Confidence-based routing with General Review fallback
- Duplicate detection and clustering (originals preserved)
- Department Admin inbox with accept/modify/reassign/resolve workflow
- Campus Heatmap (heat = concentration, markers = urgency — two separate dimensions)
- Analytics Dashboard (complaint volume, urgency, categories, zones, departments)
- Super Admin configuration (departments, categories, admins, zones)
- JWT authentication with 3 roles (user, admin, super_admin)
- AI failure safety — complaints are never lost due to AI failure

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Database | PostgreSQL 16+ |
| AI | Rule-based local provider (zero cost, no external API) |

## Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- **PostgreSQL 16+** (local install or Docker)

## Setup Instructions

### 1. Clone and navigate to the project

```bash
git clone <repository-url>
cd SentraAI
```

### 2. Backend Setup

```bash
cd backend
```

**Create a virtual environment:**
```bash
python -m venv venv
```

**Activate the virtual environment:**
- Windows: `venv\Scripts\activate`
- macOS/Linux: `source venv/bin/activate`

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Configure environment variables:**

Copy `.env.example` to `.env` and fill in your local values:
```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL connection string and seed passwords:
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/sentraai_dev
JWT_SECRET_KEY=<generate-a-random-string>
SEED_SUPER_ADMIN_PASSWORD=<choose-a-password>
SEED_ADMIN_PASSWORD=<choose-a-password>
SEED_USER_PASSWORD=<choose-a-password>
```

**Create the database:**
```bash
psql -U postgres -c "CREATE DATABASE sentraai_dev;"
```

**Seed the database:**
```bash
python -m app.utils.seeding
```

This creates: 1 organization, 5 departments, 16 categories, 8 campus zones, routing rules, and pre-provisioned accounts.

**Start the backend:**
```bash
uvicorn app.main:app --port 8000 --reload
```

The API is available at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### 3. Frontend Setup

```bash
cd frontend
```

**Install dependencies:**
```bash
npm install
```

**Start the development server:**
```bash
npm run dev
```

The frontend is available at `http://localhost:3000`. The Next.js dev server proxies `/api/*` requests to `http://localhost:8000`.

### 4. Production Build (optional)

```bash
cd frontend
npm run build
npm start
```

## Pre-provisioned Accounts

After running the seed script, these accounts are available:

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@sentraai.dev` | Value of `SEED_SUPER_ADMIN_PASSWORD` |
| IT Admin | `it.admin@sentraai.dev` | Value of `SEED_ADMIN_PASSWORD` |
| Facilities Admin | `facilities.admin@sentraai.dev` | Value of `SEED_ADMIN_PASSWORD` |
| Security Admin | `security.admin@sentraai.dev` | Value of `SEED_ADMIN_PASSWORD` |
| Test Student 1 | `student1@sentraai.dev` | Value of `SEED_USER_PASSWORD` |
| Test Student 2 | `student2@sentraai.dev` | Value of `SEED_USER_PASSWORD` |
| Test Student 3 | `student3@sentraai.dev` | Value of `SEED_USER_PASSWORD` |

## Project Structure

```
SentraAI/
├── backend/
│   ├── app/
│   │   ├── ai/               # AI provider abstraction + local provider
│   │   ├── middleware/        # JWT auth + RBAC
│   │   ├── models/            # SQLAlchemy ORM models (15 entities)
│   │   ├── routers/           # FastAPI route handlers
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic layer
│   │   ├── utils/             # File storage, seeding
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   └── main.py            # FastAPI app entry point
│   ├── .env.example           # Environment template
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   │   ├── (auth)/        # Login, Register
│   │   │   ├── (user)/        # User dashboard, complaints
│   │   │   ├── (admin)/       # Admin dashboard, inbox, heatmap, analytics
│   │   │   └── (super-admin)/ # Super Admin configuration
│   │   └── lib/               # API client, auth helpers, types
│   ├── next.config.js         # API proxy configuration
│   └── package.json           # Node.js dependencies
└── docs/                      # Phase reports, specification documents
```

## API Endpoints

### Authentication
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register new account |
| POST | `/api/v1/auth/login` | Login (returns JWT) |
| GET | `/api/v1/auth/me` | Current user profile |

### Complaints (User)
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/complaints` | Submit complaint (multipart) |
| GET | `/api/v1/complaints` | List complaints (role-scoped) |
| GET | `/api/v1/complaints/{id}` | Complaint detail |
| GET | `/api/v1/complaints/{id}/history` | Append-only timeline |
| POST | `/api/v1/complaints/{id}/reprocess` | Re-run AI triage |

### Admin Management
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/complaints` | Admin inbox (filtered) |
| GET | `/api/v1/admin/complaints/{id}` | Admin complaint detail |
| PATCH | `/api/v1/admin/complaints/{id}` | Update complaint |
| GET | `/api/v1/admin/clusters/{id}` | Duplicate cluster detail |
| GET | `/api/v1/admin/notifications` | Admin notifications |

### Analytics
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/analytics/heatmap` | Campus heatmap data |
| GET | `/api/v1/analytics/complaints` | Complaint volume |
| GET | `/api/v1/analytics/urgency` | Urgency distribution |
| GET | `/api/v1/analytics/categories` | Category distribution |
| GET | `/api/v1/analytics/locations` | Zone statistics |
| GET | `/api/v1/analytics/duplicates` | Top duplicate clusters |
| GET | `/api/v1/analytics/departments` | Department performance |

### Super Admin Configuration
| Method | Path | Description |
|---|---|---|
| GET/POST/PATCH | `/api/v1/config/departments` | Department CRUD |
| GET/POST/PATCH | `/api/v1/config/categories` | Category CRUD |
| GET/POST/PATCH | `/api/v1/config/admins` | Admin account CRUD |
| GET/POST/PATCH/DELETE | `/api/v1/config/zones` | Zone CRUD |
| GET/PATCH | `/api/v1/config/org` | Organization settings |

## Demo Scenarios (PMD §24)

### Scenario A — Fire Emergency
Submit a complaint about a fire. The AI classifies it as **Critical** based on content keywords (fire, emergency, danger) — not report count. It routes to the Security & Emergency department.

### Scenario B — Repeated Minor Issue
Submit 3+ similar complaints about a broken light. The AI detects duplicates via Jaccard similarity and groups them in a cluster. The cluster shows a report count but **urgency remains Low/Medium** — report count does NOT inflate urgency.

### Scenario C — Unknown Issue
Submit a vague complaint with no matching keywords. The AI produces low confidence scores. The complaint falls into **General Review** (department_id = null) for manual admin pickup. The complaint is never lost.

### Scenario D — Configurability
As Super Admin, create a new department and category. Submit a complaint matching the new category. The AI routes using the **updated configuration** without any code changes.

## Cost

**$0.00** — All dependencies are open-source and free:
- AI: Rule-based local provider (no external API, no GPU)
- Database: PostgreSQL (local)
- All npm/pip packages: Open-source licenses

## License

Hackathon project — not for commercial distribution.
