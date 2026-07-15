// dhw_contours_d3.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import h5wasm from "https://cdn.jsdelivr.net/npm/h5wasm@0.6.9/dist/esm/hdf5_hl.js";

const { FS } = await h5wasm.ready;
const url = "https://www.ncei.noaa.gov/data/oceans/crw/5km/v3.1/nc/v1.0/daily/dhw/2025/ct5km_dhw_v3.1_20250330.nc";
const response = await fetch(url);
const arrayBuffer = await response.arrayBuffer();
FS.writeFile("dhw.nc", new Uint8Array(arrayBuffer));

const file = new h5wasm.File("dhw.nc", "r");
const dhw = file.get("degree_heating_week");

const latPath = dhw.get_attached_scales(1)[0];
const lonPath = dhw.get_attached_scales(2)[0];
const lat = file.get(latPath).value;
const lon = file.get(lonPath).value;
const data = dhw.value;

// Sampling every 20th point
const sampledLat = [], sampledLon = [];
for (let j = 0; j < lat.length; j += 20) sampledLat.push(lat[j]);
for (let i = 0; i < lon.length; i += 20) sampledLon.push(lon[i]);

const height = sampledLat.length;
const width = sampledLon.length;
const values = new Float32Array(width * height);

for (let j = 0; j < height; j++) {
  for (let i = 0; i < width; i++) {
    const fullIdx = (j * 20) * lon.length + (i * 20);
    const val = data[fullIdx];
    values[j * width + i] = (val === -32768 || isNaN(val)) ? NaN : val / 100;
  }
}

const thresholds = d3.range(0.5, 12.5, 1);
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

const canvas = document.createElement("canvas");
canvas.width = 960;
canvas.height = 600;
document.body.appendChild(canvas);

const context = canvas.getContext("2d");
const projection = d3.geoOrthographic().scale(280).translate([canvas.width / 2, canvas.height / 2]).clipAngle(90);
const path = d3.geoPath(projection, context);

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  // draw globe
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, projection.scale(), 0, 2 * Math.PI);
  context.fillStyle = "#001f33";
  context.fill();
  context.strokeStyle = "#333";
  context.stroke();

  for (const feature of geoContours) {
    context.beginPath();
    path(feature);
    context.fillStyle = d3.interpolateYlOrRd(feature.value / 12);
    context.globalAlpha = 0.65;
    context.fill();
    context.globalAlpha = 1.0;
    context.strokeStyle = "#000";
    context.lineWidth = 0.2;
    context.stroke();
  }
}

render();

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
  const k = 0.6;
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