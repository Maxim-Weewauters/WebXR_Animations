async function activateXR() {
  //----- Step 1 -------//
  // Add a canvas element and initialize a WebGL context that is compatible with WebXR.

  const canvas = document.createElement("canvas");

  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl", { xrCompatible: true });

  //create Three.js scene that will be used in AR
  const scene = new THREE.Scene();

  // Add a mixer for animation frames later
  const mixers = [];

  // Camera from phone
  const camera = new THREE.PerspectiveCamera();

  //----- Step 2 -------//
  // Add lights to the scene

  //A light source positioned directly above the scene
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
  hemiLight.position.set(0, 300, 0);
  scene.add(hemiLight);

  //A light that gets emitted in a specific direction
  const dirLight = new THREE.DirectionalLight(0xffffff);
  dirLight.position.set(75, 300, 0);
  scene.add(dirLight);

  //----- step 3 -------//
  // Set up the WebGLRenderer, which handles rendering to the session's base layer.

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    preserveDrawingBuffer: true,
    canvas: canvas,
    context: gl,
  });
  renderer.autoClear = false;

  // The API directly updates the camera matrices.
  // Disable matrix auto updates so three.js doesn't attempt
  // to handle the matrices independently.
  camera.matrixAutoUpdate = false;

  // ----- step 4 -------//
  // Initialize a WebXR session using "immersive-ar".

  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
  });
  session.updateRenderState({
    baseLayer: new XRWebGLLayer(session, gl),
  });

  // A 'local' reference space has a native origin that is located
  // near the viewer's position at the time the session was created.
  const referenceSpace = await session.requestReferenceSpace("local");

  // Create another XRReferenceSpace that has the viewer as the origin.
  const viewerSpace = await session.requestReferenceSpace("viewer");

  // Perform hit testing using the viewer as origin.
  const hitTestSource = await session.requestHitTestSource({
    space: viewerSpace,
  });

  //Use the model loader from js/GLTFLoader.js to load a marker for the hitscanning. We will be using this same loader for the custom models later.
  const loader = new THREE.GLTFLoader();

  let marker;
  // This is were we load the blue marker model. (marker for the hitscanning)
  loader.load(
    "https://immersive-web.github.io/webxr-samples/media/gltf/reticle/reticle.gltf",
    function (gltf) {
      marker = gltf.scene;
      marker.visible = false;
      scene.add(marker);
    }
  );

  let customModel;
  // Eventlistener that will wait for a 'tap' of the user. When tapped, custom model loads with animation and get placed on marker location
  session.addEventListener("select", () => {
    loader.load("models/Demon/Demon.gltf", function (gltf) {
      customModel = gltf.scene;

      // Scale of model
      customModel.scale.multiplyScalar(8);

      // Copy position marker. Use it for position custom model
      customModel.position.copy(marker.position);

      // Add rotation to model.
      customModel.rotation.y += 15;

      //if model is animated. play animation
      const animation = gltf.animations[0];
      const mixer = new THREE.AnimationMixer(customModel);
      mixers.push(mixer);

      const action = mixer.clipAction(animation);
      action.play();

      scene.add(customModel);
    });
  });

  //----- step 5 -------//
  // Create a render loop that allows us to draw on the AR view.

  const onXRFrame = (time, frame) => {
    // Queue up the next draw request.
    session.requestAnimationFrame(onXRFrame);

    // Bind the graphics framebuffer to the baseLayer's framebuffer
    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      session.renderState.baseLayer.framebuffer
    );

    // Retrieve the pose of the device.
    // XRFrame.getViewerPose can return null while the session attempts to establish tracking.
    const pose = frame.getViewerPose(referenceSpace);
    if (pose) {
      // In mobile AR, we only have one view.
      const view = pose.views[0];

      const viewport = session.renderState.baseLayer.getViewport(view);
      renderer.setSize(viewport.width, viewport.height);

      // Use the view's transform matrix and projection matrix to configure the THREE.camera.
      camera.matrix.fromArray(view.transform.matrix);
      camera.projectionMatrix.fromArray(view.projectionMatrix);
      camera.updateMatrixWorld(true);

      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0 && marker) {
        const hitPose = hitTestResults[0].getPose(referenceSpace);
        marker.visible = true;
        marker.position.set(
          hitPose.transform.position.x,
          hitPose.transform.position.y,
          hitPose.transform.position.z
        );
        marker.updateMatrixWorld(true);
      }

      // Render the scene with THREE.WebGLRenderer.
      renderer.render(scene, camera);
    }
  };

  //----- step 6 -------//
  // Use setAnimationLoop for webXR projects (instead of requestAnimationFrame)

  renderer.setAnimationLoop(() => {
    animate();
  });

  // Add a 'clock' variable for animations
  let clock = new THREE.Clock();

  function animate() {
    const delta = clock.getDelta();

    for (const mixer of mixers) {
      mixer.update(delta);
    }
  }
  session.requestAnimationFrame(onXRFrame);
}
