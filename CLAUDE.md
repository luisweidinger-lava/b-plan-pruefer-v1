# CLAUDE.md

## Project
Planeco Building – B-Plan Finder MVP

## Goal
Build a lean, understandable, web-first MVP that checks whether a given German address lies within
the scope of a binding Bebauungsplan (B-Plan), with Hamburg as the first fully working implementation.

Priority order:
1. Hamburg works correctly end-to-end
2. Architecture is extensible (provider-by-source, not by state)
3. Code is simple and easy to understand
4. No unnecessary infrastructure
5. UI feels trustworthy and clean

---

## Core product requirement

Input: a German address

Output:
- confirmed address
- whether a B-Plan exists
- one primary plan if found
- responsible authority, only if directly derivable from the source data
- plan document link and download link if available

If no plan is found → clear "no plan found" result
If official upstream source is unavailable → "currently not verifiable" (only for real outage)

---

## Non-negotiable technical decisions

- **Data source**: Hamburg WFS from LGV (geodienste.hamburg.de) — official source of truth
- **Geocoding**: Nominatim (OpenStreetMap)
- **Geometry**: fetch polygons ourselves, do PiP with a geo library (turf), no manual polygon math
- **Storage**: none — no database, no cache, no persistence
- **Error handling**: "not_verifiable" only for real upstream outage; not for bad addresses or bugs
- **Provider architecture**: organized by data source type, not by federal state
- **Result**: return exactly one `primaryPlan`; rank: rechtskräftig > im Verfahren > newest date
- **Authority**: only from source data, no fallback mapping

---

## Architecture layers

```
Layer 1 (Orchestration): src/app/api/check-bplan/route.ts
  ↓ geocodes address → picks provider → assembles result

Layer 2 (Source Adapters): src/lib/providers/
  └── base.ts            BPlanProvider interface
  └── hamburg-wfs.ts     Hamburg WFS adapter (first real implementation)

Layer 3 (Geo/Decision): src/lib/geo/
  └── normalizeGeometry.ts   wrap WFS geometry as GeoJSON Feature
  └── pointInPolygon.ts      turf-based PiP filter
  └── rankPlans.ts           rank by status + date
```

---

## Tech stack
- Next.js 14+ App Router, TypeScript, Tailwind CSS
- @turf/boolean-point-in-polygon for PiP
- Nominatim for geocoding
- Vercel for deployment
- No database, no auth, no cache

---

## Normalized result contract

```ts
type NormalizedPlanResult = {
  query: {
    inputAddress: string;
    confirmedAddress?: string;
    lat?: number;
    lon?: number;
  };
  status: "plan_found" | "no_plan_found" | "not_verifiable";
  sourceStatus: "ok" | "upstream_unavailable" | "invalid_input" | "internal_error";
  primaryPlan?: {
    id?: string;
    name: string;
    type?: string;
    status?: string;
    authority?: string;
    source: string;
    documentUrl?: string;
    downloadUrl?: string;
    date?: string;
  };
  notes?: string[];
};
```
