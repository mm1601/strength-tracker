export type Category = '胸' | '背中' | '脚' | '肩' | '腕' | '腹筋' | '全身' | 'その他';

export type PeriodKey = 'all' | 'today' | '7d' | '30d' | '3m' | '6m' | '1y' | 'custom';

export type ExerciseDefinition = {
  name: string;
  category: Category;
  isBodyweight: boolean;
};

export type TeamMember = {
  name: string;
  createdAt: string;
};

export type WorkoutRecord = {
  id: string;
  memberName: string;
  date: string;
  category: Category;
  exercise: string;
  weight: number;
  reps: number;
  sets: number;
  bodyWeight: number | null;
  addedWeight: number | null;
  rpe: number | null;
  memo: string;
  estimatedOneRepMax: number | null;
  volume: number | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutFormState = {
  memberName: string;
  date: string;
  category: Category | '';
  exercise: string;
  weight: string;
  reps: string;
  sets: string;
  bodyWeight: string;
  addedWeight: string;
  rpe: string;
  memo: string;
};

export type Filters = {
  period: PeriodKey;
  memberName: string;
  category: Category | 'all';
  exercise: string;
  search: string;
  customStart: string;
  customEnd: string;
};

export type PrFlags = {
  oneRepMax: boolean;
  weight: boolean;
  reps: boolean;
  volume: boolean;
};

export type Difference = {
  delta: number;
  percent: number | null;
};

export type ExerciseStats = {
  exercise: string;
  category: Category;
  allTimeBestOneRepMax: WorkoutRecord | null;
  periodBestOneRepMax: WorkoutRecord | null;
  highestWeight: WorkoutRecord | null;
  highestReps: WorkoutRecord | null;
  highestVolume: WorkoutRecord | null;
  bestDate: string | null;
  lastTrainingDate: string | null;
  recordCount: number;
  firstOneRepMax: WorkoutRecord | null;
  latestOneRepMax: WorkoutRecord | null;
  previousOneRepMax: WorkoutRecord | null;
  latestVsPrevious: Difference | null;
  latestVsFirst: Difference | null;
  growthAmount: number | null;
  growthRate: number | null;
  latestPrFlags: PrFlags;
};

export type ImportResult = {
  imported: number;
  errors: string[];
  records: WorkoutRecord[];
  exercises: ExerciseDefinition[];
  members: TeamMember[];
};

export type CloudData = {
  records: WorkoutRecord[];
  exercises: ExerciseDefinition[];
  members: TeamMember[];
};
