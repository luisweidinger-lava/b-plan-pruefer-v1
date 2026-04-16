// Hamburg B-Plan WFS provider.
// Data source: LGV Hamburg (Landesbetrieb Geoinformation und Vermessung)
// Endpoint: https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene
//
// This provider:
//   1. Computes a bounding box around the given point
//   2. Fetches two WFS layers (rechtskräftig + im Verfahren) concurrently
//   3. Parses the GeoJSON response into RawPlanFeature objects
//   4. Returns all candidates — point-in-polygon happens in the geo layer

import { BPlanProvider } from "@/lib/providers/base";
import { RawPlanFeature } from "@/lib/types";
import { BPlanError } from "@/lib/utils/errors";

const WFS_ENDPOINT = "https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene";

// Authority is directly derivable from this source — it's always the LGV Hamburg
const AUTHORITY = "Behörde für Stadtentwicklung und Wohnen, Hamburg";

// Bounding box delta around the query point (in degrees, EPSG:4326)
// At ~53.5° latitude: ±0.006 lon ≈ 360m, ±0.004 lat ≈ 445m
const BBOX_LON_DELTA = 0.006;
const BBOX_LAT_DELTA = 0.004;

// ─── WFS layer definitions ───────────────────────────────────────────────────

// Layer 1: Rechtskräftige (legally established) Bebauungspläne
const LAYER_FESTGESTELLT = {
  typeName: "app:hh_hh_festgestellt",
  status: "rechtskraeftig" as const,
  nameField: "geltendes_planrecht",
  urlField: "planrecht",
  pageUrlField: "begruendung", // Begründung PDF — a required planning document; not always present
  dateField: "feststellungsdatum",
};

// Layer 2: Bebauungspläne im Verfahren (in procedural phase)
// Note: this layer has no document or page URL fields
const LAYER_IM_VERFAHREN = {
  typeName: "app:prosin_imverfahren",
  status: "im_verfahren" as const,
  nameField: "plan",
  urlField: null,
  pageUrlField: null,
  dateField: null,
};

// ─── URL builder ─────────────────────────────────────────────────────────────

type BBox = { minLon: number; minLat: number; maxLon: number; maxLat: number };

function buildWfsUrl(typeName: string, bbox: BBox): string {
  // IMPORTANT: BBOX parameter is lon-first (minLon,minLat,maxLon,maxLat,EPSG:4326)
  // Using lat-first silently returns an empty FeatureCollection — a known WFS gotcha
  const bboxParam = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat},EPSG:4326`;

  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: typeName,
    outputFormat: "application/geo+json",
    srsName: "EPSG:4326",
    BBOX: bboxParam,
    COUNT: "50",
  });

  return `${WFS_ENDPOINT}?${params.toString()}`;
}

// ─── Layer fetcher ────────────────────────────────────────────────────────────

type LayerConfig = typeof LAYER_FESTGESTELLT | typeof LAYER_IM_VERFAHREN;

async function fetchLayer(
  layer: LayerConfig,
  bbox: BBox
): Promise<RawPlanFeature[]> {
  const url = buildWfsUrl(layer.typeName, bbox);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (err) {
    throw new BPlanError(
      `Hamburg WFS network error on layer ${layer.typeName}: ${err}`,
      "upstream_unavailable"
    );
  }

  if (!response.ok) {
    throw new BPlanError(
      `Hamburg WFS returned HTTP ${response.status} for layer ${layer.typeName}`,
      "upstream_unavailable"
    );
  }

  const data = await response.json();

  // WFS returns {"type":"FeatureCollection"} with no "features" key when empty
  const features: GeoJSON.Feature[] = data.features ?? [];

  return features.map((f): RawPlanFeature => {
    const props = f.properties ?? {};
    return {
      id: String(f.id ?? ""),
      name: String(props[layer.nameField] ?? "Unbekannter Plan"),
      status: layer.status,
      documentUrl: layer.urlField ? String(props[layer.urlField] ?? "") || undefined : undefined,
      pageUrl: layer.pageUrlField ? String(props[layer.pageUrlField] ?? "") || undefined : undefined,
      date: layer.dateField ? String(props[layer.dateField] ?? "") || undefined : undefined,
      geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      authority: AUTHORITY,
    };
  });
}

// ─── Provider class ───────────────────────────────────────────────────────────

export class HamburgWfsProvider implements BPlanProvider {
  readonly name = "Hamburg WFS (LGV Hamburg)";

  async fetchPlans(lat: number, lon: number): Promise<RawPlanFeature[]> {
    // Step 1: Compute a bounding box around the query point
    const bbox: BBox = {
      minLon: lon - BBOX_LON_DELTA,
      minLat: lat - BBOX_LAT_DELTA,
      maxLon: lon + BBOX_LON_DELTA,
      maxLat: lat + BBOX_LAT_DELTA,
    };

    // Step 2: Fetch both layers concurrently
    // Using Promise.allSettled so one failing layer doesn't block the other
    const [festgestelltResult, imVerfahrenResult] = await Promise.allSettled([
      fetchLayer(LAYER_FESTGESTELLT, bbox),
      fetchLayer(LAYER_IM_VERFAHREN, bbox),
    ]);

    // Step 3: If both layers failed, the upstream is genuinely unavailable
    if (
      festgestelltResult.status === "rejected" &&
      imVerfahrenResult.status === "rejected"
    ) {
      throw new BPlanError(
        "Both Hamburg WFS layers failed to respond",
        "upstream_unavailable"
      );
    }

    // Step 4: Merge results from whichever layers succeeded
    const festgestellt =
      festgestelltResult.status === "fulfilled" ? festgestelltResult.value : [];
    const imVerfahren =
      imVerfahrenResult.status === "fulfilled" ? imVerfahrenResult.value : [];

    return [...festgestellt, ...imVerfahren];
  }
}
