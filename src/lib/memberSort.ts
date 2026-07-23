import type { TeamMember } from '../types';

export type MemberInputEntry = {
  name: string;
  reading?: string;
};

const japaneseCollator = new Intl.Collator('ja-JP', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
});

export const normalizeMemberReading = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[ \u3000・･.,、，]/g, '')
    .toLowerCase();
};

export const compareMembersByGojun = (a: Pick<TeamMember, 'name' | 'reading'>, b: Pick<TeamMember, 'name' | 'reading'>) => {
  const aKey = normalizeMemberReading(a.reading) || normalizeMemberReading(a.name);
  const bKey = normalizeMemberReading(b.reading) || normalizeMemberReading(b.name);
  const keyCompare = japaneseCollator.compare(aKey, bKey);
  if (keyCompare !== 0) return keyCompare;
  return japaneseCollator.compare(a.name, b.name);
};

export const sortMembersByGojun = <T extends Pick<TeamMember, 'name' | 'reading'>>(members: T[]) =>
  [...members].sort(compareMembersByGojun);

const looksLikeKana = (value: string) => /[\u3040-\u309f\u30a0-\u30ff]/.test(value);

const parsePair = (line: string): MemberInputEntry | null => {
  const strongPair = line.split(/\t+|[|｜]/).map((value) => value.trim()).filter(Boolean);
  if (strongPair.length >= 2) {
    return { name: strongPair[0], reading: strongPair[1] };
  }

  const commaPair = line.split(/[,、，]/).map((value) => value.trim()).filter(Boolean);
  if (commaPair.length === 2 && looksLikeKana(commaPair[1])) {
    return { name: commaPair[0], reading: commaPair[1] };
  }

  return null;
};

export const parseMemberEntries = (text: string): MemberInputEntry[] => {
  const entries: MemberInputEntry[] = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const pair = parsePair(line);
      if (pair) {
        entries.push(pair);
        return;
      }

      line
        .split(/[,、，]+/)
        .map((name) => name.trim())
        .filter(Boolean)
        .forEach((name) => entries.push({ name }));
    });

  const byName = new Map<string, MemberInputEntry>();
  entries.forEach((entry) => {
    const name = entry.name.trim();
    if (!name) return;
    const reading = entry.reading?.trim();
    byName.set(name, reading ? { name, reading } : { name });
  });
  return Array.from(byName.values());
};
