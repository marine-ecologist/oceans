Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZTNmOGJmZC0zOTcwLTRhMzYtOTEyMC1jYjc5Yzc5YTcwODMiLCJpZCI6MjY4NTE0LCJpYXQiOjE3MzY3MTg2NzB9.X6fIDdZkrPlD5AGjASkJ-IerCu1BLe8IIQLrwJku4LQ";

// Initialize the Cesium viewer
const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  timeline: false,
  animation: false,
  homeButton: false,
  navigationHelpButton: false,
  enablePickFeatures: false,
  infoBox: false,
  geocoder: true, // Enable geocoder (search box)
});

const scene = viewer.scene;

// Disable unnecessary visuals
scene.skyBox.show = false;
scene.skyAtmosphere.show = false;
scene.sun.show = false;
scene.moon.show = false;

// Remove Cesium credits
viewer._cesiumWidget._creditContainer.style.display = "none";

// Styling for smooth rendering
const styles = `
  #cesiumContainer canvas {
    image-rendering: smooth;
    image-rendering: -webkit-optimize-contrast;
  }
`;
const styleTag = document.createElement("style");
styleTag.textContent = styles;
document.head.appendChild(styleTag);

// Ensure the search bar is always open
setTimeout(() => {
  const geocoderInput = document.querySelector(".cesium-geocoder-input");
  if (geocoderInput) {
    geocoderInput.focus(); // Focus the search bar
  }
}, 500); // Slight delay to ensure Cesium has initialized

// Set the camera to fit the global view
viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(-50, -90, 320, 60),
});

// Layer management
let activeLayer = null;
let noaaLayer = null;

// Mapping NOAA metrics to names
const noaaMetricNames = {
  CRW_SST: "Sea Surface Temperature",
  CRW_SSTANOMALY: "Sea Surface Temperature Anomaly",
  CRW_SSTTREND: "Sea Surface Temperature Trend",
  CRW_HOTSPOT: "HotSpot",
  CRW_BAA: "Bleaching Alert Area",
  CRW_DHW: "Degree Heating Weeks",
};

// Function to create a WMS Tile Layer with a static date
function createWMSTileLayer(metric) {
  const staticDate = "20250101"; // Static date
  const url = `https://storage.googleapis.com/production-coral-tiles/crw/${metric}/${staticDate}/{z}/{x}/{y}.png`;
  return new Cesium.UrlTemplateImageryProvider({
    url: url,
    credit: "Data from Coral Reef Watch (CRW)",
  });
}

// Function to switch layers
function switchLayers(wmsMetric, noaaMetric) {
  // Remove existing layers
  if (activeLayer) {
    viewer.imageryLayers.remove(activeLayer, false);
  }
  if (noaaLayer) {
    viewer.imageryLayers.remove(noaaLayer, false);
  }

  // Add the WMS tile layer
  if (wmsMetric !== "none") {
    activeLayer = viewer.imageryLayers.addImageryProvider(createWMSTileLayer(wmsMetric));
    activeLayer.alpha = 0.5; // Ensure alpha works for transparency
  }

  // Add the NOAA WMS layer
  if (noaaMetric !== "none") {
    noaaLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.WebMapServiceImageryProvider({
        url: `https://pae-paha.pacioos.hawaii.edu/thredds/wms/dhw_5km`,
        layers: noaaMetric,
        parameters: {
          transparent: true,
          format: "image/png",
          time: "2025-01-01T12:00:00.000Z", // Static date for NOAA layer in ISO 8601
        },
      })
    );
    noaaLayer.alpha = 0.7; // Ensure alpha works here as well
  }
}

// Toolbar for Layer Selection
const toolbar = document.createElement("div");
toolbar.style.position = "absolute";
toolbar.style.top = "10px";
toolbar.style.left = "10px";
toolbar.style.backgroundColor = "rgba(42, 42, 42, 0.8)";
toolbar.style.padding = "10px";
toolbar.style.borderRadius = "5px";
toolbar.style.color = "white";
document.body.appendChild(toolbar);

// Metrics for toolbar
const metrics = [
  { name: "None", value: "none" },
  { name: "Sea Surface Temperature", value: "sst" },
  { name: "Sea Surface Temperature Anomaly", value: "ssta" },
  { name: "Sea Surface Temperature Trend", value: "sstt" },
  { name: "Hot Spots", value: "hs" },
  { name: "Bleaching Alert Area", value: "baa" },
  { name: "Degree Heating Weeks", value: "dhw" },
];

// NOAA metrics
const noaametrics = [
  { name: "None", value: "none" },
  { name: "Sea Surface Temperature", value: "CRW_SST" },
  { name: "Sea Surface Temperature Anomaly", value: "CRW_SSTANOMALY" },
  { name: "Sea Surface Temperature Trend", value: "CRW_SSTTREND" },
  { name: "Hot Spots", value: "CRW_HOTSPOT" },
  { name: "Bleaching Alert Area", value: "CRW_BAA" },
  { name: "Degree Heating Weeks", value: "CRW_DHW" },
];

// Map metrics to NOAA metrics for easy lookup
const metricToNoaa = {};
metrics.forEach((metric, index) => {
  metricToNoaa[metric.value] = noaametrics[index].value;
});

// Create buttons for toolbar
metrics.forEach((metric) => {
  const button = document.createElement("button");
  button.textContent = metric.name;
  button.style.margin = "5px";
  button.style.padding = "8px";
  button.style.backgroundColor = "#555";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.cursor = "pointer";

  button.onclick = () => {
    // Get selected metric and corresponding NOAA metric
    const selectedMetric = metric.value;
    const selectedNoaaMetric = metricToNoaa[selectedMetric];

    // Switch the layers
    switchLayers(selectedMetric, selectedNoaaMetric);

    console.log(`Selected Metric: ${selectedMetric}`);
    console.log(`Selected NOAA Metric: ${selectedNoaaMetric}`);
  };

  toolbar.appendChild(button);
});