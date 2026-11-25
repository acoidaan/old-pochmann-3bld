// Square-1 by the beginner's Vandenbergh method, for its event page: cube shape (from the star), corners and edges
// to their layer, corners and edges in place, parity and the middle layer. The algorithms were checked (and the
// cube-shape ones found) on the Square-1 model (pz-sq1.js); tests/e2e/eventos.js checks them again: each picture
// is the case its algorithm solves. Data only.
(function (root) {
  'use strict';
  const C = root.EvContent = root.EvContent || {};
  C.sq1 = {
    id: 'sq1', name: 'Square-1', method: 'Vandenbergh', puzzle: 'sq1', hold: '',
    lead: 'El método <b>Vandenbergh</b> para empezar: primero la <b>forma de cubo</b>, luego cada pieza a su <b>capa</b> (esquinas y aristas), después las <b>esquinas</b> y las <b>aristas</b> en su sitio y, si hace falta, la <b>paridad</b>. Pocos algoritmos, y los dibujos te enseñan dónde poner cada pieza.',
    solo: 'Ya lo resuelvo entero sin mirar el tutorial',
    holdNote: 'Cada dibujo enseña las dos capas: la de arriba vista desde arriba (delante, abajo en el dibujo) y la de abajo vista desde abajo (delante, arriba en el dibujo). La línea discontinua es el corte de /. Debajo, la capa del medio, recta o girada.',
    notation: '<p><b>(x, y)</b>: gira la capa de arriba x doceavos de vuelta y la de abajo y, cada una en el sentido de las agujas del reloj mirándola de frente. Un 1 son 30° (lo que ocupa una arista), un 3 son 90° y un 6, media vuelta. Los negativos, al revés.</p><p><b>/</b>: gira media vuelta la mitad derecha del puzle (la del corte), con la pieza pequeña de la capa del medio a la izquierda.</p><p>Sujétalo con el blanco arriba y el verde delante. Las mezclas de la WCA son giros (x, y) y / al azar.</p>',
    steps: [
      {
        id: 'forma', name: 'La forma de cubo', short: 'Forma',
        html: '<p>Lo más raro del Square-1 es que pierde la forma. Para recuperarla en dos fases: primero junta en la capa de arriba <b>las 6 esquinas</b> que caben (forma de <b>estrella</b>). Antes de cada /, gira la capa de arriba para que en su mitad derecha haya aristas, y la de abajo para que en la suya haya esquinas: el / las sube.</p><p>Con la estrella arriba, abajo quedan 2 esquinas y 8 aristas. Mira cómo están esas dos esquinas: hay cinco casos, cada uno con su secuencia hasta el cubo. Pon las capas como en el dibujo y síguela (con «Pruébalo» la ves giro a giro).</p>',
        tip: 'Si al acabar la capa del medio está girada, no pasa nada: se arregla al final, en el último paso.',
        set: 'forma',
      },
      {
        id: 'esquinas', name: 'Las esquinas a su capa', short: 'Esquinas',
        html: '<p>Ahora, sin perder la forma, deja las <b>4 esquinas blancas arriba</b> y las amarillas abajo. Si arriba hay dos amarillas y abajo dos blancas, cámbialas de dos en dos. Si solo hay una de cada, cámbialas de una en una. Ponlas en el sitio que enseña el dibujo.</p>',
        tip: 'Los dos algoritmos mueven también algunas aristas de capa: da igual, se colocan en el paso siguiente.',
        set: 'esquinas',
      },
      {
        id: 'aristas', name: 'Las aristas a su capa', short: 'Aristas',
        html: '<p>Igual con las aristas: las <b>blancas arriba</b> y las amarillas abajo. Pon una arista amarilla <b>arriba a la derecha</b> y una blanca <b>abajo detrás</b>, y este algoritmo las cambia sin mover ninguna esquina de capa. Repite hasta que arriba sea todo blanco y abajo todo amarillo.</p>',
        tip: 'Las otras aristas de arriba se mueven entre ellas: no importa, solo cuenta su capa.',
        set: 'aristas',
      },
      {
        id: 'cp', name: 'Las esquinas en su sitio', short: 'Esquinas 2',
        html: '<p>Cada capa por separado, primero la de <b>abajo</b>. Busca dos esquinas de al lado que ya estén bien entre sí (sus colores de los lados casan) y ponlas <b>detrás</b>. El algoritmo cambia las dos de delante. Si no hay ninguna pareja buena, hazlo una vez desde cualquier sitio y ya la habrá.</p><p>Para la capa de arriba, cambia las capas con <b>/ (6,6) / (−1,1)</b> y haz lo mismo con la que ahora está abajo.</p>',
        tip: 'Tras cambiar las capas el puzle queda boca abajo: no pasa nada, boca abajo también está resuelto.',
        set: 'cp',
      },
      {
        id: 'ep', name: 'Las aristas en su sitio', short: 'Aristas 2',
        html: '<p>Con las esquinas bien, coloca las aristas. Este algoritmo cambia, <b>a la vez en las dos capas</b>, la arista de la <b>derecha</b> con la de <b>detrás</b>. Gira cada capa para dejar en esos dos sitios lo que quieras cambiar (y luego deshaz ese giro). Así, de cambio en cambio, acabas las dos capas.</p>',
        tip: 'Si una capa ya está y la otra no, cambia en la buena dos aristas cualesquiera y luego deshaces ese cambio en el siguiente.',
        set: 'ep',
      },
      {
        id: 'paridad', name: 'La paridad y la capa del medio', short: 'Paridad',
        html: '<p>Si al final solo quedan <b>dos aristas cambiadas</b> en una capa (o una capa necesita un cambio y la otra no), es la <b>paridad</b>. Ponlas delante y detrás arriba y haz el algoritmo largo; luego termina las aristas.</p><p>Y si la <b>capa del medio</b> está girada, arréglala sin tocar lo demás con <b>/ (6,0) / (6,0) / (6,0)</b>.</p>',
        tip: 'El de la paridad son dos mitades simétricas con un (−2,0) en medio: apréndelo así.',
        set: 'paridad',
      },
    ],
    sets: {
      forma: {
        name: 'Desde la estrella', pic: 'sq1',
        cases: [
          { id: 'forma-0', name: 'Esquinas juntas', how: 'Abajo, las dos esquinas una junto a la otra.', alg: '(-4,0) / (-2,-4) / (-5,-4) / (-3,-3) /', setup: '(3,3) / (3,3) / (5,4) / (2,4) / (4,0)', shape: true },
          { id: 'forma-1', name: 'Una arista en medio', how: 'Abajo, una arista entre las dos esquinas.', alg: '(-4,-4) / (-2,-2) / (-4,-1) / (0,4) / (-4,1) / (0,3) /', setup: '(3,3) / (0,-3) / (4,-1) / (0,-4) / (4,1) / (2,2) / (4,4)', shape: true },
          { id: 'forma-2', name: 'Dos aristas en medio', how: 'Abajo, dos aristas entre las esquinas.', alg: '(-4,0) / (-2,-4) / (-5,2) / (0,3) / (-1,1)', setup: '(4,5) / (0,-3) / (5,-2) / (2,4) / (4,0)', shape: true },
          { id: 'forma-3', name: 'Tres aristas en medio', how: 'Abajo, tres aristas entre las esquinas (y cinco al otro lado).', alg: '(-4,-5) / (-2,0) / (-4,-1) / (0,4) / (-4,1) / (0,3) /', setup: '(3,3) / (0,-3) / (4,-1) / (0,-4) / (4,1) / (2,0) / (4,5)', shape: true },
          { id: 'forma-4', name: 'Esquinas enfrentadas', how: 'Abajo, las dos esquinas una frente a otra, con cuatro aristas a cada lado.', alg: '(-4,-4) / (-2,-2) / (-5,-4) / (-3,-3) /', setup: '(3,3) / (3,3) / (5,4) / (2,2) / (4,4)', shape: true },
        ],
      },
      esquinas: {
        name: 'Esquinas a su capa', pic: 'sq1',
        cases: [
          { id: 'co-2', name: 'Dos y dos', how: 'Dos esquinas amarillas arriba y dos blancas abajo, cada pareja en diagonal, como en el dibujo.', alg: '(1,0) / (2,2) / (-3,-2)' },
          { id: 'co-1', name: 'Una y una', how: 'Una esquina amarilla arriba y una blanca abajo, donde enseña el dibujo.', alg: '(1,0) / (0,3) / (-1,0)' },
        ],
      },
      aristas: {
        name: 'Aristas a su capa', pic: 'sq1',
        cases: [
          { id: 'eo', name: 'Una y una', how: 'Una arista amarilla arriba a la derecha y una blanca abajo detrás.', alg: '(1,0) / (3,0) / (3,0) / (-1,-1) / (-2,1) / (-3,0) / (-1,0)' },
        ],
      },
      cp: {
        name: 'Esquinas en su sitio', pic: 'sq1',
        cases: [
          { id: 'cp', name: 'Cambiar las dos de delante (abajo)', how: 'La pareja buena de abajo detrás: cambia las dos esquinas de delante de la capa de abajo (también dos aristas, que se colocan después).', alg: '/ (3,-3) / (0,3) / (-3,0) / (3,0) / (-3,0) / (0,3)' },
          { id: 'swap', name: 'Cambiar las capas', how: 'Para hacer la capa de arriba: la baja y sube la de abajo. El (−1,1) del final las deja otra vez rectas.', alg: '/ (6,6) / (-1,1)' },
        ],
      },
      ep: {
        name: 'Aristas en su sitio', pic: 'sq1',
        cases: [
          { id: 'ep', name: 'Derecha con detrás, en las dos capas', how: 'Cambia la arista de la derecha con la de detrás, arriba y abajo a la vez.', alg: '(0,2) / (0,-3) / (1,1) / (-1,2) / (0,-2)' },
        ],
      },
      paridad: {
        name: 'Paridad y capa del medio', pic: 'sq1',
        cases: [
          { id: 'par', name: 'Paridad', how: 'Arriba, la arista de delante y la de detrás cambiadas entre sí (lo demás bien).', alg: '/ (3,3) / (1,0) / (-2,-2) / (2,0) / (2,2) / (-1,0) / (-3,-3) / (-2,0) / (3,3) / (3,0) / (-1,-1) / (-3,0) / (1,1) / (-4,-3)' },
          { id: 'mid', name: 'Capa del medio girada', how: 'Todo bien menos la capa del medio, que tiene la mitad derecha girada.', alg: '/ (6,0) / (6,0) / (6,0)' },
        ],
      },
    },
    train: ['esquinas', 'aristas', 'cp', 'ep', 'paridad'],
    next: {
      title: 'Después: Vandenbergh completo',
      html: '<p>Con el método completo se hacen varios pasos a la vez. La forma de cubo pasa a ser de memoria, con los 90 casos y sin pasar por la estrella. Las capas se hacen en uno o dos algoritmos («CO» y «EO»). Las esquinas se colocan en las dos capas a la vez («CP»), y la paridad se mete en la permutación de aristas («EP»). Los mejores lo hacen en menos de 10 segundos.</p>',
      link: { href: 'https://www.speedsolving.com/wiki/index.php/Vandenbergh_method', text: 'El método Vandenbergh (SpeedSolving)' },
    },
  };
})(window);
