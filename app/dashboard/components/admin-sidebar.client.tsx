"use client";

// Modern Admin Sidebar Component
// 現代化管理後台側邊欄 - 動畫導航與活動狀態

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Home } from "lucide-react";
import { ThemeToggle } from "@/components/widget/theme-toggle";
import { dashboardNavigation } from "@/lib/config/config-dashboard";
import { STORE_MESSAGES } from "@/lib/message";

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const currentHref = pathname + (currentSearch ? `?${currentSearch}` : "");
  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="bg-primary py-6 px-4">
        <Link
          href="/dashboard"
          className={`space-y-2 min-w-0 flex flex-col justify-center ${state === "expanded" ? "items-start" : "items-center"}`}
        >
          <h2
            className={`font-display font-bold text-white ${state === "expanded" ? "text-lg" : "text-2xl"}`}
          >
            {state === "expanded"
              ? STORE_MESSAGES.name
              : STORE_MESSAGES.name.charAt(0)}
          </h2>
          {state === "expanded" && (
            <p className="text-xs text-primary-foreground/80">
              {STORE_MESSAGES.subtitle}
            </p>
          )}
        </Link>
        {state === "expanded" && (
          <ThemeToggle className="absolute top-3 right-3 shrink-0 text-primary-foreground hover:bg-primary-foreground/20 focus-visible:ring-primary-foreground" />
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarMenu className="gap-2">
          {dashboardNavigation.map((item) => {
            const hasQuery = item.href.includes("?");
            // 帶查詢字串的項目（例如「待處理專案」的 ?status=negotiating）要求完整網址相符，
            // 避免跟不帶查詢字串的「專案管理」同時亮起。
            const exactQueryMatchExists = dashboardNavigation.some(
              (other) => other.href.includes("?") && currentHref === other.href,
            );
            // Root path /dashboard must match exactly so sub-routes don't highlight 總覽
            const isActive = hasQuery
              ? currentHref === item.href
              : !exactQueryMatchExists &&
                (pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href + "/")));

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className={`
                    group relative overflow-hidden transition-all duration-300
                    ${
                      isActive
                        ? "bg-linear-to-r from-accent to-primary text-white shadow-lg shadow-accent/50 hover:shadow-xl hover:shadow-accent/60"
                        : "hover:text-foreground hover:bg-accent/10 dark:hover:bg-accent/5"
                    }
                  `}
                >
                  <Link href={item.href}>
                    <motion.div
                      className="flex items-center gap-3 w-full"
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                    >
                      <motion.div
                        whileHover={{ rotate: 360 }}
                        transition={{ duration: 0.5 }}
                      >
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-white" : ""}`}
                        />
                      </motion.div>
                      <span
                        className={`font-medium ${isActive ? "text-white" : ""}`}
                      >
                        {item.label}
                      </span>
                    </motion.div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="返回首頁">
              <Link
                href="/"
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                <span>返回首頁</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
