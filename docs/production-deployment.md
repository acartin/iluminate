# Producción, despliegue e infraestructura

Este documento describe la infraestructura de producción de Iluminate, cómo se
publican los contenedores y qué partes están operativas o pendientes. Está
escrito como guía humana de operación; no debe contener contraseñas, tokens,
llaves privadas ni valores de secretos.

Última revisión: 2026-09-23.

## Estado actual

| Componente | Estado | Observación |
| --- | --- | --- |
| VM `prd-web-01` | Operativa | Ubuntu, Docker y QEMU Guest Agent activos |
| Cloudflare Tunnel | Operativo | Conector `prd-web-01` en buen estado |
| `https://iluminate.space` | Operativo | Sitio público, validado con HTTP 200 |
| `https://www.iluminate.space` | Operativo | Sirve el mismo contenedor público mediante una segunda ruta del túnel |
| `https://app.iluminate.space` | No publicado | La aplicación todavía usa autenticación provisional |
| PostgreSQL de producción | No desplegado | Se añadirá cuando la aplicación autenticada esté lista |
| Sitio DataSyncSA | No desplegado | Compartirá la VM, con contenedor y ciclo propios |
| Despliegue automático al servidor | Pendiente | La construcción y publicación de imágenes sí está automatizada |

## Arquitectura

```text
Usuario
  -> HTTPS
Cloudflare
  -> DNS proxied
  -> Cloudflare Tunnel (conexiones salientes; sin port forwarding)
cloudflared en prd-web-01
  -> red Docker web-ingress
  -> iluminate-public:3000
```

El proveedor de Internet no permite port forwarding. `cloudflared` inicia las
conexiones hacia Cloudflare desde la VM, por lo que no se abren los puertos 80
ni 443 en el router. Caddy no es necesario en esta arquitectura actual.

PostgreSQL nunca debe publicarse mediante el túnel. SSH y Proxmox tampoco deben
publicarse como aplicaciones abiertas de Cloudflare.

## Inventario

### Proxmox y VM

| Dato | Valor |
| --- | --- |
| Nodo Proxmox | `proxmox` |
| IP de administración observada | `192.168.10.30` |
| VM ID | `108` |
| Nombre de VM y hostname | `prd-web-01` |
| IP de la VM | `192.168.10.33/24` |
| Gateway | `192.168.10.1` |
| CPU | 1 socket, 4 vCPU, tipo `host` |
| Memoria | 8 GB asignados; Ubuntu reporta aproximadamente 7.6 GiB |
| Disco virtual | 80 GB, VirtIO SCSI con IO thread |
| Sistema operativo | Ubuntu 24.04.5 LTS |
| Kernel observado | `6.8.0-142-generic` |
| Alta disponibilidad | Desactivada; existe un solo nodo de ejecución |
| QEMU Guest Agent | Instalado y activo |

La VM tiene un disco virtual de 80 GB, pero el instalador dejó el volumen LVM
raíz en 39 GB. El resto está dentro del volumen físico y debe asignarse al LV y
al filesystem antes de necesitarlo. No asumir que `/` dispone hoy de 80 GB.

La IP `192.168.10.33` está configurada estáticamente en Ubuntu. La concesión
DHCP temporal `192.168.10.100` vista durante la instalación era un lease antiguo
del instalador y no es la dirección activa del servidor.

### Software base

| Software | Versión observada |
| --- | --- |
| Docker Engine | 29.8.1 |
| Docker Compose | 5.5.1 |
| QEMU Guest Agent | Activo |

El usuario administrativo es `acartin`. Tiene acceso por SSH y pertenece a los
grupos `sudo` y `docker`. Ser miembro de `docker` equivale prácticamente a
privilegios de root y debe tratarse como acceso administrativo.

## Dominios

La separación elegida es:

| Dominio | Responsabilidad |
| --- | --- |
| `iluminate.space` | Marca, contenido público, aprendizaje y SEO |
| `www.iluminate.space` | Alias público servido por el mismo contenedor |
| `app.iluminate.space` | Login, registro, recuperación, proyectos, Designer y workspace |
| `share.iluminate.space` | Posible visor público futuro; no existe actualmente |

El Designer forma parte de `app.iluminate.space`; no necesita un subdominio
propio. Una ruta típica será:

```text
https://app.iluminate.space/projects/{id}/workspace
```

Las páginas de login, registro y recuperación también pertenecen a
`app.iluminate.space`. El sitio público solo debe enlazar o redirigir hacia
ellas. No se deben mantener dos implementaciones de login.

### DNS y túnel

La configuración actual del dominio raíz es:

```text
Type:    CNAME
Name:    @
Target:  0d82de4b-9647-4b8e-8973-3b90347c1c79.cfargotunnel.com
Proxy:   Proxied
TTL:     Auto
```

Los registros MX, SPF y DKIM de Cloudflare Email Routing son independientes y
no deben borrarse al modificar las rutas web.

Ruta publicada actual del túnel:

```text
Hostname: iluminate.space
Service:  http://iluminate-public:3000

Hostname: www.iluminate.space
Service:  http://iluminate-public:3000
```

Las dos rutas se administran juntas en Cloudflare Tunnel. El sitio mantiene
`https://iluminate.space` como URL canónica en sus metadatos.

## Repositorio y construcción

Repositorio:

```text
https://github.com/acartin/iluminate
```

Clon de desarrollo utilizado:

```text
Host: ds-dev
Path: /srv/iluminate
```

`main` es la rama de producción. Las ramas de desarrollo no deben desplegarse
directamente.

El workflow se encuentra en:

```text
.github/workflows/publish-images.yml
```

Se ejecuta al hacer push a `main` cuando cambia el workflow, `lighting-core` o
alguna de las dos aplicaciones web. Ejecuta las validaciones definidas en los
Dockerfiles, construye las imágenes y las publica en GHCR.

Imágenes actuales:

```text
ghcr.io/acartin/iluminate-public
ghcr.io/acartin/iluminate-web
```

Cada construcción publica dos tags:

```text
main
sha-{commit completo}
```

`main` sigue la construcción más reciente. El tag `sha-*` es inmutable y debe
usarse cuando se requiera un despliegue reproducible o un rollback exacto.

## Flujo de despliegue

```text
Cambio en el monorepo
  -> commit
  -> push a main
  -> GitHub Actions
  -> pruebas y build de cada Dockerfile
  -> publicación en GHCR
  -> pull manual en prd-web-01
  -> docker compose up -d
  -> validación interna
  -> Cloudflare sirve el contenedor existente
```

Producción no clona el repositorio, no ejecuta `npm install` y no construye
Next.js. Solo descarga imágenes terminadas desde GHCR.

El despliegue al servidor es manual por ahora. Desde `ds-dev` existe un alias
SSH `prd-web-01` con una llave dedicada. La automatización de este último paso
puede añadirse después de estabilizar migraciones, health checks y rollback.

## Organización del servidor

```text
/opt/web/
├── cloudflared/
│   ├── compose.yml
│   └── .env             # token del túnel; modo 600
└── iluminate/
    └── compose.yml      # sitio público actual
```

El archivo fuente del Compose público también se versiona en:

```text
ops/production/iluminate-public.compose.yml
```

Contenedores activos:

| Contenedor | Imagen | Red | Puerto público del host |
| --- | --- | --- | --- |
| `cloudflared` | `cloudflare/cloudflared:latest` | `web-ingress` | Ninguno |
| `iluminate-public` | `ghcr.io/acartin/iluminate-public:main` | `web-ingress` | Ninguno |

`web-ingress` es una red Docker compartida y externa. Cloudflare resuelve los
nombres de contenedor dentro de esta red; no se debe depender de direcciones
Docker `172.x.x.x`, porque son dinámicas.

## Operación cotidiana

### Consultar estado

En `prd-web-01`:

```bash
docker ps
cd /opt/web/iluminate
docker compose ps
docker compose logs --tail=100
```

### Desplegar la versión más reciente del sitio público

```bash
cd /opt/web/iluminate
docker compose pull
docker compose up -d
docker compose ps
```

Después se debe comprobar:

```text
https://iluminate.space
```

Un despliegue exitoso debe devolver HTTP 200 y el contenedor debe permanecer
en estado `Up`.

### Fijar o revertir una versión

Crear `/opt/web/iluminate/.env` con un tag publicado:

```dotenv
ILUMINATE_IMAGE_TAG=sha-{commit completo}
```

Luego:

```bash
cd /opt/web/iluminate
docker compose pull
docker compose up -d
```

Para rollback, sustituir el tag por el SHA de una construcción anterior que
haya finalizado correctamente. No reconstruir código directamente en
producción.

### Actualizar cloudflared

```bash
cd /opt/web/cloudflared
docker compose pull
docker compose up -d
docker compose logs --tail=50 cloudflared
```

El token del túnel vive únicamente en `/opt/web/cloudflared/.env`. Nunca debe
copiarse al repositorio, a un ticket, a documentación ni a una conversación.

## Aplicación autenticada y base de datos

La imagen `iluminate-web` se construye y publica, pero todavía no se ejecuta en
producción. El README de la aplicación confirma que, con
`ILUMINATE_PLACEHOLDER_AUTH=true`, cualquier usuario y contraseña no vacíos
permiten entrar. Por ello no se debe publicar `app.iluminate.space` todavía.

Opciones antes de publicarla:

1. Terminar la autenticación real y configurar cookies seguras; o
2. usar temporalmente Cloudflare Access para restringir todo el subdominio.

Cuando esté lista, el stack previsto dentro de la misma VM será:

```text
cloudflared
├── iluminate-public
└── iluminate-web
      └── postgres (red interna, sin ruta de túnel ni puerto público)
```

PostgreSQL debe ejecutarse en un contenedor separado con volumen persistente.
Los datos nunca deben formar parte de la imagen de la aplicación.

Los cambios de estructura se aplicarán mediante migraciones versionadas:

```text
commit con migración
  -> build de imagen
  -> backup de base de datos
  -> ejecutar migraciones pendientes una sola vez
  -> iniciar la nueva versión de la aplicación
```

No copiar una base de desarrollo completa a producción ni modificar el esquema
de producción manualmente.

## DataSyncSA

El sitio localizado actualmente en:

```text
/srv/datasyncsa/web/datasyncsa
```

podrá alojarse en `prd-web-01`, pero mantendrá:

- su propia imagen;
- su propio Compose bajo `/opt/web/datasyncsa`;
- su propio workflow o proceso de construcción;
- sus propias variables;
- su propia ruta de Cloudflare;
- la red compartida `web-ingress` únicamente para recibir tráfico.

Compartir la VM no significa compartir contenedor, secretos ni ciclo de
despliegue.

## Seguridad y respaldos

- No abrir 80, 443 o PostgreSQL en el router para esta arquitectura.
- No publicar el puerto 22 directamente en Internet.
- Mantener Proxmox accesible solo desde LAN o VPN.
- Guardar secretos solamente en archivos `.env` con modo 600 o en un gestor de
  secretos.
- No incluir credenciales dentro de URLs de Git remotas.
- Revocar inmediatamente cualquier token que aparezca en consola, logs o Git.
- Mantener autenticación SSH por llave para automatización.
- Configurar backups de la VM hacia `Backup-4TB` y verificar restauraciones.
- Cuando exista PostgreSQL, añadir `pg_dump` periódico hacia almacenamiento
  externo a la VM. Un snapshot de VM no sustituye el backup lógico de la base.

## Pendientes recomendados

1. Expandir el volumen lógico raíz de 39 GB para utilizar el disco virtual de
   80 GB.
2. Añadir un health check al sitio público.
3. Fijar producción a tags `sha-*` en vez de depender de `main`.
4. Configurar y probar backups automáticos de Proxmox.
5. Terminar autenticación antes de publicar `app.iluminate.space`.
6. Añadir PostgreSQL, migraciones y backups cuando la app autenticada esté
   lista.
7. Incorporar DataSyncSA con un despliegue independiente.
8. Automatizar el pull y restart solo después de contar con health check y
   rollback probado.
