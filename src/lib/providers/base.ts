// Provider interface for B-Plan data sources.
// Each provider connects to one type of external data source (WFS, ArcGIS, etc.)
// and returns a list of raw plan features near the given coordinates.
//
// To add a new source (e.g. Bavaria), create a new file in this folder
// that implements this interface — no changes to the rest of the system needed.

import { RawPlanFeature } from "@/lib/types";

export interface BPlanProvider {
  // Human-readable name of the data source (shown in result metadata)
  readonly name: string;

  // Fetch all B-Plan candidates near the given point.
  // Point-in-polygon filtering happens outside the provider, in the geo layer.
  fetchPlans(lat: number, lon: number): Promise<RawPlanFeature[]>;
}
