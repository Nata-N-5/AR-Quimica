import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';
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

const eatSound = new Audio('Assets/bubbles.mp3');
const gltfLoader = new GLTFLoader();

let started = false;
let mindarThree;
let renderer;
let scene;
let camera;
let sceneReady = false;
let currentModel = null;
let anchor;
let isTransitioning = false;

const models = [
  'Assets/cabritaS.glb'
];

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

const setArLayerVisible = (isVisible) => {
  if (!renderer || !renderer.domElement) return;

  renderer.domElement.style.visibility = isVisible ? 'visible' : 'hidden';
};

const clearArFrame = () => {
  if (!renderer) return;

  renderer.clear(true, true, true);
};

const setupScene = () => {
  if (sceneReady) return;

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x7a8ca5, 1.4);
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1, 2, 1.5);
  scene.add(directionalLight);

  anchor = mindarThree.addAnchor(0);

  anchor.onTargetFound = () => {
    uiScanning.style.display = 'none';
    uiDetected.style.display = 'block';
    uiDetected.textContent = 'Target detectado: CABRITA';
    changeButton.style.display = 'block';
    scanEffect.style.display = 'block';
    updateStatus('Target de cabrita detectado.');
  };

  anchor.onTargetLost = () => {
    uiDetected.style.display = 'none';
    uiScanning.style.display = 'block';
    changeButton.style.display = 'none';
    scanEffect.style.display = 'none';
    updateStatus('Buscando imagen objetivo...');
  };

  loadModel(models[0]);
  sceneReady = true;
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

    anchor.group.add(bubble);
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
        anchor.group.remove(particle);
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

const loadModel = (path) => {
  gltfLoader.load(path, (gltf) => {
    currentModel = gltf.scene;

    currentModel.scale.set(1.6, 1.6, 1.6);
    currentModel.position.set(0, -0.6, 0);
    currentModel.rotation.set(0, 0, 0);

    anchor.group.add(currentModel);
  }, undefined, (error) => {
    console.error('Error al cargar el modelo:', error);
    updateStatus('No se pudo cargar el modelo de cabrita.');
  });
};

const stopAR = () => {
  if (!started || !mindarThree || isTransitioning) return;

  isTransitioning = true;
  startButton.disabled = true;
  renderer.setAnimationLoop(null);
  mindarThree.stop();
  started = false;

  if (anchor) {
    anchor.group.visible = false;
  }

  clearArFrame();
  setArLayerVisible(false);

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

const startAR = async () => {
  if (started || isTransitioning) return;

  isTransitioning = true;
  setControlState('starting');
  updateStatus('Solicitando acceso a la camara...');
  uiLoading.style.display = 'grid';
  uiCamera.style.display = 'none';

  try {
    if (!mindarThree) {
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: 'Assets/Targets/targets.mind',
        uiScanning: false,
        uiLoading: false,
        maxTrack: 1,
        filterMinCF: 0.0001,
        filterBeta: 0.01
      });

      ({ renderer, scene, camera } = mindarThree);
      setupScene();
    }

    setArLayerVisible(true);
    await mindarThree.start();

    uiLoading.style.display = 'none';
    uiCamera.style.display = 'none';
    uiScanning.style.display = 'block';
    updateStatus('Buscando imagen objetivo...');
    started = true;
    setControlState('active');

    renderer.setAnimationLoop(() => {
      if (!started) return;

      if (anchor.group.visible) {
        if (uiDetected.style.display !== 'block') {
          anchor.onTargetFound();
        }
      } else if (uiDetected.style.display === 'block') {
        anchor.onTargetLost();
      }

      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error(error);
    updateStatus('No se pudo iniciar. Usa localhost y acepta permisos de camara.');
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
  if (!currentModel) return;

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
