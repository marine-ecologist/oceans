const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  geocoder: false,
  timeline: false,
  animation: false,
  homeButton: false,
  “enablePickFeatures”: false,
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

Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZTNmOGJmZC0zOTcwLTRhMzYtOTEyMC1jYjc5Yzc5YTcwODMiLCJpZCI6MjY4NTE0LCJpYXQiOjE3MzY3MTg2NzB9.X6fIDdZkrPlD5AGjASkJ-IerCu1BLe8IIQLrwJku4LQ";
		
		


// 1. Add 3D Tileset (Highest Rendering Priority)
	
	const tileset = Cesium.ImageryLayer.fromProviderAsync(Cesium.IonImageryProvider.fromAssetId(2));

// 2. Load GeoJSON DataSource (Polygons Above Imagery)
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

// 3. Add WMS Tile Layers (Lowest Rendering Priority)
function createWMSTileLayer(metric) {
  const staticDate = "20240314"; // Static date
  const url = `https://storage.googleapis.com/production-coral-tiles/crw/${metric}/${staticDate}/{z}/{x}/{y}.png`;
  return new Cesium.UrlTemplateImageryProvider({
    url: url,
    credit: "Data from Coral Reef Watch (CRW)",
  });
}

// Layer switching logic with alpha adjustment
let activeLayer = null;
function switchLayer(metric) {
  if (activeLayer) {
    viewer.imageryLayers.remove(activeLayer, false);
  }
  if (metric !== "none") {
    const imageryProvider = createWMSTileLayer(metric);
    activeLayer = viewer.imageryLayers.addImageryProvider(imageryProvider);
    activeLayer.alpha = 0.7; // Set transparency to 50%
  }
}
// Add toolbar for layer selection (WMS Layers)
const toolbar = document.createElement("div");
toolbar.style.position = "absolute";
toolbar.style.top = "10px";
toolbar.style.left = "10px";
toolbar.style.backgroundColor = "rgba(42, 42, 42, 0.8)";
toolbar.style.padding = "10px";
toolbar.style.borderRadius = "5px";
toolbar.style.color = "white";
document.body.appendChild(toolbar);

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

// Set the camera to fit the global view
viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(-50, -90, 320, 60),
});