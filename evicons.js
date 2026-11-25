// The sections of the app as one list, for the menu in every page (build.js writes it into each one) and for the
// plan: each with its link, its name, a line about it and its little picture. Works in the browser
// (window.EvIcons) and in Node (build.js).
(function (root) {
  'use strict';
  const svg = (body) => `<svg class="sx-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICONS = {
    plan: svg('<path d="M6 21V4"/><path d="M6 4.5h11.5l-2.6 4 2.6 4H6"/>'),
    cfop: svg('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>'),
    bld: svg('<path d="M2.8 12S6.3 6 12 6s9.2 6 9.2 6-3.5 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 20 4"/>'),
    beg: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7.5h8M8 11h6"/>'),
    222: svg('<rect x="5" y="5" width="14" height="14" rx="2.5"/><path d="M5 12h14M12 5v14"/>'),
    444: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16"/>'),
    pyram: svg('<path d="M12 3.5 21.2 19.5H2.8z"/><path d="M7.4 11.5h9.2M12 19.5l-4.6-8M12 19.5l4.6-8"/>'),
    sq1: svg('<path d="M4.5 4.5h15v15h-15z"/><path d="M10.2 4.5 13.8 19.5"/><path d="M4.5 9.6l6.3 1.6M13.2 12.8l6.3 1.6"/>'),
  };
  // The menu, in groups. `sx` is what <html data-section> says on that page.
  const MENU = [
    { group: null, items: [{ sx: 'plan', href: 'plan', name: 'Mi plan', small: 'Roadmap WCA 2027: fases, metas y rutina' }] },
    {
      group: '3×3',
      items: [
        { sx: 'cfop', href: 'fridrich', name: 'CFOP', small: 'Cronómetro, casos y entrenador' },
        { sx: 'bld', href: './', name: 'A ciegas', small: '3BLD: Old Pochmann y M2' },
        { sx: 'beg', href: 'principiante', name: 'Principiante', small: 'Resolverlo desde cero, capa a capa' },
      ],
    },
    {
      group: 'Más modalidades',
      items: [
        { sx: '222', href: '2x2', name: '2×2', small: 'Ortega: cara, OLL y PBL' },
        { sx: '444', href: '4x4', name: '4×4', small: 'Reducción: centros, aristas y paridades' },
        { sx: 'pyram', href: 'pyraminx', name: 'Pyraminx', small: 'Principiante y después L4E' },
        { sx: 'sq1', href: 'square-1', name: 'Square-1', small: 'Forma, capas y permutación (Vandenbergh)' },
      ],
    },
  ];
  const ICON_OF = { plan: 'plan', cfop: 'cfop', bld: 'bld', beg: 'beg', 222: '222', 444: '444', pyram: 'pyram', sq1: 'sq1' };
  // The items of the menu (the <li> of a <ul class="sx-menu">).
  function menuItems() {
    return MENU.map((g) => (g.group ? `<li class="sx-group" aria-hidden="true">${g.group}</li>` : '')
      + g.items.map((it) => `<li><a href="${it.href}" data-sx="${it.sx}">${ICONS[ICON_OF[it.sx]]}<span class="sx-t">${it.name}<small>${it.small}</small></span></a></li>`).join('')).join('');
  }
  const api = { ICONS, MENU, menuItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EvIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
