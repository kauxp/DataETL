# Tradeoffs — Three Things Deliberately Not Built

## 1. Market-based Scope 2 (RECs, PPAs, supplier-specific EFs)

**What was skipped:** The GHG Protocol allows two methods for Scope 2. Location-based (grid average factor) is what we implement. Market-based uses the actual energy supplier's factor — lower if the company has a renewable energy contract (PPA) or has purchased Renewable Energy Certificates (RECs). This is what sustainability-focused companies report for their "net Scope 2."

**Why skipped:** Market-based requires ingesting a separate data type: certificate data (REGO certificates in the UK, RECs in the US) that proves renewable procurement. This is a distinct ingestion flow from billing data. The data model has `subcategory` on EmissionFactor so market-based factors can be added later without schema changes.

**Cost of skipping:** The prototype shows higher Scope 2 than a company with PPAs would actually report. A note in the dashboard warns analysts this is location-based only.

## 2. Async processing with Celery/Redis

**What was skipped:** File parsing runs synchronously in the HTTP request. For large files (50,000-row SAP exports) this will time out.

**Why skipped:** A queue infrastructure (Celery + Redis) doubles the deployment complexity. For the prototype data volumes (< 1000 rows), synchronous is fine. The batch.status field is already designed for async: it starts as `pending`, transitions to `processing`, ends at `completed` or `failed`. Adding a Celery task that updates these fields is a mechanical change, not a design change.

**Cost of skipping:** Uploads > ~5,000 rows will 502 on Railway's 30-second timeout. The fix is one Celery task wrapping `ingest_batch()`.

## 3. Scope 3 Category 1 spend-based procurement from SAP purchase orders

**What was skipped:** SAP ME2M (purchase orders) contains procurement spend data that supports Scope 3 Category 1 (purchased goods and services). The spend-based approach multiplies spend by an industry-average emission intensity factor ($/tCO2e). This is the most common way companies estimate Cat 1 before they have supplier-specific data.

**Why skipped:** Spend-based Cat 1 requires a separate factor table (EEIO factors from EPA or Exiobase by spend category/NAICS code) and a mapping from SAP material groups to those categories. The client's SAP material groups are company-specific and we'd need their master data to map them. The MB51 parser currently flags procurement movement types (101, 501) as skipped — the hook is there, the factors aren't.

**Cost of skipping:** Scope 3 in the prototype only covers Category 6 (business travel). A real Scope 3 inventory would also need Cat 1, Cat 4 (upstream transport), Cat 11 (use of sold products), etc. These require more client-specific configuration than a prototype can assume.
