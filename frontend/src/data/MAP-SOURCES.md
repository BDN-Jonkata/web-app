# Map sources

The displayed raster (`public/assets/bulgaria-geographic.png`) is generated from
the real geographic boundary, using `scripts/render-map.mjs`. It shares its
Web Mercator projection with the UI through `src/mapProjection.js`.

- Boundary: Natural Earth 1:10m polygons, supplied by
  https://github.com/BenPortner/geojson-atlas/blob/644874ada665a0f2c0c81a0d47adacea97365c30/geojson/natural_earth/countries/10m/BG.geojson
  The 28 province polygons were dissolved by cancelling their shared edges,
  leaving one closed national boundary with 878 segments. Public domain / CC0.
- City coordinates: the OpenStreetMap-derived town positions in
  https://github.com/vlados/bulgaria-geocoding/blob/master/settlements_loc.csv
  These refer to the settlements, not their administrative province centres.

The previous AI illustration remains in `public/assets/bulgaria-map.png` but is
not used: it has no georeferencing and cannot support accurate marker positions.

To regenerate the raster (ImageMagick required):

```sh
npm run map:render
```
