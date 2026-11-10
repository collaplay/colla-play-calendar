/**
 * 專案服務 (Project Service)
 *
 * 提供專案建立等業務邏輯，與 create-new-project 表單／API 對接
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";
import { getSpaceNameById } from "@/lib/config/config";
import { getAdminContactOptions } from "@/lib/services/admin-contact.service";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  UpdateRentalInput,
  ProjectWithRentals,
  Project,
  ProjectStatus,
  OverviewStatsData,
} from "@/lib/types/project";
import { computeProjectRentalPendingAmount } from "@/lib/utils/project-rental-pending";
import {
  normalizeEquipmentNeedsForDb,
  parseEquipmentNeedsFromDb,
} from "@/lib/utils/project-equipment-needs";
import { CREATE_PROJECT_PAGE } from "@/lib/message";
import {
  intervalsOverlap,
  isValidRentalTimeWindow,
  rentalBoundsMs,
  spaceIdsIntersect,
} from "@/lib/utils/project-rental-interval";
import {
  addDaysToTaipeiYmd,
  getEffectiveProjectStatus,
  getTaipeiTodayYmd,
} from "@/lib/utils/project-effective-status";
import { isPendingWebInquiryForSpace } from "@/lib/utils/project";

const PROJECT_DETAIL_CACHE_TTL_SECONDS = 60;

export function projectDetailTag(projectId: string): string {
  return `admin:project:${projectId}`;
}

/** 與其他專案租借時段衝突（API 可回 409） */
export class ProjectRentalConflictError extends Error {
  override readonly name = "ProjectRentalConflictError";
  constructor(message: string) {
    super(message);
  }
}

/** 寫入 DB：與開始日相同或未填則 null */
function normalizeEndDateForDb(
  date: string,
  endDate: string | null | undefined,
): string | null {
  const d = date.slice(0, 10);
  const e = (endDate ?? "").trim().slice(0, 10);
  if (!e || e === d) return null;
  return e;
}

/** 待定時餐飲金額固定為 0，與列表加總／統計一致 */
function rentalFnbFieldsForDb(r: {
  fnbAmount: number;
  fnbAmountPending?: boolean;
}): { fnbAmount: number; fnbAmountPending: boolean } {
  const pending = r.fnbAmountPending ?? false;
  return {
    fnbAmountPending: pending,
    fnbAmount: pending ? 0 : Math.max(0, Math.round(r.fnbAmount)),
  };
}

type RentalWindowInput = {
  spaceIds: string[];
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
};

export type ExternalRentalConflict = {
  projectId: string;
  eventOrVenueUse: string;
  rental: {
    id: string;
    spaceIds: string[];
    date: string;
    endDate: string | null;
    startTime: string;
    endTime: string;
  };
};

function assertRentalWindowsValid(rentals: RentalWindowInput[]) {
  for (const r of rentals) {
    if (
      !isValidRentalTimeWindow({
        date: r.date,
        endDate: r.endDate,
        startTime: r.startTime,
        endTime: r.endTime,
      })
    ) {
      throw new Error(CREATE_PROJECT_PAGE.errorInvalidRentalWindow);
    }
  }
}

function assertNoInternalRentalOverlaps(rentals: RentalWindowInput[]) {
  for (let i = 0; i < rentals.length; i++) {
    const a = rentals[i];
    const boundsA = rentalBoundsMs({
      date: a.date,
      endDate: a.endDate,
      startTime: a.startTime,
      endTime: a.endTime,
    });
    if (!boundsA) continue;
    for (let j = i + 1; j < rentals.length; j++) {
      const b = rentals[j];
      if (!spaceIdsIntersect(a.spaceIds, b.spaceIds)) continue;
      const boundsB = rentalBoundsMs({
        date: b.date,
        endDate: b.endDate,
        startTime: b.startTime,
        endTime: b.endTime,
      });
      if (!boundsB) continue;
      if (intervalsOverlap(boundsA, boundsB)) {
        throw new ProjectRentalConflictError(
          CREATE_PROJECT_PAGE.errorRentalOverlapInternal,
        );
      }
    }
  }
}

async function findExternalRentalConflicts(
  db: { projectRental: typeof prisma.projectRental },
  rentals: RentalWindowInput[],
  options: { excludeProjectId?: string; excludeRentalId?: string },
): Promise<ExternalRentalConflict[][]> {
  const conflictsByRental: ExternalRentalConflict[][] = [];
  for (const r of rentals) {
    const bounds = rentalBoundsMs({
      date: r.date,
      endDate: r.endDate,
      startTime: r.startTime,
      endTime: r.endTime,
    });
    if (!bounds) {
      throw new Error(CREATE_PROJECT_PAGE.errorInvalidRentalWindow);
    }

    const rows = await db.projectRental.findMany({
      where: {
        ...(options.excludeRentalId
          ? { id: { not: options.excludeRentalId } }
          : {}),
        spaceIds: { hasSome: r.spaceIds },
        project: {
          status: { not: "cancelled" },
          ...(options.excludeProjectId
            ? { id: { not: options.excludeProjectId } }
            : {}),
        },
      },
      include: {
        project: { select: { eventOrVenueUse: true } },
      },
    });

    const conflicts: ExternalRentalConflict[] = [];
    for (const row of rows) {
      if (!spaceIdsIntersect(r.spaceIds, row.spaceIds)) continue;
      const rowBounds = rentalBoundsMs({
        date: row.date,
        endDate: row.endDate,
        startTime: row.startTime,
        endTime: row.endTime,
      });
      if (!rowBounds) continue;
      if (intervalsOverlap(bounds, rowBounds)) {
        conflicts.push({
          projectId: row.projectId,
          eventOrVenueUse: row.project.eventOrVenueUse,
          rental: {
            id: row.id,
            spaceIds: row.spaceIds,
            date: row.date,
            endDate: row.endDate,
            startTime: row.startTime,
            endTime: row.endTime,
          },
        });
      }
    }
    conflictsByRental.push(conflicts);
  }
  return conflictsByRental;
}

async function assertNoExternalRentalConflicts(
  db: { projectRental: typeof prisma.projectRental },
  rentals: RentalWindowInput[],
  options: { excludeProjectId?: string; excludeRentalId?: string },
) {
  const conflictsByRental = await findExternalRentalConflicts(
    db,
    rentals,
    options,
  );
  for (const conflicts of conflictsByRental) {
    const conflict = conflicts[0];
    if (!conflict) continue;
    throw new ProjectRentalConflictError(
      `與既有專案「${conflict.eventOrVenueUse}」在相同空間時段重疊，請調整。`,
    );
  }
}

export async function getExternalRentalConflicts(
  rentals: RentalWindowInput[],
  options: { excludeProjectId?: string; excludeRentalId?: string } = {},
): Promise<ExternalRentalConflict[][]> {
  assertRentalWindowsValid(rentals);
  return findExternalRentalConflicts(prisma, rentals, options);
}

function equipmentNeedsToPrismaInput(
  normalized: Record<string, boolean> | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (normalized === null) return Prisma.DbNull;
  return normalized as Prisma.InputJsonValue;
}

function mapRowToProject(
  row: {
    id: string;
    referenceNumber: string | null;
    customerName: string;
    eventOrVenueUse: string;
    eventType: string;
    collaPlayContactId: string;
    status: string;
    tables: string | null;
    chairs: string | null;
    fnbItems: string | null;
    totalAttendees: string | null;
    projectNotes: string | null;
    internalNotes: string | null;
    needsPrintedNotice: boolean;
    equipmentNeeds: unknown;
    createdAt: Date;
    rentals: Array<{
      spaceIds: string[];
      date: string;
      endDate: string | null;
      startTime: string;
      endTime: string;
      setupMinutesBefore: number;
      teardownMinutesAfter: number;
      rentalAmount: number;
      fnbAmount: number;
      fnbAmountPending: boolean;
      paidAmount: number;
      pendingAmount: number;
    }>;
  },
  adminNameById: Map<string, string>,
): Project {
  const rentalSpaceIds = row.rentals.flatMap((r) => r.spaceIds);
  const uniqueSpaceIds = [...new Set(rentalSpaceIds)];
  const space = uniqueSpaceIds.map((id) => getSpaceNameById(id)).join("／");

  const date =
    row.rentals.length > 0
      ? [...row.rentals]
          .map((r) => r.date.slice(0, 10))
          .sort((a, b) => a.localeCompare(b))[0] ?? ""
      : "";
  const amount = row.rentals.reduce(
    (sum, r) => sum + r.rentalAmount + r.fnbAmount,
    0,
  );
  const rentalAmountTotal = row.rentals.reduce(
    (sum, r) => sum + r.rentalAmount,
    0,
  );
  const fnbAmountTotal = row.rentals.reduce((sum, r) => sum + r.fnbAmount, 0);
  const hasFnbAmountPending = row.rentals.some((r) => r.fnbAmountPending);
  const paidAmountTotal = row.rentals.reduce((sum, r) => sum + r.paidAmount, 0);
  const pendingAmountTotal = row.rentals.reduce(
    (sum, r) => sum + r.pendingAmount,
    0,
  );
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    customer: row.customerName,
    eventOrVenueUse: row.eventOrVenueUse,
    eventType: row.eventType,
    space,
    date,
    createdAt: row.createdAt.toISOString(),
    contactPerson:
      adminNameById.get(row.collaPlayContactId) ?? row.collaPlayContactId,
    amount,
    rentalAmountTotal,
    fnbAmountTotal,
    hasFnbAmountPending,
    paidAmountTotal,
    pendingAmountTotal,
    status: row.status as Project["status"],
    tables: row.tables ?? null,
    chairs: row.chairs ?? null,
    fnbItems: row.fnbItems ?? null,
    totalAttendees: row.totalAttendees ?? null,
    projectNotes: row.projectNotes ?? null,
    internalNotes: row.internalNotes ?? null,
    needsPrintedNotice: row.needsPrintedNotice,
    equipmentNeeds:
      row.equipmentNeeds == null
        ? null
        : parseEquipmentNeedsFromDb(row.equipmentNeeds),
    rentals: row.rentals.map((r) => ({
      date: r.date,
      endDate: r.endDate ?? undefined,
      spaceIds: r.spaceIds,
      startTime: r.startTime,
      endTime: r.endTime,
      setupMinutesBefore: r.setupMinutesBefore,
      teardownMinutesAfter: r.teardownMinutesAfter,
    })),
  };
}

/** 管理後台專案列表 unstable_cache 標籤；變更專案資料後須 revalidateTag */
export const ADMIN_PROJECTS_LIST_CACHE_TAG = "admin-projects-list";
/** 所有「依日期窗」列表的快取 tag（寫入後統一失效） */
export const ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG = "admin-projects-any-window";

type ProjectsWindowQuery = {
  fromYmd: string;
  toYmd: string;
  spaceId?: string;
};

function assertYmd(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} 格式錯誤`);
  }
}

function buildProjectsWindowWhere(params: ProjectsWindowQuery): Prisma.ProjectWhereInput {
  const { fromYmd, toYmd, spaceId } = params;
  assertYmd(fromYmd, "from");
  assertYmd(toYmd, "to");

  return {
    rentals: {
      some: {
        ...(spaceId ? { spaceIds: { has: spaceId } } : {}),
        date: { lte: toYmd },
        OR: [
          { endDate: { gte: fromYmd } },
          { endDate: null, date: { gte: fromYmd } },
        ],
      },
    },
  };
}

async function fetchProjectsForWindowUncached(
  params: ProjectsWindowQuery,
): Promise<Project[]> {
  const where = buildProjectsWindowWhere(params);
  const [rows, adminOptions] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { rentals: true },
      orderBy: { createdAt: "desc" },
    }),
    getAdminContactOptions(),
  ]);
  const adminNameById = new Map(adminOptions.map((o) => [o.id, o.name]));
  return rows.map((row) => mapRowToProject(row, adminNameById));
}

/**
 * 依日期窗取得專案列表（僅撈出在 window 內有檔期的專案，供 dashboard 增量載入）
 *
 * - window 相交：rental.date <= to && (rental.endDate ?? rental.date) >= from
 * - 可選 spaceId：只回傳該 spaceId 有檔期的專案
 *
 * 以 unstable_cache 跨 request 快取；寫入後請 revalidateTag(ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG, 'max')。
 */
export async function getProjectsForWindow(
  params: ProjectsWindowQuery,
): Promise<Project[]> {
  const key = [
    "get-projects-window",
    params.fromYmd,
    params.toYmd,
    params.spaceId ?? "all",
  ];
  return unstable_cache(
    async () => fetchProjectsForWindowUncached(params),
    key,
    {
      tags: [ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG],
      revalidate: 300,
    },
  )();
}

async function fetchProjectsForListUncached(): Promise<Project[]> {
  const [rows, adminOptions] = await Promise.all([
    prisma.project.findMany({
      include: { rentals: true },
      orderBy: { createdAt: "desc" },
    }),
    getAdminContactOptions(),
  ]);
  const adminNameById = new Map(adminOptions.map((o) => [o.id, o.name]));
  return rows.map((row) => mapRowToProject(row, adminNameById));
}

const getProjectsForListCached = unstable_cache(
  fetchProjectsForListUncached,
  ["get-projects-for-list"],
  {
    tags: [ADMIN_PROJECTS_LIST_CACHE_TAG],
    revalidate: 300,
  },
);

/**
 * 取得專案列表（供 dashboard 列表頁使用）
 *
 * 查詢 Project 含 rentals，依 createdAt 降序，並 map 成列表用 Project 型別。
 * 以 unstable_cache 跨請求快取，寫入後請 revalidateTag(ADMIN_PROJECTS_LIST_CACHE_TAG)。
 *
 * @returns Promise<Project[]>
 */
export async function getProjectsForList(): Promise<Project[]> {
  return getProjectsForListCached();
}

/**
 * 取得最近 createdWithinDays 天內新增的專案（供總覽頁使用，以 React.cache 去重）
 */
export const getRecentProjects = cache(
  async (createdWithinDays: number): Promise<Project[]> => {
    const todayYmd = getTaipeiTodayYmd();
    const createdSinceYmd = addDaysToTaipeiYmd(todayYmd, -createdWithinDays);
    const [rows, adminOptions] = await Promise.all([
      prisma.project.findMany({
        where: {
          AND: [
            { rentals: { none: { spaceIds: { has: "4f-podcast-studio" } } } },
            {
              rentals: {
                some: {
                  OR: [
                    { endDate: { gte: todayYmd } },
                    { endDate: null, date: { gte: todayYmd } },
                  ],
                },
              },
            },
          ],
          createdAt: { gte: new Date(`${createdSinceYmd}T00:00:00+08:00`) },
        },
        orderBy: { createdAt: "desc" },
        include: { rentals: true },
      }),
      getAdminContactOptions(),
    ]);
    const adminNameById = new Map(adminOptions.map((o) => [o.id, o.name]));
    return rows.map((row) => mapRowToProject(row, adminNameById));
  },
);

/**
 * 取得最近 createdWithinDays 天內新增、且活動日期落在未來 windowDays 天內的專案
 * （供總覽頁使用，以 React.cache 去重）
 */
export const getRecentUpcomingProjects = cache(
  async (windowDays: number, createdWithinDays: number): Promise<Project[]> => {
    const fromYmd = getTaipeiTodayYmd();
    const toYmd = addDaysToTaipeiYmd(fromYmd, windowDays);
    const createdSinceYmd = addDaysToTaipeiYmd(fromYmd, -createdWithinDays);
    const [rows, adminOptions] = await Promise.all([
      prisma.project.findMany({
        where: {
          AND: [
            buildProjectsWindowWhere({ fromYmd, toYmd }),
            { rentals: { none: { spaceIds: { has: "4f-podcast-studio" } } } },
            { createdAt: { gte: new Date(`${createdSinceYmd}T00:00:00+08:00`) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: { rentals: true },
      }),
      getAdminContactOptions(),
    ]);
    const adminNameById = new Map(adminOptions.map((o) => [o.id, o.name]));
    return rows.map((row) => mapRowToProject(row, adminNameById));
  },
);

/**
 * 取得總覽統計（當月場租、洽談中/已確認筆數、今日預定數，以 React.cache 去重）
 */
export const getOverviewStats = cache(async (): Promise<OverviewStatsData> => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const start = `${y}-${m}-01`;
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  const todayYmd = getTaipeiTodayYmd(now);

  const [monthlySum, projectsForEffectiveStats, todayReservations] =
    await Promise.all([
      prisma.projectRental
        .aggregate({
          where: {
            date: { gte: start, lte: end },
            project: { status: { in: ["confirmed", "deposit_paid"] } },
          },
          _sum: { rentalAmount: true, fnbAmount: true },
        })
        .then((r) => (r._sum.rentalAmount ?? 0) + (r._sum.fnbAmount ?? 0)),
      prisma.project.findMany({
        where: {
          status: { notIn: ["cancelled", "completed"] },
        },
        select: {
          status: true,
          rentals: { select: { date: true, endDate: true } },
        },
      }),
      prisma.projectRental.count({ where: { date: todayYmd } }),
    ]);

  let negotiatingCount = 0;
  let confirmedCount = 0;
  for (const row of projectsForEffectiveStats) {
    const eff = getEffectiveProjectStatus(
      {
        status: row.status as ProjectStatus,
        rentals: row.rentals.map((r) => ({
          date: r.date,
          endDate: r.endDate,
        })),
      },
      todayYmd,
    );
    if (eff === "completed") continue;
    if (eff === "negotiating") negotiatingCount++;
    else if (eff === "confirmed" || eff === "deposit_paid") confirmedCount++;
  }

  return {
    monthlyRentalIncome: monthlySum,
    negotiatingCount,
    confirmedCount,
    todayReservations,
  };
});

/**
 * 取得單一專案（含 rentals），以 React.cache 做 per-request 去重
 */
async function getProjectByIdImpl(
  id: string,
): Promise<ProjectWithRentals | null> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { rentals: true },
  });
  return project as ProjectWithRentals | null;
}

export const getProjectById = cache(getProjectByIdImpl);

/**
 * 取得單一專案（含 rentals）：跨 request 短暫快取 + per-project tag
 *
 * 注意：此快取用於「頁面讀取」的加速；更新後請用 revalidateTag(projectDetailTag(id), 'max') 立即失效。
 */
export async function getCachedProjectById(
  id: string,
): Promise<ProjectWithRentals | null> {
  return unstable_cache(
    async () => {
      const project = await prisma.project.findUnique({
        where: { id },
        select: {
          id: true,
          referenceNumber: true,
          customerName: true,
          customerPhone: true,
          company: true,
          taxId: true,
          eventOrVenueUse: true,
          eventType: true,
          totalAttendees: true,
          tables: true,
          chairs: true,
          fnbItems: true,
          projectNotes: true,
          collaPlayContactId: true,
          internalNotes: true,
          needsPrintedNotice: true,
          equipmentNeeds: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          rentals: {
            select: {
              id: true,
              projectId: true,
              date: true,
              endDate: true,
              startTime: true,
              endTime: true,
              setupMinutesBefore: true,
              teardownMinutesAfter: true,
              rentalAmount: true,
              fnbAmount: true,
              fnbAmountPending: true,
              paidAmount: true,
              pendingAmount: true,
              spaceIds: true,
            },
          },
        },
      });
      return project as ProjectWithRentals | null;
    },
    ["admin-project-by-id", id],
    {
      revalidate: PROJECT_DETAIL_CACHE_TTL_SECONDS,
      tags: [projectDetailTag(id)],
    },
  )();
}

/**
 * 取得某場域下的專案列表（project_rental.spaceIds 包含該場域 id 的專案）
 * 使用 React.cache 做 per-request 去重
 */
async function getProjectsBySpaceIdImpl(spaceId: string): Promise<Project[]> {
  const rentals = await prisma.projectRental.findMany({
    where: { spaceIds: { has: spaceId } },
    select: { projectId: true },
  });
  const projectIds = [...new Set(rentals.map((r) => r.projectId))];
  if (projectIds.length === 0) return [];
  const [rows, adminOptions] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: { rentals: true },
      orderBy: { createdAt: "desc" },
    }),
    getAdminContactOptions(),
  ]);
  const adminNameById = new Map(adminOptions.map((o) => [o.id, o.name]));
  return rows
    .filter((row) => !isPendingWebInquiryForSpace(row, spaceId))
    .map((row) => mapRowToProject(row, adminNameById));
}

export const getProjectsBySpaceId = cache(getProjectsBySpaceIdImpl);

/**
 * 更新專案（主檔 + 租借項目）
 * 策略：主檔 update；rentals 先刪除該專案下全部再依 input.rentals 建立（簡化實作）
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectWithRentals> {
  if (!input.rentals?.length) {
    throw new Error("至少需一筆租借項目");
  }
  for (const r of input.rentals) {
    if (!r.spaceIds?.length) {
      throw new Error("每筆租借項目至少需選擇一個場域");
    }
  }
  assertRentalWindowsValid(input.rentals);
  assertNoInternalRentalOverlaps(input.rentals);
  await assertNoExternalRentalConflicts(prisma, input.rentals, {
    excludeProjectId: id,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectRental.deleteMany({ where: { projectId: id } });
    await tx.project.update({
      where: { id },
      data: {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        company: input.company ?? null,
        taxId: input.taxId ?? null,
        eventOrVenueUse: input.eventOrVenueUse,
        ...(input.eventType !== undefined && {
          eventType: input.eventType.trim() || "其他",
        }),
        totalAttendees: input.totalAttendees ?? null,
        tables: input.tables ?? null,
        chairs: input.chairs ?? null,
        fnbItems: input.fnbItems ?? null,
        projectNotes: input.projectNotes ?? null,
        collaPlayContactId: input.collaPlayContactId,
        internalNotes: input.internalNotes ?? null,
        ...(input.needsPrintedNotice !== undefined && {
          needsPrintedNotice: input.needsPrintedNotice,
        }),
        ...(input.status != null && { status: input.status }),
        ...(input.equipmentNeeds !== undefined && {
          equipmentNeeds: equipmentNeedsToPrismaInput(
            normalizeEquipmentNeedsForDb(input.equipmentNeeds),
          ),
        }),
      },
    });
    for (const r of input.rentals) {
      const fnbFields = rentalFnbFieldsForDb(r);
      await tx.projectRental.create({
        data: {
          projectId: id,
          date: r.date,
          endDate: normalizeEndDateForDb(r.date, r.endDate),
          startTime: r.startTime,
          endTime: r.endTime,
          setupMinutesBefore: r.setupMinutesBefore ?? 30,
          teardownMinutesAfter: r.teardownMinutesAfter ?? 30,
          rentalAmount: Math.max(0, Math.round(r.rentalAmount)),
          ...fnbFields,
          paidAmount: Math.max(0, Math.round(r.paidAmount)),
          pendingAmount: computeProjectRentalPendingAmount({
            rentalAmount: r.rentalAmount,
            fnbAmount: fnbFields.fnbAmount,
            paidAmount: r.paidAmount,
            fnbAmountPending: fnbFields.fnbAmountPending,
          }),
          spaceIds: r.spaceIds,
        },
      });
    }
    return tx.project.findUniqueOrThrow({
      where: { id },
      include: { rentals: true },
    });
  });
  return updated as ProjectWithRentals;
}

/**
 * 刪除專案（rentals 依 schema onDelete: Cascade 一併刪除）
 */
export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } });
}

/**
 * 單筆刪除租借項目；專案至少需保留一筆租借。
 * @returns projectId 供 revalidate 使用
 */
export async function deleteProjectRental(
  rentalId: string,
): Promise<{ projectId: string }> {
  const rental = await prisma.projectRental.findUnique({
    where: { id: rentalId },
    select: { projectId: true },
  });
  if (!rental) {
    throw new Error("找不到此筆租借");
  }
  const count = await prisma.projectRental.count({
    where: { projectId: rental.projectId },
  });
  if (count <= 1) {
    throw new Error("至少需一筆租借項目");
  }
  await prisma.projectRental.delete({ where: { id: rentalId } });
  return { projectId: rental.projectId };
}

/**
 * 單筆更新租借項目
 */
export async function updateProjectRental(
  rentalId: string,
  input: UpdateRentalInput,
): Promise<ProjectWithRentals["rentals"][0] & { projectId: string }> {
  if (!input.spaceIds?.length) {
    throw new Error("每筆租借項目至少需選擇一個場域");
  }
  assertRentalWindowsValid([input]);
  await assertNoExternalRentalConflicts(prisma, [input], {
    excludeRentalId: rentalId,
  });

  const fnbFields = rentalFnbFieldsForDb(input);
  const updated = await prisma.projectRental.update({
    where: { id: rentalId },
    data: {
      date: input.date,
      endDate: normalizeEndDateForDb(input.date, input.endDate),
      startTime: input.startTime,
      endTime: input.endTime,
      setupMinutesBefore: input.setupMinutesBefore ?? 30,
      teardownMinutesAfter: input.teardownMinutesAfter ?? 30,
      rentalAmount: Math.max(0, Math.round(input.rentalAmount)),
      ...fnbFields,
      paidAmount: Math.max(0, Math.round(input.paidAmount)),
      pendingAmount: computeProjectRentalPendingAmount({
        rentalAmount: input.rentalAmount,
        fnbAmount: fnbFields.fnbAmount,
        paidAmount: input.paidAmount,
        fnbAmountPending: fnbFields.fnbAmountPending,
      }),
      spaceIds: input.spaceIds,
    },
  });
  return updated as ProjectWithRentals["rentals"][0] & { projectId: string };
}

/**
 * 僅更新專案狀態（供詳情頁 header Select 使用）
 */
export async function updateProjectStatus(
  id: string,
  status: ProjectStatus,
): Promise<ProjectWithRentals> {
  const updated = await prisma.project.update({
    where: { id },
    data: { status },
    include: { rentals: true },
  });
  return updated as ProjectWithRentals;
}

/**
 * 建立專案（含多筆租借項目）
 *
 * 使用 transaction 先建立 Project，再建立所有 ProjectRental。
 * 日期／時間依表單格式存入（date: YYYY-MM-DD, startTime/endTime: HH:mm）。
 * 任一段租借已付款項（正規化後）大於 0 時，專案狀態為已確定（confirmed），否則為洽談中（negotiating）。
 *
 * @param input 表單 payload（CreateProjectInput）
 * @returns Promise<ProjectWithRentals>
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectWithRentals> {
  if (!input.rentals?.length) {
    throw new Error("至少需一筆租借項目");
  }

  for (const r of input.rentals) {
    if (!r.spaceIds?.length) {
      throw new Error("每筆租借項目至少需選擇一個場域");
    }
  }
  assertRentalWindowsValid(input.rentals);
  assertNoInternalRentalOverlaps(input.rentals);
  await assertNoExternalRentalConflicts(prisma, input.rentals, {});

  const hasPaidAmount = input.rentals.some(
    (r) => Math.max(0, Math.round(r.paidAmount)) > 0,
  );

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        company: input.company ?? null,
        taxId: input.taxId ?? null,
        eventOrVenueUse: input.eventOrVenueUse,
        eventType: input.eventType.trim() || "其他",
        totalAttendees: input.totalAttendees ?? null,
        tables: input.tables ?? null,
        chairs: input.chairs ?? null,
        fnbItems: input.fnbItems ?? null,
        projectNotes: input.projectNotes ?? null,
        collaPlayContactId: input.collaPlayContactId,
        internalNotes: input.internalNotes ?? null,
        needsPrintedNotice: input.needsPrintedNotice ?? false,
        referenceNumber: input.referenceNumber ?? null,
        equipmentNeeds: equipmentNeedsToPrismaInput(
          normalizeEquipmentNeedsForDb(input.equipmentNeeds),
        ),
        status: input.status ?? (hasPaidAmount ? "confirmed" : "negotiating"),
      },
    });

    for (const r of input.rentals) {
      const fnbFields = rentalFnbFieldsForDb(r);
      await tx.projectRental.create({
        data: {
          projectId: created.id,
          date: r.date,
          endDate: normalizeEndDateForDb(r.date, r.endDate),
          startTime: r.startTime,
          endTime: r.endTime,
          setupMinutesBefore: r.setupMinutesBefore ?? 30,
          teardownMinutesAfter: r.teardownMinutesAfter ?? 30,
          rentalAmount: Math.max(0, Math.round(r.rentalAmount)),
          ...fnbFields,
          paidAmount: Math.max(0, Math.round(r.paidAmount)),
          pendingAmount: computeProjectRentalPendingAmount({
            rentalAmount: r.rentalAmount,
            fnbAmount: fnbFields.fnbAmount,
            paidAmount: r.paidAmount,
            fnbAmountPending: fnbFields.fnbAmountPending,
          }),
          spaceIds: r.spaceIds,
        },
      });
    }

    return tx.project.findUniqueOrThrow({
      where: { id: created.id },
      include: { rentals: true },
    });
  });

  return project as ProjectWithRentals;
}
