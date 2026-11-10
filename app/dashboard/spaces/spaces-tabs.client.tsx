"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ALL_SPACES, SPACE_BORDER_COLORS } from "@/lib/config/config";
import { SPACES_PAGE } from "@/lib/message";
import type { Project } from "@/lib/types/project";
import { isPendingWebInquiryForSpace } from "@/lib/utils/project";
import { SpaceProjectsCalendar } from "./space-projects-calendar.client";
import { LayoutGrid } from "lucide-react";
import { addMonths, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import {
  getTaipeiEndOfMonthSpanYmd,
  getTaipeiMonthStartYmd,
} from "@/lib/utils/project-effective-status";

const FILTER_ALL = "all" as const;
const DEFAULT_FUTURE_MONTHS = 6;

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function filterProjectsBySpace(
  projects: Project[],
  spaceId: string | null,
): Project[] {
  if (spaceId == null || spaceId === FILTER_ALL) {
    // 全部場域合併檢視：任一場域仍待確認就先不顯示，避免看起來已經佔用場地
    return projects.filter(
      (p) =>
        !p.rentals?.some((r) =>
          r.spaceIds.some((sid) => isPendingWebInquiryForSpace(p, sid)),
        ),
    );
  }
  return projects.filter(
    (p) =>
      p.rentals?.some((r) => r.spaceIds.includes(spaceId)) &&
      !isPendingWebInquiryForSpace(p, spaceId),
  );
}

interface SpacesTabsProps {
  projects: Project[];
}

export function SpacesTabs({ projects }: SpacesTabsProps) {
  const [selectedFilter, setSelectedFilter] =
    React.useState<string>(FILTER_ALL);

  const [loadedProjectsById, setLoadedProjectsById] = React.useState<
    Map<string, Project>
  >(() => new Map(projects.map((p) => [p.id, p])));
  const loadedProjects = React.useMemo(
    () => Array.from(loadedProjectsById.values()),
    [loadedProjectsById],
  );

  /** 與 `/dashboard/spaces` server 初次窗一致：台北曆當月 1 日起 */
  const [loadedPastCursor, setLoadedPastCursor] = React.useState<Date>(() =>
    startOfMonth(new Date(`${getTaipeiMonthStartYmd()}T12:00:00`)),
  );
  /** 已涵蓋的最後一個曆月起點（初次為初次窗最後一月的 1 日） */
  const [loadedFutureCursor, setLoadedFutureCursor] = React.useState<Date>(() => {
    const endYmd = getTaipeiEndOfMonthSpanYmd(
      new Date(),
      DEFAULT_FUTURE_MONTHS,
    );
    const lastMonthStartYmd = `${endYmd.slice(0, 7)}-01`;
    return startOfMonth(new Date(`${lastMonthStartYmd}T12:00:00`));
  });
  const [windowLoading, setWindowLoading] = React.useState(false);
  const [windowLoadError, setWindowLoadError] = React.useState<string | null>(
    null,
  );

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

  const ensurePastLoadedMonth = React.useCallback(
    async (targetMonth: Date) => {
      const target = startOfMonth(targetMonth);
      if (target >= loadedPastCursor) return;
      setWindowLoadError(null);
      setWindowLoading(true);
      try {
        let cursor = startOfMonth(loadedPastCursor);
        while (cursor > target) {
          const nextMonth = addMonths(cursor, -1);
          const data = await fetchProjectsWindow({
            from: startOfMonth(nextMonth),
            to: endOfMonth(nextMonth),
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

  const ensureFutureLoadedMonth = React.useCallback(
    async (targetMonth: Date) => {
      const target = startOfMonth(targetMonth);
      if (target <= loadedFutureCursor) return;
      setWindowLoadError(null);
      setWindowLoading(true);
      try {
        let cursor = startOfMonth(loadedFutureCursor);
        while (cursor < target) {
          const nextMonth = addMonths(cursor, 1);
          const data = await fetchProjectsWindow({
            from: startOfMonth(nextMonth),
            to: endOfMonth(nextMonth),
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

  const filteredProjects = React.useMemo(
    () =>
      filterProjectsBySpace(
        loadedProjects,
        selectedFilter === FILTER_ALL ? null : selectedFilter,
      ),
    [loadedProjects, selectedFilter],
  );

  const isAllView = selectedFilter === FILTER_ALL;

  return (
    <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
      {windowLoadError ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {windowLoadError}
        </p>
      ) : null}
      {windowLoading ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          正在載入更多專案…
        </p>
      ) : null}
      <Tabs
        value={selectedFilter}
        onValueChange={setSelectedFilter}
        className="w-full flex-1 flex flex-col min-w-0"
      >
        <TabsList
          className="flex flex-wrap h-auto gap-1 w-full justify-start mx-auto"
          aria-label={SPACES_PAGE.tabsFilterAriaLabel}
        >
          <TabsTrigger
            value={FILTER_ALL}
            className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <LayoutGrid className="size-4 shrink-0" aria-hidden />
            {SPACES_PAGE.tabAll}
          </TabsTrigger>
          {ALL_SPACES.map((space) => (
            <TabsTrigger
              key={space.id}
              value={space.id}
              className="flex items-center gap-1.5"
            >
              {space.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6 flex-1 min-w-0">
          <SpaceProjectsCalendar
            projects={filteredProjects}
            showVenue={true}
            spaceBorderColors={isAllView ? SPACE_BORDER_COLORS : undefined}
            onNavigate={(date) => {
              void ensurePastLoadedMonth(date);
              void ensureFutureLoadedMonth(date);
            }}
          />
        </div>
      </Tabs>
    </div>
  );
}
