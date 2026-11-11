export interface ZipLocation {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, ZipLocation | null>();

/**
 * Looks up a US ZIP code using the free Zippopotam.us API (no key required).
 * Returns null when the ZIP is unknown.
 */
export async function lookupZip(zip: string): Promise<ZipLocation | null> {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;
  if (cache.has(clean)) return cache.get(clean)!;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`);
    if (!res.ok) {
      cache.set(clean, null);
      return null;
    }
    const data = (await res.json()) as {
      places?: { 'place name': string; 'state abbreviation': string; latitude: string; longitude: string }[];
    };
    const place = data.places?.[0];
    if (!place) {
      cache.set(clean, null);
      return null;
    }
    const result: ZipLocation = {
      zip: clean,
      city: place['place name'],
      state: place['state abbreviation'],
      lat: Number(place.latitude),
      lng: Number(place.longitude),
    };
    cache.set(clean, result);
    return result;
  } catch {
    return null;
  }
}
