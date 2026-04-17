// Berlin WFS provider — parallel to hamburg-wfs.ts
//
// Source: Geoportal Berlin / Senatsverwaltung für Stadtentwicklung
// Endpoint: https://gdi.berlin.de/services/wfs/bplan
//
// Three layers exist in the Berlin WFS. We query two active ones:
//   bplan:b_bp_fs  — festgesetzt (rechtskräftig)
//   bplan:a_bp_iv  — im Verfahren
// We skip bplan:c_bp_ak (außer Kraft gesetzt) — inactive, not relevant for active B-Plan lookup.

import { BPlanProvider } from "./base";
import { RawPlanFeature, PlanStatus } from "@/lib/types";
import { BPlanError } from "@/lib/utils/errors";

const WFS_ENDPOINT = "https://gdi.berlin.de/services/wfs/bplan";
const AUTHORITY_FALLBACK = "Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen, Berlin";

// Same BBOX radius as Hamburg — gives ~360m × 445m search area around the query point
const BBOX_LON_DELTA = 0.006;
const BBOX_LAT_DELTA = 0.004;

type LayerConfig = {
  typeName: string;
  status: PlanStatus;
  nameField: string;
  idField: string;
  documentUrlField: string | null; // scan_www (plan drawing PDF)
  pageUrlField: string | null;     // grund_www (Begründung) or ausleg_www (participation)
  dateField: string | null;        // festsg_am — ISO date (YYYY-MM-DD), only in festgesetzt layer
};

const LAYER_FESTGESETZT: LayerConfig = {
  typeName: "bplan:b_bp_fs",
  status: "rechtskraeftig",
  nameField: "planname",
  idField: "planid",
  documentUrlField: "scan_www",
  pageUrlField: "grund_www",
  dateField: "festsg_am",
};

const LAYER_IM_VERFAHREN: LayerConfig = {
  typeName: "bplan:a_bp_iv",
  status: "im_verfahren",
  nameField: "planname",
  idField: "planid",
  documentUrlField: null,
  pageUrlField: "ausleg_www",
  dateField: null,
};

// Berlin WFS returns dates as ISO format (YYYY-MM-DD); convert to DD.MM.YYYY for consistency
// with Hamburg and for use by rankPlans.ts which expects this format.
function isoToGermanDate(isoDate: string | null | undefined): string | undefined {
  if (!isoDate) return undefined;
  const parts = isoDate.split("-");
  if (parts.length !== 3) return undefined;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function buildWfsUrl(
  typeName: string,
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): string {
  const url = new URL(WFS_ENDPOINT);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  // WFS 2.0 uses "typeNames" (plural) — "typeName" is WFS 1.x syntax and returns an error
  url.searchParams.set("typeNames", typeName);
  // Berlin WFS supports "application/json" — "application/geo+json" is rejected by this server
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("COUNT", "50");
  // BBOX parameter: longitude-first (minLon,minLat,maxLon,maxLat,CRS)
  url.searchParams.set("BBOX", `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`);
  return url.toString();
}

async function fetchLayer(
  layer: LayerConfig,
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): Promise<RawPlanFeature[]> {
  const wfsUrl = buildWfsUrl(layer.typeName, minLon, minLat, maxLon, maxLat);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(wfsUrl, { signal: controller.signal });
  } catch (err) {
    throw new BPlanError(
      `Berlin WFS network error (${layer.typeName}): ${err}`,
      "upstream_unavailable"
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new BPlanError(
      `Berlin WFS returned HTTP ${response.status} for ${layer.typeName}`,
      "upstream_unavailable"
    );
  }

  const geojson = await response.json();
  const features = geojson.features ?? [];

  return features.map((feature: {
    id: string;
    properties: Record<string, string | null>;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }): RawPlanFeature => {
    const props = feature.properties ?? {};

    // planname is Optional in the Berlin WFS schema — fall back to planid
    const rawName = props[layer.nameField];
    const rawId = props[layer.idField];
    const name = (rawName && rawName.trim()) ? rawName.trim() : (rawId ?? feature.id ?? "Unbekannter Plan");

    return {
      id: rawId ?? feature.id ?? "",
      name,
      status: layer.status,
      documentUrl: layer.documentUrlField ? (props[layer.documentUrlField] ?? undefined) : undefined,
      pageUrl: layer.pageUrlField ? (props[layer.pageUrlField] ?? undefined) : undefined,
      date: layer.dateField ? isoToGermanDate(props[layer.dateField]) : undefined,
      geometry: feature.geometry,
      // Use per-feature authority field if present; fall back to the known Berlin authority
      authority: (props["afs_behoer"] && props["afs_behoer"].trim())
        ? props["afs_behoer"].trim()
        : AUTHORITY_FALLBACK,
    };
  });
}

export class BerlinWfsProvider implements BPlanProvider {
  readonly name = "Berlin WFS (Geoportal Berlin)";

  async fetchPlans(lat: number, lon: number): Promise<RawPlanFeature[]> {
    const minLon = lon - BBOX_LON_DELTA;
    const maxLon = lon + BBOX_LON_DELTA;
    const minLat = lat - BBOX_LAT_DELTA;
    const maxLat = lat + BBOX_LAT_DELTA;

    // Fetch both active layers concurrently — one layer failing should not block the other
    const [festgesetztResult, imVerfahrenResult] = await Promise.allSettled([
      fetchLayer(LAYER_FESTGESETZT, minLon, minLat, maxLon, maxLat),
      fetchLayer(LAYER_IM_VERFAHREN, minLon, minLat, maxLon, maxLat),
    ]);

    if (festgesetztResult.status === "rejected" && imVerfahrenResult.status === "rejected") {
      throw new BPlanError(
        "Both Berlin WFS layers failed to respond",
        "upstream_unavailable"
      );
    }

    const festgesetzt = festgesetztResult.status === "fulfilled" ? festgesetztResult.value : [];
    const imVerfahren = imVerfahrenResult.status === "fulfilled" ? imVerfahrenResult.value : [];

    return [...festgesetzt, ...imVerfahren];
  }
}
