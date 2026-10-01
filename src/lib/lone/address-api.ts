import { createServerFn } from "@tanstack/react-start";
import { type AddressHit, formatHit, withPostcode, ukPostcode } from "./address";
import { nearestPostcodes } from "./postcodes.server";

export type AddressLookup = {
  hits: AddressHit[];
  /** The typed postcode, confirmed against the official ONS directory. */
  postcode: { code: string; lat: number; lng: number } | null;
  /** A postcode was typed but does not exist. */
  invalidPostcode: string | null;
};

const LOOKUP_TIMEOUT_MS = 4_000;

async function officialPostcode(code: string): Promise<AddressLookup["postcode"]> {
  const response = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(code.replace(/\s+/g, ""))}`,
    { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { result?: { postcode?: string; latitude?: number; longitude?: number } };
  const lat = body.result?.latitude;
  const lng = body.result?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { code: body.result?.postcode || code, lat, lng };
}

async function osmSearch(q: string): Promise<AddressHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "gb");
  url.searchParams.set("limit", "5");
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        "user-agent": "0-19-lone-worker/1.0 (staff safety address lookup)",
      },
    });
    const rows = response.ok ? ((await response.json()) as unknown) : [];
    return (Array.isArray(rows) ? rows : [])
      .map((row) => formatHit(row as Parameters<typeof formatHit>[0]))
      .filter((hit): hit is AddressHit => hit != null && hit.label.length > 0);
  } catch {
    return [];
  }
}

export const lookupAddress = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const query = String((input as { q?: string } | null)?.q ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return { q: query.length >= 3 ? query : "" };
  })
  .handler(async ({ data }): Promise<AddressLookup> => {
    if (!data.q) return { hits: [], postcode: null, invalidPostcode: null };
    const typed = ukPostcode(data.q);

    if (typed) {
      // The typed postcode is the source of truth. Confirm it exists and pin to
      // its official location; street suggestions are not needed.
      const postcode = await officialPostcode(typed).catch(() => null);
      return { hits: [], postcode, invalidPostcode: postcode ? null : typed };
    }

    // No postcode typed: suggest streets, each with its official postcode.
    const raw = (await osmSearch(data.q)).slice(0, 5);
    const codes = await nearestPostcodes(raw);
    return { hits: raw.map((hit, i) => withPostcode(hit, codes[i])), postcode: null, invalidPostcode: null };
  });
