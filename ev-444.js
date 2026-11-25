// 4×4 by reduction, for its event page: centres, pairing the edges, solving it as a 3×3 and the two parities,
// with what comes next (Yau). Every algorithm is checked in tests/e2e/eventos.js against the cube model: the
// pictures are the cases they solve. Data only.
(function (root) {
  'use strict';
  const C = root.EvContent = root.EvContent || {};
  C['444'] = {
    id: '444', name: '4×4', method: 'Reducción', puzzle: 'cube4', hold: 'z2',
    lead: 'La <b>reducción</b> convierte el 4×4 en un 3×3 grande: haces los <b>centros</b> (cuatro piezas cada uno), <b>emparejas las aristas</b> de dos en dos y lo resuelves con tu <b>CFOP</b>. Al final pueden salir dos casos que el 3×3 no tiene, las <b>paridades</b>, cada una con su algoritmo.',
    solo: 'Ya lo resuelvo entero, con las paridades, sin mirar',
    holdNote: 'Los dibujos van con el amarillo arriba y el verde delante, como en el 3×3 con la cruz blanca abajo. En gris, lo que no hace falta mirar en ese paso.',
    notation: '<p><b>R</b>, <b>U</b>, <b>F</b>, <b>L</b>, <b>D</b> y <b>B</b> giran solo la capa de fuera de esa cara. <b>Rw</b> («w» de <i>wide</i>, ancho) gira las <b>dos capas</b> de la derecha a la vez. Igual <b>Uw</b>, <b>Fw</b>, <b>Lw</b>… Con <b>\'</b> al revés y con <b>2</b> media vuelta.</p><p>En minúscula, <b>r</b> (o <b>2R</b>) gira <b>solo la capa de dentro</b> de la derecha, sin la de fuera. Ojo: en algunas guías la minúscula significa lo mismo que Rw; aquí siempre es solo la de dentro. <b>x</b>, <b>y</b> y <b>z</b> giran el cubo entero.</p><p>Las mezclas de la WCA usan R, U, F, L, D, B y las anchas Rw, Uw y Fw, desde el blanco arriba y el verde delante.</p>',
    steps: [
      {
        id: 'centros', name: 'Los centros', short: 'Centros',
        html: '<p>Cada centro son 4 piezas. Primero el <b>blanco</b>: junta dos blancas en una barra, haz otra barra y únelas. Luego el <b>amarillo</b>, en la cara opuesta, con giros de capas de dentro (r, Rw) que no rompan el blanco.</p><p>Quedan cuatro centros. Antes de seguir, comprueba el <b>orden</b>: con el blanco arriba y el verde delante, el <b>rojo va a la derecha</b>, el azul detrás y el naranja a la izquierda. Si no, acabarás con dos centros cambiados. Con el blanco y el amarillo arriba y abajo, haz barras en la cara de arriba o de delante y llévalas a su sitio con un truco como este, que mete una barra de arriba en la columna derecha del centro de delante sin tocar los demás centros:</p>',
        tip: 'El truco de las barras: Rw sube la columna derecha de delante, U2 cambia de sitio las columnas de arriba y Rw\' baja la barra nueva.',
        set: 'centros',
      },
      {
        id: 'aristas', name: 'Emparejar las aristas', short: 'Aristas',
        html: '<p>Cada arista del 4×4 son dos piezas («alas») que tienen que ir juntas, como una sola arista de 3×3. Hay 12 aristas dobles.</p><p>El método fácil (<i>slice-flip-slice</i>): busca dos aristas dobles con las mitades cruzadas y ponlas <b>delante a la izquierda</b> y <b>delante a la derecha</b>, como en el dibujo. Uw\' junta las dos mitades buenas. R U R\' F R\' F\' R saca arriba la arista ya emparejada y mete en su lugar una sin hacer. Uw vuelve a poner bien los centros. Repítelo hasta que estén las 12.</p>',
        tip: 'Mientras haces Uw\' los centros se descolocan un momento: no hagas nada más hasta el Uw del final.',
        set: 'aristas',
      },
      {
        id: '3x3', name: 'Como un 3×3', short: '3×3',
        html: '<p>Con los centros hechos y las aristas emparejadas, el 4×4 se comporta como un 3×3: cruz, F2L, OLL y PLL con tus algoritmos de siempre. Solo puedes usar giros de las capas de fuera (R, U, F…), para no romper lo que ya has hecho.</p><p>La única diferencia: no hay un centro fijo que te diga el color de cada cara, así que mira bien los cuatro centros (el orden del paso 1).</p>',
        tip: 'Si te cuesta seguir las aristas dobles en la cruz, haz la cruz con más calma: es donde más se nota el cambio del 3×3 al 4×4.',
      },
      {
        id: 'paridades', name: 'Las paridades', short: 'Paridades',
        html: '<p>A veces, al llegar a la última capa, sale algo que en un 3×3 es imposible. No es un fallo tuyo: le pasa a todo el mundo, y cada caso tiene su algoritmo.</p><p><b>Paridad OLL</b>: al orientar te queda <b>una sola arista volteada</b> (o tres). Ponla delante, haz el algoritmo y sigue con tu OLL normal. <b>Paridad PLL</b>: al permutar sale un caso que no existe, como <b>dos aristas opuestas cambiadas</b>. Ponlas delante y detrás y haz el algoritmo; acaba con U2. En él, <b>r2</b> es solo la capa de dentro (la segunda por la derecha) y <b>Uw2</b>, las dos de arriba juntas.</p>',
        tip: 'El de la paridad OLL es largo pero muy rítmico: Rw U2, con una x al principio. Apréndelo en trozos de cuatro giros.',
        set: 'paridades',
      },
    ],
    sets: {
      centros: {
        name: 'Barras de los centros', pic: 'net', mask: 'centres',
        cases: [
          { id: 'barra', name: 'Barra de arriba al centro de delante', how: 'La barra verde en la columna izquierda del centro de arriba, y la columna derecha del de delante por hacer.', alg: "Rw U2 Rw'" },
        ],
      },
      aristas: {
        name: 'Emparejar', pic: 'net', mask: 'nocorners',
        cases: [
          { id: 'cruzadas', name: 'Dos aristas cruzadas', how: 'Delante a la izquierda y delante a la derecha, dos aristas dobles con las mitades cambiadas entre sí.', alg: "Uw' R U R' F R' F' R Uw" },
        ],
      },
      paridades: {
        name: 'Paridades', pic: 'top',
        cases: [
          { id: 'oll-par', name: 'Paridad OLL', how: 'Una sola arista doble volteada en la capa de arriba: ponla delante.', alg: "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'", from: { flip: ['U', 'F'] }, mask: 'D' },
          { id: 'pll-par', name: 'Paridad PLL', how: 'Las aristas dobles de delante y de detrás cambiadas entre sí (lo demás bien). Ojo: r2 es solo la capa de dentro de la derecha (también se escribe 2R2), no Rw2: con Rw2 no sale.', alg: "r2 U2 r2 Uw2 r2 Uw2", after: 'U2', from: { swap: [['U', 'F'], ['U', 'B']] } },
        ],
      },
    },
    train: ['paridades'],
    next: {
      title: 'Después: Yau',
      html: '<p><b>Yau</b> es lo que usa casi todo el mundo para bajar de un minuto. Haces dos centros opuestos (blanco y amarillo) y tres aristas de la cruz. Luego los cuatro centros que quedan y la cuarta arista de la cruz, y el resto de aristas emparejadas de dos en dos con <i>3-2-3</i>. Después, F2L como en el 3×3. Es la misma idea de la reducción, en otro orden: ves la cruz mucho antes y no tienes que buscarla después.</p>',
      link: { href: 'https://www.speedsolving.com/wiki/index.php/Yau_method', text: 'El método Yau (SpeedSolving)' },
    },
  };
})(window);
