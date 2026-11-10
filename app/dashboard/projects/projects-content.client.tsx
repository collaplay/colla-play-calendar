"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Download, Plus, Search, CalendarDays, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { PROJECTS_PAGE } from "@/lib/message";
import { ALL_SPACES, getSpaceNameById } from "@/lib/config/config";
import {
  getUiProjectStatus,
  normalizeProjectStatusForUi,
  PROJECT_STATUS_UI_FILTER_OPTIONS,
  type ProjectStatusUi,
} from "@/lib/config/project-status";
import {
  getTaipeiTodayYmd,
  getTaipeiYesterdayYmd,
} from "@/lib/utils/project-effective-status";
import type { Project } from "@/lib/types/project";
import {
  buildProjectsListCsv,
  getProjectsListCsvFilename,
} from "@/lib/services/project/project-list-csv.service";
import {
  isProjectActivityPreset,
  PROJECT_ACTIVITY_TYPE_OPTIONS,
  PROJECT_ACTIVITY_TYPE_OTHER,
} from "@/lib/constants/project-form";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import {
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { ProjectsListSkeleton } from "./projects-list-skeleton";

const DEFAULT_FUTURE_MONTHS = 6;

/** 「已完成」篩選觸發時，歷史專案 bulk 載入之下界（YYYY-MM-DD） */
const PAST_ARCHIVE_FROM_YMD = "2026-01-01";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStart(d: Date): Date {
  return startOfMonth(d);
}

function monthEnd(d: Date): Date {
  return endOfMonth(d);
}

const ProjectsWeekCalendar = dynamic(
  () =>
    import("./projects-week-calendar.client").then((m) => m.ProjectsWeekCalendar),
  { ssr: false },
);

const ProjectsList = dynamic(
  () => import("./projects-list").then((m) => m.ProjectsList),
  { ssr: false },
);

/** Subsequence fuzzy match: query chars appear in order in text. */
function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return true;
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
  }
  return j === q.length;
}

function filterProjectsFuzzy(projects: Project[], query: string): Project[] {
  const q = query.trim();
  if (!q) return projects;
  return projects.filter((p) => {
    const fields = [
      p.referenceNumber,
      p.customer,
      p.eventOrVenueUse,
      p.space,
      p.contactPerson,
    ].filter((field): field is string => Boolean(field));
    return fields.some((field) => fuzzyMatch(field, q));
  });
}

interface ProjectsContentProps {
  projects: Project[];
  /** 由網址帶入的預設狀態篩選（例如 ?status=negotiating 直接開「待處理」清單）；
   *  只在本次瀏覽尚未套用過任何狀態篩選時生效，不會覆蓋使用者已選的篩選快取。 */
  initialStatus?: ProjectStatusUi;
}

// 模組層級快取：讓篩選條件在站內跳轉（點進專案再返回）後保留，
// 整頁重新整理時才會重設。
const filterCache = {
  searchQuery: "",
  spaceIds: new Set<string>(),
  statusValues: new Set<ProjectStatusUi>(),
  contactPeople: new Set<string>(),
  dateRange: undefined as DateRange | undefined,
  activityTypeValues: new Set<string>(),
};

function parseDateToDateOnly(value: string | undefined | null): Date | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return d;
}

function rentalToDateRange(
  rental: NonNullable<Project["rentals"]>[number],
): DateRange | null {
  const from = parseDateToDateOnly(rental.date);
  const to = parseDateToDateOnly(rental.endDate ?? rental.date);
  if (!from || !to) return null;
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

function matchesSelectedDateRange(
  projectRange: DateRange,
  selectedRange: DateRange,
): boolean {
  if (!projectRange.from || !projectRange.to) return false;

  const pFrom = startOfDay(projectRange.from);
  const pTo = endOfDay(projectRange.to);

  const sFrom = selectedRange.from ? startOfDay(selectedRange.from) : null;
  const sTo = selectedRange.to ? endOfDay(selectedRange.to) : null;

  if (sFrom && sTo) {
    return pFrom <= sTo && sFrom <= pTo;
  }

  if (sFrom) {
    return pTo >= sFrom;
  }

  if (sTo) {
    return pFrom <= sTo;
  }

  return true;
}

function formatDateRangeLabel(range: DateRange | undefined): string {
  if (!range?.from && !range?.to) return "全部";
  const fmt = new Intl.DateTimeFormat("zh-TW", { dateStyle: "short" });
  if (range.from && range.to) return `${fmt.format(range.from)}–${fmt.format(range.to)}`;
  if (range.from) return `${fmt.format(range.from)} 起`;
  return "全部";
}

function summarizeSelected(count: number, emptyLabel: string): string {
  if (count <= 0) return emptyLabel;
  return `已選 ${count}`;
}

/** 活動類型篩選：多選為 OR；「其他」含自訂字串（非預設選項） */
function projectMatchesSelectedActivityTypes(
  eventType: string,
  selected: Set<string>,
): boolean {
  for (const opt of selected) {
    if (opt === PROJECT_ACTIVITY_TYPE_OTHER) {
      if (
        eventType === PROJECT_ACTIVITY_TYPE_OTHER ||
        !isProjectActivityPreset(eventType)
      ) {
        return true;
      }
    } else if (eventType === opt) {
      return true;
    }
  }
  return false;
}

export function ProjectsContent({ projects, initialStatus }: ProjectsContentProps) {
  const todayYmd = React.useMemo(() => getTaipeiTodayYmd(), []);

  const [loadedProjectsById, setLoadedProjectsById] = React.useState<
    Map<string, Project>
  >(() => new Map(projects.map((p) => [p.id, p])));
  const loadedProjects = React.useMemo(
    () => Array.from(loadedProjectsById.values()),
    [loadedProjectsById],
  );

  const [loadedPastCursor, setLoadedPastCursor] = React.useState<Date>(() =>
    monthStart(new Date()),
  );
  const [loadedFutureCursor, setLoadedFutureCursor] = React.useState<Date>(() =>
    monthStart(addMonths(new Date(), DEFAULT_FUTURE_MONTHS - 1)),
  );
  const [windowLoading, setWindowLoading] = React.useState(false);
  const [windowLoadError, setWindowLoadError] = React.useState<string | null>(
    null,
  );
  const [pastArchiveLoading, setPastArchiveLoading] = React.useState(false);
  const [pastArchiveError, setPastArchiveError] = React.useState<string | null>(
    null,
  );
  const pastArchiveLoadedRef = React.useRef(false);

  const fetchProjectsWindow = React.useCallback(
    async (range: { from: Date; to: Date }) => {
      const from = toYmd(startOfDay(range.from));
      const to = toYmd(startOfDay(range.to));
      const res = await fetch(`/api/projects?from=${from}&to=${to}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`專案載入失敗（${res.status}）`);
      }
      const json = (await res.json()) as {
        success: boolean;
        data?: Project[];
        error?: string;
      };
      if (!json.success || !Array.isArray(json.data)) {
        throw new Error(json.error || "專案載入失敗");
      }
      return json.data;
    },
    [],
  );

  const mergeProjects = React.useCallback((next: Project[]) => {
    setLoadedProjectsById((prev) => {
      const map = new Map(prev);
      for (const p of next) map.set(p.id, p);
      return map;
    });
  }, []);

  const loadPastArchiveIfNeeded = React.useCallback(async () => {
    if (pastArchiveLoadedRef.current) return;
    const toYmdStr = getTaipeiYesterdayYmd();
    if (PAST_ARCHIVE_FROM_YMD > toYmdStr) {
      pastArchiveLoadedRef.current = true;
      const archiveStart = parseDateToDateOnly(PAST_ARCHIVE_FROM_YMD);
      if (archiveStart) setLoadedPastCursor(monthStart(archiveStart));
      return;
    }
    const fromDate = parseDateToDateOnly(PAST_ARCHIVE_FROM_YMD);
    const toDate = parseDateToDateOnly(toYmdStr);
    if (!fromDate || !toDate) {
      setPastArchiveError("歷史專案載入失敗：日期解析錯誤");
      return;
    }
    setPastArchiveError(null);
    setPastArchiveLoading(true);
    try {
      const data = await fetchProjectsWindow({ from: fromDate, to: toDate });
      React.startTransition(() => {
        mergeProjects(data);
      });
      setLoadedPastCursor(monthStart(fromDate));
      pastArchiveLoadedRef.current = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "歷史專案載入失敗";
      setPastArchiveError(message);
    } finally {
      setPastArchiveLoading(false);
    }
  }, [fetchProjectsWindow, mergeProjects]);

  const ensurePastLoaded = React.useCallback(
    async (target: Date) => {
      const targetMonth = monthStart(target);
      if (targetMonth >= loadedPastCursor) return;
      setWindowLoadError(null);
      setWindowLoading(true);
      try {
        let cursor = monthStart(loadedPastCursor);
        while (cursor > targetMonth) {
          const nextMonth = addMonths(cursor, -1);
          const data = await fetchProjectsWindow({
            from: monthStart(nextMonth),
            to: monthEnd(nextMonth),
          });
          mergeProjects(data);
          cursor = nextMonth;
          setLoadedPastCursor(cursor);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "載入失敗";
        setWindowLoadError(message);
      } finally {
        setWindowLoading(false);
      }
    },
    [fetchProjectsWindow, loadedPastCursor, mergeProjects],
  );

  const ensureFutureLoaded = React.useCallback(
    async (target: Date) => {
      const targetMonth = monthStart(target);
      if (targetMonth <= loadedFutureCursor) return;
      setWindowLoadError(null);
      setWindowLoading(true);
      try {
        let cursor = monthStart(loadedFutureCursor);
        while (cursor < targetMonth) {
          const nextMonth = addMonths(cursor, 1);
          const data = await fetchProjectsWindow({
            from: monthStart(nextMonth),
            to: monthEnd(nextMonth),
          });
          mergeProjects(data);
          cursor = nextMonth;
          setLoadedFutureCursor(cursor);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "載入失敗";
        setWindowLoadError(message);
      } finally {
        setWindowLoading(false);
      }
    },
    [fetchProjectsWindow, loadedFutureCursor, mergeProjects],
  );

  const [searchQuery, setSearchQuery] = React.useState(
    () => filterCache.searchQuery,
  );
  // 過濾列表用延後的值，輸入框本身同步更新，避免中斷注音等輸入法的組字
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [listCsvPopoverOpen, setListCsvPopoverOpen] = React.useState(false);
  const [listCsvRange, setListCsvRange] = React.useState<
    DateRange | undefined
  >(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const [csvDownloading, setCsvDownloading] = React.useState(false);
  const [csvDownloadError, setCsvDownloadError] = React.useState<string | null>(
    null,
  );

  const [selectedSpaceIds, setSelectedSpaceIds] = React.useState<Set<string>>(
    () => new Set(filterCache.spaceIds),
  );
  const [selectedStatusValues, setSelectedStatusValues] = React.useState<
    Set<ProjectStatusUi>
  >(() =>
    filterCache.statusValues.size > 0 || !initialStatus
      ? new Set(filterCache.statusValues)
      : new Set([initialStatus]),
  );
  const [selectedContactPeople, setSelectedContactPeople] = React.useState<
    Set<string>
  >(() => new Set(filterCache.contactPeople));
  const [selectedDateRange, setSelectedDateRange] = React.useState<
    DateRange | undefined
  >(() => filterCache.dateRange);
  const [selectedActivityTypeValues, setSelectedActivityTypeValues] =
    React.useState<Set<string>>(() => new Set(filterCache.activityTypeValues));

  React.useEffect(() => {
    filterCache.searchQuery = searchQuery;
    filterCache.spaceIds = selectedSpaceIds;
    filterCache.statusValues = selectedStatusValues;
    filterCache.contactPeople = selectedContactPeople;
    filterCache.dateRange = selectedDateRange;
    filterCache.activityTypeValues = selectedActivityTypeValues;
  }, [
    searchQuery,
    selectedSpaceIds,
    selectedStatusValues,
    selectedContactPeople,
    selectedDateRange,
    selectedActivityTypeValues,
  ]);

  React.useEffect(() => {
    if (selectedDateRange?.from) {
      void ensurePastLoaded(selectedDateRange.from);
    }
    if (selectedDateRange?.to) {
      void ensureFutureLoaded(selectedDateRange.to);
    }
  }, [ensureFutureLoaded, ensurePastLoaded, selectedDateRange?.from, selectedDateRange?.to]);

  const contactPersonOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of loadedProjects) {
      if (p.contactPerson) set.add(p.contactPerson);
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, "zh-TW", { sensitivity: "base" }),
    );
  }, [loadedProjects]);

  /** 列表篩選／搜尋變更時重掛載 ProjectsList，重設分頁與欄位排序狀態 */
  const projectsListResetKey = React.useMemo(
    () =>
      [
        deferredSearchQuery,
        [...selectedSpaceIds].sort().join(","),
        [...selectedStatusValues].sort().join(","),
        [...selectedContactPeople].sort().join(","),
        [...selectedActivityTypeValues].sort().join(","),
        selectedDateRange?.from?.getTime() ?? "",
        selectedDateRange?.to?.getTime() ?? "",
      ].join("|"),
    [
      deferredSearchQuery,
      selectedActivityTypeValues,
      selectedContactPeople,
      selectedDateRange,
      selectedSpaceIds,
      selectedStatusValues,
    ],
  );

  const filteredProjects = React.useMemo(() => {
    const searched = filterProjectsFuzzy(loadedProjects, deferredSearchQuery);

    const hasAnyFilter =
      selectedSpaceIds.size > 0 ||
      selectedStatusValues.size > 0 ||
      selectedContactPeople.size > 0 ||
      selectedActivityTypeValues.size > 0 ||
      Boolean(selectedDateRange?.from || selectedDateRange?.to);

    if (!hasAnyFilter) return searched;

    const selectedSpaceNameSet =
      selectedSpaceIds.size > 0
        ? new Set(Array.from(selectedSpaceIds, (id) => getSpaceNameById(id)))
        : null;

    return searched.filter((project) => {
      // space
      if (selectedSpaceIds.size > 0) {
        const rentals = project.rentals;
        const matchViaRental =
          rentals?.some((r) =>
            r.spaceIds.some((sid) => selectedSpaceIds.has(sid)),
          ) ?? false;
        const matchViaProjectSpaceName = selectedSpaceNameSet
          ? selectedSpaceNameSet.has(project.space)
          : false;
        if (!matchViaRental && !matchViaProjectSpaceName) return false;
      }

      // status（含租借結束後視為已完成）
      if (selectedStatusValues.size > 0) {
        const uiStatus = getUiProjectStatus(project, todayYmd);
        if (!uiStatus || !selectedStatusValues.has(uiStatus)) return false;
      }

      // contact person
      if (selectedContactPeople.size > 0) {
        if (!selectedContactPeople.has(project.contactPerson)) return false;
      }

      // activity type (OR)
      if (selectedActivityTypeValues.size > 0) {
        if (
          !projectMatchesSelectedActivityTypes(
            project.eventType,
            selectedActivityTypeValues,
          )
        ) {
          return false;
        }
      }

      // date range (intersection)
      if (selectedDateRange?.from || selectedDateRange?.to) {
        const rentals = project.rentals;
        if (rentals?.length) {
          const anyIntersect = rentals.some((r) => {
            const rRange = rentalToDateRange(r);
            if (!rRange?.from || !rRange?.to) return false;
            return matchesSelectedDateRange(rRange, selectedDateRange);
          });
          if (!anyIntersect) return false;
        } else {
          const date = parseDateToDateOnly(project.date);
          if (!date) return false;
          const pRange: DateRange = { from: date, to: date };
          if (!matchesSelectedDateRange(pRange, selectedDateRange)) return false;
        }
      }

      return true;
    });
  }, [
    loadedProjects,
    deferredSearchQuery,
    selectedActivityTypeValues,
    selectedContactPeople,
    selectedDateRange,
    selectedSpaceIds,
    selectedStatusValues,
    todayYmd,
  ]);

  const searchInputId = "projects-search";
  const dropdownResultsLimit = 8;

  const anyFiltersActive =
    selectedSpaceIds.size > 0 ||
    selectedStatusValues.size > 0 ||
    selectedContactPeople.size > 0 ||
    selectedActivityTypeValues.size > 0 ||
    Boolean(selectedDateRange?.from || selectedDateRange?.to);

  const canDownloadListCsv = React.useMemo(() => {
    const r = listCsvRange;
    if (!r?.from || !r?.to) return false;
    return startOfDay(r.to) >= startOfDay(r.from);
  }, [listCsvRange]);

  const handleResetListCsvMonth = React.useCallback(() => {
    const now = new Date();
    setListCsvRange({ from: startOfMonth(now), to: endOfMonth(now) });
    setCsvDownloadError(null);
  }, []);

  const handleDownloadListCsv = React.useCallback(async () => {
    if (!listCsvRange?.from || !listCsvRange?.to || !canDownloadListCsv) return;
    const { from, to } = listCsvRange;
    setCsvDownloadError(null);
    setCsvDownloading(true);
    try {
      // 一律以伺服器查詢結果為準，避免依賴前端 loadedProjects（且需含已完成）
      const projects = await fetchProjectsWindow({
        from: startOfDay(from),
        to: startOfDay(to),
      });
      const csv = buildProjectsListCsv(projects);
      const filename = getProjectsListCsvFilename({ from, to });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setListCsvPopoverOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "CSV 下載失敗";
      setCsvDownloadError(message);
    } finally {
      setCsvDownloading(false);
    }
  }, [canDownloadListCsv, fetchProjectsWindow, listCsvRange]);

  const handleWeekNavigate = React.useCallback(
    (date: Date) => {
      void ensurePastLoaded(monthStart(date));
      void ensureFutureLoaded(monthEnd(date));
    },
    [ensureFutureLoaded, ensurePastLoaded],
  );

  return (
    <div className="flex-1 min-w-0 p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {windowLoadError ? (
          <p className="text-sm text-destructive" role="alert">
            {windowLoadError}
          </p>
        ) : null}
        {pastArchiveError ? (
          <p className="text-sm text-destructive" role="alert">
            {pastArchiveError}
          </p>
        ) : null}
        {windowLoading ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            正在載入更多專案…
          </p>
        ) : null}
        {pastArchiveLoading ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            正在載入歷史專案…
          </p>
        ) : null}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* 新增專案 */}
          <Link href="/dashboard/projects/new">
            <Button
              variant="default"
              className="gap-2"
              aria-label={PROJECTS_PAGE.createNewProjectAria}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              {PROJECTS_PAGE.createNewProject}
            </Button>
          </Link>
          {/* 下載列表 CSV */}
          <Popover
            open={listCsvPopoverOpen}
            onOpenChange={setListCsvPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                aria-label={PROJECTS_PAGE.downloadListCsvAria}
              >
                <Download className="size-4 shrink-0" aria-hidden />
                {PROJECTS_PAGE.downloadListCsv}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto max-w-[min(calc(100vw-2rem),22rem)] p-0"
            >
              <div className="p-2 md:p-3 lg:p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm">
                    {PROJECTS_PAGE.downloadListCsvPopoverTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {PROJECTS_PAGE.downloadListCsvPopoverDescription}
                  </p>
                </div>
                <Calendar
                  mode="range"
                  selected={listCsvRange}
                  onSelect={setListCsvRange}
                  numberOfMonths={1}
                  defaultMonth={listCsvRange?.from}
                  className="w-full"
                />
                {/* 下載錯誤訊息 */}
                {csvDownloadError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {csvDownloadError}
                  </p>
                ) : null}
                {/* Footer Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* 重置月份 */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetListCsvMonth}
                    disabled={csvDownloading}
                    aria-label={PROJECTS_PAGE.downloadListCsvResetMonthAria}
                  >
                    {PROJECTS_PAGE.downloadListCsvResetMonth}
                  </Button>
                  {/* 確認下載 */}
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canDownloadListCsv || csvDownloading}
                    onClick={() => void handleDownloadListCsv()}
                    aria-busy={csvDownloading || undefined}
                  >
                    {csvDownloading
                      ? "下載中…"
                      : PROJECTS_PAGE.downloadListCsvConfirm}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {/* Search Bar */}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverAnchor asChild>
            <div className="relative flex-1 max-w-xl w-full">
              <Label htmlFor={searchInputId} className="sr-only">
                {PROJECTS_PAGE.searchAriaLabel}
              </Label>
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                aria-hidden
              />
              <Input
                id={searchInputId}
                type="search"
                autoComplete="off"
                placeholder={PROJECTS_PAGE.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                className="pl-9"
                aria-label={PROJECTS_PAGE.searchAriaLabel}
              />
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="max-h-[min(20rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) overflow-y-auto p-1"
          >
            {filteredProjects.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground px-2">
                {searchQuery.trim()
                  ? PROJECTS_PAGE.searchNoResults
                  : PROJECTS_PAGE.emptyProjects}
              </div>
            ) : (
              <ul role="list" className="outline-hidden">
                {filteredProjects.slice(0, dropdownResultsLimit).map((project) => (
                  <li key={project.id} role="listitem">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="block cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setSearchOpen(false)}
                    >
                      <span className="font-medium truncate block">
                        {project.eventOrVenueUse}
                      </span>
                      <span className="text-muted-foreground text-xs truncate block">
                        {project.customer}
                        {project.space ? ` · ${project.space}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      </div>

        {/* Filters */}
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="專案篩選器"
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="size-3.5" aria-hidden />
            篩選
          </span>
          {/* 活動類型 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={`${PROJECTS_PAGE.columnActivityType}篩選（${summarizeSelected(selectedActivityTypeValues.size, "全部")}）`}
              >
                {PROJECTS_PAGE.columnActivityType}
                <span className="text-muted-foreground">
                  {summarizeSelected(selectedActivityTypeValues.size, "全部")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(18rem,90vw)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {PROJECTS_PAGE.columnActivityType}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setSelectedActivityTypeValues(new Set())}
                  disabled={selectedActivityTypeValues.size === 0}
                >
                  清除
                </Button>
              </div>
              <div className="mt-2 flex flex-col gap-2 max-h-72 overflow-auto pr-1">
                {PROJECT_ACTIVITY_TYPE_OPTIONS.map((opt) => {
                  const checked = selectedActivityTypeValues.has(opt);
                  return (
                    <label
                      key={opt}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-border/60 px-2 py-2 text-sm hover:bg-accent/40",
                        checked && "bg-accent/30",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          setSelectedActivityTypeValues((prev) => {
                            const set = new Set(prev);
                            if (next) set.add(opt);
                            else set.delete(opt);
                            return set;
                          });
                        }}
                        aria-label={`選取${PROJECTS_PAGE.columnActivityType}：${opt}`}
                      />
                      <span className="min-w-0 truncate">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* 場域 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={`場域篩選（${summarizeSelected(selectedSpaceIds.size, "全部")}）`}
              >
                場域
                <span className="text-muted-foreground">
                  {summarizeSelected(selectedSpaceIds.size, "全部")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(22rem,90vw)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">場域</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setSelectedSpaceIds(new Set())}
                  disabled={selectedSpaceIds.size === 0}
                >
                  清除
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto pr-1">
                {ALL_SPACES.map((space) => {
                  const checked = selectedSpaceIds.has(space.id);
                  return (
                    <label
                      key={space.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-border/60 px-2 py-2 text-sm hover:bg-accent/40",
                        checked && "bg-accent/30",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          setSelectedSpaceIds((prev) => {
                            const set = new Set(prev);
                            if (next) set.add(space.id);
                            else set.delete(space.id);
                            return set;
                          });
                        }}
                        aria-label={`選取場域：${space.name}`}
                      />
                      <span className="min-w-0 truncate">{space.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {space.floor}
                      </span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* 日期 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={`日期篩選（${formatDateRangeLabel(selectedDateRange)}）`}
              >
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                日期
                <span className="text-muted-foreground">
                  {formatDateRangeLabel(selectedDateRange)}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">日期</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setSelectedDateRange(undefined)}
                  disabled={!selectedDateRange?.from && !selectedDateRange?.to}
                >
                  清除
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    setSelectedDateRange({ from: today, to: today });
                  }}
                >
                  今天
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    setSelectedDateRange({
                      from: startOfWeek(now, { weekStartsOn: 1 }),
                      to: endOfWeek(now, { weekStartsOn: 1 }),
                    });
                  }}
                >
                  本週
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    setSelectedDateRange({
                      from: startOfMonth(now),
                      to: endOfMonth(now),
                    });
                  }}
                >
                  本月
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedDateRange(undefined)}
                >
                  全部
                </Button>
              </div>

              <div className="mt-2">
                <Calendar
                  mode="range"
                  selected={selectedDateRange}
                  onSelect={setSelectedDateRange}
                  numberOfMonths={1}
                />
              </div>
            </PopoverContent>
          </Popover>

          {/* 活動狀態 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={`活動狀態篩選（${summarizeSelected(selectedStatusValues.size, "全部")}）`}
              >
                活動狀態
                <span className="text-muted-foreground">
                  {summarizeSelected(selectedStatusValues.size, "全部")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(18rem,90vw)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">活動狀態</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setSelectedStatusValues(new Set())}
                  disabled={selectedStatusValues.size === 0}
                >
                  清除
                </Button>
              </div>
              <div
                className="mt-2 flex flex-col gap-2"
                aria-busy={pastArchiveLoading}
              >
                {PROJECT_STATUS_UI_FILTER_OPTIONS.map((opt) => {
                  const uiValue = normalizeProjectStatusForUi(opt.value);
                  if (!uiValue) return null;
                  const checked = selectedStatusValues.has(uiValue);
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-border/60 px-2 py-2 text-sm hover:bg-accent/40",
                        checked && "bg-accent/30",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={
                          pastArchiveLoading && uiValue === "completed"
                        }
                        onCheckedChange={(next) => {
                          setSelectedStatusValues((prev) => {
                            const set = new Set(prev);
                            if (next) set.add(uiValue);
                            else set.delete(uiValue);
                            return set;
                          });
                          if (next === true && uiValue === "completed") {
                            void loadPastArchiveIfNeeded();
                          }
                        }}
                        aria-label={`選取狀態：${PROJECTS_PAGE[opt.labelKey]}`}
                      />
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          uiValue === "completed" && "text-muted-foreground",
                        )}
                      >
                        {PROJECTS_PAGE[opt.labelKey]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* 接洽人 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={`接洽人篩選（${summarizeSelected(selectedContactPeople.size, "全部")}）`}
              >
                接洽人
                <span className="text-muted-foreground">
                  {summarizeSelected(selectedContactPeople.size, "全部")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(18rem,90vw)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">接洽人</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setSelectedContactPeople(new Set())}
                  disabled={selectedContactPeople.size === 0}
                >
                  清除
                </Button>
              </div>
              <div className="mt-2 flex flex-col gap-2 max-h-72 overflow-auto pr-1">
                {contactPersonOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    目前沒有可用的接洽人選項
                  </p>
                ) : (
                  contactPersonOptions.map((name) => {
                    const checked = selectedContactPeople.has(name);
                    return (
                      <label
                        key={name}
                        className={cn(
                          "flex items-center gap-2 rounded-md border border-border/60 px-2 py-2 text-sm hover:bg-accent/40",
                          checked && "bg-accent/30",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            setSelectedContactPeople((prev) => {
                              const set = new Set(prev);
                              if (next) set.add(name);
                              else set.delete(name);
                              return set;
                            });
                          }}
                          aria-label={`選取接洽人：${name}`}
                        />
                        <span className="min-w-0 truncate">{name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* 清除全部 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => {
              setSelectedSpaceIds(new Set());
              setSelectedStatusValues(new Set());
              setSelectedContactPeople(new Set());
              setSelectedActivityTypeValues(new Set());
              setSelectedDateRange(undefined);
            }}
            disabled={!anyFiltersActive}
            aria-label="清除所有篩選條件"
          >
            <X className="size-4" aria-hidden />
            清除全部
          </Button>
        </div>
      </div>

      <Tabs
        defaultValue="list"
        className="flex-1 flex flex-col items-center min-w-0"
      >
        <TabsList
          className="w-full md:max-w-md grid grid-cols-2"
          aria-label={PROJECTS_PAGE.tabsAriaLabel}
        >
          <TabsTrigger value="list">{PROJECTS_PAGE.tabListView}</TabsTrigger>
          <TabsTrigger value="week">{PROJECTS_PAGE.tabWeekView}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="flex-1 min-w-0 w-full">
          {pastArchiveLoading ? (
            <ProjectsListSkeleton />
          ) : (
            <ProjectsList
              key={projectsListResetKey}
              projects={filteredProjects}
            />
          )}
        </TabsContent>

        <TabsContent value="week" className="flex-1 min-w-0 w-full">
          <ProjectsWeekCalendar
            projects={filteredProjects}
            onNavigate={handleWeekNavigate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
