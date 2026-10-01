import { createServerFn } from "@tanstack/react-start";
import { type AddressHit, formatHit, samePostcode, ukPostcode } from "./address";

export type AddressLookup = {
  hits: AddressHit[];
  postcode: { code: string; lat: number; lng: number } | null;
};

async function officialPostcode(code: string): Promise<AddressLookup["postcode"]> {
  const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(code.replace(/\s+/g, ""))}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { result?: { postcode?: string; latitude?: number; longitude?: number } };
  const lat = body.result?.latitude;
  const lng = body.result?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { code: body.result?.postcode || code, lat, lng };
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
    if (!data.q) return { hits: [], postcode: null };
    const typed = ukPostcode(data.q);
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", data.q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "gb");
    url.searchParams.set("limit", "5");
    const [response, postcode] = await Promise.all([
      fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "0-19-lone-worker/1.0 (staff safety address lookup)",
        },
      }),
      typed ? officialPostcode(typed) : Promise.resolve(null),
    ]);
    const rows = response.ok ? ((await response.json()) as unknown) : [];
    const hits = (Array.isArray(rows) ? rows : [])
      .map((row) => formatHit(row as Parameters<typeof formatHit>[0]))
      .filter((hit): hit is AddressHit => hit != null && hit.label.length > 0)
      .filter((hit) => !typed || samePostcode(ukPostcode(hit.label) ?? "", typed))
      .slice(0, 5);
    return { hits, postcode };
  });