// @ts-check
import * as THREE from 'three';
import { Logger } from './utils/Logger.js';
import { Brain } from './brain/Brain.js';
import { MindARAdapter } from './vision/MindARAdapter.js';
import { WireframeBox } from './visualization/Wireframe.js';

Logger.addLog('INFO', ['=== Inicializando CerebroAR | PHASE 1 ===']);

const arContainer = document.getElementById('ar-container');
const statusBadge = document.getElementById('brain-status-badge');
const startBtn = document.getElementById('start-ar-btn');

const targetFaceMap = {
  0: 'front',
  1: 'left',
  2: 'right',
  3: 'back',
  4: 'top'
};

let mindARAdapter = null;
let mindThreeInstance = null;
let scene = null;
let camera = null;
let renderer = null;
let boxAnchor = null;
let wireframe = null;
let brain = null;
let isARStarted = false;

async function initApp() {
  try {
    // @ts-ignore
    const { MindARThree } = await import('mindar-image-three');

    mindThreeInstance = new MindARThree({
      container: arContainer,
      imageTargetSrc: './assets/targets.mind',
      maxTrack: 2,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no'
    });

    ({ scene, camera, renderer } = mindThreeInstance);

    mindARAdapter = new MindARAdapter({
      mindThree: mindThreeInstance,
      targetFaceMap
    });

    Logger.addLog('INFO', ['[MindAR] SDK inicializado. Modo REAL solamente.']);
  } catch (err) {
    Logger.addLog('ERROR', [`[MindAR] No se pudo inicializar: ${err?.message || String(err)}`]);
    return;
  }

  boxAnchor = new THREE.Group();
  boxAnchor.name = 'BOX_ANCHOR';
  boxAnchor.matrixAutoUpdate = true;
  scene.add(boxAnchor);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  wireframe = new WireframeBox(boxAnchor);
  brain = new Brain(boxAnchor);

  if (startBtn) startBtn.addEventListener('click', startAR);
}

async function startAR() {
  if (!mindARAdapter || !renderer || !scene || !camera) {
    Logger.addLog('ERROR', ['[CerebroAR] MindAR no está disponible. Se detiene la prueba; no se usa cámara sintética.']);
    return;
  }

  if (startBtn) startBtn.style.display = 'none';

  try {
    Logger.addLog('INFO', ['[Cámara] Iniciando MindAR con assets/targets.mind...']);
    await mindARAdapter.start();
    isARStarted = true;
    Logger.addLog('INFO', ['[Cámara] MindAR activo. Esperando evidencia real de las caras.']);

    renderer.setAnimationLoop((timestamp) => onRenderFrame(timestamp));
  } catch (err) {
    Logger.addLog('ERROR', [
      `[MindAR] No se pudo iniciar el tracking real: ${err?.message || String(err)}`,
      'Phase 1 no continúa con fallback sintético.'
    ]);
    updateBadgeUI('IDLE');
  }
}

function onRenderFrame(timestamp) {
  if (!isARStarted || !mindARAdapter || !brain || !wireframe) return;

  const observations = mindARAdapter.getObservations(timestamp);
  const result = brain.processFrame(observations, timestamp);

  const poseVisible = Boolean(result.hasPose);
  wireframe.update(poseVisible, result.state);
  updateBadgeUI(result.state, observations.length, result);

  renderer.render(scene, camera);
}

function updateBadgeUI(state, observationCount = 0, result = null) {
  if (!statusBadge) return;
  const confidence = result?.confidence ?? 0;
  statusBadge.innerText = `CEREBRO AR | ${state} | CARAS ${observationCount} | CONF ${(confidence * 100).toFixed(0)}%`;

  if (state === 'CALIBRATED' || state === 'TRACKING') {
    statusBadge.style.borderColor = '#00ff66';
    statusBadge.style.color = '#00ff66';
  } else if (state === 'ACQUIRING') {
    statusBadge.style.borderColor = '#00ffcc';
    statusBadge.style.color = '#00ffcc';
  } else {
    statusBadge.style.borderColor = '#ffcc00';
    statusBadge.style.color = '#ffcc00';
  }
}

window.addEventListener('resize', () => {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});

initApp();
