# نظام الطلبات البلدية (Municipal Requests System)

A comprehensive municipal service requests (complaints) management system in Arabic with full RTL support.

## Overview

This system enables:
- **Citizens** to submit and track service requests anonymously (no login required)
- **District Administrators** to manage requests within their neighborhood
- **Municipal Administrators** to oversee performance across all districts
- **Staff/Field Workers** to receive and complete assigned work orders

---

## Backend Setup (FastAPI + PostgreSQL)

### Prerequisites
- Docker & Docker Compose

### Quick Start

```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env and change SECRET_KEY to a strong random value

# 2. Start services (PostgreSQL + FastAPI backend)
docker compose up --build

# The backend will automatically:
#   - Run Alembic migrations
#   - Seed the database with default data
#   - Start on http://localhost:8000
```

### Default Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| Municipal Admin | `admin@mun.sa` | `admin123` |
| District Admin (حي العليا) | `district1@mun.sa` | `pass123` |
| District Admin (حي الملز) | `district2@mun.sa` | `pass123` |
| Staff (حي العليا) | `staff1@mun.sa` | `staff123` |
| Staff (حي الملز) | `staff2@mun.sa` | `staff123` |

### API Documentation

Once running, interactive API docs are available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Manual Setup (without Docker)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/municipal_requests
export SECRET_KEY=your-secret-key

# Run migrations
alembic upgrade head

# Seed database
python seed.py

# Start server
uvicorn app.main:app --reload --port 8000
```

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Login with email/password, returns JWT |
| `GET` | `/auth/me` | Get current user info |

### Public (No Auth Required)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/public/requests` | Submit a new service request |
| `GET` | `/public/requests/{tracking_code}` | Track request by code |
| `POST` | `/public/requests/{tracking_code}/update` | Add citizen update (rate-limited: 3/hour) |

### Admin (JWT Required)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/requests` | List requests (scoped by role) |
| `GET` | `/admin/requests/{id}` | Get request details |
| `POST` | `/admin/requests/{id}/assign` | Assign staff to request |
| `POST` | `/admin/requests/{id}/status` | Update request status |
| `POST` | `/admin/requests/{id}/priority` | Update request priority |
| `POST` | `/admin/requests/{id}/note` | Add internal note |
| `POST` | `/admin/requests/{id}/attachments` | Upload attachment |

---

## Frontend API Client

A lightweight API client is available at `src/lib/api.ts`:

```typescript
import { api } from '@/lib/api'

// Configure the backend URL via VITE_API_URL env variable (default: http://localhost:8000)

// Login
const { access_token } = await api.login('admin@mun.sa', 'admin123')
api.setToken(access_token)  // stores in localStorage automatically

// Public – submit a request
const req = await api.submitRequest({
  district_id: '...',
  category: 'lighting',
  description: 'عمود إنارة مكسور',
})

// Public – track a request
const tracked = await api.trackRequest('ABCD1234')

// Admin – list requests
const { items } = await api.getRequests({ status: 'submitted', page: 1 })

// Admin – update status
await api.updateStatus(req.id, { status: 'received' })
```

---

## Features

### Citizen Portal (Public Access)
- ✅ Submit service requests without login
- ✅ Choose category (إنارة, مياه, نفايات, طرق, أخرى)
- ✅ Select district from dropdown
- ✅ Add description and optional photo
- ✅ Optional location (address text)
- ✅ Receive unique tracking code
- ✅ Track request status with public timeline
- ✅ Rate-limited to 3 submissions per IP per hour

### District Admin Dashboard
- ✅ View all requests for assigned district
- ✅ Filter by status, category, priority
- ✅ Role-based access control (district-scoped)
- ✅ Assign staff, change status, add internal notes
- ✅ Track overdue requests with SLA alerts

### Municipal Admin Dashboard
- ✅ Municipality-wide KPI overview
- ✅ View all districts' requests
- ✅ Filter and search capabilities
- ✅ Overdue request tracking

### System Features
- ✅ Full Arabic UI with RTL layout
- ✅ JWT authentication
- ✅ RBAC: Municipal Admin / District Admin / Staff
- ✅ Status workflow enforcement (invalid transitions blocked)
- ✅ Reject requires reason; Complete requires after-photo
- ✅ SLA tracking server-side (met / at_risk / breached)
- ✅ Automatic priority escalation rules
- ✅ Audit trail for all actions
- ✅ File upload (local storage, max 5 MB)
- ✅ Mobile-responsive design

---

## Technology Stack

### Frontend
- **React 19** + TypeScript
- **Tailwind CSS** with custom Arabic theme
- **shadcn/ui** components
- **Phosphor Icons**
- **Vite** build tool

### Backend
- **FastAPI** (Python 3.12)
- **PostgreSQL 16** + **SQLAlchemy 2** ORM
- **Alembic** migrations
- **JWT** authentication (python-jose)
- **bcrypt** password hashing (passlib)
- **slowapi** rate limiting
- **Docker Compose** for local development

---

## Data Model

### Entities

**Municipalities** → **Districts** → **Users** (staff, admins)

**Service Requests** have:
- Category: lighting | water | waste | roads | other
- Priority: low | normal | high | urgent
- Status: submitted → received → in_progress → completed | rejected
- SLA deadline (calculated server-side from category + priority)
- Tracking code (8-char, alphanumeric, public)

**Request Updates** – timeline entries (public or internal)

**Assignments** – staff assignment records

**Attachments** – uploaded files linked to a request

**Audit Log** – immutable log of all admin actions

---

## SLA Logic

SLA deadlines are calculated server-side at request creation:

| Category | Low | Normal | High | Urgent |
|----------|-----|--------|------|--------|
| Water    | 2d  | 1d     | 12h  | 6h     |
| Waste    | 3d  | 2d     | 1d   | 12h    |
| Lighting | 5d  | 3d     | 2d   | 1d     |
| Roads    | 10d | 7d     | 5d   | 2d     |
| Other    | 7d  | 5d     | 3d   | 1d     |

SLA status: `met` | `at_risk` (< 25% remaining) | `breached`

---

## Security

- Passwords hashed with bcrypt
- JWT tokens expire after 8 hours (configurable)
- Role + scope enforced on every admin endpoint
- Rate limiting on public submission endpoint
- File size validation (5 MB max)
- No PII leaked in public tracking endpoint (internal notes hidden)

## License

© 2024 Municipal Requests System. All rights reserved.
