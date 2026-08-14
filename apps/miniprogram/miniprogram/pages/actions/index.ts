import {
  EXERCISE_CATALOG,
  MUSCLE_GROUPS,
  getMuscleGroup,
  type CatalogExerciseId,
  type MuscleGroupId,
} from "../../shared/core/domain/exercise-catalog";

type MuscleFilter = "all" | MuscleGroupId;

interface MuscleFilterItem {
  id: MuscleFilter;
  label: string;
  active: boolean;
}

interface CatalogRow {
  id: CatalogExerciseId;
  index: string;
  label: string;
  meta: string;
}

interface ActionsPageData {
  filters: MuscleFilterItem[];
  selectedFilter: MuscleFilter;
  focus: string;
  rows: CatalogRow[];
  total: number;
}

interface ActionsPageInstance {
  data: ActionsPageData;
  setData(data: Partial<ActionsPageData>): void;
  updateCatalog(filter: MuscleFilter): void;
}

function filters(selected: MuscleFilter): MuscleFilterItem[] {
  return [
    { id: "all" as const, label: "全部", active: selected === "all" },
    ...MUSCLE_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      active: selected === group.id,
    })),
  ];
}

function rows(filter: MuscleFilter): CatalogRow[] {
  const visible = filter === "all"
    ? EXERCISE_CATALOG
    : EXERCISE_CATALOG.filter((entry) =>
        entry.primaryMuscleGroup === filter);
  return visible.map((entry, index) => ({
    id: entry.id,
    index: String(index + 1).padStart(2, "0"),
    label: entry.label,
    meta: `${entry.difficulty} · ${getMuscleGroup(entry.primaryMuscleGroup).label}`,
  }));
}

Page({
  data: {
    filters: filters("all"),
    selectedFilter: "all",
    focus: "",
    rows: rows("all"),
    total: EXERCISE_CATALOG.length,
  } satisfies ActionsPageData,

  selectMuscle(this: ActionsPageInstance, event: MiniProgramEvent) {
    const filter = String(event.currentTarget.dataset.id ?? "all") as MuscleFilter;
    if (filter !== "all" && !MUSCLE_GROUPS.some((group) => group.id === filter)) return;
    this.updateCatalog(filter);
  },

  updateCatalog(this: ActionsPageInstance, filter: MuscleFilter) {
    this.setData({
      filters: filters(filter),
      selectedFilter: filter,
      focus: filter === "all" ? "" : getMuscleGroup(filter).focus,
      rows: rows(filter),
    });
  },

  openAction(this: ActionsPageInstance, event: MiniProgramEvent) {
    const id = String(event.currentTarget.dataset.id ?? "") as CatalogExerciseId;
    if (!EXERCISE_CATALOG.some((entry) => entry.id === id)) return;
    wx.navigateTo({ url: `/pages/action-detail/index?id=${id}` });
  },

  openFitness() {
    wx.redirectTo({ url: "/pages/records/index" });
  },

  openWorkout() {
    wx.redirectTo({ url: "/pages/setup/index" });
  },

  openProfile() {
    wx.redirectTo({ url: "/pages/profile/index" });
  },
});
