import type { CloudData, ExerciseDefinition, TeamMember, WorkoutRecord } from '../types';
import { sortMembersByGojun } from './memberSort';

export const CLOUD_API_URL =
  'https://script.google.com/macros/s/AKfycbwcIDAOqacmyZSGscQrg7OXwZP7SU1xNTP60XAX5pKts9SvhD0hA37Jd5mwviXekIjQzA/exec';

type CloudResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeCloudData = (data: Partial<CloudData> | undefined): CloudData => ({
  records: asArray<WorkoutRecord>(data?.records),
  exercises: asArray<ExerciseDefinition>(data?.exercises),
  members: sortMembersByGojun(
    asArray<TeamMember>(data?.members).map((member) => ({
      ...member,
      name: member.name?.trim() ?? '',
      reading: member.reading?.trim() || undefined,
    })),
  ).filter((member) => member.name),
});

export const loadCloudData = async (): Promise<CloudData> => {
  const url = new URL(CLOUD_API_URL);
  url.searchParams.set('action', 'load');
  url.searchParams.set('_', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`クラウド読込に失敗しました (${response.status})`);
  }

  let parsed: CloudResponse<CloudData>;
  try {
    parsed = JSON.parse(text) as CloudResponse<CloudData>;
  } catch {
    throw new Error('クラウドAPIがJSONを返していません。Apps Scriptの公開設定を確認してください。');
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || 'クラウド読込に失敗しました。');
  }

  return normalizeCloudData(parsed.data);
};

export const saveCloudData = async (data: CloudData) => {
  const response = await fetch(CLOUD_API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'saveAll',
      data,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`クラウド保存に失敗しました (${response.status})`);
  }

  let parsed: CloudResponse<never>;
  try {
    parsed = JSON.parse(text) as CloudResponse<never>;
  } catch {
    throw new Error('クラウドAPIがJSONを返していません。Apps Scriptの公開設定を確認してください。');
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || 'クラウド保存に失敗しました。');
  }
};
