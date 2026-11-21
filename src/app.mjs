import { buildCalendar } from './calendar.mjs';
import { defaultCourseIds, demoCatalog } from './catalog.mjs';
import { DAYS, generateSchedules, toMinutes, validateCatalog } from './scheduler.mjs';

const STORAGE_KEY = 'grade-clara:planner:v1';
const MAX_CATALOG_BYTES = 1024 * 1024;
const RESULT_LIMIT = 24;
const PREFERENCES = ['gaps', 'days', 'early'];

const byId = (id) => document.getElementById(id);

const ui = Object.fromEntries([
  'import-open', 'import-dialog', 'import-form', 'catalog-file', 'import-error',
  'sample-download', 'restore-demo', 'import-context', 'course-search', 'course-list',
  'selected-count', 'course-empty', 'planner-form', 'planner-error', 'preference',
  'generate', 'results-status', 'previous', 'next', 'export-calendar', 'calendar',
  'result-empty', 'schedule-sections', 'metric-courses', 'metric-days', 'metric-gaps', 'export-dialog',
  'export-form', 'calendar-start', 'calendar-weeks', 'export-error',
].map((id) => [id, byId(id)]));

const saved = readState();
let catalog = saved.catalog ?? demoCatalog;
let customCatalog = Boolean(saved.catalog);
let selected = new Set(saved.selected ?? defaultCourseIds);
let results = { total: 0, schedules: [] };
let currentIndex = 0;
let pendingImport = null;

function readState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!stored || !Array.isArray(stored.selected)) {
      return {};
    }

    const imported = stored.catalog === null ? null : validateCatalog(stored.catalog);
    const ids = new Set((imported ?? demoCatalog).map((course) => course.id));
    return {
      catalog: imported,
      selected: stored.selected.filter((id) => ids.has(id)),
      preference: PREFERENCES.includes(stored.preference) ? stored.preference : 'gaps',
    };
  } catch {
    return {};
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      catalog: customCatalog ? catalog : null,
      selected: [...selected],
      preference: ui.preference.value,
    }));
  } catch {
    // The planner also works when the browser disables local storage.
  }
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) {
    node.textContent = content;
  }
  return node;
}

function normalizeSearch(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

function renderCourses() {
  ui['import-context'].textContent = customCatalog ? 'Catálogo importado' : 'Catálogo de exemplo';
  const query = normalizeSearch(ui['course-search'].value.trim());
  const rows = [];

  for (const [index, course] of catalog.entries()) {
    if (!normalizeSearch(`${course.name} ${course.id}`).includes(query)) {
      continue;
    }

    const row = element('label', 'course-option');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = course.id;
    input.checked = selected.has(course.id);

    const initial = [...course.name][0].toLocaleUpperCase('pt-BR');
    const icon = element('span', `course-option-icon tone-${index % 6}`, initial);
    icon.setAttribute('aria-hidden', 'true');

    const details = element('span', 'course-option-info');
    details.append(element('strong', '', course.name), element('small', '', course.id));

    const count = course.sections.length;
    const badge = element('span', 'course-option-sections', `${count} ${count === 1 ? 'turma' : 'turmas'}`);

    row.append(input, icon, details, badge);
    rows.push(row);
  }

  ui['course-list'].replaceChildren(...rows);
  ui['course-empty'].hidden = rows.length > 0;
  renderSelection();
}

function renderSelection() {
  ui['selected-count'].textContent = `${selected.size} ${selected.size === 1 ? 'selecionada' : 'selecionadas'}`;
  ui.generate.disabled = selected.size === 0;
}

function showError(node, message = '') {
  node.textContent = message;
  node.hidden = message.length === 0;
}

function buildGrades() {
  const courses = catalog.filter((course) => selected.has(course.id));
  clearResults();
  if (courses.length === 0) {
    return;
  }

  try {
    results = generateSchedules(courses, { preference: ui.preference.value, limit: RESULT_LIMIT });

    if (results.total === 0) {
      renderResults('As turmas selecionadas têm choques de horário. Tente retirar uma disciplina.');
      return;
    }

    renderResults();
  } catch (error) {
    showError(ui['planner-error'], error.message);
    renderResults('Ajuste a seleção e tente novamente.');
  }
}

function clearResults() {
  results = { total: 0, schedules: [] };
  currentIndex = 0;
  showError(ui['planner-error']);
  renderResults(selected.size ? 'Gere as grades para comparar os horários.' : 'Selecione pelo menos uma disciplina para começar.');
}

function formatClock(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function renderResults(emptyMessage = '') {
  const schedule = results.schedules[currentIndex];
  ui.previous.disabled = currentIndex === 0;
  ui.next.disabled = currentIndex >= results.schedules.length - 1;
  ui['export-calendar'].disabled = !schedule;
  ui.calendar.hidden = !schedule;
  ui['schedule-sections'].hidden = !schedule;
  ui['result-empty'].hidden = Boolean(schedule);
  ui['metric-courses'].textContent = schedule?.entries.length ?? '–';
  ui['metric-days'].textContent = schedule?.days ?? '–';
  ui['metric-gaps'].textContent = schedule ? formatDuration(schedule.gapMinutes) : '–';

  if (!schedule) {
    ui['results-status'].textContent = 'Nenhuma grade exibida';
    ui['result-empty'].textContent = emptyMessage;
    ui.calendar.replaceChildren();
    ui['schedule-sections'].replaceChildren();
    return;
  }

  const shown = results.schedules.length;
  const suffix = results.total > shown ? ` · ${results.total.toLocaleString('pt-BR')} possíveis` : '';
  ui['results-status'].textContent = `Opção ${currentIndex + 1} de ${shown}${suffix}`;
  renderCalendar(schedule);
}

function renderCalendar(schedule) {
  const tones = new Map(catalog.map((course, index) => [course.id, index % 6]));
  const sections = schedule.entries.map(({ course, section }) => {
    const chip = element('li', `section-chip tone-${tones.get(course.id)}`);
    chip.append(element('strong', '', course.name), element('small', '', section.name));
    return chip;
  });
  ui['schedule-sections'].replaceChildren(...sections);
  const events = schedule.entries.flatMap(({ course, section }) => section.meetings.map((meeting) => ({
    ...meeting,
    course: course.name,
    section: section.name,
    tone: tones.get(course.id),
    startMinutes: toMinutes(meeting.start),
    endMinutes: toMinutes(meeting.end),
  })));
  events.sort((a, b) => a.startMinutes - b.startMinutes);

  const earliest = Math.min(...events.map(({ startMinutes }) => startMinutes));
  const latest = Math.max(...events.map(({ endMinutes }) => endMinutes));
  const start = Math.floor(earliest / 60) * 60;
  const end = Math.ceil(latest / 60) * 60;
  const span = end - start;
  const tickStep = span > 9 * 60 ? 120 : 60;
  const percent = (minutes) => `${(minutes / span) * 100}%`;
  const grid = element('div', 'calendar-grid');
  const axis = element('div', 'calendar-axis');
  axis.setAttribute('aria-hidden', 'true');
  grid.style.setProperty('--calendar-length', String(span / 60));

  grid.append(element('div', 'calendar-corner', 'Horário'));
  for (const day of DAYS) {
    grid.append(element('div', 'calendar-day', day.label));
  }
  grid.append(axis);

  const ticks = [];
  for (let minute = start; minute < end; minute += tickStep) {
    ticks.push(minute);
  }
  ticks.push(end);

  for (const minute of ticks) {
    const label = element('span', 'calendar-hour', formatClock(minute));
    label.style.setProperty('--top', percent(minute - start));
    axis.append(label);
  }

  for (const day of DAYS) {
    const track = element('div', 'calendar-track');
    for (const minute of ticks) {
      const line = element('span', 'calendar-rule');
      line.style.setProperty('--top', percent(minute - start));
      line.setAttribute('aria-hidden', 'true');
      track.append(line);
    }

    for (const event of events.filter(({ day: id }) => id === day.id)) {
      const block = element('div', `calendar-event tone-${event.tone}`);
      const hours = `${event.start} – ${event.end}`;
      block.style.setProperty('--top', percent(event.startMinutes - start));
      block.style.setProperty('--size', percent(event.endMinutes - event.startMinutes));
      block.title = `${event.course} · ${event.section} · ${day.label}, ${hours}`;
      const accessible = element('span', 'sr-only', `${day.label}, ${event.section}.`);
      block.append(accessible, element('strong', '', event.course), element('small', '', hours));
      track.append(block);
    }
    grid.append(track);
  }

  ui.calendar.replaceChildren(grid);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateCatalog(nextCatalog, imported) {
  catalog = nextCatalog;
  customCatalog = imported;
  selected = new Set(imported ? [] : defaultCourseIds);
  ui['course-search'].value = '';
  saveState();
  renderCourses();
  buildGrades();
}

function nextMonday() {
  const date = new Date();
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

ui['course-search'].addEventListener('input', renderCourses);
ui['course-list'].addEventListener('change', ({ target }) => {
  if (!target.matches('input[type="checkbox"]')) {
    return;
  }

  if (target.checked) {
    selected.add(target.value);
  } else {
    selected.delete(target.value);
  }
  renderSelection();
  saveState();
  clearResults();
});

ui.preference.value = saved.preference ?? 'gaps';
ui.preference.addEventListener('change', () => {
  saveState();
  clearResults();
});

ui['planner-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  buildGrades();
});

ui.previous.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderResults();
  }
});

ui.next.addEventListener('click', () => {
  if (currentIndex < results.schedules.length - 1) {
    currentIndex += 1;
    renderResults();
  }
});

ui['import-open'].addEventListener('click', () => {
  ui['import-form'].reset();
  showError(ui['import-error']);
  ui['restore-demo'].hidden = !customCatalog;
  ui['import-dialog'].showModal();
});

ui['import-dialog'].addEventListener('close', () => {
  pendingImport = null;
});

ui['sample-download'].addEventListener('click', () => {
  download('catalogo-exemplo.json', `${JSON.stringify(demoCatalog, null, 2)}\n`, 'application/json;charset=utf-8');
});

ui['restore-demo'].addEventListener('click', () => {
  pendingImport = null;
  updateCatalog(demoCatalog, false);
  ui['import-dialog'].close();
});

ui['import-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(ui['import-error']);

  const [file] = ui['catalog-file'].files;
  if (!file) {
    showError(ui['import-error'], 'Escolha um arquivo JSON para importar.');
    return;
  }
  if (file.size > MAX_CATALOG_BYTES) {
    showError(ui['import-error'], 'O arquivo precisa ter no máximo 1 MB.');
    return;
  }

  const operation = Symbol();
  pendingImport = operation;
  try {
    const raw = await file.text();
    if (pendingImport !== operation || !ui['import-dialog'].open) {
      return;
    }

    const nextCatalog = validateCatalog(JSON.parse(raw));
    updateCatalog(nextCatalog, true);
    ui['import-dialog'].close();
  } catch (error) {
    if (pendingImport === operation && ui['import-dialog'].open) {
      const message = error instanceof SyntaxError ? 'O arquivo contém JSON inválido.' : error.message;
      showError(ui['import-error'], message);
    }
  }
});

ui['export-calendar'].addEventListener('click', () => {
  showError(ui['export-error']);
  ui['calendar-start'].value ||= nextMonday();
  ui['export-dialog'].showModal();
});

ui['export-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  showError(ui['export-error']);

  try {
    const calendar = buildCalendar(
      results.schedules[currentIndex],
      ui['calendar-start'].value,
      ui['calendar-weeks'].valueAsNumber,
    );
    download('grade-clara.ics', calendar, 'text/calendar;charset=utf-8');
    ui['export-dialog'].close();
  } catch (error) {
    showError(ui['export-error'], error.message);
  }
});

for (const button of document.querySelectorAll('[data-close-dialog]')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}

renderCourses();
buildGrades();
