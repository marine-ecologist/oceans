// ═══════════════════════════════════════════════════════════════════════════════
// oceans.js  —  v0.3.0
// Cesium ocean monitoring: SST/DHW/WMS layers + canvas particle wind & currents.
// No npm. No bundler. Load via CDN Cesium in index.html.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Cesium setup ─────────────────────────────────────────────────────────────
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZTNmOGJmZC0zOTcwLTRhMzYtOTEyMC1jYjc5Yzc5YTcwODMiLCJpZCI6MjY4NTE0LCJpYXQiOjE3MzY3MTg2NzB9.X6fIDdZkrPlD5AGjASkJ-IerCu1BLe8IIQLrwJku4LQ";

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker:      false,
  timeline:             false,
  animation:            false,
  homeButton:           false,
  navigationHelpButton: false,
  enablePickFeatures:   false,
  infoBox:              false,
  geocoder:             true,
  // Use OpenStreetMap as base — no token needed
  imageryProvider: new Cesium.UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors',
    maximumLevel: 19,
  }),
});

const scene = viewer.scene;
// Keep atmosphere on so globe looks like Earth from space
scene.sun.show  = true;
scene.moon.show = false;
viewer._cesiumWidget._creditContainer.style.display = "none";

// ── Global styles ────────────────────────────────────────────────────────────
const styleTag = document.createElement("style");
styleTag.textContent = `
  #cesiumContainer canvas { image-rendering: smooth; }
  .tooltip {
    position: absolute;
    background: rgba(42,42,42,0.85);
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    font-family: Arial, sans-serif;
    pointer-events: none;
    display: none;
  }
  .active { background-color: #007bff !important; color: white !important; }
  button { transition: background-color 0.15s; }
`;
document.head.appendChild(styleTag);

// ── Tooltips ─────────────────────────────────────────────────────────────────
const hoverTooltip = document.createElement("div");
hoverTooltip.classList.add("tooltip");
document.body.appendChild(hoverTooltip);

const clickTooltip = document.createElement("div");
clickTooltip.classList.add("tooltip");
document.body.appendChild(clickTooltip);

// ── Layer management ──────────────────────────────────────────────────────────
let activeLayer = null;
let noaaLayer   = null;

// ── Transparency slider (created early, appended to toolbar later) ────────────
const slider = document.createElement("input");
slider.type  = "range";
slider.min   = "0";
slider.max   = "1";
slider.step  = "0.01";
slider.value = "0.7";
slider.style.cssText = "width:140px;margin:5px auto;display:block;";
slider.id    = "slider";

// ── OpenDAP / WMS data ────────────────────────────────────────────────────────
const OPENDAP_BASE_URL = "https://pae-paha.pacioos.hawaii.edu/thredds/dodsC/dhw_5km";
const TILE_SIZE = 256;

async function fetchOpenDAPData(variable, date, bounds) {
  const timeResponse = await fetch(`${OPENDAP_BASE_URL}.ascii?time`);
  const timeText     = await timeResponse.text();
  const times        = timeText.split("\n").slice(1).map(t => parseInt(t.trim())).filter(t => !isNaN(t));
  const targetTime   = Math.floor(new Date(date).getTime() / 1000);
  const timeIndex    = times.findIndex(t => t >= targetTime);
  if (timeIndex === -1) throw new Error("Date not found in dataset");

  const dataUrl  = `${OPENDAP_BASE_URL}.ascii?${variable}[${timeIndex}][${bounds.latIndex}:${bounds.latIndex + TILE_SIZE}][${bounds.lonIndex}:${bounds.lonIndex + TILE_SIZE}]`;
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`OpenDAP: ${response.statusText}`);

  const lines = (await response.text()).split("\n").slice(1);
  const data  = new Float32Array(TILE_SIZE * TILE_SIZE);
  let idx = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith("[")) {
      const v = parseFloat(t);
      data[idx++] = isNaN(v) ? 0 : v;
    }
  }
  return data;
}

class OpenDAPImageryProvider {
  constructor(options) {
    this._variable      = options.variable;
    this._date          = options.date;
    this._ready         = true;
    this._errorEvent    = new Cesium.Event();
    this._tileWidth     = TILE_SIZE;
    this._tileHeight    = TILE_SIZE;
    this._tilingScheme  = new Cesium.GeographicTilingScheme();
    this._rectangle     = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90);
    this._credit        = new Cesium.Credit("PacIOOS THREDDS");
  }
  get ready()        { return this._ready; }
  get rectangle()    { return this._rectangle; }
  get tileWidth()    { return this._tileWidth; }
  get tileHeight()   { return this._tileHeight; }
  get tilingScheme() { return this._tilingScheme; }
  get errorEvent()   { return this._errorEvent; }
  get credit()       { return this._credit; }

  async requestImage(x, y, level) {
    try {
      const rect   = this._tilingScheme.tileXYToRectangle(x, y, level);
      const bounds = {
        latIndex: Math.max(0, Math.min(Math.floor(((90 - Cesium.Math.toDegrees(rect.north)) * 3600) / 180), 3600 - TILE_SIZE)),
        lonIndex: Math.max(0, Math.min(Math.floor(((Cesium.Math.toDegrees(rect.west) + 180) * 7200) / 360), 7200 - TILE_SIZE)),
      };
      const data   = await fetchOpenDAPData(this._variable, this._date, bounds);
      const canvas = document.createElement("canvas");
      canvas.width  = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < data.length; i++) {
        const c = this._getColor(data[i]);
        img.data[i*4]   = c.r;
        img.data[i*4+1] = c.g;
        img.data[i*4+2] = c.b;
        img.data[i*4+3] = c.a;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    } catch(e) {
      console.error("Tile error:", e);
      return document.createElement("canvas");
    }
  }

  _getColor(value) {
    if (this._variable === "CRW_DHW")  return this._dhwColor(value);
    if (this._variable === "CRW_SST")  return this._sstColor(value);
    return { r:0, g:0, b:0, a:0 };
  }
  _dhwColor(v) {
    if (v <= 0) return { r:0,g:0,b:0,a:0 };
    if (v < 4)  return { r:255, g:255 - Math.floor(v*63), b:0, a:255 };
    if (v < 8)  return { r:255, g:0, b:0, a:255 };
    return { r:128, g:0, b:0, a:255 };
  }
  _sstColor(v) {
    const n = Math.max(0, Math.min(1, (v - 0) / 35));
    return { r: Math.floor(255*n), g: Math.floor(128*n), b: Math.floor(255*(1-n)), a:255 };
  }
}

async function createOpenDAPLayer(metric, date) {
  const varMap = { dhw:"CRW_DHW", sst:"CRW_SST", ssta:"CRW_SSTANOMALY", sstt:"CRW_SSTTREND", hs:"CRW_HOTSPOT", baa:"CRW_BAA" };
  return new OpenDAPImageryProvider({ variable: varMap[metric] || "CRW_DHW", date });
}

function formatDateForWMS(dateStr) {
  if (!dateStr) return "";
  if (dateStr.length === 8) dateStr = dateStr.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  if (dateStr.includes("T")) return dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;
  return `${dateStr}T00:00:00Z`;
}

// ── NOAA metric mappings ──────────────────────────────────────────────────────
const noaaMetricNames = {
  CRW_SST: "Sea Surface Temp", CRW_SSTANOMALY: "SST Anomaly",
  CRW_SSTTREND: "SST Trend",   CRW_HOTSPOT: "HotSpot",
  CRW_BAA: "Bleaching Alert",  CRW_DHW: "Degree Heating Weeks",
};
const metrics = [
  { name:"None", value:"none" }, { name:"SST",  value:"sst"  },
  { name:"SSTA", value:"ssta" }, { name:"SSTT", value:"sstt" },
  { name:"HS",   value:"hs"   }, { name:"BAA",  value:"baa"  },
  { name:"DHW",  value:"dhw"  },
];
const noaametrics = [
  { name:"None", value:"none" },
  { name:"SST",  value:"CRW_SST"       }, { name:"SSTA", value:"CRW_SSTANOMALY" },
  { name:"SSTT", value:"CRW_SSTTREND"  }, { name:"HS",   value:"CRW_HOTSPOT"    },
  { name:"BAA",  value:"CRW_BAA"       }, { name:"DHW",  value:"CRW_DHW"        },
];
const metricToNoaa = {};
metrics.forEach((m, i) => { metricToNoaa[m.value] = noaametrics[i].value; });

function switchLayers(metric, noaaMetric, date, noaaTime) {
  if (activeLayer) viewer.imageryLayers.remove(activeLayer, false);
  if (noaaLayer)   viewer.imageryLayers.remove(noaaLayer,   false);

  if (metric !== "none") {
    createOpenDAPLayer(metric, date).then(p => {
      activeLayer = viewer.imageryLayers.addImageryProvider(p);
      if (slider) activeLayer.alpha = parseFloat(slider.value);
    }).catch(e => console.error("OpenDAP layer error:", e));
  }
  if (noaaMetric !== "none") {
    noaaLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.WebMapServiceImageryProvider({
        url: "https://pae-paha.pacioos.hawaii.edu/thredds/wms/dhw_5km",
        layers: noaaMetric,
        parameters: { transparent:true, format:"image/png", time: formatDateForWMS(noaaTime) },
      })
    );
    noaaLayer.alpha = 0.0;
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────
const clickHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
clickHandler.setInputAction(click => {
  const ray      = scene.camera.getPickRay(click.position);
  const cartesian = scene.globe.pick(ray, scene);
  if (!cartesian) return;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  const lon   = Cesium.Math.toDegrees(carto.longitude).toFixed(4);
  const lat   = Cesium.Math.toDegrees(carto.latitude).toFixed(4);
  const metricKey  = document.querySelector(".metric-button.active")?.dataset.metric;
  const metricName = noaaMetricNames[metricToNoaa[metricKey]] || "Value";
  clickTooltip.style.display = "block";
  clickTooltip.style.left    = `${click.position.x + 15}px`;
  clickTooltip.style.top     = `${click.position.y + 15}px`;
  clickTooltip.innerHTML     = activeLayer
    ? `Lon: ${lon}<br>Lat: ${lat}<br>${metricName}: —`
    : `Lon: ${lon}<br>Lat: ${lat}`;
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

const hoverHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
hoverHandler.setInputAction(mv => {
  const c = viewer.camera.pickEllipsoid(mv.endPosition, scene.globe.ellipsoid);
  if (c) {
    const g = Cesium.Cartographic.fromCartesian(c);
    hoverTooltip.style.display = "block";
    hoverTooltip.style.left    = `${mv.endPosition.x + 15}px`;
    hoverTooltip.style.top     = `${mv.endPosition.y + 15}px`;
    hoverTooltip.innerHTML     = `Lon: ${Cesium.Math.toDegrees(g.longitude).toFixed(4)}<br>Lat: ${Cesium.Math.toDegrees(g.latitude).toFixed(4)}`;
  } else {
    hoverTooltip.style.display = "none";
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// ── Toolbar ───────────────────────────────────────────────────────────────────
const toolbar = document.createElement("div");
toolbar.style.cssText = `
  position:absolute; top:10px; left:10px;
  background:rgba(42,42,42,0.85); padding:8px;
  border-radius:6px; color:white; min-width:160px;
  border:1px solid rgba(255,255,255,0.1);
`;
document.body.appendChild(toolbar);

const buttonRow1 = document.createElement("div");
buttonRow1.style.cssText = "display:flex;justify-content:center;margin-bottom:4px;";
const buttonRow2 = document.createElement("div");
buttonRow2.style.cssText = "display:flex;justify-content:center;";

const metricsLabel = document.createElement("div");
metricsLabel.textContent = "Select metric";
metricsLabel.style.cssText = "text-align:center;color:#d7f7ff;font-size:13px;margin:6px 0;";
toolbar.appendChild(metricsLabel);

let datePicker; // declare here, defined below

metrics.forEach((metric, index) => {
  const btn = document.createElement("button");
  btn.textContent = metric.name;
  btn.style.cssText = "margin:2px;padding:2px 5px;font-size:10px;background:#333;color:#BEBEBE;border:none;border-radius:4px;cursor:pointer;";
  btn.classList.add("metric-button");
  btn.dataset.metric = metric.value;
  btn.onclick = () => {
    document.querySelectorAll(".metric-button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const [year, month, day] = datePicker.value.split("-");
    switchLayers(metric.value, metricToNoaa[metric.value], `${year}${month}${day}`, `${datePicker.value}T12:00:00.000Z`);
  };
  (index < metrics.length / 2 ? buttonRow1 : buttonRow2).appendChild(btn);
});
toolbar.appendChild(buttonRow1);
toolbar.appendChild(buttonRow2);

// Date picker
const dateLabel = document.createElement("div");
dateLabel.textContent = "Select Date";
dateLabel.style.cssText = "font-size:13px;text-align:center;color:#d7f7ff;margin:8px 0 4px;";
toolbar.appendChild(dateLabel);

datePicker = document.createElement("input");
datePicker.type    = "date";
datePicker.value   = "2024-01-01";
datePicker.style.cssText = "display:block;margin:0 auto 4px;width:140px;";
datePicker.id      = "datePicker";
datePicker.onchange = () => {
  const active = document.querySelector(".metric-button.active");
  if (!active) return;
  const m = active.dataset.metric;
  const [y, mo, d] = datePicker.value.split("-");
  switchLayers(m, metricToNoaa[m], `${y}${mo}${d}`, `${datePicker.value}T12:00:00.000Z`);
};
toolbar.appendChild(datePicker);

// Transparency slider
const sliderLabel = document.createElement("div");
sliderLabel.textContent = "Transparency";
sliderLabel.style.cssText = "text-align:center;color:#d7f7ff;font-size:13px;margin:8px 0 4px;";
toolbar.appendChild(sliderLabel);
slider.oninput = () => { if (activeLayer) activeLayer.alpha = parseFloat(slider.value); };
toolbar.appendChild(slider);

// ── Initial camera ────────────────────────────────────────────────────────────
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(140, -8, 15000000),
  orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-90), roll: 0 },
});


// ═══════════════════════════════════════════════════════════════════════════════
// WIND & CURRENT PARTICLE SYSTEM
// Canvas 2D overlay — zero external dependencies.
// Tries live GFS + OSCAR data; falls back to analytical mock fields.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Canvas overlay ────────────────────────────────────────────────────────────
const windCanvas  = document.createElement("canvas");
windCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:5;";
document.getElementById("cesiumContainer").appendChild(windCanvas);

const windCtx = windCanvas.getContext("2d");

function resizeCanvas() {
  const c = document.getElementById("cesiumContainer");
  windCanvas.width  = c.offsetWidth;
  windCanvas.height = c.offsetHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ── Grid data state ───────────────────────────────────────────────────────────
// Grid format: { u: Float32Array, v: Float32Array, width, height, bounds: {west,south,east,north} }
let windGrid    = null;
let currentGrid = null;

// ── LOD configuration ─────────────────────────────────────────────────────────
const LOD_THRESHOLDS = { globalToRegional: 4000, regionalToLocal: 500 }; // km

const PARTICLE_COUNTS = {
  global:   { wind: 700,  current: 400  },
  regional: { wind: 1800, current: 1000 },
  local:    { wind: 3000, current: 1800 },
};

const WIND_SPEED_SCALE    = 0.10; // degrees per step
const CURRENT_SPEED_SCALE = 0.50;

let lodState = "global";

// ── Particle pool ─────────────────────────────────────────────────────────────
let windParticles    = [];
let currentParticles = [];

function makeParticle(type) {
  return { type, lon:0, lat:0, age:0, maxAge:0, sx:null, sy:null };
}

function resetParticle(p) {
  const b = getViewBounds();
  p.lon    = b.west  + Math.random() * (b.east  - b.west);
  p.lat    = b.south + Math.random() * (b.north - b.south);
  p.age    = Math.floor(Math.random() * 60);
  p.maxAge = 50 + Math.floor(Math.random() * 100);
  p.sx     = null;
  p.sy     = null;
}

function setParticleCount(arr, type, count) {
  while (arr.length < count) {
    const p = makeParticle(type);
    resetParticle(p);
    arr.push(p);
  }
  if (arr.length > count) arr.length = count;
}

// ── Grid bilinear sampler ─────────────────────────────────────────────────────
function sampleGrid(grid, lon, lat) {
  if (!grid) return null;
  const { u, v, width, height, bounds } = grid;
  if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) return null;
  const x  = (lon - bounds.west)  / (bounds.east  - bounds.west)  * (width  - 1);
  const y  = (lat - bounds.south) / (bounds.north - bounds.south) * (height - 1);
  const x0 = Math.floor(x), x1 = Math.min(x0+1, width-1);
  const y0 = Math.floor(y), y1 = Math.min(y0+1, height-1);
  const fx = x-x0, fy = y-y0;
  const i  = (r,c) => r*width+c;
  const bl = a =>
    a[i(y0,x0)]*(1-fx)*(1-fy) + a[i(y0,x1)]*fx*(1-fy) +
    a[i(y1,x0)]*(1-fx)*fy     + a[i(y1,x1)]*fx*fy;
  return { u: bl(u), v: bl(v) };
}

// ── Viewport helpers ──────────────────────────────────────────────────────────
function getViewBounds() {
  const r = viewer.camera.computeViewRectangle();
  if (!r) return { west:-180, south:-85, east:180, north:85 };
  return {
    west:  Cesium.Math.toDegrees(r.west),
    south: Cesium.Math.toDegrees(r.south),
    east:  Cesium.Math.toDegrees(r.east),
    north: Cesium.Math.toDegrees(r.north),
  };
}
function getCameraKm() { return viewer.camera.positionCartographic.height / 1000; }

// ── Render loop ───────────────────────────────────────────────────────────────
let showWind    = true;
let showCurrent = true;

function stepAndDraw(particles, grid, color, speedScale, alpha) {
  for (const p of particles) {
    const uv = sampleGrid(grid, p.lon, p.lat);
    if (uv) {
      p.lon += uv.u * speedScale;
      p.lat += uv.v * speedScale;
    }
    p.age++;

    // Wrap/clamp
    if (p.lon >  180) p.lon -= 360;
    if (p.lon < -180) p.lon += 360;
    if (p.lat >  85 || p.lat < -85 || p.age > p.maxAge) { resetParticle(p); continue; }

    const pos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat);
    const sc  = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);
    if (!sc) { resetParticle(p); continue; }

    if (p.sx !== null) {
      const speed   = uv ? Math.sqrt(uv.u*uv.u + uv.v*uv.v) : 0;
      const opacity = Math.min(0.9, 0.25 + speed * 0.06) * alpha;
      windCtx.beginPath();
      windCtx.moveTo(p.sx, p.sy);
      windCtx.lineTo(sc.x, sc.y);
      windCtx.strokeStyle = `${color}${opacity})`;
      windCtx.lineWidth   = 1;
      windCtx.stroke();
    }
    p.sx = sc.x;
    p.sy = sc.y;
  }
}

function frame() {
  requestAnimationFrame(frame);
  const W = windCanvas.width, H = windCanvas.height;
  if (!W || !H) return;

  // Fade trail
  windCtx.fillStyle = "rgba(0,0,0,0.04)";
  windCtx.fillRect(0, 0, W, H);

  if (showWind)    stepAndDraw(windParticles,    windGrid,    "rgba(116,185,255,", WIND_SPEED_SCALE,    0.65);
  if (showCurrent) stepAndDraw(currentParticles, currentGrid, "rgba( 85,239,196,", CURRENT_SPEED_SCALE, 0.55);
}

// ── Mock data generators ──────────────────────────────────────────────────────
function mockWind(bounds, W=180, H=90) {
  const u = new Float32Array(W*H), v = new Float32Array(W*H);
  for (let row=0; row<H; row++) {
    const lat = bounds.south + (bounds.north-bounds.south)*(row/(H-1));
    const lr  = lat*Math.PI/180;
    for (let col=0; col<W; col++) {
      const lon = bounds.west + (bounds.east-bounds.west)*(col/(W-1));
      const lo  = lon*Math.PI/180;
      const idx = row*W+col;
      u[idx] = -8*Math.cos(3*lr) + 4*Math.sin(2*lr) + 2*Math.sin(lo*2)*Math.cos(lr) + gauss(0.8);
      v[idx] =  2*Math.sin(lr*2)*Math.cos(lo*3) + 1.5*Math.sin(lo*2) + gauss(0.4);
    }
  }
  return { u, v, width:W, height:H, bounds };
}

function mockCurrents(bounds, W=180, H=90) {
  const u = new Float32Array(W*H), v = new Float32Array(W*H);
  const gyres = [
    {lon:-40, lat:30, r:40, s:1}, {lon:-120,lat:30, r:45, s:1},
    {lon:-30, lat:-35,r:35, s:-1},{lon:-100,lat:-35,r:40, s:-1},
    {lon:75,  lat:-35,r:35, s:-1},
  ];
  for (let row=0; row<H; row++) {
    const lat = bounds.south + (bounds.north-bounds.south)*(row/(H-1));
    for (let col=0; col<W; col++) {
      const lon = bounds.west + (bounds.east-bounds.west)*(col/(W-1));
      const idx = row*W+col;
      let su=0, sv=0;
      for (const g of gyres) {
        const dx   = ((lon-g.lon+540)%360)-180, dy = lat-g.lat;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist > g.r*2) continue;
        const w = 0.8*Math.exp(-(dist*dist)/(g.r*g.r));
        su += g.s*(-dy/(dist+1e-6))*w;
        sv += g.s*(dx/(dist+1e-6))*w;
      }
      su -= 0.4*Math.exp(-(lat*lat)/100); // equatorial current
      u[idx] = su + gauss(0.05);
      v[idx] = sv + gauss(0.05);
    }
  }
  return { u, v, width:W, height:H, bounds };
}

function gauss(s) {
  return s * Math.sqrt(-2*Math.log(Math.random()+1e-12)) * Math.cos(2*Math.PI*Math.random());
}

// ── Live data fetchers ────────────────────────────────────────────────────────
function gfsRun() {
  const d    = new Date(Date.now() - 4*3600000);
  const hh   = String(Math.floor(d.getUTCHours()/6)*6).padStart(2,"0");
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
  return { date, hh };
}

async function fetchGFS(bounds, tier) {
  const { date, hh } = gfsRun();
  const isGlobal = tier === "global";
  const res = isGlobal ? 0.5 : 0.25, nLon = isGlobal ? 720 : 1440, nLat = isGlobal ? 361 : 721;
  const tag = isGlobal ? "0p50" : "0p25";
  const base = `https://nomads.ncep.noaa.gov/dods/gfs_${tag}/gfs${date}/gfs_${tag}_${hh}z`;

  const latMin = Math.max(0,      Math.floor((90-bounds.north)/res));
  const latMax = Math.min(nLat-1, Math.ceil ((90-bounds.south)/res));
  const w360   = ((bounds.west+360)%360), e360 = ((bounds.east+360)%360);
  const lonMin = Math.max(0,      Math.floor(w360/res));
  const lonMax = Math.min(nLon-1, Math.ceil (e360/res));

  const c   = `[0][0][${latMin}:${latMax}][${lonMin}:${lonMax}]`;
  const url = `${base}.ascii?ugrd10m${c},vgrd10m${c}`;
  const r   = await fetch(url, { signal: AbortSignal.timeout(14000) });
  if (!r.ok) throw new Error(`GFS ${r.status}`);
  return parseOPeNDAP(await r.text(), {
    west: lonMin*res-180, east: lonMax*res-180,
    south: 90-latMax*res, north: 90-latMin*res,
  });
}

async function fetchOSCAR(bounds) {
  const d    = new Date(Date.now() - 6*86400000);
  const y    = d.getUTCFullYear();
  const m    = String(d.getUTCMonth()+1).padStart(2,"0");
  const days = [1,6,11,16,21,26];
  const day  = days.reduce((p,c) => Math.abs(c-d.getUTCDate()) < Math.abs(p-d.getUTCDate()) ? c : p);
  const file = `oscar_currents_final_${y}${m}${String(day).padStart(2,"0")}.nc`;
  const base = `https://podaac-opendap.jpl.nasa.gov/opendap/allData/oscar/preview/L4/oscar_third_deg/${file}`;

  const res=1/3, nLon=1080, nLat=481, latOff=80;
  const latMin = Math.max(0,      Math.floor((latOff-bounds.north)/res));
  const latMax = Math.min(nLat-1, Math.ceil ((latOff-bounds.south)/res));
  const lonMin = Math.max(0,      Math.floor((bounds.west+180)/res));
  const lonMax = Math.min(nLon-1, Math.ceil ((bounds.east+180)/res));

  const c   = `[0][${latMin}:${latMax}][${lonMin}:${lonMax}]`;
  const url = `${base}.ascii?u${c},v${c}`;
  const r   = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`OSCAR ${r.status}`);
  return parseOPeNDAP(await r.text(), {
    west: lonMin*res-180, east: lonMax*res-180,
    south: latOff-latMax*res, north: latOff-latMin*res,
  });
}

// ── OPeNDAP ASCII parser ──────────────────────────────────────────────────────
function parseOPeNDAP(text, bounds) {
  const secs = text.split(/\n-{10,}\n/);
  function parseSection(raw) {
    const lines   = raw.trim().split("\n");
    const dimLine = lines.find(l => /\[\d+\]/.test(l)) || "";
    const dims    = [...dimLine.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1]));
    const tokens  = [];
    for (const line of lines) {
      if (/^\s*\[/.test(line)) {
        for (const tok of line.replace(/^\s*(\[\d+\])+,?\s*/,"").split(/[,\s]+/)) {
          const n = parseFloat(tok);
          if (!isNaN(n)) tokens.push(n);
        }
      }
    }
    return { data: new Float32Array(tokens), dims };
  }
  const uS = parseSection(secs[0]), vS = parseSection(secs[1] || secs[0]);
  const [,,height,width] = uS.dims;
  return { u: uS.data.slice(0,height*width), v: vS.data.slice(0,height*width), width, height, bounds };
}

// ── LOD + data refresh ────────────────────────────────────────────────────────
async function refreshData(tier) {
  const bounds = tier === "global"
    ? { west:-180, south:-85, east:180, north:85 }
    : getViewBounds();

  // Wind
  try {
    windGrid = await fetchGFS(bounds, tier);
    console.log(`[wind] GFS ${tier} loaded`);
  } catch(e) {
    console.warn(`[wind] GFS failed (${e.message}), using mock`);
    windGrid = mockWind(bounds);
  }

  // Currents
  try {
    currentGrid = await fetchOSCAR(bounds);
    console.log("[current] OSCAR loaded");
  } catch(e) {
    console.warn(`[current] OSCAR failed (${e.message}), using mock`);
    currentGrid = mockCurrents(bounds);
  }

  windParticles.forEach(p    => resetParticle(p));
  currentParticles.forEach(p => resetParticle(p));
  updateHUD();
}

let lodTimer = null;
viewer.camera.changed.addEventListener(() => {
  if (lodTimer) clearTimeout(lodTimer);
  lodTimer = setTimeout(() => {
    const km    = getCameraKm();
    const tier  = km > LOD_THRESHOLDS.globalToRegional ? "global"
                : km > LOD_THRESHOLDS.regionalToLocal  ? "regional"
                : "local";
    if (tier !== lodState) {
      lodState = tier;
      setParticleCount(windParticles,    "wind",    PARTICLE_COUNTS[tier].wind);
      setParticleCount(currentParticles, "current", PARTICLE_COUNTS[tier].current);
      refreshData(tier);
    }
    updateHUD();
  }, 800);
});

// ── HUD ───────────────────────────────────────────────────────────────────────
const hud = document.createElement("div");
hud.style.cssText = `
  position:absolute; bottom:16px; right:12px; z-index:20;
  background:rgba(0,0,0,0.6); color:#fff;
  font-family:'Courier New',monospace; font-size:11px;
  padding:8px 12px; border-radius:5px;
  border:1px solid rgba(255,255,255,0.12);
  pointer-events:none; line-height:1.9; min-width:185px;
`;
document.getElementById("cesiumContainer").appendChild(hud);

function updateHUD() {
  const tierColor = { global:"#74b9ff", regional:"#55efc4", local:"#fdcb6e" }[lodState];
  const km   = getCameraKm();
  const cnt  = PARTICLE_COUNTS[lodState];
  const wSrc = windGrid    ? (windGrid._live    ? "GFS live"  : "GFS mock")  : "—";
  const cSrc = currentGrid ? (currentGrid._live ? "OSCAR live": "mock")      : "—";
  hud.innerHTML = `
    <span style="color:${tierColor}">● ${lodState.toUpperCase()}</span><br>
    <span style="color:#aaa">Height   </span>${km.toFixed(0)} km<br>
    <span style="color:#74b9ff">Wind     </span>${cnt.wind.toLocaleString()} pts<br>
    <span style="color:#55efc4">Current  </span>${cnt.current.toLocaleString()} pts<br>
    <span style="color:#aaa">W source </span>${wSrc}<br>
    <span style="color:#aaa">C source </span>${cSrc}
  `;
}

// ── Particle controls in toolbar ──────────────────────────────────────────────
const divider = document.createElement("div");
divider.style.cssText = "border-top:1px solid rgba(255,255,255,0.15);margin:10px 0 6px;";
toolbar.appendChild(divider);

const particleLabel = document.createElement("div");
particleLabel.textContent = "Particles";
particleLabel.style.cssText = "text-align:center;color:#d7f7ff;font-size:13px;margin-bottom:6px;";
toolbar.appendChild(particleLabel);

const pRow = document.createElement("div");
pRow.style.cssText = "display:flex;justify-content:center;gap:4px;flex-wrap:wrap;";

function makeToggleBtn(label, colorHex, onToggle) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `padding:2px 7px;font-size:10px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;`;
  b.dataset.on = "1";
  b.onclick = () => {
    const isOn = b.dataset.on === "1";
    b.dataset.on = isOn ? "0" : "1";
    b.style.background = isOn ? "#333" : "#007bff";
    onToggle(!isOn);
    if (isOn) windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);
  };
  return b;
}

pRow.appendChild(makeToggleBtn("🌬 Wind",    "#74b9ff", on => { showWind    = on; }));
pRow.appendChild(makeToggleBtn("🌊 Current", "#55efc4", on => { showCurrent = on; }));
toolbar.appendChild(pRow);

const refreshBtn = document.createElement("button");
refreshBtn.textContent = "↺ Refresh data";
refreshBtn.style.cssText = "display:block;margin:6px auto 0;padding:3px 10px;font-size:10px;background:#333;color:#d7f7ff;border:1px solid rgba(215,247,255,0.25);border-radius:4px;cursor:pointer;width:90%;";
refreshBtn.onclick = async () => {
  refreshBtn.textContent = "⌛ Loading…";
  refreshBtn.disabled    = true;
  await refreshData(lodState);
  refreshBtn.textContent = "↺ Refresh data";
  refreshBtn.disabled    = false;
};
toolbar.appendChild(refreshBtn);

// ── Bootstrap particle system ─────────────────────────────────────────────────
const globalBounds = { west:-180, south:-85, east:180, north:85 };
windGrid    = mockWind(globalBounds);
currentGrid = mockCurrents(globalBounds);

setParticleCount(windParticles,    "wind",    PARTICLE_COUNTS.global.wind);
setParticleCount(currentParticles, "current", PARTICLE_COUNTS.global.current);

updateHUD();
requestAnimationFrame(frame);

// Try live data after 2s (gives Cesium time to finish loading)
setTimeout(() => refreshData("global"), 2000);