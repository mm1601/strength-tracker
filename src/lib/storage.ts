import { INITIAL_EXERCISES } from '../data/defaults';
import { sortMembersByGojun } from './memberSort';
import type { ExerciseDefinition, TeamMember, WorkoutRecord } from '../types';

const RECORDS_KEY = 'strength-log.records.v1';
const EXERCISES_KEY = 'strength-log.exercises.v1';
const MEMBERS_KEY = 'strength-log.members.v1';
const THEME_KEY = 'strength-log.theme.v1';
export const DEFAULT_MEMBER_NAME = '未設定';

const canUseLocalStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const loadRecords = (): WorkoutRecord[] => {
  if (!canUseLocalStorage()) return [];
  return safeParse<WorkoutRecord[]>(window.localStorage.getItem(RECORDS_KEY), []).map((record) => ({
    ...record,
    memberName: record.memberName?.trim() || DEFAULT_MEMBER_NAME,
  }));
};

export const saveRecords = (records: WorkoutRecord[]) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // localStorage may be unavailable in private mode or when quota is exceeded.
  }
};

export const loadExercises = (): ExerciseDefinition[] => {
  if (!canUseLocalStorage()) return INITIAL_EXERCISES;
  const saved = safeParse<ExerciseDefinition[] | null>(window.localStorage.getItem(EXERCISES_KEY), null);
  if (!saved || saved.length === 0) return INITIAL_EXERCISES;

  const byName = new Map<string, ExerciseDefinition>();
  [...INITIAL_EXERCISES, ...saved].forEach((exercise) => {
    byName.set(exercise.name, exercise);
  });
  return Array.from(byName.values());
};

export const saveExercises = (exercises: ExerciseDefinition[]) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(EXERCISES_KEY, JSON.stringify(exercises));
  } catch {
    // Keep the app usable even if persisting custom exercises fails.
  }
};

export const loadMembers = (): TeamMember[] => {
  if (!canUseLocalStorage()) return [{ name: DEFAULT_MEMBER_NAME, createdAt: new Date().toISOString() }];
  const saved = safeParse<TeamMember[] | null>(window.localStorage.getItem(MEMBERS_KEY), null);
  if (!saved || saved.length === 0) {
    return [{ name: DEFAULT_MEMBER_NAME, createdAt: new Date().toISOString() }];
  }

  const byName = new Map<string, TeamMember>();
  saved.forEach((member) => {
    const name = member.name.trim();
    if (name) byName.set(name, { ...member, name, reading: member.reading?.trim() || undefined });
  });
  if (!byName.has(DEFAULT_MEMBER_NAME)) {
    byName.set(DEFAULT_MEMBER_NAME, { name: DEFAULT_MEMBER_NAME, createdAt: new Date().toISOString() });
  }
  return sortMembersByGojun(Array.from(byName.values()));
};

export const saveMembers = (members: TeamMember[]) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
  } catch {
    // Keep the app usable even if persisting the member list fails.
  }
};

export const loadTheme = (): 'light' | 'dark' => {
  if (!canUseLocalStorage()) return 'dark';
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const saveTheme = (theme: 'light' | 'dark') => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme persistence is nice-to-have.
  }
};
