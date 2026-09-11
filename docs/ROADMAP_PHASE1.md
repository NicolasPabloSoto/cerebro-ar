# CerebroAR — Roadmap Phase 1

## Principio rector

**MindAR ve. Cerebro interpreta, estabiliza y decide.**

MindAR actúa como sensor/activador de las caras físicas de la caja. No debe convertirse en el ancla permanente del modelo. Cerebro recibe observaciones de las caras, las transforma al espacio común de la caja y mantiene un único `BOX_ANCHOR`.

## Estado actual

- Caja física: `3.6 cm × 12 cm × 3.6 cm`.
- Cinco caras objetivo: `front`, `left`, `right`, `back`, `top`.
- `MindARAdapter` normaliza las poses nativas de MindAR al espacio de Cerebro.
- `BoxSolver` reconstruye la pose de la caja a partir de la cara observada.
- `BoxTracker` suaviza la pose resultante.
- `BOX_ANCHOR` representa la entidad rígida completa.
- `PoseQualityMonitor` comenzó a medir la coherencia temporal de la pose.
- Phase 1 sigue en `maxTrack: 1` para aislar el comportamiento de una cara antes de introducir fusión multi-cara.

## Próximo objetivo: Pose Quality

La confianza del tracker y la calidad de pose son conceptos diferentes.

`evidenceConfidence` responde: **¿MindAR entregó evidencia?**

`poseQuality` responde: **¿la pose entregada es coherente con la historia reciente?**

Primera etapa implementada: monitor observacional. Todavía no bloquea ni corrige el `BOX_ANCHOR`; primero se recopilan datos reales en iPhone.

Siguiente etapa:

1. observar `quality`, continuidad y residual durante aproximación, alejamiento y movimiento lateral;
2. establecer umbrales reales a partir de mediciones;
3. introducir protección del anchor ante saltos o evidencia de mala calidad;
4. incorporar consistencia geométrica cuando `maxTrack` permita observar varias caras;
5. separar claramente calidad de pose, visibilidad y confianza de detección.

## Visualización de la caja: Wireframe + volumen

El wireframe actual sigue siendo un problema pendiente. No asumiremos todavía que la causa es matemática: puede existir un problema de visibilidad/renderizado en móvil.

La siguiente herramienta de diagnóstico visual será un **cubo/volumen semitransparente de las dimensiones reales de la caja**, hijo directo de `BOX_ANCHOR`.

Objetivo:

- comprobar visualmente que `BOX_ANCHOR` realmente se encuentra sobre la caja física;
- validar posición, orientación y profundidad sin depender de líneas finas;
- comparar el volumen virtual con el objeto real;
- determinar si el problema del wireframe es geométrico, de renderizado o simplemente de visibilidad en iOS/WebGL.

El volumen no reemplaza al wireframe: será una segunda capa de diagnóstico.

Orden recomendado:

1. Pose Quality.
2. Cubo/volumen semitransparente de diagnóstico.
3. Revisión del wireframe con evidencia visual.
4. Fusión multi-cara.
5. Calidad geométrica multi-cara.
6. Protección/adaptación dinámica de `BOX_ANCHOR` frente a observaciones malas.

## Regla de arquitectura

No agregar más suavizado, anchors por cara ni lógica reactiva hasta que el diagnóstico demuestre que son necesarios. Cerebro debe ganar responsabilidad mediante **mejor interpretación de evidencia**, no mediante capas arbitrarias de filtros.
