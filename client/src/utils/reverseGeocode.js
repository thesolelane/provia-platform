const cache = new Map();

export async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'PreferredBuilders/1.0' },
    });
    if (!res.ok) throw new Error('Geocode request failed');
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.path || '';
    const number = addr.house_number ? `${addr.house_number} ` : '';
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || '';
    let label = '';
    if (road) {
      label = `${number}${road}${city ? ', ' + city : ''}`;
    } else if (city) {
      label = city;
    } else {
      label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
    label = label.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    cache.set(key, label);
    return label;
  } catch {
    const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    cache.set(key, fallback);
    return fallback;
  }
}

export function getGpsPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}
