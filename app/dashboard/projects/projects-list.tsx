"use client";

import type React from "react";
import { useCallback, useMemo, useTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Download,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableCaption,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CREATE_PROJECT_PAGE,
  COMMON_ERRORS,
  COMMON_PLACEHOLDERS,
  PROJECTS_PAGE,
  PROJECT_DETAIL_PAGE,
  FNB_AMOUNT_PENDING_LABEL,
  COMMON_ACTIONS,
} from "@/lib/message";
import {
  getStatusLabel,
  getStatusColorClass,
  getUiProjectStatus,
  normalizeProjectStatusForUi,
  PROJECT_STATUS_UI_FILTER_OPTIONS,
  type ProjectStatusUi,
} from "@/lib/config/project-status";
import {
  getEffectiveProjectStatus,
  getTaipeiTodayYmd,
} from "@/lib/utils/project-effective-status";
import {
  PROJECTS_LIST_COLUMNS,
  type ProjectsListColumnConfig,
  type ProjectsListColumnId,
  type ProjectsListSortKey,
} from "@/lib/config/projects-list-table";
import type { Project, ProjectStatus } from "@/lib/types/project";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { getProjectDateKeySummary } from "@/lib/utils/project";
import { formatEquipmentNeedsLine } from "@/lib/utils/project-equipment-needs";
import {
  deleteProject,
  downloadProjectDetailCsv,
  updateProjectStatus,
} from "./[id]/actions";

/** 專案表格每頁筆數（列表為客戶端 slice，僅影響 DOM 與互動） */
const PROJECTS_LIST_PAGE_SIZE = 25;

/** 專案列表：hover 顯示完整內容的長度門檻 */
const PROJECTS_LIST_HOVER_PREVIEW_THRESHOLD = 8;

function summarizeSelected(count: number, emptyLabel: string): string {
  if (count <= 0) return emptyLabel;
  return formatTemplate(PROJECTS_PAGE.selectedCount, { count });
}

function shouldEnableHoverPreview(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === COMMON_PLACEHOLDERS.dash) return false;
  return trimmed.length > PROJECTS_LIST_HOVER_PREVIEW_THRESHOLD;
}

function ProjectsListMaybeTooltipText({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}): React.ReactNode {
  if (!shouldEnableHoverPreview(value)) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[min(28rem,90vw)] max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word">
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

function ProjectsListMaybeHoverCardText({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}): React.ReactNode {
  if (!shouldEnableHoverPreview(value)) return children;

  return (
    <HoverCard openDelay={80} closeDelay={50}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-full max-w-lg whitespace-pre-wrap wrap-break-word p-3 text-sm leading-relaxed"
      >
        {value}
      </HoverCardContent>
    </HoverCard>
  );
}

function formatTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/**
 * 產生分頁按鈕序列（頁碼或省略號），總頁數大時收斂顯示。
 */
function buildPaginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const result: Array<number | "ellipsis"> = [];
  result.push(1);

  if (currentPage <= 4) {
    result.push(2, 3, 4, 5, "ellipsis", totalPages);
  } else if (currentPage >= totalPages - 3) {
    result.push(
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    );
  } else {
    result.push(
      "ellipsis",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "ellipsis",
      totalPages,
    );
  }

  return result;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "short",
});

// const CURRENCY_FORMATTER = new Intl.NumberFormat("zh-TW", {
//   style: "currency",
//   currency: "TWD",
// });

/** 列表「金額」欄：僅顯示整數（無小數） */
const CURRENCY_FORMATTER_INTEGER = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 設備勾選一行顯示（與 CSV／詳情一致） */
const EQUIPMENT_NEEDS_LINE_LABELS = {
  microphone: CREATE_PROJECT_PAGE.labelEquipmentMicrophone,
  extensionCord: CREATE_PROJECT_PAGE.labelEquipmentExtensionCord,
  projector: CREATE_PROJECT_PAGE.labelEquipmentProjector,
  whiteboard: CREATE_PROJECT_PAGE.labelEquipmentWhiteboard,
  noOtherEquipmentNeeds: CREATE_PROJECT_PAGE.labelEquipmentNoOtherNeeds,
} as const;

type SortDirection = "asc" | "desc";

type SortState = { key: ProjectsListSortKey; dir: SortDirection } | null;

interface ProjectsListProps {
  projects: Project[];
}

function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseDateToEpochMs(value: string | undefined): number | null {
  if (!value) return null;
  // 對 date-only 字串用 T12 避免時區偏移造成跨日
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function getEarliestRentalDateKey(project: Project): string | null {
  const rentals = project.rentals;
  if (!rentals?.length) return null;
  const keys = rentals
    .map((r) => r.date?.slice(0, 10))
    .filter(Boolean) as string[];
  if (keys.length === 0) return null;
  keys.sort((a, b) => a.localeCompare(b));
  return keys[0] ?? null;
}

function getRentalTimeMinutesForDateKey(project: Project, dateKey: string): {
  minStart: number | null;
  maxEnd: number | null;
} {
  const rentals = project.rentals;
  if (!rentals?.length) return { minStart: null, maxEnd: null };
  const dk = dateKey.slice(0, 10);
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  for (const r of rentals) {
    if (r.date?.slice(0, 10) !== dk) continue;
    const s = parseTimeToMinutes(r.startTime);
    const e = parseTimeToMinutes(r.endTime);
    if (s != null) minStart = minStart == null ? s : Math.min(minStart, s);
    if (e != null) maxEnd = maxEnd == null ? e : Math.max(maxEnd, e);
  }
  return { minStart, maxEnd };
}

/** 預設排序：解析 ISO / date-only 為 Date（與篩選／列表日期欄一致） */
function parseDateToDateOnly(value: string | undefined | null): Date | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? d : null;
}

/** 租借起訖整理為時間序區間（與 projects-content rentalToDateRange 對齊） */
function rentalToOrderedDateRange(
  rental: NonNullable<Project["rentals"]>[number],
): { from: Date; to: Date } | null {
  const from = parseDateToDateOnly(rental.date);
  const to = parseDateToDateOnly(rental.endDate ?? rental.date);
  if (!from || !to) return null;
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

/** 今日（日曆起點）到區間〔含〕最近距離（天數）；今天在區間內為 0 */
function minCalendarDistanceToInclusiveRange(
  todayStart: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const t = startOfDay(todayStart).getTime();
  const sd = startOfDay(rangeStart).getTime();
  const ed = startOfDay(rangeEnd).getTime();
  if (t >= sd && t <= ed) return 0;
  if (t < sd) return differenceInCalendarDays(startOfDay(rangeStart), startOfDay(todayStart));
  return differenceInCalendarDays(startOfDay(todayStart), startOfDay(rangeEnd));
}

/** 預設排序：與今天日曆距離最小的活動日（多段租借取最小距離；無有效租借則 fallback project.date） */
function getNearestActivityCalendarDistance(
  project: Project,
  todayStart: Date,
): number {
  let minDist = Infinity;
  const rentals = project.rentals;
  if (rentals?.length) {
    for (const r of rentals) {
      const range = rentalToOrderedDateRange(r);
      if (!range) continue;
      const d = minCalendarDistanceToInclusiveRange(
        todayStart,
        range.from,
        range.to,
      );
      if (d < minDist) minDist = d;
    }
  }
  if (minDist !== Infinity) return minDist;
  const single = parseDateToDateOnly(project.date);
  if (!single) return Infinity;
  return minCalendarDistanceToInclusiveRange(todayStart, single, single);
}

/** 預設排序：已完成專案置於非完成之後（含租借結束後視為已完成） */
function isCompletedBucket(project: Project, todayYmd: string): boolean {
  return getEffectiveProjectStatus(project, todayYmd) === "completed";
}

function parseIntIfNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

/** 與 ProjectsListSortKey 對齊；增刪欄位時須同步更新 */
function makeProjectListSortValueGetters(): {
  [K in ProjectsListSortKey]: (project: Project) => string | number | null;
} {
  return {
  referenceNumber: (p) => p.referenceNumber ?? "",
  eventType: (p) => p.eventType ?? "",
  customer: (p) => p.customer ?? "",
  eventOrVenueUse: (p) => p.eventOrVenueUse ?? "",
  space: (p) => p.space ?? "",
  date: (p) => {
    const earliest = getEarliestRentalDateKey(p);
    return (
      parseDateToEpochMs(earliest ?? undefined) ?? parseDateToEpochMs(p.date)
    );
  },
  eventStartTime: (p) => {
    const dk = getEarliestRentalDateKey(p);
    if (!dk) return null;
    return getRentalTimeMinutesForDateKey(p, dk).minStart;
  },
  eventEndTime: (p) => {
    const dk = getEarliestRentalDateKey(p);
    if (!dk) return null;
    return getRentalTimeMinutesForDateKey(p, dk).maxEnd;
  },
  contactPerson: (p) => p.contactPerson ?? "",
  amount: (p) => p.amount ?? null,
  tables: (p) => {
    const n = parseIntIfNumeric(p.tables);
    return n ?? p.tables ?? "";
  },
  chairs: (p) => {
    const s = p.chairs;
    if (s == null || s === "") return null;
    const n = parseIntIfNumeric(s);
    return n ?? s;
  },
  fnbItems: (p) => p.fnbItems ?? "",
  needsPrintedNotice: (p) => (p.needsPrintedNotice ? 1 : 0),
  otherEquipment: (p) =>
    formatEquipmentNeedsLine(p.equipmentNeeds, EQUIPMENT_NEEDS_LINE_LABELS) ??
    "",
  rentalAmountTotal: (p) => p.rentalAmountTotal,
  fnbAmountTotal: (p) =>
    p.hasFnbAmountPending ? null : p.fnbAmountTotal,
  paidAmountTotal: (p) => p.paidAmountTotal,
  pendingAmountTotal: (p) => p.pendingAmountTotal,
  totalAttendees: (p) => {
    const s = p.totalAttendees;
    if (s == null || s === "") return null;
    const n = parseIntIfNumeric(s);
    return n ?? s;
  },
  internalNotes: (p) => p.internalNotes ?? "",
};
}

function getAriaSort(
  sort: SortState,
  key: ProjectsListSortKey,
): React.AriaAttributes["aria-sort"] {
  if (!sort || sort.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDirection }) {
  if (!active) {
    return (
      <ArrowUpDown
        className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden
      />
    );
  }
  return dir === "asc" ? (
    <ArrowUp className="size-3.5 text-primary" aria-hidden />
  ) : (
    <ArrowDown className="size-3.5 text-primary" aria-hidden />
  );
}

const HEADER_BTN_BASE =
  "group inline-flex items-center gap-2 rounded-sm hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const HEADER_BTN_END =
  "group inline-flex w-full items-center justify-end gap-2 rounded-sm hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

type ColumnWithSticky = ProjectsListColumnConfig & {
  stickyHeaderClassName?: string;
  stickyCellClassName?: string;
};

function projectsListStickyHeaderClass(column: ProjectsListColumnConfig) {
  return (column as ColumnWithSticky).stickyHeaderClassName;
}

function projectsListStickyCellClass(column: ProjectsListColumnConfig) {
  return (column as ColumnWithSticky).stickyCellClassName;
}

function ProjectsListTableHeadCell({
  column,
  sort,
  onToggleSort,
}: {
  column: ProjectsListColumnConfig;
  sort: SortState;
  onToggleSort: (key: ProjectsListSortKey) => void;
}) {
  if (!column.sortable) {
    return (
      <TableHead
        scope="col"
        className={cn(
          "headerClassName" in column ? column.headerClassName : undefined,
          projectsListStickyHeaderClass(column),
        )}
      >
        {column.label}
      </TableHead>
    );
  }

  const sortKey = column.id;
  const headerClassName =
    "headerClassName" in column ? column.headerClassName : undefined;
  const stickyHeaderClassName = projectsListStickyHeaderClass(column);
  const headerButtonJustifyEnd =
    "headerButtonJustifyEnd" in column && column.headerButtonJustifyEnd;

  return (
    <TableHead
      scope="col"
      className={cn(headerClassName, stickyHeaderClassName)}
      aria-sort={getAriaSort(sort, sortKey)}
    >
      <button
        type="button"
        className={headerButtonJustifyEnd ? HEADER_BTN_END : HEADER_BTN_BASE}
        onClick={() => onToggleSort(sortKey)}
      >
        <span>{column.label}</span>
        <SortIcon
          active={sort?.key === sortKey}
          dir={sort?.key === sortKey ? sort.dir : "asc"}
        />
      </button>
    </TableHead>
  );
}

function ProjectsListStatusHeadCell({
  column,
  selectedStatusValues,
  onUpdateSelectedStatusValues,
}: {
  column: ProjectsListColumnConfig;
  selectedStatusValues: ReadonlySet<ProjectStatusUi>;
  onUpdateSelectedStatusValues: (
    next: React.SetStateAction<Set<ProjectStatusUi>>,
  ) => void;
}) {
  const headerClassName =
    "headerClassName" in column ? column.headerClassName : undefined;
  const stickyHeaderClassName = projectsListStickyHeaderClass(column);

  return (
    <TableHead scope="col" className={cn(headerClassName, stickyHeaderClassName)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label={formatTemplate(PROJECTS_PAGE.statusFilterAria, {
              label: PROJECTS_PAGE.columnStatus,
              selectedSummary: summarizeSelected(
                selectedStatusValues.size,
                PROJECTS_PAGE.filterAll,
              ),
            })}
          >
            {PROJECTS_PAGE.columnStatus}：
            <span className="text-muted-foreground">
              {summarizeSelected(selectedStatusValues.size, PROJECTS_PAGE.filterAll)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(18rem,90vw)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{PROJECTS_PAGE.columnStatus}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => onUpdateSelectedStatusValues(new Set())}
              disabled={selectedStatusValues.size === 0}
            >
              {COMMON_ACTIONS.clear}
            </Button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
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
                    onCheckedChange={(next) => {
                      onUpdateSelectedStatusValues((prev) => {
                        const set = new Set(prev);
                        if (next) set.add(uiValue);
                        else set.delete(uiValue);
                        return set;
                      });
                    }}
                    aria-label={formatTemplate(PROJECTS_PAGE.statusSelectAria, {
                      label: PROJECTS_PAGE[opt.labelKey],
                    })}
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
    </TableHead>
  );
}

type ActionsCellContext = {
  downloadingId: string | null;
  deletingId: string | null;
  deleteError: string | null;
  onDownloadCsv: (projectId: string) => void;
  onDeleteConfirm: (projectId: string) => void;
  onAlertOpenChange: (open: boolean) => void;
  statusUpdatingId: string | null;
  statusErrorById: Readonly<Record<string, string | undefined>>;
  statusOverrideById: Readonly<Record<string, ProjectStatus | undefined>>;
  onUpdateProjectStatus: (project: Project, next: ProjectStatus) => void;
  confirmingId: string | null;
  onConfirmAndLeave: (project: Project) => void;
  cancelConfirmId: string | null;
  onRequestCancelDelete: (projectId: string) => void;
  onCancelDeleteOpenChange: (open: boolean) => void;
};

function renderProjectsListCell(
  columnId: ProjectsListColumnId,
  project: Project,
  todayYmd: string,
  actionsCtx: ActionsCellContext,
): React.ReactNode {
  switch (columnId) {
    case "referenceNumber":
      return project.referenceNumber ?? COMMON_PLACEHOLDERS.dash;
    case "eventType":
      return project.eventType?.trim() ? project.eventType : COMMON_PLACEHOLDERS.dash;
    case "eventOrVenueUse":
      return (
        <ProjectsListMaybeTooltipText value={project.eventOrVenueUse}>
          <Link
            href={`/dashboard/projects/${project.id}`}
            className="font-medium text-primary hover:underline focus:outline-none focus:underline"
          >
            {project.eventOrVenueUse}
          </Link>
        </ProjectsListMaybeTooltipText>
      );
    case "customer":
      return (
        <ProjectsListMaybeTooltipText value={project.customer}>
          <span className="block min-w-0 truncate">{project.customer}</span>
        </ProjectsListMaybeTooltipText>
      );
    case "space":
      return project.space;
    case "date":
      {
        const summary =
          getProjectDateKeySummary(project, {
            maxShown: 2,
            formatDate: (d) => DATE_FORMATTER.format(d),
          }) ?? COMMON_PLACEHOLDERS.dash;
        return (
          <ProjectsListMaybeTooltipText value={summary}>
            <span className="block min-w-0 truncate">{summary}</span>
          </ProjectsListMaybeTooltipText>
        );
      }
    case "eventStartTime": {
      const dk = getEarliestRentalDateKey(project);
      if (!dk) return COMMON_PLACEHOLDERS.dash;
      const { minStart } = getRentalTimeMinutesForDateKey(project, dk);
      if (minStart == null) return COMMON_PLACEHOLDERS.dash;
      const hh = String(Math.floor(minStart / 60)).padStart(2, "0");
      const mm = String(minStart % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    case "eventEndTime": {
      const dk = getEarliestRentalDateKey(project);
      if (!dk) return COMMON_PLACEHOLDERS.dash;
      const { maxEnd } = getRentalTimeMinutesForDateKey(project, dk);
      if (maxEnd == null) return COMMON_PLACEHOLDERS.dash;
      const hh = String(Math.floor(maxEnd / 60)).padStart(2, "0");
      const mm = String(maxEnd % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    case "contactPerson":
      return project.contactPerson;
    case "amount":
      return CURRENCY_FORMATTER_INTEGER.format(project.amount);
    case "confirm": {
      const eff = getEffectiveProjectStatus(project, todayYmd);
      if (eff !== "negotiating") return null;
      const isUpdating = actionsCtx.statusUpdatingId === project.id;
      const isConfirming = actionsCtx.confirmingId === project.id;
      const isDeleting = actionsCtx.deletingId === project.id;
      const dialogOpen = actionsCtx.cancelConfirmId === project.id;
      return (
        <>
          <Select
            value=""
            disabled={isUpdating || isConfirming || isDeleting}
            onValueChange={(next) => {
              if (next === "confirmed") {
                actionsCtx.onConfirmAndLeave(project);
              } else if (next === "cancelled") {
                actionsCtx.onRequestCancelDelete(project.id);
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-full justify-start"
              aria-label={formatTemplate(PROJECTS_PAGE.confirmSelectAria, {
                name: project.eventOrVenueUse,
              })}
            >
              <SelectValue placeholder={PROJECTS_PAGE.confirmSelectPlaceholder} />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="confirmed">
                {PROJECTS_PAGE.confirmOptionApprove}
              </SelectItem>
              <SelectItem value="cancelled">
                {PROJECTS_PAGE.confirmOptionCancel}
              </SelectItem>
            </SelectContent>
          </Select>
          <AlertDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (!open) actionsCtx.onCancelDeleteOpenChange(false);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {PROJECTS_PAGE.cancelDeleteConfirmTitle}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {PROJECTS_PAGE.cancelDeleteConfirmDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {actionsCtx.deleteError ? (
                <p className="text-sm text-destructive" role="alert">
                  {actionsCtx.deleteError}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {PROJECT_DETAIL_PAGE.deleteConfirmCancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => actionsCtx.onDeleteConfirm(project.id)}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? PROJECT_DETAIL_PAGE.deleteConfirmDeleting
                    : PROJECT_DETAIL_PAGE.deleteConfirmConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    }
    case "status": {
      const effBase = getEffectiveProjectStatus(project, todayYmd);
      if (effBase === "completed") {
        const statusForUi = normalizeProjectStatusForUi(effBase);
        return statusForUi ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className={cn("size-2 shrink-0 rounded-full", "bg-muted-foreground")}
              aria-hidden
            />
            {getStatusLabel(effBase)}
          </span>
        ) : null;
      }

      const overrideStatus = actionsCtx.statusOverrideById[project.id];
      const eff = getEffectiveProjectStatus(
        overrideStatus ? { ...project, status: overrideStatus } : project,
        todayYmd,
      );
      const statusForUi = normalizeProjectStatusForUi(eff);

      const isUpdating = actionsCtx.statusUpdatingId === project.id;
      const errorMessage = actionsCtx.statusErrorById[project.id];

      const selectValue: Extract<ProjectStatusUi, "negotiating" | "confirmed" | "cancelled"> =
        statusForUi === "confirmed" || statusForUi === "cancelled"
          ? statusForUi
          : "negotiating";

      return (
        <div className="flex flex-col gap-1">
          <Select
            value={selectValue}
            onValueChange={(next) => {
              const nextDbStatus = next as ProjectStatus;
              actionsCtx.onUpdateProjectStatus(project, nextDbStatus);
            }}
            disabled={isUpdating}
          >
            <SelectTrigger
              size="sm"
              className={cn(
                "h-8 w-full justify-start border-transparent bg-transparent px-2 py-1 shadow-none hover:bg-accent/40 focus-visible:ring-primary/40",
                isUpdating && "opacity-80",
              )}
              aria-label={formatTemplate(PROJECTS_PAGE.statusUpdateAria, {
                name: project.eventOrVenueUse,
              })}
            >
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      selectValue === "cancelled"
                        ? getStatusColorClass("cancelled")
                        : getStatusColorClass(eff),
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">
                    {selectValue === "negotiating"
                      ? PROJECTS_PAGE.statusNegotiating
                      : selectValue === "confirmed"
                        ? PROJECTS_PAGE.statusConfirmed
                        : PROJECTS_PAGE.statusCancelledOption}
                  </span>
                  {isUpdating ? (
                    <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
                  ) : null}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="negotiating">
                {PROJECTS_PAGE.statusNegotiating}
              </SelectItem>
              <SelectItem value="confirmed">{PROJECTS_PAGE.statusConfirmed}</SelectItem>
              <SelectItem value="cancelled">
                {PROJECTS_PAGE.statusCancelledOption}
              </SelectItem>
            </SelectContent>
          </Select>
          {errorMessage ? (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      );
    }
    case "totalAttendees":
      return project.totalAttendees != null
        ? project.totalAttendees
        : COMMON_PLACEHOLDERS.dash;
    case "tables":
      return project.tables ?? COMMON_PLACEHOLDERS.dash;
    case "chairs":
      return project.chairs != null ? project.chairs : COMMON_PLACEHOLDERS.dash;
    case "otherEquipment":
      {
        const line =
          formatEquipmentNeedsLine(
            project.equipmentNeeds,
            EQUIPMENT_NEEDS_LINE_LABELS,
          ) ?? COMMON_PLACEHOLDERS.dash;
        return (
          <ProjectsListMaybeHoverCardText value={line}>
            <span className="block min-w-0 truncate">{line}</span>
          </ProjectsListMaybeHoverCardText>
        );
      }
    case "rentalAmountTotal":
      return CURRENCY_FORMATTER_INTEGER.format(project.rentalAmountTotal);
    case "fnbAmountTotal":
      return project.hasFnbAmountPending
        ? FNB_AMOUNT_PENDING_LABEL
        : CURRENCY_FORMATTER_INTEGER.format(project.fnbAmountTotal);
    case "paidAmountTotal":
      return CURRENCY_FORMATTER_INTEGER.format(project.paidAmountTotal);
    case "pendingAmountTotal":
      return CURRENCY_FORMATTER_INTEGER.format(project.pendingAmountTotal);
    case "fnbItems":
      {
        const items = project.fnbItems ?? COMMON_PLACEHOLDERS.dash;
        return (
          <ProjectsListMaybeHoverCardText value={items}>
            <span className="block min-w-0 truncate">{items}</span>
          </ProjectsListMaybeHoverCardText>
        );
      }
    case "needsPrintedNotice":
      return <span>{project.needsPrintedNotice ? "是" : "否"}</span>;
    case "internalNotes":
      {
        const notes = project.internalNotes ?? COMMON_PLACEHOLDERS.dash;
        return (
          <ProjectsListMaybeHoverCardText value={notes}>
            <span className="block min-w-0 truncate">{notes}</span>
          </ProjectsListMaybeHoverCardText>
        );
      }
    case "actions":
      return (
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={PROJECT_DETAIL_PAGE.buttonDownloadCsv}
                onClick={() => actionsCtx.onDownloadCsv(project.id)}
                disabled={actionsCtx.downloadingId === project.id}
              >
                {actionsCtx.downloadingId === project.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {PROJECTS_PAGE.actionDownloadTooltip}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                asChild
                aria-label={PROJECTS_PAGE.actionDuplicateAria}
              >
                <Link href={`/dashboard/projects/new?duplicateFrom=${project.id}`}>
                  <Copy className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {PROJECTS_PAGE.actionDuplicateTooltip}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                asChild
                aria-label={PROJECTS_PAGE.actionEditAria}
              >
                <Link href={`/dashboard/projects/${project.id}`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {PROJECTS_PAGE.actionEditTooltip}
            </TooltipContent>
          </Tooltip>
          <AlertDialog
            onOpenChange={(open) => {
              actionsCtx.onAlertOpenChange(open);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive"
                    aria-label={PROJECTS_PAGE.actionDeleteAria}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {PROJECTS_PAGE.actionDeleteTooltip}
              </TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {PROJECT_DETAIL_PAGE.deleteConfirmTitle}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {PROJECT_DETAIL_PAGE.deleteConfirmDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {actionsCtx.deleteError ? (
                <p className="text-sm text-destructive" role="alert">
                  {actionsCtx.deleteError}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {PROJECT_DETAIL_PAGE.deleteConfirmCancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => actionsCtx.onDeleteConfirm(project.id)}
                  disabled={actionsCtx.deletingId === project.id}
                >
                  {actionsCtx.deletingId === project.id
                    ? PROJECT_DETAIL_PAGE.deleteConfirmDeleting
                    : PROJECT_DETAIL_PAGE.deleteConfirmConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    default: {
      const _exhaustive: never = columnId;
      return _exhaustive;
    }
  }
}

export function ProjectsList({ projects }: ProjectsListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [statusErrorById, setStatusErrorById] = useState<
    Record<string, string | undefined>
  >({});
  const [statusOverrideById, setStatusOverrideById] = useState<
    Record<string, ProjectStatus | undefined>
  >({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [selectedStatusValues, setSelectedStatusValues] = useState<
    Set<ProjectStatusUi>
  >(() => new Set());

  const todayYmd = useMemo(() => getTaipeiTodayYmd(), []);
  const sortValueGetters = useMemo(
    () => makeProjectListSortValueGetters(),
    [],
  );

  const updateSelectedStatusValues = useCallback(
    (next: React.SetStateAction<Set<ProjectStatusUi>>) => {
      setPage(1);
      setSelectedStatusValues(next);
    },
    [],
  );

  const sortedProjects = useMemo(() => {
    const localeCompareZhTw = (a: string, b: string) =>
      a.localeCompare(b, "zh-TW", { sensitivity: "base" });

    const pinRank = (project: Project): number => {
      if (selectedStatusValues.size === 0) return 0;
      const uiStatus = getUiProjectStatus(project, todayYmd);
      return uiStatus && selectedStatusValues.has(uiStatus) ? 0 : 1;
    };

    if (!sort) {
      const todayStart = startOfDay(new Date());
      const withMeta = projects.map((project, originalIndex) => ({
        project,
        originalIndex,
        pinRank: pinRank(project),
        completedRank: isCompletedBucket(project, todayYmd) ? 1 : 0,
        distance: getNearestActivityCalendarDistance(project, todayStart),
      }));

      withMeta.sort((a, b) => {
        if (a.pinRank !== b.pinRank) return a.pinRank - b.pinRank;
        if (a.completedRank !== b.completedRank) {
          return a.completedRank - b.completedRank;
        }
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }
        return a.originalIndex - b.originalIndex;
      });

      return withMeta.map((x) => x.project);
    }

    const getter = sortValueGetters[sort.key];

    const withIndex = projects.map((project, originalIndex) => ({
      project,
      originalIndex,
      value: getter(project),
      pinRank: pinRank(project),
    }));

    withIndex.sort((a, b) => {
      if (a.pinRank !== b.pinRank) return a.pinRank - b.pinRank;
      const dirMultiplier = sort.dir === "asc" ? 1 : -1;
      const aVal = a.value;
      const bVal = b.value;

      if (aVal == null && bVal == null)
        return a.originalIndex - b.originalIndex;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let result = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        result = aVal - bVal;
      } else if (typeof aVal === "string" && typeof bVal === "string") {
        result = localeCompareZhTw(aVal, bVal);
      } else if (typeof aVal === "number" && typeof bVal === "string") {
        // 混合型別（例如 tables）：數字先排前，再排文字
        result = -1;
      } else if (typeof aVal === "string" && typeof bVal === "number") {
        result = 1;
      } else {
        result = localeCompareZhTw(String(aVal), String(bVal));
      }

      if (result === 0) return a.originalIndex - b.originalIndex;
      return result * dirMultiplier;
    });

    return withIndex.map((x) => x.project);
  }, [projects, selectedStatusValues, sort, sortValueGetters, todayYmd]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedProjects.length / PROJECTS_LIST_PAGE_SIZE),
  );

  const activePage = Math.min(Math.max(1, page), totalPages);

  const paginatedProjects = useMemo(() => {
    const start = (activePage - 1) * PROJECTS_LIST_PAGE_SIZE;
    return sortedProjects.slice(start, start + PROJECTS_LIST_PAGE_SIZE);
  }, [sortedProjects, activePage]);

  const rangeStart =
    sortedProjects.length === 0 ? 0 : (activePage - 1) * PROJECTS_LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    activePage * PROJECTS_LIST_PAGE_SIZE,
    sortedProjects.length,
  );

  const paginationItems =
    sortedProjects.length > 0 ? buildPaginationItems(activePage, totalPages) : [];

  const paginationSummaryText = formatTemplate(
    PROJECTS_PAGE.listPaginationSummary,
    {
      start: rangeStart,
      end: rangeEnd,
      total: sortedProjects.length,
    },
  );

  const paginationSrOnlyText = formatTemplate(
    PROJECTS_PAGE.listPaginationSrOnly,
    {
      page: activePage,
      pages: totalPages,
    },
  );

  function toggleSort(nextKey: ProjectsListSortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== nextKey) return { key: nextKey, dir: "asc" };
      return { key: nextKey, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function handleDeleteConfirm(projectId: string) {
    setDeleteError(null);
    setDeletingId(projectId);
    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.success) {
        setDeleteError(result.error);
        setDeletingId(null);
        return;
      }
      setCancelConfirmId((prev) => (prev === projectId ? null : prev));
      router.refresh();
    });
  }

  const handleDownloadCsv = useCallback((projectId: string) => {
    setDownloadingId(projectId);
    startTransition(async () => {
      const result = await downloadProjectDetailCsv(projectId);
      if (!result.success) {
        setDownloadingId(null);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadingId(null);
    });
  }, []);

  const handleUpdateProjectStatus = useCallback(
    (project: Project, nextStatus: ProjectStatus) => {
      const projectId = project.id;
      setStatusUpdatingId(projectId);
      setStatusErrorById((prev) => ({ ...prev, [projectId]: undefined }));

      const optimisticStatus: ProjectStatus =
        nextStatus === "confirmed" ? "confirmed" : nextStatus;

      setStatusOverrideById((prev) => ({ ...prev, [projectId]: optimisticStatus }));

      startTransition(async () => {
        const result = await updateProjectStatus(projectId, optimisticStatus);
        if (!result.success) {
          setStatusOverrideById((prev) => {
            const next = { ...prev };
            delete next[projectId];
            return next;
          });
          setStatusErrorById((prev) => ({
            ...prev,
            [projectId]: result.error || COMMON_ERRORS.updateFailed,
          }));
          setStatusUpdatingId(null);
          return;
        }

        setStatusUpdatingId(null);
        setStatusOverrideById((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        router.refresh();
      });
    },
    [router, startTransition],
  );

  const handleConfirmAndLeave = useCallback(
    (project: Project) => {
      const projectId = project.id;
      setConfirmingId(projectId);
      setStatusErrorById((prev) => ({ ...prev, [projectId]: undefined }));

      startTransition(async () => {
        const result = await updateProjectStatus(projectId, "confirmed");
        if (!result.success) {
          setConfirmingId(null);
          setStatusErrorById((prev) => ({
            ...prev,
            [projectId]: result.error || COMMON_ERRORS.updateFailed,
          }));
          return;
        }
        router.push("/dashboard/projects");
      });
    },
    [router, startTransition],
  );

  const actionsCellCtx = useMemo<ActionsCellContext>(
    () => ({
      downloadingId,
      deletingId,
      deleteError,
      onDownloadCsv: handleDownloadCsv,
      onDeleteConfirm: handleDeleteConfirm,
      onAlertOpenChange: (open) => {
        if (!open) setDeleteError(null);
      },
      statusUpdatingId,
      statusErrorById,
      statusOverrideById,
      onUpdateProjectStatus: handleUpdateProjectStatus,
      confirmingId,
      onConfirmAndLeave: handleConfirmAndLeave,
      cancelConfirmId,
      onRequestCancelDelete: (projectId) => {
        setDeleteError(null);
        setCancelConfirmId(projectId);
      },
      onCancelDeleteOpenChange: (open) => {
        if (!open) {
          setCancelConfirmId(null);
          setDeleteError(null);
        }
      },
    }),
    [
      downloadingId,
      deletingId,
      deleteError,
      handleDownloadCsv,
      handleUpdateProjectStatus,
      statusErrorById,
      statusOverrideById,
      statusUpdatingId,
      confirmingId,
      handleConfirmAndLeave,
      cancelConfirmId,
    ],
  );

  return (
    <section
      className="flex-1 min-w-0 rounded-xl border border-border bg-card/50 backdrop-blur-sm [&_th]:p-4 [&_td]:p-4"
      aria-label={PROJECTS_PAGE.tableCaption}
    >
      {projects.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center px-4">
          {PROJECTS_PAGE.emptyProjects}
        </p>
      ) : (
        <div className="min-w-0 flex flex-col">
          <div className="overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">
                {PROJECTS_PAGE.tableCaption}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  {PROJECTS_LIST_COLUMNS.map((column) => {
                    if (column.id === "status") {
                      return (
                        <ProjectsListStatusHeadCell
                          key={column.id}
                          column={column}
                          selectedStatusValues={selectedStatusValues}
                          onUpdateSelectedStatusValues={updateSelectedStatusValues}
                        />
                      );
                    }
                    return (
                      <ProjectsListTableHeadCell
                        key={column.id}
                        column={column}
                        sort={sort}
                        onToggleSort={toggleSort}
                      />
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:last-child_td:first-child]:rounded-bl-xl">
                {paginatedProjects.map((project) => (
                    <TableRow key={project.id} className="group">
                      {PROJECTS_LIST_COLUMNS.map((column) => (
                        <TableCell
                          key={column.id}
                          className={cn(
                            column.cellClassName,
                            projectsListStickyCellClass(column),
                          )}
                        >
                          {renderProjectsListCell(
                            column.id,
                            project,
                            todayYmd,
                            actionsCellCtx,
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground tabular-nums md:w-full">
              {paginationSummaryText}
              <span className="sr-only">
                {paginationSrOnlyText}
              </span>
            </p>

            {totalPages > 1 ? (
              <Pagination className="mx-0 w-full justify-end">
                <PaginationContent className="w-full flex-wrap justify-end gap-1">
                  <PaginationItem>
                    <PaginationPrevious
                      type="button"
                      disabled={activePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    />
                  </PaginationItem>

                  {paginationItems.map((item, idx) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`e-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          type="button"
                          isActive={item === activePage}
                          onClick={() => setPage(item)}
                          aria-label={formatTemplate(PROJECTS_PAGE.paginationPageAria, {
                            page: item,
                          })}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}

                  <PaginationItem>
                    <PaginationNext
                      type="button"
                      disabled={activePage >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
