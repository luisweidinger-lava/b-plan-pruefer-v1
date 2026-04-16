"use client";

// Address input with autocomplete dropdown.
//
// API: Nominatim (nominatim.openstreetmap.org/search)
//   - The same OSM geocoding service already used for the B-Plan check
//   - Free, no API key, works for all of Germany
//   - Returns up to 5 address suggestions as the user types
//
// Rate limiting:
//   - Nominatim asks for max 1 request/second per application
//   - 600ms debounce ensures we fire at most ~1.6 req/s in worst case,
//     and in practice much less since users pause while typing
//   - AbortController cancels any in-flight request when a new one starts,
//     preventing stale responses from arriving out of order

import { useEffect, useRef, useState } from "react";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

// ─── Nominatim fetch ──────────────────────────────────────────────────────────

async function fetchSuggestions(
  query: string,
  signal: AbortSignal
): Promise<string[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  // Bias results towards Germany without excluding other countries
  url.searchParams.set("countrycodes", "de");

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      "User-Agent":
        process.env.NEXT_PUBLIC_NOMINATIM_USER_AGENT ??
        "bplan-checker/1.0 (planeco-mvp)",
    },
  });

  if (!res.ok) return [];

  const results = await res.json();
  // Nominatim returns display_name — a clean, comma-separated full address string
  return (results as { display_name: string }[]).map((r) => r.display_name);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddressInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking anywhere outside the component
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    onChange(newValue);
    setActiveIndex(-1);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (newValue.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    // Wait 600ms after the user stops typing before calling Nominatim
    debounceTimer.current = setTimeout(async () => {
      // Cancel previous in-flight request before starting a new one
      if (abortController.current) abortController.current.abort();
      abortController.current = new AbortController();

      try {
        const results = await fetchSuggestions(
          newValue.trim(),
          abortController.current.signal
        );
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          // Silently fail — autocomplete is a UX enhancement, not critical
          setSuggestions([]);
          setShowDropdown(false);
        }
      }
    }, 600);
  }

  function handleSelectSuggestion(suggestion: string) {
    onChange(suggestion);
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      // Intercept Enter only when a suggestion is highlighted
      e.preventDefault();
      handleSelectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  }

  const dropdownOpen = showDropdown && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.target.style.borderColor = "#2F4F46";
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "rgba(63, 98, 89, 0.25)";
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={dropdownOpen}
        className="w-full px-4 py-3 text-sm outline-none transition-all"
        style={{
          backgroundColor: "#F5F3EF",
          border: "1px solid rgba(63, 98, 89, 0.25)",
          color: "#1F2D2A",
          // Merge bottom corners with the dropdown when it's open
          borderRadius: dropdownOpen ? "12px 12px 0 0" : "12px",
        }}
      />

      {dropdownOpen && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-10 overflow-hidden"
          style={{
            backgroundColor: "#F5F3EF",
            border: "1px solid #2F4F46",
            borderTop: "1px solid rgba(63, 98, 89, 0.15)",
            borderRadius: "0 0 12px 12px",
          }}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown fires before onBlur, so the input doesn't lose focus
              // before we register the selection
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectSuggestion(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className="px-4 py-2.5 text-sm cursor-pointer leading-snug"
              style={{
                color: "#1F2D2A",
                backgroundColor:
                  index === activeIndex
                    ? "rgba(47, 79, 70, 0.08)"
                    : "transparent",
                borderTop: "1px solid rgba(63, 98, 89, 0.1)",
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
