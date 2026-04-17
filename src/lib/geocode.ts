// Geocoding using Nominatim (OpenStreetMap).
// Converts a free-text German address into a lat/lon coordinate + confirmed display name.

import { BPlanError } from "@/lib/utils/errors";
import { GeocodeResult } from "@/lib/types";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  // Nominatim requires a User-Agent identifying the application (ToS requirement)
  const userAgent =
    process.env.NOMINATIM_USER_AGENT ?? "bplan-checker/1.0 (planeco-mvp)";

  // 8 second timeout — geocoding should be fast; anything longer is likely a network issue
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
  } catch (err) {
    throw new BPlanError(
      `Geocoding network error: ${err}`,
      "upstream_unavailable"
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new BPlanError(
      `Nominatim returned HTTP ${response.status}`,
      "upstream_unavailable"
    );
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    throw new BPlanError(
      `No geocoding results found for: ${address}`,
      "geocode_failed"
    );
  }

  const first = results[0];
  return {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
    confirmedAddress: first.display_name as string,
    // ISO3166-2-lvl4 is reliably present for all German addresses including city-states
    // (Hamburg: "DE-HH", Berlin: "DE-BE"). The "state" field is absent for city-states.
    stateCode: first.address?.["ISO3166-2-lvl4"] as string | undefined,
  };
}
