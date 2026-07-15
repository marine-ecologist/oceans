import h5wasm from "https://cdn.jsdelivr.net/npm/h5wasm@0.6.9/dist/esm/hdf5_hl.js";

const { FS } = await h5wasm.ready;

// Load NetCDF file
const url = "https://www.ncei.noaa.gov/data/oceans/crw/5km/v3.1/nc/v1.0/daily/dhw/2025/ct5km_dhw_v3.1_20250330.nc";
const response = await fetch(url);
const buffer = await response.arrayBuffer();
FS.writeFile("dhw.nc", new Uint8Array(buffer));

// Open file and get axes
const file = new h5wasm.File("dhw.nc", "r");
const dhw = file.get("degree_heating_week");
const latAxis = file.get(dhw.get_attached_scales(1)[0]);
const lonAxis = file.get(dhw.get_attached_scales(2)[0]);

// Region bounds
const lat0 = -20, lat1 = -10;
const lon0 = 145, lon1 = 155;

// Find subset indices
const latPreview = latAxis.slice([1000], [600]).value;
const lonPreview = lonAxis.slice([3000], [600]).value;
const j0 = latPreview.findIndex(v => v <= lat1);
const j1 = latPreview.findIndex(v => v <= lat0);
const i0 = lonPreview.findIndex(v => v >= lon0);
const i1 = lonPreview.findIndex(v => v >= lon1);
const nLat = j1 - j0 + 1;
const nLon = i1 - i0 + 1;

// Read DHW subset
const dhwSub = dhw.slice([1000 + j0, 3000 + i0], [nLat, nLon]).value;

// Setup canvas
const canvas = document.getElementById("dhwCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const img = ctx.createImageData(canvas.width, canvas.height);
const pixels = img.data;

// Pre-compute HSL to RGB conversion (OPTIMIZATION #1: Color LUT)
const colorCache = new Map();
function hslToRgb(h) {
  const key = Math.round(h * 1000);
  if (colorCache.has(key)) return colorCache.get(key);
  
  const c = 1.0; // s=1, l=0.5
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = 0;
  let r, g, b;
  
  if (h < 1/6) [r, g, b] = [c, x, 0];
  else if (h < 2/6) [r, g, b] = [x, c, 0];
  else if (h < 3/6) [r, g, b] = [0, c, x];
  else if (h < 4/6) [r, g, b] = [0, x, c];
  else if (h < 5/6) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  
  const result = [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  colorCache.set(key, result);
  return result;
}

// OPTIMIZATION #2: Pre-compute coordinate transforms
const latScale = (lat1 - lat0) / (canvas.height - 1);
const lonScale = (lon1 - lon0) / (canvas.width - 1);
const xScale = (nLon - 1) / (lon1 - lon0);
const yScale = (nLat - 1) / (lat1 - lat0);

// OPTIMIZATION #3: Inline interpolation in main loop
for (let j = 0; j < canvas.height; j++) {
  const latVal = lat0 + j * latScale;
  const y = (lat1 - latVal) * yScale;
  const jFloor = Math.floor(y);
  const v = y - jFloor;
  const v1 = 1 - v;
  
  for (let i = 0; i < canvas.width; i++) {
    const lonVal = lon0 + i * lonScale;
    const x = (lonVal - lon0) * xScale;
    const iFloor = Math.floor(x);
    const u = x - iFloor;
    const u1 = 1 - u;
    
    let val = NaN;
    if (iFloor >= 0 && jFloor >= 0 && iFloor + 1 < nLon && jFloor + 1 < nLat) {
      const idx11 = jFloor * nLon + iFloor;
      const idx21 = idx11 + 1;
      const idx12 = idx11 + nLon;
      const idx22 = idx12 + 1;
      
      const Q11 = dhwSub[idx11];
      const Q21 = dhwSub[idx21];
      const Q12 = dhwSub[idx12];
      const Q22 = dhwSub[idx22];
      
      if (Q11 !== -32768 && Q21 !== -32768 && Q12 !== -32768 && Q22 !== -32768) {
        val = Q11 * u1 * v1 + Q21 * u * v1 + Q12 * u1 * v + Q22 * u * v;
      }
    }
    
    const idx = (j * canvas.width + i) * 4;
    if (isFinite(val)) {
      const ratio = Math.min(Math.max(val / 12, 0), 1);
      const h = (1 - ratio) * 0.66;
      const [r, g, b] = hslToRgb(h);
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    } else {
      pixels[idx] = pixels[idx + 1] = pixels[idx + 2] = 0;
    }
    pixels[idx + 3] = 255;
  }
}

ctx.putImageData(img, 0, 0);