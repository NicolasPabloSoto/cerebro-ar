// @ts-check
import * as THREE from 'three';
import { Logger } from '../utils/Logger.js';

/**
 * @typedef {import('./BoxSolver.js').BoxPoseResult} BoxPoseResult
 */

export class BoxTracker {
  constructor() {
    this.currentPosition = new THREE.Vector3();
    this.currentRotation = new THREE.Quaternion();
    this.currentMatrix = new THREE.Matrix4();
    this.confidence = 0;
    this.isInitialized = false;

    // Factor de suavizado (LERP/SLERP) por frame (0.25 = 25% suavizado por frame)
    this.lerpFactor = 0.25;
    // Factor de decaimiento de confianza cuando se pierden observaciones
    this.confidenceDecay = 0.05;
  }

  /**
   * Actualiza el estado del Tracker con el nuevo resultado del BoxSolver
   * @param {BoxPoseResult | null} solverResult 
   * @returns {{ position: THREE.Vector3, rotation: THREE.Quaternion, matrix: THREE.Matrix4, confidence: number }}
   */
  update(solverResult) {
    if (solverResult && solverResult.candidateCount > 0) {
      if (!this.isInitialized) {
        // Primera detección: inicialización directa sin LERP
        this.currentPosition.copy(solverResult.position);
        this.currentRotation.copy(solverResult.rotation);
        this.confidence = solverResult.confidence;
        this.isInitialized = true;
      } else {
        // Filtrado temporal continuo (LERP para posición, SLERP para rotación)
        this.currentPosition.lerp(solverResult.position, this.lerpFactor);
        this.currentRotation.slerp(solverResult.rotation, this.lerpFactor);
        
        // Acumulación gradual de confianza temporal por estabilidad de frames
        const targetConf = Math.min(1.0, solverResult.confidence + 0.10);
        this.confidence = THREE.MathUtils.lerp(this.confidence, targetConf, 0.20);
      }
    } else {
      // Sin observaciones en este frame: la confianza cae paulatinamente
      this.confidence = Math.max(0, this.confidence - this.confidenceDecay);
      if (this.confidence === 0) {
        this.isInitialized = false;
      }
    }

    this.currentMatrix.compose(
      this.currentPosition,
      this.currentRotation,
      new THREE.Vector3(1, 1, 1)
    );

    return {
      position: this.currentPosition,
      rotation: this.currentRotation,
      matrix: this.currentMatrix,
      confidence: this.confidence
    };
  }

  reset() {
    this.confidence = 0;
    this.isInitialized = false;
  }
}
