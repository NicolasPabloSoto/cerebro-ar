// @ts-check
import * as THREE from 'three';
import { Logger } from '../utils/Logger.js';

/** @typedef {import('../brain/BoxSolver.js').Observation} Observation */

/**
 * Adaptador de visión de CerebroAR.
 *
 * MindAR es únicamente el proveedor de evidencia visual. Este adaptador
 * convierte la pose del anchor de cada imagen objetivo al contrato común
 * Observation[] en ESPACIO DE ESCENA.
 */
export class MindARAdapter {
  /**
   * @param {Object} options
   * @param {any} options.mindThree
   * @param {Object<number, 'front' | 'left' | 'right' | 'back' | 'top'>} options.targetFaceMap
   */
  constructor({ mindThree, targetFaceMap }) {
    this.mindThree = mindThree;
    this.targetFaceMap = targetFaceMap;
    /** @type {Map<string, { anchor: any, faceId: 'front' | 'left' | 'right' | 'back' | 'top', isVisible: boolean, foundAt: number, lastSeenAt: number }>} */
    this.trackedTargets = new Map();
    this.setupAnchors();
  }

  setupAnchors() {
    if (!this.mindThree) return;

    Object.entries(this.targetFaceMap).forEach(([indexStr, faceId]) => {
      const index = Number.parseInt(indexStr, 10);
      const anchor = this.mindThree.addAnchor(index);
      const targetData = {
        anchor,
        faceId,
        isVisible: false,
        foundAt: 0,
        lastSeenAt: 0
      };

      this.trackedTargets.set(faceId, targetData);

      anchor.onTargetFound = () => {
        targetData.isVisible = true;
        targetData.foundAt = performance.now();
        targetData.lastSeenAt = targetData.foundAt;
        Logger.addLog('INFO', [`[Vision] Cara detectada: ${faceId.toUpperCase()} (Target ${index})`]);
      };

      anchor.onTargetLost = () => {
        targetData.isVisible = false;
        Logger.addLog('WARN', [`[Vision] Cara perdida: ${faceId.toUpperCase()}`]);
      };
    });
  }

  async start() {
    if (!this.mindThree) return;
    Logger.addLog('INFO', ['[MindARAdapter] Iniciando MindAR y cargando targets.mind...']);
    await this.mindThree.start();
    Logger.addLog('INFO', ['[MindARAdapter] Cámara activa y MindAR en ejecución.']);
  }

  /**
   * @param {number} timestamp
   * @returns {Observation[]}
   */
  getObservations(timestamp) {
    /** @type {Observation[]} */
    const observations = [];
    const now = performance.now();

    for (const target of this.trackedTargets.values()) {
      if (!target.isVisible || !target.anchor?.group) continue;

      const group = target.anchor.group;
      group.updateMatrixWorld(true);

      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      group.matrixWorld.decompose(position, rotation, scale);
      target.lastSeenAt = now;

      // MindAR no expone aquí una probabilidad física de detección. Por tanto
      // Observation no inventa confidence: la evidencia actual es presencia.
      observations.push({
        faceId: target.faceId,
        position,
        rotation,
        confidence: 1,
        timestamp
      });
    }

    return observations;
  }
}
