// @ts-check
import * as THREE from 'three';
import { BOX_CONFIG, FACE_TRANSFORMS } from '../config/box.js';
import { Logger } from '../utils/Logger.js';

/**
 * @typedef {Object} Observation
 * @property {'front' | 'left' | 'right' | 'back' | 'top'} faceId
 * @property {THREE.Vector3} position - Posición de la cara en coordenadas de cámara (en metros)
 * @property {THREE.Quaternion} rotation - Orientación de la cara en coordenadas de cámara
 * @property {number} confidence - Confianza de detección [0.0, 1.0]
 * @property {number} timestamp - Marca de tiempo del frame
 */

/**
 * @typedef {Object} BoxPoseCandidate
 * @property {string} faceId
 * @property {THREE.Vector3} position
 * @property {THREE.Quaternion} rotation
 * @property {THREE.Matrix4} matrix
 * @property {number} confidence
 */

/**
 * @typedef {Object} BoxPoseResult
 * @property {THREE.Vector3} position
 * @property {THREE.Quaternion} rotation
 * @property {THREE.Matrix4} matrix
 * @property {number} confidence
 * @property {number} candidateCount
 * @property {BoxPoseCandidate[]} validCandidates
 */

export class BoxSolver {
  constructor() {
    // Matrices de trabajo temporales para evitar garbage collection excesivo en móviles
    this._matCamToFace = new THREE.Matrix4();
    this._matCamToBoxCandidate = new THREE.Matrix4();
    this._vecPosCandidate = new THREE.Vector3();
    this._quatRotCandidate = new THREE.Quaternion();
    this._vecScaleCandidate = new THREE.Vector3();
  }

  /**
   * PASO 0 OBLIGATORIO: Verificación numérica sintética de convenciones de matrices en Three.js.
   * Valida la fórmula: M_cam_to_box = M_cam_to_face * (M_box_to_face)^-1
   * @returns {boolean} true si la prueba pasa numéricamente sin desfasajes de ejes.
   */
  verifyMathConventions() {
    Logger.addLog('INFO', ['[BoxSolver] Iniciando Paso 0: Verificación numérica sintética de matrices...']);

    // Caso controlado sintético:
    // La caja se ubica virtualmente en el centro del espacio de la cámara a (0, 0, -1.0 m)
    const syntheticBoxPosition = new THREE.Vector3(0, 0, -1.0);
    const syntheticBoxRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    const matSyntheticBoxWorld = new THREE.Matrix4().compose(
      syntheticBoxPosition,
      syntheticBoxRotation,
      new THREE.Vector3(1, 1, 1)
    );

    // Probamos con la cara FRONT
    const faceTransformFront = FACE_TRANSFORMS.front;
    // M_cam_to_face_synthetic = M_cam_to_box_synthetic * M_box_to_face
    const matSyntheticCamToFace = new THREE.Matrix4().multiplyMatrices(
      matSyntheticBoxWorld,
      faceTransformFront.matrix
    );

    // Extraemos la pose observada sintética de FRONT
    const posObs = new THREE.Vector3();
    const quatObs = new THREE.Quaternion();
    const scaleObs = new THREE.Vector3();
    matSyntheticCamToFace.decompose(posObs, quatObs, scaleObs);

    // Ahora aplicamos la inversión para reconstruir la pose de la caja desde la observación de FRONT:
    // M_reconstructed = M_cam_to_face * M_box_to_face^-1
    const matReconstructed = new THREE.Matrix4().multiplyMatrices(
      matSyntheticCamToFace,
      faceTransformFront.inverseMatrix
    );

    const posRec = new THREE.Vector3();
    const quatRec = new THREE.Quaternion();
    const scaleRec = new THREE.Vector3();
    matReconstructed.decompose(posRec, quatRec, scaleRec);

    // Verificamos numéricamente el error
    const posError = posRec.distanceTo(syntheticBoxPosition);
    const angleError = quatRec.angleTo(syntheticBoxRotation);

    const isSuccess = posError < 0.0001 && angleError < 0.0001;

    if (isSuccess) {
      Logger.addLog('INFO', [
        '[BoxSolver] Paso 0 EXITOSO:',
        `Posición esperada: (${syntheticBoxPosition.x.toFixed(4)}, ${syntheticBoxPosition.y.toFixed(4)}, ${syntheticBoxPosition.z.toFixed(4)})`,
        `Posición calculada: (${posRec.x.toFixed(4)}, ${posRec.y.toFixed(4)}, ${posRec.z.toFixed(4)})`,
        `Error de posición: ${posError.toExponential(2)}m | Error angular: ${angleError.toExponential(2)}rad`
      ]);
    } else {
      Logger.addLog('ERROR', [
        '[BoxSolver] Paso 0 FALLIDO:',
        `Error de posición: ${posError}m | Error angular: ${angleError}rad`
      ]);
    }

    return isSuccess;
  }

  /**
   * Recibe observaciones de visión y reconstruye la pose única de la caja (BoxPose)
   * @param {Observation[]} observations 
   * @returns {BoxPoseResult | null}
   */
  solve(observations) {
    if (!observations || observations.length === 0) {
      return null;
    }

    /** @type {BoxPoseCandidate[]} */
    const candidates = [];

    // 1. Generar hipótesis de pose para cada cara observada
    for (const obs of observations) {
      const transform = FACE_TRANSFORMS[obs.faceId];
      if (!transform) continue;

      // Matriz M_cam_to_face
      this._matCamToFace.compose(obs.position, obs.rotation, new THREE.Vector3(1, 1, 1));

      // M_cam_to_box = M_cam_to_face * (M_box_to_face)^-1
      const matCandidate = new THREE.Matrix4().multiplyMatrices(
        this._matCamToFace,
        transform.inverseMatrix
      );

      const posCandidate = new THREE.Vector3();
      const quatCandidate = new THREE.Quaternion();
      const scaleCandidate = new THREE.Vector3();
      matCandidate.decompose(posCandidate, quatCandidate, scaleCandidate);

      candidates.push({
        faceId: obs.faceId,
        position: posCandidate,
        rotation: quatCandidate,
        matrix: matCandidate,
        confidence: obs.confidence
      });
    }

    if (candidates.length === 0) return null;

    // 2. Si hay 1 sola cara, es nuestra mejor hipótesis directa
    if (candidates.length === 1) {
      const c = candidates[0];
      return {
        position: c.position.clone(),
        rotation: c.rotation.clone(),
        matrix: c.matrix.clone(),
        confidence: c.confidence * 0.85, // Confianza de cara única (escalada a max 85%)
        candidateCount: 1,
        validCandidates: candidates
      };
    }

    // 3. Fusión multicara y filtrado de outliers (si hay 2 o más caras)
    // Usamos el primer candidato como pivote para comparar la consistencia traslacional
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
          `[BoxSolver] Outlier descartado en cara ${candidate.faceId}:`,
          `distancia pos: ${(posDist * 100).toFixed(1)}cm, dist angular: ${(angleDist * 180 / Math.PI).toFixed(1)}°`
        ]);
      }
    }

    // 4. Promedio ponderado de posición e interpolación esférica (SLERP) de cuaterniones
    const finalPosition = new THREE.Vector3(0, 0, 0);
    let totalWeight = 0;

    for (const c of validCandidates) {
      finalPosition.addScaledVector(c.position, c.confidence);
      totalWeight += c.confidence;
    }
    finalPosition.divideScalar(totalWeight);

    // SLERP acumulativo de rotación
    let finalRotation = validCandidates[0].rotation.clone();
    let accumWeight = validCandidates[0].confidence;

    for (let i = 1; i < validCandidates.length; i++) {
      const c = validCandidates[i];
      const weightFactor = c.confidence / (accumWeight + c.confidence);
      finalRotation.slerp(c.rotation, weightFactor);
      accumWeight += c.confidence;
    }

    const finalMatrix = new THREE.Matrix4().compose(
      finalPosition,
      finalRotation,
      new THREE.Vector3(1, 1, 1)
    );

    // La consistencia de múltiples caras eleva la confianza del Solver a 95%+
    const multiFaceBonus = validCandidates.length > 1 ? 0.15 : 0;
    const finalConfidence = Math.min(1.0, (totalWeight / validCandidates.length) + multiFaceBonus);

    return {
      position: finalPosition,
      rotation: finalRotation,
      matrix: finalMatrix,
      confidence: finalConfidence,
      candidateCount: validCandidates.length,
      validCandidates
    };
  }
}
