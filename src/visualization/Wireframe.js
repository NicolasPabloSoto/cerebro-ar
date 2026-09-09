// @ts-check
import * as THREE from 'three';
import { BOX_SCENE_DIMENSIONS } from '../config/box.js';

/**
 * Visualización de diagnóstico de la reconstrucción de la caja.
 * No es un anchor de visión: representa únicamente el BOX_ANCHOR calculado.
 *
 * Se usan "beams" de BoxGeometry en vez de LineSegments para que el grosor
 * sea estable también en WebGL/iOS, donde LineBasicMaterial.linewidth no es
 * fiable.
 */
export class WireframeBox {
  /** @param {THREE.Scene | THREE.Group} parentGroup */
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    const { width, height, depth } = BOX_SCENE_DIMENSIONS;
    const thickness = 0.035;

    this.material = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 1,
      depthWrite: false
    });

    this.mesh = new THREE.Group();
    this.mesh.name = 'CEREBRO_BOX_WIREFRAME';

    const edges = [
      // Verticales
      [0, 0, 0, 0, height, 0],
      [width, 0, 0, width, height, 0],
      [0, 0, depth, 0, height, depth],
      [width, 0, depth, width, height, depth],
      // Inferiores
      [0, 0, 0, width, 0, 0],
      [0, 0, depth, width, 0, depth],
      [0, 0, 0, 0, 0, depth],
      [width, 0, 0, width, 0, depth],
      // Superiores
      [0, height, 0, width, height, 0],
      [0, height, depth, width, height, depth],
      [0, height, 0, 0, height, depth],
      [width, height, 0, width, height, depth]
    ];

    const edgeGroup = new THREE.Group();
    edgeGroup.name = 'CEREBRO_BOX_EDGES';
    const centerOffset = new THREE.Vector3(width / 2, height / 2, depth / 2);

    for (const [x1, y1, z1, x2, y2, z2] of edges) {
      const start = new THREE.Vector3(x1, y1, z1).sub(centerOffset);
      const end = new THREE.Vector3(x2, y2, z2).sub(centerOffset);
      const delta = end.clone().sub(start);
      const length = delta.length();
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(thickness, thickness, length),
        this.material
      );
      beam.position.copy(start).add(end).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        delta.normalize()
      );
      edgeGroup.add(beam);
    }

    this.mesh.add(edgeGroup);

    const volumeGeo = new THREE.BoxGeometry(width, height, depth);
    const volumeMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.volumeMesh = new THREE.Mesh(volumeGeo, volumeMat);
    this.volumeMesh.name = 'CEREBRO_BOX_VOLUME';
    this.mesh.add(this.volumeMesh);

    this.axes = new THREE.AxesHelper(Math.max(width, height, depth) * 0.28);
    this.axes.name = 'CEREBRO_BOX_AXES';
    this.mesh.add(this.axes);

    const centerGeo = new THREE.SphereGeometry(0.06, 16, 12);
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
    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.parentGroup.remove(this.mesh);
  }
}
