// @ts-check
import * as THREE from 'three';
import { BoxSolver } from './BoxSolver.js';
import { BoxTracker } from './BoxTracker.js';
import { Logger } from '../utils/Logger.js';

/**
 * @typedef {'IDLE' | 'DETECTING' | 'ACQUIRING' | 'CALIBRATED' | 'TRACKING'} BrainState
 */

export class Brain {
  /**
   * @param {THREE.Group} boxAnchorGroup - El grupo 3D de Three.js que representa el BOX_ANCHOR único
   */
  constructor(boxAnchorGroup) {
    this.boxAnchor = boxAnchorGroup;
    this.solver = new BoxSolver();
    this.tracker = new BoxTracker();

    /** @type {BrainState} */
    this.state = 'IDLE';

    // Umbral de confianza para completar la calibración (75%)
    this.calibrationThreshold = 0.75;

    // Ejecutar verificación numérica de matrices (Paso 0)
    this.isMathVerified = this.solver.verifyMathConventions();
  }

  /**
   * Bucle de procesamiento principal por frame del Brain
   * @param {import('./BoxSolver.js').Observation[]} observations 
   * @param {number} timestamp 
   */
  processFrame(observations, timestamp) {
    // 1. Resolver hipótesis de pose en el frame actual
    const solverResult = this.solver.solve(observations);

    // 2. Estabilizar pose con filtrado temporal
    const trackedPose = this.tracker.update(solverResult);

    // 3. Transición de la máquina de estados
    this.updateStateMachine(observations, trackedPose);

    // 4. Actualizar el BOX_ANCHOR único en Three.js si tenemos confianza válida
    if (this.state === 'ACQUIRING' || this.state === 'CALIBRATED' || this.state === 'TRACKING') {
      this.boxAnchor.position.copy(trackedPose.position);
      this.boxAnchor.quaternion.copy(trackedPose.rotation);
      this.boxAnchor.updateMatrix();
      this.boxAnchor.updateMatrixWorld(true);
    }

    // 5. Enviar métricas al HUD móvil
    Logger.updateHUD({
      faces: observations.length,
      confidence: trackedPose.confidence,
      state: this.state
    });

    return {
      state: this.state,
      pose: trackedPose,
      solverResult
    };
  }

  /**
   * Máquina de estados del Brain
   * @param {import('./BoxSolver.js').Observation[]} observations 
   * @param {{ confidence: number }} trackedPose 
   */
  updateStateMachine(observations, trackedPose) {
    const hasObservations = observations.length > 0;

    switch (this.state) {
      case 'IDLE':
        if (hasObservations) {
          this.setState('DETECTING');
        }
        break;

      case 'DETECTING':
        if (!hasObservations) {
          this.setState('IDLE');
        } else {
          this.setState('ACQUIRING');
        }
        break;

      case 'ACQUIRING':
        if (!hasObservations && trackedPose.confidence < 0.1) {
          this.setState('IDLE');
        } else if (trackedPose.confidence >= this.calibrationThreshold) {
          this.setState('CALIBRATED');
        }
        break;

      case 'CALIBRATED':
        // Transición fluida e inmediata a TRACKING continuo
        this.setState('TRACKING');
        break;

      case 'TRACKING':
        if (trackedPose.confidence < 0.15) {
          Logger.addLog('WARN', ['[Brain] Confianza perdida (<15%). Reagrupando visión...']);
          this.setState('DETECTING');
        }
        break;
    }
  }

  /**
   * @param {BrainState} newState 
   */
  setState(newState) {
    if (this.state !== newState) {
      Logger.addLog('INFO', [`[Brain] Estado: ${this.state} ──► ${newState}`]);
      this.state = newState;
    }
  }
}
