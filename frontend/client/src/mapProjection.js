// Shared by the raster exporter, markers, flow paths, and cursor coordinates.
// WGS84 -> Web Mercator, matching the projection used by online street maps.
const radians = Math.PI / 180;
const mercatorY = lat => Math.log(Math.tan(Math.PI / 4 + lat * radians / 2));
const bounds = { west: 22.15, east: 28.85, south: 41.13, north: 44.40 };
const northY = mercatorY(bounds.north);
const southY = mercatorY(bounds.south);
const width = 1180;

export const GEO = {
  ...bounds,
  width,
  height: width * (northY - southY) / ((bounds.east - bounds.west) * radians)
};

export function pos(lon, lat) {
  return {
    x: (lon - bounds.west) / (bounds.east - bounds.west) * GEO.width,
    y: (northY - mercatorY(lat)) / (northY - southY) * GEO.height
  };
}

export function unproject(x, y) {
  const projectedY = northY - y / GEO.height * (northY - southY);
  return {
    lon: bounds.west + x / GEO.width * (bounds.east - bounds.west),
    lat: (2 * Math.atan(Math.exp(projectedY)) - Math.PI / 2) / radians
  };
}
