// Core types for the B-Plan checker.
// Keep these flat and self-explanatory — no nested generics.

// The legal status of a plan from the WFS source
export type PlanStatus = "rechtskraeftig" | "im_verfahren";

// A raw plan feature as returned by any provider, before ranking or output formatting
export type RawPlanFeature = {
  id: string;
  name: string;
  status: PlanStatus;
  documentUrl?: string;
  pageUrl?: string; // URL to official plan page or additional document (e.g. Begründung)
  date?: string; // DD.MM.YYYY format as provided by Hamburg WFS
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  // Authority is only included if directly present in the source data
  authority?: string;
};

// Result of geocoding an address
export type GeocodeResult = {
  lat: number;
  lon: number;
  confirmedAddress: string;
  // ISO 3166-2 state code from Nominatim (e.g. "DE-HH", "DE-BE") — used for provider routing.
  // Hamburg and Berlin are city-states and have no Nominatim "state" field; this uses
  // the ISO3166-2-lvl4 field which is reliably present for all German addresses.
  stateCode?: string;
};

// The normalized output contract returned by the API route
export type NormalizedPlanResult = {
  query: {
    inputAddress: string;
    confirmedAddress?: string;
    lat?: number;
    lon?: number;
  };
  status: "plan_found" | "no_plan_found" | "not_verifiable";
  // sourceStatus distinguishes why we got this status:
  // "ok"                  → external source responded, result is trustworthy
  // "upstream_unavailable"→ official source was unreachable (real outage)
  // "invalid_input"       → address could not be geocoded
  // "internal_error"      → unexpected bug (should not happen in normal operation)
  sourceStatus: "ok" | "upstream_unavailable" | "invalid_input" | "internal_error";
  primaryPlan?: {
    id?: string;
    name: string;
    type?: string;
    status?: string;
    authority?: string;
    source: string;
    portalUrl?: string; // Deep link to the official planning portal with the address pre-searched
    documentUrl?: string;
    pageUrl?: string; // URL to official plan page or additional document (e.g. Begründung)
    downloadUrl?: string;
    date?: string;
  };
  notes?: string[];
};
