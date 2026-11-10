// Modern Admin Dashboard - Projects Page
// 現代化管理後台 - 專案管理頁面

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardShell } from "../components/dashboard-shell.client";
import { PageHeader } from "../components/page-header.client";
import { ProjectsContent } from "./projects-content.client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PROJECTS_PAGE } from "@/lib/message";
import { getProjectsForWindow } from "@/lib/services/project/project.service";
import {
  PROJECT_STATUS_UI_SELECTABLE_VALUES,
  type ProjectStatusUi,
} from "@/lib/config/project-status";
import { getTaipeiTodayYmd } from "@/lib/utils/project-effective-status";
import {
  buildLoginUrlWithNext,
  buildPathWithSearch,
  type NextSearchParams,
} from "@/lib/utils/login-next";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface PageProps {
  searchParams?: Promise<NextSearchParams>;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const sp = searchParams ? await searchParams : undefined;
  const nextPath = buildPathWithSearch("/dashboard/projects", sp);

  if (!session?.user) {
    redirect(buildLoginUrlWithNext(nextPath));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    redirect("/");
  }

  const now = new Date();
  const fromYmd = getTaipeiTodayYmd(now);
  // 預設只載入未來 6 個月（含當月）；往未來移動週曆再逐月追加
  const horizonMonthStart = startOfMonth(addMonths(now, 5));
  const toYmd = formatYmd(endOfMonth(horizonMonthStart));
  const projects = await getProjectsForWindow({ fromYmd, toYmd });

  const statusParam = Array.isArray(sp?.status) ? sp?.status[0] : sp?.status;
  const initialStatus = (
    [...PROJECT_STATUS_UI_SELECTABLE_VALUES, "completed"] as ProjectStatusUi[]
  ).includes(statusParam as ProjectStatusUi)
    ? (statusParam as ProjectStatusUi)
    : undefined;

  return (
    <DashboardShell>
      <PageHeader
        title={PROJECTS_PAGE.title}
        description={PROJECTS_PAGE.description}
        iconName="FolderKanban"
      />

      <ProjectsContent projects={projects} initialStatus={initialStatus} />
    </DashboardShell>
  );
}
