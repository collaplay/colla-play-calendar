/**
 * 專案列表 CSV 匯出（依日期區間篩選）
 *
 * 僅負責篩選、字串與檔名；Blob 下載由 client 處理。
 */

import { format, startOfDay } from "date-fns";
import { zhTW } from "date-fns/locale";

import { PROJECTS_LIST_COLUMNS } from "@/lib/config/projects-list-table";
import type { ProjectsListColumnId } from "@/lib/config/projects-list-table";
import { getStatusLabel, normalizeProjectStatusForUi } from "@/lib/config/project-status";
import {
  getEffectiveProjectStatus,
  getTaipeiTodayYmd,
} from "@/lib/utils/project-effective-status";
import { CREATE_PROJECT_PAGE, FNB_AMOUNT_PENDING_LABEL } from "@/lib/message";
import type { Project } from "@/lib/types/project";
import { getProjectDateKeySummary } from "@/lib/utils/project";
import { formatEquipmentNeedsLine } from "@/lib/utils/project-equipment-needs";
import { expandRentalDateKeys } from "@/lib/utils/project-rental-interval";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "short",
});

const CURRENCY_FORMATTER_INTEGER = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const EQUIPMENT_NEEDS_LINE_LABELS = {
  microphone: CREATE_PROJECT_PAGE.labelEquipmentMicrophone,
  extensionCord: CREATE_PROJECT_PAGE.labelEquipmentExtensionCord,
  projector: CREATE_PROJECT_PAGE.labelEquipmentProjector,
  whiteboard: CREATE_PROJECT_PAGE.labelEquipmentWhiteboard,
  noOtherEquipmentNeeds: CREATE_PROJECT_PAGE.labelEquipmentNoOtherNeeds,
} as const;

function escapeCsvCell(value: string): string {
  const s = String(value);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 本地曆日 YYYY-MM-DD */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKeyInRange(
  key: string,
  startKey: string,
  endKey: string,
): boolean {
  return key >= startKey && key <= endKey;
}

/**
 * 專案在區間內至少有一天檔期（或無 rentals 時主日期落在區間內）則保留。
 */
export function filterProjectsForDateRange(
  projects: Project[],
  range: { from: Date; to: Date },
): Project[] {
  const startKey = toDateKey(startOfDay(range.from));
  const endKey = toDateKey(startOfDay(range.to));

  return projects.filter((project) => {
    const rentals = project.rentals;
    if (rentals?.length) {
      for (const r of rentals) {
        for (const k of expandRentalDateKeys({
          date: r.date,
          endDate: r.endDate,
        })) {
          if (dateKeyInRange(k, startKey, endKey)) return true;
        }
      }
      return false;
    }
    const d = project.date?.slice(0, 10);
    if (!d) return false;
    return dateKeyInRange(d, startKey, endKey);
  });
}

function formatProjectCellPlain(
  columnId: ProjectsListColumnId,
  project: Project,
  todayYmd: string,
): string {
  const eff = getEffectiveProjectStatus(project, todayYmd);
  const statusForUi = normalizeProjectStatusForUi(eff);

  switch (columnId) {
    case "referenceNumber":
      return project.referenceNumber ?? "—";
    case "eventType":
      return project.eventType?.trim() ? project.eventType : "—";
    case "eventOrVenueUse":
      return project.eventOrVenueUse ?? "";
    case "customer":
      return project.customer ?? "";
    case "space":
      return project.space ?? "";
    case "date":
      return (
        getProjectDateKeySummary(project, {
          maxShown: 2,
          formatDate: (d) => DATE_FORMATTER.format(d),
        }) ?? "—"
      );
    case "eventStartTime":
      return project.rentals?.[0]?.startTime ?? "—";
    case "eventEndTime":
      return project.rentals?.[0]?.endTime ?? "—";
    case "contactPerson":
      return project.contactPerson ?? "";
    case "amount":
      return CURRENCY_FORMATTER_INTEGER.format(project.amount);
    case "status":
      return statusForUi ? getStatusLabel(eff) : "";
    case "totalAttendees":
      return project.totalAttendees != null ? project.totalAttendees : "—";
    case "tables":
      return project.tables ?? "—";
    case "chairs":
      return project.chairs != null ? project.chairs : "—";
    case "otherEquipment":
      return (
        formatEquipmentNeedsLine(
          project.equipmentNeeds,
          EQUIPMENT_NEEDS_LINE_LABELS,
        ) ?? "—"
      );
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
      return project.fnbItems ?? "—";
    case "internalNotes":
      return project.internalNotes ?? "—";
    case "needsPrintedNotice":
      return project.needsPrintedNotice ? "是" : "否";
    case "actions":
    case "confirm":
      return "";
    default: {
      const _exhaustive: never = columnId;
      return _exhaustive;
    }
  }
}

const LIST_COLUMN_IDS = PROJECTS_LIST_COLUMNS.filter(
  (c) => c.id !== "actions" && c.id !== "confirm",
) as Exclude<
  typeof PROJECTS_LIST_COLUMNS[number],
  { id: "actions" | "confirm" }
>[];

/**
 * 產生與列表欄位一致（不含操作欄）的 CSV 字串，含 UTF-8 BOM。
 */
export function buildProjectsListCsv(projects: Project[]): string {
  const todayYmd = getTaipeiTodayYmd();
  const header = LIST_COLUMN_IDS.map((c) => escapeCsvCell(c.label)).join(",");
  const rows: string[] = [header];

  for (const p of projects) {
    const line = LIST_COLUMN_IDS.map((c) =>
      escapeCsvCell(formatProjectCellPlain(c.id, p, todayYmd)),
    ).join(",");
    rows.push(line);
  }

  const csvContent = rows.join("\r\n");
  return "\uFEFF" + csvContent;
}

/**
 * 檔名：專案列表-yyyyMMdd-yyyyMMdd.csv
 */
export function getProjectsListCsvFilename(range: {
  from: Date;
  to: Date;
}): string {
  const a = format(range.from, "yyyyMMdd", { locale: zhTW });
  const b = format(range.to, "yyyyMMdd", { locale: zhTW });
  return `專案列表-${a}-${b}.csv`;
}
