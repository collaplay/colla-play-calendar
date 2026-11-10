import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  ListTodo,
  Users,
} from "lucide-react";
import { DASHBOARD_NEW_LABELS } from "../message";

// Modern Admin Dashboard Navigation Configuration
// 現代化管理後台導航配置

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const dashboardNavigation: DashboardNavItem[] = [
  {
    href: "/dashboard",
    label: DASHBOARD_NEW_LABELS.overview,
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/spaces",
    label: DASHBOARD_NEW_LABELS.spaces,
    icon: Building2,
  },
  {
    href: "/dashboard/projects?status=negotiating",
    label: DASHBOARD_NEW_LABELS.pendingProjects,
    icon: ListTodo,
  },
  {
    href: "/dashboard/projects",
    label: DASHBOARD_NEW_LABELS.projects,
    icon: FolderKanban,
  },
  {
    href: "/dashboard/users",
    label: DASHBOARD_NEW_LABELS.users,
    icon: Users,
  },
];

// Modern SaaS Color Palette
export const dashboardColors = {
  primary: {
    from: "oklch(0.65 0.25 270)", // Purple
    to: "oklch(0.70 0.20 320)", // Pink-Purple
  },
  accent: {
    electricBlue: "oklch(0.60 0.22 240)",
    neonGreen: "oklch(0.75 0.20 140)",
    cyberOrange: "oklch(0.70 0.22 50)",
    hotPink: "oklch(0.65 0.28 340)",
  },
} as const;

// 專案列表表格欄位（順序與版型）；實際渲染見 app/dashboard/projects/projects-list.tsx
export {
  PROJECTS_LIST_COLUMNS,
  type ProjectsListColumnConfig,
  type ProjectsListColumnId,
  type ProjectsListSortKey,
} from "./projects-list-table";
