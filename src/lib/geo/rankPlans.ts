// Plan ranking.
// When multiple plans cover the same point, we pick one primary plan.
//
// Ranking rules (in order):
//   1. rechtskräftig before im_verfahren (legally established beats procedural)
//   2. Within the same status: newer feststellungsdatum wins
//   3. Plans without a date sort to the end
//
// The caller takes ranked[0] as the primary result.

import { RawPlanFeature } from "@/lib/types";

// Parse a date in DD.MM.YYYY format (as provided by Hamburg WFS) into a Date object.
// Returns null if the string is missing or unparseable.
function parseGermanDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;

  const parts = dateStr.split(".");
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  return new Date(year, month, day);
}

// Status priority: lower number = higher priority
const STATUS_PRIORITY: Record<RawPlanFeature["status"], number> = {
  rechtskraeftig: 0,
  im_verfahren: 1,
};

export function rankPlans(plans: RawPlanFeature[]): RawPlanFeature[] {
  return [...plans].sort((a, b) => {
    // Rule 1: rechtskräftig beats im_verfahren
    const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Rule 2: newer date wins (descending)
    const dateA = parseGermanDate(a.date);
    const dateB = parseGermanDate(b.date);

    if (dateA && dateB) return dateB.getTime() - dateA.getTime();
    if (dateA && !dateB) return -1; // a has date, b doesn't → a ranks higher
    if (!dateA && dateB) return 1;  // b has date, a doesn't → b ranks higher

    return 0;
  });
}
