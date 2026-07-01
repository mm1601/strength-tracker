import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarRange,
  Database,
  Download,
  Dumbbell,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sun,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { INITIAL_CATEGORIES } from './data/defaults';
import {
  applyFilters,
  buildExerciseStats,
  calculateEstimatedOneRepMax,
  calculateTotalLoad,
  calculateVolume,
  compareDifference,
  formatDifference,
  formatKg,
  formatNumber,
  formatSigned,
  getComparableWeight,
  getDailyBestOneRepMax,
  getExerciseCategory,
  getPrFlagsForRecord,
  getRecentPrRecords,
  getRecordDifferences,
  getUniqueTrainingDays,
  getUniqueMembers,
  groupVolumeByCategory,
  groupVolumeByDate,
  groupVolumeByExercise,
  isBodyweightExercise,
  sortRecordsDesc,
  sumVolume,
  toNumberOrNull,
} from './lib/calculations';
import { downloadCsv, importCsv } from './lib/csv';
import { loadCloudData, saveCloudData } from './lib/cloudStorage';
import {
  DEFAULT_MEMBER_NAME,
  loadExercises,
  loadMembers,
  loadRecords,
  saveExercises,
  saveMembers,
  saveRecords,
  saveTheme,
} from './lib/storage';
import type {
  Category,
  ExerciseDefinition,
  ExerciseStats,
  Filters,
  PrFlags,
  TeamMember,
  WorkoutFormState,
  WorkoutRecord,
} from './types';

const periodOptions: { value: Filters['period']; label: string }[] = [
  { value: 'all', label: '全期間' },
  { value: 'today', label: '今日' },
  { value: '7d', label: '直近7日' },
  { value: '30d', label: '直近30日' },
  { value: '3m', label: '直近3ヶ月' },
  { value: '6m', label: '直近6ヶ月' },
  { value: '1y', label: '直近1年' },
  { value: 'custom', label: 'カスタム期間' },
];

const chartColors = {
  oneRm: '#14b8a6',
  volume: '#f59e0b',
  daily: '#38bdf8',
  category: '#a78bfa',
};

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createEmptyForm = (): WorkoutFormState => ({
  memberName: '',
  date: toDateInputValue(new Date()),
  category: '',
  exercise: '',
  weight: '',
  reps: '',
  sets: '1',
  bodyWeight: '',
  addedWeight: '',
  rpe: '',
  memo: '',
});

type BatchFormState = {
  date: string;
  category: Category | '';
  exercise: string;
  reps: string;
  sets: string;
  rpe: string;
  memo: string;
};

type BatchMemberRow = {
  memberName: string;
  weight: string;
  reps: string;
  sets: string;
  bodyWeight: string;
  addedWeight: string;
  rpe: string;
  memo: string;
};

const createEmptyBatchForm = (): BatchFormState => ({
  date: toDateInputValue(new Date()),
  category: '',
  exercise: '',
  reps: '',
  sets: '1',
  rpe: '',
  memo: '',
});

const createBatchRow = (memberName: string, batchForm: BatchFormState): BatchMemberRow => ({
  memberName,
  weight: '',
  reps: batchForm.reps,
  sets: batchForm.sets,
  bodyWeight: '',
  addedWeight: '',
  rpe: batchForm.rpe,
  memo: '',
});

const initialFilters: Filters = {
  period: 'all',
  memberName: 'all',
  category: 'all',
  exercise: 'all',
  search: '',
  customStart: '',
  customEnd: '',
};

const hasAnyPr = (flags: PrFlags) => flags.oneRepMax || flags.weight || flags.reps || flags.volume;

const prLabels = (flags: PrFlags) =>
  [
    flags.oneRepMax ? '1RM PR' : null,
    flags.weight ? '最高重量 PR' : null,
    flags.reps ? '最高回数 PR' : null,
    flags.volume ? '最高ボリューム PR' : null,
  ].filter(Boolean) as string[];

function App() {
  const [records, setRecords] = useState<WorkoutRecord[]>(() => loadRecords());
  const [exercises, setExercises] = useState<ExerciseDefinition[]>(() => loadExercises());
  const [members, setMembers] = useState<TeamMember[]>(() => loadMembers());
  const [syncStatus, setSyncStatus] = useState<'loading' | 'synced' | 'saving' | 'error' | 'local'>('loading');
  const [syncMessage, setSyncMessage] = useState('クラウド読込中');
  const [form, setForm] = useState<WorkoutFormState>(() => createEmptyForm());
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importMessage, setImportMessage] = useState('');
  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [bulkMemberText, setBulkMemberText] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [batchForm, setBatchForm] = useState<BatchFormState>(() => createEmptyBatchForm());
  const [batchRows, setBatchRows] = useState<BatchMemberRow[]>([]);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [batchMessage, setBatchMessage] = useState('');
  const [newExercise, setNewExercise] = useState<{ name: string; category: Category; isBodyweight: boolean }>({
    name: '',
    category: 'その他',
    isBodyweight: false,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const entrySectionRef = useRef<HTMLElement | null>(null);
  const cloudReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const localSnapshot = { records, exercises, members };

    loadCloudData()
      .then(async (cloudData) => {
        if (cancelled) return;

        const hasCloudData =
          cloudData.records.length > 0 || cloudData.exercises.length > 0 || cloudData.members.length > 0;
        const nextData = hasCloudData
          ? {
              records: cloudData.records,
              exercises: cloudData.exercises.length ? cloudData.exercises : localSnapshot.exercises,
              members: cloudData.members.length ? cloudData.members : localSnapshot.members,
            }
          : localSnapshot;

        setRecords(nextData.records);
        setExercises(nextData.exercises);
        setMembers(nextData.members);
        saveRecords(nextData.records);
        saveExercises(nextData.exercises);
        saveMembers(nextData.members);

        if (!hasCloudData) {
          await saveCloudData(nextData);
        }

        cloudReadyRef.current = true;
        setSyncStatus('synced');
        setSyncMessage('クラウド保存中');
      })
      .catch((error) => {
        if (cancelled) return;
        cloudReadyRef.current = false;
        setSyncStatus('local');
        setSyncMessage(error instanceof Error ? error.message : 'クラウドに接続できません。端末内バックアップのみです。');
      });

    return () => {
      cancelled = true;
    };
    // The first cloud load should use the initial local snapshot only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveRecords(records);
    saveExercises(exercises);
    saveMembers(members);

    if (!cloudReadyRef.current) return undefined;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    setSyncStatus('saving');
    setSyncMessage('クラウドへ保存中');
    saveTimerRef.current = window.setTimeout(() => {
      saveCloudData({ records, exercises, members })
        .then(() => {
          setSyncStatus('synced');
          setSyncMessage(`クラウド保存済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        })
        .catch((error) => {
          setSyncStatus('error');
          setSyncMessage(error instanceof Error ? error.message : 'クラウド保存に失敗しました。');
        });
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [records, exercises, members]);

  const exerciseOptions = useMemo(
    () => [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [exercises],
  );

  const memberOptions = useMemo(() => {
    const byName = new Map<string, TeamMember>();
    members.forEach((member) => {
      const name = member.name.trim();
      if (name) byName.set(name, { ...member, name });
    });
    records.forEach((record) => {
      if (record.memberName && !byName.has(record.memberName)) {
        byName.set(record.memberName, { name: record.memberName, createdAt: record.createdAt });
      }
    });
    if (!byName.has(DEFAULT_MEMBER_NAME)) {
      byName.set(DEFAULT_MEMBER_NAME, { name: DEFAULT_MEMBER_NAME, createdAt: new Date().toISOString() });
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [members, records]);

  const visibleMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return memberOptions
      .filter((member) => member.name !== DEFAULT_MEMBER_NAME)
      .filter((member) => !query || member.name.toLowerCase().includes(query));
  }, [memberOptions, memberSearch]);

  const filteredRecords = useMemo(
    () => sortRecordsDesc(applyFilters(records, filters, true)),
    [records, filters],
  );

  const allMatchingRecords = useMemo(
    () => applyFilters(records, filters, false),
    [records, filters],
  );

  const exerciseStats = useMemo(
    () => buildExerciseStats(allMatchingRecords, filteredRecords, exercises),
    [allMatchingRecords, filteredRecords, exercises],
  );

  const selectedExercise = useMemo(() => {
    if (filters.exercise !== 'all') return filters.exercise;
    return filteredRecords[0]?.exercise ?? exerciseStats[0]?.exercise ?? exerciseOptions[0]?.name ?? '';
  }, [filters.exercise, filteredRecords, exerciseStats, exerciseOptions]);

  const selectedExerciseRecords = useMemo(
    () => filteredRecords.filter((record) => record.exercise === selectedExercise),
    [filteredRecords, selectedExercise],
  );

  const selectedStats = useMemo(
    () => exerciseStats.find((stats) => stats.exercise === selectedExercise) ?? null,
    [exerciseStats, selectedExercise],
  );

  const oneRmChartData = useMemo(
    () => getDailyBestOneRepMax(selectedExerciseRecords),
    [selectedExerciseRecords],
  );

  const selectedExerciseVolumeData = useMemo(
    () => groupVolumeByDate(selectedExerciseRecords),
    [selectedExerciseRecords],
  );

  const dailyVolumeData = useMemo(() => groupVolumeByDate(filteredRecords), [filteredRecords]);
  const categoryVolumeData = useMemo(() => groupVolumeByCategory(filteredRecords), [filteredRecords]);
  const exerciseVolumeData = useMemo(() => groupVolumeByExercise(filteredRecords), [filteredRecords]);

  const latestTrainingDate = useMemo(
    () => sortRecordsDesc(filteredRecords)[0]?.date ?? '-',
    [filteredRecords],
  );

  const dashboard = useMemo(() => {
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}`;
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const sevenDaysAgoKey = toDateInputValue(sevenDaysAgo);

    const monthRecords = records.filter((record) => record.date.startsWith(monthKey));
    const sevenDayRecords = records.filter((record) => record.date >= sevenDaysAgoKey);

    return {
      totalRecords: records.length,
      totalMembers: memberOptions.filter((member) => member.name !== DEFAULT_MEMBER_NAME).length,
      activeMembers: getUniqueMembers(filteredRecords).filter((memberName) => memberName !== DEFAULT_MEMBER_NAME).length,
      monthTrainingDays: getUniqueTrainingDays(monthRecords),
      sevenDayTrainingDays: getUniqueTrainingDays(sevenDayRecords),
      registeredExercises: exercises.length,
      periodVolume: sumVolume(filteredRecords),
      latestTrainingDate,
      recentPrs: getRecentPrRecords(filteredRecords, exercises, 5),
      recentMembers: getUniqueMembers(filteredRecords).filter((memberName) => memberName !== DEFAULT_MEMBER_NAME).slice(0, 8),
      recentExercises: Array.from(new Set(filteredRecords.map((record) => record.exercise))).slice(0, 8),
    };
  }, [records, exercises, filteredRecords, latestTrainingDate, memberOptions]);

  const formExerciseIsBodyweight = isBodyweightExercise(exercises, form.exercise);
  const preview = useMemo(() => {
    const weight = toNumberOrNull(form.weight);
    const reps = toNumberOrNull(form.reps);
    const sets = toNumberOrNull(form.sets);
    const bodyWeight = toNumberOrNull(form.bodyWeight);
    const addedWeight = toNumberOrNull(form.addedWeight);
    const totalLoad = calculateTotalLoad({
      isBodyweight: formExerciseIsBodyweight,
      weight,
      bodyWeight,
      addedWeight,
    });
    return {
      totalLoad,
      estimatedOneRepMax: calculateEstimatedOneRepMax({
        isBodyweight: formExerciseIsBodyweight,
        weight,
        reps,
        bodyWeight,
        addedWeight,
      }),
      volume: calculateVolume({
        isBodyweight: formExerciseIsBodyweight,
        weight,
        reps,
        sets,
        bodyWeight,
        addedWeight,
      }),
    };
  }, [form, formExerciseIsBodyweight]);

  const updateForm = (field: keyof WorkoutFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const addMembersByName = (names: string[]) => {
    const now = new Date().toISOString();
    const cleanNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (!cleanNames.length) return 0;

    let added = 0;
    setMembers((current) => {
      const byName = new Map(current.map((member) => [member.name, member]));
      cleanNames.forEach((name) => {
        if (!byName.has(name)) {
          byName.set(name, { name, createdAt: now });
          added += 1;
        }
      });
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    });
    return added;
  };

  const handleBulkAddMembers = () => {
    const names = bulkMemberText.split(/[\n,、]+/);
    const added = addMembersByName(names);
    if (added === 0) {
      setFormErrors(['追加するメンバー名を入力してください。']);
      return;
    }
    setBulkMemberText('');
    setFormErrors([]);
  };

  const handleSelectMember = (memberName: string) => {
    setForm((current) => ({ ...current, memberName }));
    setFilters((current) => ({ ...current, memberName }));
    entrySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateBatchForm = (field: keyof BatchFormState, value: string) => {
    setBatchForm((current) => ({ ...current, [field]: value }));
    if (field === 'reps' || field === 'sets' || field === 'rpe') {
      setBatchRows((current) =>
        current.map((row) => ({
          ...row,
          [field]: row[field] === '' || row[field] === batchForm[field] ? value : row[field],
        })),
      );
    }
  };

  const handleBatchExerciseChange = (exerciseName: string) => {
    const definition = exercises.find((exercise) => exercise.name === exerciseName);
    setBatchForm((current) => ({
      ...current,
      exercise: exerciseName,
      category: definition?.category ?? current.category,
    }));
    if (definition?.isBodyweight) {
      setBatchRows((current) => current.map((row) => ({ ...row, weight: '' })));
    }
  };

  const toggleBatchMember = (memberName: string) => {
    setBatchRows((current) => {
      if (current.some((row) => row.memberName === memberName)) {
        return current.filter((row) => row.memberName !== memberName);
      }
      return [...current, createBatchRow(memberName, batchForm)];
    });
  };

  const selectVisibleBatchMembers = () => {
    setBatchRows((current) => {
      const byName = new Map(current.map((row) => [row.memberName, row]));
      visibleMembers.forEach((member) => {
        if (!byName.has(member.name)) byName.set(member.name, createBatchRow(member.name, batchForm));
      });
      return Array.from(byName.values());
    });
  };

  const updateBatchRow = (memberName: string, field: keyof Omit<BatchMemberRow, 'memberName'>, value: string) => {
    setBatchRows((current) =>
      current.map((row) => (row.memberName === memberName ? { ...row, [field]: value } : row)),
    );
  };

  const handleExerciseChange = (exerciseName: string) => {
    const definition = exercises.find((exercise) => exercise.name === exerciseName);
    setForm((current) => ({
      ...current,
      exercise: exerciseName,
      category: definition?.category ?? current.category,
      weight: definition?.isBodyweight && current.weight === '' ? '0' : current.weight,
    }));
  };

  const validateForm = () => {
    const errors: string[] = [];
    const weight = toNumberOrNull(form.weight);
    const reps = toNumberOrNull(form.reps);
    const sets = toNumberOrNull(form.sets);
    const bodyWeight = toNumberOrNull(form.bodyWeight);
    const addedWeight = toNumberOrNull(form.addedWeight);
    const rpe = toNumberOrNull(form.rpe);
    const memberName = form.memberName.trim();

    if (!memberName) errors.push('メンバー名は必須です。');
    if (!form.date) errors.push('日付は必須です。');
    if (!form.category) errors.push('部位カテゴリは必須です。');
    if (!form.exercise) errors.push('種目は必須です。');
    if (!formExerciseIsBodyweight && weight === null) errors.push('重量は必須です。');
    if (weight !== null && weight < 0) errors.push('重量は0以上にしてください。');
    if (reps === null || reps < 1) errors.push('回数は1以上にしてください。');
    if (sets === null || sets < 1) errors.push('セット数は1以上にしてください。');
    if (bodyWeight !== null && bodyWeight < 0) errors.push('体重は0以上にしてください。');
    if (addedWeight !== null && addedWeight < 0) errors.push('加重重量は0以上にしてください。');
    if (formExerciseIsBodyweight && (bodyWeight === null || bodyWeight <= 0)) {
      errors.push('自重種目は体重を0より大きい値で入力してください。');
    }
    if (rpe !== null && (rpe < 1 || rpe > 10)) errors.push('RPEは1〜10で入力してください。');
    return errors;
  };

  const makeWorkoutRecord = ({
    existing,
    memberName,
    date,
    category,
    exercise,
    weight,
    reps,
    sets,
    bodyWeight,
    addedWeight,
    rpe,
    memo,
  }: {
    existing?: WorkoutRecord;
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
  }): WorkoutRecord => {
    const now = new Date().toISOString();
    const isBodyweight = isBodyweightExercise(exercises, exercise);
    const estimatedOneRepMax = calculateEstimatedOneRepMax({
      isBodyweight,
      weight,
      reps,
      bodyWeight,
      addedWeight,
    });
    const volume = calculateVolume({ isBodyweight, weight, reps, sets, bodyWeight, addedWeight });

    return {
      id: existing?.id ?? makeId(),
      memberName,
      date,
      category,
      exercise,
      weight,
      reps,
      sets,
      bodyWeight,
      addedWeight,
      rpe,
      memo: memo.trim(),
      estimatedOneRepMax,
      volume,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  };

  const recordFromForm = (existing?: WorkoutRecord): WorkoutRecord => {
    return makeWorkoutRecord({
      existing,
      memberName: form.memberName.trim(),
      date: form.date,
      category: form.category || getExerciseCategory(exercises, form.exercise),
      exercise: form.exercise,
      weight: toNumberOrNull(form.weight) ?? 0,
      reps: toNumberOrNull(form.reps) ?? 1,
      sets: toNumberOrNull(form.sets) ?? 1,
      bodyWeight: toNumberOrNull(form.bodyWeight),
      addedWeight: toNumberOrNull(form.addedWeight),
      rpe: toNumberOrNull(form.rpe),
      memo: form.memo,
    });
  };

  const resetForm = (memberName = '') => {
    setForm({ ...createEmptyForm(), memberName });
    setEditingId(null);
    setFormErrors([]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const errors = validateForm();
    if (errors.length) {
      setFormErrors(errors);
      return;
    }

    if (editingId) {
      setRecords((current) =>
        current.map((record) => (record.id === editingId ? recordFromForm(record) : record)),
      );
    } else {
      setRecords((current) => [recordFromForm(), ...current]);
    }
    addMembersByName([form.memberName]);
    resetForm(form.memberName.trim());
  };

  const validateBatchRows = () => {
    const errors: string[] = [];
    const category = batchForm.category || getExerciseCategory(exercises, batchForm.exercise);
    const isBodyweight = isBodyweightExercise(exercises, batchForm.exercise);

    if (!batchForm.date) errors.push('一括入力の日付は必須です。');
    if (!batchForm.exercise) errors.push('一括入力の種目は必須です。');
    if (!category) errors.push('一括入力の部位カテゴリは必須です。');
    if (batchRows.length === 0) errors.push('一括入力するメンバーを選択してください。');

    batchRows.forEach((row) => {
      const weight = toNumberOrNull(row.weight);
      const reps = toNumberOrNull(row.reps || batchForm.reps);
      const sets = toNumberOrNull(row.sets || batchForm.sets);
      const bodyWeight = toNumberOrNull(row.bodyWeight);
      const addedWeight = toNumberOrNull(row.addedWeight);
      const rpe = toNumberOrNull(row.rpe || batchForm.rpe);

      if (!isBodyweight && weight === null) errors.push(`${row.memberName}: 重量を入力してください。`);
      if (weight !== null && weight < 0) errors.push(`${row.memberName}: 重量は0以上にしてください。`);
      if (reps === null || reps < 1) errors.push(`${row.memberName}: 回数は1以上にしてください。`);
      if (sets === null || sets < 1) errors.push(`${row.memberName}: セット数は1以上にしてください。`);
      if (bodyWeight !== null && bodyWeight < 0) errors.push(`${row.memberName}: 体重は0以上にしてください。`);
      if (addedWeight !== null && addedWeight < 0) errors.push(`${row.memberName}: 加重重量は0以上にしてください。`);
      if (isBodyweight && (bodyWeight === null || bodyWeight <= 0)) {
        errors.push(`${row.memberName}: 自重種目は体重を0より大きい値で入力してください。`);
      }
      if (rpe !== null && (rpe < 1 || rpe > 10)) errors.push(`${row.memberName}: RPEは1〜10で入力してください。`);
    });

    return errors;
  };

  const handleBatchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const errors = validateBatchRows();
    if (errors.length) {
      setBatchErrors(errors);
      setBatchMessage('');
      return;
    }

    const category = batchForm.category || getExerciseCategory(exercises, batchForm.exercise);
    const isBodyweight = isBodyweightExercise(exercises, batchForm.exercise);
    const nextRecords = batchRows.map((row) =>
      makeWorkoutRecord({
        memberName: row.memberName,
        date: batchForm.date,
        category,
        exercise: batchForm.exercise,
        weight: isBodyweight ? 0 : toNumberOrNull(row.weight) ?? 0,
        reps: toNumberOrNull(row.reps || batchForm.reps) ?? 1,
        sets: toNumberOrNull(row.sets || batchForm.sets) ?? 1,
        bodyWeight: toNumberOrNull(row.bodyWeight),
        addedWeight: toNumberOrNull(row.addedWeight),
        rpe: toNumberOrNull(row.rpe || batchForm.rpe),
        memo: [batchForm.memo.trim(), row.memo.trim()].filter(Boolean).join(' / '),
      }),
    );

    setRecords((current) => [...nextRecords, ...current]);
    addMembersByName(batchRows.map((row) => row.memberName));
    setBatchErrors([]);
    setBatchMessage(`${nextRecords.length}件を一括保存しました。`);
    setBatchRows((current) =>
      current.map((row) => ({
        ...row,
        weight: '',
        bodyWeight: '',
        addedWeight: '',
        memo: '',
      })),
    );
  };

  const handleEdit = (record: WorkoutRecord) => {
    setEditingId(record.id);
    setForm({
      memberName: record.memberName,
      date: record.date,
      category: record.category,
      exercise: record.exercise,
      weight: String(record.weight),
      reps: String(record.reps),
      sets: String(record.sets),
      bodyWeight: record.bodyWeight === null ? '' : String(record.bodyWeight),
      addedWeight: record.addedWeight === null ? '' : String(record.addedWeight),
      rpe: record.rpe === null ? '' : String(record.rpe),
      memo: record.memo,
    });
    setFormErrors([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (recordId: string) => {
    const target = records.find((record) => record.id === recordId);
    const confirmed = window.confirm(`${target?.exercise ?? 'この記録'}を削除しますか？`);
    if (!confirmed) return;
    setRecords((current) => current.filter((record) => record.id !== recordId));
    if (editingId === recordId) resetForm();
  };

  const handleAddExercise = () => {
    const name = newExercise.name.trim();
    if (!name) {
      setFormErrors(['種目名を入力してください。']);
      return;
    }
    if (exercises.some((exercise) => exercise.name === name)) {
      setFormErrors(['同じ種目名がすでに登録されています。']);
      return;
    }
    const exercise: ExerciseDefinition = { ...newExercise, name };
    setExercises((current) => [...current, exercise]);
    setForm((current) => ({
      ...current,
      exercise: exercise.name,
      category: exercise.category,
      weight: exercise.isBodyweight && current.weight === '' ? '0' : current.weight,
    }));
    setNewExercise({ name: '', category: 'その他', isBodyweight: false });
    setShowExerciseForm(false);
    setFormErrors([]);
  };

  const createSampleRecord = (
    partial: Omit<WorkoutRecord, 'id' | 'estimatedOneRepMax' | 'volume' | 'createdAt' | 'updatedAt'>,
    index: number,
  ): WorkoutRecord => {
    const createdAt = new Date(Date.now() - index * 60_000).toISOString();
    const isBodyweight = isBodyweightExercise(exercises, partial.exercise);
    return {
      ...partial,
      id: makeId(),
      estimatedOneRepMax: calculateEstimatedOneRepMax({
        isBodyweight,
        weight: partial.weight,
        reps: partial.reps,
        bodyWeight: partial.bodyWeight,
        addedWeight: partial.addedWeight,
      }),
      volume: calculateVolume({
        isBodyweight,
        weight: partial.weight,
        reps: partial.reps,
        sets: partial.sets,
        bodyWeight: partial.bodyWeight,
        addedWeight: partial.addedWeight,
      }),
      createdAt,
      updatedAt: createdAt,
    };
  };

  const dateDaysAgo = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return toDateInputValue(date);
  };

  const handleAddSamples = () => {
    const rows: Omit<WorkoutRecord, 'id' | 'estimatedOneRepMax' | 'volume' | 'createdAt' | 'updatedAt'>[] = [
      { memberName: '田中', date: dateDaysAgo(62), category: '胸', exercise: 'ベンチプレス', weight: 80, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 7, memo: 'フォーム確認' },
      { memberName: '田中', date: dateDaysAgo(45), category: '胸', exercise: 'ベンチプレス', weight: 85, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 8, memo: '' },
      { memberName: '田中', date: dateDaysAgo(27), category: '胸', exercise: 'ベンチプレス', weight: 92.5, reps: 4, sets: 3, bodyWeight: null, addedWeight: null, rpe: 8.5, memo: 'よく押せた' },
      { memberName: '田中', date: dateDaysAgo(8), category: '胸', exercise: 'ベンチプレス', weight: 97.5, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 9, memo: 'PR狙い' },
      { memberName: '田中', date: dateDaysAgo(2), category: '胸', exercise: 'ベンチプレス', weight: 100, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 9, memo: '自己ベスト更新' },
      { memberName: '佐藤', date: dateDaysAgo(58), category: '脚', exercise: 'スクワット', weight: 100, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 7, memo: '' },
      { memberName: '佐藤', date: dateDaysAgo(31), category: '脚', exercise: 'スクワット', weight: 110, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 8, memo: '' },
      { memberName: '佐藤', date: dateDaysAgo(4), category: '脚', exercise: 'スクワット', weight: 117.5, reps: 4, sets: 4, bodyWeight: null, addedWeight: null, rpe: 9, memo: '' },
      { memberName: '鈴木', date: dateDaysAgo(52), category: '全身', exercise: 'デッドリフト', weight: 130, reps: 3, sets: 3, bodyWeight: null, addedWeight: null, rpe: 8, memo: '' },
      { memberName: '鈴木', date: dateDaysAgo(24), category: '全身', exercise: 'デッドリフト', weight: 140, reps: 3, sets: 3, bodyWeight: null, addedWeight: null, rpe: 8.5, memo: '' },
      { memberName: '鈴木', date: dateDaysAgo(6), category: '全身', exercise: 'デッドリフト', weight: 150, reps: 2, sets: 3, bodyWeight: null, addedWeight: null, rpe: 9, memo: '' },
      { memberName: '高橋', date: dateDaysAgo(40), category: '背中', exercise: '懸垂', weight: 0, reps: 6, sets: 3, bodyWeight: 70, addedWeight: 0, rpe: 8, memo: '自重' },
      { memberName: '高橋', date: dateDaysAgo(19), category: '背中', exercise: '懸垂', weight: 0, reps: 5, sets: 3, bodyWeight: 70.5, addedWeight: 5, rpe: 8, memo: '加重開始' },
      { memberName: '高橋', date: dateDaysAgo(1), category: '背中', exercise: '懸垂', weight: 0, reps: 5, sets: 4, bodyWeight: 70, addedWeight: 10, rpe: 9, memo: '加重PR' },
      { memberName: '伊藤', date: dateDaysAgo(35), category: '肩', exercise: 'ショルダープレス', weight: 45, reps: 6, sets: 3, bodyWeight: null, addedWeight: null, rpe: 7, memo: '' },
      { memberName: '伊藤', date: dateDaysAgo(12), category: '肩', exercise: 'ショルダープレス', weight: 50, reps: 5, sets: 3, bodyWeight: null, addedWeight: null, rpe: 8, memo: '' },
    ];
    addMembersByName(rows.map((row) => row.memberName));
    setRecords((current) => [...rows.map((row, index) => createSampleRecord(row, index)), ...current]);
  };

  const handleClearAll = () => {
    if (!records.length) return;
    const confirmed = window.confirm('すべての記録を削除しますか？この操作は元に戻せません。');
    if (!confirmed) return;
    setRecords([]);
    resetForm();
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importCsv(String(reader.result ?? ''), exercises, memberOptions, records);
      setRecords(result.records);
      setExercises(result.exercises);
      setMembers(result.members);
      setImportErrors(result.errors);
      setImportMessage(`${result.imported}件をインポートしました。`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const selectedMemberLabel = filters.memberName === 'all' ? '全メンバー' : filters.memberName;
  const selectedSummaryTitle = selectedExercise ? `${selectedMemberLabel} / ${selectedExercise}` : '種目未選択';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>チーム筋トレ管理</h1>
          <div className="current-user">
            {form.memberName ? `${form.memberName}さんを選択中` : 'メンバーを選択してください'}
          </div>
          <div className={`sync-pill ${syncStatus}`}>
            <Database size={14} />
            <span>{syncMessage}</span>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="ダークモード切替">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="main-stack">
        <section className="section roster-section" aria-labelledby="roster-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><Users size={16} /> Team roster</span>
              <h2 id="roster-title">メンバー登録・選択</h2>
            </div>
            <div className="member-count-card compact-count">
              <span>登録メンバー</span>
              <strong>{memberOptions.filter((member) => member.name !== DEFAULT_MEMBER_NAME).length}人</strong>
            </div>
          </div>
          <div className="member-manager roster-manager">
            <div>
              <label>
                メンバー一括追加
                <textarea
                  value={bulkMemberText}
                  onChange={(event) => setBulkMemberText(event.target.value)}
                  rows={4}
                  placeholder="田中&#10;佐藤&#10;鈴木、山田"
                />
              </label>
              <p className="hint-text">1行1人、またはカンマ・読点区切りでまとめて登録できます。</p>
            </div>
            <div className="member-manager-side">
              <button className="primary-button" type="button" onClick={handleBulkAddMembers}>
                <Plus size={16} />
                まとめて登録
              </button>
              <label>
                名前検索
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="名前で絞り込み"
                />
              </label>
            </div>
          </div>
          <div className="member-button-grid">
            {visibleMembers.length ? (
              visibleMembers.map((member) => (
                <button
                  key={member.name}
                  className={`member-button${form.memberName === member.name ? ' selected' : ''}`}
                  type="button"
                  onClick={() => handleSelectMember(member.name)}
                >
                  <span>{member.name}</span>
                  <small>入力へ</small>
                </button>
              ))
            ) : (
              <EmptyState text="まずメンバー名を登録してください。登録した名前を押すと、その人の入力に進めます。" />
            )}
          </div>
        </section>

        <BatchEntrySection
          batchForm={batchForm}
          batchRows={batchRows}
          batchErrors={batchErrors}
          batchMessage={batchMessage}
          exerciseOptions={exerciseOptions}
          visibleMembers={visibleMembers}
          exercises={exercises}
          onSubmit={handleBatchSubmit}
          onExerciseChange={handleBatchExerciseChange}
          onFormChange={updateBatchForm}
          onToggleMember={toggleBatchMember}
          onSelectVisible={selectVisibleBatchMembers}
          onClearMembers={() => setBatchRows([])}
          onRowChange={updateBatchRow}
        />

        <section ref={entrySectionRef} className="section quick-entry" aria-labelledby="entry-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><Dumbbell size={16} /> Quick entry</span>
              <h2 id="entry-title">{editingId ? '記録を編集' : `${form.memberName || 'メンバー'}の記録を入力`}</h2>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" type="button" onClick={() => setShowExerciseForm((value) => !value)}>
                {showExerciseForm ? <X size={16} /> : <Plus size={16} />}
                種目追加
              </button>
            </div>
          </div>

          {showExerciseForm && (
            <div className="exercise-creator">
              <label>
                種目名
                <input
                  value={newExercise.name}
                  onChange={(event) => setNewExercise((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例: フロントスクワット"
                />
              </label>
              <label>
                部位カテゴリ
                <select
                  value={newExercise.category}
                  onChange={(event) =>
                    setNewExercise((current) => ({ ...current, category: event.target.value as Category }))
                  }
                >
                  {INITIAL_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={newExercise.isBodyweight}
                  onChange={(event) =>
                    setNewExercise((current) => ({ ...current, isBodyweight: event.target.checked }))
                  }
                />
                自重種目
              </label>
              <button className="primary-button compact" type="button" onClick={handleAddExercise}>
                <Plus size={16} />
                追加
              </button>
            </div>
          )}

          <form className="entry-layout" onSubmit={handleSubmit}>
            <div className="entry-grid">
              <label>
                メンバー
                <input
                  list="member-options"
                  value={form.memberName}
                  onChange={(event) => updateForm('memberName', event.target.value)}
                  placeholder="名前を入力または選択"
                />
                <datalist id="member-options">
                  {memberOptions.map((member) => (
                    <option key={member.name} value={member.name} />
                  ))}
                </datalist>
              </label>
              <label>
                日付
                <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
              </label>
              <label>
                種目
                <select value={form.exercise} onChange={(event) => handleExerciseChange(event.target.value)}>
                  <option value="">選択してください</option>
                  {exerciseOptions.map((exercise) => (
                    <option key={exercise.name} value={exercise.name}>
                      {exercise.name}{exercise.isBodyweight ? ' / 自重' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                部位カテゴリ
                <select value={form.category} onChange={(event) => updateForm('category', event.target.value)}>
                  <option value="">選択してください</option>
                  {INITIAL_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                重量 kg
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.weight}
                  onChange={(event) => updateForm('weight', event.target.value)}
                  placeholder={formExerciseIsBodyweight ? '0' : '100'}
                />
              </label>
              <label>
                回数
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.reps}
                  onChange={(event) => updateForm('reps', event.target.value)}
                  placeholder="5"
                />
              </label>
              <label>
                セット数
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.sets}
                  onChange={(event) => updateForm('sets', event.target.value)}
                />
              </label>
              <label>
                体重 kg
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.bodyWeight}
                  onChange={(event) => updateForm('bodyWeight', event.target.value)}
                  placeholder={formExerciseIsBodyweight ? '70' : '任意'}
                />
              </label>
              <label>
                加重重量 kg
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.addedWeight}
                  onChange={(event) => updateForm('addedWeight', event.target.value)}
                  placeholder="10"
                />
              </label>
              <label>
                RPE
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="10"
                  step="0.5"
                  value={form.rpe}
                  onChange={(event) => updateForm('rpe', event.target.value)}
                  placeholder="8"
                />
              </label>
              <label className="memo-field">
                メモ
                <textarea value={form.memo} onChange={(event) => updateForm('memo', event.target.value)} rows={3} />
              </label>
            </div>

            <aside className="one-rm-readout">
              <span className="readout-label">リアルタイム推定</span>
              {formExerciseIsBodyweight && (
                <div className="readout-line">
                  <span>総負荷</span>
                  <strong>{formatKg(preview.totalLoad)}</strong>
                </div>
              )}
              <div className="readout-main">
                <span>推定1RM</span>
                <strong>{formatKg(preview.estimatedOneRepMax)}</strong>
              </div>
              <div className="readout-line">
                <span>ボリューム</span>
                <strong>{formatKg(preview.volume)}</strong>
              </div>
              <div className="form-actions">
                <button className="primary-button" type="submit">
                  <Save size={17} />
                  {editingId ? '更新' : '保存'}
                </button>
                <button className="ghost-button" type="button" onClick={() => resetForm()}>
                  <RotateCcw size={16} />
                  リセット
                </button>
              </div>
            </aside>
          </form>

          {formErrors.length > 0 && (
            <div className="error-box">
              {formErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
        </section>

        <DashboardSection
          dashboard={dashboard}
          categoryVolumeData={categoryVolumeData}
          rankingStats={exerciseStats}
          exercises={exercises}
        />

        <section className="section filter-section" aria-labelledby="filter-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><CalendarRange size={16} /> Filters</span>
              <h2 id="filter-title">表示条件</h2>
            </div>
            <button className="ghost-button compact" type="button" onClick={() => setFilters(initialFilters)}>
              <RotateCcw size={16} />
              解除
            </button>
          </div>
          <div className="filter-grid">
            <label>
              期間
              <select
                value={filters.period}
                onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value as Filters['period'] }))}
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {filters.period === 'custom' && (
              <>
                <label>
                  開始日
                  <input
                    type="date"
                    value={filters.customStart}
                    onChange={(event) => setFilters((current) => ({ ...current, customStart: event.target.value }))}
                  />
                </label>
                <label>
                  終了日
                  <input
                    type="date"
                    value={filters.customEnd}
                    onChange={(event) => setFilters((current) => ({ ...current, customEnd: event.target.value }))}
                  />
                </label>
              </>
            )}
            <label>
              メンバー
              <select
                value={filters.memberName}
                onChange={(event) => setFilters((current) => ({ ...current, memberName: event.target.value }))}
              >
                <option value="all">全メンバー</option>
                {memberOptions.map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              部位カテゴリ
              <select
                value={filters.category}
                onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as Category | 'all' }))}
              >
                <option value="all">全カテゴリ</option>
                {INITIAL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              種目
              <select
                value={filters.exercise}
                onChange={(event) => setFilters((current) => ({ ...current, exercise: event.target.value }))}
              >
                <option value="all">全種目</option>
                {exerciseOptions.map((exercise) => (
                  <option key={exercise.name} value={exercise.name}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="search-field">
              種目名検索
              <span>
                <Search size={16} />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="ベンチ、スクワット..."
                />
              </span>
            </label>
          </div>
        </section>

        <SummaryCards title={selectedSummaryTitle} stats={selectedStats} records={selectedExerciseRecords} />

        <section className="chart-grid" aria-label="グラフエリア">
          <ChartPanel title={`${selectedSummaryTitle} 1RM推移`} empty={oneRmChartData.length === 0}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={oneRmChartData} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="kg" />
                <Tooltip content={<OneRmTooltip />} />
                <Line
                  type="monotone"
                  dataKey="oneRepMax"
                  name="推定1RM"
                  stroke={chartColors.oneRm}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title={`${selectedSummaryTitle} ボリューム推移`} empty={selectedExerciseVolumeData.length === 0}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={selectedExerciseVolumeData} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="kg" />
                <Tooltip formatter={(value) => [`${formatNumber(Number(value))}kg`, 'ボリューム']} />
                <Bar dataKey="volume" name="ボリューム" fill={chartColors.volume} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title="部位カテゴリ別ボリューム" empty={categoryVolumeData.length === 0}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryVolumeData} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis unit="kg" />
                <Tooltip formatter={(value) => [`${formatNumber(Number(value))}kg`, 'ボリューム']} />
                <Bar dataKey="volume" name="ボリューム" fill={chartColors.category} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title="日別合計ボリューム" empty={dailyVolumeData.length === 0}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyVolumeData} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="kg" />
                <Tooltip formatter={(value) => [`${formatNumber(Number(value))}kg`, '日別合計']} />
                <Line
                  type="monotone"
                  dataKey="volume"
                  name="日別合計"
                  stroke={chartColors.daily}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </section>

        <BestRecordsSection stats={exerciseStats} exercises={exercises} />

        <section className="section management-section" aria-labelledby="management-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><Database size={16} /> Data</span>
              <h2 id="management-title">データ管理</h2>
            </div>
          </div>
          <div className="management-actions">
            <button className="secondary-button" type="button" onClick={() => downloadCsv(sortRecordsDesc(records))}>
              <Download size={16} />
              CSVエクスポート
            </button>
            <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              CSVインポート
            </button>
            <input ref={fileInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={handleImportFile} />
            <button className="secondary-button" type="button" onClick={handleAddSamples}>
              <Plus size={16} />
              サンプルデータ追加
            </button>
            <button className="danger-button" type="button" onClick={handleClearAll}>
              <Trash2 size={16} />
              全データ削除
            </button>
          </div>
          {importMessage && <p className="import-message">{importMessage}</p>}
          {importErrors.length > 0 && (
            <div className="error-box">
              {importErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
        </section>

        <RecordsTable
          records={filteredRecords}
          allRecords={records}
          exercises={exercises}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {exerciseVolumeData.length > 0 && (
          <section className="section" aria-labelledby="exercise-volume-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker"><BarChart3 size={16} /> Volume</span>
                <h2 id="exercise-volume-title">種目別合計ボリューム</h2>
              </div>
            </div>
            <div className="volume-list">
              {exerciseVolumeData.map((row) => (
                <div key={row.exercise} className="volume-row">
                  <span>{row.exercise}</span>
                  <strong>{formatKg(row.volume)}</strong>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

type BatchEntrySectionProps = {
  batchForm: BatchFormState;
  batchRows: BatchMemberRow[];
  batchErrors: string[];
  batchMessage: string;
  exerciseOptions: ExerciseDefinition[];
  visibleMembers: TeamMember[];
  exercises: ExerciseDefinition[];
  onSubmit: (event: FormEvent) => void;
  onExerciseChange: (exerciseName: string) => void;
  onFormChange: (field: keyof BatchFormState, value: string) => void;
  onToggleMember: (memberName: string) => void;
  onSelectVisible: () => void;
  onClearMembers: () => void;
  onRowChange: (memberName: string, field: keyof Omit<BatchMemberRow, 'memberName'>, value: string) => void;
};

function BatchEntrySection({
  batchForm,
  batchRows,
  batchErrors,
  batchMessage,
  exerciseOptions,
  visibleMembers,
  exercises,
  onSubmit,
  onExerciseChange,
  onFormChange,
  onToggleMember,
  onSelectVisible,
  onClearMembers,
  onRowChange,
}: BatchEntrySectionProps) {
  const isBodyweight = isBodyweightExercise(exercises, batchForm.exercise);
  const selectedMemberNames = new Set(batchRows.map((row) => row.memberName));

  return (
    <section className="section batch-entry" aria-labelledby="batch-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker"><Users size={16} /> Team entry</span>
          <h2 id="batch-title">同日・同種目の一括記録</h2>
        </div>
        <span className="count-pill">{batchRows.length}人選択中</span>
      </div>

      <form onSubmit={onSubmit}>
        <div className="batch-shared-grid">
          <label>
            日付
            <input type="date" value={batchForm.date} onChange={(event) => onFormChange('date', event.target.value)} />
          </label>
          <label>
            種目
            <select value={batchForm.exercise} onChange={(event) => onExerciseChange(event.target.value)}>
              <option value="">選択してください</option>
              {exerciseOptions.map((exercise) => (
                <option key={exercise.name} value={exercise.name}>
                  {exercise.name}{exercise.isBodyweight ? ' / 自重' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            部位カテゴリ
            <select value={batchForm.category} onChange={(event) => onFormChange('category', event.target.value)}>
              <option value="">選択してください</option>
              {INITIAL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            共通回数
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={batchForm.reps}
              onChange={(event) => onFormChange('reps', event.target.value)}
              placeholder="5"
            />
          </label>
          <label>
            共通セット
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={batchForm.sets}
              onChange={(event) => onFormChange('sets', event.target.value)}
              placeholder="3"
            />
          </label>
          <label>
            共通RPE
            <input
              type="number"
              inputMode="decimal"
              min="1"
              max="10"
              step="0.5"
              value={batchForm.rpe}
              onChange={(event) => onFormChange('rpe', event.target.value)}
              placeholder="8"
            />
          </label>
          <label className="batch-memo-field">
            共通メモ
            <input
              value={batchForm.memo}
              onChange={(event) => onFormChange('memo', event.target.value)}
              placeholder="例: チーム合同メニュー"
            />
          </label>
        </div>

        <div className="batch-member-toolbar">
          <strong>一括入力するメンバー</strong>
          <div>
            <button className="secondary-button compact" type="button" onClick={onSelectVisible}>
              表示中を全選択
            </button>
            <button className="ghost-button compact" type="button" onClick={onClearMembers}>
              選択解除
            </button>
          </div>
        </div>

        <div className="batch-member-grid">
          {visibleMembers.length ? (
            visibleMembers.map((member) => (
              <button
                key={member.name}
                type="button"
                className={`batch-member-button${selectedMemberNames.has(member.name) ? ' selected' : ''}`}
                onClick={() => onToggleMember(member.name)}
              >
                {member.name}
              </button>
            ))
          ) : (
            <EmptyState text="名簿にメンバーを登録すると、一括入力の対象として選べます。" />
          )}
        </div>

        {batchRows.length > 0 && (
          <div className="table-scroll batch-table">
            <table>
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th>重量kg</th>
                  <th>回数</th>
                  <th>セット</th>
                  <th>体重kg</th>
                  <th>加重kg</th>
                  <th>RPE</th>
                  <th>メモ</th>
                  <th>外す</th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map((row) => (
                  <tr key={row.memberName}>
                    <td><strong>{row.memberName}</strong></td>
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={row.weight}
                        disabled={isBodyweight}
                        onChange={(event) => onRowChange(row.memberName, 'weight', event.target.value)}
                        placeholder={isBodyweight ? '-' : '100'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={row.reps}
                        onChange={(event) => onRowChange(row.memberName, 'reps', event.target.value)}
                        placeholder={batchForm.reps || '5'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={row.sets}
                        onChange={(event) => onRowChange(row.memberName, 'sets', event.target.value)}
                        placeholder={batchForm.sets || '3'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={row.bodyWeight}
                        onChange={(event) => onRowChange(row.memberName, 'bodyWeight', event.target.value)}
                        placeholder={isBodyweight ? '70' : '任意'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={row.addedWeight}
                        onChange={(event) => onRowChange(row.memberName, 'addedWeight', event.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="1"
                        max="10"
                        step="0.5"
                        value={row.rpe}
                        onChange={(event) => onRowChange(row.memberName, 'rpe', event.target.value)}
                        placeholder={batchForm.rpe || '8'}
                      />
                    </td>
                    <td>
                      <input
                        value={row.memo}
                        onChange={(event) => onRowChange(row.memberName, 'memo', event.target.value)}
                        placeholder="個別メモ"
                      />
                    </td>
                    <td>
                      <button className="icon-button small" type="button" onClick={() => onToggleMember(row.memberName)} title="一括入力から外す">
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="batch-actions">
          <button className="primary-button" type="submit">
            <Save size={17} />
            {batchRows.length}人分を保存
          </button>
        </div>
      </form>

      {batchMessage && <p className="import-message">{batchMessage}</p>}
      {batchErrors.length > 0 && (
        <div className="error-box">
          {batchErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </section>
  );
}

type DashboardSectionProps = {
  dashboard: {
    totalRecords: number;
    totalMembers: number;
    activeMembers: number;
    monthTrainingDays: number;
    sevenDayTrainingDays: number;
    registeredExercises: number;
    periodVolume: number;
    latestTrainingDate: string;
    recentPrs: { record: WorkoutRecord; flags: PrFlags }[];
    recentMembers: string[];
    recentExercises: string[];
  };
  categoryVolumeData: { category: string; volume: number }[];
  rankingStats: ExerciseStats[];
  exercises: ExerciseDefinition[];
};

function DashboardSection({ dashboard, categoryVolumeData, rankingStats, exercises }: DashboardSectionProps) {
  const ranking = [...rankingStats]
    .filter((stats) => stats.periodBestOneRepMax?.estimatedOneRepMax !== null)
    .sort((a, b) => (b.periodBestOneRepMax?.estimatedOneRepMax ?? 0) - (a.periodBestOneRepMax?.estimatedOneRepMax ?? 0))
    .slice(0, 5);

  return (
    <section className="section dashboard" aria-labelledby="dashboard-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker"><Activity size={16} /> Dashboard</span>
          <h2 id="dashboard-title">全体サマリー</h2>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard label="総記録数" value={`${dashboard.totalRecords}`} />
        <MetricCard label="登録メンバー数" value={`${dashboard.totalMembers}`} unit="人" />
        <MetricCard label="期間内アクティブメンバー" value={`${dashboard.activeMembers}`} unit="人" accent />
        <MetricCard label="今月のトレーニング回数" value={`${dashboard.monthTrainingDays}`} unit="日" />
        <MetricCard label="直近7日のトレーニング回数" value={`${dashboard.sevenDayTrainingDays}`} unit="日" />
        <MetricCard label="登録種目数" value={`${dashboard.registeredExercises}`} />
        <MetricCard label="期間内の合計ボリューム" value={formatNumber(dashboard.periodVolume)} unit="kg" />
        <MetricCard label="最新トレーニング日" value={dashboard.latestTrainingDate} />
      </div>

      <div className="dashboard-lanes">
        <div>
          <h3>部位カテゴリ別ボリューム</h3>
          {categoryVolumeData.length ? (
            <div className="mini-bars">
              {categoryVolumeData.map((row) => (
                <div key={row.category}>
                  <span>{row.category}</span>
                  <div>
                    <i style={{ width: `${Math.max(6, (row.volume / Math.max(...categoryVolumeData.map((item) => item.volume))) * 100)}%` }} />
                  </div>
                  <strong>{formatKg(row.volume)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">表示条件に合うボリュームはまだありません。</p>
          )}
        </div>

        <div>
          <h3>種目別ベスト1RMランキング</h3>
          {ranking.length ? (
            <ol className="ranking-list">
              {ranking.map((stats, index) => (
                <li key={stats.exercise}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{stats.exercise}</strong>
                    <small>{stats.category} / {stats.periodBestOneRepMax?.date ?? '-'}</small>
                  </div>
                  <b>{formatKg(stats.periodBestOneRepMax?.estimatedOneRepMax)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">ランキング表示には記録が必要です。</p>
          )}
        </div>

        <div>
          <h3>最近更新したPR</h3>
          {dashboard.recentPrs.length ? (
            <div className="recent-list">
	              {dashboard.recentPrs.map(({ record, flags }) => (
                <div key={record.id}>
                  <strong>{record.memberName} / {record.exercise}</strong>
                  <small>{record.date} / {formatKg(record.estimatedOneRepMax)}</small>
                  <PrBadges flags={flags} />
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">PR更新はまだありません。</p>
          )}
        </div>

        <div>
          <h3>最近トレーニングしたメンバー</h3>
          {dashboard.recentMembers.length ? (
            <div className="chip-wrap">
              {dashboard.recentMembers.map((memberName) => (
                <span key={memberName} className="chip">
                  {memberName}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">記録を追加するとここに表示されます。</p>
          )}
        </div>

        <div>
          <h3>最近トレーニングした種目</h3>
          {dashboard.recentExercises.length ? (
            <div className="chip-wrap">
              {dashboard.recentExercises.map((exercise) => (
                <span key={exercise} className="chip">
                  {exercise} / {getExerciseCategory(exercises, exercise)}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">記録を追加するとここに表示されます。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryCards({
  title,
  stats,
  records,
}: {
  title: string;
  stats: ExerciseStats | null;
  records: WorkoutRecord[];
}) {
  const volume = sumVolume(records);

  return (
    <section className="summary-grid" aria-label="サマリーカード">
      <MetricCard label={`${title} 最新1RM`} value={formatNumber(stats?.latestOneRepMax?.estimatedOneRepMax ?? null)} unit="kg" accent />
      <MetricCard label="前回1RM" value={formatNumber(stats?.previousOneRepMax?.estimatedOneRepMax ?? null)} unit="kg" />
      <MetricCard label="初回1RM" value={formatNumber(stats?.firstOneRepMax?.estimatedOneRepMax ?? null)} unit="kg" />
      <MetricCard label="前回比" value={formatDifference(stats?.latestVsPrevious ?? null)} trend={stats?.latestVsPrevious?.delta ?? null} />
      <MetricCard label="初回比" value={formatDifference(stats?.latestVsFirst ?? null)} trend={stats?.latestVsFirst?.delta ?? null} />
      <MetricCard label="期間内合計ボリューム" value={formatNumber(volume)} unit="kg" />
    </section>
  );
}

function BestRecordsSection({ stats, exercises }: { stats: ExerciseStats[]; exercises: ExerciseDefinition[] }) {
  const ranking = [...stats]
    .filter((item) => item.periodBestOneRepMax)
    .sort((a, b) => (b.periodBestOneRepMax?.estimatedOneRepMax ?? 0) - (a.periodBestOneRepMax?.estimatedOneRepMax ?? 0));

  return (
    <section className="section best-section" aria-labelledby="best-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker"><Trophy size={16} /> Best records</span>
          <h2 id="best-title">種目別ベスト記録</h2>
        </div>
      </div>

      {stats.length ? (
        <div className="best-card-grid">
          {stats.map((item) => (
            <article key={item.exercise} className="best-card">
              <div className="best-card-head">
                <div>
                  <h3>{item.exercise}</h3>
                  <p>{item.category}</p>
                </div>
                {hasAnyPr(item.latestPrFlags) && <span className="pr-callout">自己ベスト更新！</span>}
              </div>
              <div className="best-stat-grid">
                <StatLine label="全期間最高1RM" value={formatKg(item.allTimeBestOneRepMax?.estimatedOneRepMax)} />
                <StatLine label="期間内最高1RM" value={formatKg(item.periodBestOneRepMax?.estimatedOneRepMax)} />
                <StatLine label="最高重量" value={formatKg(item.highestWeight ? getComparableWeight(item.highestWeight, exercises) : null)} />
                <StatLine label="最高回数" value={item.highestReps ? `${item.highestReps.reps}回` : '-'} />
                <StatLine label="最高ボリューム" value={formatKg(item.highestVolume?.volume)} />
                <StatLine label="記録日" value={item.bestDate ?? '-'} />
                <StatLine label="最終トレーニング日" value={item.lastTrainingDate ?? '-'} />
                <StatLine label="記録回数" value={`${item.recordCount}回`} />
                <StatLine label="初回1RM" value={formatKg(item.firstOneRepMax?.estimatedOneRepMax)} />
                <StatLine label="最新1RM" value={formatKg(item.latestOneRepMax?.estimatedOneRepMax)} />
                <StatLine label="前回比" value={formatDifference(item.latestVsPrevious)} tone={item.latestVsPrevious?.delta ?? null} />
                <StatLine label="初回比" value={formatDifference(item.latestVsFirst)} tone={item.latestVsFirst?.delta ?? null} />
                <StatLine label="成長量" value={`${formatSigned(item.growthAmount, 'kg')} / ${item.growthRate === null ? '-' : formatSigned(item.growthRate, '%')}`} tone={item.growthAmount} />
              </div>
              <PrBadges flags={item.latestPrFlags} />
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text="表示条件に合うベスト記録はまだありません。" />
      )}

      <div className="ranking-table-wrap">
        <h3>種目別ベスト1RMランキング</h3>
        <div className="table-scroll compact-table">
          <table>
            <thead>
              <tr>
                <th>順位</th>
                <th>種目名</th>
                <th>部位</th>
                <th>最高1RM</th>
                <th>記録日</th>
                <th>最新1RM</th>
                <th>初回比</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((item, index) => (
                <tr key={item.exercise}>
                  <td>{index + 1}</td>
                  <td>{item.exercise}</td>
                  <td>{item.category}</td>
                  <td>{formatKg(item.periodBestOneRepMax?.estimatedOneRepMax)}</td>
                  <td>{item.periodBestOneRepMax?.date ?? '-'}</td>
                  <td>{formatKg(item.latestOneRepMax?.estimatedOneRepMax)}</td>
                  <td>{formatDifference(item.latestVsFirst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RecordsTable({
  records,
  allRecords,
  exercises,
  onEdit,
  onDelete,
}: {
  records: WorkoutRecord[];
  allRecords: WorkoutRecord[];
  exercises: ExerciseDefinition[];
  onEdit: (record: WorkoutRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="section records-section" aria-labelledby="records-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker"><Database size={16} /> Records</span>
          <h2 id="records-title">記録一覧</h2>
        </div>
        <span className="count-pill">{records.length}件</span>
      </div>

      {records.length ? (
        <div className="table-scroll">
          <table>
            <thead>
	              <tr>
	                <th>日付</th>
	                <th>メンバー</th>
	                <th>部位</th>
                <th>種目</th>
                <th>重量</th>
                <th>回数</th>
                <th>セット</th>
                <th>体重</th>
                <th>加重</th>
                <th>推定1RM</th>
                <th>ボリューム</th>
                <th>RPE</th>
                <th>前回比</th>
                <th>初回比</th>
                <th>メモ</th>
                <th>PR</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const flags = getPrFlagsForRecord(record, allRecords, exercises);
                const differences = getRecordDifferences(record, allRecords);
                return (
	                  <tr key={record.id} className={hasAnyPr(flags) ? 'pr-row' : undefined}>
	                    <td>{record.date}</td>
	                    <td><strong>{record.memberName}</strong></td>
	                    <td>{record.category}</td>
                    <td><strong>{record.exercise}</strong></td>
                    <td>{formatKg(record.weight)}</td>
                    <td>{record.reps}回</td>
                    <td>{record.sets}</td>
                    <td>{formatKg(record.bodyWeight)}</td>
                    <td>{formatKg(record.addedWeight)}</td>
                    <td>{formatKg(record.estimatedOneRepMax)}</td>
                    <td>{formatKg(record.volume)}</td>
                    <td>{record.rpe ?? '-'}</td>
                    <td><DiffText value={differences.previous?.delta ?? null} text={formatDifference(differences.previous)} /></td>
                    <td><DiffText value={differences.first?.delta ?? null} text={formatDifference(differences.first)} /></td>
                    <td className="memo-cell">{record.memo || '-'}</td>
                    <td><PrBadges flags={flags} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-button small" type="button" onClick={() => onEdit(record)} title="編集">
                          <Pencil size={15} />
                        </button>
                        <button className="icon-button small danger-icon" type="button" onClick={() => onDelete(record.id)} title="削除">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="まだ記録がありません。上のフォームから追加するか、サンプルデータを入れて確認できます。" />
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  unit,
  accent = false,
  trend,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  trend?: number | null;
}) {
  const trendClass = trend === null || trend === undefined || trend === 0 ? '' : trend > 0 ? ' positive' : ' negative';
  return (
    <div className={`metric-card${accent ? ' accent' : ''}${trendClass}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit && <small>{unit}</small>}
      </strong>
    </div>
  );
}

function ChartPanel({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="section chart-panel">
      <div className="section-heading tight">
        <h2>{title}</h2>
      </div>
      {empty ? <EmptyState text="表示条件に合うグラフデータがありません。" /> : children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function StatLine({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const className = tone === null || tone === undefined || tone === 0 ? '' : tone > 0 ? 'positive-text' : 'negative-text';
  return (
    <div className="stat-line">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

function PrBadges({ flags }: { flags: PrFlags }) {
  const labels = prLabels(flags);
  if (!labels.length) return <span className="muted">-</span>;
  return (
    <div className="pr-badges">
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function DiffText({ value, text }: { value: number | null; text: string }) {
  const className = value === null || value === 0 ? '' : value > 0 ? 'positive-text' : 'negative-text';
  return <span className={className}>{text}</span>;
}

function OneRmTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
	    <div className="chart-tooltip">
	      <strong>{String(row.date)}</strong>
	      <span>{String(row.memberName)} / {String(row.exercise)}</span>
      <span>重量: {formatKg(Number(row.weight))}</span>
      <span>回数: {String(row.reps)}回 / セット: {String(row.sets)}</span>
      {row.bodyWeight !== null && row.bodyWeight !== undefined && <span>体重: {formatKg(Number(row.bodyWeight))}</span>}
      {row.addedWeight !== null && row.addedWeight !== undefined && <span>加重: {formatKg(Number(row.addedWeight))}</span>}
      <span>1RM: {formatKg(Number(row.oneRepMax))}</span>
      <span>ボリューム: {formatKg(Number(row.volume))}</span>
    </div>
  );
}

export default App;
