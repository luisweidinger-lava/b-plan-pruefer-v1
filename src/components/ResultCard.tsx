// Result card — displays the outcome of a B-Plan check.
// Three distinct states: plan found, no plan, or currently not verifiable.

import { NormalizedPlanResult } from "@/lib/types";

type Props = {
  result: NormalizedPlanResult;
};

export function ResultCard({ result }: Props) {
  if (result.status === "plan_found" && result.primaryPlan) {
    return <PlanFoundCard result={result} />;
  }

  if (result.status === "no_plan_found") {
    return <NoPlanCard result={result} />;
  }

  return <NotVerifiableCard result={result} />;
}

// ─── Plan found ────────────────────────────────────────────────────────────────

function PlanFoundCard({ result }: Props) {
  const plan = result.primaryPlan!;
  const isRechtskraeftig = plan.status === "Rechtskräftig";

  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{ border: "1px solid #c8e6c0" }}
    >
      {/* Status banner */}
      <div
        className="px-6 py-3 flex items-center gap-2"
        style={{ backgroundColor: "#d4edda" }}
      >
        <span className="text-green-700 text-lg">✓</span>
        <span className="font-semibold text-green-800 text-sm">
          Bebauungsplan gefunden
        </span>
      </div>

      {/* Main content */}
      <div className="px-6 py-5" style={{ backgroundColor: "#EAE6DF" }}>
        {/* Plan name — the key piece of information */}
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#3E6259" }}>
            Bebauungsplan
          </p>
          <p className="text-2xl font-bold" style={{ color: "#1F2D2A" }}>
            {plan.name}
          </p>
        </div>

        {/* Plan metadata grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Legal status with colored badge */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#3E6259" }}>
              Status
            </p>
            <span
              className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: isRechtskraeftig ? "#2F4F46" : "#D48463",
                color: "#ffffff",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
              {plan.status}
            </span>
          </div>

          {/* Date */}
          {plan.date && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#3E6259" }}>
                Feststellungsdatum
              </p>
              <p className="text-sm font-medium" style={{ color: "#1F2D2A" }}>
                {plan.date}
              </p>
            </div>
          )}

          {/* Responsible authority */}
          {plan.authority && (
            <div className="col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#3E6259" }}>
                Zuständige Stelle
              </p>
              <p className="text-sm" style={{ color: "#1F2D2A" }}>
                {plan.authority}
              </p>
            </div>
          )}

          {/* Confirmed address */}
          {result.query.confirmedAddress && (
            <div className="col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#3E6259" }}>
                Bestätigte Adresse
              </p>
              <p className="text-sm" style={{ color: "#1F2D2A", opacity: 0.8 }}>
                {result.query.confirmedAddress}
              </p>
            </div>
          )}
        </div>

        {/* Document links */}
        <div className="flex items-center gap-3 flex-wrap">
          {plan.documentUrl && (
            <a
              href={plan.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-xl transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#D48463", color: "#ffffff" }}
            >
              <span>B-Plan öffnen</span>
              <span>↗</span>
            </a>
          )}

          {plan.pageUrl && (
            <a
              href={plan.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm px-4 py-3 rounded-xl transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "rgba(47, 79, 70, 0.08)",
                color: "#2F4F46",
                border: "1px solid rgba(47, 79, 70, 0.15)",
              }}
            >
              <span>Begründung öffnen</span>
              <span style={{ opacity: 0.6 }}>↗</span>
            </a>
          )}

          {plan.portalUrl && (
            <a
              href={plan.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
              style={{ color: "#3E6259", textDecoration: "underline", textUnderlineOffset: "3px" }}
            >
              Planportal ↗
            </a>
          )}
        </div>

        {/* Source attribution */}
        <p className="text-xs mt-4" style={{ color: "#3E6259", opacity: 0.6 }}>
          Quelle: {plan.source}
        </p>
      </div>
    </div>
  );
}

// ─── No plan found ─────────────────────────────────────────────────────────────

function NoPlanCard({ result }: Props) {
  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{ border: "1px solid #d0cfc8" }}
    >
      <div
        className="px-6 py-3 flex items-center gap-2"
        style={{ backgroundColor: "#dddbd4" }}
      >
        <span className="text-base" style={{ color: "#3E6259" }}>○</span>
        <span className="font-semibold text-sm" style={{ color: "#2F4F46" }}>
          Kein Bebauungsplan gefunden
        </span>
      </div>

      <div className="px-6 py-5" style={{ backgroundColor: "#EAE6DF" }}>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#1F2D2A" }}>
          Für diese Adresse liegt kein Bebauungsplan im Register vor.
        </p>

        {result.query.confirmedAddress && (
          <p className="text-xs mb-3" style={{ color: "#3E6259", opacity: 0.8 }}>
            Adresse: {result.query.confirmedAddress}
          </p>
        )}

        {result.notes && result.notes.length > 0 && (
          <ul className="text-xs space-y-1" style={{ color: "#3E6259", opacity: 0.8 }}>
            {result.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Not verifiable ────────────────────────────────────────────────────────────

function NotVerifiableCard({ result }: Props) {
  const isOutage = result.sourceStatus === "upstream_unavailable";

  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{ border: "1px solid #f5d87a" }}
    >
      <div
        className="px-6 py-3 flex items-center gap-2"
        style={{ backgroundColor: "#fef9c3" }}
      >
        <span className="text-yellow-600 text-base">!</span>
        <span className="font-semibold text-sm text-yellow-800">
          {isOutage ? "Aktuell nicht verifizierbar" : "Adresse nicht gefunden"}
        </span>
      </div>

      <div className="px-6 py-5" style={{ backgroundColor: "#EAE6DF" }}>
        <p className="text-sm leading-relaxed" style={{ color: "#1F2D2A" }}>
          {result.notes?.[0] ?? (
            isOutage
              ? "Der Geodatendienst ist momentan nicht erreichbar. Bitte versuche es später erneut."
              : "Die Adresse konnte nicht verarbeitet werden."
          )}
        </p>
      </div>
    </div>
  );
}
