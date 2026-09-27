# Third-party data

`us-zip-places.json.gz` is derived from the GeoNames postal code export for
the United States (https://download.geonames.org/export/zip/US.zip).

Data © GeoNames (https://www.geonames.org), licensed under the Creative Commons
Attribution 4.0 License (https://creativecommons.org/licenses/by/4.0/).
Changes: reduced to ZIP, place name, state code, county name, latitude and
longitude; rebuilt with `node scripts/buildZipDataset.js US.txt`.
