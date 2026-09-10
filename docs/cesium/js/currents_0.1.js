// Cesium setup
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZTNmOGJmZC0zOTcwLTRhMzYtOTEyMC1jYjc5Yzc5YTcwODMiLCJpZCI6MjY4NTE0LCJpYXQiOjE3MzY3MTg2NzB9.X6fIDdZkrPlD5AGjASkJ-IerCu1BLe8IIQLrwJku4LQ";

import { Viewer } from 'cesium';
import { WindLayer } from 'cesium-wind-layer';

// Step 1: Fetch data from ERDDAP
async function fetchWindData() {
  const response = await fetch(
    'https://www.ncei.noaa.gov/erddap/griddap/HYCOM_reg1_latest3d.json?water_u[(2024-09-04T21:00:00Z):1:(2024-09-04T21:00:00Z)][(0.0):1:(0.0)][(260.0):1:(310.0)],water_v[(2024-09-04T21:00:00Z):1:(2024-09-04T21:00:00Z)][(0.0):1:(0.0)][(260.0):1:(310.0)]'
  );
  const data = await response.json();

  // Parse the JSON data
  const uValues = data.table.rows.map((row) => row[data.table.columnNames.indexOf('water_u')]);
  const vValues = data.table.rows.map((row) => row[data.table.columnNames.indexOf('water_v')]);

  // Assuming a grid of 50x50 for demonstration (adjust according to the dataset)
  const width = 50; 
  const height = uValues.length / width; // Automatically calculates height

  // Extract bounding box
  const bounds = {
    west: 260.0,
    south: 0.0,
    east: 310.0,
    north: 50.0,
  };

  return {
    u: {
      array: new Float32Array(uValues),
      min: Math.min(...uValues),
      max: Math.max(...uValues),
    },
    v: {
      array: new Float32Array(vValues),
      min: Math.min(...vValues),
      max: Math.max(...vValues),
    },
    width,
    height,
    bounds,
  };
}

// Step 2: Initialize Cesium Viewer and WindLayer
async function initializeWindLayer() {
  const viewer = new Viewer('cesiumContainer');
  const windData = await fetchWindData();

  const windLayer = new WindLayer(viewer, windData, {
    particlesTextureSize: 128,          // Adjust for performance
    particleHeight: 1000,              // Height of wind particles
    lineWidth: { min: 1, max: 2 },     // Particle trail width
    lineLength: { min: 20, max: 100 }, // Particle trail length
    speedFactor: 1.0,                  // Speed multiplier
    dropRate: 0.005,                   // Drop rate
    colors: ['white'],                 // Wind particle colors
    flipY: false,                      // Match data Y orientation
    dynamic: true,                     // Enable animation
  });

  viewer.scene.primitives.add(windLayer);
}

initializeWindLayer();