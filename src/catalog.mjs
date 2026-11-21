export const defaultCourseIds = [
  'estruturas-de-dados',
  'banco-de-dados',
  'redes-de-computadores',
];

function section(id, days, start, end) {
  return {
    id,
    name: `Turma ${id.toUpperCase()}`,
    meetings: days.map((day) => ({ day, start, end })),
  };
}

export const demoCatalog = [
  {
    id: 'estruturas-de-dados',
    name: 'Estruturas de Dados',
    sections: [
      section('a', [1, 3], '08:00', '09:40'),
      section('b', [2, 4], '10:00', '11:40'),
      section('c', [1, 3], '18:50', '20:30'),
    ],
  },
  {
    id: 'banco-de-dados',
    name: 'Banco de Dados',
    sections: [
      section('a', [1, 3], '10:00', '11:40'),
      section('b', [2, 4], '10:50', '12:30'),
      section('c', [2, 4], '18:50', '20:30'),
    ],
  },
  {
    id: 'redes-de-computadores',
    name: 'Redes de Computadores',
    sections: [
      section('a', [2, 4], '08:00', '09:40'),
      section('b', [1, 3], '09:00', '10:40'),
      section('c', [5], '08:00', '11:20'),
    ],
  },
  {
    id: 'engenharia-de-software',
    name: 'Engenharia de Software',
    sections: [
      section('a', [1, 3], '14:00', '15:40'),
      section('b', [2, 4], '16:00', '17:40'),
    ],
  },
  {
    id: 'interacao-humano-computador',
    name: 'Interação Humano-Computador',
    sections: [
      section('a', [2, 4], '14:00', '15:40'),
      section('b', [5], '13:00', '16:20'),
    ],
  },
  {
    id: 'sistemas-operacionais',
    name: 'Sistemas Operacionais',
    sections: [
      section('a', [2, 4], '08:00', '09:40'),
      section('b', [1, 3], '16:00', '17:40'),
      section('c', [2, 4], '18:50', '20:30'),
    ],
  },
  {
    id: 'probabilidade-e-estatistica',
    name: 'Probabilidade e Estatística',
    sections: [
      section('a', [1, 3], '10:00', '11:40'),
      section('b', [2, 4], '13:00', '14:40'),
    ],
  },
  {
    id: 'programacao-web',
    name: 'Programação Web',
    sections: [
      section('a', [1, 3], '16:00', '17:40'),
      section('b', [5], '14:00', '17:20'),
    ],
  },
];
