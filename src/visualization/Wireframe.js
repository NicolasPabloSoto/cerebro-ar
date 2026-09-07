// @ts-check
import * as THREE from 'three';
import { BOX_CONFIG } from '../config/box.js';

export class WireframeBox {
  /**
   * @param {THREE.Scene | THREE.Group} parentGroup 
   */
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    const { width, height, depth } = BOX_CONFIG.dimensions;

    // 1. Crear geometría de caja de aristas (EdgesGeometry)
    const boxGeo = new THREE.BoxGeometry(width, height, depth);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    // Material de aristas (Wireframe)
    this.material = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });

    this.mesh = new THREE.LineSegments(edgesGeo, this.material);

    // 2. Crear malla traslúcida de volumen 3D para visibilidad alta en pantalla
    const volumeMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    this.volumeMesh = new THREE.Mesh(boxGeo, volumeMat);
    this.mesh.add(this.volumeMesh);

    // 3. Indicador de cara superior (Top Cap)
    const topCapGeo = new THREE.PlaneGeometry(width * 0.9, depth * 0.9);
    const topCapMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    this.topCap = new THREE.Mesh(topCapGeo, topCapMat);
    this.topCap.position.set(0, height / 2 + 0.001, 0);
    this.topCap.rotation.x = -Math.PI / 2;
    this.mesh.add(this.topCap);

    this.mesh.visible = false;
    this.parentGroup.add(this.mesh);
  }

  /**
   * Actualiza el estado visual del Wireframe
   * @param {boolean} visible 
   * @param {'IDLE' | 'DETECTING' | 'ACQUIRING' | 'CALIBRATED' | 'TRACKING'} [state] 
   */
  update(visible, state) {
    this.mesh.visible = visible;
    if (!visible) return;

    if (state === 'CALIBRATED' || state === 'TRACKING') {
      this.material.color.setHex(0x00ff66); // Verde brillante
      // @ts-ignore
      this.volumeMesh.material.color.setHex(0x00ff66);
      // @ts-ignore
      this.topCap.material.color.setHex(0x00ff66);
    } else {
      this.material.color.setHex(0x00ffcc); // Cian brillante
      // @ts-ignore
      this.volumeMesh.material.color.setHex(0x00ffcc);
      // @ts-ignore
      this.topCap.material.color.setHex(0x00ffcc);
    }
  }

  /**
   * Limpia recursos Three.js
   */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.parentGroup.remove(this.mesh);
    }
  }
}
