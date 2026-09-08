// @ts-check
import * as THREE from 'three';

/** @typedef {import('./BoxSolver.js').BoxPoseResult} BoxPoseResult */

/**
 * Filtro temporal de la pose única de la caja.
 * La confianza proviene exclusivamente del Solver; el Tracker no la infla.
 */
export class BoxTracker {
  constructor() {
    this.currentPosition = new THREE.Vector3();
    this.currentRotation = new THREE.Quaternion();
    this.currentMatrix = new THREE.Matrix4();
    this.confidence = 0;
    this.isInitialized = false;
    this.lerpFactor = 0.25;
    this.confidenceRise = 0.20;
    this.confidenceDecay = 0.08;
  }

  /**
   * @param {BoxPoseResult | null} solverResult
   * @returns {{ position: THREE.Vector3, rotation: THREE.Quaternion, matrix: THREE.Matrix4, confidence: number, isInitialized: boolean, hasPose: boolean }}
   */
  update(solverResult) {
    if (solverResult && solverResult.candidateCount > 0) {
      if (!this.isInitialized) {
        this.currentPosition.copy(solverResult.position);
        this.currentRotation.copy(solverResult.rotation);
        this.confidence = solverResult.confidence;
        this.isInitialized = true;
      } else {
        this.currentPosition.lerp(solverResult.position, this.lerpFactor);
        this.currentRotation.slerp(solverResult.rotation, this.lerpFactor);
        this.confidence = THREE.MathUtils.lerp(
          this.confidence,
          solverResult.confidence,
          this.confidenceRise
        );
      }
    } else {
      this.confidence = Math.max(0, this.confidence - this.confidenceDecay);
      if (this.confidence <= 0) this.isInitialized = false;
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
      confidence: this.confidence,
      isInitialized: this.isInitialized,
      hasPose: this.isInitialized
    };
  }

  reset() {
    this.confidence = 0;
    this.isInitialized = false;
  }
}
