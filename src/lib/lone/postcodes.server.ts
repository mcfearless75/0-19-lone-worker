/**
 * Official nearest postcode for each point (postcodes.io bulk reverse lookup,
 * within 150 m). null where nothing is close enough to be trusted.
 */
export async function nearestPostcodes(
  points: Array<{ lat: number; lng: number }>,
  timeoutMs = 4_000,
): Promise<Array<string | null>> {
  if (points.length === 0) return [];
  try {
    const response = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        geolocations: points.map((p) => ({ latitude: p.lat, longitude: p.lng, radius: 150, limit: 1 })),
      }),
    });
    if (!response.ok) return points.map(() => null);
    const body = (await response.json()) as { result?: Array<{ result?: Array<{ postcode?: string }> | null }> };
    return points.map((_, i) => body.result?.[i]?.result?.[0]?.postcode ?? null);
  } catch {
    return points.map(() => null);
  }
}
