// Point-in-polygon check using turf.
// Takes all plan candidates (from the WFS BBOX query) and returns only those
// whose geometry actually contains the query point.
//
// This is the core spatial decision: BBOX gives us candidates, PiP gives us truth.

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { RawPlanFeature } from "@/lib/types";
import { normalizeToGeoJsonFeature } from "@/lib/geo/normalizeGeometry";

export function filterByPointInPolygon(
  lat: number,
  lon: number,
  candidates: RawPlanFeature[]
): RawPlanFeature[] {
  // IMPORTANT: turf uses GeoJSON coordinate order → [longitude, latitude]
  const queryPoint = point([lon, lat]);

  return candidates.filter((candidate) => {
    try {
      const feature = normalizeToGeoJsonFeature(candidate);
      return booleanPointInPolygon(queryPoint, feature);
    } catch {
      // If a single feature has bad geometry, skip it rather than crashing everything
      return false;
    }
  });
}
