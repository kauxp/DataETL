# Sources Research

## SAP — Fuel & Procurement

**Format researched:** SAP MB51 (Material Document List) flat file export via SAP GUI.

**What I learned:**
- SAP exports via System → List → Save → Local File produce semicolon-delimited text files
- Column headers are SAP field names (MBLNR, BUDAT, BWART, etc.) — often in German
- Dates export as YYYYMMDD or DD.MM.YYYY depending on SAP locale settings
- Numbers use European format in German SAP: 1.234,56 (period=thousands, comma=decimal)
- Units use SAP MEINS codes: L (litres), M3 (cubic metres), TO (metric tonne), KG, GAL
- Movement type 201 = goods issue to cost center (consumption) — this is the fuel drawdown
- Movement type 101 = goods receipt from purchase order (receipt/procurement)
- Plant codes are 4 characters, meaningful only with a plant master data table
- Material numbers are up to 18 characters, leading zeros are significant in SAP but often stripped in exports

**Sample data design:** The sample uses realistic plant codes (1001, 1002, 1003), material numbers following a real naming convention, European date format, and movement type 201 (consumption). The 9500L entry on 25.03.2024 is intentionally anomalous to trigger the spike detector.

**What would break in real deployment:**
- Client's SAP may use different column headers (client-specific reports)
- Non-standard movement types for consumption (some clients use 551/555 for scrapping)
- Material descriptions not containing fuel keywords (e.g. material is called "RM-2847" not "Diesel")
- Multi-plant exports where the same plant code means different things in different company codes
- Negative quantities from reversals (handled: we take absolute value)

## Utility — Electricity

**Format researched:** Utility billing CSV from portal exports (Urjanet, EnergyCAP, direct utility web portals). Also reviewed Green Button Connect / ESPI XML standard.

**What I learned:**
- Enterprise utility management platforms (Urjanet, EnergyCAP) aggregate bills from multiple utilities into a normalised CSV
- Green Button XML is for interval data (15-min smart meter readings), not billing summaries
- Billing periods are NOT calendar months — a "January bill" might cover Dec 18 – Jan 17
- UK commercial electricity bills have: kWh consumption, peak demand (kW), distribution use of system (DUoS) charges, BSUoS charges, ROC/FiT levies, CCL
- Meter IDs are unique per physical meter; one facility can have multiple meters
- HH (half-hourly) metered sites have separate agreed capacity (kVA) charges
- Country/region matters: UK grid EF (0.207 kgCO2e/kWh) differs from US (0.386) and EU (0.276)

**Sample data design:** Uses realistic UK account numbers, meter IDs, billing periods that straddle month boundaries (Dec 18 – Jan 17, not Dec 1 – Dec 31), tariff codes matching real UK commercial tariff types (HH-BSUOS, SME-FIXED, SME-DUoS), and realistic kWh values for commercial facilities (28,000–52,000 kWh/month for a warehouse).

**What would break in real deployment:**
- PDF bills (most common from smaller sites) — would need OCR/PDF parsing
- Multi-fuel bills (gas + electricity on same bill) — need split parsing
- Non-kWh units (MWh from large industrial sites, therms for gas on same account)
- Missing region/country field → wrong grid emission factor (we default to UK)

## Corporate Travel — Concur

**Format researched:** SAP Concur expense report CSV download; Concur TripLink API documentation; Navan (TripActions) export format.

**What I learned:**
- Concur's "Download CSV" on expense reports produces one row per expense line
- Key fields: Expense Type code (AIR, HTL, CAR, TAXI), Transaction Date, From/To City, Airport IATA codes (sometimes), Amount, Currency, Cabin Class
- Distance is not always provided for flights — Concur records the cost, not the distance
- IATA codes are present only if booked through Concur Travel (not manually expensed)
- Hotel records include number of nights; some exports put them as a separate field, others only have check-in date
- Car rental records sometimes include odometer distance, often don't
- Cabin class often missing for economy (it's the default) — we assume economy when absent
- DEFRA 2023 uses haul-length classification: domestic (<463km), short-haul (463-3700km), long-haul (>3700km)

**Flight distance approach:** Built a table of 60 IATA hub airports with lat/lon. Haversine formula + 8% detour factor (ICAO standard methodology). If both IATA codes are present and in our table, we compute distance. If not, we flag the record as missing distance and set CO2e to 0.

**Sample data design:** Uses realistic business travel patterns (London hub, trips to NYC, Frankfurt, Mumbai, Singapore, Tokyo), correct IATA codes for all airports, mix of economy and business class, realistic amounts in correct currencies (GBP for UK booked, USD for US hotels, EUR for European expenses). The long-haul business class flights produce high emissions intentionally — business class LHR-JFK is 0.571 kgCO2e/km × 5,570km = 3.18 tCO2e/trip.

**What would break in real deployment:**
- Hotels not in Concur (expensed manually) → no location data → can't compute hotel EF
- Ground transport without distance → EF = 0 (we flag these)
- Multi-leg itineraries logged as single expense → one IATA pair but multiple segments
- International IATA codes not in our 60-airport table → need full IATA database
- Non-SAP Concur platforms (Navan, Chrome River) have different column names
