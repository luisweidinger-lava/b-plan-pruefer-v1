"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { AddressInput } from "@/components/AddressInput";
import { ResultCard } from "@/components/ResultCard";
import { NormalizedPlanResult } from "@/lib/types";

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NormalizedPlanResult | null>(null);
  const [networkError, setNetworkError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address.trim()) return;

    setLoading(true);
    setResult(null);
    setNetworkError(false);

    try {
      const res = await fetch(
        `/api/check-bplan?address=${encodeURIComponent(address.trim())}`
      );
      const data: NormalizedPlanResult = await res.json();
      setResult(data);
    } catch {
      // Only reaches here if the fetch itself failed (app server unreachable)
      setNetworkError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-16"
      style={{ backgroundColor: "#F5F3EF" }}
    >
      <div className="w-full max-w-lg">
        {/* Header */}
        <Header />

        {/* Address input card */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            backgroundColor: "#EAE6DF",
            border: "1px solid rgba(63, 98, 89, 0.15)",
          }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label
              htmlFor="address-input"
              className="text-sm font-semibold"
              style={{ color: "#2F4F46" }}
            >
              Adresse eingeben
            </label>

            <AddressInput
              id="address-input"
              value={address}
              onChange={setAddress}
              placeholder="z.B. Rathausmarkt 1, Hamburg"
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="w-full py-3 px-6 rounded-xl font-bold text-sm transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#D48463", color: "#ffffff" }}
            >
              {loading ? "Wird geprüft…" : "B-Plan prüfen"}
            </button>
          </form>
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="text-center py-4">
            <div
              className="inline-block w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#2F4F46", borderTopColor: "transparent" }}
            />
            <p className="text-sm mt-2" style={{ color: "#3E6259" }}>
              Adresse wird gecoded und Bebauungspläne werden geprüft…
            </p>
          </div>
        )}

        {/* Network error (app server unreachable — very rare) */}
        {networkError && (
          <div
            className="rounded-2xl px-6 py-4 text-sm"
            style={{ backgroundColor: "#fef9c3", border: "1px solid #f5d87a" }}
          >
            <p className="font-semibold text-yellow-800 mb-1">Verbindungsfehler</p>
            <p className="text-yellow-700">
              Die Anwendung konnte nicht erreicht werden. Bitte überprüfe deine
              Internetverbindung und versuche es erneut.
            </p>
          </div>
        )}

        {/* Result */}
        {result && !loading && <ResultCard result={result} />}

        {/* Footer note */}
        <p
          className="text-xs text-center mt-8"
          style={{ color: "#3E6259", opacity: 0.55 }}
        >
          Prototyp · Daten: LGV Hamburg (DL-DE-BY-2.0) · Geocoding: OpenStreetMap / Nominatim
        </p>
      </div>
    </main>
  );
}
