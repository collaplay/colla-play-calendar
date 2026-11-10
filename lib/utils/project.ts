import type { Project } from "@/lib/types/project";
import { SELF_SERVE_SPACE_IDS } from "@/lib/config/config";
import {
  effectiveEndDate,
  expandRentalDateKeys,
} from "@/lib/utils/project-rental-interval";

/**
 * 官網報價頁送出、尚未經人工確認的專案，是否要在某場域的行事曆／場域列表上隱藏。
 * 規則：referenceNumber 有值（＝來自報價頁，後台手動建立的專案不會有）
 * 且狀態仍是洽談中；播映室／錄音室（SELF_SERVE_SPACE_IDS）不受此限，送出後直接算數。
 * 後台自己手動建立的「洽談中」專案一律照常顯示，不受這條規則影響。
 */
export function isPendingWebInquiryForSpace(
  project: Pick<Project, "referenceNumber" | "status">,
  spaceId: string,
): boolean {
  if (SELF_SERVE_SPACE_IDS.includes(spaceId)) return false;
  return project.referenceNumber != null && project.status === "negotiating";
}

/**
 * 取得專案涉及的日期摘要（以 rentals 展開的曆日去重）。
 * - 不超過 maxShown：列出所有日期（短格式）
 * - 超過：顯示前 maxShown 個 +「等N日」
 */
export function getProjectDateKeySummary(
  project: Project,
  options: { maxShown?: number; formatDate?: (d: Date) => string } = {},
): string | null {
  const rentals = project.rentals;
  const fmt =
    options.formatDate ??
    new Intl.DateTimeFormat("zh-TW", { dateStyle: "short" }).format;
  const maxShown = options.maxShown ?? 2;

  if (!rentals?.length) {
    if (!project.date) return null;
    const d = new Date(`${project.date.slice(0, 10)}T12:00:00`);
    if (!Number.isFinite(d.getTime())) return null;
    return fmt(d);
  }

  const dateKeys = [
    ...new Set(
      rentals.flatMap((r) =>
        expandRentalDateKeys({ date: r.date, endDate: r.endDate }).map((x) =>
          x.slice(0, 10),
        ),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));

  if (dateKeys.length === 0) return null;

  const shown = dateKeys.slice(0, Math.max(1, maxShown)).map((dk) => {
    const d = new Date(`${dk}T12:00:00`);
    return fmt(d);
  });

  if (dateKeys.length <= shown.length) return shown.join("、");
  return `${shown.join("、")} 等${dateKeys.length}日`;
}

function rentalTimeSegmentForDateKey(
  rental: NonNullable<Project["rentals"]>[number],
  dateKey: string,
): string | null {
  if (!rental.startTime || !rental.endTime) return null;
  const dk = dateKey.slice(0, 10);
  const d0 = rental.date.slice(0, 10);
  const eff = effectiveEndDate(rental.date, rental.endDate);

  if (eff === d0) return `${rental.startTime} – ${rental.endTime}`;
  if (dk === d0) return `${rental.startTime} – …`;
  if (dk === eff) return `… – ${rental.endTime}`;
  return "全日";
}

/**
 * 取得專案在指定日期的所有時段字串（同日多段會完整顯示）。
 * @param spaceId 有傳時僅合併該空間（rental.spaceIds 含此 id）的時段；未傳則含當日所有 rental。
 */
export function getProjectTimeRangesForDateKey(
  project: Project,
  dateKey: string,
  spaceId?: string,
): string | null {
  const rentals = project.rentals;
  if (!rentals?.length) return null;
  const key = dateKey.slice(0, 10);

  const parts: string[] = [];
  for (const r of rentals) {
    const covers = expandRentalDateKeys({ date: r.date, endDate: r.endDate })
      .map((x) => x.slice(0, 10))
      .includes(key);
    if (!covers) continue;
    if (spaceId != null && spaceId !== "") {
      if (!r.spaceIds?.includes(spaceId)) continue;
    }
    const seg = rentalTimeSegmentForDateKey(r, key);
    if (seg) parts.push(seg);
  }

  if (parts.length === 0) return null;
  const unique = [...new Set(parts)];
  return unique.join("、");
}

/**
 * 租借列：日期欄（含跨日區間）
 */
export function formatRentalDateRangeForTable(
  r: { date: string; endDate?: string | null },
  formatDate: (d: Date) => string,
): string {
  const eff = effectiveEndDate(r.date, r.endDate);
  const d0 = r.date.slice(0, 10);
  const a = formatDate(new Date(`${d0}T00:00:00`));
  if (eff === d0) return a;
  return `${a} – ${formatDate(new Date(`${eff}T00:00:00`))}`;
}

/**
 * 取得專案在指定日期（或首筆 rental）的時段字串。
 * @param dateKey 有傳時找涵蓋該曆日之 rental，跨日時依是否為起迄日顯示片段或「全日」
 */
export function getProjectTimeRange(
  project: Project,
  dateKey?: string,
): string | null {
  const rentals = project.rentals;
  if (!rentals?.length) return null;

  const pick = (() => {
    if (!dateKey) return rentals[0];
    const key = dateKey.slice(0, 10);
    return (
      rentals.find((x) =>
        expandRentalDateKeys({ date: x.date, endDate: x.endDate }).includes(
          key,
        ),
      ) ?? null
    );
  })();

  if (!pick?.startTime || !pick?.endTime) return null;

  const d0 = pick.date.slice(0, 10);
  const eff = effectiveEndDate(pick.date, pick.endDate);

  if (!dateKey) {
    if (eff === d0) return `${pick.startTime} – ${pick.endTime}`;
    return `${d0} ${pick.startTime} → ${eff} ${pick.endTime}`;
  }

  const dk = dateKey.slice(0, 10);
  if (eff === d0) return `${pick.startTime} – ${pick.endTime}`;
  if (dk === d0) return `${pick.startTime} – …`;
  if (dk === eff) return `… – ${pick.endTime}`;
  return "全日";
}
