const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const DEFAULT_TIMES = ['08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00', '13:00 - 14:00', '14:00 - 15:00', '15:00 - 16:00', '16:00 - 17:00', '17:00 - 18:00', '18:00 - 19:00', '19:00 - 20:00'];
const STORAGE_KEY = 'weekly-planner-events-v1';
const TIME_KEY = 'weekly-planner-times-v1';
const TIME_NOTE_KEY = 'weekly-planner-time-notes-v1';
const TITLE_KEY = 'weekly-planner-title-v1';
const COPY_KEY = 'weekly-planner-copy-v1';

const grid = document.querySelector('#calendarGrid');
const pageTitle = document.querySelector('#pageTitle');
const toast = document.querySelector('#toast');
const dialogBackdrop = document.querySelector('#dialogBackdrop');
const eventDialog = document.querySelector('#eventDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogContext = document.querySelector('#dialogContext');
const eventTitleLabel = document.querySelector('#eventTitleLabel');
const eventNoteLabel = document.querySelector('#eventNoteLabel');
const eventTitleInput = document.querySelector('#eventTitleInput');
const eventNoteInput = document.querySelector('#eventNoteInput');
const eventDurationLabel = document.querySelector('#eventDurationLabel');
const eventDurationInput = document.querySelector('#eventDurationInput');
const timeInputLabel = document.querySelector('#timeInputLabel');
const timeInput = document.querySelector('#timeInput');
const timeNoteLabel = document.querySelector('#timeNoteLabel');
const timeNoteInput = document.querySelector('#timeNoteInput');
const titleInputLabel = document.querySelector('#titleInputLabel');
const titleInput = document.querySelector('#titleInput');
const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
let times = JSON.parse(localStorage.getItem(TIME_KEY) || 'null') || [...DEFAULT_TIMES];
let timeNotes = JSON.parse(localStorage.getItem(TIME_NOTE_KEY) || 'null') || [];
let savedTitle = localStorage.getItem(TITLE_KEY) || '我的學期一週時間表';
const copyDefaults = Object.fromEntries([...document.querySelectorAll('[data-edit-copy]')].map(element => [element.dataset.editCopy, element.textContent]));
let copyTexts = { ...copyDefaults, ...JSON.parse(localStorage.getItem(COPY_KEY) || '{}') };
if (times.length < DEFAULT_TIMES.length) times = [...times, ...DEFAULT_TIMES.slice(times.length)];
let toastTimer;
let dialogMode = null;
let dialogKey = null;
let dialogDuration = 1;
let selectedRange = null;
let dragStart = null;
let resizeStart = null;
let isDragging = false;
let copyKey = null;

function render() {
  let html = '<div class="grid-header"><span class="day-name">時間</span><span class="day-date">可自訂</span></div>';

  DAYS.forEach(day => { html += `<div class="grid-header"><span class="day-name">${day}</span></div>`; });

  times.forEach((time, timeIndex) => {
    const timeNote = timeNotes[timeIndex] || '';
    html += `<div class="time-label"><button type="button" data-edit-time="${timeIndex}" title="編輯時間"><span>${escapeHtml(time)}</span>${timeNote ? `<small class="time-note">${escapeHtml(timeNote)}</small>` : ''}</button></div>`;
    DAYS.forEach((_, dayIndex) => {
      const key = `${dayIndex}-${timeIndex}`;
      const event = events[key];
      const covered = Object.entries(events).some(([eventKey, value]) => {
        const [eventDay, eventRow] = eventKey.split('-').map(Number);
        return eventDay === dayIndex && timeIndex > eventRow && timeIndex < eventRow + (value.duration || 1);
      });
      if (covered) return;
      const duration = Math.min(event?.duration || 1, times.length - timeIndex);
      const selected = selectedRange && selectedRange.dayIndex === dayIndex && timeIndex >= selectedRange.start && timeIndex <= selectedRange.end;
      html += `<div class="cell${selected ? ' selected' : ''}" data-add-event="${key}" data-time="${time}" data-day="${DAYS[dayIndex]}" style="grid-column:${dayIndex + 2};grid-row:${timeIndex + 2}${duration > 1 ? `;grid-row-end:span ${duration}` : ''}">`;
      if (event) {
        html += `<article class="event ${event.color || ''}"><button class="resize-surface" type="button" aria-label="拖曳伸縮日程時段"></button><button class="delete-event" type="button" data-delete-event="${key}" aria-label="刪除 ${event.title}">×</button><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.note || (duration > 1 ? `${duration} 個時間段` : '已安排'))}</small></article>`;
      }
      html += '</div>';
    });
  });
  grid.innerHTML = html;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function getTimeRows() {
  return Array.from(grid.querySelectorAll('[data-edit-time]')).map(button => ({
    index: Number(button.dataset.editTime),
    bounds: button.closest('.time-label').getBoundingClientRect()
  }));
}

function getTimeIndexAtPoint(y, timeRows) {
  const startRow = timeRows[0];
  const rowHeight = startRow.bounds.height;
  const targetIndex = Math.floor((y - startRow.bounds.top) / rowHeight);
  return Math.max(0, Math.min(timeRows.length - 1, targetIndex));
}

function resizeEventAtPoint(y) {
  if (!resizeStart) return;
  const timeIndex = getTimeIndexAtPoint(y, resizeStart.timeRows);
  if (timeIndex < resizeStart.timeIndex) return;
  const duration = timeIndex - resizeStart.timeIndex + 1;
  const blocked = Object.entries(events).some(([eventKey, value]) => {
    if (eventKey === resizeStart.key) return false;
    const [eventDay, eventRow] = eventKey.split('-').map(Number);
    const eventEnd = eventRow + (value.duration || 1);
    return eventDay === resizeStart.dayIndex && eventRow < resizeStart.timeIndex + duration && eventEnd > resizeStart.timeIndex;
  });
  if (blocked) return;
  if (events[resizeStart.key].duration !== duration) {
    events[resizeStart.key].duration = duration;
    isDragging = true;
    render();
  }
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); localStorage.setItem(TIME_KEY, JSON.stringify(times)); localStorage.setItem(TIME_NOTE_KEY, JSON.stringify(timeNotes)); localStorage.setItem(TITLE_KEY, savedTitle); localStorage.setItem(COPY_KEY, JSON.stringify(copyTexts)); }
function notify(message) { toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200); }

function openEventDialog(key, day, time, duration = 1, existingEvent = null) {
  dialogMode = existingEvent ? 'edit-event' : 'event'; dialogKey = key; dialogDuration = duration;
  dialogTitle.textContent = existingEvent ? '編輯安排' : (duration > 1 ? '新增跨時段安排' : '新增安排');
  dialogContext.textContent = `${day}・${time}${duration > 1 ? `，連續 ${duration} 個時間段` : ''}`;
  eventTitleLabel.hidden = false; eventNoteLabel.hidden = false; eventDurationLabel.hidden = false; timeInputLabel.hidden = true; timeNoteLabel.hidden = true; titleInputLabel.hidden = true; eventTitleInput.required = true; eventDurationInput.required = true; titleInput.required = false;
  eventTitleInput.value = existingEvent?.title || ''; eventNoteInput.value = existingEvent?.note || '';
  eventDurationInput.value = duration;
  dialogBackdrop.hidden = false; eventTitleInput.focus();
}

function openTitleDialog() {
  dialogMode = 'title'; dialogKey = null;
  dialogTitle.textContent = '編輯大標'; dialogContext.textContent = '這個標題會顯示在行事曆最上方';
  eventTitleLabel.hidden = true; eventNoteLabel.hidden = true; eventDurationLabel.hidden = true; timeInputLabel.hidden = true; timeNoteLabel.hidden = true; titleInputLabel.hidden = false; eventTitleInput.required = false; eventDurationInput.required = false; titleInput.required = true;
  titleInputLabel.firstChild.textContent = '大標文字'; titleInput.value = savedTitle; dialogBackdrop.hidden = false; titleInput.focus();
}

function openCopyDialog(key) {
  dialogMode = 'copy'; copyKey = key;
  dialogTitle.textContent = '編輯文字'; dialogContext.textContent = '這段文字會顯示在行事曆上';
  eventTitleLabel.hidden = true; eventNoteLabel.hidden = true; eventDurationLabel.hidden = true; timeInputLabel.hidden = true; timeNoteLabel.hidden = true; titleInputLabel.hidden = false; eventTitleInput.required = false; eventDurationInput.required = false; titleInput.required = true;
  titleInputLabel.firstChild.textContent = '文字內容'; titleInput.value = copyTexts[key]; dialogBackdrop.hidden = false; titleInput.focus();
}

function openTimeDialog(index) {
  dialogMode = 'time'; dialogKey = index;
  dialogTitle.textContent = '編輯時間段'; dialogContext.textContent = '這一列會套用到整週行事曆';
  eventTitleLabel.hidden = true; eventNoteLabel.hidden = true; eventDurationLabel.hidden = true; timeInputLabel.hidden = false; timeNoteLabel.hidden = false; titleInputLabel.hidden = true; eventTitleInput.required = false; eventDurationInput.required = false; titleInput.required = false;
  timeInput.value = times[index]; timeNoteInput.value = timeNotes[index] || '';
  dialogBackdrop.hidden = false; timeInput.focus();
}

function closeDialog() { dialogBackdrop.hidden = true; eventDialog.reset(); }

grid.addEventListener('click', event => {
  const deleteButton = event.target.closest('[data-delete-event]');
  if (deleteButton) {
    delete events[deleteButton.dataset.deleteEvent]; save(); render(); notify('事件已刪除'); return;
  }
  const editButton = event.target.closest('[data-edit-time]');
  if (editButton) {
    openTimeDialog(Number(editButton.dataset.editTime));
    return;
  }
  const eventCard = event.target.closest('.event');
  if (eventCard) {
    const cell = eventCard.closest('[data-add-event]');
    const key = cell.dataset.addEvent;
    const existingEvent = events[key];
    openEventDialog(key, cell.dataset.day, cell.dataset.time, existingEvent.duration || 1, existingEvent);
    return;
  }
  const cell = event.target.closest('[data-add-event]');
  if (cell && !cell.querySelector('.event') && !isDragging) openEventDialog(cell.dataset.addEvent, cell.dataset.day, cell.dataset.time);
});

document.addEventListener('pointerdown', event => {
  const eventCard = event.target.closest('.event');
  if (!eventCard || event.target.closest('[data-delete-event]')) return;
  const cell = eventCard.closest('[data-add-event]');
  const [dayIndex, timeIndex] = cell.dataset.addEvent.split('-').map(Number);
  resizeStart = { key: cell.dataset.addEvent, dayIndex, timeIndex, duration: events[cell.dataset.addEvent].duration || 1, timeRows: getTimeRows() };
  isDragging = false;
}, true);

document.addEventListener('click', event => {
  const editableCopy = event.target.closest('[data-edit-copy]');
  if (editableCopy) openCopyDialog(editableCopy.dataset.editCopy);
});

grid.addEventListener('pointerdown', event => {
  const eventCard = event.target.closest('.event');
  if (eventCard && !event.target.closest('[data-delete-event]')) {
    const cell = eventCard.closest('[data-add-event]');
    const [dayIndex, timeIndex] = cell.dataset.addEvent.split('-').map(Number);
    resizeStart = { key: cell.dataset.addEvent, dayIndex, timeIndex, duration: events[cell.dataset.addEvent].duration || 1, timeRows: getTimeRows() };
    isDragging = false;
    event.preventDefault();
    return;
  }
  const cell = event.target.closest('[data-add-event]');
  if (!cell || cell.querySelector('.event')) return;
  const [dayIndex, timeIndex] = cell.dataset.addEvent.split('-').map(Number);
  dragStart = { dayIndex, timeIndex };
  isDragging = false;
});

document.addEventListener('pointermove', event => {
  if (resizeStart) {
    resizeEventAtPoint(event.clientY);
    return;
  }
  if (!dragStart) return;
  const cell = event.target.closest('[data-add-event]');
  if (!cell) return;
  const [dayIndex, timeIndex] = cell.dataset.addEvent.split('-').map(Number);
  if (dayIndex !== dragStart.dayIndex || timeIndex === dragStart.timeIndex) return;
  const start = Math.min(dragStart.timeIndex, timeIndex);
  const end = Math.max(dragStart.timeIndex, timeIndex);
  const blocked = Array.from({ length: end - start + 1 }, (_, offset) => {
    const row = start + offset;
    return Object.entries(events).some(([eventKey, value]) => {
      const [eventDay, eventRow] = eventKey.split('-').map(Number);
      const eventEnd = eventRow + (value.duration || 1);
      return eventDay === dayIndex && row >= eventRow && row < eventEnd;
    });
  });
  if (blocked.some(Boolean)) return;
  isDragging = true;
  if (!selectedRange || selectedRange.dayIndex !== dayIndex || selectedRange.start !== start || selectedRange.end !== end) {
    selectedRange = { dayIndex, start, end };
    render();
  }
}, true);

document.addEventListener('mousemove', event => {
  if (resizeStart) resizeEventAtPoint(event.clientY);
}, true);

function finishDrag() {
  if (!dragStart) return;
  const range = selectedRange;
  dragStart = null;
  if (!range) return;
  const key = `${range.dayIndex}-${range.start}`;
  selectedRange = null;
  isDragging = true;
  render();
  openEventDialog(key, DAYS[range.dayIndex], times[range.start], range.end - range.start + 1);
}

function finishResize() {
  if (!resizeStart) return;
  if (isDragging) {
    save();
    notify('合併時段已更新');
  }
  resizeStart = null;
}

document.addEventListener('pointerup', finishDrag);
document.addEventListener('mouseup', finishDrag);
window.addEventListener('pointerup', finishDrag);
window.addEventListener('mouseup', finishDrag);
document.addEventListener('pointerup', finishResize);
document.addEventListener('mouseup', finishResize);
window.addEventListener('pointerup', finishResize);
window.addEventListener('mouseup', finishResize);

eventDialog.addEventListener('submit', event => {
  event.preventDefault();
  if (dialogMode === 'title') {
    savedTitle = titleInput.value.trim() || '我的學期一週時間表'; pageTitle.textContent = savedTitle; save(); closeDialog(); notify('大標已更新'); return;
  }
  if (dialogMode === 'copy') {
    copyTexts[copyKey] = titleInput.value.trim(); document.querySelector(`[data-edit-copy="${copyKey}"]`).textContent = copyTexts[copyKey]; save(); closeDialog(); notify('文字已更新'); return;
  }
  if (dialogMode === 'time') {
    times[dialogKey] = timeInput.value.trim(); timeNotes[dialogKey] = timeNoteInput.value.trim(); save(); closeDialog(); render(); notify('時間段已更新'); return;
  }
  const colors = ['', 'mint', 'yellow'];
  const previousEvent = events[dialogKey];
  const duration = Math.max(1, Math.min(times.length - Number(dialogKey.split('-')[1]), Number(eventDurationInput.value) || dialogDuration));
  events[dialogKey] = { title: eventTitleInput.value.trim(), note: eventNoteInput.value.trim(), duration, color: previousEvent?.color || colors[Object.keys(events).length % colors.length] };
  save(); closeDialog(); render(); notify(dialogMode === 'edit-event' ? '安排已更新' : '事件已加入行事曆');
});

document.querySelector('#dialogCancel').addEventListener('click', closeDialog);
document.querySelector('#dialogClose').addEventListener('click', closeDialog);
dialogBackdrop.addEventListener('click', event => { if (event.target === dialogBackdrop) closeDialog(); });
pageTitle.addEventListener('click', openTitleDialog);

render();
pageTitle.textContent = savedTitle;
document.querySelectorAll('[data-edit-copy]').forEach(element => { element.textContent = copyTexts[element.dataset.editCopy]; });
