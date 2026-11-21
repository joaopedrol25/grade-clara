import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateSchedules,
  intervalsOverlap,
  MAX_COMBINATIONS,
  toMinutes,
  validateCatalog,
} from '../src/scheduler.mjs';

function course(id, sections) {
  return {
    id,
    name: `Disciplina ${id}`,
    sections: sections.map(([sectionId, ...meetings]) => ({
      id: sectionId,
      name: `Turma ${sectionId}`,
      meetings,
    })),
  };
}

function meeting(day, start, end) {
  return { day, start, end };
}

test('allows touching intervals and ignores meetings on other days', () => {
  const first = meeting(1, '08:00', '10:00');

  assert.equal(intervalsOverlap(first, meeting(1, '10:00', '11:00')), false);
  assert.equal(intervalsOverlap(first, meeting(2, '08:00', '10:00')), false);
  assert.equal(intervalsOverlap(first, meeting(1, '09:59', '11:00')), true);
  assert.equal(intervalsOverlap(first, meeting(1, '08:30', '09:00')), true);
});

test('converts valid times and rejects invalid input', () => {
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('08:05'), 485);
  assert.equal(toMinutes('23:59'), 1439);
  assert.throws(() => toMinutes('24:00'), /HH:MM/);
  assert.throws(() => toMinutes('8:05'), /HH:MM/);
  assert.throws(() => toMinutes(485), /HH:MM/);
});

test('checks every weekly meeting and releases the occupied intervals when backtracking', () => {
  const first = course('a', [
    ['1', meeting(1, '08:00', '09:00'), meeting(3, '10:00', '11:00')],
    ['2', meeting(1, '11:00', '12:00'), meeting(3, '09:00', '10:00')],
  ]);
  const second = course('b', [
    ['1', meeting(1, '09:00', '10:00'), meeting(3, '10:30', '11:30')],
    ['2', meeting(1, '09:00', '10:00'), meeting(3, '11:00', '12:00')],
  ]);

  const result = generateSchedules([first, second]);

  assert.equal(result.total, 3);
  assert.deepEqual(result.schedules.map(({ entries }) => entries.map(({ section }) => section.id)), [
    ['1', '2'],
    ['2', '1'],
    ['2', '2'],
  ]);
  assert.equal(result.schedules[0].gapMinutes, 0);
  assert.equal(result.schedules[1].gapMinutes, 90);
});

test('ranks all valid schedules and counts those beyond the output limit', () => {
  const first = course('a', [['1', meeting(1, '08:00', '09:00')]]);
  const second = course('b', [
    ['dias', meeting(1, '12:00', '13:00')],
    ['cedo', meeting(2, '08:00', '09:00'), meeting(1, '10:00', '10:30')],
    ['janelas', meeting(2, '12:00', '13:00')],
  ]);

  for (const [preference, sectionId, days, gapMinutes] of [
    ['gaps', 'janelas', 2, 0],
    ['days', 'dias', 1, 180],
    ['early', 'cedo', 2, 60],
  ]) {
    const { total, schedules } = generateSchedules([first, second], { preference, limit: 1 });

    assert.equal(total, 3);
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].entries[1].section.id, sectionId);
    assert.equal(schedules[0].days, days);
    assert.equal(schedules[0].gapMinutes, gapMinutes);
  }

  assert.deepEqual(generateSchedules([first, second], { limit: 0 }), { total: 3, schedules: [] });
});

test('preserves input display order and stable signatures with tied metrics', () => {
  const first = course('a', [
    ['1', meeting(1, '08:00', '09:00')],
    ['2', meeting(1, '08:00', '09:00')],
  ]);
  const second = course('b', [['1', meeting(1, '09:00', '10:00')]]);

  const original = generateSchedules([first, second]);
  const reordered = generateSchedules([second, { ...first, sections: first.sections.toReversed() }]);

  assert.deepEqual(original.schedules.map(({ signature }) => signature),
    reordered.schedules.map(({ signature }) => signature));
  assert.deepEqual(reordered.schedules[0].entries.map(({ course: subject }) => subject.id), ['b', 'a']);
});

test('returns no options for empty or incompatible selections', () => {
  const first = course('a', [['1', meeting(1, '08:00', '09:00')]]);
  const second = course('b', [['1', meeting(1, '08:30', '09:30')]]);

  assert.deepEqual(generateSchedules([]), { total: 0, schedules: [] });
  assert.deepEqual(generateSchedules([first, second]), { total: 0, schedules: [] });
  assert.throws(() => generateSchedules([first], { preference: 'invalid' }), /ordenação/);
  assert.throws(() => generateSchedules([first], { limit: -1 }), /limite/);
});

test('rejects searches above the combination budget before enumerating', () => {
  const choices = Array.from({ length: 10 }, (_, index) => [`${index}`, meeting(1, '08:00', '09:00')]);
  const sixCourses = Array.from({ length: 6 }, (_, index) => course(`${index}`, choices));

  assert.equal(MAX_COMBINATIONS, 200_000);
  assert.throws(() => generateSchedules(sixCourses), /200 mil combinações/);
  assert.deepEqual(generateSchedules(sixCourses.slice(1)), { total: 0, schedules: [] });
});

test('normalizes names and orders meetings without touching the original catalog', () => {
  const first = course(' a ', [['1', meeting(2, '10:30', '11:30'), meeting(1, '08:00', '09:00')]]);
  first.name = ' Programação I ';
  const second = course('b', [['1', meeting(5, '17:00', '19:00')]]);

  const normalized = validateCatalog([first, second]);

  assert.equal(normalized[0].id, 'a');
  assert.equal(normalized[0].name, 'Programação I');
  assert.deepEqual(normalized[0].sections[0].meetings.map(({ day }) => day), [1, 2]);
  assert.deepEqual(first.sections[0].meetings.map(({ day }) => day), [2, 1]);
});

test('rejects missing data, duplicate IDs, invalid times, and internal collisions', () => {
  const validOption = ['1', meeting(1, '08:00', '09:00')];

  assert.throws(() => validateCatalog({}), /catálogo/);
  assert.throws(() => validateCatalog([course('a', [])]), /lista de turmas/);
  assert.throws(() => validateCatalog([course('a', [['1']])]), /lista de horários/);
  assert.throws(() => validateCatalog([course('a', [validOption]), course(' a ', [validOption])]), /repetido/);
  assert.throws(() => validateCatalog([course('a', [validOption, validOption])]), /repetido/);
  assert.throws(() => validateCatalog([course('a', [['1', meeting(0, '08:00', '09:00')]])]), /dia/);
  assert.throws(() => validateCatalog([course('a', [['1', meeting(1, '09:00', '09:00')]])]), /Horário inválido/);
  assert.throws(() => validateCatalog([course('a', [['1', meeting(1, '23:00', '24:00')]])]), /Horário inválido/);
  assert.throws(() => validateCatalog([
    course('a', [['1', meeting(1, '08:30', '09:30'), meeting(1, '08:00', '09:00')]]),
  ]), /sobrepostos/);
});
