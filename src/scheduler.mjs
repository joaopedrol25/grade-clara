export const DAYS = [
  { id: 1, label: 'Segunda', short: 'Seg' },
  { id: 2, label: 'Terça', short: 'Ter' },
  { id: 3, label: 'Quarta', short: 'Qua' },
  { id: 4, label: 'Quinta', short: 'Qui' },
  { id: 5, label: 'Sexta', short: 'Sex' },
];

export const MAX_COMBINATIONS = 200_000;

const TIME_FORMAT = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const RANKING_METRICS = {
  gaps: ['gapMinutes', 'days'],
  days: ['days', 'gapMinutes'],
  early: ['latestEnd', 'gapMinutes', 'days'],
};

export function toMinutes(time) {
  if (typeof time !== 'string' || !TIME_FORMAT.test(time)) {
    throw new Error('Use horários no formato HH:MM, entre 00:00 e 23:59.');
  }

  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export function intervalsOverlap(first, second) {
  return first.day === second.day && first.start < second.end && second.start < first.end;
}

function requireArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} deve ter de 1 a ${maximum} itens.`);
  }

  return Array.from(value);
}

function readText(value, label, maximum) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) {
    throw new Error(`${label} deve ter de 1 a ${maximum} caracteres.`);
  }

  return text;
}

function registerId(value, ids, label) {
  const id = readText(value, label, 80);
  if (ids.has(id)) {
    throw new Error(`${label} repetido (${id}).`);
  }

  ids.add(id);
  return id;
}

export function validateCatalog(catalog) {
  const courseIds = new Set();

  return requireArray(catalog, 'O catálogo', 40).map((course, courseIndex) => {
    const label = `Disciplina ${courseIndex + 1}`;
    const id = registerId(course?.id, courseIds, `ID da disciplina ${courseIndex + 1}`);
    const name = readText(course.name, `Nome da disciplina ${courseIndex + 1}`, 120);
    const sectionIds = new Set();

    const sections = requireArray(course.sections, `A lista de turmas de ${label}`, 12).map(
      (section, sectionIndex) => {
        const sectionLabel = `turma ${sectionIndex + 1} de ${name}`;
        const sectionId = registerId(section?.id, sectionIds, `ID da ${sectionLabel}`);
        const sectionName = readText(section.name, `Nome da ${sectionLabel}`, 120);
        const meetings = requireArray(section.meetings, `A lista de horários da ${sectionLabel}`, 12)
          .map((meeting) => {
            const { day, start, end } = meeting ?? {};

            if (!Number.isInteger(day) || day < 1 || day > DAYS.length) {
              throw new Error(`O dia da ${sectionLabel} deve ser um número de 1 (segunda) a 5 (sexta).`);
            }
            if (typeof start !== 'string' || typeof end !== 'string' ||
                !TIME_FORMAT.test(start) || !TIME_FORMAT.test(end) || start >= end) {
              throw new Error(`Horário inválido na ${sectionLabel}. Use HH:MM e um fim após o início.`);
            }

            return { day, start, end };
          })
          .sort((first, second) => first.day - second.day || first.start.localeCompare(second.start));

        if (meetings.some((meeting, index) => index > 0 && intervalsOverlap(meetings[index - 1], meeting))) {
          throw new Error(`Há horários sobrepostos na ${sectionLabel}.`);
        }

        return { id: sectionId, name: sectionName, meetings };
      },
    );

    return { id, name, sections };
  });
}

function summarize(meetingsByDay) {
  let days = 0;
  let gapMinutes = 0;
  let latestEnd = 0;

  for (const meetings of meetingsByDay) {
    if (meetings.length === 0) continue;

    let first = 24 * 60;
    let last = 0;
    let occupied = 0;
    for (const { start, end } of meetings) {
      first = Math.min(first, start);
      last = Math.max(last, end);
      occupied += end - start;
    }

    days += 1;
    gapMinutes += last - first - occupied;
    latestEnd = Math.max(latestEnd, last);
  }

  return { days, gapMinutes, latestEnd };
}

export function generateSchedules(courses, { preference = 'gaps', limit = 24 } = {}) {
  if (!Object.hasOwn(RANKING_METRICS, preference)) {
    throw new Error('Escolha uma preferência de ordenação válida.');
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('O limite de resultados deve ser um inteiro a partir de zero.');
  }
  if (courses.length === 0) return { total: 0, schedules: [] };

  const combinations = courses.reduce((count, course) => count * course.sections.length, 1);
  if (combinations > MAX_COMBINATIONS) {
    throw new Error('A seleção passa de 200 mil combinações possíveis. Escolha menos disciplinas.');
  }

  const searchOrder = courses.map((course, index) => ({
    index,
    options: course.sections.map((section) => ({
      entry: { course, section },
      meetings: section.meetings.map(({ day, start, end }) => ({
        day,
        start: toMinutes(start),
        end: toMinutes(end),
      })),
    })),
  })).sort((first, second) => first.options.length - second.options.length);

  // A assinatura é estável mesmo quando a ordem de seleção muda.
  const signatureOrder = courses.map((course, index) => ({ id: course.id, index }))
    .sort((first, second) => {
      if (first.id === second.id) return 0;
      return first.id < second.id ? -1 : 1;
    });
  const selected = Array(courses.length);
  const meetingsByDay = Array.from({ length: DAYS.length + 1 }, () => []);
  const best = [];
  let total = 0;

  function compare(first, second) {
    for (const metric of RANKING_METRICS[preference]) {
      const difference = first[metric] - second[metric];
      if (difference !== 0) return difference;
    }

    if (first.signature === second.signature) return 0;
    return first.signature < second.signature ? -1 : 1;
  }

  function keepSchedule() {
    total += 1;
    if (limit === 0) return;

    const candidate = {
      ...summarize(meetingsByDay),
      signature: JSON.stringify(signatureOrder.map(({ id, index }) => [id, selected[index].section.id])),
    };

    if (best.length === limit && compare(candidate, best.at(-1)) >= 0) return;

    candidate.entries = selected.slice();
    const position = best.findIndex((schedule) => compare(candidate, schedule) < 0);
    if (position < 0) {
      best.push(candidate);
    } else {
      best.splice(position, 0, candidate);
    }
    if (best.length > limit) best.pop();
  }

  function search(depth) {
    if (depth === searchOrder.length) {
      keepSchedule();
      return;
    }

    const { index, options } = searchOrder[depth];
    for (const { entry, meetings } of options) {
      const conflicts = meetings.some((meeting) => (
        meetingsByDay[meeting.day].some((scheduled) => intervalsOverlap(scheduled, meeting))
      ));
      if (conflicts) continue;

      selected[index] = entry;
      for (const meeting of meetings) meetingsByDay[meeting.day].push(meeting);
      search(depth + 1);
      for (const meeting of meetings) meetingsByDay[meeting.day].pop();
    }
  }

  search(0);

  return {
    total,
    schedules: best.map(({ latestEnd, ...schedule }) => schedule),
  };
}
