import { useState, useRef, useEffect, useCallback } from "react";

interface Coords {
  lat: number;
  lon: number;
}

// Subset of the Nominatim address-details response we render and rank on.
// All fields are best-effort — OSM data quality varies, so every component
// is optional and we fall back to display_name when nothing usable is found.
interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  postcode?: string;
  country?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: NominatimAddress;
}

interface Props {
  value: string;
  onChange: (address: string, coords?: Coords) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

// Viewbox biased toward the London–Luton corridor. Nominatim treats this as
// a *ranking* hint (not a hard bound, because `bounded` is not set), so
// matches outside the box still appear when relevant — they just rank lower.
const VIEWBOX = "-0.7,52.0,0.3,51.3"; // lon1,lat1,lon2,lat2

// Cheap signal that the user typed a number — likely they want a specific
// address rather than a landmark, so house-level results get a stronger boost.
function hasDigit(s: string): boolean {
  return /\d/.test(s);
}

// Rank a Nominatim result for the current query. Higher = better.
//   • house number present + query has digits → strongest
//   • house number present                    → strong
//   • street/road match                       → medium
//   • settlement / area                       → low
//   • POI / landmark                          → lowest
function scoreResult(r: NominatimResult, query: string): number {
  const a = r.address ?? {};
  const queryHasDigit = hasDigit(query);
  if (a.house_number && queryHasDigit) return 100;
  if (a.house_number) return 80;
  if (a.road || a.pedestrian) return 60;
  if (a.suburb || a.neighbourhood) return 40;
  if (a.city || a.town || a.village) return 30;
  return 10;
}

// Build a compact, readable label. Falls back to display_name when we
// don't have enough parts to reconstruct one cleanly.
function formatAddress(r: NominatimResult): string {
  const a = r.address;
  if (!a) return r.display_name;
  const line1 = [a.house_number, a.road ?? a.pedestrian]
    .filter(Boolean)
    .join(" ")
    .trim();
  const locality = a.city || a.town || a.village || a.suburb || a.neighbourhood;
  const parts = [line1, locality, a.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : r.display_name;
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  required,
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?format=json` +
          `&q=${encodeURIComponent(query)}` +
          `&countrycodes=gb` +
          `&limit=10` +
          `&addressdetails=1` +
          `&dedupe=1` +
          `&viewbox=${VIEWBOX}`;
        const res = await fetch(url);
        const data: NominatimResult[] = await res.json();
        // Stable sort: rank by scoreResult desc, preserving Nominatim's
        // importance order within the same bucket.
        const ranked = data
          .map((r, i) => ({ r, i, s: scoreResult(r, query) }))
          .sort((a, b) => b.s - a.s || a.i - b.i)
          .map((x) => x.r);
        setSuggestions(ranked);
        setOpen(ranked.length > 0);
        setHighlighted(-1);
      } catch {
        setSuggestions([]);
      }
    }, 350);
  }, []);

  function handleSelect(result: NominatimResult) {
    // Use the prettified address when we have one. Falls back to the raw
    // display_name so the user never ends up with an empty input.
    const label = formatAddress(result) || result.display_name;
    onChange(label, {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    });
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-[1002] mt-2 max-h-60 overflow-y-auto rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          {suggestions.map((s, i) => {
            const a = s.address;
            const primary = formatAddress(s);
            // Secondary line shows the bits the primary line omitted so the
            // user has enough context to disambiguate two same-named streets.
            const isHouse = !!a?.house_number;
            return (
              <li
                key={`${s.lat}-${s.lon}-${i}`}
                onMouseDown={() => handleSelect(s)}
                onMouseEnter={() => setHighlighted(i)}
                className={`cursor-pointer px-3 py-2.5 text-sm transition-colors ${
                  i === highlighted
                    ? "bg-[var(--color-dark)] text-[var(--color-surface)]"
                    : "text-[var(--color-dark)] hover:bg-[var(--color-surface-alt)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isHouse && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        i === highlighted
                          ? "bg-[var(--color-surface)] text-[var(--color-dark)]"
                          : "bg-[var(--color-green,#98fe00)] text-[var(--color-dark)]"
                      }`}
                      aria-label="House-level match"
                    >
                      #
                    </span>
                  )}
                  <span className="truncate font-medium">{primary}</span>
                </div>
                <div
                  className={`mt-0.5 truncate text-[11px] ${
                    i === highlighted
                      ? "text-[var(--color-surface)] opacity-80"
                      : "text-[var(--color-muted)]"
                  }`}
                >
                  {s.display_name}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
