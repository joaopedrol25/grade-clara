import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCalendar } from '../src/calendar.mjs';

function scheduleWithName(name = 'Estruturas de Dados') {
  return {
    entries: [
      {
        course: { id: 'estruturas-de-dados', name },
        section: {
          id: 'a',
          name: 'Turma A',
          meetings: [
            { day: 1, start: '08:00', end: '09:40' },
            { day: 5, start: '10:30', end: '12:10' },
          ],
        },
      },
    ],
  };
}

test('exporta cada encontro no horário local com a recorrência da semana', () => {
  const calendar = buildCalendar(scheduleWithName(), '2025-12-29', 16);
  assert.ok(calendar.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(calendar.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(calendar.replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(calendar, /DTSTAMP:\d{8}T\d{6}Z\r\n/);
  assert.ok(calendar.includes('DTSTART:20251229T080000\r\nDTEND:20251229T094000\r\n'));
  assert.ok(calendar.includes('RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=MO\r\n'));
  assert.ok(calendar.includes('DTSTART:20260102T103000\r\nDTEND:20260102T121000\r\n'));
  assert.ok(calendar.includes('RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=FR\r\n'));

  const eventIds = calendar.match(/^UID:.+$/gm);
  assert.equal(eventIds.length, 2);
  assert.notEqual(eventIds[0], eventIds[1]);
});

test('escapa caracteres especiais e dobra linhas pelo número de octetos UTF-8', () => {
  const name = 'Programação; redes, dados\\móveis\r\n' + '🧪á'.repeat(30);
  const calendar = buildCalendar(scheduleWithName(name), '2024-02-26', 1);
  const physicalLines = calendar.split('\r\n');
  assert.ok(physicalLines.some((line) => line.startsWith(' ')));
  assert.ok(physicalLines.every((line) => Buffer.byteLength(line, 'utf8') <= 75));
  assert.deepEqual(Buffer.from(calendar).toString('utf8'), calendar);

  const unfolded = calendar.replaceAll('\r\n ', '');
  assert.ok(unfolded.includes(`SUMMARY:Programação\\; redes\\, dados\\\\móveis\\n${'🧪á'.repeat(30)}\r\n`));
  assert.ok(unfolded.includes('DTSTART:20240301T103000\r\n'));
});

test('rejeita datas inválidas e períodos fora do intervalo permitido', () => {
  for (const initialDate of ['2024-02-30', '2024-02-27', '2024-2-26', '2021-02-29', '0000-01-03', '']) {
    assert.throws(() => buildCalendar(scheduleWithName(), initialDate, 1), /segunda-feira/);
  }
  for (const weekCount of [0, 31, 1.5, '1']) {
    assert.throws(() => buildCalendar(scheduleWithName(), '2024-02-26', weekCount), /1 e 30 semanas/);
  }
  assert.throws(() => buildCalendar(scheduleWithName(), '9999-12-27', 2), /ano 9999/);
  assert.throws(() => buildCalendar({ entries: [] }, '2024-02-26', 1), /grade com aulas/);
});
