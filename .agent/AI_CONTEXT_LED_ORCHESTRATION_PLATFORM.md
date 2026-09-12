# Contexto maestro para IA — Plataforma de coreografía LED

**Estado:** documento base de producto y arquitectura  
**Fecha:** 18 de agosto de 2026  
**Nombre del producto:** Iluminate  
**Propósito del documento:** permitir que otra IA o desarrollador comprenda rápidamente qué se quiere construir, por qué, cuáles decisiones ya están tomadas y cómo debe evolucionar el sistema.

---

## 1. Instrucciones para la IA que continúe el proyecto

Este documento es la referencia conceptual principal del proyecto. Antes de proponer código o arquitectura:

1. Conservar las decisiones marcadas como **decididas**.
2. No convertir el producto en un editor vectorial general, una copia de WLED ni un sistema de video.
3. No generar un firmware diferente para cada instalación.
4. Mantener separados el **core compilado** y la **partitura actualizable**.
5. Mantener separados el modelo físico de cableado —controlador, cables de datos, strings LED y nodos de fabricación— y el modelo visual —zonas y grupos—. Los segmentos/rangos lógicos no son un flujo normal del operador.
6. Diseñar para profesionales de rótulos, stands y mobiliario comercial; no para consumidores sin conocimientos técnicos.
7. No introducir complejidad futura dentro del MVP, pero evitar decisiones que cierren las extensiones previstas.
8. Cuando se proponga cambiar un concepto establecido, explicar primero qué problema concreto resuelve el cambio.
9. Tratar el firmware ESP32 como un ambiente externo a este repo. Este repo produce, valida, simula y publica partituras; no contiene el proyecto Arduino/PlatformIO/ESP-IDF.
10. Para el composer real, no iniciar desde una matriz visible. El operador debe trabajar sobre SVG/canvas, zonas y rutas LED continuas; el sistema genera el `pixelMap`.
11. Mantener una sola densidad LED por proyecto. Si cambia, se resetea el cableado/rutas existentes.
12. Usar `.agent/PIXELMAP_COMPOSER_DIRECTION.md` y `.agent/EFFECT_TARGETING_MODEL.md` como referencia actual antes de redisenar composer, efectos espaciales o flujos de mapeo.

---

## 2. Resumen ejecutivo

Se quiere construir una plataforma B2B que permita a fabricantes establecidos de rótulos, stands de feria y mobiliario comercial ofrecer iluminación LED direccionable, dinámica, coordinada y administrable remotamente, sin tener que desarrollar electrónica, firmware ni aplicaciones web.

La solución completa tendrá:

- Un controlador propio basado en ESP32.
- Tres salidas físicas de datos para tiras WS2812B.
- Un firmware universal externo con un motor de iluminación y una biblioteca de efectos.
- Una partitura declarativa, separada del firmware, que define cableado físico, pixelMap generado, zonas, grupos, escenas, pistas, clips, efectos seleccionados y temporización.
- Un editor web visual con canvas, reglas, escala, herramientas para dibujar cableado, zonas y grupos, y una timeline estilo CapCut.
- Un simulador que reproduce la partitura sobre una fotografía, render o plano de la instalación.
- Publicación y cambio remoto de partituras y escenas sin recompilar el firmware.
- Administración en la nube de proyectos, controladores, revisiones, despliegues y escena activa.

En lo que concierne a este repositorio, el controlador se abstrae como tres salidas lógicas: `chain.output` 1, 2 y 3. Los pines concretos del ESP32, la librería LED y el toolchain viven en el ambiente local de firmware.

La frase que resume la arquitectura es:

> **El core define qué sabe hacer el controlador; la partitura define qué debe hacer cada instalación.**

La frase que resume el producto es:

> **El aliado construye el rótulo, stand o exhibidor; la plataforma le proporciona el sistema nervioso luminoso.**

---

## 3. Contexto comercial

### 3.1 Cliente objetivo

El cliente directo no será inicialmente la marca ni el consumidor final. Serán aliados profesionales:

- Fabricantes de rótulos establecidos.
- Fabricantes de letras volumétricas.
- Agencias y constructores de stands para ferias.
- Fabricantes de exhibidores y mobiliario de punto de venta.
- Agencias BTL, de activaciones y de *trade marketing*.

Estas empresas ya saben diseñar, fabricar, cablear e instalar. La persona que administra el proyecto suele conocer suficientemente la construcción interna del rótulo o stand. Habrá capacitación específica para usar el sistema.

### 3.2 División de responsabilidades

| Actividad | Aliado fabricante | Plataforma/proveedor tecnológico |
| --- | ---: | ---: |
| Conseguir y atender al cliente final | Sí | No |
| Diseñar el rótulo, stand o mueble | Sí | No |
| Fabricar e instalar | Sí | No |
| Cableado, fuentes y terminación física | Sí | No |
| Soporte de primera línea al cliente final | Sí | No |
| Controlador y firmware | No | Sí |
| Editor, simulador y nube | No | Sí |
| Configuración y coreografía | Compartido/self-service | Sí, como plataforma |
| Soporte tecnológico de segundo nivel | No | Sí |

El aliado incorpora la solución a su catálogo, define su precio al cliente y añade su margen. El proveedor tecnológico cobra al aliado por controlador, configuración, servicios y, posteriormente, administración en la nube o nuevas campañas.

### 3.3 Lo que no se quiere hacer

- Competir en el mercado saturado de rótulos sencillos con tiras LED baratas.
- Convertirse en fabricante o instalador de rótulos.
- Atender directamente al cliente final.
- Depender de soporte urgente permanente.
- Basar el margen principal en la reventa de tiras, que son mercancía fácilmente comparable.
- Construir una operación crítica en tiempo real: si la nube se cae, la instalación debe continuar funcionando localmente.

### 3.4 Foso competitivo

Ninguna pieza aislada constituye el foso. El foso es la integración de:

- Conocimiento de rótulos e iluminación física.
- Electrónica y controlador propio.
- Firmware ESP32.
- Biblioteca de efectos probados.
- Motor de coreografía sincronizada.
- Editor visual especializado.
- Simulación.
- Despliegue remoto seguro.
- Historial y versionado de instalaciones.
- Red de aliados capacitados.
- Base instalada de controladores.

Un rotulista normalmente no conoce controladores ni software; un programador embebido normalmente no conoce el flujo de fabricación; y un desarrollador web normalmente no conoce la electrónica y las limitaciones físicas. El valor está en unir las disciplinas dentro de un proceso comercial utilizable.

---

## 4. Casos de uso

El rótulo es el punto de entrada, no el límite del producto.

- Letras volumétricas con encendido coordinado.
- Logotipos con recorridos de luz.
- Rótulos con narrativas, por ejemplo volcán → explosión → aparición de marca.
- Stands de feria.
- Exhibidores promocionales y mobiliario de punto de venta.
- Vitrinas y showrooms.
- Activaciones de marca mediante sensores o botones.
- Elementos arquitectónicos y decorativos de marca.
- Campañas estacionales: Navidad, 15 de septiembre, lanzamientos o promociones.

Una instalación puede almacenar varias escenas y cambiar entre ellas remotamente, sin sustituir el controlador ni recompilar firmware.

---

## 5. Hardware decidido

### 5.1 Controlador

- Microcontrolador: **ESP32**.
- Protocolo/tira inicial: **WS2812B**.
- Cada controlador posee **tres salidas físicas de datos**.
- En este repo, cada salida se representa como un valor lógico `1`, `2` o `3` en la cadena.
- En el firmware externo, cada salida corresponde a un pin de datos y controla una cadena serial de LEDs.
- Cada cadena puede dividirse en múltiples segmentos lógicos.

```text
Controlador ESP32
├── Cadena 1 → WS2812B serial → LED 0…N
├── Cadena 2 → WS2812B serial → LED 0…N
└── Cadena 3 → WS2812B serial → LED 0…N
```

Una cadena puede estar físicamente cortada y unida mediante cables sin LEDs, pero continúa siendo una sola secuencia de direccionamiento mientras comparta la misma salida de datos.

### 5.2 Restricciones que el software debe contemplar

- Orden serial de los píxeles.
- Dirección de datos.
- Cantidad máxima de LEDs por salida.
- Tasa de actualización dependiente de la longitud de cada cadena.
- Corriente estimada y límite global de brillo.
- Fuentes e inyección de corriente.
- Diferencias de longitud entre las tres salidas.
- Sincronización de las tres cadenas mediante un reloj lógico común.

Los pines exactos, modelo de placa, librería LED y toolchain se documentan en el ambiente externo de firmware. Este repo solo debe conservar los límites que afecten directamente la validación de la partitura, como outputs permitidos, LEDs máximos por salida o brillo máximo seguro.

---

## 6. Modelo de dominio

### 6.1 Jerarquía principal

```text
Proyecto o instalación
├── Controlador
│   ├── Cadena 1
│   │   └── Segmentos
│   ├── Cadena 2
│   │   └── Segmentos
│   └── Cadena 3
│       └── Segmentos
├── Zonas visuales
├── Partituras
│   └── Escenas
│       └── Pistas
│           └── Clips de efecto
└── Revisiones y despliegues
```

### 6.2 Cadena

Una **cadena** representa la secuencia física completa de WS2812B conectada a una salida del controlador.

Propiedades mínimas:

- Identificador.
- Número de salida.
- Cantidad total de LEDs.
- Densidad o separación de LEDs.
- Dirección.
- Recorrido geométrico sobre el canvas.
- Saltos de cable sin LEDs.

### 6.3 Zona

Una **zona** representa un objeto visual perceptible, por ejemplo:

- Letra A.
- Logotipo.
- Volcán.
- Contorno.
- Nombre completo.

A zone is geometry, not a manual string range. It selects every generated pixel
whose physical `x/y` location falls within it. The same pixel may belong to
several zones.

### 6.4 Grupo

Un **grupo** es una composición nombrada de zonas y/u otros grupos, por ejemplo
`letter_A`, `word_CARIBE` o `full_sign`. No crea píxeles ni modifica el
cableado. Se permiten grupos anidados, pero el validador debe impedir ciclos.

### 6.5 Distinción fundamental

- **Cableado/string:** conexión física continua que define dirección y orden serial.
- **Tramo de fabricación:** sección entre dos nodos de una ruta; detalle de construcción.
- **Zona:** geometría visual que selecciona píxeles por posición.
- **Grupo:** composición semántica de zonas/grupos.

Los efectos normales se aplican a zonas o grupos. El motor puede ordenar los
píxeles seleccionados por serial (`serial`) o evaluarlos en coordenadas locales
o globales (`local`, `global`).

### 6.6 Escena

Una **escena** es una coreografía completa reproducible. Ejemplos:

- `normal`
- `navidad`
- `independencia_cr`
- `promocion_producto_x`
- `modo_nocturno`

Una partitura puede almacenar múltiples escenas.

### 6.7 Pista

Una **pista** es una fila del timeline y apunta a un objetivo:

- Zona, como opción normal.
- Segmento, para control específico.
- Cadena completa, para casos avanzados o diagnóstico.
- Instalación completa, para efectos globales.

### 6.8 Clip

Un **clip** es una instancia temporal de un efecto. Contiene:

- Identificador del efecto.
- Objetivo heredado o explícito.
- Tiempo de inicio.
- Duración.
- Parámetros: colores, velocidad, dirección, intensidad, semilla, etc.
- Capa y modo de mezcla.
- Repeticiones.
- Marcadores o dependencias opcionales.

---

## 7. Partitura

La partitura es un documento declarativo. No contiene código C/C++ y no permite descargar código arbitrario al ESP32.

Describe:

- Hardware lógico del proyecto.
- Cadenas.
- Segmentos.
- Zonas.
- Escenas.
- Pistas.
- Clips.
- Efectos seleccionados.
- Parámetros.
- Temporización.
- Relaciones y eventos.
- Escena predeterminada.

Ejemplo conceptual reducido:

```json
{
  "schemaVersion": "1.0",
  "projectId": "volcano_sign",
  "revision": 14,
  "requiredCoreVersion": "1.0.0",
  "defaultScene": "normal",
  "chains": [
    {
      "id": "chain_1",
      "output": 1,
      "pixelCount": 250,
      "segments": [
        {"id": "volcano_s1", "start": 0, "length": 90},
        {"id": "letter_a_s1", "start": 90, "length": 40}
      ]
    }
  ],
  "zones": [
    {"id": "volcano", "segments": ["volcano_s1"]},
    {"id": "letter_a", "segments": ["letter_a_s1"]}
  ],
  "scenes": [
    {
      "id": "normal",
      "loop": true,
      "tracks": [
        {
          "id": "track_volcano",
          "target": {"type": "zone", "id": "volcano"},
          "clips": [
            {
              "id": "clip_eruption",
              "effect": "eruption",
              "startMs": 0,
              "durationMs": 4200,
              "layer": 2,
              "blend": "replace",
              "params": {
                "baseColor": "#FF3300",
                "sparkColor": "#FFFFFF",
                "seed": 18271
              },
              "markers": {
                "explosion": 2800
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### 7.1 Temporización

La partitura debe soportar progresivamente:

- Inicio en tiempo absoluto dentro de la escena.
- Ejecución paralela.
- Desfase entre clips.
- Inicio cuando termina otro clip.
- Inicio en un marcador de otro clip.
- Repetición de clip o escena.
- Activación mediante evento, botón o sensor, posteriormente.

La versión inicial puede resolver casi todo mediante posiciones absolutas en el timeline. Las dependencias y marcadores se añaden después sin cambiar el modelo general.

### 7.2 Distribución de un efecto dentro de una zona

Cuando una zona contiene varios segmentos, un clip puede especificar cómo tratarlos:

- `simultaneous`: mismo efecto en todos al mismo tiempo.
- `sequential`: un segmento después de otro.
- `continuous`: concatenarlos como recorrido virtual.
- `mirror`: invertir determinados segmentos.
- `staggered`: mismo efecto con retraso configurable.

---

## 8. Efectos

### 8.1 Decisión principal

Los algoritmos de efectos son parte del **core compilado** que vive en el ESP32.

Cada efecto puede organizarse como su propio módulo `.cpp/.h`, pero todos deben respetar un contrato común. La partitura únicamente referencia el identificador del efecto y proporciona parámetros.

```cpp
class Effect {
public:
    virtual void initialize(const EffectParams& params) = 0;
    virtual void reset(uint32_t seed) = 0;
    virtual void render(
        const RenderContext& context,
        const TargetView& target,
        PixelLayer& output
    ) = 0;
};
```

### 8.2 Propiedades deseadas

- No usar `delay()`.
- No depender de temporizadores privados descoordinados.
- No realizar asignaciones dinámicas de memoria durante cada cuadro.
- Usar un reloj monotónico compartido.
- Ser determinista siempre que sea posible.
- Aceptar una semilla para efectos aleatorios reproducibles.
- Poder reiniciarse y saltar a un tiempo determinado.
- Declarar parámetros y valores predeterminados.
- Declarar costo o requisitos cuando sea útil.

Idealmente:

> objetivo + tiempo local + parámetros + semilla = colores resultantes.

### 8.3 Cuándo se actualiza el firmware

El firmware se recompila o actualiza por OTA solamente cuando se agrega:

- Un efecto nuevo.
- Un driver o protocolo nuevo.
- Un sensor o tipo de entrada nuevo.
- Un modo de mezcla nuevo.
- Una capacidad estructural del player.
- Una corrección del core.

Cambiar colores, tiempos, orden, zonas, segmentos o escenas no requiere recompilar firmware.

---

## 9. Capas y composición

Una capa no es una tira física. Es un resultado visual temporal producido por un clip antes de enviarlo a los LEDs.

Ejemplo:

- Capa base: respiración azul tenue.
- Capa narrativa: erupción naranja.
- Capa de énfasis: destello blanco.
- Capa final de seguridad: límite de brillo/corriente.

El compositor combina las capas mediante modos como:

- `replace`
- `add`
- `max`
- `multiply`
- `alpha`
- `mask`

Orden conceptual de renderizado:

```text
Clips activos
→ render de cada efecto
→ capas lógicas
→ composición por prioridad
→ brillo y limitación eléctrica
→ mapeo a cadenas físicas
→ transmisión WS2812B
```

El concepto de capas debe existir desde el diseño, aunque el ESP32 implemente optimizaciones para no mantener un buffer completo por cada clip. La implementación debe ser consciente de la memoria disponible y puede usar buffers reutilizables o composición incremental.

---

## 10. Player o motor de reproducción

El **player** es el intérprete especializado que ejecuta la partitura. No interpreta C ni un lenguaje general.

Componentes conceptuales:

1. **Loader:** carga y valida la partitura.
2. **Clock:** mantiene el tiempo monotónico global.
3. **Scene runner:** administra escena activa, bucles e inicio/detención.
4. **Scheduler:** determina qué clips están activos en cada instante.
5. **Target resolver:** convierte zonas y grupos en conjuntos deduplicados de píxeles del pixelMap.
6. **Effect registry:** localiza el algoritmo compilado por su identificador.
7. **Renderer:** ejecuta cada efecto con su tiempo local.
8. **Compositor:** mezcla capas.
9. **Safety limiter:** aplica límites de brillo y corriente.
10. **Output mapper:** distribuye el buffer final entre las tres cadenas.
11. **Driver:** transmite datos WS2812B.
12. **Event bus:** permitirá botones, sensores, marcadores y eventos futuros.

En cada cuadro:

```text
leer reloj global
→ identificar clips activos
→ calcular progreso local
→ resolver objetivos
→ renderizar efectos
→ combinar capas
→ limitar salida
→ escribir las tres cadenas
```

### 10.1 Sincronización

Todos los efectos y las tres salidas deben obedecer el mismo reloj lógico. Esta es la diferencia principal frente a soluciones donde cada segmento ejecuta su efecto de manera independiente.

Caso de aceptación representativo:

1. El volcán inicia una erupción.
2. Al llegar al marcador `explosion`, comienza a revelarse el logotipo.
3. Al terminar el logotipo, se encienden secuencialmente las letras.
4. El contorno conserva una respiración tenue en una capa inferior.
5. La escena vuelve a iniciar sin saltos visibles.

---

## 11. Core frente a configuración actualizable

### 11.1 Vive en el firmware/core externo

- Parser/intérprete.
- Player.
- Scheduler.
- Effect registry.
- Algoritmos de efectos.
- Compositor.
- Drivers de las tres salidas WS2812B.
- Comunicación con la nube.
- Validación básica de seguridad.
- Persistencia local.
- Recuperación y diagnóstico.

El código fuente y build del firmware no viven en este repo. El contrato entre Iluminate y ese ambiente externo es la partitura validada y los contratos de despliegue.

### 11.2 Vive en JSON y es actualizable

- Cantidad de LEDs por cadena.
- Segmentos y rangos.
- Dirección.
- Zonas y su composición.
- Escenas.
- Pistas y clips.
- Efectos seleccionados.
- Colores y demás parámetros.
- Duraciones, orden y desfases.
- Capas y modos de mezcla.
- Escena predeterminada.
- Reglas de repetición.

### 11.3 Estado activo

La escena activa es un estado de dispositivo, no necesariamente parte de una nueva revisión de la partitura.

```json
{
  "desiredScene": "christmas",
  "commandRevision": 27,
  "transition": "fade",
  "transitionDurationMs": 800
}
```

El ESP32 guarda la última escena activa en memoria persistente para recuperarla después de un reinicio.

---

## 12. Qué significa “compilación” en este proyecto

No se pretende construir un compilador comparable con GCC ni inventar un lenguaje de programación completo.

**Compilar** significa validar, normalizar y empaquetar el documento creado en la web para que el ESP32 lo cargue de manera segura y eficiente.

### Primera versión

```text
Editor web → JSON legible → validación → ESP32
```

El ESP32 puede leer el JSON mediante una biblioteca apropiada y construir sus tablas internas.

### Evolución posible

```text
Documento de autoría
→ validación
→ eliminación de datos exclusivos del canvas
→ resolución de referencias
→ archivo compacto JSON/CBOR/binario
→ ESP32
```

Esta transformación no cambia los conceptos. `chain`, `segment`, `zone`, `scene`, `track`, `clip` y `effect` mantienen los mismos identificadores desde la interfaz hasta el core.

El proceso puede comprobar:

- Referencias inexistentes.
- Rangos solapados o fuera de cadena.
- Zonas vacías.
- Efectos no disponibles en la versión del core.
- Ciclos entre dependencias.
- Memoria y cantidad de LEDs.
- Consumo estimado.
- Compatibilidad de versión.

El MVP no necesita un formato binario ni CBOR. Se comienza con JSON versionado.

---

## 13. Editor web

### 13.1 Stack previsto

- Linux y contenedores.
- Next.js.
- React y TypeScript.
- PostgreSQL como base de datos relacional objetivo.
- React Konva para el canvas de autoría.
- Timeline en React/HTML; se puede evaluar `@xzdarcy/react-timeline-editor` para prototipado o construir una capa propia con `interact.js`.
- PixiJS para simulación acelerada cuando Konva deje de ser suficiente.
- Zustand o estado equivalente con patrón de comandos y `undo/redo`.
- Zod como esquema y validación compartida de TypeScript/JSON.
- Almacenamiento S3 compatible, por ejemplo MinIO, para fotografías, renders y otros activos.

### 13.2 Principio de diseño

No construir un editor vectorial general. Construir las herramientas exactas del dominio:

- Cargar imagen, fotografía, render o plano.
- Calibrar escala mediante una distancia conocida.
- Reglas en milímetros o centímetros.
- Zoom, paneo, cuadrícula y snapping.
- Dibujar cadenas como polilíneas.
- Mostrar dirección de datos.
- Representar saltos mediante cables sin LEDs.
- Calcular y dibujar LEDs según longitud y densidad.
- Seleccionar rangos y convertirlos en segmentos.
- Crear zonas y asociar segmentos.
- Simular escenas.

### 13.3 Herramienta Cadena/String

Flujo:

1. Seleccionar una de las tres salidas.
2. Elegir tipo y densidad de tira.
3. Dibujar el recorrido en el orden físico.
4. Marcar saltos sin LEDs si existen.
5. Ver los puntos LED y sus índices.
6. Crear segmentos seleccionando rangos.
7. Asociar segmentos a zonas.

Cada cadena tendrá un color visual distinto en el canvas.

### 13.4 Timeline tipo CapCut

La interfaz debe parecerse conceptualmente a un editor temporal conocido, sin intentar copiar todas sus funciones.

Elementos mínimos:

- Una pestaña o espacio por escena.
- Pistas asignadas normalmente a zonas.
- Posibilidad avanzada de apuntar a segmentos o cadenas.
- Clips de efectos arrastrables.
- Modificación de inicio y duración.
- Cabezal de reproducción.
- Zoom temporal.
- Snapping.
- Copiar/pegar.
- Parámetros del clip.
- Capas y modo de mezcla.
- Loop de escena.

Ejemplo:

```text
Tiempo       0s       1s       2s       3s       4s       5s

Volcán       [──────── ERUPCIÓN ─────────]
Logotipo                       [── REVELAR ─────]
Nombre                                      [BARRIDO →]
Contorno     [──────────── RESPIRACIÓN ─────────────]
```

Cuando se selecciona una zona compuesta, la interfaz puede desplegar sus segmentos para ajustes particulares.

### 13.5 Estado interno y persistencia

El formato principal no debe ser el JSON privado de Konva ni de la librería del timeline. El modelo del dominio es la fuente de verdad.

Las operaciones del editor deberían expresarse como comandos:

- `CreateChain`
- `MoveChainPoint`
- `CreateSegment`
- `ResizeSegment`
- `CreateZone`
- `AssignSegmentToZone`
- `AddClip`
- `MoveClip`
- `ResizeClip`
- `ChangeEffectParameter`

Esto facilita `undo/redo`, autosave, auditoría y pruebas.

---

## 14. Simulador web

El simulador debe interpretar la misma semántica de la partitura que el ESP32.

Objetivos:

- Mostrar el orden de encendido.
- Mostrar colores y brillo aproximado.
- Validar dirección y segmentos.
- Validar coordinación entre efectos.
- Permitir aprobación antes de publicar.

No se requiere inicialmente una simulación fotorealista. La fotografía o render será el fondo y los LEDs se representarán mediante puntos, trazos y halos aproximados.

### 14.1 Paridad con el ESP32

Este es uno de los principales riesgos técnicos. Dos caminos:

1. **MVP:** efectos equivalentes en TypeScript y C++, acompañados de pruebas deterministas y casos dorados.
2. **Objetivo futuro:** aislar el core matemático en C++ portable, compilarlo para ESP32 y también a WebAssembly para el navegador.

No introducir WebAssembly antes de validar el modelo y los primeros efectos.

---

## 15. Nube y despliegue

### 15.1 Principio operativo

La nube es el plano de administración, no el motor de reproducción. El rótulo debe continuar funcionando si pierde Internet.

### 15.2 Operaciones separadas

- **Publicar:** enviar una nueva revisión de la partitura.
- **Activar:** seleccionar una escena ya almacenada.
- **Actualizar firmware:** incorporar nuevas capacidades del core.

No confundir estas operaciones.

### 15.3 Comunicación

Para la primera versión se prefiere que el ESP32 inicie conexiones salientes HTTPS y consulte periódicamente:

- Revisión deseada de partitura.
- Escena deseada.
- Revisión de comando.
- Versión mínima o recomendada del firmware.

Esto evita abrir puertos en la red del cliente. MQTT puede evaluarse después, pero no es necesario para validar el producto.

### 15.4 Calendario

El controlador existente no posee chip de calendario y no debe asumir responsabilidad por campañas estacionales.

- El calendario vive en la web.
- El servidor cambia `desiredScene` en la fecha indicada.
- Si el controlador está desconectado, conserva la escena actual.
- Al reconectarse, consulta el estado deseado y se actualiza.
- El player solo necesita reloj monotónico para reproducir una escena.

### 15.5 Persistencia y recuperación

- Partitura activa almacenada localmente, por ejemplo en LittleFS.
- Última escena activa en NVS u otra memoria persistente apropiada.
- Partitura activa y anterior, esquema A/B.
- Validación antes de activar.
- Checksum y versión.
- Rollback automático si la carga falla.
- Modo de recuperación local mediante punto de acceso o interfaz directa.
- Funcionamiento autónomo sin Internet.

### 15.6 Estado deseado y reportado

La web debe distinguir:

```text
Escena deseada: Navidad
Escena reportada: Normal
Estado: pendiente
Última comunicación: hace 12 minutos
```

Cuando el dispositivo aplique la orden, reportará la revisión procesada y la escena realmente activa.

---

## 16. Seguridad y versionado

Contemplar desde el diseño:

- Identidad única por controlador.
- Autenticación del dispositivo.
- HTTPS.
- Partituras autenticadas o firmadas.
- `schemaVersion`.
- `coreVersion`.
- `requiredCoreVersion`.
- Revisión de proyecto.
- Revisión de despliegue.
- Revisión de comando.
- Registro de quién publicó cada cambio.
- Rollback.
- Separación de permisos entre proveedor, aliado y eventual cliente final.

La aplicación debe poder detectar que una partitura usa un efecto que el firmware instalado todavía no conoce.

---

## 17. Modelo de datos web sugerido

El sistema es multitenant por diseno. La implementacion completa de organizaciones, permisos y roles puede llegar despues, pero el modelo de base de datos debe nacer preparado para multiples clientes.

Regla: toda tabla persistente de negocio debe contemplar `client_id` como campo propietario canonico, alineado con el modelo auth copiado desde `datasyncsa`. El frontend no debe enviar ese valor como autoridad; debe resolverse desde sesion, membresia, credenciales de dispositivo o contexto backend confiable.

PostgreSQL es la base de datos objetivo para auth, proyectos, controladores, revisiones de partitura, despliegues, comandos, estado y metadatos de activos.

Tablas relacionales principales:

```text
organizations
users
organization_members
projects
controllers
controller_credentials
project_revisions
deployments
device_commands
device_status
assets
```

Cada `project_revision` puede almacenar un documento JSONB completo e inmutable. Las columnas relacionales guardan identidad, propiedad, estado y campos usados frecuentemente en búsquedas.

Los controladores/ESP32 tambien deben estar asociados a un cliente/tenant para que el polling de nuevas partituras nunca pueda cruzar datos entre clientes.

Las fotografías, renders y SVG se guardan como objetos externos; PostgreSQL conserva metadatos y referencias.

---

## 18. Organización de código sugerida

```text
services/
  web/
    iluminate/
      app/
      components/
      lib/

  lighting-core/
    api/
    contracts/
    domain/
      chains/
      segments/
      zones/
      scenes/
      tracks/
      clips/
      effects/
      controllers/
      deployments/
    schemas/
    validators/
    storage/
    fixtures/

  auth/
    api/
    contracts/
    domain/
    storage/

  simulator/
    renderer/
    effects/
    compositor/

  device-protocol/
    provisioning/
    deployments/
    commands/
    status/

  firmware/
    README.md        # notas de contrato para el firmware externo
```

`services/lighting-core` debe ser la fuente de verdad del dominio LED y de la partitura. Konva, la timeline y el simulador son vistas y herramientas sobre ese modelo.

---

## 19. IA como fortaleza interna

La IA no forma parte de la propuesta comercial ni debe presentarse como el producto. Puede utilizarse internamente para:

- Interpretar una fotografía o render.
- Proponer zonas y recorridos.
- Convertir una intención del usuario en una primera escena.
- Recomendar efectos y parámetros.
- Generar variantes de una coreografía.
- Detectar inconsistencias.
- Generar instrucciones, diagramas y listas de materiales.
- Ayudar a diagnosticar mediante fotografías, videos o registros.

La IA no debe generar firmware arbitrario por proyecto. Debe trabajar dentro del vocabulario y efectos admitidos por el core. Toda propuesta pasa por el mismo esquema y validador determinista.

---

## 20. MVP técnico

El MVP no es el portal multiempresa completo. Es una demostración vertical de extremo a extremo.

### Debe permitir

1. Cargar una imagen.
2. Calibrar una medida y mostrar reglas.
3. Dibujar hasta tres cadenas.
4. Distribuir visualmente LEDs WS2812B.
5. Crear segmentos.
6. Crear zonas compuestas por segmentos.
7. Construir una escena en una timeline.
8. Usar entre cinco y seis efectos.
9. Simular la escena.
10. Exportar una partitura JSON.
11. Cargarla en el ESP32 sin recompilar firmware.
12. Ejecutarla sincronizadamente en las tres salidas.
13. Publicar una nueva revisión remotamente.
14. Cambiar la escena activa.
15. Volver a la revisión anterior si la nueva falla.

### Efectos iniciales sugeridos

- Color sólido.
- Encendido/apagado o blink.
- Wipe/barrido.
- Pulse/respiración.
- Chase/recorrido.
- Gradiente o efecto narrativo representativo, como `eruption`.

### Prueba decisiva

Un fabricante crea o modifica una escena desde la web, la simula, la publica y el rótulo cambia remotamente sin recompilar ni conectar físicamente el ESP32.

---

## 21. Fases de desarrollo

### Fase 0 — Inventario y decisiones físicas

- Revisar controlador existente.
- Documentar placa, pines, protecciones y alimentación.
- Recuperar código y efectos anteriores.
- Medir límites reales de LEDs y cuadros por segundo.

### Fase 1 — Core mínimo

- Modelo C++ de cadena, segmento, zona, escena, pista y clip.
- Parser JSON.
- Reloj global.
- Scheduler.
- Effect registry.
- Cinco o seis efectos.
- Tres salidas sincronizadas.
- Partitura escrita manualmente.

### Fase 2 — Modelo web y canvas

- Esquema TypeScript/Zod.
- Imagen de fondo.
- Calibración, reglas y escala.
- Herramienta de cadena.
- LEDs calculados.
- Segmentos y zonas.
- Guardado de proyecto.

### Fase 3 — Timeline y simulador

- Escenas, pistas y clips.
- Playback.
- Parámetros de efectos.
- Capas básicas.
- Simulación sobre el canvas.
- Pruebas de equivalencia con el ESP32.

### Fase 4 — Despliegue

- Provisionamiento del controlador.
- API de consulta saliente.
- Versiones.
- Descarga y validación.
- Activación de escenas.
- Estado deseado/reportado.
- Rollback.

### Fase 5 — Producto B2B

- Organizaciones y usuarios.
- Catálogo de controladores.
- Proyectos y plantillas.
- Capacitación de aliados.
- Calendarios en la web.
- Administración de flotas.
- Permisos y auditoría.

### Fase 6 — Asistencia con IA

- Generación asistida de zonas y escenas.
- Recomendaciones.
- Validaciones inteligentes.
- Variantes estacionales.
- Diagnóstico asistido.

---

## 22. No objetivos iniciales

- Editor vectorial equivalente a Illustrator.
- Modelado 3D.
- Simulación fotorealista.
- Colaboración multiusuario en tiempo real.
- Marketplace de efectos.
- Aplicación móvil nativa.
- MQTT como requisito inicial.
- Sincronización entre múltiples controladores físicamente separados.
- Código C/C++ descargable por proyecto.
- Calendario ejecutado dentro del ESP32.
- Generación autónoma de firmware mediante IA.
- Soporte directo al cliente final.

Estos puntos pueden reconsiderarse después de validar instalaciones reales.

---

## 23. Riesgos técnicos principales

1. Diferencias visibles entre simulador web y ejecución física.
2. Consumo de memoria al manejar capas en ESP32.
3. Efectos que no sean deterministas o no respeten el reloj común.
4. Proyectos inválidos por índices, dirección o rangos.
5. Demasiados LEDs en una cadena para la tasa de cuadros deseada.
6. Mala alimentación o instalación atribuida erróneamente al controlador.
7. Intentar crear demasiadas herramientas de edición antes de probar el core.
8. Acoplar el documento del proyecto a Konva o a una librería de timeline.
9. Cambiar el esquema sin estrategia de versiones y migraciones.

---

## 24. Principios de desarrollo

- El modelo de dominio precede a la interfaz.
- El firmware es universal; la partitura es específica.
- El dispositivo funciona sin la nube.
- El servidor administra; el ESP32 reproduce.
- Los efectos comparten reloj y contrato.
- La partitura es declarativa y versionada.
- La interfaz utiliza el mismo vocabulario que el core.
- La simulación y el hardware deben tener pruebas comunes.
- Cada fallo real debe convertirse en validación, restricción, plantilla o diagnóstico.
- No automatizar una suposición no probada con instalaciones reales.

---

## 25. Decisiones abiertas

Antes de codificar en profundidad deben resolverse mediante prototipos o inspección del material existente:

- Framework actual del firmware: Arduino, ESP-IDF u otro.
- Librería de salida LED: FastLED, NeoPixelBus, RMT propio u otra.
- Límites reales por cadena y tasa de cuadros objetivo.
- Memoria disponible para capas y buffers.
- Formato inicial exacto del JSON.
- Si las zonas serán jerárquicas desde el MVP.
- Cómo representar recorridos virtuales continuos entre segmentos.
- Qué modos de mezcla entran en la primera versión.
- Estrategia de paridad TypeScript/C++ y momento apropiado para WebAssembly.
- Método de provisionamiento Wi-Fi y credenciales del dispositivo.
- Política comercial de nube: incluida, anual por controlador o por paquete de campañas.

---

## 26. Criterio rector

El sistema no debe producir “muchos efectos ejecutándose por todo lado”. Debe permitir una interpretación coordinada, deliberada y reproducible de una narrativa luminosa.

> **No se está construyendo un controlador de luces genérico. Se está construyendo un motor y editor de coreografías para instalaciones LED comerciales segmentadas.**
