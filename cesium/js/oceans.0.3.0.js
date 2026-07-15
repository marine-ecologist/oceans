import h5wasm from "https://cdn.jsdelivr.net/npm/h5wasm@0.6.9/dist/esm/hdf5_hl.js";
import "https://cesium.com/downloads/cesiumjs/releases/1.111/Build/Cesium/Cesium.js";

const { FS } = await h5wasm.ready;

// Load file
const url = "https://www.ncei.noaa.gov/data/oceans/crw/5km/v3.1/nc/v1.0/daily/dhw/2025/ct5km_dhw_v3.1_20250330.nc";
const response = await fetch(url);
const buffer = await response.arrayBuffer();
FS.writeFile("dhw.nc", new Uint8Array(buffer));

// Open file + safe lat/lon read
const file = new h5wasm.File("dhw.nc", "r");
const dhw = file.get("degree_heating_week");
const latAxis = file.get(dhw.get_attached_scales(1)[0]);
const lonAxis = file.get(dhw.get_attached_scales(2)[0]);

// Define 10x10 box (e.g., lat -20 to -10, lon 145 to 155)
const latPreview = latAxis.slice([1000], [600]).value;  // small preview
const lonPreview = lonAxis.slice([3000], [600]).value;

const lat0 = -20, lat1 = -10;
const lon0 = 145, lon1 = 155;

// Find lat/lon bounds within previews
const j0 = latPreview.findIndex(v => v <= lat1);
const j1 = latPreview.findIndex(v => v <= lat0);
const i0 = lonPreview.findIndex(v => v >= lon0);
const i1 = lonPreview.findIndex(v => v >= lon1);

const nLat = j1 - j0 + 1;
const nLon = i1 - i0 + 1;

// Re-slice exact lat/lon
const lat = latAxis.slice([1000 + j0], [nLat]).value;
const lon = lonAxis.slice([3000 + i0], [nLon]).value;

// Read DHW subset
const dhwSub = dhw.slice([1000 + j0, 3000 + i0], [nLat, nLon]).value;

// Draw to canvas
const canvas = document.getElementById("dhwCanvas");
const ctx = canvas.getContext("2d");
const img = ctx.createImageData(canvas.width, canvas.height);
const pixels = img.data;

// Bilinear interpolation
function interpolate(latVal, lonVal) {
  const x = (lonVal - lon0) / (lon1 - lon0) * (nLon - 1);
  const y = (lat1 - latVal) / (lat1 - lat0) * (nLat - 1);
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = x - i;
  const v = y - j;

  if (i < 0 || j < 0 || i + 1 >= nLon || j + 1 >= nLat) return NaN;

  const Q11 = dhwSub[j * nLon + i];
  const Q21 = dhwSub[j * nLon + (i + 1)];
  const Q12 = dhwSub[(j + 1) * nLon + i];
  const Q22 = dhwSub[(j + 1) * nLon + (i + 1)];

  if ([Q11, Q12, Q21, Q22].some(v => v === -32768 || isNaN(v))) return NaN;

  return (
    Q11 * (1 - u) * (1 - v) +
    Q21 * u * (1 - v) +
    Q12 * (1 - u) * v +
    Q22 * u * v
  );
}

// Color scale
function getColor(val) {
  if (!isFinite(val)) return [0, 0, 0];
  const max = 12;
  const ratio = Math.min(Math.max(val / max, 0), 1);
  const h = (1 - ratio) * 0.66;
  return Cesium.Color.fromHsl(h, 1.0, 0.5).toBytes();
}

// Paint pixels
for (let j = 0; j < canvas.height; j++) {
  for (let i = 0; i < canvas.width; i++) {
    const latVal = lat0 + (j / (canvas.height - 1)) * (lat1 - lat0);
    const lonVal = lon0 + (i / (canvas.width - 1)) * (lon1 - lon0);
    const val = interpolate(latVal, lonVal);
    const [r, g, b] = getColor(val);
    const idx = (j * canvas.width + i) * 4;
    pixels[idx + 0] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
  }
}
ctx.putImageData(img, 0, 0);