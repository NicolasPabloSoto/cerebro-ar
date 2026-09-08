// @ts-check
import * as THREE from 'three';

/**
 * Configuración geométrica rígida de la caja (CerebroAR).
 *
 * Las dimensiones físicas NO se alteran: 3.6 cm x 12.0 cm x 3.6 cm.
 * MindAR, en cambio, trabaja en unidades normalizadas donde el ancho del
 * target equivale a 1 unidad. Por eso mantenemos ambas escalas explícitas.
 */
export const BOX_CONFIG = {
  dimensions: {
    width: 0.036,  // 3.6 cm (Eje X)
    height: 0.120, // 12.0 cm (Eje Y)
    depth: 0.036   // 3.6 cm (Eje Z)
  },
  // El target de cada cara tiene físicamente 3.6 cm de ancho.
  targetWidthMeters: 0.036,
  // Conversión: 1 unidad MindAR = 3.6 cm físicos.
  sceneUnitsPerMeter: 1 / 0.036,
  positionTolerance: 0.30,
  angleTolerance: 0.35
};

const sceneScale = BOX_CONFIG.sceneUnitsPerMeter;
const halfW = (BOX_CONFIG.dimensions.width * sceneScale) / 2;
const halfH = (BOX_CONFIG.dimensions.height * sceneScale) / 2;
const halfD = (BOX_CONFIG.dimensions.depth * sceneScale) / 2;

/**
 * Matriz M_box_to_face en las unidades normalizadas de MindAR.
 * El centro de cada target coincide con el centro geométrico de su cara.
 *
 * FRONT: +Z
 * BACK:  -Z
 * LEFT:  -X
 * RIGHT: +X
 * TOP:   +Y
 */
export const FACE_TRANSFORMS = {
  front: createTransformMatrix(0, 0, halfD, 0, 0, 0),
  back: createTransformMatrix(0, 0, -halfD, 0, Math.PI, 0),
  left: createTransformMatrix(-halfW, 0, 0, 0, -Math.PI / 2, 0),
  right: createTransformMatrix(halfW, 0, 0, 0, Math.PI / 2, 0),
  top: createTransformMatrix(0, halfH, 0, -Math.PI / 2, 0, 0)
};

/**
 * Dimensiones de la caja en unidades de escena MindAR.
 * Esto representa exactamente las dimensiones físicas anteriores.
 */
export const BOX_SCENE_DIMENSIONS = {
  width: BOX_CONFIG.dimensions.width * sceneScale,
  height: BOX_CONFIG.dimensions.height * sceneScale,
  depth: BOX_CONFIG.dimensions.depth * sceneScale
};

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 */
function createTransformMatrix(x, y, z, rx, ry, rz) {
  const position = new THREE.Vector3(x, y, z);
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rx, ry, rz, 'XYZ')
  );
  const matrix = new THREE.Matrix4().compose(
    position,
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );

  return {
    position,
    quaternion,
    matrix,
    inverseMatrix: matrix.clone().invert()
  };
}
