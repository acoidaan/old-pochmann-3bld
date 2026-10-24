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
npm run lint                          # ESLint de todo el repo (config en eslint.config.js)
```

- `run.js` levanta su propio servidor en los puertos 8793 (con generador de scrambles) y 8792 (sin él). Si dejaste un `node server.js` en marcha, páralo antes o choca el puerto.
- En las sesiones en la nube, `.claude/hooks/session-start.sh` instala las dependencias de `tests/` y deja `PLAYWRIGHT_BROWSERS_PATH` apuntando a un Chromium que acepta el Playwright fijado: no hace falta `npx playwright install`.
- En las sesiones en la nube, «offline generator» de `e2e/fridrich.js` falla también sin cambios: es el entorno.

## Cosas fáciles de romper

- **Archivos nuevos del front:** añádelos a `ASSETS` en `build.js`. Así se versionan y el service worker los guarda para usarlos sin conexión. Una página nueva va además en `PAGES` (`build.js`), en `SHELL` y en la ruta de navegación de `sw.js`, y en `rewrites` de `vercel.json`.
- **Datos:** todo vive en `localStorage`. Fridrich usa las claves `cfop:*`, 3BLD usa `op3bld:*` y principiante usa las suyas. Lo que se sincroniza entre dispositivos tiene que entrar en `syncData()` y en `mergeIn()`. Se fusiona por `at`, y lo editado lleva `ed` (gana el más nuevo).
- **Fridrich, tiempos:** los solves completos van en `times` y los de una fase (última capa o solo PLL, `r.m`) en `ltimes`. Los récords, el ranking, la gráfica y el ritmo solo usan `times`. Las notas de cada tiempo van en `r.no`.
- **Cubo inteligente:** 3BLD usa `cube.js`; Fridrich y principiante usan `smartcube.js`. `cubefab.js` es el botón flotante «Conectar cubo» de las tres páginas. Web Bluetooth se corta al cambiar de página, porque cada sección es un documento distinto.
- **Overlay de OBS** (`overlay.html`): tiene datos de ejemplo con `?demo=1&modo=cfop&phase=done&learn=setup|solving|question|answered|result&layout=esquinas|derecha|izquierda&casos=N`. Tiene que caber en 1920×1080.
- **Almacén del servidor:** Redis de Upstash (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) o, si no hay, Vercel Blob. Lo elige `api/_kv.js`.

## Dónde está cada cosa

- **Seguir una secuencia con el cubo** (scramble, setup del entrenador): `follow.js` (`window.CubeFollow`: `makeFollow`, `locate`, `followMove`, `done`), que usan Fridrich y principiante. 3BLD tiene los suyos en `cube.js`.
- **Eventos del cubo:** `smartcube.js` (`onEvent`, `onMove`, `onFacelets`) llama a los `onMove` y `onState(st, at)` de `SmartCube.start({...})` en `fridrich.js` y `principiante.js`. Con el cubo 700 ms quieto pide `REQUEST_FACELETS` para recuperar un giro perdido; `at` es la hora del último giro oído.
- **Final:** solve completo, `stopRun` al quedar `isSolved`; entrenar casos, `trMove`; entrenar cruz, `ctMove` (los dos en `fridrich.js`).
- **No leas `vendor/gan-web-bluetooth-3.0.2.js`:** está minificado en líneas enormes y una sola búsqueda gasta muchísimo. Lo útil: los giros traen `serial` y `localTimestamp` (null si vienen del historial del cubo), y un giro perdido solo se recupera al llegar el siguiente o, en Gen3/Gen4, al llegar un FACELETS más de 500 ms después del último giro.

## Estilos

- `app.css` (las tres páginas) define los tokens en `:root`: fondos `--bg`, `--surface`, `--raise`; texto `--ink`, `--muted`; `--line`; `--accent` (frambuesa, a propósito no es color de pegatina) y `--accent-soft`; `--ok`; pegatinas `--st-U`…`--st-B`; fuentes `--font-display` (Unbounded), `--font-body` (Atkinson Hyperlegible), `--font-mono` (Martian Mono); radio `--r`. Para colores nuevos, usa estas variables.
- El modo oscuro se redefine dos veces (con `prefers-color-scheme` y con `[data-theme="dark"]`): cambia las dos.
- `fridrich.css` lo cargan Fridrich y principiante; `principiante.css`, solo principiante. No definen variables propias.

## Ideas pendientes

- Un apartado «Tiempo practicado»: hoy, la semana, el mes y en total, separado por solves completos, fases, entrenar casos y sesiones, y contando el tiempo real de práctica además del cronometrado.
- Que el Bluetooth no se corte al pasar entre 3BLD, Fridrich y principiante: una página contenedora que mantenga la conexión y cargue cada sección dentro.
