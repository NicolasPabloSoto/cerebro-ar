// @ts-check
import * as THREE from 'three';
import { Logger } from '../utils/Logger.js';

/**
 * @typedef {import('../brain/BoxSolver.js').Observation} Observation
 */

/**
 * Módulo Adaptador de Visión para MindAR.
 * Su ÚNICA responsabilidad es traducir los eventos/anchors de MindAR al contrato genérico Observation[].
 * Ningún otro módulo conoce MindAR.
 */
export class MindARAdapter {
  /**
   * @param {Object} options
   * @param {any} options.mindThree - Instancia de MindARThree
   * @param {Object<number, 'front' | 'left' | 'right' | 'back' | 'top'>} options.targetFaceMap - Mapeo de targetIndex a faceId
   */
  constructor({ mindThree, targetFaceMap }) {
    this.mindThree = mindThree;
    this.targetFaceMap = targetFaceMap;
    /** @type {Map<string, { anchor: any, faceId: 'front' | 'left' | 'right' | 'back' | 'top', isVisible: boolean, confidence: number }>} */
    this.trackedTargets = new Map();

    this.setupAnchors();
  }

  /**
   * Configura los anchors de MindAR para cada cara registrada
   */
  setupAnchors() {
    if (!this.mindThree) return;

    Object.entries(this.targetFaceMap).forEach(([indexStr, faceId]) => {
      const index = parseInt(indexStr, 10);
      const anchor = this.mindThree.addAnchor(index);

      const targetData = {
        anchor,
        faceId,
        isVisible: false,
        confidence: 0
      };

      this.trackedTargets.set(faceId, targetData);

      // Eventos nativos de MindAR
      anchor.onTargetFound = () => {
        targetData.isVisible = true;
        targetData.confidence = 0.90; // Confianza inicial de detección visual
        Logger.addLog('INFO', [`[Vision] Cara detectada: ${faceId.toUpperCase()} (Target: ${index})`]);
      };

      anchor.onTargetLost = () => {
        targetData.isVisible = false;
        targetData.confidence = 0;
        Logger.addLog('WARN', [`[Vision] Cara perdida: ${faceId.toUpperCase()}`]);
      };
    });
  }

  /**
   * Inicia el motor de MindAR y solicita permisos de cámara.
   */
  async start() {
    if (this.mindThree) {
      Logger.addLog('INFO', ['[MindARAdapter] Iniciando MindAR y cargando targets.mind...']);
      try {
        await this.mindThree.start();
        Logger.addLog('INFO', ['[MindARAdapter] Cámara activa y MindAR en ejecución.']);
      } catch (err) {
        Logger.addLog('WARN', [`[MindARAdapter] Error en MindAR start: ${err ? err.message || String(err) : '404'}`]);
        throw err;
      }
    }
  }

  /**
   * Recolecta las observaciones activas en el frame actual y las entrega en el contrato genérico Observation[]
   * @param {number} timestamp 
   * @returns {Observation[]}
   */
  getObservations(timestamp) {
    /** @type {Observation[]} */
    const observations = [];

    for (const [faceId, target] of this.trackedTargets.entries()) {
      if (target.isVisible && target.anchor && target.anchor.group) {
        const group = target.anchor.group;
        
        // Forzar la actualización del árbol de matrices de Three.js para este frame
        group.updateMatrixWorld(true);

        // Extraer posición y rotación reales de mundo en coordenadas de cámara (en metros sin escalas espurias)
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();

        group.getWorldPosition(position);
        group.getWorldQuaternion(rotation);

        observations.push({
          // @ts-ignore
          faceId,
          position,
          rotation,
          confidence: target.confidence,
          timestamp
        });
      }
    }

    return observations;
  }
}
