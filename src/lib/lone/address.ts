export type AddressHit = {
  label: string;
  site: string;
  lat: number;
  lng: number;
  /** Official (ONS) postcode for this spot, or null when none could be confirmed. */
  postcode: string | null;
};

type NominatimRow = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string>;
};

export function ukPostcode(text: string): string | null {
  const match = text.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

export function samePostcode(left: string, right: string): boolean {
  return left.replace(/\s+/g, "").toUpperCase() === right.replace(/\s+/g, "").toUpperCase();
}

/**
 * Street and place from an OpenStreetMap row. OSM's own postcode is deliberately
 * dropped: UK postcodes in OSM are volunteer-entered and often wrong, and a wrong
 * postcode sends help to the wrong street. The official one is added by
 * withPostcode() from postcodes.io (ONS Postcode Directory).
 */
export function formatHit(row: NominatimRow): AddressHit | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = row.address ?? {};
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const place =
    address.suburb || address.village || address.town || address.city || address.municipality || "";
  const label = [street, place].filter(Boolean).join(", ");
  return {
    label: label || String(row.display_name ?? "").split(",").slice(0, 2).join(",").trim(),
    site: address.amenity || address.shop || address.building || address.office || "",
    lat,
    lng,
    postcode: null,
  };
}

/** Attach the official postcode to a hit's label. */
export function withPostcode(hit: AddressHit, postcode: string | null): AddressHit {
  return {
    ...hit,
    postcode,
    label: postcode ? `${hit.label}, ${postcode}` : hit.label,
  };
}
