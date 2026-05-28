# Decisions

## SAP: Why flat file (MB51 export) over IDoc/OData/BAPI

IDoc is system-to-system batch integration — a sustainability analyst can't trigger it. OData/BAPI requires SAP Gateway configuration most mid-size clients haven't done. BAPI calls need a developer to map fields per client. MB51 ("Material Document List") is what finance/sustainability teams actually export: they click System → List → Save → Local File in the SAP GUI. It's a semicolon-delimited text file. Every SAP installation that can run MB51 can produce this file without IT involvement.

**What I'd ask the PM:** Which movement types are in scope? We currently handle 201 (goods issue to cost center = consumption). If they also need 261 (production order issue) or 501 (receipts for procurement Scope 3 Cat 1), those need separate emission factor logic.

**What we handle:** Movement type 201 for fuel consumption, material descriptions matched against regex patterns to classify fuel type. German/English column headers both accepted. European decimal format (1.234,56 → 1234.56). Dates in DD.MM.YYYY and YYYYMMDD.

**What we ignore:** MM60 inventory reports, BAPI_GOODSMVT calls, CO postings, multi-valuation materials.

## Utility: Why billing CSV over Green Button XML or live API

Green Button XML (ESPI standard) has interval data at 15-minute granularity — useful for demand management but not for Scope 2 carbon accounting, which is done monthly against grid emission factors. Billing CSV is what utility management platforms (Urjanet, Measurabl, EnergyCAP) export, and it's what sustainability teams receive from facilities. Live utility APIs require individual OAuth per utility — impractical for a prototype.

Key insight we handle: billing periods don't align to calendar months. A meter read on 2024-01-18 covers late November through mid-January. We store period_start and period_end explicitly and never assume monthly alignment.

**What I'd ask the PM:** Are any sites on half-hourly settlement (HH metering)? If so, do they want demand-based Scope 2 or just consumption-based? Also — do they have any renewable tariff agreements (PPAs/RECs)? That's the market-based vs. location-based Scope 2 split.

## Travel: Why Concur CSV export over Navan API

The client uses SAP for ERP, which means they almost certainly use SAP Concur for T&E — they're the same vendor. Navan/TripActions is common but less likely given the SAP footprint. Concur's API exists but requires OAuth per company and returns per-expense-report pagination — complex for a prototype. The "Download as CSV" export from Concur's web UI is what an HR or finance team would actually send us.

**Flight distance calculation:** Concur doesn't always include distance. We compute it via Haversine from IATA codes (built-in coordinate table for ~60 major hubs) plus a +8% detour factor per ICAO methodology. If the IATA code isn't in our table, we flag the record.

**What I'd ask the PM:** Do they have a mileage policy for car trips? Concur sometimes records mileage claimed for reimbursement, which isn't actual distance driven. We use it if present, otherwise no distance = no EF calculation for ground transport.

## Emission factors: DEFRA 2023, not GHG Protocol or IPCC

DEFRA (UK Department for Energy and Climate Change) publishes annual GHG conversion factors that cover UK grid, fuels, and business travel in a single self-consistent dataset. The client's facilities appear UK-based (GB country codes in sample data). DEFRA factors are what a UK auditor will expect. We store the source and version on every ActivityRecord so switching to EPA or IEA factors for non-UK facilities is a database query away.

## Review status model: pending → approved/rejected/flagged, not a workflow engine

A full workflow engine (state machine, role-based transitions, escalation) is overkill for a prototype. The four statuses capture what analysts actually need: "I haven't looked at this" (pending), "there's a problem" (flagged), "sign-off done" (approved), "this is wrong" (rejected). Approved records get their anomaly flags auto-resolved. Locked records (is_locked=True) are immutable.

## Why SQLite in development, PostgreSQL in production

SQLite is zero-config for development and CI. The ORM queries we use (Sum, Count with filters, TruncMonth) work identically in both. Production gets Postgres via DATABASE_URL because that's what Railway/Render provide and what a real deployment needs for concurrency.
