// @ts-check
import * as THREE from 'three';
import { Logger } from '../utils/Logger.js';

/**
 * @typedef {import('../brain/BoxSolver.js').Observation} Observation
 */

/**
 * Adaptador de visión de CerebroAR.
 *
 * MindAR sigue siendo únicamente el proveedor de evidencia visual.
 * Este módulo traduce el estado de sus anchors al contrato Observation[]
 * que consume el Brain. No decide la pose de la caja.
 */
export class MindARAdapter {
  /**
   * @param {Object} options
   * @param {any} options.mindThree - Instancia de MindARThree.
   * @param {Object<number, 'front' | 'left' | 'right' | 'back' | 'top'>} options.targetFaceMap
   */
  constructor({ mindThree, targetFaceMap }) {
    this.mindThree = mindThree;
    this.targetFaceMap = targetFaceMap;
    /** @type {Map<string, { anchor: any, faceId: 'front' | 'left' | 'right' | 'back' | 'top', isVisible: boolean, confidence: number }>} */
    this.trackedTargets = new Map();

    this.setupAnchors();
  }

  setupAnchors() {
    if (!this.mindThree) return;

    Object.entries(this.targetFaceMap).forEach(([indexStr, faceId]) => {
      const index = parseInt(indexStr, 10);
      const anchor = this.mindThree.addAnchor(index);

      const targetData = {
        anchor,
        faceId,
        isVisible: false,
        // Fase 1: la confianza visual es un marcador de evidencia, no una
        // falsa probabilidad matemática. La calidad temporal la resolverá Brain/Tracker.
        confidence: 1
      };

      this.trackedTargets.set(faceId, targetData);

      anchor.onTargetFound = () => {
        targetData.isVisible = true;
        Logger.addLog('INFO', [`[Vision] Cara detectada: ${faceId.toUpperCase()} (Target: ${index})`]);
      };

      anchor.onTargetLost = () => {
        targetData.isVisible = false;
        targetData.confidence = 0;
        Logger.addLog('WARN', [`[Vision] Cara perdida: ${faceId.toUpperCase()}`]);
      };
    });
  }

  async start() {
    if (!this.mindThree) return;

    Logger.addLog('INFO', ['[MindARAdapter] Iniciando MindAR y cargando targets.mind...']);
    try {
      await this.mindThree.start();
      Logger.addLog('INFO', ['[MindARAdapter] Cámara activa y MindAR en ejecución.']);
    } catch (err) {
      Logger.addLog('ERROR', [`[MindARAdapter] Error en MindAR start: ${err ? err.message || String(err) : 'desconocido'}`]);
      throw err;
    }
  }

  /**
   * Devuelve exclusivamente evidencia de visión.
   * Las coordenadas del anchor de MindAR se expresan en el espacio de la escena
   * que comparte la cámara de MindAR; no se debe reinterpretar aquí la geometría
   * física de la caja.
   *
   * @param {number} timestamp
   * @returns {Observation[]}
   */
  getObservations(timestamp) {
    /** @type {Observation[]} */
    const observations = [];

    for (const [faceId, target] of this.trackedTargets.entries()) {
      if (!target.isVisible || !target.anchor || !target.anchor.group) continue;

      const group = target.anchor.group;
      group.updateMatrixWorld(true);

      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      group.matrixWorld.decompose(position, rotation, scale);

      // Escala de MindAR no forma parte de Observation. La caja física tiene
      // una única escala conocida y BOX_ANCHOR será quien la represente.
      observations.push({
        faceId,
        position,
        rotation,
        confidence: target.confidence,
        timestamp
      });
    }

    return observations;
  }
}
