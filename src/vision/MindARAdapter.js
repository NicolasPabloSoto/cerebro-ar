// @ts-check
import * as THREE from 'three';
import { Logger } from '../utils/Logger.js';

/** @typedef {import('../brain/BoxSolver.js').Observation} Observation */

/**
 * Adaptador de visión de CerebroAR.
 *
 * MindAR actualiza anchor.group con una matriz en las unidades nativas del
 * tracker. Esas unidades están ligadas al ancho de la imagen objetivo, que
 * puede corresponder a cientos o miles de píxeles en el .mind. Cerebro, en
 * cambio, trabaja con una escena normalizada donde el ancho de la cara = 1.
 *
 * El adaptador es responsable de hacer esa conversión. El resto del sistema
 * nunca debe conocer las unidades nativas de MindAR.
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
    /** @type {Map<string, { anchor: any, faceId: 'front' | 'left' | 'right' | 'back' | 'top', isVisible: boolean, foundAt: number, lastSeenAt: number, markerWidth: number }>} */
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
        lastSeenAt: 0,
        markerWidth: 0
      };

      this.trackedTargets.set(faceId, targetData);

      anchor.onTargetFound = () => {
        targetData.isVisible = true;
        targetData.foundAt = performance.now();
        targetData.lastSeenAt = targetData.foundAt;
        targetData.markerWidth = this.getMarkerWidth(anchor.targetIndex);
        Logger.addLog('INFO', [
          `[Vision] Cara detectada: ${faceId.toUpperCase()} (Target ${index}) | targetWidth ${targetData.markerWidth.toFixed(1)}u`
        ]);
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
   * MindAR conserva la pose en unidades nativas cuyo tamaño corresponde al
   * ancho del target. Convertimos la posición a unidades normalizadas:
   * targetWidth -> 1. La rotación no requiere conversión.
   *
   * @param {THREE.Vector3} nativePosition
   * @param {number} markerWidth
   */
  normalizePosition(nativePosition, markerWidth) {
    if (!Number.isFinite(markerWidth) || markerWidth <= 0) {
      throw new Error(`markerWidth inválido: ${markerWidth}`);
    }

    return nativePosition.clone().multiplyScalar(1 / markerWidth);
  }

  /**
   * @param {number} targetIndex
   * @returns {number}
   */
  getMarkerWidth(targetIndex) {
    const dimensions = this.mindThree?.controller?.markerDimensions?.[targetIndex];
    const markerWidth = dimensions?.[0];
    return Number.isFinite(markerWidth) && markerWidth > 0 ? markerWidth : 0;
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

      const nativePosition = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      group.matrix.decompose(nativePosition, rotation, scale);

      const markerWidth = target.markerWidth || this.getMarkerWidth(target.anchor.targetIndex);
      if (!markerWidth) {
        Logger.addLog('ERROR', [
          `[MindARAdapter] No se pudo obtener targetWidth para ${target.faceId.toUpperCase()}. Observation descartada.`
        ]);
        continue;
      }

      const position = this.normalizePosition(nativePosition, markerWidth);
      target.lastSeenAt = now;

      // Diagnóstico de una sola muestra por detección: permite comprobar la
      // conversión sin inundar el log frame a frame.
      if (target.foundAt === now || Math.abs(now - target.foundAt) < 80) {
        Logger.addLog('INFO', [
          `[MindARAdapter] ${target.faceId.toUpperCase()} native=(${nativePosition.x.toFixed(1)}, ${nativePosition.y.toFixed(1)}, ${nativePosition.z.toFixed(1)}) -> normalized=(${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)}) | width ${markerWidth.toFixed(1)}u`
        ]);
        target.foundAt = -1;
      }

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
