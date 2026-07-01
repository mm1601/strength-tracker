const SPREADSHEET_ID_KEY = 'STRENGTH_TRACKER_SPREADSHEET_ID';
const SPREADSHEET_NAME = 'Strength Tracker Data';

const SHEETS = {
  records: [
    'id',
    'memberName',
    'date',
    'category',
    'exercise',
    'weight',
    'reps',
    'sets',
    'bodyWeight',
    'addedWeight',
    'rpe',
    'memo',
    'estimatedOneRepMax',
    'volume',
    'createdAt',
    'updatedAt',
  ],
  members: ['name', 'createdAt'],
  exercises: ['name', 'category', 'isBodyweight'],
};

function doGet(event) {
  const action = String((event.parameter && event.parameter.action) || 'load');
  if (action === 'ping') {
    return respond_({ ok: true, message: 'pong', updatedAt: new Date().toISOString() }, event);
  }
  if (action === 'load') {
    return respond_({ ok: true, data: loadAllData_(), updatedAt: new Date().toISOString() }, event);
  }
  return respond_({ ok: false, error: `Unknown action: ${action}` }, event);
}

function doPost(event) {
  try {
    const body = event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {};
    const action = String(body.action || '');
    if (action !== 'saveAll') {
      return respond_({ ok: false, error: `Unknown action: ${action}` }, event);
    }
    saveAllData_(body.data || {});
    return respond_({ ok: true, updatedAt: new Date().toISOString() }, event);
  } catch (error) {
    return respond_({ ok: false, error: error.message || String(error) }, event);
  }
}

function setup() {
  return loadAllData_();
}

function loadAllData_() {
  const spreadsheet = getSpreadsheet_();
  return {
    records: readSheet_(spreadsheet, 'records'),
    members: readSheet_(spreadsheet, 'members'),
    exercises: readSheet_(spreadsheet, 'exercises').map((exercise) => ({
      ...exercise,
      isBodyweight: exercise.isBodyweight === true || exercise.isBodyweight === 'true',
    })),
  };
}

function saveAllData_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    const spreadsheet = getSpreadsheet_();
    writeSheet_(spreadsheet, 'records', Array.isArray(data.records) ? data.records : []);
    writeSheet_(spreadsheet, 'members', Array.isArray(data.members) ? data.members : []);
    writeSheet_(spreadsheet, 'exercises', Array.isArray(data.exercises) ? data.exercises : []);
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(SPREADSHEET_ID_KEY);
  if (existingId) {
    const spreadsheet = SpreadsheetApp.openById(existingId);
    ensureSheets_(spreadsheet);
    return spreadsheet;
  }

  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  properties.setProperty(SPREADSHEET_ID_KEY, spreadsheet.getId());
  ensureSheets_(spreadsheet);
  return spreadsheet;
}

function ensureSheets_(spreadsheet) {
  Object.keys(SHEETS).forEach((sheetName) => {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }
    const headers = SHEETS[sheetName];
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const needsHeader = headers.some((header, index) => currentHeaders[index] !== header);
    if (needsHeader) {
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function readSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  const headers = SHEETS[sheetName];
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = normalizeCell_(row[index]);
      });
      return item;
    });
}

function writeSheet_(spreadsheet, sheetName, rows) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const headers = SHEETS[sheetName];
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  if (!rows.length) return;

  const values = rows.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      return value;
    }),
  );
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function normalizeCell_(value) {
  if (value === '') return null;
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  return value;
}

function respond_(payload, event) {
  const callback = event && event.parameter && event.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(payload)})`).setMimeType(
      ContentService.MimeType.JAVASCRIPT,
    );
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
