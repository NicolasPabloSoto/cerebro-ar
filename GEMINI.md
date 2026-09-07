# Reglas de Proyecto y Arquitectura — CerebroAR (WebAR Box Tracking)

Este archivo establece las reglas permanentes, filosofía técnica y directrices arquitectónicas para todo el desarrollo en **CerebroAR**.

---

## 1. Principios Mandatorios del Usuario

1. **Contexto Activo**: Mantener siempre actualizado el contexto del proyecto y del repositorio antes de proponer cambios u opinar.
2. **Resolución Colaborativa**: Resolver cualquier problema o incertidumbre técnica en conjunto si no hay 100% de certeza sobre la efectividad de la solución.
3. **Observabilidad Móvil Total**: El proyecto corre en móviles. Es obligatorio mantener un módulo `Logger.js` (consola visual en pantalla con botón "Copiar Logs") para capturar trazabilidad, FPS, eventos y errores en vivo.

---

## 2. Arquitectura Maestra: El Brain como Sistema Central

> **"MindAR no sabe qué es nuestra caja. El Brain sí."**

- **`BOX_ANCHOR` es el origen único**: El modelo 3D pertenece a la caja (`BOX_ANCHOR`), **NUNCA** a los anchors individuales de cada cara en MindAR.
- **Las 5 Caras son Sensores**: `front`, `left`, `right`, `back`, `top` son observaciones/evidencia visual, no pivotes permanentes.
- **Desacoplamiento Total de Visión**: MindAR es un adaptador de visión intercambiable (`MindARAdapter`). Si en el futuro se utiliza WebXR, ARKit/ARCore u 8thWall, **solo cambia el adaptador**.

### Contrato del `VisionAdapter`
El adaptador debe absorber:
1. Conversión del sistema de coordenadas al estándar de Three.js.
2. Normalización de escala a metros físicos.
3. Orientación de normales de los planos target.
4. Normalización de confianza a una escala continua $[0.0, 1.0]$.
5. Emisión del contrato genérico: `Observation { faceId, position, rotation, confidence, timestamp }`.

---

## 3. Matemática del `BoxSolver` y Paso 0 Obligatorio

- **Fórmula Conceptual**: $M_{\text{cam} \to \text{box}} = M_{\text{cam} \to \text{face}_i} \cdot (M_{\text{box} \to \text{face}_i})^{-1}$
- Dimensiones físicas exactas: $W = 0.036\,\text{m}$, $H = 0.120\,\text{m}$, $D = 0.036\,\text{m}$ ($3.6\text{ cm} \times 12.0\text{ cm} \times 3.6\text{ cm}$).
- **Paso 0 de Implementación**: Antes de conectar la cámara en tiempo real, es **obligatorio** ejecutar un test sintético con matrices conocidas en Three.js para verificar numéricamente:
  - El orden de multiplicación (`copy().multiply()`).
  - Orientación de ejes de la cara respecto al volumen.
  - Que la pose del centro de la caja se reconstruya numéricamente sin inversión de ejes.

---

## 4. Orquestación del Brain y Máquina de Estados

Estados de la experiencia WebAR:
- `IDLE` $\to$ `DETECTING` $\to$ `ACQUIRING` $\to$ `CALIBRATED` $\to$ `TRACKING`

- **Adquisición**: `ACQUIRING` muestra el *wireframe* 3D de la caja calculada.
- **Ventana de Adquisición**: Los 2-3 segundos son una ventana dinámica de acumulación de evidencia matemática y estabilidad, **NUNCA un `setTimeout` ciego**.
- **Calibración**: Al superar el umbral de confianza ($>85-90\%$), pasa a `CALIBRATED`, el wireframe se torna verde, desaparece y se presenta el modelo 3D sobre `BOX_ANCHOR`.

---

## 5. Tracking, Filtros y Filosofía

- **Estimación Robusta, Filtrada y Continua**: Nunca prometer "alineación perfecta garantizada". El sistema aplica filtros temporales (LERP en posición, SLERP en cuaterniones) para lograr estabilidad fluida.
- **No Congelar $XYZ$**: El sistema actualiza `BOX_ANCHOR` en tiempo real cuando el teléfono o la caja se mueven.
- **Filosofía "Menos es Más"**: JavaScript vanila + ES Modules + JSDoc (`@ts-check`) + Three.js + MindAR. Cero bundlers pesados, cero dependencias innecesarias.
