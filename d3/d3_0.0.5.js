import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import h5wasm from "https://cdn.jsdelivr.net/npm/h5wasm@0.6.9/dist/esm/hdf5_hl.js";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
const coastlines = feature(world, world.objects.countries);

const { FS } = await h5wasm.ready;
const url = "https://www.ncei.noaa.gov/data/oceans/crw/5km/v3.1/nc/v1.0/daily/ssta/2024/ct5km_ssta_v3.1_20240301.nc";
const response = await fetch(url);
const arrayBuffer = await response.arrayBuffer();
FS.writeFile("ssta.nc", new Uint8Array(arrayBuffer));

const file = new h5wasm.File("ssta.nc", "r");
const ssta = file.get("sea_surface_temperature_anomaly");

const latPath = ssta.get_attached_scales(1)[0];
const lonPath = ssta.get_attached_scales(2)[0];
const lat = file.get(latPath).value;
const lon = file.get(lonPath).value;
const data = ssta.value;

// Downsample
const sampledLat = [], sampledLon = [];
for (let j = 0; j < lat.length; j += 5) sampledLat.push(lat[j]);
for (let i = 0; i < lon.length; i += 5) sampledLon.push(lon[i]);

const height = sampledLat.length;
const width = sampledLon.length;
const values = new Float32Array(width * height);
let minVal = Infinity, maxVal = -Infinity;
for (let j = 0; j < height; j++) {
  for (let i = 0; i < width; i++) {
    const fullIdx = (j * 5) * lon.length + (i * 5);
    const val = data[fullIdx];
    const c = (val === -32768 || isNaN(val)) ? NaN : val / 100;
    values[j * width + i] = c;
    if (!isNaN(c)) {
      if (c > maxVal) maxVal = c;
      if (c < minVal) minVal = c;
    }
  }
}

const thresholds = d3.range(Math.floor(minVal * 2) / 2, Math.ceil(maxVal * 2) / 2 + 0.1, 0.5);
const contours = d3.contours().size([width, height]).thresholds(thresholds)(values);

const lonStep = sampledLon[1] - sampledLon[0];
const latStep = sampledLat[1] - sampledLat[0];
const xToLon = x => sampledLon[0] + x * lonStep;
const yToLat = y => sampledLat[height - 1] - y * latStep;

const geoContours = contours.map(c => ({
  type: "Feature",
  geometry: {
    type: c.type,
    coordinates: c.coordinates.map(ring =>
      ring.map(contour =>
        contour.map(([x, y]) => [xToLon(x), yToLat(y)])
      )
    )
  },
  value: c.value
}));

// Create canvas
const canvas = document.createElement("canvas");
canvas.width = 3840;
canvas.height = 2400;
canvas.style.width = "1440";
canvas.style.height = "900px";
document.body.appendChild(canvas);

// Legend
const legend = document.createElement("canvas");
legend.width = 260;
legend.height = 20;
legend.style.position = "absolute";
legend.style.bottom = "10px";
legend.style.left = "10px";
legend.style.zIndex = 10;
document.body.appendChild(legend);

// Slider
const slider = document.createElement("input");
slider.type = "range";
slider.min = 300;
slider.max = 2400;
slider.value = 840;
slider.style.position = "absolute";
slider.style.top = "10px";
slider.style.left = "10px";
slider.style.zIndex = 10;
document.body.appendChild(slider);

const context = canvas.getContext("2d");
context.imageSmoothingEnabled = true;
const projection = d3.geoOrthographic().scale(840).translate([canvas.width / 2, canvas.height / 2]).clipAngle(90);
const path = d3.geoPath(projection, context);

function renderLegend() {
  const ctx = legend.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, legend.width, 0);
  for (let i = 0; i <= 1; i += 0.01) {
    grad.addColorStop(i, d3.interpolateRdBu(1 - i));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, legend.width, legend.height);
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const val = minVal + i * (maxVal - minVal) / steps;
    const x = i * legend.width / steps;
    ctx.fillText(val.toFixed(1), x, legend.height + 2);
  }
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Draw globe background
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, projection.scale(), 0, 2 * Math.PI);
  context.fillStyle = "black";
  context.fill();
  context.strokeStyle = "#444";
  context.lineWidth = 0.5;
  context.stroke();

  // Draw SSTA contours
  for (const feature of geoContours) {
    context.beginPath();
    path(feature);
    const t = (feature.value - minVal) / (maxVal - minVal);
    context.fillStyle = d3.interpolateRdBu(1 - t);
    context.globalAlpha = 1.0;
    context.fill();
    context.strokeStyle = "#000";
    context.lineWidth = 0.2;
    context.stroke();
  }

  // Draw filled landmasses (on top of contours)
  context.beginPath();
  path(coastlines);
  context.fillStyle = "black";
  context.fill();

  // Stroke coastlines
  context.beginPath();
  path(coastlines);
  context.strokeStyle = "white";
  context.lineWidth = 0.5;
  context.stroke();

  renderLegend();
}
render();

// Drag to rotate
canvas.addEventListener("mousedown", startDrag);
let lastX, lastY;
function startDrag(e) {
  lastX = e.clientX;
  lastY = e.clientY;
  window.addEventListener("mousemove", drag);
  window.addEventListener("mouseup", endDrag);
}
function drag(e) {
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  const rotate = projection.rotate();
  const k = 0.25;
  projection.rotate([
    rotate[0] + dx * k,
    rotate[1] - dy * k
  ]);
  lastX = e.clientX;
  lastY = e.clientY;
  render();
}
function endDrag() {
  window.removeEventListener("mousemove", drag);
  window.removeEventListener("mouseup", endDrag);
}

// Slider zoom
slider.addEventListener("input", (e) => {
  projection.scale(+e.target.value);
  render();
});

// Scroll wheel zoom
canvas.addEventListener("wheel", event => {
  event.preventDefault();
  const mouse = [event.offsetX, event.offsetY];
  const scale = projection.scale();
  const delta = event.deltaY > 0 ? -60 : 60;
  const newScale = Math.max(300, Math.min(2400, scale + delta));
  const rotate = projection.rotate();
  const pos = projection.invert(mouse);
  if (pos) projection.scale(newScale).rotate(rotate);
  else projection.scale(newScale);
  slider.value = newScale;
  render();
}, { passive: false });