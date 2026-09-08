// @ts-check
import * as THREE from 'three';
import { BOX_CONFIG } from '../config/box.js';

/**
 * Visualización de diagnóstico de la reconstrucción de la caja.
 * No es un anchor de visión: representa únicamente el BOX_ANCHOR calculado.
 */
export class WireframeBox {
  /** @param {THREE.Scene | THREE.Group} parentGroup */
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    const { width, height, depth } = BOX_CONFIG.dimensions;

    const boxGeo = new THREE.BoxGeometry(width, height, depth);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    this.material = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 1
    });

    this.mesh = new THREE.LineSegments(edgesGeo, this.material);
    this.mesh.name = 'CEREBRO_BOX_WIREFRAME';

    const volumeMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.volumeMesh = new THREE.Mesh(boxGeo, volumeMat);
    this.volumeMesh.name = 'CEREBRO_BOX_VOLUME';
    this.mesh.add(this.volumeMesh);

    this.axes = new THREE.AxesHelper(Math.max(width, height, depth) * 0.7);
    this.axes.name = 'CEREBRO_BOX_AXES';
    this.mesh.add(this.axes);

    const centerGeo = new THREE.SphereGeometry(0.0025, 12, 8);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.centerMarker = new THREE.Mesh(centerGeo, centerMat);
    this.centerMarker.name = 'CEREBRO_BOX_CENTER';
    this.mesh.add(this.centerMarker);

    this.mesh.visible = false;
    this.parentGroup.add(this.mesh);
  }

  /**
   * @param {boolean} visible
   * @param {'IDLE' | 'DETECTING' | 'ACQUIRING' | 'CALIBRATED' | 'TRACKING'} [state]
   */
  update(visible, state) {
    this.mesh.visible = visible;
    if (!visible) return;

    const tracking = state === 'CALIBRATED' || state === 'TRACKING';
    const color = tracking ? 0x00ff66 : 0x00ffcc;
    this.material.color.setHex(color);
    this.volumeMesh.material.color.setHex(color);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.volumeMesh.geometry.dispose();
    this.centerMarker.geometry.dispose();
    this.material.dispose();
    this.volumeMesh.material.dispose();
    this.centerMarker.material.dispose();
    this.parentGroup.remove(this.mesh);
  }
}
