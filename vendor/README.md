# vendor/

Código de terceros que la app sirve tal cual, con la versión en el nombre del archivo (así el navegador y el service worker pueden guardarlo para siempre: `vercel.json` lo sirve con `Cache-Control: immutable`).

| Archivo | Qué es |
|:--|:--|
| `gan-web-bluetooth-3.0.2.js` | [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) 3.0.2 empaquetado como un único módulo ES con sus dependencias ([rxjs](https://rxjs.dev) 7.8.1 y [aes-js](https://github.com/ricmoo/aes-js) 3.1.2). Habla con los cubos GAN por Bluetooth web. |
| `THIRD_PARTY_LICENSES.txt` | Las licencias completas de los tres (MIT, Apache-2.0 y MIT). |

`cube.js` lo carga con `import()` solo cuando hace falta (al abrir el Cronómetro en un navegador con Bluetooth), y si no lo encuentra prueba con la misma versión en jsDelivr (`/+esm`).

## Volver a generarlo

Sin modificar nada del código original, solo empaquetado y minificado con [esbuild](https://esbuild.github.io):

```sh
mkdir -p /tmp/gan && cd /tmp/gan
npm init -y >/dev/null
npm install gan-web-bluetooth@3.0.2 rxjs@7.8.1 esbuild@0.24.0
echo "export { connectGanCube, cubeTimestampLinearFit } from 'gan-web-bluetooth';" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof \
  "--banner:js=/*! gan-web-bluetooth 3.0.2 (MIT, Andy Fedotov) with rxjs 7.8.1 (Apache-2.0) and aes-js 3.1.2 (MIT), bundled for Old Pochmann 3BLD. Licenses: THIRD_PARTY_LICENSES.txt */" \
  --outfile=gan-web-bluetooth-3.0.2.js
```

Para cambiar de versión: genera el archivo con el nuevo número en el nombre, cambia la constante `LIB` (y `LIB_CDN`) al principio de `cube.js`, actualiza `THIRD_PARTY_LICENSES.txt` y borra el archivo viejo. Después, `cd tests && npm test -- smart-cube`.
