// @ts-check
import * as THREE from 'three';
import { BOX_CONFIG, FACE_TRANSFORMS } from '../config/box.js';
import { Logger } from '../utils/Logger.js';

/**
 * Evidencia de una cara detectada por el adaptador de visión.
 * Todas las poses están expresadas en el espacio de escena compartido por MindAR.
 * @typedef {Object} Observation
 * @property {'front' | 'left' | 'right' | 'back' | 'top'} faceId
 * @property {THREE.Vector3} position
 * @property {THREE.Quaternion} rotation
 * @property {number} confidence
 * @property {number} timestamp
 */

/** @typedef {Object} BoxPoseCandidate
 * @property {string} faceId
 * @property {THREE.Vector3} position
 * @property {THREE.Quaternion} rotation
 * @property {THREE.Matrix4} matrix
 * @property {number} confidence
 */

/** @typedef {Object} BoxPoseResult
 * @property {THREE.Vector3} position
 * @property {THREE.Quaternion} rotation
 * @property {THREE.Matrix4} matrix
 * @property {number} confidence
 * @property {number} candidateCount
 * @property {BoxPoseCandidate[]} validCandidates
 */

export class BoxSolver {
  constructor() {
    this._matSceneToFace = new THREE.Matrix4();
  }

  /**
   * Verifica la ecuación base con una caja sintética para todas las caras.
   * Esto valida nuestras matrices, no la precisión de MindAR.
   */
  verifyMathConventions() {
    const expectedPosition = new THREE.Vector3(0.17, -0.08, -0.75);
    const expectedRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.13, -0.21, 0.07)
    );
    const boxMatrix = new THREE.Matrix4().compose(
      expectedPosition,
      expectedRotation,
      new THREE.Vector3(1, 1, 1)
    );

    let allPassed = true;

    for (const [faceId, transform] of Object.entries(FACE_TRANSFORMS)) {
      const observedFace = new THREE.Matrix4().multiplyMatrices(
        boxMatrix,
        transform.matrix
      );
      const reconstructed = new THREE.Matrix4().multiplyMatrices(
        observedFace,
        transform.inverseMatrix
      );

      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      reconstructed.decompose(position, rotation, scale);

      const positionError = position.distanceTo(expectedPosition);
      const angleError = rotation.angleTo(expectedRotation);
      const passed = positionError < 0.0001 && angleError < 0.0001;
      allPassed = allPassed && passed;

      Logger.addLog(passed ? 'INFO' : 'ERROR', [
        `[BoxSolver] Math ${faceId}: ${passed ? 'OK' : 'FAIL'} | pos ${positionError.toExponential(2)}m | ang ${angleError.toExponential(2)}rad`
      ]);
    }

    return allPassed;
  }

  /** @param {Observation[]} observations @returns {BoxPoseResult | null} */
  solve(observations) {
    if (!observations || observations.length === 0) return null;

    /** @type {BoxPoseCandidate[]} */
    const candidates = [];

    for (const obs of observations) {
      const transform = FACE_TRANSFORMS[obs.faceId];
      if (!transform) continue;

      this._matSceneToFace.compose(
        obs.position,
        obs.rotation,
        new THREE.Vector3(1, 1, 1)
      );

      const matrix = new THREE.Matrix4().multiplyMatrices(
        this._matSceneToFace,
        transform.inverseMatrix
      );

      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, rotation, scale);

      candidates.push({
        faceId: obs.faceId,
        position,
        rotation,
        matrix: matrix.clone(),
        confidence: Math.max(0, Math.min(1, obs.confidence))
      });
    }

    if (candidates.length === 0) return null;

    if (candidates.length === 1) {
      const c = candidates[0];
      return {
        position: c.position.clone(),
        rotation: c.rotation.clone(),
        matrix: c.matrix.clone(),
        confidence: c.confidence,
        candidateCount: 1,
        validCandidates: [c]
      };
    }

    const primary = candidates[0];
    /** @type {BoxPoseCandidate[]} */
    const validCandidates = [primary];

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const posDist = primary.position.distanceTo(candidate.position);
      const angleDist = primary.rotation.angleTo(candidate.rotation);

      if (posDist <= BOX_CONFIG.positionTolerance && angleDist <= BOX_CONFIG.angleTolerance) {
        validCandidates.push(candidate);
      } else {
        Logger.addLog('WARN', [
          `[BoxSolver] Inconsistencia geométrica en ${candidate.faceId}: ${(posDist * 100).toFixed(1)}cm / ${(angleDist * 180 / Math.PI).toFixed(1)}°`
        ]);
      }
    }

    const finalPosition = new THREE.Vector3();
    let totalWeight = 0;

    for (const candidate of validCandidates) {
      finalPosition.addScaledVector(candidate.position, candidate.confidence);
      totalWeight += candidate.confidence;
    }

    if (totalWeight <= 0) return null;
    finalPosition.divideScalar(totalWeight);

    let finalRotation = validCandidates[0].rotation.clone();
    let accumulatedWeight = validCandidates[0].confidence;

    for (let i = 1; i < validCandidates.length; i++) {
      const candidate = validCandidates[i];
      const factor = candidate.confidence / (accumulatedWeight + candidate.confidence);
      finalRotation.slerp(candidate.rotation, factor);
      accumulatedWeight += candidate.confidence;
    }

    return {
      position: finalPosition,
      rotation: finalRotation,
      matrix: new THREE.Matrix4().compose(
        finalPosition,
        finalRotation,
        new THREE.Vector3(1, 1, 1)
      ),
      confidence: totalWeight / validCandidates.length,
      candidateCount: validCandidates.length,
      validCandidates
    };
  }
}
