export type AddressHit = {
  label: string;
  site: string;
  lat: number;
  lng: number;
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
  return left.replace(/\s+/g, "") === right.replace(/\s+/g, "");
}

export function formatHit(row: NominatimRow): AddressHit | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = row.address ?? {};
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const place =
    address.suburb || address.village || address.town || address.city || address.municipality || "";
  const label = [street, place, address.postcode].filter(Boolean).join(", ");
  return {
    label: label || String(row.display_name ?? "").split(",").slice(0, 3).join(",").trim(),
    site: address.amenity || address.shop || address.building || address.office || "",
    lat,
    lng,
  };
}
