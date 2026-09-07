// @ts-check
import * as THREE from 'three';

/**
 * Configuración geométrica rígida de la caja (CerebroAR)
 * Dimensiones físicas exactas en metros (3.6 cm x 12.0 cm x 3.6 cm)
 */
export const BOX_CONFIG = {
  dimensions: {
    width: 0.036,  // 3.6 cm (Eje X)
    height: 0.120, // 12.0 cm (Eje Y)
    depth: 0.036   // 3.6 cm (Eje Z)
  },
  // Umbral de tolerancia traslacional para considerar candidatos compatibles (en metros)
  positionTolerance: 0.03, // 3 cm
  // Umbral de tolerancia angular (en radianes, ~20 grados)
  angleTolerance: 0.35
};

const halfW = BOX_CONFIG.dimensions.width / 2;  // 0.018 m
const halfH = BOX_CONFIG.dimensions.height / 2; // 0.060 m
const halfD = BOX_CONFIG.dimensions.depth / 2;  // 0.018 m

/**
 * Matriz de transformación local de cada cara con respecto al centro geométrico (0,0,0) de la caja.
 * M_box_to_face: posición y orientación de la cara i dentro del sistema de coordenadas de la caja.
 * 
 * Convención Three.js:
 * - FRONT: superficie en +Z. Normal apuntando a +Z.
 * - BACK: superficie en -Z. Normal apuntando a -Z. Rotación 180° en Y.
 * - LEFT: superficie en -X. Normal apuntando a -X. Rotación -90° en Y.
 * - RIGHT: superficie en +X. Normal apuntando a +X. Rotación +90° en Y.
 * - TOP: superficie en +Y. Normal apuntando a +Y. Rotación -90° en X.
 */
export const FACE_TRANSFORMS = {
  front: createTransformMatrix(0, 0, halfD, 0, 0, 0),
  back: createTransformMatrix(0, 0, -halfD, 0, Math.PI, 0),
  left: createTransformMatrix(-halfW, 0, 0, 0, -Math.PI / 2, 0),
  right: createTransformMatrix(halfW, 0, 0, 0, Math.PI / 2, 0),
  top: createTransformMatrix(0, halfH, 0, -Math.PI / 2, 0, 0)
};

/**
 * Crea una Matrix4 de Three.js a partir de posición (x,y,z) y ángulos Euler (rotX, rotY, rotZ)
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @param {number} rx 
 * @param {number} ry 
 * @param {number} rz 
 * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, matrix: THREE.Matrix4, inverseMatrix: THREE.Matrix4 }}
 */
function createTransformMatrix(x, y, z, rx, ry, rz) {
  const position = new THREE.Vector3(x, y, z);
  const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  const inverseMatrix = matrix.clone().invert();

  return {
    position,
    quaternion,
    matrix,
    inverseMatrix
  };
}
