#!/bin/sh
# Downloads the map's source data into tools/data/ (git-ignored). Then: npm run real-map && npm run relief
# OpenStreetMap through Overpass (one query at a time: the public server refuses parallel ones), Natural Earth from GitHub.
set -e
cd "$(dirname "$0")" && mkdir -p data && cd data
OP=https://overpass-api.de/api/interpreter
q() { curl -sf -A "map-build/1.0" --data-urlencode "data=$2" "$OP" -o "$1" && echo "$1"; sleep 5; }
q bg-rel.json '[out:json][timeout:180];rel(186382);out geom;'
q coast.json  '[out:json][timeout:180];way["natural"="coastline"](41.2,27.2,44.6,29.4);out geom;'
q obl.json    '[out:json][timeout:300];area(3600186382)->.a;rel(area.a)["boundary"="administrative"]["admin_level"="4"];out geom;'
q rivers.json '[out:json][timeout:300];way["waterway"="river"]["name"](40.9,21.6,44.6,29.2);out tags geom;'
q lakes.json  '[out:json][timeout:300];area(3600186382)->.a;(way["natural"="water"]["name"](area.a);rel["natural"="water"]["name"](area.a););out tags geom;'
NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_10m_land ne_10m_admin_0_boundary_lines_land ne_10m_rivers_lake_centerlines ne_10m_rivers_europe ne_10m_lakes ne_10m_lakes_europe; do
  curl -sfL -o "$f.geojson" "$NE/$f.geojson" && echo "$f.geojson"
done
