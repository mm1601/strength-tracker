import type { Category, ExerciseDefinition } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  '胸',
  '背中',
  '脚',
  '肩',
  '腕',
  '腹筋',
  '全身',
  'その他',
];

export const INITIAL_EXERCISES: ExerciseDefinition[] = [
  { name: 'ベンチプレス', category: '胸', isBodyweight: false },
  { name: 'インクラインベンチプレス', category: '胸', isBodyweight: false },
  { name: 'スクワット', category: '脚', isBodyweight: false },
  { name: 'レッグプレス', category: '脚', isBodyweight: false },
  { name: 'デッドリフト', category: '全身', isBodyweight: false },
  { name: '懸垂', category: '背中', isBodyweight: true },
  { name: 'ラットプルダウン', category: '背中', isBodyweight: false },
  { name: 'バーベルロー', category: '背中', isBodyweight: false },
  { name: 'ショルダープレス', category: '肩', isBodyweight: false },
  { name: 'アームカール', category: '腕', isBodyweight: false },
  { name: 'ディップス', category: '胸', isBodyweight: true },
  { name: 'レッグカール', category: '脚', isBodyweight: false },
  { name: 'レッグエクステンション', category: '脚', isBodyweight: false },
  { name: 'サイドレイズ', category: '肩', isBodyweight: false },
  { name: 'クランチ', category: '腹筋', isBodyweight: false },
];
