// Pyraminx, beginner's method and then L4E, for its event page. The algorithms were worked out on the Pyraminx
// model (pz-pyra.js), the shortest in R, L and U, and tests/e2e/eventos.js checks every one: the pictures are
// the cases they solve. Data only.
(function (root) {
  'use strict';
  const C = root.EvContent = root.EvContent || {};
  // L4E: [group, algorithm]. Groups by where the bottom edge still to do is: in its place, in its place but
  // flipped, or up in the top layer.
  const L4E = [['in', "L R U R' U' L'"], ['in', "R' L' U' L U R"], ['in', "L U L' U L U L'"], ['in', "L U' L' U' L U' L'"], ['in', "L U' R U' R' U L'"], ['flip', "R' U R' L R L' R"], ['flip', "R L R L U' L R"], ['flip', "R' L' U L' R' L' R'"], ['flip', "R U' L' U L R U R"], ['flip', "R' U' R' L' U' L U R'"], ['flip', "L' R L' U L R L' U R L'"], ['up', "R' U' R"], ['up', "R' U R"], ['up', "R' L' U L R"], ['up', "R' L R' L' R'"], ['up', "R' L' U' L R"], ['up', "R L R L' R"], ['up', "R L R L' U R"], ['up', "R' L' U' L U' R"], ['up', "R' U L' U L R"], ['up', "R L R L' U' R"], ['up', "R' U L R' L' R'"], ['up', "R L' U' L U R'"], ['up', "R' L' U L U R"], ['up', "R' U' L' U L U R"], ['up', "R L R L U L R"], ['up', "R' L' U' L' R' L' R'"], ['up', "R' U' L' U' L U R"], ['up', "R' U R U R' U' R"], ['up', "R L R L U' L U R"], ['up', "R' U L' U L' R' L' R'"], ['up', "R L R L U' L U' R"], ['up', "R' U' L R' L' R U' R"], ['up', "R' U R' L R L' U R"], ['up', "R' U R U' R L R L' R"]];
  const GROUP = { in: 'La arista de abajo ya está', flip: 'La arista de abajo, en su sitio pero volteada', up: 'La arista de abajo, arriba' };
  const count = { in: 0, flip: 0, up: 0 };
  const l4e = L4E.map(([g, alg]) => { count[g]++; return { id: `l4e-${g}-${count[g]}`, name: `L4E ${L4E.findIndex((x) => x[1] === alg) + 1}`, group: GROUP[g], alg }; });

  C.pyram = {
    id: 'pyram', name: 'Pyraminx', method: 'Principiante', puzzle: 'pyra', hold: '',
    lead: 'Capa a capa: primero las <b>puntas</b>, luego la <b>cara de abajo</b> (sus tres centros y sus tres aristas) y al final la <b>capa de arriba</b>, con 5 casos. Es el puzle oficial más rápido de aprender. Cuando te salga solo, <b>L4E</b> te baja de 10 segundos.',
    solo: 'Ya lo resuelvo entero sin mirar el tutorial',
    holdNote: 'Los dibujos son el Pyraminx desplegado: delante (verde) en el centro, la izquierda (roja) y la derecha (azul) a sus lados y la base (amarilla) debajo, sujetándolo con el amarillo abajo y el verde delante, como manda la WCA.',
    notation: '<p><b>U</b>, <b>L</b>, <b>R</b> y <b>B</b> giran un tercio de vuelta la esquina de arriba, la de la izquierda, la de la derecha y la de detrás. Giran dos pisos: la punta y la pieza de debajo, con las tres aristas que las tocan. El giro va en el sentido de las agujas del reloj mirando esa esquina desde fuera; con <b>\'</b> al revés.</p><p>En minúscula, <b>u</b>, <b>l</b>, <b>r</b> y <b>b</b> giran <b>solo la punta</b>. Las mezclas de la WCA acaban con las puntas, y se hacen con el amarillo abajo y el verde delante.</p>',
    steps: [
      {
        id: 'puntas', name: 'Las puntas', short: 'Puntas',
        html: '<p>Cada punta (el triangulito de cada esquina) gira sola. Gírala con u, l, r o b hasta que sus tres colores coincidan con los de la pieza de debajo. Se hace al principio, en la inspección, y ya no se vuelve a tocar.</p>',
        tip: 'Hazlo siempre en el mismo orden (por ejemplo u, l, r, b) para no saltarte ninguna.',
      },
      {
        id: 'centros', name: 'Los centros de abajo', short: 'Centros',
        html: '<p>Con el <b>amarillo abajo</b>, mira las tres esquinas de abajo (izquierda, derecha y detrás). Cada una tiene una pieza de centro con tres colores. Gira <b>L</b>, <b>R</b> y <b>B</b> hasta que las tres tengan el <b>amarillo abajo</b>: la base ya tiene sus tres centros. Las puntas giran con ellas y siguen bien.</p>',
        tip: 'Fíjate también en que los otros dos colores de cada centro casen con los de las caras de los lados: si el amarillo está abajo, casan solos.',
      },
      {
        id: 'aristas', name: 'Las aristas de abajo', short: 'Aristas',
        html: '<p>Faltan las tres aristas de la base. Gira el Pyraminx entero, siempre con el amarillo abajo, para tener <b>delante</b> el hueco que quieres llenar. Busca su arista en la capa de arriba y llévala con U a la arista de arriba de <b>detrás</b> (la que no ves desde delante). Según hacia dónde mire su amarillo:</p>',
        tip: 'Si la arista está abajo pero mal (en otro hueco o volteada), sácala con el mismo R U R\' o L\' U\' L desde ese hueco y vuelve a meterla.',
        set: 'aristas',
      },
      {
        id: 'arriba', name: 'La capa de arriba', short: 'Arriba',
        html: '<p>Gira <b>U</b> hasta que el centro de arriba (las tres piezas de debajo de la punta de arriba) case con los colores de los lados. Ya solo quedan las <b>tres aristas de arriba</b>, y hay cinco casos: o dan una vuelta entre ellas, o dos están volteadas, o las dos cosas. Gira el Pyraminx entero (amarillo abajo) para verlo como en el dibujo y haz su algoritmo.</p>',
        tip: 'R U R\' U R U R\' y R U\' R\' U\' R U\' R\' son los más frecuentes: apréndelos primero.',
        set: 'll',
      },
    ],
    sets: {
      aristas: {
        name: 'Aristas de abajo', pic: 'net',
        cases: [
          { id: 'ab-r', name: 'Amarillo a la derecha', how: 'La arista detrás, arriba, con su amarillo en la cara de la derecha.', alg: "R U R'" },
          { id: 'ab-l', name: 'Amarillo a la izquierda', how: 'La arista detrás, arriba, con su amarillo en la cara de la izquierda.', alg: "L' U' L" },
        ],
      },
      ll: {
        name: 'Capa de arriba', pic: 'net',
        cases: [
          { id: 'll-1', name: 'Vuelta en un sentido', how: 'Las tres aristas bien de cara, pero corridas un sitio, como si U hubiera girado sin el centro.', alg: "R U R' U R U R'" },
          { id: 'll-2', name: 'Vuelta en el otro', how: 'Corridas un sitio, como si U\' hubiera girado sin el centro.', alg: "R U' R' U' R U' R'" },
          { id: 'll-3', name: 'Dos volteadas', how: 'Las tres en su sitio y dos volteadas: las dos de la cara de delante.', alg: "R' L R L' U L' U' L" },
          { id: 'll-4', name: 'Vuelta y volteo (1)', how: 'Las tres corridas un sitio y dos de ellas volteadas, como en el dibujo.', alg: "R' U' L' U L R" },
          { id: 'll-5', name: 'Vuelta y volteo (2)', how: 'La otra vuelta, también con dos volteadas.', alg: "R' L' U' L U R" },
        ],
      },
      l4e: { name: 'L4E', pic: 'net', cases: l4e },
    },
    train: ['ll', 'l4e'],
    next: {
      title: 'Después: L4E',
      html: '<p><b>L4E</b> («las 4 últimas aristas») cambia el orden: puntas, después una <b>V</b> (dos aristas de la base con sus tres centros) y, de una vez, las cuatro aristas que quedan (la tercera de la base y las tres de arriba). Coge el Pyraminx con la V a la izquierda (la arista de delante y la de la izquierda de la base hechas) y busca tu caso. Son 35, en tres grupos según dónde está la tercera arista de la base. Aquí van todos con su algoritmo más corto en R, L y U, y los puedes practicar en Entrenar.</p>',
      set: 'l4e',
    },
  };
})(window);
