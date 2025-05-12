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

// Create slider early to avoid reference errors
const slider = document.createElement("input");
slider.type = "range";
slider.min = "0";
slider.max = "1";
slider.step = "0.01";
slider.value = "0.7";
slider.style.width = "140";
slider.style.margin = "5px auto";
slider.style.display = "block";
slider.id = 'slider';

// OpenDAP configuration
const OPENDAP_BASE_URL = 'https://pae-paha.pacioos.hawaii.edu/thredds/dodsC/dhw_5km';
const TILE_SIZE = 256;

// Function to fetch OpenDAP data for a specific region and time
async function fetchOpenDAPData(variable, date, bounds) {
    try {
        // First get the time index for the requested date
        const timeResponse = await fetch(`${OPENDAP_BASE_URL}.ascii?time`);
        const timeText = await timeResponse.text();
        const times = timeText.split('\n').slice(1).map(t => parseInt(t.trim())).filter(t => !isNaN(t));
        const targetTime = Math.floor(new Date(date).getTime() / 1000);
        const timeIndex = times.findIndex(t => t >= targetTime);
        
        if (timeIndex === -1) {
            throw new Error('Date not found in dataset');
        }

        // Now fetch the actual data using the time index
        const dataUrl = `${OPENDAP_BASE_URL}.ascii?${variable}[${timeIndex}][${bounds.latIndex}:${bounds.latIndex + TILE_SIZE}][${bounds.lonIndex}:${bounds.lonIndex + TILE_SIZE}]`;
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error(`OpenDAP request failed: ${response.statusText}`);
        
        const text = await response.text();
        const lines = text.split('\n').slice(1); // Skip header
        const data = new Float32Array(TILE_SIZE * TILE_SIZE);
        
        let idx = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('[')) {
                const value = parseFloat(line);
                data[idx++] = isNaN(value) ? 0 : value;
            }
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching OpenDAP data:', error);
        throw error;
    }
}

// Custom imagery provider for OpenDAP data
class OpenDAPImageryProvider {
    constructor(options) {
        this._variable = options.variable;
        this._date = options.date;
        this._ready = true;
        this._errorEvent = new Cesium.Event();
        this._tileWidth = TILE_SIZE;
        this._tileHeight = TILE_SIZE;
        this._tilingScheme = new Cesium.GeographicTilingScheme();
        this._rectangle = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90);
        this._credit = new Cesium.Credit('Data from PacIOOS THREDDS Server');
    }

    get ready() { return this._ready; }
    get rectangle() { return this._rectangle; }
    get tileWidth() { return this._tileWidth; }
    get tileHeight() { return this._tileHeight; }
    get tilingScheme() { return this._tilingScheme; }
    get errorEvent() { return this._errorEvent; }
    get credit() { return this._credit; }

    async requestImage(x, y, level) {
        try {
            const rect = this._tilingScheme.tileXYToRectangle(x, y, level);
            
            // Calculate data indices based on tile coordinates
            const bounds = {
                latIndex: Math.floor(((90 - rect.north) * 3600) / 180),
                lonIndex: Math.floor(((rect.west + 180) * 7200) / 360)
            };
            
            // Ensure indices are within bounds
            bounds.latIndex = Math.max(0, Math.min(bounds.latIndex, 3600 - TILE_SIZE));
            bounds.lonIndex = Math.max(0, Math.min(bounds.lonIndex, 7200 - TILE_SIZE));
            
            const data = await fetchOpenDAPData(this._variable, this._date, bounds);
            
            // Create canvas and draw data
            const canvas = document.createElement('canvas');
            canvas.width = this._tileWidth;
            canvas.height = this._tileHeight;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(this._tileWidth, this._tileHeight);
            
            // Convert data values to colors
            for (let i = 0; i < data.length; i++) {
                const value = data[i];
                const color = this._getColor(value);
                const idx = i * 4;
                imageData.data[idx] = color.r;
                imageData.data[idx + 1] = color.g;
                imageData.data[idx + 2] = color.b;
                imageData.data[idx + 3] = color.a;
            }
            
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        } catch (error) {
            console.error('Error creating tile:', error);
            return document.createElement('canvas');
        }
    }

    _getColor(value) {
        // Implement color scale based on variable type
        // This is a basic implementation - adjust based on your needs
        if (this._variable === 'CRW_DHW') {
            return this._getDHWColor(value);
        } else if (this._variable === 'CRW_SST') {
            return this._getSSTColor(value);
        }
        // Add more color scales for other variables
        return { r: 0, g: 0, b: 0, a: 0 };
    }

    _getDHWColor(value) {
        // Color scale for Degree Heating Weeks
        if (value <= 0) return { r: 0, g: 0, b: 0, a: 0 };
        if (value < 4) return { r: 255, g: 255 - (value * 63), b: 0, a: 255 };
        if (value < 8) return { r: 255, g: 0, b: 0, a: 255 };
        return { r: 128, g: 0, b: 0, a: 255 };
    }

    _getSSTColor(value) {
        // Color scale for Sea Surface Temperature
        const min = 0;
        const max = 35;
        const normalized = (value - min) / (max - min);
        return {
            r: Math.floor(255 * normalized),
            g: Math.floor(128 * normalized),
            b: Math.floor(255 * (1 - normalized)),
            a: 255
        };
    }
}

// Function to create OpenDAP layer
async function createOpenDAPLayer(metric, date) {
    const variableMap = {
        'dhw': 'CRW_DHW',
        'sst': 'CRW_SST',
        'ssta': 'CRW_SSTANOMALY',
        'sstt': 'CRW_SSTTREND',
        'hs': 'CRW_HOTSPOT',
        'baa': 'CRW_BAA'
    };

    const variable = variableMap[metric] || 'CRW_DHW';
    
    return new OpenDAPImageryProvider({
        variable: variable,
        date: date
    });
}

// Function to format date for WMS
function formatDateForWMS(dateStr) {
    if (!dateStr) return '';
    
    // Convert YYYYMMDD to YYYY-MM-DD
    if (dateStr.length === 8) {
        dateStr = dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    }
    
    // If already has time component, return as is
    if (dateStr.includes('T')) {
        return dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
    }
    
    // Add time component if missing
    return `${dateStr}T00:00:00Z`;
}

// Function to get current viewport bounds
function getCurrentBounds() {
    const camera = viewer.camera;
    const rectangle = viewer.camera.computeViewRectangle();
    
    return {
        west: Cesium.Math.toDegrees(rectangle.west),
        south: Cesium.Math.toDegrees(rectangle.south),
        east: Cesium.Math.toDegrees(rectangle.east),
        north: Cesium.Math.toDegrees(rectangle.north)
    };
}

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

// Function to switch layers dynamically
function switchLayers(metric, noaaMetric, date, noaaTime) {
    if (activeLayer) viewer.imageryLayers.remove(activeLayer, false);
    if (noaaLayer) viewer.imageryLayers.remove(noaaLayer, false);

    if (metric !== "none") {
        createOpenDAPLayer(metric, date).then(provider => {
            activeLayer = viewer.imageryLayers.addImageryProvider(provider);
            if (slider) {
                activeLayer.alpha = parseFloat(slider.value);
            }
        }).catch(error => {
            console.error('Error creating OpenDAP layer:', error);
        });
    }

    if (noaaMetric !== "none") {
        const wmsProvider = new Cesium.WebMapServiceImageryProvider({
            url: 'https://pae-paha.pacioos.hawaii.edu/thredds/wms/dhw_5km',
            layers: noaaMetric,
            parameters: {
                transparent: true,
                format: 'image/png',
                time: formatDateForWMS(noaaTime)
            }
        });
        noaaLayer = viewer.imageryLayers.addImageryProvider(wmsProvider);
        noaaLayer.alpha = 0.0;
    }
}

// Click-to-get-values handler
const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction(async (click) => {
    const pickRay = scene.camera.getPickRay(click.position);
    const cartesian = scene.globe.pick(pickRay, scene);
    
    if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        
        // Update tooltip
        clickTooltip.style.display = "block";
        clickTooltip.style.left = `${click.position.x + 15}px`;
        clickTooltip.style.top = `${click.position.y + 15}px`;
        
        if (activeLayer) {
            const currentMetric = document.querySelector('.metric-button.active')?.dataset.metric;
            const metricName = noaaMetricNames[metricToNoaa[currentMetric]] || "Value";
            clickTooltip.innerHTML = `
                Lon: ${longitude.toFixed(4)}<br>
                Lat: ${latitude.toFixed(4)}<br>
                ${metricName}: Loading...
            `;
            
            // TODO: Add OpenDAP data fetching here when needed
        } else {
            clickTooltip.innerHTML = `
                Lon: ${longitude.toFixed(4)}<br>
                Lat: ${latitude.toFixed(4)}
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
  button.classList.add('metric-button');
  button.dataset.metric = metric.value;

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
datePicker.value = "2022-01-01";
datePicker.style.display = "block";
datePicker.style.margin = "5px auto";
datePicker.style.width = "140";
datePicker.id = 'datePicker';

datePicker.onchange = () => {
  const selectedMetric = document.querySelector("button.active")?.dataset.metric;
  const selectedNoaaMetric = metricToNoaa[selectedMetric];
  const selectedDate = datePicker.value;
  const [year, month, day] = selectedDate.split("-");
  const noaaTime = `${selectedDate}T12:00:00.000Z`;

  switchLayers(selectedMetric, selectedNoaaMetric, `${year}${month}${day}`, noaaTime);
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

slider.oninput = () => {
    if (activeLayer) {
        activeLayer.alpha = parseFloat(slider.value);
    }
};

toolbar.appendChild(slider);

// Set the camera to fit the global view
// viewer.camera.setView({
//   destination: Cesium.Rectangle.fromDegrees(-50, -80, 320, 60),
// });

viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(140, -8, 15000000),  // Center on Indonesia with max zoom
  orientation: {
    heading: Cesium.Math.toRadians(0),      // Direction the camera is facing (0 = North)
    pitch: Cesium.Math.toRadians(-90),      // Look directly down
    roll: 0,
  },
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