const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR'];
const encoder = new TextEncoder();

function escapeText(text) {
  return text
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function foldLine(line) {
  const segments = [];
  let segment = '';
  let bytes = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      segments.push(segment);
      segment = ' ';
      bytes = 1;
    }
    segment += character;
    bytes += size;
  }

  segments.push(segment);
  return segments.join('\r\n');
}

function getFirstMonday(firstWeek) {
  if (typeof firstWeek !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(firstWeek)) {
    throw new Error('Informe a data da primeira segunda-feira.');
  }

  const date = new Date(`${firstWeek}T00:00:00Z`);
  if (date.getUTCDay() !== 1 || date.getUTCFullYear() < 1 || date.toISOString().slice(0, 10) !== firstWeek) {
    throw new Error('A data inicial precisa ser uma segunda-feira válida.');
  }
  return date.getTime();
}

function getStamp(date) {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
}

function localDateTime(day, time) {
  return `${day}T${time.replace(':', '')}00`;
}

/**
 * Export meeting times as floating local time, so 08:00 stays 08:00 in
 * the time zone of the user's calendar. UTC is used for date arithmetic
 * and the creation timestamp.
 */
export function buildCalendar(schedule, firstWeek, weekCount) {
  const firstMonday = getFirstMonday(firstWeek);
  if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 30) {
    throw new Error('Escolha entre 1 e 30 semanas para o calendário.');
  }

  const lastFriday = new Date(firstMonday + ((weekCount - 1) * 7 + 4) * DAY_MS);
  if (lastFriday.getUTCFullYear() > 9999) {
    throw new Error('O período do calendário precisa terminar até o ano 9999.');
  }

  const meetings = schedule.entries.flatMap(({ course, section }) =>
    section.meetings.map((meeting) => ({ course, section, meeting })),
  );
  if (meetings.length === 0) {
    throw new Error('Gere uma grade com aulas antes de exportar.');
  }

  const calendarId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const stamp = getStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grade Clara//Montador de Grade//PT-BR',
    'CALSCALE:GREGORIAN',
  ];

  meetings.forEach(({ course, section, meeting }, index) => {
    const day = new Date(firstMonday + (meeting.day - 1) * DAY_MS)
      .toISOString().slice(0, 10).replaceAll('-', '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${calendarId}-${index}@grade-clara.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localDateTime(day, meeting.start)}`,
      `DTEND:${localDateTime(day, meeting.end)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${weekCount};BYDAY=${WEEKDAYS[meeting.day - 1]}`,
      `SUMMARY:${escapeText(course.name)}`,
      `DESCRIPTION:${escapeText(section.name)}`,
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
