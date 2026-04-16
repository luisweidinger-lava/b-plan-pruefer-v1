// Geometry normalization.
// The Hamburg WFS returns geometries as GeoJSON already, so this file's job is simple:
// wrap a RawPlanFeature's geometry into a GeoJSON Feature object that turf can work with.
//
// The explicit wrapping (rather than passing raw geometry) lets the rest of the geo layer
// stay clean and type-safe, and makes it obvious what shape turf expects.

import { RawPlanFeature } from "@/lib/types";
import { BPlanError } from "@/lib/utils/errors";

export function normalizeToGeoJsonFeature(
  raw: RawPlanFeature
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const { geometry } = raw;
  const geomType = geometry.type; // Capture before narrowing to avoid "never" type in error message

  // Defensive check: we only support Polygon and MultiPolygon from the WFS
  if (geomType !== "Polygon" && geomType !== "MultiPolygon") {
    throw new BPlanError(
      `Unexpected geometry type "${geomType}" for plan "${raw.name}"`,
      "internal_error"
    );
  }

  return {
    type: "Feature",
    geometry: geometry,
    properties: { id: raw.id, name: raw.name },
  };
}
