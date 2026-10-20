# Pruebas

Pruebas de extremo a extremo en un Chromium de verdad ([Playwright](https://playwright.dev)), auditorías de accesibilidad ([axe-core](https://github.com/dequelabs/axe-core)) y las capturas de la documentación. No tocan la web publicada ni el despliegue: Vercel solo instala el `package.json` de la raíz.

## Cómo se ejecutan

Hace falta Node 18 o superior.

```sh
cd tests
npm install
npx playwright install chromium   # solo la primera vez

npm test                  # las 11 suites (unas 275 comprobaciones, ~4 min)
npm test -- smart-cube    # solo las que tienen «smart-cube» en el nombre
npm run audit             # accesibilidad y maquetación
npm run shots             # vuelve a hacer las capturas de docs/img
```

`run.js` construye la web en `../public` con `build.js`, la sirve con una API falsa en dos puertos y lanza cada suite en su propio proceso. Al final dice cuántas comprobaciones han pasado; si algo falla, enseña qué y sale con código 1.

```
✓ e2e/competition-mode.js · 18 comprobaciones · 6 s
✓ e2e/smart-cube.js · 69 comprobaciones · 46 s
…
✓ Todo bien: 11 suites, 276 comprobaciones (4.2 min)
```

Las capturas que hacen las suites (útiles para revisar a ojo) quedan en `tests/shots/`, que no se sube al repo.

## Qué comprueba cada suite

| Suite | Qué cubre |
|:--|:--|
| `e2e/competition-mode.js` | Modo competición: pantalla completa, toda la pantalla como botón, Espacio/F/Esc, gesto de volver en Android, pantalla encendida. |
| `e2e/history-theme-retos.js` | Historial con filtros y «Ver más», tema claro/oscuro, atajo del spoiler, quitar retos (también entre dispositivos sincronizados). |
| `e2e/overlay-obs.js` | La app → obs-websocket (con contraseña) → overlay dentro de «OBS»: vista previa, ventana del overlay, contraseña incorrecta. |
| `e2e/overlay-memo.js` | El memo en el overlay durante la ejecución: solo si es correcto, oculto con `memo=0`, guardado con el resultado. |
| `e2e/overlay-two-windows.js` | Dos ventanas de la app conectadas a la vez: el overlay sigue a la que se está usando, sin parpadeos. |
| `e2e/previews-spoiler-updates.js` | Etiquetas de vista previa (Discord…), enlaces cortos `/r/<id>`, spoiler de Entrenar, pantalla encendida, aviso de versión nueva. |
| `e2e/smart-cube.js` | Cubo inteligente: seguimiento del scramble, el primer giro termina el memo, parada al resolver, análisis de DNF (sin memo, con memo, letra equivocada, memo mal), carreras al parar, resincronización, MAC, navegadores sin Bluetooth, sonido y vibración. |
| `e2e/smart-cube-overlay.js` | El cubo en el overlay: progreso del scramble, cubo en directo, giros y letras, «lo ha comprobado el cubo», motivo del DNF, y los datos de ejemplo. |
| `e2e/smart-cube-practice.js` | Practicar siguiendo el cubo: primero el scramble, cada giro del setup un paso, la cuenta dentro del algoritmo, giros equivocados, volver de otras letras o vistas, la guía por encima, memo resuelto o con error. |
| `e2e/smart-cube-trainer-guide.js` | Entrenar respondiendo con el cubo y la ejecución guiada que avanza sola con el cubo. |
| `e2e/smart-cube-dnf-read.js` | Las letras falladas en un DNF pasan a Entrenar; «Leer el cubo» y «Usar mi cubo como scramble». |
| `a11y/views.js` | axe-core y desbordamiento horizontal en todas las vistas, móvil y escritorio, claro y oscuro. |
| `a11y/smart-cube.js` | Lo mismo con el cubo conectado: seguimiento, informe de DNF y diálogo de la MAC. |
| `a11y/trainer-guide.js` | Lo mismo en Entrenar con el cubo, en Practicar siguiendo el cubo y en la ejecución guiada. |

## Cómo están hechas

- **Sin cubo de verdad.** Las suites del cubo usan el cubo virtual de `cube.js` (`?cubo=virtual`): se comporta como un GAN, incluido que los giros anchos (`l`, `d`) llegan como giros de la cara contraria, y deja hacer trampas útiles para probar (`silent()` gira sin avisar, como cuando el cubo pierde la cuenta).
- **Sin Bluetooth de verdad.** El diálogo de la MAC y los errores de conexión se prueban con un `navigator.bluetooth` falso; la librería real (`vendor/`) sí se carga.
- **Sin servidor de verdad.** `server.js` sirve `public/` y una API en memoria con el mismo contrato que `api/*.js` (retos, sincronización, `/r/<id>`). El puerto 8793 sirve el generador de scrambles (`/cubejs/`) y el 8792 no, para probar el plan B.
- **Sin OBS.** `overlay-obs.js` monta un obs-websocket falso con `ws` y una página que hace de OBS (`fixtures/wrap.html`).
- **Tiempos de verdad en las capturas.** `docs-shots.js` usa el reloj falso de Playwright para que los tiempos parezcan de un intento real.
- **Sin red.** Las fuentes salen de `@fontsource` (servidas en `/fonts/`) y Google Fonts se bloquea.

## Escribir una suite nueva

Copia cualquiera de `e2e/`. El contrato con `run.js` es pequeño:

- Lee `SITE`, `SITE_PLAIN` y `SHOTS` de `require('../env')`.
- Imprime una línea por comprobación (`PASS …` o `FAIL … — detalle`).
- Termina con `page errors: none` (o la lista de errores de la página) y `N failed of M`.
