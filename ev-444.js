// 4×4 with Yau, for its event page: two opposite centres, three cross edges, the last four centres, the last
// cross edge, the other eight edges with 3-2-3, the 3×3 stage and the two parities; after it, getting under the
// 1:15 cutoff. Every algorithm is checked in tests/e2e/eventos.js against the cube model: the pictures are the
// cases they solve (and the centre and edge tricks keep the cross). Data only.
(function (root) {
  'use strict';
  const C = root.EvContent = root.EvContent || {};
  C['444'] = {
    id: '444', name: '4×4', method: 'Yau', puzzle: 'cube4', hold: 'z2',
    lead: 'El <b>Yau</b> es la reducción en otro orden: dos <b>centros</b> opuestos, <b>tres aristas de la cruz</b>, los cuatro centros que faltan, la <b>última arista de la cruz</b> y las ocho aristas que quedan, emparejadas de tres en tres con el <b>3-2-3</b>. Llegas al F2L con la cruz ya hecha y casi sin girar el cubo. Lo demás es tu <b>CFOP</b> y las dos <b>paridades</b>. Es lo que usa casi todo el mundo para bajar de 1:15, el corte de muchas competiciones.',
    solo: 'Ya lo resuelvo entero con Yau, con las paridades, sin mirar',
    holdNote: 'Los dibujos van con el amarillo arriba y el verde delante, como en el 3×3 con la cruz blanca abajo; el de los centros, con el blanco a la izquierda, como lo tienes en ese paso. En gris, lo que no hace falta mirar.',
    notation: '<p><b>R</b>, <b>U</b>, <b>F</b>, <b>L</b>, <b>D</b> y <b>B</b> giran solo la capa de fuera de esa cara. <b>Rw</b> («w» de <i>wide</i>, ancho) gira las <b>dos capas</b> de la derecha a la vez. Igual <b>Uw</b>, <b>Fw</b>, <b>Lw</b>… Con <b>\'</b> al revés y con <b>2</b> media vuelta.</p><p>En minúscula, <b>r</b> (o <b>2R</b>) gira <b>solo la capa de dentro</b> de la derecha, sin la de fuera. Ojo: en algunas guías la minúscula significa lo mismo que Rw; aquí siempre es solo la de dentro. <b>x</b>, <b>y</b> y <b>z</b> giran el cubo entero.</p><p>Las mezclas de la WCA usan R, U, F, L, D, B y las anchas Rw, Uw y Fw, desde el blanco arriba y el verde delante.</p>',
    steps: [
      {
        id: 'centros', name: 'Dos centros opuestos', short: '2 centros',
        html: '<p>Cada centro son 4 piezas. Haz el <b>blanco</b> como en la reducción: junta dos blancas en una barra, haz otra y únelas. Luego el <b>amarillo</b>, en la cara opuesta, con giros de capas de dentro (r, Rw) que no rompan el blanco.</p><p>Al acabar, coge el cubo con el <b>blanco a la izquierda</b> y el amarillo a la derecha. Así lo tendrás hasta terminar la cruz.</p>',
        tip: 'Mira dónde quedan las piezas de los otros centros mientras haces el amarillo: te ahorra buscarlas luego.',
      },
      {
        id: 'cruz3', name: 'Tres aristas de la cruz', short: '3 de la cruz',
        html: '<p>Con el blanco a la izquierda, empareja tres aristas blancas y ponlas alrededor del centro blanco: <b>delante</b>, <b>abajo</b> y <b>detrás</b> de la cara izquierda. La de <b>arriba</b> la dejas libre, porque la necesitas para mover piezas en el paso siguiente.</p><p>No es solo con capas de fuera: para emparejar una arista, pon sus dos mitades en la misma arista doble, una en la capa de dentro de la derecha (r) o de la izquierda (l), con giros de fuera. Luego júntalas con ese <b>r</b> o <b>l</b>. Solo valen esas dos capas de dentro: no tocan los centros blanco y amarillo ni las aristas que ya tienes puestas, mientras que u, d, f y b rompen los dos centros. Para meterla, usa sobre todo <b>R</b> y <b>U</b> (y L para girar la cara de la cruz): F, B y D sacarían de su sitio las aristas ya puestas. Como los otros centros aún no están, solo importa el orden entre ellas: con el verde delante, la <b>blanca-verde delante</b>, la <b>blanca-naranja abajo</b> y la <b>blanca-azul detrás</b>.</p>',
        tip: 'Es el paso más difícil del Yau al principio. Si tardas mucho, haz primero una arista bien y luego otra: la velocidad llega sola.',
      },
      {
        id: 'centros4', name: 'Los cuatro centros que faltan', short: '4 centros',
        html: '<p>Parece que cualquier giro lo rompe todo, pero solo necesitas <b>tres ideas</b>.</p><p><b>1. Tus piezas solo pueden estar en los centros que aún no has hecho.</b> Nunca en el blanco ni en el amarillo. Y el color de cada centro no lo eliges: el de delante es el de la arista de la cruz que tienes delante (blanca-verde, verde).</p><p><b>2. La cara de arriba es tu mesa de trabajo.</b> U gira solo esa cara (y el hueco libre de la cruz), así que puedes girarla todo lo que quieras para colocar una pieza.</p><p><b>3. El intercambio:</b> <b>r U r\'</b> cambia <b>una pieza de delante por una de arriba</b>, y nada más. No toca el blanco, ni el amarillo, ni la cruz, ni los centros que ya tengas abajo y detrás. Compruébalo con el cubo resuelto (blanco a la izquierda, verde delante): haz r U r\' y mira que solo han cambiado una pieza delante y una arriba. Con <b>U2</b> en medio, en vez de una pieza, cambia una columna entera (una barra).</p><p><b>Cómo se hace un centro:</b> pon delante el que toca y mira qué hueco tiene. Busca una pieza de su color arriba, gírala con U hasta donde está en el dibujo de ese hueco y haz su algoritmo; abajo están los cuatro huecos, uno por algoritmo. Si la pieza está en un centro sin hacer de detrás, súbela antes con <b>r\' U r</b>. Nunca uses Lw: mueve la cara de la cruz.</p><p><b>El orden:</b> el primero, el que más piezas tenga; cuando esté, <b>x\'</b> (gira el cubo entero y lo manda abajo, sin romper nada). El segundo, uno <b>de al lado</b> del primero, no el de enfrente; otra vez delante y x\'. Los dos últimos quedan arriba y delante: ahí ve barra a barra, con los dos últimos casos.</p>',
        tip: 'Al principio, haz los centros pieza a pieza, mirando los dibujos de los huecos. Cuando te salga, empieza a juntar dos piezas en una barra arriba y mételas de una vez.',
        set: 'centros',
      },
      {
        id: 'cruz4', name: 'La última arista de la cruz', short: 'Cruz',
        html: '<p>Empareja la <b>blanca-roja</b> igual que las otras y métela en el hueco de arriba de la cara izquierda, con cuidado de no romper los centros: si mueves una capa de dentro para emparejarla, deshazla antes de que se descoloque nada más.</p><p>Luego gira el cubo para tener la <b>cruz abajo</b> (z\'), con el amarillo arriba y el verde delante. Ya tienes la cruz del 3×3 hecha.</p>',
        tip: 'Esta arista también puedes hacerla con la cruz ya abajo, si te la encuentras más fácil así.',
      },
      {
        id: 'aristas', name: 'Las ocho aristas: 3-2-3', short: '3-2-3',
        html: '<p>Con la cruz abajo, quedan 8 aristas, y abajo no hay ninguna: tienes toda la capa de arriba y los cuatro huecos del F2L para moverlas sin girar el cubo.</p><p><b>El 3:</b> haz Uw (o Uw\'), que descoloca los centros a propósito. Mientras están así, coloca tres alas junto a la mitad que les falta en la capa del medio, con giros como R U R\' o L\' U\' L, que meten y sacan aristas de los huecos sin romper la cruz. Deshaz el Uw y se emparejan las tres de golpe. <b>El 2:</b> otra vez lo mismo, con dos. <b>El 3:</b> y con las tres últimas; las dos del final, si se quedan cruzadas delante, con este algoritmo, que tampoco rompe la cruz:</p>',
        tip: 'Al principio, haz el 3-2-3 de dos en dos y sin prisas. Lo importante es no hacer nada más mientras los centros están descolocados.',
        set: 'aristas',
      },
      {
        id: '3x3', name: 'F2L, OLL y PLL', short: '3×3',
        html: '<p>Con los centros hechos, las aristas emparejadas y la cruz abajo, sigue con tu CFOP del 3×3 desde el F2L. Solo puedes usar giros de las capas de fuera (R, U, F…), para no romper lo que ya has hecho.</p><p>No hay un centro fijo que te diga el color de cada cara, así que mira bien los cuatro centros y la cruz.</p>',
        tip: 'Tu F2L del 3×3 vale tal cual: es donde más tiempo ganas si ya lo tienes fluido.',
      },
      {
        id: 'paridades', name: 'Las paridades', short: 'Paridades',
        html: '<p>A veces, al llegar a la última capa, sale algo que en un 3×3 es imposible. No es un fallo tuyo: le pasa a todo el mundo, y cada caso tiene su algoritmo.</p><p><b>Paridad OLL</b>: al orientar te queda <b>una sola arista volteada</b> (o tres). Ponla delante, haz el algoritmo y sigue con tu OLL normal. <b>Paridad PLL</b>: al permutar sale un caso que en el 3×3 no existe: <b>dos aristas cambiadas y nada más</b>, opuestas o de al lado. Si son opuestas, ponlas delante y detrás y haz el algoritmo; acaba con U2. Si son de al lado, el mismo algoritmo te deja una U-perm de las de siempre (el último caso). En él, <b>r2</b> es solo la capa de dentro (la segunda por la derecha) y <b>Uw2</b>, las dos de arriba juntas.</p>',
        tip: 'El de la paridad OLL es largo pero muy rítmico: Rw U2, con una x al principio. Apréndelo en trozos de cuatro giros.',
        set: 'paridades',
      },
    ],
    sets: {
      centros: {
        name: 'Los huecos del centro de delante', pic: 'net', mask: 'centres',
        cases: [
          { id: 'hueco-dd', name: 'Hueco abajo a la derecha', how: 'La pieza que falta delante, abajo a la derecha del centro. Arriba, la pieza buena donde la ves en el dibujo.', alg: "r U r'", setup: "z r U' r'" },
          { id: 'hueco-ad', name: 'Hueco arriba a la derecha', how: 'La pieza que falta delante, arriba a la derecha del centro.', alg: "r U' r'", setup: "z r U r'" },
          { id: 'hueco-ai', name: 'Hueco arriba a la izquierda', how: 'La pieza que falta delante, arriba a la izquierda del centro. Ahora con l (la capa de dentro de la izquierda), no con Lw.', alg: "l' U l", setup: "z l' U' l" },
          { id: 'hueco-di', name: 'Hueco abajo a la izquierda', how: 'La pieza que falta delante, abajo a la izquierda del centro.', alg: "l' U' l", setup: "z l' U l" },
          { id: 'barra', name: 'Barra a la columna derecha', how: 'Con el blanco a la izquierda: la barra verde en la columna izquierda del centro de arriba, y la columna derecha del de delante por hacer.', alg: "Rw U2 Rw'", setup: "z Rw U2 Rw'" },
          { id: 'barra-i', name: 'Barra a la columna izquierda', how: 'La barra verde en la columna derecha del centro de arriba, y la columna izquierda del de delante por hacer.', alg: "l' U2 l", setup: "z l' U2 l" },
        ],
      },
      aristas: {
        name: 'Las dos últimas', pic: 'net', mask: 'nocorners',
        cases: [
          { id: 'cruzadas', name: 'Las dos últimas, cruzadas', how: 'Con la cruz abajo y lo demás emparejado: delante a la izquierda y delante a la derecha, las dos aristas dobles que quedan, con las mitades cambiadas entre sí.', alg: "Uw' R U R' F R' F' R Uw" },
        ],
      },
      paridades: {
        name: 'Paridades', pic: 'top',
        cases: [
          { id: 'oll-par', name: 'Paridad OLL', how: 'Una sola arista doble volteada en la capa de arriba: ponla delante.', alg: "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'", from: { flip: ['U', 'F'] }, mask: 'D', hide: ["r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2", "r' U2 l F2 l' F2 r2 U2 r U2 r' U2 F2 r2 F2"], mix: ['R U R\' U R U2 R\'', 'R U2 R\' U\' R U\' R\'', 'F R U R\' U\' F\'', 'R U R\' U\' R\' F R F\'', 'R U R\' U R U\' R\' U R U2 R\''] },
          { id: 'pll-par', name: 'Paridad PLL', how: 'Las aristas dobles de delante y de detrás cambiadas entre sí (lo demás bien). Ojo: r2 es solo la capa de dentro de la derecha (también se escribe 2R2), no Rw2: con Rw2 no sale.', alg: "r2 U2 r2 Uw2 r2 Uw2", after: 'U2', from: { swap: [['U', 'F'], ['U', 'B']] }, hide: ['Uw2 Rw2 U2 r2 U2 Rw2 Uw2', 'U2 r2 U2 r2 Uw2 r2 Uw2'], mix: ['R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'', 'R U\' R U R U R U\' R\' U\' R2', 'R2 U R U R\' U\' R\' U\' R\' U R\'', 'R U R\' F\' R U R\' U\' R\' F R2 U\' R\'', ''] },
          { id: 'pll-par-adj', cheat: false, name: 'Paridad PLL (de al lado)', how: 'Cambiadas la arista doble de la izquierda y la de detrás; la de delante, la de la derecha y las esquinas bien. Haz la paridad PLL así, sin girar el cubo: te queda una Ub con la de la derecha bien. Gira el cubo para tenerla detrás (y\') y haz la Ub.', alg: "r2 U2 r2 Uw2 r2 Uw2 U2", after: "y' R2 U R U R' U' R' U' R' U R'", from: { swap: [['U', 'L'], ['U', 'B']] }, hide: ['Uw2 Rw2 U2 r2 U2 Rw2 Uw2', 'U2 r2 U2 r2 Uw2 r2 Uw2'], mix: ['R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'', 'R U\' R U R U R U\' R\' U\' R2', 'R2 U R U R\' U\' R\' U\' R\' U R\'', 'R U R\' F\' R U R\' U\' R\' F R2 U\' R\''] },
        ],
      },
    },
    train: ['paridades'],
    cheat: ['paridades'],   // full screen, «Mirando el tutorial»: only the parities in sight
    next: {
      title: 'Después: bajar de 1:15',
      html: '<p>En muchas competiciones, la primera ronda del 4×4 tiene un <b>corte</b>: haces dos solves y solo sigues hasta los cinco si uno baja de 1:15 (si no, cuenta tu mejor single). Bajar de ahí ya no va del método sino del <b>lookahead</b>: buscar la siguiente pieza mientras pones la que tienes. Practica centros y 3-2-3 despacio pero sin pararte, y el F2L como en el 3×3.</p>',
      link: { href: 'https://www.jperm.net/4x4/faster', text: '4×4: cómo ir más rápido (J Perm)' },
    },
  };
})(window);
