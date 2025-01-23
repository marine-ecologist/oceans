///Cesium.BingMapsApi.defaultKey = "Apg63g6vwyWR-4zUY315ML1yKH7j52KxhxID2iiwD02eSE1ENMXRhjxklby-3lQs";
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
  geocoder: true, // Enable the geocoder (search box)
});

// Layer management
let activeLayer = null;
let noaaLayer = null;

// Disable unnecessary visuals for performance and customization
const scene = viewer.scene;
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
}, 500);

// Set the camera to fit the global view
viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
});

// Add a real-time longitude/latitude display on mouse move
const entity = viewer.entities.add({
  label: {
    show: false,
    showBackground: true,
    font: "12px monospace",
    horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
    verticalOrigin: Cesium.VerticalOrigin.TOP,
    pixelOffset: new Cesium.Cartesian2(15, 0),
  },
});

const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction((movement) => {
  const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, scene.globe.ellipsoid);
  if (cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const longitudeString = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
    const latitudeString = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);

    entity.position = cartesian;
    entity.label.show = true;
    entity.label.text =
      `Lon: ${longitudeString}\u00B0\nLat: ${latitudeString}\u00B0`;
  } else {
    entity.label.show = false;
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

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
  // Remove existing custom layers
  if (activeLayer) {
    viewer.imageryLayers.remove(activeLayer, false);
  }
  if (noaaLayer) {
    viewer.imageryLayers.remove(noaaLayer, false);
  }

  // Add the WMS tile layer
  if (wmsMetric !== "none") {
    activeLayer = viewer.imageryLayers.addImageryProvider(createWMSTileLayer(wmsMetric));
    activeLayer.alpha = 0.7; // Ensure transparency for WMS layer
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
    noaaLayer.alpha = 0; // NOAA layer is fully transparent by default
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
    const selectedMetric = metric.value;
    const selectedNoaaMetric = noaaMetricNames[selectedMetric] || "none";

    // Switch the layers
    switchLayers(selectedMetric, selectedNoaaMetric);

    console.log(`Selected Metric: ${selectedMetric}`);
    console.log(`Selected NOAA Metric: ${selectedNoaaMetric}`);
  };

  toolbar.appendChild(button);
});

// Add slider for opacity under the buttons
const opacitySlider = document.createElement("input");
opacitySlider.type = "range";
opacitySlider.min = 0;
opacitySlider.max = 1;
opacitySlider.step = 0.01;
opacitySlider.value = 0.7; // Default value

opacitySlider.style.marginTop = "10px";
opacitySlider.style.width = "90%";
opacitySlider.oninput = () => {
  if (activeLayer) {
    activeLayer.alpha = parseFloat(opacitySlider.value); // Update layer opacity
    console.log(`Layer opacity set to: ${opacitySlider.value}`);
  }
};

toolbar.appendChild(opacitySlider);