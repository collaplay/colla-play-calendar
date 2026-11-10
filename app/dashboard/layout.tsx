// Modern Admin Dashboard Layout (Server Component)
// 現代化管理後台佈局 - 管理員權限檢查與側邊欄包裝

import { Suspense } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "./components/admin-sidebar.client";

export default async function DashboardNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render layout with sidebar
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-linear-to-br from-background via-background to-accent/5 dark:from-background dark:via-background dark:to-accent/10">
        <Suspense fallback={null}>
          <AdminSidebar />
        </Suspense>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SidebarProvider>
  );
}
