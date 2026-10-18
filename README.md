# Old Pochmann 3BLD

App para aprender a resolver el cubo de Rubik a ciegas (3BLD) con el método Old Pochmann y letras Speffz.

- **Practicar**: dónde va cada letra, setups paso a paso, comprobación y memo recomendado.
- **Cronómetro**: memo y ejecución por separado, historial y estadísticas.
- **Entrenar**: setups de aristas y esquinas, con spoiler del cubo (tecla `?`).
- **Aprender**: tutorial interactivo de 9 lecciones.
- **Retos**: mismo scramble para tus amigos, con vista previa en Discord.
- **Overlay para OBS** (`overlay.html`) y sincronización entre dispositivos.

Publicada en https://old-pochmann-3bld.vercel.app

## Cómo se publica

Cada push a `main` se despliega solo en Vercel. `build.js` genera `public/` (versiona los assets y dibuja los iconos); las funciones de `api/` usan Vercel Blob para retos y sincronización.
