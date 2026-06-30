import { INITIAL_CATEGORIES } from '../data/defaults';
import {
  calculateEstimatedOneRepMax,
  calculateVolume,
  getExerciseCategory,
  isBodyweightExercise,
  toNumberOrNull,
} from './calculations';
import { DEFAULT_MEMBER_NAME } from './storage';
import type { Category, ExerciseDefinition, ImportResult, TeamMember, WorkoutRecord } from '../types';

const CSV_FIELDS = [
  'memberName',
  'date',
  'exercise',
  'category',
  'weight',
  'reps',
  'sets',
  'bodyWeight',
  'addedWeight',
  'rpe',
  'memo',
  'estimatedOneRepMax',
  'volume',
] as const;

const escapeCsv = (value: string | number | null) => {
  if (value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const recordsToCsv = (records: WorkoutRecord[]) => {
  const rows = records.map((record) =>
    CSV_FIELDS.map((field) => escapeCsv(record[field] as string | number | null)).join(','),
  );
  return [CSV_FIELDS.join(','), ...rows].join('\n');
};

export const downloadCsv = (records: WorkoutRecord[]) => {
  const blob = new Blob([recordsToCsv(records)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `strength-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const parseCsvRows = (text: string) => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
};

const isCategory = (value: string): value is Category => INITIAL_CATEGORIES.includes(value as Category);

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const importCsv = (
  text: string,
  existingExercises: ExerciseDefinition[],
  existingMembers: TeamMember[],
  existingRecords: WorkoutRecord[],
): ImportResult => {
  const rows = parseCsvRows(text.trim());
  const errors: string[] = [];
  if (rows.length < 2) {
    return {
      imported: 0,
      errors: ['CSVにデータ行がありません。'],
      records: existingRecords,
      exercises: existingExercises,
      members: existingMembers,
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const required = ['date', 'exercise', 'weight', 'reps', 'sets'];
  const missing = required.filter((header) => !headerIndex.has(header));
  if (missing.length) {
    return {
      imported: 0,
      errors: [`必須ヘッダーがありません: ${missing.join(', ')}`],
      records: existingRecords,
      exercises: existingExercises,
      members: existingMembers,
    };
  }

  const exercises = [...existingExercises];
  const members = [...existingMembers];
  const recordsToAdd: WorkoutRecord[] = [];

  rows.slice(1).forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const get = (field: string) => {
      const index = headerIndex.get(field);
      return index === undefined ? '' : (cells[index] ?? '').trim();
    };

    const date = get('date');
    const memberName = get('memberName') || DEFAULT_MEMBER_NAME;
    const exercise = get('exercise');
    const inferredCategory = getExerciseCategory(exercises, exercise);
    const rawCategory = get('category');
    const category = rawCategory ? (isCategory(rawCategory) ? rawCategory : null) : inferredCategory;
    const weight = toNumberOrNull(get('weight'));
    const reps = toNumberOrNull(get('reps'));
    const sets = toNumberOrNull(get('sets'));
    const bodyWeight = toNumberOrNull(get('bodyWeight'));
    const addedWeight = toNumberOrNull(get('addedWeight'));
    const rpe = toNumberOrNull(get('rpe'));
    const memo = get('memo');

    const rowErrors: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) rowErrors.push('date は YYYY-MM-DD 形式にしてください');
    if (!memberName) rowErrors.push('memberName が空です');
    if (!exercise) rowErrors.push('exercise が空です');
    if (!category) rowErrors.push('category が不正です');
    if (weight === null || weight < 0) rowErrors.push('weight は0以上の数値にしてください');
    if (reps === null || reps < 1) rowErrors.push('reps は1以上の数値にしてください');
    if (sets === null || sets < 1) rowErrors.push('sets は1以上の数値にしてください');
    if (bodyWeight !== null && bodyWeight < 0) rowErrors.push('bodyWeight は0以上の数値にしてください');
    if (addedWeight !== null && addedWeight < 0) rowErrors.push('addedWeight は0以上の数値にしてください');
    if (rpe !== null && (rpe < 1 || rpe > 10)) rowErrors.push('rpe は1〜10にしてください');

    if (rowErrors.length || !category || weight === null || reps === null || sets === null) {
      errors.push(`${rowNumber}行目: ${rowErrors.join(' / ')}`);
      return;
    }

    const now = new Date().toISOString();
    if (!exercises.some((item) => item.name === exercise)) {
      exercises.push({ name: exercise, category, isBodyweight: false });
    }
    if (!members.some((member) => member.name === memberName)) {
      members.push({ name: memberName, createdAt: now });
    }

    const isBodyweight = isBodyweightExercise(exercises, exercise);
    const estimatedOneRepMax =
      toNumberOrNull(get('estimatedOneRepMax')) ??
      calculateEstimatedOneRepMax({ isBodyweight, weight, reps, bodyWeight, addedWeight });
    const volume =
      toNumberOrNull(get('volume')) ??
      calculateVolume({ isBodyweight, weight, reps, sets, bodyWeight, addedWeight });

    recordsToAdd.push({
      id: makeId(),
      memberName,
      date,
      exercise,
      category,
      weight,
      reps,
      sets,
      bodyWeight,
      addedWeight,
      rpe,
      memo,
      estimatedOneRepMax,
      volume,
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    imported: recordsToAdd.length,
    errors,
    records: [...recordsToAdd, ...existingRecords],
    exercises,
    members,
  };
};
