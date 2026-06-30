import { INITIAL_CATEGORIES } from '../data/defaults';
import type {
  Category,
  Difference,
  ExerciseDefinition,
  ExerciseStats,
  Filters,
  PeriodKey,
  PrFlags,
  WorkoutRecord,
} from '../types';

export const roundOne = (value: number) => Math.round(value * 10) / 10;

export const toNumberOrNull = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const formatKg = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${roundOne(value).toFixed(1)}kg`;
};

export const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return roundOne(value).toFixed(1);
};

export const getExerciseDefinition = (exercises: ExerciseDefinition[], exerciseName: string) =>
  exercises.find((exercise) => exercise.name === exerciseName);

export const getExerciseCategory = (exercises: ExerciseDefinition[], exerciseName: string): Category =>
  getExerciseDefinition(exercises, exerciseName)?.category ?? 'その他';

export const isBodyweightExercise = (exercises: ExerciseDefinition[], exerciseName: string) =>
  Boolean(getExerciseDefinition(exercises, exerciseName)?.isBodyweight);

export const calculateTotalLoad = ({
  isBodyweight,
  weight,
  bodyWeight,
  addedWeight,
}: {
  isBodyweight: boolean;
  weight: number | null;
  bodyWeight: number | null;
  addedWeight: number | null;
}) => {
  if (isBodyweight) {
    if (bodyWeight === null || bodyWeight <= 0) return null;
    if (addedWeight !== null && addedWeight < 0) return null;
    const total = bodyWeight + (addedWeight ?? 0);
    return total > 0 ? roundOne(total) : null;
  }

  if (weight === null || weight <= 0) return null;
  return roundOne(weight);
};

export const calculateEstimatedOneRepMax = ({
  isBodyweight,
  weight,
  reps,
  bodyWeight,
  addedWeight,
}: {
  isBodyweight: boolean;
  weight: number | null;
  reps: number | null;
  bodyWeight: number | null;
  addedWeight: number | null;
}) => {
  if (reps === null || reps <= 0) return null;
  const totalLoad = calculateTotalLoad({ isBodyweight, weight, bodyWeight, addedWeight });
  if (totalLoad === null || totalLoad <= 0) return null;
  return roundOne(totalLoad * (1 + reps / 30));
};

export const calculateVolume = ({
  isBodyweight,
  weight,
  reps,
  sets,
  bodyWeight,
  addedWeight,
}: {
  isBodyweight: boolean;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  bodyWeight: number | null;
  addedWeight: number | null;
}) => {
  if (reps === null || reps <= 0 || sets === null || sets <= 0) return null;
  const totalLoad = calculateTotalLoad({ isBodyweight, weight, bodyWeight, addedWeight });
  if (totalLoad === null) return null;
  return roundOne(totalLoad * reps * sets);
};

export const compareDifference = (latest: number | null, base: number | null): Difference | null => {
  if (latest === null || base === null) return null;
  const delta = roundOne(latest - base);
  return {
    delta,
    percent: base === 0 ? null : roundOne((delta / base) * 100),
  };
};

export const formatSigned = (value: number | null | undefined, unit = '') => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (value === 0) return `±0.0${unit}`;
  return `${value > 0 ? '+' : ''}${roundOne(value).toFixed(1)}${unit}`;
};

export const formatDifference = (difference: Difference | null) => {
  if (!difference) return '-';
  const percent = difference.percent === null ? '-' : formatSigned(difference.percent, '%');
  return `${formatSigned(difference.delta, 'kg')} / ${percent}`;
};

const parseDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
};

export const getDateRange = (
  period: PeriodKey,
  customStart: string,
  customEnd: string,
  now = new Date(),
): { start: string | null; end: string | null } => {
  const today = toDateInputValue(now);
  switch (period) {
    case 'today':
      return { start: today, end: today };
    case '7d':
      return { start: toDateInputValue(addDays(now, -6)), end: today };
    case '30d':
      return { start: toDateInputValue(addDays(now, -29)), end: today };
    case '3m':
      return { start: toDateInputValue(addMonths(now, -3)), end: today };
    case '6m':
      return { start: toDateInputValue(addMonths(now, -6)), end: today };
    case '1y':
      return { start: toDateInputValue(addMonths(now, -12)), end: today };
    case 'custom':
      return { start: customStart || null, end: customEnd || null };
    case 'all':
    default:
      return { start: null, end: null };
  }
};

export const isRecordInPeriod = (record: WorkoutRecord, filters: Pick<Filters, 'period' | 'customStart' | 'customEnd'>) => {
  const { start, end } = getDateRange(filters.period, filters.customStart, filters.customEnd);
  if (start && record.date < start) return false;
  if (end && record.date > end) return false;
  return true;
};

export const applyFilters = (records: WorkoutRecord[], filters: Filters, includePeriod = true) => {
  const query = filters.search.trim().toLowerCase();
  return records.filter((record) => {
    if (includePeriod && !isRecordInPeriod(record, filters)) return false;
    if (filters.memberName !== 'all' && record.memberName !== filters.memberName) return false;
    if (filters.category !== 'all' && record.category !== filters.category) return false;
    if (filters.exercise !== 'all' && record.exercise !== filters.exercise) return false;
    if (query && !record.exercise.toLowerCase().includes(query)) return false;
    return true;
  });
};

export const sortRecordsDesc = (records: WorkoutRecord[]) =>
  [...records].sort((a, b) => {
    const dateSort = b.date.localeCompare(a.date);
    if (dateSort !== 0) return dateSort;
    return b.createdAt.localeCompare(a.createdAt);
  });

export const sortRecordsAsc = (records: WorkoutRecord[]) =>
  [...records].sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date);
    if (dateSort !== 0) return dateSort;
    return a.createdAt.localeCompare(b.createdAt);
  });

export const sumVolume = (records: WorkoutRecord[]) =>
  roundOne(records.reduce((sum, record) => sum + (record.volume ?? 0), 0));

export const groupVolumeByDate = (records: WorkoutRecord[]) => {
  const totals = new Map<string, number>();
  records.forEach((record) => {
    totals.set(record.date, (totals.get(record.date) ?? 0) + (record.volume ?? 0));
  });
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, volume]) => ({ date, volume: roundOne(volume) }));
};

export const groupVolumeByExercise = (records: WorkoutRecord[]) => {
  const totals = new Map<string, { exercise: string; category: Category; volume: number }>();
  records.forEach((record) => {
    const current = totals.get(record.exercise) ?? {
      exercise: record.exercise,
      category: record.category,
      volume: 0,
    };
    current.volume += record.volume ?? 0;
    totals.set(record.exercise, current);
  });
  return Array.from(totals.values())
    .map((row) => ({ ...row, volume: roundOne(row.volume) }))
    .sort((a, b) => b.volume - a.volume);
};

export const groupVolumeByCategory = (records: WorkoutRecord[]) =>
  INITIAL_CATEGORIES.map((category) => ({
    category,
    volume: roundOne(
      records.filter((record) => record.category === category).reduce((sum, record) => sum + (record.volume ?? 0), 0),
    ),
  })).filter((row) => row.volume > 0);

export const getDailyBestOneRepMax = (records: WorkoutRecord[]) => {
  const bestByDate = new Map<string, WorkoutRecord>();
  records
    .filter((record) => record.estimatedOneRepMax !== null)
    .forEach((record) => {
      const current = bestByDate.get(record.date);
      if (!current || (record.estimatedOneRepMax ?? 0) > (current.estimatedOneRepMax ?? 0)) {
        bestByDate.set(record.date, record);
      }
    });

  return Array.from(bestByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) => ({
      date: record.date,
      oneRepMax: record.estimatedOneRepMax ?? 0,
      weight: record.weight,
      reps: record.reps,
      sets: record.sets,
      volume: record.volume,
      bodyWeight: record.bodyWeight,
      addedWeight: record.addedWeight,
      exercise: record.exercise,
      memberName: record.memberName,
    }));
};

const maxBy = (
  records: WorkoutRecord[],
  value: (record: WorkoutRecord) => number | null,
): WorkoutRecord | null => {
  let best: WorkoutRecord | null = null;
  records.forEach((record) => {
    const nextValue = value(record);
    if (nextValue === null || !Number.isFinite(nextValue)) return;
    const bestValue = best ? value(best) : null;
    if (!best || bestValue === null || nextValue > bestValue) {
      best = record;
    }
  });
  return best;
};

export const getComparableWeight = (record: WorkoutRecord, exercises: ExerciseDefinition[]) => {
  if (isBodyweightExercise(exercises, record.exercise)) {
    return calculateTotalLoad({
      isBodyweight: true,
      weight: record.weight,
      bodyWeight: record.bodyWeight,
      addedWeight: record.addedWeight,
    });
  }
  return record.weight;
};

export const getPrFlagsForRecord = (
  record: WorkoutRecord,
  allRecords: WorkoutRecord[],
  exercises: ExerciseDefinition[],
): PrFlags => {
  const sameExercise = sortRecordsAsc(
    allRecords.filter((item) => item.exercise === record.exercise && item.memberName === record.memberName),
  );
  const previous = sameExercise.filter((item) => {
    if (item.date < record.date) return true;
    if (item.date === record.date && item.createdAt < record.createdAt) return true;
    return false;
  });

  const previousBestOneRm = maxBy(previous, (item) => item.estimatedOneRepMax)?.estimatedOneRepMax ?? null;
  const previousBestWeight = maxBy(previous, (item) => getComparableWeight(item, exercises));
  const previousBestReps = maxBy(previous, (item) => item.reps);
  const previousBestVolume = maxBy(previous, (item) => item.volume);
  const currentWeight = getComparableWeight(record, exercises);

  return {
    oneRepMax:
      record.estimatedOneRepMax !== null &&
      (previousBestOneRm === null || record.estimatedOneRepMax > previousBestOneRm),
    weight:
      currentWeight !== null &&
      (!previousBestWeight || currentWeight > (getComparableWeight(previousBestWeight, exercises) ?? -Infinity)),
    reps: !previousBestReps || record.reps > previousBestReps.reps,
    volume:
      record.volume !== null &&
      (!previousBestVolume || record.volume > (previousBestVolume.volume ?? -Infinity)),
  };
};

export const getRecordDifferences = (record: WorkoutRecord, allRecords: WorkoutRecord[]) => {
  const sameExercise = sortRecordsAsc(
    allRecords.filter(
      (item) =>
        item.exercise === record.exercise &&
        item.memberName === record.memberName &&
        item.estimatedOneRepMax !== null,
    ),
  );
  const currentIndex = sameExercise.findIndex((item) => item.id === record.id);
  if (currentIndex < 0 || record.estimatedOneRepMax === null) {
    return { previous: null, first: null };
  }

  const previous = currentIndex > 0 ? sameExercise[currentIndex - 1] : null;
  const first = sameExercise[0] ?? null;
  return {
    previous: compareDifference(record.estimatedOneRepMax, previous?.estimatedOneRepMax ?? null),
    first: compareDifference(record.estimatedOneRepMax, first?.estimatedOneRepMax ?? null),
  };
};

const getLatestValidOneRm = (records: WorkoutRecord[]) => {
  const valid = sortRecordsAsc(records.filter((record) => record.estimatedOneRepMax !== null));
  return valid[valid.length - 1] ?? null;
};

const getPreviousValidOneRm = (records: WorkoutRecord[]) => {
  const valid = sortRecordsAsc(records.filter((record) => record.estimatedOneRepMax !== null));
  return valid.length > 1 ? valid[valid.length - 2] : null;
};

export const buildExerciseStats = (
  allRecords: WorkoutRecord[],
  periodRecords: WorkoutRecord[],
  exercises: ExerciseDefinition[],
) => {
  const exerciseNames = Array.from(new Set([...allRecords, ...periodRecords].map((record) => record.exercise))).sort(
    (a, b) => a.localeCompare(b, 'ja'),
  );

  return exerciseNames.map<ExerciseStats>((exercise) => {
    const exerciseAllRecords = sortRecordsAsc(allRecords.filter((record) => record.exercise === exercise));
    const exercisePeriodRecords = sortRecordsAsc(periodRecords.filter((record) => record.exercise === exercise));
    const latestOneRepMax = getLatestValidOneRm(exercisePeriodRecords);
    const previousOneRepMax = getPreviousValidOneRm(exercisePeriodRecords);
    const firstOneRepMax = exercisePeriodRecords.find((record) => record.estimatedOneRepMax !== null) ?? null;
    const allTimeBestOneRepMax = maxBy(exerciseAllRecords, (record) => record.estimatedOneRepMax);
    const periodBestOneRepMax = maxBy(exercisePeriodRecords, (record) => record.estimatedOneRepMax);
    const highestWeight = maxBy(exercisePeriodRecords, (record) => getComparableWeight(record, exercises));
    const highestReps = maxBy(exercisePeriodRecords, (record) => record.reps);
    const highestVolume = maxBy(exercisePeriodRecords, (record) => record.volume);
    const latestVsPrevious = compareDifference(
      latestOneRepMax?.estimatedOneRepMax ?? null,
      previousOneRepMax?.estimatedOneRepMax ?? null,
    );
    const latestVsFirst = compareDifference(
      latestOneRepMax?.estimatedOneRepMax ?? null,
      firstOneRepMax?.estimatedOneRepMax ?? null,
    );

    return {
      exercise,
      category: getExerciseCategory(exercises, exercise),
      allTimeBestOneRepMax,
      periodBestOneRepMax,
      highestWeight,
      highestReps,
      highestVolume,
      bestDate: allTimeBestOneRepMax?.date ?? null,
      lastTrainingDate: exercisePeriodRecords[exercisePeriodRecords.length - 1]?.date ?? null,
      recordCount: exercisePeriodRecords.length,
      firstOneRepMax,
      latestOneRepMax,
      previousOneRepMax,
      latestVsPrevious,
      latestVsFirst,
      growthAmount: latestVsFirst?.delta ?? null,
      growthRate: latestVsFirst?.percent ?? null,
      latestPrFlags: latestOneRepMax
        ? getPrFlagsForRecord(latestOneRepMax, allRecords, exercises)
        : { oneRepMax: false, weight: false, reps: false, volume: false },
    };
  });
};

export const getRecentPrRecords = (records: WorkoutRecord[], exercises: ExerciseDefinition[], limit = 6) =>
  sortRecordsDesc(records)
    .map((record) => ({ record, flags: getPrFlagsForRecord(record, records, exercises) }))
    .filter(({ flags }) => flags.oneRepMax || flags.weight || flags.reps || flags.volume)
    .slice(0, limit);

export const getUniqueTrainingDays = (records: WorkoutRecord[]) => new Set(records.map((record) => record.date)).size;

export const getUniqueMembers = (records: WorkoutRecord[]) =>
  Array.from(new Set(records.map((record) => record.memberName).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ja'),
  );
