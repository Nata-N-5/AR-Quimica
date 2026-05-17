import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.querySelector('#ar-container');
const startButton = document.querySelector('#start-ar');
const cameraLabel = startButton.querySelector('.camera-label');
const cameraIcon = startButton.querySelector('.camera-icon');
const changeButton = document.querySelector('#btn-change');
const statusText = document.querySelector('#status-text');
const scanEffect = document.querySelector('#scan-effect');

const uiLoading = document.querySelector('#ui-loading');
const uiCamera = document.querySelector('#ui-camera');
const uiScanning = document.querySelector('#ui-scanning');
const uiDetected = document.querySelector('#ui-detected');
const loadingTitle = uiLoading.querySelector('h1');

const gltfLoader = new GLTFLoader();
const eatSound = new Audio('Assets/bubbles.mp3');

let renderer;
let scene;
let camera;
let reticle;
let xrSession = null;
let xrRefSpace = null;
let currentModel = null;
let pendingPlacementMatrix = null;
let started = false;
let modelPlaced = false;
let isTransitioning = false;

const colors = [
  0x00ff66,
  0xff00ff,
  0x00ccff,
  0xffff00,
  0xff6600
];

let colorIndex = 0;
let currentColor = colors[colorIndex];

uiLoading.style.display = 'block';
uiCamera.style.display = 'none';
uiScanning.style.display = 'none';
uiDetected.style.display = 'none';
changeButton.style.display = 'none';
scanEffect.style.display = 'none';

const updateStatus = (message) => {
  statusText.textContent = message;
};

const setControlState = (state) => {
  startButton.dataset.state = state;

  if (state === 'starting') {
    startButton.disabled = true;
    cameraLabel.textContent = 'Iniciando camara AR';
    cameraIcon.src = 'Assets/svg/camera-ON.svg';
    loadingTitle.textContent = 'Cargando';
    document.body.classList.add('ar-starting');
    document.body.classList.remove('ar-active', 'ar-paused');
    return;
  }

  startButton.disabled = false;

  if (state === 'active') {
    cameraLabel.textContent = 'Pausar camara AR';
    cameraIcon.src = 'Assets/svg/camera-OFF.svg';
    document.body.classList.add('ar-active');
    document.body.classList.remove('ar-paused', 'ar-starting');
    return;
  }

  if (state === 'paused') {
    cameraLabel.textContent = 'Reanudar camara AR';
    cameraIcon.src = 'Assets/svg/camera-ON.svg';
    loadingTitle.textContent = 'Listo para comenzar';
    document.body.classList.remove('ar-active', 'ar-starting');
    document.body.classList.add('ar-paused');
    return;
  }

  cameraLabel.textContent = 'Iniciar camara AR';
  cameraIcon.src = 'Assets/svg/camera-ON.svg';
  loadingTitle.textContent = 'Listo para comenzar';
  document.body.classList.remove('ar-active', 'ar-paused', 'ar-starting');
};

const showScanningUi = () => {
  uiLoading.style.display = 'none';
  uiCamera.style.display = 'none';
  uiDetected.style.display = 'none';
  uiScanning.style.display = 'block';
  uiScanning.textContent = 'Mueve la camara lentamente sobre una mesa o el piso';
  changeButton.style.display = 'none';
  scanEffect.style.display = 'block';
  updateStatus('Buscando una superficie plana para colocar la cabrita.');
};

const showPlacedUi = (mode) => {
  uiLoading.style.display = 'none';
  uiCamera.style.display = 'none';
  uiScanning.style.display = 'none';
  uiDetected.style.display = 'block';
  uiDetected.textContent = mode === 'plane'
    ? 'Plano detectado: cabrita colocada'
    : 'Superficie detectada: cabrita colocada';
  changeButton.style.display = 'block';
  scanEffect.style.display = 'none';
  updateStatus('La cabrita quedo fija en la superficie detectada.');
};

const setupScene = () => {
  if (renderer) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    30
  );

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x7a8ca5, 1.4);
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1, 2, 1.5);
  scene.add(directionalLight);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.autoClear = true;
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const reticleGeometry = new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0xa6ff4d,
    transparent: true,
    opacity: 0.9
  });

  reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  window.addEventListener('resize', resizeRenderer);
};

const resizeRenderer = () => {
  if (!renderer || !camera) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

const loadModel = () => {
  return new Promise((resolve, reject) => {
    gltfLoader.load('Assets/cabritaS.glb', (gltf) => {
      currentModel = gltf.scene;
      currentModel.scale.set(1.6, 1.6, 1.6);
      currentModel.position.set(0, 0, 0);
      currentModel.rotation.set(0, 0, 0);
      currentModel.visible = false;
      scene.add(currentModel);

      if (pendingPlacementMatrix) {
        placeModel(pendingPlacementMatrix.matrix, pendingPlacementMatrix.mode);
        pendingPlacementMatrix = null;
      }

      resolve(currentModel);
    }, undefined, reject);
  });
};

const placeModel = (matrix, mode = 'plane') => {
  if (!currentModel) {
    pendingPlacementMatrix = {
      matrix: matrix.clone(),
      mode
    };
    return;
  }

  const placedPosition = new THREE.Vector3();
  const placedQuaternion = new THREE.Quaternion();
  const placedScale = new THREE.Vector3();

  matrix.decompose(placedPosition, placedQuaternion, placedScale);

  currentModel.position.copy(placedPosition);
  currentModel.quaternion.copy(placedQuaternion);
  currentModel.scale.set(1.6, 1.6, 1.6);
  currentModel.position.y -= 0.02;
  currentModel.visible = true;

  modelPlaced = true;
  reticle.visible = false;
  showPlacedUi(mode);
};

const createParticles = (position) => {
  const particles = [];

  for (let i = 0; i < 12; i++) {
    const geometry = new THREE.SphereGeometry(0.08, 12, 12);
    const material = new THREE.MeshStandardMaterial({
      color: currentColor,
      emissive: currentColor,
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.85
    });
    const bubble = new THREE.Mesh(geometry, material);

    bubble.position.copy(position);
    bubble.position.y += 1.15;
    bubble.position.x += 0.59;
    bubble.position.z -= 0.25;

    const randomSize = Math.random() * 0.12 + 0.08;
    bubble.scale.set(randomSize, randomSize, randomSize);
    bubble.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.0004,
      Math.random() * 0.008 + 0.003,
      (Math.random() - 0.5) * 0.0004
    );
    bubble.userData.offset = Math.random() * Math.PI * 2;

    scene.add(bubble);
    particles.push(bubble);
  }

  const animateParticles = () => {
    particles.forEach((particle, index) => {
      particle.position.add(particle.userData.velocity);
      particle.position.x += Math.sin(Date.now() * 0.001 + particle.userData.offset) * 0.0015;
      particle.position.z += Math.cos(Date.now() * 0.001 + particle.userData.offset) * 0.0015;
      particle.scale.multiplyScalar(1 + Math.sin(Date.now() * 0.003 + index) * 0.01);
      particle.material.opacity *= 0.993;

      if (particle.material.opacity < 0.03) {
        scene.remove(particle);
        particle.geometry.dispose();
        particle.material.dispose();
        particles.splice(index, 1);
      }
    });

    if (particles.length > 0) {
      requestAnimationFrame(animateParticles);
    }
  };

  animateParticles();
};

const getPlanePlacementMatrix = (frame, referenceSpace) => {
  if (!frame.detectedPlanes) return null;

  for (const plane of frame.detectedPlanes) {
    const pose = frame.getPose(plane.planeSpace, referenceSpace);

    if (pose) {
      return new THREE.Matrix4().fromArray(pose.transform.matrix);
    }
  }

  return null;
};

const onXRFrame = (timestamp, frame) => {
  if (!frame) return;

  if (xrSession) {
    xrSession.requestAnimationFrame(onXRFrame);
  }

  const referenceSpace = xrRefSpace || renderer.xr.getReferenceSpace();

  if (!modelPlaced) {
    const planeMatrix = getPlanePlacementMatrix(frame, referenceSpace);

    if (planeMatrix) {
      reticle.visible = true;
      reticle.matrix.copy(planeMatrix);
      placeModel(planeMatrix, 'plane');
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
};

const onSessionEnded = () => {
  xrSession = null;
  xrRefSpace = null;
  started = false;

  if (reticle) {
    reticle.visible = false;
  }

  uiScanning.style.display = 'none';
  uiDetected.style.display = 'none';
  uiCamera.style.display = 'none';
  uiLoading.style.display = 'block';
  changeButton.style.display = 'none';
  scanEffect.style.display = 'none';

  updateStatus('Camara en pausa. Toca el boton para reanudar la experiencia AR.');
  setControlState('paused');
  isTransitioning = false;
};

const stopAR = async () => {
  if (!started || !xrSession || isTransitioning) return;

  isTransitioning = true;
  startButton.disabled = true;
  await xrSession.end();
};

const startAR = async () => {
  if (started || isTransitioning) return;

  isTransitioning = true;
  setControlState('starting');
  updateStatus('Solicitando acceso a la camara...');
  uiLoading.style.display = 'grid';
  uiCamera.style.display = 'none';

  try {
    if (!navigator.xr) {
      throw new Error('WebXR no esta disponible en este navegador.');
    }

    const isSupported = await navigator.xr.isSessionSupported('immersive-ar');

    if (!isSupported) {
      throw new Error('Este navegador no soporta AR inmersiva.');
    }

    setupScene();

    if (!currentModel) {
      await loadModel();
    }

    modelPlaced = false;
    currentModel.visible = false;
    pendingPlacementMatrix = null;

    xrSession = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['dom-overlay', 'plane-detection'],
      domOverlay: { root: document.body }
    });

    xrSession.addEventListener('end', onSessionEnded);
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(xrSession);
    xrRefSpace = await xrSession.requestReferenceSpace('local');

    started = true;
    setControlState('active');
    showScanningUi();
    xrSession.requestAnimationFrame(onXRFrame);
  } catch (error) {
    console.error(error);
    updateStatus('No se pudo iniciar AR. Usa Chrome Android con HTTPS o localhost y acepta permisos de camara.');
    uiLoading.style.display = 'block';
    uiCamera.style.display = 'none';
    uiScanning.style.display = 'none';
    uiDetected.style.display = 'none';
    changeButton.style.display = 'none';
    scanEffect.style.display = 'none';
    setControlState('idle');
  } finally {
    isTransitioning = false;
  }
};

startButton.addEventListener('click', () => {
  if (started) {
    stopAR();
    return;
  }

  startAR();
});

changeButton.addEventListener('click', () => {
  if (!currentModel || !modelPlaced) return;

  eatSound.currentTime = 0;
  eatSound.play().catch(() => {});

  colorIndex++;

  if (colorIndex >= colors.length) {
    colorIndex = 0;
  }

  currentColor = colors[colorIndex];

  currentModel.traverse((child) => {
    if (child.isMesh && child.name === 'liquid') {
      child.material.color.set(currentColor);
      child.material.emissive = new THREE.Color(currentColor);
      child.material.emissiveIntensity = 2;
    }
  });

  createParticles(currentModel.position.clone());
});

setControlState('idle');
