// dhw_globe.js
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

// Extract valid points
const features = [];
for (let j = 0; j < lat.length; j += 2) {
  for (let i = 0; i < lon.length; i += 2) {
    const idx = j * lon.length + i;
    const value = data[idx];
    const lonVal = lon[i];
    const latVal = lat[j];
    if (
      isNaN(value) || value === -32768 ||
      isNaN(lonVal) || isNaN(latVal)
    ) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lonVal, latVal] },
      properties: { dhw: value }
    });
  }
}

const max = d3.max(features.map(f => f.properties.dhw));
const scaleFactor = max > 100 ? 100 : 1;

// Setup SVG and projection
const width = 960;
const height = 600;
const svg = d3.select("body").append("svg").attr("width", width).attr("height", height);
const projection = d3.geoOrthographic().scale(280).translate([width / 2, height / 2]).clipAngle(90);
const path = d3.geoPath(projection);

const globe = svg.append("circle")
  .attr("class", "globe")
  .attr("fill", "black")            // <-- solid black fill
  .attr("stroke", "#444")           // optional: light stroke
  .attr("stroke-width", 0.5)
  .attr("cx", width / 2)
  .attr("cy", height / 2)
  .attr("r", projection.scale());

svg.insert("rect", ":first-child")
  .attr("width", width)
  .attr("height", height)
  .attr("fill", "black");  // or "#000c"
  
const tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);

// Render points
svg.selectAll("circle.point")
  .data(features)
  .join("circle")
  .attr("class", "point")
  .attr("r", 1.5)
  .attr("fill", d => d3.interpolateYlOrRd(Math.min(d.properties.dhw / scaleFactor, 12) / 12))
  .attr("transform", d => {
    const coords = projection(d.geometry.coordinates);
    return coords ? `translate(${coords[0]},${coords[1]})` : null;
  })
  .on("mouseover", function (event, d) {
    tooltip.transition().duration(100).style("opacity", 0.9);
    const scaled = d.properties.dhw / scaleFactor;
    tooltip.html(
      `lat: ${d.geometry.coordinates[1].toFixed(2)}<br>` +
      `lon: ${d.geometry.coordinates[0].toFixed(2)}<br>` +
      `DHW: ${scaled.toFixed(2)} °C-weeks`
    )
    .style("left", (event.pageX + 5) + "px")
    .style("top", (event.pageY - 28) + "px");
  })
  .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0));

// Rotate with drag
const zoom = d3.zoom().on("zoom", (event) => {
  projection.scale(280 * event.transform.k);
  globe.attr("r", projection.scale());
  redraw();
});

const drag = d3.drag().on("drag", (event) => {
  const rotate = projection.rotate();
  projection.rotate([
    rotate[0] + event.dx * 0.6,
    rotate[1] - event.dy * 0.6
  ]);
  redraw();
});

// Apply both
svg.call(zoom).call(drag);

function redraw() {
  svg.selectAll("circle.point")
    .attr("transform", d => {
      const coords = projection(d.geometry.coordinates);
      return coords ? `translate(${coords[0]},${coords[1]})` : null;
    });
}