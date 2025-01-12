const viewer = new Cesium.Viewer("cesiumContainer", {
  
  baseLayerPicker: true,
  geocoder: false,
  timeline: false,
  animation: false,
  homeButton: false,
  navigationHelpButton: false,
});

const scene = viewer.scene;

// Disable visuals safely
scene.skyBox.show = false;
scene.skyAtmosphere.show = false;
scene.sun.show = false;
scene.moon.show = false;

// Remove credits
viewer._cesiumWidget._creditContainer.style.display = "none";


// Function to create WMS tile layers dynamically
function createWMSTileLayer(metric) {
  const staticDate = "latest"; // Static date
  const url = `https://storage.googleapis.com/production-coral-tiles/crw/${metric}/${staticDate}/{z}/{x}/{y}.png`;
  return new Cesium.UrlTemplateImageryProvider({
    url: url,
    credit: "Data from Coral Reef Watch (CRW)",
  });
}

// Layer switching logic
let activeLayer = null;
function switchLayer(metric) {
  if (activeLayer) {
    viewer.imageryLayers.remove(activeLayer, false);
  }
  if (metric !== "none") {
    activeLayer = viewer.imageryLayers.addImageryProvider(createWMSTileLayer(metric));
  }
}

// Add toolbar for layer selection
const toolbar = document.createElement("div");
toolbar.style.position = "absolute";
toolbar.style.top = "10px";
toolbar.style.left = "10px";
toolbar.style.backgroundColor = "rgba(42, 42, 42, 0.8)";
toolbar.style.padding = "10px";
toolbar.style.borderRadius = "5px";
toolbar.style.color = "white";
document.body.appendChild(toolbar);
toolbar.textContent = "";
toolbar.style.fontSize = "12px";
toolbar.style.fontWeight = "bold";
toolbar.style.top = "14px";
toolbar.style.font-family: "Arial"



const metrics = [
  { name: "None", value: "none" },
  { name: "Sea Surface Temperature", value: "sst" },
  { name: "Sea Surface Temperature Anomaly", value: "ssta" },
  { name: "Sea Surface Temperature Trend", value: "sstt" },
  { name: "Hot Spots", value: "hs" },
  { name: "Bleaching Alert Area", value: "baa" },
  { name: "Degree Heating Weeks", value: "dhw" },
];

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
  button.onclick = () => switchLayer(metric.value);
  toolbar.appendChild(button);
});

// Info box for feature display
const infoBox = document.createElement("div");
infoBox.style.position = "absolute";
infoBox.style.bottom = "10px";
infoBox.style.left = "10px";
infoBox.style.backgroundColor = "rgba(42, 42, 42, 0.8)";
infoBox.style.color = "white";
infoBox.style.padding = "10px";
infoBox.style.borderRadius = "5px";
infoBox.style.fontSize = "12px";
infoBox.textContent = "Click on the map to get feature info.";
document.body.appendChild(infoBox);


// Define the handler for click events
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

	handler.setInputAction(async (click) => {
  
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);



// Load rNaturalEarth GeoJSON as polygons
Cesium.GeoJsonDataSource.load(
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  {
    clampToGround: false, // Prevent terrain clamping
  }
).then((dataSource) => {
  viewer.dataSources.add(dataSource); 
  
  // Loop through all entities and style them
  const entities = dataSource.entities.values;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    // Check if entity has a polygon
    if (entity.polygon) {
      entity.polygon.material = Cesium.Color.RED.withAlpha(0.5); // Red fill with 50% opacity
      entity.polygon.outline = true; // Enable outline
      entity.polygon.outlineColor = Cesium.Color.WHITE; // Black outline color
      entity.polygon.outlineWidth = 1.0; // Outline width

      // Ensure polygons are flat for rendering
      entity.polygon.height = 0; // Flat polygons
      entity.polygon.extrudedHeight = 0; // Avoid extrusions
      entity.polygon.perPositionHeight = false; // Disable terrain adjustment
    }
  }

  // Zoom to fit all polygons
  viewer.zoomTo(dataSource);
});


// Set camera to fit world view
viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(-50, -90, 320, 60),
});