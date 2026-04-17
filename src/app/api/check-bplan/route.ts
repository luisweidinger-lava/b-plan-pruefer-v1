// API Route: /api/check-bplan?address=<string>
//
// This is the orchestration layer — it tells the full story of a B-Plan check
// in one readable sequence. Each step is explicit and commented.
//
// Flow:
//   1. Validate the input address
//   2. Geocode address → lat/lon + state
//   3. Route to the correct provider based on state (Hamburg or Berlin)
//   4. Fetch B-Plan candidates from the provider (bounding box query)
//   5. Filter candidates by exact point-in-polygon check
//   6. Rank matches (rechtskräftig first, then newest date)
//   7. Assemble and return the normalized result

import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";
import { HamburgWfsProvider } from "@/lib/providers/hamburg-wfs";
import { BerlinWfsProvider } from "@/lib/providers/berlin-wfs";
import { BPlanProvider } from "@/lib/providers/base";
import { filterByPointInPolygon } from "@/lib/geo/pointInPolygon";
import { rankPlans } from "@/lib/geo/rankPlans";
import { BPlanError, isUpstreamFailure } from "@/lib/utils/errors";
import { NormalizedPlanResult } from "@/lib/types";

// Extracts "Street HouseNumber" from a Nominatim display_name for use as a
// planportal search query. Nominatim formats display_name as comma-separated
// components: "Street, HouseNumber, Suburb, District, City, PostalCode, Country".
// We take the first component plus the second when it starts with a digit.
// Example: "Jungfernstieg, 12, Neustadt, ..." → "Jungfernstieg 12"
function extractStreetAndNumber(nominatimDisplayName: string): string {
  const parts = nominatimDisplayName.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^\d/.test(parts[1])) {
    return `${parts[0]} ${parts[1]}`;
  }
  // No house number detected — street name alone is still a valid gazetteer query
  return parts[0] ?? nominatimDisplayName;
}

export async function GET(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (err) {
    // Should not reach here in normal operation — all expected failures are handled above
    console.error("Unexpected B-Plan checker error:", err);
    const result: NormalizedPlanResult = {
      query: { inputAddress: "" },
      status: "not_verifiable",
      sourceStatus: "internal_error",
      notes: ["Ein unerwarteter Fehler ist aufgetreten."],
    };
    return NextResponse.json(result, { status: 500 });
  }
}

async function handleRequest(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim() ?? "";

  // Step 1: Validate input
  if (!address) {
    const result: NormalizedPlanResult = {
      query: { inputAddress: "" },
      status: "not_verifiable",
      sourceStatus: "invalid_input",
      notes: ["Bitte gib eine Adresse ein."],
    };
    return NextResponse.json(result, { status: 400 });
  }

  // Step 2: Geocode address → lat/lon + state
  let geocoded;
  try {
    geocoded = await geocodeAddress(address);
  } catch (err) {
    if (err instanceof BPlanError && err.code === "geocode_failed") {
      // The address simply wasn't found — not an upstream outage
      const result: NormalizedPlanResult = {
        query: { inputAddress: address },
        status: "not_verifiable",
        sourceStatus: "invalid_input",
        notes: [
          "Die Adresse konnte nicht gefunden werden. Bitte präzisiere deine Eingabe.",
        ],
      };
      return NextResponse.json(result);
    }
    if (isUpstreamFailure(err)) {
      const result: NormalizedPlanResult = {
        query: { inputAddress: address },
        status: "not_verifiable",
        sourceStatus: "upstream_unavailable",
        notes: [
          "Der Geocoding-Dienst ist momentan nicht erreichbar. Bitte versuche es später erneut.",
        ],
      };
      return NextResponse.json(result);
    }
    throw err; // Unexpected — fall through to outer catch
  }

  const { lat, lon, confirmedAddress } = geocoded;

  // Step 3: Select provider based on the geocoded state
  // We use the ISO 3166-2 state code (ISO3166-2-lvl4) from Nominatim — this field is
  // reliably present for all German addresses, including city-states like Hamburg and
  // Berlin which have no separate "state" field in the Nominatim address object.
  const stateCode = geocoded.stateCode ?? "";

  let provider: BPlanProvider | null = null;
  if (stateCode === "DE-HH") {
    provider = new HamburgWfsProvider();
  } else if (stateCode === "DE-BE") {
    provider = new BerlinWfsProvider();
  }

  // Unsupported state — return cleanly without querying any WFS
  if (!provider) {
    const result: NormalizedPlanResult = {
      query: { inputAddress: address, confirmedAddress, lat, lon },
      status: "no_plan_found",
      sourceStatus: "ok",
      notes: [
        "Bebauungsplan-Daten sind aktuell nur für Hamburg und Berlin verfügbar. " +
          "Diese Adresse liegt möglicherweise außerhalb des unterstützten Bereichs.",
      ],
    };
    return NextResponse.json(result);
  }

  // Step 4: Fetch B-Plan candidates from the selected provider (BBOX query)
  let candidates;
  try {
    candidates = await provider.fetchPlans(lat, lon);
  } catch (err) {
    if (isUpstreamFailure(err)) {
      const result: NormalizedPlanResult = {
        query: { inputAddress: address, confirmedAddress, lat, lon },
        status: "not_verifiable",
        sourceStatus: "upstream_unavailable",
        notes: [
          `Der Geodatendienst (${provider.name}) ist momentan nicht erreichbar. ` +
            "Das Ergebnis kann daher aktuell nicht verifiziert werden.",
        ],
      };
      return NextResponse.json(result);
    }
    throw err;
  }

  // Step 5: Filter candidates by exact point-in-polygon
  // (The BBOX query returns a generous area; PiP narrows to the exact property)
  const matches = filterByPointInPolygon(lat, lon, candidates);

  // Step 6: Rank matches — rechtskräftig first, then newest date
  const ranked = rankPlans(matches);

  // Step 7: Assemble result

  // No plan found for this address
  if (ranked.length === 0) {
    const notes: string[] = [];
    if (candidates.length === 0) {
      // WFS returned zero features in the bounding box — address is in a supported state
      // but either has no registered B-Plan or lies in a special-use area.
      notes.push(
        "Für diese Adresse ist kein Bebauungsplan im Register vorhanden. " +
          "Manche Bereiche (z.B. Hafen, Grünflächen, Gewässer) sind planungsrechtlich anders geregelt."
      );
    }
    const result: NormalizedPlanResult = {
      query: { inputAddress: address, confirmedAddress, lat, lon },
      status: "no_plan_found",
      sourceStatus: "ok",
      notes,
    };
    return NextResponse.json(result);
  }

  // Plan found — return the top-ranked one as the primary result
  const primary = ranked[0];

  // Hamburg-specific portal deep link (only Hamburg has this; Berlin uses direct document links)
  const portalUrl =
    provider instanceof HamburgWfsProvider
      ? `https://geoportal-hamburg.de/planportal/?QUERY=${encodeURIComponent(extractStreetAndNumber(confirmedAddress))}`
      : undefined;

  const result: NormalizedPlanResult = {
    query: { inputAddress: address, confirmedAddress, lat, lon },
    status: "plan_found",
    sourceStatus: "ok",
    primaryPlan: {
      id: primary.id,
      name: primary.name,
      status: primary.status === "rechtskraeftig" ? "Rechtskräftig" : "Im Verfahren",
      authority: primary.authority,
      source: provider.name,
      portalUrl,
      documentUrl: primary.documentUrl,
      pageUrl: primary.pageUrl,
      date: primary.date,
    },
  };
  return NextResponse.json(result);
}
