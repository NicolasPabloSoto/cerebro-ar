// @ts-check
import * as THREE from 'three';
import { Logger } from './utils/Logger.js';
import { Brain } from './brain/Brain.js';
import { MindARAdapter } from './vision/MindARAdapter.js';
import { WireframeBox } from './visualization/Wireframe.js';

Logger.addLog('INFO', ['=== Inicializando CerebroAR (WebAR Box Tracking) ===']);

// Elementos DOM
const arContainer = document.getElementById('ar-container');
const statusBadge = document.getElementById('brain-status-badge');
const startBtn = document.getElementById('start-ar-btn');

// Mapeo de índices de targets a id de cara
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
let isDirectCameraActive = false;

async function initApp() {
  // 1. Intentar cargar MindARThree dinámicamente
  try {
    // @ts-ignore
    const { MindARThree } = await import('mindar-image-three');
    
    mindThreeInstance = new MindARThree({
      container: arContainer,
      imageTargetSrc: './assets/targets.mind', // Archivo compilado de targets
      maxTrack: 2,
      uiLoading: 'no',  // Desactivar spinner negro nativo de MindAR
      uiScanning: 'no',
      uiError: 'no'
    });

    // Componentes 3D administrados por MindAR
    ({ scene, camera, renderer } = mindThreeInstance);

    // Instanciamos el adaptador desacoplado
    mindARAdapter = new MindARAdapter({
      mindThree: mindThreeInstance,
      targetFaceMap
    });

    Logger.addLog('INFO', ['[MindAR] SDK inicializado correctamente.']);
  } catch (err) {
    Logger.addLog('WARN', [`[MindAR] No se pudo cargar MindARThree (${err.message}). Creando escena de respaldo.`]);
    createFallbackScene();
  }

  if (!scene) createFallbackScene();

  // 2. Crear BOX_ANCHOR único (El origen maestro de la caja)
  boxAnchor = new THREE.Group();
  boxAnchor.name = 'BOX_ANCHOR';
  boxAnchor.matrixAutoUpdate = true; // Habilitado para renderizado Three.js fluido
  scene.add(boxAnchor);

  // Luz ambiental
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  // 3. Crear Wireframe 3D atado a BOX_ANCHOR
  wireframe = new WireframeBox(boxAnchor);

  // 4. Instanciar el Brain (Cerebro Central)
  brain = new Brain(boxAnchor);

  // Event listener para el botón de inicio de cámara
  if (startBtn) {
    startBtn.addEventListener('click', startAR);
  }
}

function createFallbackScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (arContainer && !arContainer.querySelector('canvas')) {
    arContainer.appendChild(renderer.domElement);
  }
}

// Función para iniciar la cámara AR al presionar el botón
async function startAR() {
  if (startBtn) startBtn.style.display = 'none';

  if (mindARAdapter) {
    try {
      Logger.addLog('INFO', ['[Cámara] Solicitando cámara e intentando cargar targets.mind...']);
      await mindARAdapter.start();
      isARStarted = true;
      Logger.addLog('INFO', ['[Cámara] Permisos concedidos y MindAR en ejecución.']);
      
      // Iniciar bucle de renderizado con el renderer de MindAR
      renderer.setAnimationLoop((timestamp) => {
        onRenderFrame(timestamp);
      });
      return;
    } catch (err) {
      Logger.addLog('WARN', ['[MindAR] Falta assets/targets.mind (404). Por favor compila las 5 fotos en assets/targets.mind']);
      Logger.addLog('INFO', ['[Cámara] Activando vista de cámara trasera directa en vivo...']);
    }
  }

  // Respaldo de cámara de video directa si targets.mind no existe aún
  await startDirectCameraVideo();
}

/**
 * Inicia el video de la cámara trasera directamente en HTML5 para iOS/Android
 */
async function startDirectCameraVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // Requerido estrictamente para iOS Safari
    video.setAttribute('autoplay', 'true');
    video.classList.add('ar-camera-fallback');
    video.style.cssText = 'position:absolute; top:0; left:0; width:100vw; height:100vh; object-fit:cover; z-index:0;';
    
    if (arContainer) {
      arContainer.insertBefore(video, arContainer.firstChild);
    }
    
    await video.play();
    isARStarted = true;
    isDirectCameraActive = true;
    Logger.addLog('INFO', ['[Cámara] Video de cámara trasera activo en vivo.']);

    // Configurar cámara Three.js para renderizado sintético sobre video
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }

    // Loop de renderizado Three.js
    requestAnimationFrame(animateFallback);
  } catch (err) {
    Logger.addLog('ERROR', [`[Cámara] Fallo al acceder a cámara trasera: ${err.message}`]);
    isARStarted = true;
    requestAnimationFrame(animateFallback);
  }
}

// Bucle de renderizado AR continuo
function onRenderFrame(timestamp) {
  let observations = [];
  if (mindARAdapter && isARStarted && !isDirectCameraActive) {
    observations = mindARAdapter.getObservations(timestamp);
  } else {
    observations = getSyntheticObservations(timestamp);
  }

  // Procesar frame a través del Brain
  const result = brain.processFrame(observations, timestamp);

  // Actualizar visibilidad y color del Wireframe
  const isWireframeVisible = (result.state === 'ACQUIRING' || result.state === 'CALIBRATED' || result.state === 'TRACKING');
  wireframe.update(isWireframeVisible, result.state);

  // Actualizar Badge de Estado en Pantalla
  updateBadgeUI(result.state);

  // Renderizar escena
  renderer.render(scene, camera);
}

// Bucle de animación de respaldo
function animateFallback(timestamp) {
  onRenderFrame(timestamp);
  requestAnimationFrame(animateFallback);
}

function updateBadgeUI(state) {
  if (!statusBadge) return;
  statusBadge.innerText = `CEREBRO AR | ${state}`;
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

// Ajuste responsivo
window.addEventListener('resize', () => {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});

/**
 * Genera observaciones sintéticas de prueba cuando no hay cámara o targets compilados
 * @param {number} timestamp 
 */
function getSyntheticObservations(timestamp) {
  const t = timestamp / 1000;
  // Simular posición sintética a 0.50m al frente de la cámara
  const posFront = new THREE.Vector3(
    Math.sin(t * 0.8) * 0.03, 
    Math.cos(t * 0.8) * 0.02, 
    -0.50
  );
  const rotFront = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, Math.sin(t * 0.5) * 0.2, 0));

  return [
    {
      faceId: 'front',
      position: posFront,
      rotation: rotFront,
      confidence: 0.92,
      timestamp
    }
  ];
}

// Arrancar inicialización de la app
initApp();
