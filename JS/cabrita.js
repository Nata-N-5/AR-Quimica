import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let container;
let camera;
let scene;
let renderer;
let controller1;
let controller2;
let reticle;
let goatTemplate = null;
let goat = null;
let goatScale = 1.6;
let moveMode = false;

let hitTestSource = null;
let hitTestSourceRequested = false;

const info = document.querySelector('#info');
const arControls = document.querySelector('#ar-controls');
const moveButton = document.querySelector('#move-goat');
const scaleDownButton = document.querySelector('#scale-down');
const scaleUpButton = document.querySelector('#scale-up');
const resetButton = document.querySelector('#reset-goat');
const gltfLoader = new GLTFLoader();

init();

function init() {
  container = document.createElement('div');
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    })
  );

  loadGoat();
  setupControllers();
  setupReticle();
  setupControls();

  window.addEventListener('resize', onWindowResize);
}

function loadGoat() {
  gltfLoader.load('Assets/cabritaS.glb', (gltf) => {
    goatTemplate = gltf.scene;
    goatTemplate.visible = false;

    info.innerHTML = '<strong>Cabrita AR</strong><br />Entra en AR y toca una superficie para poner la cabrita.';
  }, undefined, (error) => {
    console.error('Error al cargar la cabrita:', error);
    info.innerHTML = '<strong>Cabrita AR</strong><br />No se pudo cargar Assets/cabritaS.glb.';
  });
}

function setupControllers() {
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('select', onSelect);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('select', onSelect);
  scene.add(controller2);
}

function setupReticle() {
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xa6ff4d
    })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
}

function setupControls() {
  moveButton.addEventListener('click', () => {
    if (!goat) return;

    moveMode = !moveMode;
    moveButton.classList.toggle('is-active', moveMode);

    info.innerHTML = moveMode
      ? '<strong>Cabrita AR</strong><br />Mueve el celular y toca para fijar la nueva posicion.'
      : '<strong>Cabrita AR</strong><br />La cabrita quedo fija. Puedes moverla o cambiar su tamano.';
  });

  scaleDownButton.addEventListener('click', () => {
    scaleGoat(0.85);
  });

  scaleUpButton.addEventListener('click', () => {
    scaleGoat(1.15);
  });

  resetButton.addEventListener('click', () => {
    if (!goat) return;

    scene.remove(goat);
    goat = null;
    goatScale = 1.6;
    moveMode = false;
    arControls.style.display = 'none';
    moveButton.classList.remove('is-active');
    info.innerHTML = '<strong>Cabrita AR</strong><br />Toca una superficie detectada para poner la cabrita.';
  });
}

function onSelect() {
  if (!reticle.visible || !goatTemplate) return;

  if (!goat) {
    goat = goatTemplate.clone(true);
    goat.visible = true;
    scene.add(goat);
    arControls.style.display = 'grid';
  } else if (!moveMode) {
    return;
  }

  placeGoatAtReticle();
  moveMode = false;
  moveButton.classList.remove('is-active');
  info.innerHTML = '<strong>Cabrita AR</strong><br />La cabrita quedo fija. Puedes moverla o cambiar su tamano.';
}

function placeGoatAtReticle() {
  reticle.matrix.decompose(goat.position, goat.quaternion, goat.scale);
  goat.scale.set(goatScale, goatScale, goatScale);
}

function scaleGoat(multiplier) {
  if (!goat) return;

  goatScale = THREE.MathUtils.clamp(goatScale * multiplier, 0.35, 4);
  goat.scale.set(goatScale, goatScale, goatScale);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(timestamp, frame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace('viewer').then((referenceSpace) => {
        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
          hitTestSource = source;
        });
      });

      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });

      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);

        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }

    if (goat && moveMode && reticle.visible) {
      placeGoatAtReticle();
    }
  }

  renderer.render(scene, camera);
}
