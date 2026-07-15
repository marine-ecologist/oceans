// Cesium setup
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

  .tooltip {
    position: absolute;
    background: rgba(42, 42, 42, 0.8);
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    font-family: Arial, sans-serif;
    pointer-events: none;
    display: none;
  }

  .active {
    background-color: #007bff !important;
    color: white !important;
  }
`;
const styleTag = document.createElement("style");
styleTag.textContent = styles;
document.head.appendChild(styleTag);

// Create tooltips
const hoverTooltip = document.createElement("div");
hoverTooltip.classList.add("tooltip");
document.body.appendChild(hoverTooltip);

const clickTooltip = document.createElement("div");
clickTooltip.classList.add("tooltip");
document.body.appendChild(clickTooltip);

// Layer management
let activeLayer = null;
let noaaLayer = null;


// Calculate staticDate as EST - 1 day
const nowUTC = new Date(); // Current UTC time
const nowEST = new Date(nowUTC.getTime() - (5 * 60 * 60 * 1000)); // Convert UTC to EST (UTC-5)
const staticDateEST = new Date(nowEST.getTime() - 24 * 60 * 60 * 1000); // Subtract 1 day


// NOAA metrics mapping
const noaaMetricNames = {
  CRW_SST: "Sea Surface Temperature",
  CRW_SSTANOMALY: "Sea Surface Temperature Anomaly",
  CRW_SSTTREND: "Sea Surface Temperature Trend",
  CRW_HOTSPOT: "HotSpot",
  CRW_BAA: "Bleaching Alert Area",
  CRW_DHW: "Degree Heating Weeks",
};

// Metrics for buttons
const metrics = [
  { name: "None", value: "none" },
  { name: "SST", value: "sst" },
  { name: "SSTA", value: "ssta" },
  { name: "SSTT", value: "sstt" },
  { name: "HS", value: "hs" },
  { name: "BAA", value: "baa" },
  { name: "DHW", value: "dhw" },
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

const metricToNoaa = {};
metrics.forEach((metric, index) => {
  metricToNoaa[metric.value] = noaametrics[index].value;
});

// Function to create a WMS Tile Layer
function createWMSTileLayer(metric, date) {
  const url = `https://storage.googleapis.com/production-coral-tiles/crw/${metric}/${date}/{z}/{x}/{y}.png`;
  return new Cesium.UrlTemplateImageryProvider({
    url: url,
    credit: "Data from Coral Reef Watch (CRW)",
  });
}

// Function to switch layers dynamically
function switchLayers(metric, noaaMetric, date, noaaTime) {
  if (activeLayer) viewer.imageryLayers.remove(activeLayer, false);
  if (noaaLayer) viewer.imageryLayers.remove(noaaLayer, false);

  if (metric !== "none") {
    activeLayer = viewer.imageryLayers.addImageryProvider(createWMSTileLayer(metric, date));
    activeLayer.alpha = parseFloat(slider.value);
  }

  if (noaaMetric !== "none") {
    noaaLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.WebMapServiceImageryProvider({
        url: `https://pae-paha.pacioos.hawaii.edu/thredds/wms/dhw_5km`,
        layers: noaaMetric,
        parameters: {
          transparent: true,
          format: "image/png",
          time: noaaTime,
        },
      })
    );
    noaaLayer.alpha = 0.0;
  }
}



// Click-to-get-values handler
const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction(async (click) => {
  const pickRay = scene.camera.getPickRay(click.position);
  const imageryLayerFeatures = await scene.imageryLayers.pickImageryLayerFeatures(pickRay, scene);

  const mouseX = click.position.x;
  const mouseY = click.position.y;

  if (imageryLayerFeatures && imageryLayerFeatures.length > 0) {
    const feature = imageryLayerFeatures[0];
    const description = feature.description || "No data available";

    // Show feature details in tooltip
    clickTooltip.style.display = "block";
    clickTooltip.style.left = `${mouseX + 15}px`;
    clickTooltip.style.top = `${mouseY + 15}px`;
    clickTooltip.innerHTML = `
      <strong>${feature.imageryLayer.imageryProvider.credit}</strong><br>
      ${description}
    `;
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Dynamic Lon/Lat click Tooltip
const hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction(async (click) => {
  const pickRay = scene.camera.getPickRay(click.position);
  const imageryLayerFeatures = await scene.imageryLayers.pickImageryLayerFeatures(pickRay, scene);

  const mouseX = click.position.x;
  const mouseY = click.position.y;

  if (imageryLayerFeatures && imageryLayerFeatures.length > 0) {
    const rawText = imageryLayerFeatures[0].description;

    const gridCentreLonMatch = rawText.match(/&lt;gridCentreLon&gt;([-0-9.]+)&lt;\/gridCentreLon&gt;/);
    const gridCentreLatMatch = rawText.match(/&lt;gridCentreLat&gt;([-0-9.]+)&lt;\/gridCentreLat&gt;/);
    const timeMatch = rawText.match(/&lt;time&gt;([\d-]+)T[\d:.]+Z&lt;\/time&gt;/);
    const valueMatch = rawText.match(/&lt;value&gt;([-0-9.]+)&lt;\/value&gt;/);

    if (gridCentreLonMatch && gridCentreLatMatch && timeMatch && valueMatch) {
      const samplelon = parseFloat(gridCentreLonMatch[1]).toFixed(5);
      const samplelat = parseFloat(gridCentreLatMatch[1]).toFixed(5);
      const isoDate = timeMatch[1];
      const [year, month, day] = isoDate.split("-");
      const formattedDate = `${day}-${month}-${year}`;
      const sampleval = parseFloat(valueMatch[1]).toFixed(2);
      const metricName = noaaMetricNames[noaaLayer.imageryProvider.layers] || "Value";

      // Update tooltip
      clickTooltip.style.display = "block";
      clickTooltip.style.left = `${mouseX + 15}px`;
      clickTooltip.style.top = `${mouseY + 15}px`;
      clickTooltip.innerHTML = `
        Lon: ${samplelon}<br>
        Lat: ${samplelat}<br>
        ${metricName}: ${sampleval}
      `;
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


// Lon/Lat Hover Tracker
const dynamicHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
dynamicHandler.setInputAction((movement) => {
  const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, scene.globe.ellipsoid);

  if (cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const longitudeString = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
    const latitudeString = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);

    // Update tooltip
    hoverTooltip.style.display = "block";
    hoverTooltip.style.left = `${movement.endPosition.x + 15}px`;
    hoverTooltip.style.top = `${movement.endPosition.y + 15}px`;
    hoverTooltip.innerHTML = `
      
      Lon: ${longitudeString}<br>
      Lat: ${latitudeString}
    `;
  } else {
    hoverTooltip.style.display = "none";
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// Add Toolbar
const toolbar = document.createElement("div");
toolbar.style.position = "absolute";
toolbar.style.top = "10px";
toolbar.style.left = "10px";
toolbar.style.backgroundColor = "rgba(42, 42, 42, 0.8)";
toolbar.style.padding = "4px";
toolbar.style.borderRadius = "5px";
toolbar.style.color = "white";
document.body.appendChild(toolbar);

// Create container for button rows
const buttonRow1 = document.createElement("div");
buttonRow1.style.display = "flex";
buttonRow1.style.justifyContent = "center";
buttonRow1.style.marginBottom = "5px";

const buttonRow2 = document.createElement("div");
buttonRow2.style.display = "flex";
buttonRow2.style.justifyContent = "center";

// Add Buttons for Metrics
metrics.forEach((metric, index) => {
  const button = document.createElement("button");
  button.textContent = metric.name;
  button.style.margin = "2px";
  button.style.padding = "1px 1px";
  button.style.fontSize = "10px";
  button.style.backgroundColor = "#333";
  button.style.color = "#BEBEBE";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.cursor = "pointer";
  button.style.width = "auto";

  button.onclick = () => {
    document.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    const selectedMetric = metric.value;
    const selectedNoaaMetric = metricToNoaa[selectedMetric];
    const selectedDate = datePicker.value;
    const [year, month, day] = selectedDate.split("-");
    const noaaTime = `${selectedDate}T12:00:00.000Z`;

    switchLayers(selectedMetric, selectedNoaaMetric, `${year}${month}${day}`, noaaTime);
  };

  // Distribute buttons across two rows
  if (index < metrics.length / 2) {
    buttonRow1.appendChild(button);
  } else {
    buttonRow2.appendChild(button);
  }
});

const metricsButtonLabel = document.createElement("div");
metricsButtonLabel.textContent = "Select metric";
metricsButtonLabel.style.textAlign = "center";
metricsButtonLabel.style.color = "#d7f7ff";
metricsButtonLabel.style.fontSize = "14px";
metricsButtonLabel.style.margin = "10px 0";
toolbar.appendChild(metricsButtonLabel);
// Append button rows to the toolbar
toolbar.appendChild(buttonRow1);
toolbar.appendChild(buttonRow2);

// Add Date Picker
const datePickerLabel = document.createElement("div");
datePickerLabel.textContent = "Select Date";
datePickerLabel.style.fontSize = "14px";
datePickerLabel.style.textAlign = "center";
datePickerLabel.style.color = "#d7f7ff";
datePickerLabel.style.margin = "10px 0";
toolbar.appendChild(datePickerLabel);

const datePicker = document.createElement("input");
datePicker.type = "date";
datePicker.value = new Date(
  new Date(staticDateEST.toISOString()).getTime() - 24 * 60 * 60 * 1000 // staticDate - 1 day
)
  .toISOString()
  .split("T")[0];
datePicker.style.display = "block";
datePicker.style.margin = "5px auto";
datePicker.style.width = "140";


datePicker.onchange = () => {
  const selectedMetric = document.querySelector("button.active")?.textContent || "None";
  const selectedNoaaMetric = metricToNoaa[metrics.find((m) => m.name === selectedMetric)?.value] || "none";
  const selectedDate = datePicker.value;
  const [year, month, day] = selectedDate.split("-");
  const noaaTime = `${selectedDate}T12:00:00.000Z`;

  switchLayers(metrics.find((m) => m.name === selectedMetric)?.value || "none", selectedNoaaMetric, `${year}${month}${day}`, noaaTime);


};

toolbar.appendChild(datePicker);

// Add Transparency Slider
const sliderLabel = document.createElement("div");
sliderLabel.textContent = "Transparency";
sliderLabel.style.textAlign = "center";
sliderLabel.style.color = "#d7f7ff";
sliderLabel.style.fontSize = "14px";
sliderLabel.style.margin = "10px 0";
toolbar.appendChild(sliderLabel);

const slider = document.createElement("input");
slider.type = "range";
slider.min = "0";
slider.max = "1";
slider.step = "0.01";
slider.value = "0.7";
slider.style.width = "140";
slider.style.margin = "5px auto";
slider.style.display = "block";

slider.oninput = () => {
  if (activeLayer) {
    activeLayer.alpha = parseFloat(slider.value);
  }
};

toolbar.appendChild(slider);

// Set the camera to fit the global view
viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(-50, -80, 320, 60),
});

// Geocoder customization
const geocoderViewModel = viewer.geocoder.viewModel;

// Listen for search events to log the result or move the camera
geocoderViewModel.searchText = ""; // Initialize with empty text
geocoderViewModel.search = function () {
  const searchQuery = geocoderViewModel.searchText;

  console.log(`Searching for: ${searchQuery}`);

  geocoderViewModel
    .search()
    .then((results) => {
      if (results.length > 0) {
        const firstResult = results[0];
        console.log("Found location:", firstResult.displayName);

        // Fly to the location
        viewer.camera.flyTo({
          destination: firstResult.destination,
        });
      } else {
        console.error("No results found.");
      }
    })
    .catch((error) => {
      console.error("Geocoder search failed:", error);
    });
};