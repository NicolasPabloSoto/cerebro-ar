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

let lastViewportSignature = '';
let lastVideoSignature = '';
let lastCanvasSignature = '';
let resizeEventCount = 0;

/**
 * Netlify inyecta su Powered by Netlify dentro de un frame aislado después de
 * cargar nuestra página. El CSS de la app no puede entrar en ese frame.
 *
 * Primera defensa: ocultamos selectores conocidos.
 * Segunda defensa: si Netlify cambia el wrapper/clase, detectamos un iframe
 * fijo pegado a la esquina inferior derecha y lo sacamos de esa zona mediante
 * transform + pointer-events:none. Así no puede tapar los controles de nuestra
 * consola diagnóstica ni interferir con la prueba de viewport.
 */
function manageNetlifyBadge() {
  const knownSelectors = [
    '.nl-badge',
    'iframe.nl-badge',
    '[data-netlify-badge]'
  ];

  let hiddenCount = 0;
  let movedCount = 0;

  for (const selector of knownSelectors) {
    document.querySelectorAll(selector).forEach((element) => {
      const htmlElement = /** @type {HTMLElement} */ (element);
      htmlElement.style.setProperty('display', 'none', 'important');
      htmlElement.style.setProperty('pointer-events', 'none', 'important');
      hiddenCount += 1;
    });
  }

  document.querySelectorAll('iframe').forEach((element) => {
    const iframe = /** @type {HTMLIFrameElement} */ (element);

    if (knownSelectors.some((selector) => iframe.matches(selector))) return;

    const rect = iframe.getBoundingClientRect();
    const style = window.getComputedStyle(iframe);
    const nearBottomRight =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right >= window.innerWidth - 8 &&
      rect.bottom >= window.innerHeight - 8;
    const floating = style.position === 'fixed' || style.position === 'sticky';
    const smallOverlay = rect.width <= 260 && rect.height <= 160;

    if (nearBottomRight && floating && smallOverlay) {
      iframe.style.setProperty('transform', 'translate(-190px, -24px)', 'important');
      iframe.style.setProperty('pointer-events', 'none', 'important');
      iframe.dataset.cerebroNetlifyMoved = 'true';
      movedCount += 1;
    }
  });

  if (hiddenCount || movedCount) {
    Logger.addLog('INFO', [
      `[Netlify] badge protegido: ocultos=${hiddenCount}, desplazados=${movedCount}`
    ]);
  }
}

function installNetlifyBadgeGuard() {
  manageNetlifyBadge();

  const observer = new MutationObserver(() => {
    manageNetlifyBadge();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  let checks = 0;
  const checkTimer = window.setInterval(() => {
    manageNetlifyBadge();
    checks += 1;
    if (checks >= 20) window.clearInterval(checkTimer);
  }, 250);
}

function getElementRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Number(rect.x.toFixed(1)),
    y: Number(rect.y.toFixed(1)),
    width: Number(rect.width.toFixed(1)),
    height: Number(rect.height.toFixed(1))
  };
}

function getViewportDiagnostics() {
  const video = mindThreeInstance?.video;
  const canvas = renderer?.domElement;
  const visualViewportData = window.visualViewport
    ? {
        width: Number(window.visualViewport.width.toFixed(1)),
        height: Number(window.visualViewport.height.toFixed(1)),
        offsetLeft: Number(window.visualViewport.offsetLeft.toFixed(1)),
        offsetTop: Number(window.visualViewport.offsetTop.toFixed(1)),
        scale: Number(window.visualViewport.scale.toFixed(3))
      }
    : null;

  return {
    window: `${window.innerWidth}x${window.innerHeight}`,
    visualViewport: visualViewportData,
    container: getElementRect(arContainer),
    video: video
      ? {
          attr: `${video.width}x${video.height}`,
          css: `${video.style.width || 'auto'}x${video.style.height || 'auto'}`,
          rect: getElementRect(video)
        }
      : null,
    canvas: canvas
      ? {
          css: `${canvas.style.width || 'auto'}x${canvas.style.height || 'auto'}`,
          rect: getElementRect(canvas)
        }
      : null
  };
}

function logViewportDiagnostics(reason) {
  const d = getViewportDiagnostics();
  const viewportSignature = JSON.stringify({
    window: d.window,
    visualViewport: d.visualViewport,
    container: d.container
  });
  const videoSignature = JSON.stringify(d.video);
  const canvasSignature = JSON.stringify(d.canvas);

  if (viewportSignature !== lastViewportSignature) {
    lastViewportSignature = viewportSignature;
    Logger.addLog('INFO', [
      `[DIAG][Viewport] ${reason} | window=${d.window} | visualViewport=${JSON.stringify(d.visualViewport)} | container=${JSON.stringify(d.container)}`
    ]);
  }

  if (videoSignature !== lastVideoSignature) {
    lastVideoSignature = videoSignature;
    Logger.addLog('INFO', [
      `[DIAG][Video] ${reason} | ${JSON.stringify(d.video)}`
    ]);
  }

  if (canvasSignature !== lastCanvasSignature) {
    lastCanvasSignature = canvasSignature;
    Logger.addLog('INFO', [
      `[DIAG][Canvas] ${reason} | ${JSON.stringify(d.canvas)}`
    ]);
  }
}

function installViewportDiagnostics() {
  window.addEventListener('resize', () => {
    resizeEventCount += 1;
    Logger.addLog('WARN', [`[DIAG][Resize] window resize #${resizeEventCount}`]);
    requestAnimationFrame(() => logViewportDiagnostics('after window.resize'));
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      Logger.addLog('WARN', ['[DIAG][VisualViewport] resize']);
      requestAnimationFrame(() => logViewportDiagnostics('after visualViewport.resize'));
    });

    window.visualViewport.addEventListener('scroll', () => {
      Logger.addLog('WARN', ['[DIAG][VisualViewport] scroll/offset change']);
      requestAnimationFrame(() => logViewportDiagnostics('after visualViewport.scroll'));
    });
  }
}

async function initApp() {
  installNetlifyBadgeGuard();
  installViewportDiagnostics();

  try {
    // @ts-ignore
    const { MindARThree } = await import('mindar-image-three');

    mindThreeInstance = new MindARThree({
      container: arContainer,
      imageTargetSrc: './assets/targets.mind',
      maxTrack: 1,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no'
    });

    ({ scene, camera, renderer } = mindThreeInstance);

    mindARAdapter = new MindARAdapter({
      mindThree: mindThreeInstance,
      targetFaceMap
    });

    Logger.addLog('INFO', ['[MindAR] SDK inicializado. PHASE 1 = single-target.']);
    logViewportDiagnostics('after MindAR init');
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
    Logger.addLog('ERROR', ['[CerebroAR] MindAR no está disponible. Prueba detenida.']);
    return;
  }

  if (startBtn) startBtn.style.display = 'none';

  try {
    Logger.addLog('INFO', ['[Cámara] Iniciando MindAR con assets/targets.mind...']);
    await mindARAdapter.start();
    isARStarted = true;
    Logger.addLog('INFO', ['[Cámara] MindAR activo. Esperando evidencia real de las caras.']);
    logViewportDiagnostics('after MindAR start');
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

  wireframe.update(Boolean(result.hasPose), result.state);
  updateBadgeUI(result.state, observations.length, result);
  renderer.render(scene, camera);
}

function updateBadgeUI(state, observationCount = 0, result = null) {
  if (!statusBadge) return;
  const poseQuality = result?.poseQuality ?? 0;
  statusBadge.innerText = `CEREBRO AR | ${state} | CARAS ${observationCount} | QUALITY ${(poseQuality * 100).toFixed(0)}%`;

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

initApp();
