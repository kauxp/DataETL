# Data Model

## Core Questions the Model Answers

1. What happened? (activity, quantity, period, location)
2. How was CO2e calculated? (emission factor, version, source)
3. Can this be trusted? (provenance, review status, edit history, lock)

## Entity Hierarchy

```
Organization
  └── UserProfile (role: admin | analyst | viewer)
  └── DataSource (type: SAP | UTILITY | TRAVEL)
        └── IngestionBatch (one file upload event — immutable)
              └── RawRecord (verbatim original row — never modified)
                    └── ActivityRecord (normalized, computed, reviewed)
                          └── ActivityRecordEdit (append-only audit log)
                          └── AnomalyFlag (system-detected problems)

EmissionFactor (versioned lookup — every ActivityRecord cites one)
PlantMasterData (org-scoped SAP plant code → name/country/region)
```

## Key Design Decisions

**Why UUID PKs:** Avoids leaking record counts to API consumers; safe to expose in URLs.

**Why store RawRecord:** If a parser bug is found later, re-parsing from the original bytes is possible without re-uploading. The analyst can always see the exact source data for any computed value.

**Why denormalize `organization` on ActivityRecord:** The most common query is "all records for org X with status Y." A direct FK enables a single index scan instead of a 3-table join (ActivityRecord → DataSource → Organization).

**Why sparse columns for source-specific metadata (sap_document_number, meter_id, etc.) instead of JSONField:** Filterability. `filter(sap_material_code='DIESEL-001')` uses an index. JSONField filtering does not, by default. The tradeoff is NULL columns for inapplicable sources — acceptable.

**Why store both co2e_kg and co2e_tonnes:** Analysts think in tonnes; the calculation is in kg (emission factors are kgCO2e/unit). Storing both avoids repeated division and makes the calculation transparent.

**Why append-only ActivityRecordEdit instead of updating in-place:** A carbon audit requires tamper-evident history. Every manual change to a record produces a new edit row with who/when/what/why. The record itself is never silently overwritten.

**Why is_locked:** Once records are exported to auditors, they must not change. is_locked=True is set on export. If an error is found post-lock, the correct path is a new correcting batch — not unlocking and editing, which would break the audit trail.

## Scope Assignment

| Source      | Category           | Scope | Protocol Category          |
|-------------|-------------------|-------|---------------------------|
| SAP fuel    | fuel              | 1     | GHG Protocol Scope 1      |
| SAP procure | procurement       | 3     | Scope 3 Category 1 (stub) |
| Utility     | electricity       | 2     | GHG Protocol Scope 2      |
| Travel      | flight/hotel/car  | 3     | Scope 3 Category 6        |

## Unit Normalization

All quantities are converted to a canonical unit before emission factor lookup:

| Category     | Canonical Unit | Example conversion         |
|-------------|---------------|---------------------------|
| Liquid fuel  | litres        | GAL × 3.785 = litres      |
| Gas fuel     | m3            | kWh × 0.0916 = m3 gas     |
| Electricity  | kWh           | MWh × 1000 = kWh          |
| Flight       | passenger-km  | IATA haversine + 8% detour |
| Hotel        | room-night    | already canonical          |
| Ground       | km            | miles × 1.609 = km        |

## Multi-tenancy

Row-level: every model has `organization` FK (direct or via source). Every API view filters on `request.user.profile.organization`. No cross-org query is possible through the ORM queryset chain.

## Emission Factors

All factors are from DEFRA 2023 (UK-standard). Each ActivityRecord stores a FK to the specific EmissionFactor row used — future audits can always see which version was applied, even if factors are updated. The valid_from/valid_to fields allow the correct factor for any period to be looked up by date.
