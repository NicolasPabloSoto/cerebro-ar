# Reglas de Proyecto: WebAR Box Tracking (CerebroAR)

## 1. Principio Fundamental
El modelo 3D pertenece a `BOX_ANCHOR` (el centro de la caja física), no a los anchors de cada cara de MindAR. Las caras son solo observaciones sensoriales de un mismo cuerpo rígido.
- **Dimensiones físicas exactas de la caja**: $W = 0.036\,\text{m}$ ($3.6\,\text{cm}$), $H = 0.120\,\text{m}$ ($12.0\,\text{cm}$), $D = 0.036\,\text{m}$ ($3.6\,\text{cm}$).

## 2. Convención del Adaptador de Visión
MindAR debe ser completamente aislado en `vision/MindARAdapter.js`. Cualquier otro tracker debe poder reemplazarlo simplemente emitiendo el contrato `Observation`:
- `faceId`: 'front' | 'left' | 'right' | 'back' | 'top'
- `position`: THREE.Vector3 en metros (espacio de cámara)
- `rotation`: THREE.Quaternion (espacio de cámara)
- `confidence`: float [0.0, 1.0]
- `timestamp`: DOMHighResTimeStamp

## 3. Verificación de Matrices (Paso 0)
Antes de procesar la cámara, `BoxSolver.js` debe verificar numéricamente su matemática con datos sintéticos:
- Matriz $M_{\text{cam} \to \text{box}} = M_{\text{cam} \to \text{face}} \cdot M_{\text{box} \to \text{face}}^{-1}$.
- Comprobar orden de multiplicación y orientación de cuaterniones de Three.js.

## 4. Observabilidad en Móvil
Es obligatorio incluir la consola visual `utils/Logger.js` con el botón de copiado de logs en pantalla.

## 5. Terminología y Comportamiento del Tracking
- "Estimación robusta, filtrada y continua", sin congelar $XYZ$ artificialmente.
- Máquina de estados del Brain: `IDLE` -> `DETECTING` -> `ACQUIRING` -> `CALIBRATED` -> `TRACKING`.
