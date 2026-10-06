# Cómo trabajar con IA en Iluminate

Este es el punto de entrada humano. Las instrucciones obligatorias para la IA
viven en `.agent/RULES.md`.

## Flujo recomendado

Para cada tarea, indica cuatro cosas cuando sean conocidas:

1. **Resultado:** qué debe quedar resuelto.
2. **Área:** Designer, efectos, partitura, auth, base de datos, sitio público,
   infraestructura, firmware, etc.
3. **Modo:** revisar, diagnosticar, implementar, planificar o desplegar.
4. **Límite:** qué no debe modificarse o qué validación esperas.

Ejemplo:

```text
Implementa selección múltiple en Designer.
Limítate al canvas y la barra contextual; no cambies el modelo eléctrico.
Ejecuta las pruebas del Designer y el build web.
```

No es necesario pedirle a la IA que lea toda la carpeta `.agent`. Debe empezar
por `RULES.md`, clasificar el área y cargar únicamente los contratos indicados
por su matriz de contexto.

## Qué contexto se usa según el área

| Si trabajas en… | Contexto principal |
|---|---|
| Producto o arquitectura | Contexto maestro; plan solo si afecta prioridades. |
| Designer y fabricación | Contrato UX + handoff actual. |
| Rutas, controller o pixelMap | Dirección del Composer + handoff. |
| Efectos y simulación | Modelo de targeting; lifecycle si cambia generación. |
| Partitura y publicación | `docs/partitura-lifecycle.md`. |
| Datos y multitenancy | Modelo de base de datos. |
| Web autenticada | Estándares UI. |
| Sitio público | Dirección del sitio público. |
| Producción o despliegue | Mapa de ejecución + runbook de producción. |
| Firmware/dispositivo | Lifecycle + README del servicio correspondiente. |

La tabla completa y autoritativa está en `.agent/RULES.md`.

## Cuándo se leen `docs/`

Sí conviene leerlos, pero por tarea:

- `docs/partitura-lifecycle.md`: Compile, Generate, publicación y consumo por
  firmware.
- `docs/production-deployment.md`: infraestructura y operación en producción.
- `docs/upgrade.doc`: regresiones, decisiones e historia de la gran actualización
  del Designer; no es lectura rutinaria para cada cambio visual.

Leer todos los documentos en cada sesión aumenta tokens y puede mezclar estado
actual con historia. La IA debe expandir contexto solo cuando exista una duda
concreta.

## Buenas prácticas al dar instrucciones

- Para revisión: usa “solo revisa/comenta; no modifiques”.
- Para diagnóstico: indica si deseas únicamente la causa o también la solución.
- Para implementación: describe el comportamiento observable, no una solución
  técnica prematura si todavía puede descubrirse en el código.
- Para cambios delicados: especifica rutas, datos o servicios fuera de alcance.
- Para despliegues: nombra explícitamente el ambiente y si autorizas mutaciones.
- Pide pruebas proporcionales al riesgo; la IA también debe proponer las mínimas
  necesarias según el mapa de ejecución.

## Generador interno de contratos

`services/web/iluminate-prompt-builder` permite escribir un objetivo breve,
habilitar solo los dominios modificables y copiar un prompt completo con rutas,
contexto, guardrails, validaciones y protocolo de ampliación. Todo empieza
protegido por defecto. Consultar su `README.md` para ejecución local.

## Archivos generados

- `BRAIN_MAP.md` es una fotografía compacta de estructura y estado Git.
- `AI_CONTEXT_PACK.md` es un manifiesto compacto, no un paquete para cargar
  automáticamente.
- Se regeneran con `bash .agent/regenerar_contexto.sh` después de cambios
  estructurales grandes o cuando se solicite expresamente.

No deben copiar documentos completos ni convertirse en fuentes de verdad.
