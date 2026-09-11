// @ts-check
import * as THREE from 'three';

/**
 * Monitor de calidad de pose de Cerebro.
 *
 * IMPORTANTE:
 * - Esto no pretende medir la calidad de los píxeles de cámara.
 * - Evalúa la coherencia temporal de la pose que MindAR entrega a Cerebro.
 * - No modifica la pose en esta primera etapa: observa y diagnostica.
 *
 * La idea es separar dos conceptos que antes estaban mezclados:
 *   1. evidenceConfidence = qué tanta evidencia entregó el tracker.
 *   2. poseQuality = qué tan coherente es esa pose con la historia reciente.
 */
export class PoseQualityMonitor {
  constructor() {
    /** @type {THREE.Vector3 | null} */
    this.previousPosition = null;
    /** @type {THREE.Vector3 | null} */
    this.previousVelocity = null;
    this.previousTimestamp = 0;

    this.quality = 0;
    this.sampleCount = 0;

    // Umbrales en unidades normalizadas de Cerebro.
    // 1 unidad = ancho físico de la caja = 3.6 cm.
    this.residualGood = 0.04;
    this.residualBad = 0.30;

    this.qualityRise = 0.18;
    this.qualityDecay = 0.12;
  }

  /**
   * @param {import('./BoxSolver.js').BoxPoseResult | null} solverResult
   * @param {number} timestamp
   * @returns {{ quality: number, residual: number, continuity: number, evidence: number, warm: boolean }}
   */
  update(solverResult, timestamp) {
    if (!solverResult || solverResult.candidateCount <= 0) {
      this.quality = THREE.MathUtils.lerp(this.quality, 0, this.qualityDecay);
      this.sampleCount = 0;
      this.previousPosition = null;
      this.previousVelocity = null;
      this.previousTimestamp = timestamp;

      return {
        quality: this.quality,
        residual: 0,
        continuity: 0,
        evidence: 0,
        warm: false
      };
    }

    const position = solverResult.position;
    const evidence = THREE.MathUtils.clamp(solverResult.confidence, 0, 1);

    let continuity = 1;
    let residual = 0;
    let velocity = null;

    if (this.previousPosition && this.previousTimestamp > 0) {
      const dt = Math.max(0.001, (timestamp - this.previousTimestamp) / 1000);
      velocity = position.clone().sub(this.previousPosition).multiplyScalar(1 / dt);

      if (this.previousVelocity) {
        // Predicción simple de movimiento constante. Si la nueva pose se
        // aleja mucho de ella, hay una discontinuidad que merece sospecha.
        const predicted = this.previousPosition.clone()
          .addScaledVector(this.previousVelocity, dt);
        residual = position.distanceTo(predicted);

        continuity = 1 - THREE.MathUtils.clamp(
          (residual - this.residualGood) /
          (this.residualBad - this.residualGood),
          0,
          1
        );
      }
    }

    this.sampleCount += 1;
    const warm = this.sampleCount >= 3;
    const sampleQuality = evidence * continuity;

    if (warm) {
      this.quality = THREE.MathUtils.lerp(
        this.quality,
        sampleQuality,
        this.qualityRise
      );
    } else {
      this.quality = Math.max(this.quality, sampleQuality * 0.75);
    }

    this.previousPosition = position.clone();
    this.previousVelocity = velocity;
    this.previousTimestamp = timestamp;

    return {
      quality: THREE.MathUtils.clamp(this.quality, 0, 1),
      residual,
      continuity,
      evidence,
      warm
    };
  }

  reset() {
    this.previousPosition = null;
    this.previousVelocity = null;
    this.previousTimestamp = 0;
    this.quality = 0;
    this.sampleCount = 0;
  }
}
