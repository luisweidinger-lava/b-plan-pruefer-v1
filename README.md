# B-Plan Prüfer — Planeco Building

A lean web tool that checks whether a German address lies within the scope of a binding
Bebauungsplan (B-Plan, binding development plan). Hamburg is fully implemented as the
baseline. The architecture is ready for additional German states.

---

## What it does

1. User enters a German address
2. The address is geocoded via Nominatim (OpenStreetMap)
3. The Hamburg WFS service (LGV Hamburg) is queried for nearby B-Plan polygons
4. A point-in-polygon check determines whether the address is inside any of them
5. Matching plans are ranked (rechtskräftig first, then newest date)
6. The top-ranked plan is returned with its name, legal status, document link, and authority

---

## Local setup

```bash
# 1. Clone / open the project
cd "Planco Building B-Plan Extention"

# 2. Install dependencies
npm install

# 3. Configure Nominatim User-Agent (required by OpenStreetMap ToS)
cp .env.local.example .env.local
# Edit .env.local and set your contact email

# 4. Run the dev server
npm run dev
```

Open http://localhost:3000

---

## Test addresses

| Address | Expected result |
|---|---|
| `Rathausmarkt 1, Hamburg` | plan_found — Hamburg-Altstadt / Neustadt plan |
| `Eppendorfer Baum 1, Hamburg` | plan_found — BSHarvestehude-Rotherbaum |
| `Australiastraße 7, Hamburg` | no_plan_found (port area, no registered B-Plan) |
| `Unter den Linden 1, Berlin` | no_plan_found (outside Hamburg data coverage) |
| `xyzxyz123abc` | not_verifiable, sourceStatus: invalid_input |
| *(empty)* | 400, sourceStatus: invalid_input |

---

## Deploy to Vercel

```bash
# Option 1: Via Vercel CLI
npm install -g vercel
vercel

# Option 2: Connect GitHub repo in Vercel dashboard
# → Import repo → zero config needed for Next.js
```

Set the environment variable in the Vercel dashboard:
```
NOMINATIM_USER_AGENT=bplan-checker/1.0 (your@email.com)
```

---

## Architecture

```
src/
├── app/
│   ├── api/check-bplan/route.ts   ← Layer 1: Orchestration
│   │                                  Geocodes address → picks provider → returns result
│   ├── page.tsx                   ← UI (client component, form + result)
│   └── layout.tsx
│
├── lib/
│   ├── types.ts                   ← NormalizedPlanResult, RawPlanFeature, GeocodeResult
│   ├── geocode.ts                 ← Nominatim wrapper
│   │
│   ├── providers/                 ← Layer 2: Source Adapters
│   │   ├── base.ts                    BPlanProvider interface (one method: fetchPlans)
│   │   └── hamburg-wfs.ts             Hamburg WFS adapter (first real implementation)
│   │
│   ├── geo/                       ← Layer 3: Geo / Decision
│   │   ├── normalizeGeometry.ts       wrap WFS geometry as GeoJSON Feature for turf
│   │   ├── pointInPolygon.ts          turf-based PiP filter
│   │   └── rankPlans.ts               rank: rechtskräftig → newest date
│   │
│   └── utils/
│       └── errors.ts              ← BPlanError class + isUpstreamFailure helper
│
└── components/
    ├── Header.tsx                 ← Brand header, subtitle, attribution
    └── ResultCard.tsx             ← Result display (found / not found / not verifiable)
```

### How the layers communicate

```
Browser
  └─ GET /api/check-bplan?address=...
       │
       ├─ 1. geocodeAddress()       Nominatim → {lat, lon, confirmedAddress}
       │
       ├─ 2. HamburgWfsProvider     WFS BBOX query → RawPlanFeature[]
       │       .fetchPlans()          (two layers: rechtskräftig + im Verfahren)
       │
       ├─ 3. filterByPointInPolygon  turf PiP → only matching features
       │
       ├─ 4. rankPlans               sort by status → date
       │
       └─ 5. NormalizedPlanResult    returned as JSON
```

### Provider-by-source architecture

Providers are organized by **data source type** (WFS, ArcGIS, HTML), not by federal state.
This is intentional: different German states use different technical backends.
Hamburg uses WFS; Bavaria would likely require a mix of WFS, ArcGIS, and direct HTML sources
depending on the municipality.

To add a new source, create a file in `src/lib/providers/` that implements the
`BPlanProvider` interface:

```typescript
export interface BPlanProvider {
  readonly name: string;
  fetchPlans(lat: number, lon: number): Promise<RawPlanFeature[]>;
}
```

No changes are needed to the API route or geo layer.

---

## Hamburg WFS — technical details

**Endpoint:** `https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene`

**Layers queried:**
- `app:hh_hh_festgestellt` — legally established plans (rechtskräftig)
- `app:prosin_imverfahren` — plans in procedural phase (im Verfahren)

**Query strategy:**
- Bounding box ±0.006° lon / ±0.004° lat around the geocoded point (~400m × 445m)
- `outputFormat=application/geo+json` — returns GeoJSON directly, no GML parsing needed
- `srsName=EPSG:4326` — coordinates in WGS84 (longitude, latitude)
- BBOX parameter must be **lon-first**: `minLon,minLat,maxLon,maxLat,EPSG:4326`
- Then point-in-polygon narrows the BBOX candidates to the exact property

---

## Result output contract

```typescript
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
    status?: string;
    authority?: string;
    source: string;
    documentUrl?: string;
    date?: string;
  };
  notes?: string[];
};
```

`"not_verifiable"` is **only** used when the official upstream source is genuinely
unavailable. Invalid addresses and empty results are distinct statuses.

---

## Data sources

- **B-Plan geodata:** LGV Hamburg (Landesbetrieb Geoinformation und Vermessung)
  License: Datenlizenz Deutschland Namensnennung 2.0 (DL-DE-BY-2.0)
- **Geocoding:** OpenStreetMap / Nominatim
  License: Open Database License (ODbL)

---

## Assumptions and limitations

- **Hamburg only.** The WFS source used is Hamburg-specific. Other cities are not covered.
- **No persistence.** Every request is stateless; no history is stored.
- **No caching.** Each search hits the live WFS and Nominatim. Nominatim has a 1 req/sec rate
  limit — acceptable for a single-user prototype.
- **Authority field.** Returned only for Hamburg (directly from the LGV source constant).
  No mapping for other cities.
- **Plan count limit.** The WFS query is capped at `COUNT=50`. Dense city-center areas
  returned at most ~25 candidates in testing.
- **imVerfahren plans** have no document URL in the WFS source — documentUrl is omitted.

---

## Summary

### Chosen approach

Hamburg is implemented using the official LGV WFS service, which returns GeoJSON features
directly. The system geocodes the input address, fetches a generous bounding box of B-Plan
polygons, filters them with a turf point-in-polygon check, ranks by legal status and date,
and returns the top result.

### What works

- Full end-to-end flow for Hamburg addresses
- Correct "no plan found" for areas without B-Plans (e.g. Hamburg port)
- Correct "no plan found" with explanatory note for non-Hamburg addresses
- Correct "not verifiable" only when the upstream source is unavailable
- Legal status badge (Rechtskräftig / Im Verfahren)
- Document PDF link when available (rechtskräftig plans)
- Authority attribution from the LGV source

### What does not yet work

- Other German states (Bayern, Berlin, NRW, etc.) — no adapters implemented
- Download URL (distinct from documentUrl) — not available in the Hamburg WFS source
- Partial-area or overlapping B-Plan scenarios are handled by ranking, but only one plan
  is shown (the UI is not yet extended to show secondary matches)

### How it scales to more federal states

Each state (or municipality) that uses a different data source needs a new adapter in
`src/lib/providers/`. The adapter implements `fetchPlans(lat, lon)` and returns
`RawPlanFeature[]`. The API route, geo layer, and UI need no changes.

### How Bavaria would be integrated

Bavaria does not have a single unified WFS for all Bebauungspläne. Instead, each municipality
publishes its own source (WFS, ArcGIS REST, or HTML). The integration path:

1. Build a **WFS discovery adapter** (`bavarian-wfs.ts`) that queries the state's metadata
   service to find which municipal WFS endpoint covers the geocoded point
2. Query that endpoint for B-Plan features, normalize to `RawPlanFeature[]`
3. For municipalities using ArcGIS REST, build a separate **ArcGIS adapter**
4. Wire adapters in the API route based on the geocoded state (from Nominatim result)

The provider interface stays the same; the orchestration layer just picks the right adapter.

### What a production version would do differently

- **Caching:** Cache WFS polygon data per tile or municipality (TTL ~24h) to reduce latency
- **Multiple states:** Route to the correct state adapter based on the geocoded address
- **Confidence scoring:** Surface plan confidence (overlap area %, plan age) to the user
- **Secondary plans:** Show all matching plans, not just the primary
- **Error monitoring:** Structured logging + alerting for upstream outages
- **Rate limiting:** Protect the Nominatim usage with proper rate limiting
- **Tests:** Integration tests against the live WFS + unit tests for ranking logic

### How AI tools were used

Claude (Anthropic) was used throughout the implementation:
- Researching the Hamburg WFS endpoint, layer types, field names, and BBOX axis order quirks
- Designing the layered architecture (orchestration / adapter / geo)
- Writing the TypeScript implementation following the agreed structure
- Identifying and fixing the TypeScript narrowing error in `normalizeGeometry.ts`
- Writing this README
