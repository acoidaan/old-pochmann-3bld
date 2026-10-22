# Pruebas

Pruebas de extremo a extremo en un Chromium de verdad ([Playwright](https://playwright.dev)), auditorías de accesibilidad ([axe-core](https://github.com/dequelabs/axe-core)) y las capturas de la documentación. No tocan la web publicada ni el despliegue: Vercel solo instala el `package.json` de la raíz.

## Cómo se ejecutan

Hace falta Node 18 o superior.

```sh
cd tests
npm install
npx playwright install chromium   # solo la primera vez

npm test                  # las 18 suites (unas 550 comprobaciones, ~8 min)
npm test -- smart-cube    # solo las que tienen «smart-cube» en el nombre
npm run audit             # accesibilidad y maquetación
npm run shots             # vuelve a hacer las capturas de docs/img
```

`run.js` construye la web en `../public` con `build.js`, la sirve con una API falsa en dos puertos y lanza cada suite en su propio proceso. Al final dice cuántas comprobaciones han pasado; si algo falla, enseña qué y sale con código 1.

```
✓ e2e/competition-mode.js · 18 comprobaciones · 6 s
✓ e2e/smart-cube.js · 69 comprobaciones · 46 s
…
✓ Todo bien: 18 suites, 546 comprobaciones (7.5 min)
```

Las capturas que hacen las suites (útiles para revisar a ojo) quedan en `tests/shots/`, que no se sube al repo.

## Qué comprueba cada suite

| Suite | Qué cubre |
|:--|:--|
| `e2e/fridrich-extras.js` | Fridrich, lo demás: modo competición (F, Esc, toda la pantalla como botón), la pareja más corta en el F2L (y que de verdad la mete), la reconstrucción (en el panel, copiada y en el historial), el análisis de cada paso (giros contra lo más corto, eficiencia, qué mejorar, la media), el entrenador de la cruz (con y sin cubo), aviso de versión nueva, instalar, la gráfica con ao5/ao12, sincronizar entre dos dispositivos y la vibración en el móvil. |
| `e2e/fridrich-ranking.js` | El ranking con amigos: crear una liga, el enlace de invitación, unirse desde el móvil sin cubo inteligente, los tiempos que se publican solos (y los récords al momento, con el puesto), el aviso de novedades, el detalle con pasos y sin ellos, probar el scramble de un amigo y quién gana, la media de 5 con sus solves, cambiar el nombre, el sitio de otro (rechazado), salir, sincronizar y un enlace que no existe. El servidor es el de verdad (`api/_liga.js`) sobre un almacén en memoria. |
| `e2e/fridrich-session.js` | Aprender frente a cronometrar: los dos modos y su color (cambian solos), la sugerencia que se recalcula sola cada 10 casos, una sesión (su pantalla, el set, el reloj, un fallo que reinicia la racha, dominar un caso y que entre el siguiente), elegir tú los casos (los recomendados de partida, atajos, ninguno no vale, el modo; tus dominados se quedan) y cambiarlos a mitad de sesión, el overlay de OBS pasando solo a la vista de aprendizaje (sin chivar el caso; con el cubo inteligente, los giros y el resultado), irse y volver, recargar a mitad, el resumen y «Tus sesiones», sincronizar y el móvil. |
| `e2e/fridrich-stats.js` | Los números de Fridrich con un historial inventado (`fixtures/cfop-seed.js`): las cuentas (medias, racha, logros, pasos, el set y por qué), Progreso (resumen, días, calendario, pasos, eficiencia, cruz, casos), «Qué entrenar hoy» y entrenar el set, «Me he perdido» con el cubo inteligente y con uno normal, la tabla de casos, el registro de entrenos al sincronizar, el ritmo en directo contra tu media (verde, rojo, dorado, «Vas para», el retraso en directo, contra tu mejor solve o sin él), los récords (aviso, confeti, PB en el historial) y cómo se ven en el overlay, la página vacía y el móvil. |
| `e2e/fridrich.js` | Fridrich reducido: cronómetro con Espacio y con el ratón, inspección, +2/DNF y borrar, el cubo (seguir el scramble, empezar al girar, parar al resolver), un solve CFOP entero con sus seis pasos y sus casos (I-Shape, Sune, Headlights, Ua), la ayuda en directo (que no vuelve atrás cuando un algoritmo o una pareja deshacen la cruz un momento, ni si haces el caso desde otro lado), la cruz más corta, sin crono, Casos y «Pruébalo» (los 16 casos con las dos mezclas acaban resueltos), los tres entrenadores («Ver el algoritmo» que se queda abierto caso tras caso hasta que lo ocultas, y cuenta aparte), el overlay, el plan B sin generador y el móvil. |
| `e2e/principiante.js` | Aprende a resolver el cubo (`/principiante`): el método (300 cubos al azar resueltos con los 7 pasos, sin volver atrás; las reglas de cada paso: 1, 3 o 5 veces R U R' U', la T, la L detrás a la izquierda, como mucho 3 Sunes, los faros y el lado entero detrás), Aprender (los 7 pasos con sus dibujos y algoritmos, antes de empezar, «Ya me lo sé»), la solución de una mezcla paso a paso, el cronómetro, la ayuda en directo con el cubo (la mezcla giro a giro, el primer giro que arranca el reloj, a mitad de «R U R' U' ×3», un giro de más que espera y vuelve, el tiempo de cada paso), «Contra el reloj», Entrenar con el cubo (dejarlo en el paso, con y sin ayuda, «Me he perdido») y con uno normal, Progreso y sus metas, sincronizar, los enlaces desde las otras páginas y el móvil. |
| `e2e/competition-mode.js` | Modo competición: pantalla completa, toda la pantalla como botón, Espacio/F/Esc, gesto de volver en Android, pantalla encendida. |
| `e2e/history-theme-retos.js` | Historial con filtros y «Ver más», tema claro/oscuro, atajo del spoiler, quitar retos (también entre dispositivos sincronizados). |
| `e2e/overlay-obs.js` | La app → obs-websocket (con contraseña) → overlay dentro de «OBS»: vista previa, ventana del overlay, contraseña incorrecta. |
| `e2e/overlay-memo.js` | El memo en el overlay durante la ejecución: solo si es correcto, oculto con `memo=0`, guardado con el resultado. |
| `e2e/overlay-two-windows.js` | Dos ventanas de la app conectadas a la vez: el overlay sigue a la que se está usando, sin parpadeos. |
| `e2e/previews-spoiler-updates.js` | Etiquetas de vista previa (Discord…), enlaces cortos `/r/<id>`, spoiler de Entrenar, pantalla encendida, aviso de versión nueva. |
| `e2e/sync-store.js` | Dónde se guardan los datos y cada cuánto: la misma historia (sincronizar, retos, ligas con dos uniéndose a la vez, un token falso, salir, una liga perdida que vuelve) en memoria, en Redis (la API REST de Upstash, imitada) y en Vercel Blob (imitado, con ETag); lo que cuesta cada petición en Blob (nunca lista); un almacén en pausa (503); las rutas de `api/`; y en el navegador, con un reloj falso, cuántas veces guardan solas Fridrich y 3BLD (Blob: una cada 10 min y al salir; Redis: una por minuto), que abrir o volver solo lee, y cada cuánto se actualiza el ranking. |
| `e2e/smart-cube.js` | Cubo inteligente: seguimiento del scramble, el primer giro termina el memo, parada al resolver, análisis de DNF (sin memo, con memo, letra equivocada, memo mal), carreras al parar, resincronización, MAC, navegadores sin Bluetooth, sonido y vibración. |
| `e2e/smart-cube-overlay.js` | El cubo en el overlay: progreso del scramble, cubo en directo, giros y letras, «lo ha comprobado el cubo», motivo del DNF, y los datos de ejemplo. |
| `e2e/smart-cube-practice.js` | Practicar siguiendo el cubo: primero el scramble, cada giro del setup un paso, la cuenta dentro del algoritmo, giros equivocados, volver de otras letras o vistas, la guía por encima, memo resuelto o con error. |
| `e2e/smart-cube-trainer-guide.js` | Entrenar respondiendo con el cubo y la ejecución guiada que avanza sola con el cubo. |
| `e2e/smart-cube-dnf-read.js` | Las letras falladas en un DNF pasan a Entrenar; «Leer el cubo» y «Usar mi cubo como scramble». |
| `a11y/views.js` | axe-core y desbordamiento horizontal en todas las vistas, móvil y escritorio, claro y oscuro. |
| `a11y/smart-cube.js` | Lo mismo con el cubo conectado: seguimiento, informe de DNF y diálogo de la MAC. |
| `a11y/trainer-guide.js` | Lo mismo en Entrenar con el cubo, en Practicar siguiendo el cubo y en la ejecución guiada. |
| `a11y/principiante.js` | Lo mismo en Aprende a resolver el cubo: Aprender con lo básico abierto, la solución de una mezcla, la ayuda en directo a mitad de una resolución, una resolución acabada con sus pasos, Entrenar con el cubo y con uno normal, Progreso y Ajustes. |
| `a11y/fridrich.js` | Lo mismo en todas las vistas de Fridrich, con el cubo en la última capa, un solve entero con su análisis y su reconstrucción, los entrenadores, y con un historial: un solve récord con su ritmo, Progreso, «Qué entrenar hoy», elegir los casos, una sesión de entrenamiento (y cambiar sus casos) y su resumen, y el ranking (empezar, una liga y un detalle). |

## Cómo están hechas

- **Sin cubo de verdad.** Las suites del cubo usan el cubo virtual de `cube.js` (`?cubo=virtual`): se comporta como un GAN, incluido que los giros anchos (`l`, `d`) llegan como giros de la cara contraria, y deja hacer trampas útiles para probar (`silent()` gira sin avisar, como cuando el cubo pierde la cuenta).
- **Sin Bluetooth de verdad.** El diálogo de la MAC y los errores de conexión se prueban con un `navigator.bluetooth` falso; la librería real (`vendor/`) sí se carga.
- **Sin servidor de verdad.** `server.js` sirve `public/` y la lógica real de la API (`api/_sync.js`, `_reto.js`, `_liga.js`) sobre el almacén en memoria de `api/_kv.js`; `/r/<id>` redirige a la app. El puerto 8793 sirve el generador de scrambles (`/cubejs/`) y el 8792 no, para probar el plan B.
- **Sin OBS.** `overlay-obs.js` monta un obs-websocket falso con `ws` y una página que hace de OBS (`fixtures/wrap.html`).
- **Tiempos de verdad en las capturas.** `docs-shots.js` usa el reloj falso de Playwright para que los tiempos parezcan de un intento real.
- **Sin red.** Las fuentes salen de `@fontsource` (servidas en `/fonts/`) y Google Fonts se bloquea.

## Escribir una suite nueva

Copia cualquiera de `e2e/`. El contrato con `run.js` es pequeño:

- Lee `SITE`, `SITE_PLAIN` y `SHOTS` de `require('../env')`.
- Imprime una línea por comprobación (`PASS …` o `FAIL … — detalle`).
- Termina con `page errors: none` (o la lista de errores de la página) y `N failed of M`.
