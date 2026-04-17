# B-Plan Prüfer — Planeco Building

A lean web tool that checks whether a German address lies within the scope of a binding
Bebauungsplan (B-Plan, binding development plan). Hamburg and Berlin are fully implemented.
The architecture is ready for additional German states.

---

## What it does

1. User enters a German address
2. The address is geocoded via Nominatim (OpenStreetMap)
3. The state is detected from the ISO 3166-2 code in the Nominatim response (DE-HH / DE-BE)
4. The correct WFS service is queried for nearby B-Plan polygons
5. A point-in-polygon check determines whether the address is inside any of them
6. Matching plans are ranked (rechtskräftig first, then newest date)
7. The top-ranked plan is returned with its name, legal status, document link, and authority

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
| `Eppendorfer Baum 1, Hamburg` | plan_found — rechtskräftig plan |
| `Australiastraße 7, Hamburg` | no_plan_found (port area, no registered B-Plan) |
| `Kurfürstendamm 100, Berlin` | plan_found — Berlin festgesetzt plan |
| `Alexanderplatz 1, Berlin` | plan_found — Berlin festgesetzt plan |
| `Rosenthaler Platz, Berlin` | plan_found — Im Verfahren |
| `Marienplatz, München` | no_plan_found (unsupported state) |
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
│   │                                  Geocodes address → detects state → picks provider → returns result
│   ├── page.tsx                   ← UI (client component, form + result)
│   └── layout.tsx
│
├── lib/
│   ├── types.ts                   ← NormalizedPlanResult, RawPlanFeature, GeocodeResult
│   ├── geocode.ts                 ← Nominatim wrapper (extracts stateCode via ISO3166-2-lvl4)
│   │
│   ├── providers/                 ← Layer 2: Source Adapters
│   │   ├── base.ts                    BPlanProvider interface (one method: fetchPlans)
│   │   ├── hamburg-wfs.ts             Hamburg WFS adapter (LGV Hamburg)
│   │   └── berlin-wfs.ts              Berlin WFS adapter (Geoportal Berlin)
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
       ├─ 1. geocodeAddress()       Nominatim → {lat, lon, confirmedAddress, stateCode}
       │
       ├─ 2. State routing          DE-HH → HamburgWfsProvider
       │                            DE-BE → BerlinWfsProvider
       │                            other → no_plan_found (unsupported)
       │
       ├─ 3. provider.fetchPlans()  WFS BBOX query → RawPlanFeature[]
       │
       ├─ 4. filterByPointInPolygon turf PiP → only matching features
       │
       ├─ 5. rankPlans              sort by status → date
       │
       └─ 6. NormalizedPlanResult   returned as JSON
```

### Provider-by-source architecture

Providers are organized by **data source type** (WFS, ArcGIS, HTML), not by federal state.
This is intentional: different German states use different technical backends.

To add a new source, create a file in `src/lib/providers/` that implements the
`BPlanProvider` interface:

```typescript
export interface BPlanProvider {
  readonly name: string;
  fetchPlans(lat: number, lon: number): Promise<RawPlanFeature[]>;
}
```

Then add a routing case in `route.ts` for the state's ISO 3166-2 code. No other files need changes.

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

---

## Berlin WFS — technical details

**Endpoint:** `https://gdi.berlin.de/services/wfs/bplan`

**Layers queried:**
- `bplan:b_bp_fs` — festgesetzt (rechtskräftig)
- `bplan:a_bp_iv` — im Verfahren

**Layer skipped:**
- `bplan:c_bp_ak` — außer Kraft gesetzt (inactive, not shown)

**Key field mappings:**
- `planid` → plan ID
- `planname` → plan name (falls back to `planid` if empty)
- `afs_behoer` → responsible authority
- `festsg_am` → enactment date (ISO `YYYY-MM-DD`, converted to `DD.MM.YYYY`)
- `scan_www` → plan drawing PDF link
- `grund_www` → Begründung PDF link (festgesetzt layer)
- `ausleg_www` → participation link (im Verfahren layer)

**WFS quirks:**
- Requires `typeNames` (plural, WFS 2.0) — not `typeName`
- Requires `outputFormat=application/json` — `application/geo+json` is rejected

---

## State routing

State detection uses Nominatim's `ISO3166-2-lvl4` field, which is reliably present for
all German addresses including city-states (Hamburg and Berlin have no `state` field in
Nominatim since they are simultaneously city and state):

| ISO code | State | Provider |
|---|---|---|
| `DE-HH` | Hamburg | HamburgWfsProvider |
| `DE-BE` | Berlin | BerlinWfsProvider |
| anything else | unsupported | `no_plan_found` with note |

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
    status?: string;       // "Rechtskräftig" | "Im Verfahren"
    authority?: string;
    source: string;        // Provider name (shown in attribution)
    portalUrl?: string;    // Hamburg only — planportal deep link
    documentUrl?: string;  // Plan drawing PDF
    pageUrl?: string;      // Begründung or participation PDF
    date?: string;         // DD.MM.YYYY
  };
  notes?: string[];
};
```

`"not_verifiable"` is **only** used when the official upstream source is genuinely
unavailable. Invalid addresses and empty results are distinct statuses.

---

## Data sources

- **Hamburg B-Plan geodata:** LGV Hamburg (Landesbetrieb Geoinformation und Vermessung)
  License: Datenlizenz Deutschland Namensnennung 2.0 (DL-DE-BY-2.0)
- **Berlin B-Plan geodata:** Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen
  via Geoportal Berlin (gdi.berlin.de)
- **Geocoding:** OpenStreetMap / Nominatim
  License: Open Database License (ODbL)

---

## Assumptions and limitations

- **Hamburg and Berlin only.** Other states are not yet covered.
- **No persistence.** Every request is stateless; no history is stored.
- **No caching.** Each search hits the live WFS and Nominatim.
- **außer Kraft gesetzt** Berlin plans are excluded — only active plans are shown.
- **im Verfahren** plans have no enactment date — rank falls back to plan-without-date ordering.
- **Plan count limit.** WFS queries are capped at `COUNT=50` per layer.
- **No portalUrl for Berlin** — Berlin has no equivalent to the Hamburg Planportal deep link.

---

## What works

- Full end-to-end flow for Hamburg and Berlin addresses
- Correct "no plan found" for areas without B-Plans
- Correct "no plan found" with note for unsupported states (e.g. Bayern)
- Correct "not verifiable" only when the upstream source is genuinely unavailable
- Legal status badge (Rechtskräftig / Im Verfahren)
- Document PDF links when available
- Authority attribution from source data

## What does not yet work

- Other German states (Bayern, NRW, etc.) — no adapters implemented
- Secondary plan display — only the top-ranked plan is shown
- Download URL distinct from documentUrl

## How to add another state

1. Create `src/lib/providers/<state>-wfs.ts` implementing `BPlanProvider`
2. Add one routing case in `route.ts`: `else if (stateCode === "DE-XX") { provider = new XxxProvider(); }`
3. No other files need changes

### How AI tools were used

Claude (Anthropic) was used throughout the implementation:
- Researching WFS endpoints, layer names, field mappings, and query quirks for both Hamburg and Berlin
- Designing the layered architecture (orchestration / adapter / geo)
- Writing the TypeScript implementation following the agreed structure
- Identifying Berlin WFS quirks (`typeNames` vs `typeName`, `application/json` vs `application/geo+json`)
- Writing this README
