// Initialize the Cesium viewer
const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  geocoder: false,
  timeline: false,
  animation: false,
  homeButton: false,
  navigationHelpButton: false,
  enablePickFeatures: false,
  infoBox: false,
});

// Disable unnecessary visuals
const scene = viewer.scene;
scene.skyBox.show = false;
scene.skyAtmosphere.show = false;
scene.sun.show = false;
scene.moon.show = false;

// Remove Cesium credits
viewer._cesiumWidget._creditContainer.style.display = "none";

// Cesium Ion Access Token
Cesium.Ion.defaultAccessToken = "YOUR_CESIUM_ION_ACCESS_TOKEN_HERE";


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

// Layer management
let activeLayer = null;
let noaaLayer = null;

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
    activeLayer.alpha = 0.7; // Set transparency for WMS layer
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
    noaaLayer.alpha = 0.0; // Set NOAA layer to fully transparent
  }
}

// Add 3D Tileset
Cesium.ImageryLayer.fromProviderAsync(Cesium.IonImageryProvider.fromAssetId(2));

// Load GeoJSON DataSource (Polygons Above Imagery)
Cesium.GeoJsonDataSource.load(
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  {
    clampToGround: false, // Prevent terrain clamping
  }
).then((dataSource) => {
  viewer.dataSources.add(dataSource);

  // Style polygons
  const entities = dataSource.entities.values;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    if (entity.polygon) {
      entity.polygon.material = Cesium.Color.RED.withAlpha(0.5);
      entity.polygon.outline = true;
      entity.polygon.outlineColor = Cesium.Color.WHITE;
      entity.polygon.outlineWidth = 1.0;
      entity.polygon.height = 0;
      entity.polygon.extrudedHeight = 0;
      entity.polygon.perPositionHeight = false;
    }
  }

  // Zoom to GeoJSON entities
  viewer.zoomTo(dataSource);
});

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

// Metrics and NOAA metrics mapping
const metrics = [
  { name: "None", value: "none" },
  { name: "Sea Surface Temperature", value: "sst" },
  { name: "Sea Surface Temperature Anomaly", value: "ssta" },
  { name: "Sea Surface Temperature Trend", value: "sstt" },
  { name: "Hot Spots", value: "hs" },
  { name: "Bleaching Alert Area", value: "baa" },
  { name: "Degree Heating Weeks", value: "dhw" },
];

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




// Define the handler for click events
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);


handler.setInputAction(async (click) => {
  const pickRay = scene.camera.getPickRay(click.position);
  const imageryLayerFeatures = await scene.imageryLayers.pickImageryLayerFeatures(pickRay, scene);

  if (imageryLayerFeatures && imageryLayerFeatures.length > 0) {
    const rawText = imageryLayerFeatures[0].description;
   // Extract values using regular expressions
const gridCentreLonMatch = rawText.match(/&lt;gridCentreLon&gt;([-0-9.]+)&lt;\/gridCentreLon&gt;/);
const gridCentreLatMatch = rawText.match(/&lt;gridCentreLat&gt;([-0-9.]+)&lt;\/gridCentreLat&gt;/);
const timeMatch = rawText.match(/&lt;time&gt;([\d-]+)T[\d:.]+Z&lt;\/time&gt;/);
const valueMatch = rawText.match(/&lt;value&gt;([-0-9.]+)&lt;\/value&gt;/);

if (gridCentreLonMatch && gridCentreLatMatch && timeMatch && valueMatch) {
  // Extract and round the values
  const samplelon = parseFloat(gridCentreLonMatch[1]).toFixed(5);
  const samplelat = parseFloat(gridCentreLatMatch[1]).toFixed(5);

  // Parse time to dd-mm-yyyy format
  const isoDate = timeMatch[1]; // Extract "2025-01-12"
  const [year, month, day] = isoDate.split("-");
  const formattedDate = `${day}-${month}-${year}`; // Convert to "12-01-2025"

  const sampleval = parseFloat(valueMatch[1]).toFixed(2);

  // Log the extracted and formatted values
  console.log(`Longitude: ${samplelon}`);
  console.log(`Latitude: ${samplelat}`);
  console.log(`Time: ${formattedDate}`);
  console.log(`Value: ${sampleval}`);
} else {
  console.error("Could not extract all values from the raw text.");
}
    
    
  } else {
    console.log("No feature info found at this location.");
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);





// Set the camera to fit the global view
viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(-50, -90, 320, 60),
});