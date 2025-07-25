function getBoundingBox(lat, lon, radiusInKm = 2) {
  const latR = 1 / 110.574;
  const lonR = 1 / (111.32 * Math.cos(lat * (Math.PI / 180)));

  const latDelta = radiusInKm * latR;
  const lonDelta = radiusInKm * lonR;

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

export default getBoundingBox;