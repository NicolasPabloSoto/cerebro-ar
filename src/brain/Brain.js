// @ts-check
import * as THREE from 'three';
import { BoxSolver } from './BoxSolver.js';
import { BoxTracker } from './BoxTracker.js';
import { PoseQualityMonitor } from './PoseQualityMonitor.js';
import { Logger } from '../utils/Logger.js';

/** @typedef {'IDLE' | 'DETECTING' | 'ACQUIRING' | 'CALIBRATED' | 'TRACKING'} BrainState */

export class Brain {
  /** @param {THREE.Group} boxAnchorGroup */
  constructor(boxAnchorGroup) {
    this.boxAnchor = boxAnchorGroup;
    this.solver = new BoxSolver();
    this.tracker = new BoxTracker();
    this.poseQualityMonitor = new PoseQualityMonitor();
    /** @type {BrainState} */
    this.state = 'IDLE';
    this.calibrationThreshold = 0.75;
    this.isMathVerified = this.solver.verifyMathConventions();
    this.lastPoseLogAt = 0;
    this.lastRawPosition = null;
    this.lastTrackedPosition = null;
  }

  /**
   * Procesa un frame completo: observaciones -> pose de caja -> filtro -> calidad -> BOX_ANCHOR.
   *
   * En esta primera implementación poseQuality es observacional: todavía no
   * bloquea ni corrige el anchor. Primero medimos su comportamiento real en
   iPhone antes de darle autoridad para intervenir en el tracking.
   *
   * @param {import('./BoxSolver.js').Observation[]} observations
   * @param {number} timestamp
   */
  processFrame(observations, timestamp) {
    const solverResult = this.solver.solve(observations);
    const poseQuality = this.poseQualityMonitor.update(solverResult, timestamp);
    const trackedPose = this.tracker.update(solverResult);

    this.updateStateMachine(observations, trackedPose);

    const hasPose = Boolean(solverResult && trackedPose.isInitialized !== false);

    if (hasPose) {
      // BOX_ANCHOR vive en el mismo espacio de escena que las observaciones de MindAR.
      this.boxAnchor.position.copy(trackedPose.position);
      this.boxAnchor.quaternion.copy(trackedPose.rotation);
      this.boxAnchor.scale.set(1, 1, 1);
      this.boxAnchor.updateMatrix();
      this.boxAnchor.updateMatrixWorld(true);

      // Diagnóstico quirúrgico: comparamos la pose cruda entregada por el Solver
      // con la pose que Cerebro realmente aplica al BOX_ANCHOR.
      if (timestamp - this.lastPoseLogAt >= 500) {
        const p = trackedPose.position;
        const raw = solverResult?.position;
        const rawDelta = raw && this.lastRawPosition
          ? raw.distanceTo(this.lastRawPosition)
          : 0;
        const trackedDelta = this.lastTrackedPosition
          ? p.distanceTo(this.lastTrackedPosition)
          : 0;
        const rawToTracked = raw ? raw.distanceTo(p) : 0;

        Logger.addLog('INFO', [
          `[DIAG][CerebroPose] raw=(${raw?.x.toFixed(3) ?? '---'}, ${raw?.y.toFixed(3) ?? '---'}, ${raw?.z.toFixed(3) ?? '---'}) | filtered=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) | rawΔ ${(rawDelta * 3.6).toFixed(1)}cm | filteredΔ ${(trackedDelta * 3.6).toFixed(1)}cm | raw→filtered ${(rawToTracked * 3.6).toFixed(1)}cm | faces ${solverResult?.candidateCount ?? 0}`
        ]);

        Logger.addLog('INFO', [
          `[DIAG][PoseQuality] quality ${(poseQuality.quality * 100).toFixed(0)}% | continuity ${(poseQuality.continuity * 100).toFixed(0)}% | residual ${(poseQuality.residual * 3.6).toFixed(1)}cm | evidence ${(poseQuality.evidence * 100).toFixed(0)}% | warm ${poseQuality.warm ? 'yes' : 'no'}`
        ]);

        Logger.addLog('INFO', [
          `[BOX_ANCHOR] pose scene = (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) | evidence ${(trackedPose.confidence * 100).toFixed(0)}% | poseQuality ${(poseQuality.quality * 100).toFixed(0)}%`
        ]);

        if (raw) this.lastRawPosition = raw.clone();
        this.lastTrackedPosition = p.clone();
        this.lastPoseLogAt = timestamp;
      }
    }

    Logger.updateHUD({
      faces: observations.length,
      confidence: poseQuality.quality,
      state: this.state
    });

    return {
      state: this.state,
      pose: trackedPose,
      solverResult,
      confidence: trackedPose.confidence,
      poseQuality: poseQuality.quality,
      poseQualityDetails: poseQuality,
      hasPose
    };
  }

  /**
   * @param {import('./BoxSolver.js').Observation[]} observations
   * @param {{ confidence: number }} trackedPose
   */
  updateStateMachine(observations, trackedPose) {
    const hasObservations = observations.length > 0;

    switch (this.state) {
      case 'IDLE':
        if (hasObservations) this.setState('DETECTING');
        break;
      case 'DETECTING':
        if (!hasObservations) this.setState('IDLE');
        else this.setState('ACQUIRING');
        break;
      case 'ACQUIRING':
        if (!hasObservations && trackedPose.confidence < 0.1) {
          this.setState('IDLE');
        } else if (trackedPose.confidence >= this.calibrationThreshold) {
          this.setState('CALIBRATED');
        }
        break;
      case 'CALIBRATED':
        this.setState('TRACKING');
        break;
      case 'TRACKING':
        if (trackedPose.confidence < 0.15) {
          Logger.addLog('WARN', ['[Brain] Evidencia insuficiente. Volviendo a adquisición.']);
          this.setState('DETECTING');
        }
        break;
    }
  }

  /** @param {BrainState} newState */
  setState(newState) {
    if (this.state !== newState) {
      Logger.addLog('INFO', [`[Brain] Estado: ${this.state} ──► ${newState}`]);
      this.state = newState;
    }
  }
}
