# Breathe ESG — Emissions Data Ingestion Platform

Django REST + React prototype for ingesting, normalising and reviewing emissions data from SAP, utility portals, and corporate travel platforms.

## Quick start

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed        # creates demo org, users, and ingests sample data
python manage.py runserver

# Frontend
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```

Demo credentials: `admin / admin123` or `analyst / analyst123`

## Data sources

| Source | Format | Scope |
|--------|--------|-------|
| SAP MB51 flat file | Semicolon-delimited, German or English headers | 1 (fuel) |
| Utility billing CSV | Green Button / Urjanet-style portal export | 2 (electricity) |
| Concur expense CSV | SAP Concur expense report download | 3 Cat 6 (travel) |

## Deployment (Railway)

1. Create Railway project with PostgreSQL plugin
2. Deploy `backend/` — set env vars from `.env.example`
3. Deploy `frontend/` — set `VITE_API_URL` to backend URL

See `MODEL.md`, `DECISIONS.md`, `TRADEOFFS.md`, `SOURCES.md`.
