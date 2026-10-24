# Notas para Claude Code

App web de cubo de Rubik de Aco: 3BLD con Old Pochmann (`/`), Fridrich reducido (`/fridrich`) y método de principiantes (`/principiante`). Publicada en https://old-pochmann-3bld.vercel.app. El README explica qué hace cada parte y la arquitectura; `tests/README.md`, las pruebas. Aquí va lo que no está ahí.

## Forma de trabajar

- Habla con Aco en español. Los textos de la app, en español de España; los comentarios del código, en inglés.
- Cada push a `main` despliega solo en Vercel. Antes de subir, pasa las suites que toque (ver abajo). Después, comprueba que el despliegue queda `READY`.
- Commits en español: un título corto y un cuerpo que explique el qué y el porqué.
- Un cambio visible lleva su comprobación en una suite de `tests/e2e/` (y una línea en la tabla de `tests/README.md` si es una suite nueva). Mira también el móvil (Pixel 7): nada de scroll horizontal.
- Sin frameworks ni empaquetador. HTML, CSS y JS a mano.

## Construir y probar

```sh
node build.js                         # genera public/
cd tests && npm install               # la primera vez (+ npx playwright install chromium)
node run.js fridrich                  # solo las suites con «fridrich» en el nombre
npm test                              # todas (~8 min)
npm run audit                         # axe-core y desbordamientos
```

- `run.js` levanta su propio servidor en los puertos 8793 (con generador de scrambles) y 8792 (sin él). Si dejaste un `node server.js` en marcha, páralo antes o choca el puerto.
- `smart-cube-trainer-guide.js` falla a veces en «reopened mid-solve» y pasa al repetir. Es intermitente, no es una regresión.

## Cosas fáciles de romper

- **Archivos nuevos del front:** añádelos a `ASSETS` en `build.js`. Así se versionan y el service worker los guarda para usarlos sin conexión. Una página nueva va además en `PAGES` (`build.js`), en `SHELL` y en la ruta de navegación de `sw.js`, y en `rewrites` de `vercel.json`.
- **Datos:** todo vive en `localStorage`. Fridrich usa las claves `cfop:*`, 3BLD usa `op3bld:*` y principiante usa las suyas. Lo que se sincroniza entre dispositivos tiene que entrar en `syncData()` y en `mergeIn()`. Se fusiona por `at`, y lo editado lleva `ed` (gana el más nuevo).
- **Fridrich, tiempos:** los solves completos van en `times` y los de una fase (última capa o solo PLL, `r.m`) en `ltimes`. Los récords, el ranking, la gráfica y el ritmo solo usan `times`. Las notas de cada tiempo van en `r.no`.
- **Cubo inteligente:** 3BLD usa `cube.js`; Fridrich y principiante usan `smartcube.js`. `cubefab.js` es el botón flotante «Conectar cubo» de las tres páginas. Web Bluetooth se corta al cambiar de página, porque cada sección es un documento distinto.
- **Overlay de OBS** (`overlay.html`): tiene datos de ejemplo con `?demo=1&modo=cfop&phase=done&learn=setup|solving|question|answered|result&layout=esquinas|derecha|izquierda&casos=N`. Tiene que caber en 1920×1080.
- **Almacén del servidor:** Redis de Upstash (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) o, si no hay, Vercel Blob. Lo elige `api/_kv.js`.

## Ideas pendientes

- Un apartado «Tiempo practicado»: hoy, la semana, el mes y en total, separado por solves completos, fases, entrenar casos y sesiones, y contando el tiempo real de práctica además del cronometrado.
- Que el Bluetooth no se corte al pasar entre 3BLD, Fridrich y principiante: una página contenedora que mantenga la conexión y cargue cada sección dentro.
