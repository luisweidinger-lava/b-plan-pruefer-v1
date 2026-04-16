// Error classification for the B-Plan checker.
// The goal is simple: give the API route a way to tell "upstream is down"
// from "something else went wrong".

export type ErrorCode =
  | "upstream_unavailable" // Official WFS or geocoding service is unreachable
  | "invalid_input"        // Address string is empty or unusable
  | "geocode_failed"       // Address could not be geocoded (not an outage)
  | "internal_error";      // Unexpected bug

export class BPlanError extends Error {
  code: ErrorCode;

  constructor(message: string, code: ErrorCode) {
    super(message);
    this.name = "BPlanError";
    this.code = code;
  }
}

// Returns true if the error indicates the upstream source is genuinely unavailable.
// Used by the API route to decide whether to return "not_verifiable" vs other statuses.
export function isUpstreamFailure(err: unknown): boolean {
  if (err instanceof BPlanError) {
    return err.code === "upstream_unavailable";
  }
  // A fetch TypeError typically means a network failure (DNS, timeout, connection refused)
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return true;
  }
  return false;
}
