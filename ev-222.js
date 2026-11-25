// 2×2 by the Ortega method, for its event page: the steps, the cases with their algorithms (every one checked in
// tests/e2e/eventos.js against the cube model: each picture is the case its algorithm solves), the notation and
// what comes next. Data only.
(function (root) {
  'use strict';
  const C = root.EvContent = root.EvContent || {};
  C['222'] = {
    id: '222', name: '2×2', method: 'Ortega', puzzle: 'cube2', hold: 'z2',
    lead: 'Ortega resuelve el 2×2 en tres pasos: una <b>cara</b>, <b>orientar</b> la de arriba (OLL) y <b>colocar las dos capas</b> a la vez (PBL). Son 12 algoritmos cortos, y varios ya los conoces del 2 looks del 3×3. Con él se baja de 10 segundos sin problema.',
    solo: 'Ya lo resuelvo entero sin mirar el tutorial',
    holdNote: 'Los dibujos de los casos van con la cara blanca abajo, el amarillo arriba y el verde delante. En gris, lo que no hace falta mirar para reconocer el caso.',
    notation: '<p>Como en el 3×3: <b>R</b>, <b>U</b>, <b>F</b>, <b>L</b>, <b>D</b> y <b>B</b> giran esa cara un cuarto de vuelta en el sentido de las agujas del reloj mirándola de frente; con <b>\'</b> al revés y con <b>2</b> media vuelta. <b>x</b>, <b>y</b> y <b>z</b> giran el cubo entero (como R, U y F).</p><p>El 2×2 no tiene centros: no hay un color «de arriba» fijo. Tú lo decides con la primera cara, y los demás colores van donde les toque según esa cara.</p><p>Las mezclas de la WCA usan solo R, U y F, desde el blanco arriba y el verde delante.</p>',
    steps: [
      {
        id: 'cara', name: 'La cara', short: 'Cara',
        html: '<p>Haz la <b>cara blanca abajo</b>, como la cruz del CFOP. En Ortega no hace falta que los lados de esa capa coincidan entre sí: basta con que las cuatro piezas tengan el blanco abajo.</p><p>Es intuitivo: junta dos piezas blancas, añade la tercera y mete la última desde arriba. Para la última, ponla encima de su hueco (delante a la derecha) y mira hacia dónde apunta su blanco:</p>',
        tip: 'Intenta hacerla en 6 u 8 giros, planeándola entera durante la inspección.',
        set: 'cara',
      },
      {
        id: 'oll', name: 'Orientar la capa de arriba (OLL)', short: 'OLL',
        html: '<p>Con la cara blanca abajo, deja el <b>amarillo arriba</b> en las cuatro esquinas. Hay 7 casos. Se reconocen por cuántos amarillos hay ya arriba y hacia dónde miran los otros. Gira U hasta que el cubo se vea como en el dibujo y haz el algoritmo.</p>',
        tip: 'Sune y Antisune son los mismos que en el 2 looks del 3×3; H, Pi, U, T y L ya los conoces de la segunda OLL. Aprende primero esos dos y luego el resto.',
        set: 'oll',
      },
      {
        id: 'pbl', name: 'Colocar las dos capas (PBL)', short: 'PBL',
        html: '<p>Con arriba todo amarillo y abajo todo blanco, coloca <b>las dos capas a la vez</b>. Mira cada capa por los lados. Si en un lado hay dos colores iguales juntos (una <b>barra</b>), en esa capa hay que cambiar dos piezas de al lado. Si no hay ninguna barra, hay que cambiar dos en diagonal. Si los cuatro lados tienen barra, esa capa ya está.</p><p>Gira U y D para dejar las barras donde dice el dibujo y haz el algoritmo. Al final, alinea las capas.</p>',
        tip: 'Si solo está mal la capa de abajo, dale la vuelta al cubo (z2) y haz el caso de «solo arriba». Si arriba hay diagonal y abajo barra, también: z2 y queda «barra arriba, diagonal abajo».',
        set: 'pbl',
      },
    ],
    sets: {
      cara: {
        name: 'Última pieza de la cara', pic: 'iso', mask: 'U',
        cases: [
          { id: 'cara-r', name: 'Blanco a la derecha', how: 'La esquina encima de su hueco, con el blanco mirando a la derecha.', alg: "R U R'" },
          { id: 'cara-f', name: 'Blanco delante', how: 'Con el blanco mirando hacia ti.', alg: "F' U' F" },
          { id: 'cara-u', name: 'Blanco arriba', how: 'Con el blanco mirando hacia arriba: primero la giras y luego la metes.', alg: "R U2 R' U' R U R'" },
        ],
      },
      oll: {
        name: 'OLL', pic: 'top', mask: 'D',
        cases: [
          { id: 'sune', name: 'Sune', how: 'Un amarillo arriba (delante a la izquierda). Delante, el amarillo está en la esquina de la derecha mirando hacia ti.', alg: "R U R' U R U2 R'" },
          { id: 'antisune', name: 'Antisune', how: 'Un amarillo arriba (detrás a la derecha). Delante, el amarillo está en la esquina de la izquierda mirando hacia ti.', alg: "R U2 R' U' R U' R'" },
          { id: 'h', name: 'H', how: 'Ningún amarillo arriba: faros delante y faros detrás (dos amarillos juntos en cada lado).', alg: 'R2 U2 R U2 R2' },
          { id: 'pi', name: 'Pi', how: 'Ningún amarillo arriba: faros a la izquierda, y los otros dos mirando uno hacia delante y otro hacia atrás.', alg: "R U2 R2 U' R2 U' R2 U2 R", alts: ["F R U R' U' R U R' U' F'"] },
          { id: 'u', name: 'U (faros)', how: 'Dos amarillos arriba, juntos a la derecha. Los otros dos miran a la izquierda: faros a la izquierda.', alg: "F R U R' U' F'" },
          { id: 't', name: 'T', how: 'Dos amarillos arriba, juntos a la derecha. Los otros dos miran uno hacia delante y otro hacia atrás.', alg: "R U R' U' R' F R F'" },
          { id: 'l', name: 'L (pajarita)', how: 'Dos amarillos arriba en diagonal (detrás a la derecha y delante a la izquierda). El de delante a la derecha mira hacia ti.', alg: "F' R U R' U' R' F R" },
        ],
      },
      pbl: {
        name: 'PBL', pic: 'net',
        cases: [
          { id: 'bar-bar', name: 'Barra arriba y barra abajo', how: 'Una barra en cada capa: ponlas las dos delante.', alg: "R2 U' B2 U2 R2 U' R2" },
          { id: 'bar-diag', name: 'Barra arriba, diagonal abajo', how: 'La barra de arriba, delante. Abajo no hay ninguna barra.', alg: "R U' R F2 R' U R'" },
          { id: 'diag-diag', name: 'Diagonal arriba y abajo', how: 'Ninguna barra en ninguna capa.', alg: 'R2 F2 R2' },
          { id: 'bar-ok', name: 'Solo arriba: barra', how: 'Abajo ya está. La barra de arriba, a la izquierda (es la T-perm).', alg: "R U R' U' R' F R2 U' R' U' R U R' F'", alts: ["R U2 R' U' R U2 L' U R' U' L"] },
          { id: 'diag-ok', name: 'Solo arriba: diagonal', how: 'Abajo ya está y arriba no hay ninguna barra (es la Y-perm).', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
        ],
      },
    },
    train: ['oll', 'pbl'],
    next: {
      title: 'Después: CLL',
      html: '<p>Cuando Ortega te salga fluido, el siguiente paso es <b>CLL</b>. Haces la primera capa entera (no solo la cara, también con sus lados bien) y resuelves la de arriba de una vez con uno de sus 42 algoritmos. Es lo que usan los que bajan de 5 segundos. Si te interesa, empieza por los casos de Sune y Antisune.</p>',
      link: { href: 'https://jperm.net/algs/2x2/cll', text: 'Los 42 casos de CLL (J Perm)' },
    },
  };
})(window);
