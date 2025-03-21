const viewer = new Cesium.Viewer("cesiumContainer", {
  selectionIndicator: false,
  infoBox: false,
});

const scene = viewer.scene;
if (!scene.pickPositionSupported) {
  window.alert("This browser does not support pickPosition.");
}

let handler;

Sandcastle.addDefaultToolbarButton(
  "Show Cartographic Position on Mouse Over",
  function () {
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

    // Mouse over the globe to see the cartographic position
    handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(function (movement) {
      const cartesian = viewer.camera.pickEllipsoid(
        movement.endPosition,
        scene.globe.ellipsoid,
      );
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitudeString = Cesium.Math.toDegrees(
          cartographic.longitude,
        ).toFixed(4);
        const latitudeString = Cesium.Math.toDegrees(
          cartographic.latitude,
        ).toFixed(4);

        entity.position = cartesian;
        entity.label.show = true;
        entity.label.text =
          `Lon: ${`   ${longitudeString}`.slice(-7)}\u00B0` +
          `\nLat: ${`   ${latitudeString}`.slice(-7)}\u00B0`;
      } else {
        entity.label.show = false;
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  },
);

Sandcastle.addToolbarButton("Pick Entity", function () {
  const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(-75.59777, 40.03883),
    billboard: {
      image: "../images/Cesium_Logo_overlay.png",
    },
  });

  // If the mouse is over the billboard, change its scale and color
  handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction(function (movement) {
    const pickedObject = scene.pick(movement.endPosition);
    if (Cesium.defined(pickedObject) && pickedObject.id === entity) {
      entity.billboard.scale = 2.0;
      entity.billboard.color = Cesium.Color.YELLOW;
    } else {
      entity.billboard.scale = 1.0;
      entity.billboard.color = Cesium.Color.WHITE;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
});

Sandcastle.addToolbarButton("Drill-Down Picking", function () {
  const pickedEntities = new Cesium.EntityCollection();
  const pickColor = Cesium.Color.YELLOW.withAlpha(0.5);
  function makeProperty(entity, color) {
    const colorProperty = new Cesium.CallbackProperty(function (time, result) {
      if (pickedEntities.contains(entity)) {
        return pickColor.clone(result);
      }
      return color.clone(result);
    }, false);

    entity.polygon.material = new Cesium.ColorMaterialProperty(colorProperty);
  }

  const red = viewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray([
        -70.0, 30.0, -60.0, 30.0, -60.0, 40.0, -70.0, 40.0,
      ]),
      height: 0,
    },
  });
  makeProperty(red, Cesium.Color.RED.withAlpha(0.5));

  const blue = viewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray([
        -75.0, 34.0, -63.0, 34.0, -63.0, 40.0, -75.0, 40.0,
      ]),
      height: 0,
    },
  });
  makeProperty(blue, Cesium.Color.BLUE.withAlpha(0.5));

  const green = viewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray([
        -67.0, 36.0, -55.0, 36.0, -55.0, 30.0, -67.0, 30.0,
      ]),
      height: 0,
    },
  });
  makeProperty(green, Cesium.Color.GREEN.withAlpha(0.5));

  // Move the primitive that the mouse is over to the top.
  handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction(function (movement) {
    // get an array of all primitives at the mouse position
    const pickedObjects = scene.drillPick(movement.endPosition);
    if (Cesium.defined(pickedObjects)) {
      //Update the collection of picked entities.
      pickedEntities.removeAll();
      for (let i = 0; i < pickedObjects.length; ++i) {
        const entity = pickedObjects[i].id;
        pickedEntities.add(entity);
      }
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
});

Sandcastle.addToolbarButton("Pick position", function () {
  const modelEntity = viewer.entities.add({
    name: "milktruck",
    position: Cesium.Cartesian3.fromDegrees(-123.0744619, 44.0503706),
    model: {
      uri: "../SampleData/models/CesiumMilkTruck/CesiumMilkTruck.glb",
    },
  });
  viewer.zoomTo(modelEntity);

  const labelEntity = viewer.entities.add({
    label: {
      show: false,
      showBackground: true,
      font: "14px monospace",
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(15, 0),
    },
  });

  // Mouse over the globe to see the cartographic position
  handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction(function (movement) {
    let foundPosition = false;

    const scene = viewer.scene;
    if (scene.mode !== Cesium.SceneMode.MORPHING) {
      if (scene.pickPositionSupported) {
        const cartesian = viewer.scene.pickPosition(movement.endPosition);

        if (Cesium.defined(cartesian)) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const longitudeString = Cesium.Math.toDegrees(
            cartographic.longitude,
          ).toFixed(2);
          const latitudeString = Cesium.Math.toDegrees(
            cartographic.latitude,
          ).toFixed(2);
          const heightString = cartographic.height.toFixed(2);

          labelEntity.position = cartesian;
          labelEntity.label.show = true;
          labelEntity.label.text =
            `Lon: ${`   ${longitudeString}`.slice(-7)}\u00B0` +
            `\nLat: ${`   ${latitudeString}`.slice(-7)}\u00B0` +
            `\nAlt: ${`   ${heightString}`.slice(-7)}m`;

          labelEntity.label.eyeOffset = new Cesium.Cartesian3(
            0.0,
            0.0,
            -cartographic.height *
              (scene.mode === Cesium.SceneMode.SCENE2D ? 1.5 : 1.0),
          );

          foundPosition = true;
        }
      }
    }

    if (!foundPosition) {
      labelEntity.label.show = false;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
});

Sandcastle.reset = function () {
  viewer.entities.removeAll();
  handler = handler && handler.destroy();
};
