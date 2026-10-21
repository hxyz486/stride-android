# Map data provenance

## Online street map: Amap / 高德地图

The default online basemap uses this public raster service for the current local development build:

`https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`

The map displays “© 高德地图” linked to https://www.amap.com/ . The app uses the single HTTPS tile host above, with ordinary app identification; it does not use a borrowed API key or impersonate another application. This is not an integration of the official Amap SDK. Public reachability is not a grant of unrestricted rights, a formal API guarantee, or a commitment that this endpoint will remain available. Official integration documentation is at https://lbs.amap.com/ .

On 2026-10-21, actual zoom-16 street tiles for Beijing (`53958/24830`) and Changsha (`53328/27408`) returned HTTP 200 PNG images on the development network. The returned maps showed Chinese street labels. This verifies the sampled requests; device-network availability and map detail can vary. See the project TESTING.md for the complete validation scope.

Requests are limited to the current visible viewport, with a maximum zoom of 19. There is no prefetch, bulk downloader, national tile archive, or offline export of this service. Android uses normal WebView HTTPS requests and its default HTTP cache, honoring service cache headers. The WebView User-Agent appends `Stride/1.3.4 (cn.stride.offline)`. Browser previews retain their ordinary browser identification. Cache retention is not guaranteed and is not an offline-map feature.

The online basemap uses GCJ-02 display coordinates. The app converts WGS84 route and city coordinates for display and converts drawn points back to WGS84. Stored routes, playback, coordinate input, and exported data remain WGS84 when switching sources. Tile requests disclose the viewed area to the map service; full routes and session records are not uploaded by this app.

## Bundled administrative overview

china.geojson: DataV GeoAtlas national/province boundary data, retrieved 2026-10-20 from:
https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
Source website: https://datav.aliyun.com/portal/school/atlas/area_selector

The file is stored as supplied. This is an administrative overview for this development build, not a detailed street map. No license ownership is claimed.

The built-in demo supplies route coordinates only; the selected source supplies its basemap.

## Imported offline maps

Imported raster MBTiles are supplied by the user; their metadata attribution is displayed on the map. Users must have the right to use their map packages. Standard WGS84 / EPSG:3857 maps are expected. Only regions and zoom levels present in each package are available offline. Switching sources preserves stored WGS84 route coordinates.
