/**
 * 專案列表表格：欄位順序與表頭／儲存格版型（單一來源）
 * 表身內容與排序取值仍於 projects-list 實作，避免設定檔依賴 React 與格式化邏輯。
 */

import { PROJECTS_PAGE } from "@/lib/message";

/**
 * 第一欄（活動類型）固定寬度（px），含左右 p-4；須與第二欄 sticky 的 `left-[…px]` 一致。
 */
export const PROJECTS_LIST_STICKY_COL1_WIDTH_PX = 152;

/**
 * 欄位顯示順序即陣列順序；調整順序時僅改此處即可與表頭／表身對齊。
 */
export const PROJECTS_LIST_COLUMNS = [
  {
    id: "referenceNumber",
    sortable: true,
    label: PROJECTS_PAGE.columnReferenceNumber,
    cellClassName: "whitespace-nowrap font-mono text-xs",
  },
  {
    id: "confirm",
    sortable: false,
    label: PROJECTS_PAGE.columnConfirm,
    headerClassName: "whitespace-nowrap",
    cellClassName: "whitespace-nowrap",
  },
  {
    id: "eventType",
    sortable: true,
    label: PROJECTS_PAGE.columnActivityType,
    // 寬度須與 PROJECTS_LIST_STICKY_COL1_WIDTH_PX 一致（供 Tailwind JIT 靜態掃描）
    headerClassName: "w-[120px] min-w-[120px] max-w-[120px]",
    cellClassName: "w-[120px] min-w-[120px] max-w-[120px] truncate",
    //表頭
    stickyHeaderClassName:
      "sticky left-0 z-30 bg-card border-r border-border/30 rounded-tl-xl",
    //儲存格
    stickyCellClassName:
      "sticky left-0 z-20 bg-card border-r border-border/30 group-hover:bg-muted",
  },
  {
    id: "eventOrVenueUse",
    sortable: true,
    label: PROJECTS_PAGE.columnEventOrVenueUse,
    // 212 = 180 內容區 + 左右 p-4；left-[152px] 須等於 PROJECTS_LIST_STICKY_COL1_WIDTH_PX
    headerClassName: "w-[212px] min-w-[212px] max-w-[212px]",
    cellClassName: "w-[212px] min-w-[212px] max-w-[212px] truncate",
    stickyHeaderClassName:
      "sticky left-[120px] z-30 bg-card border-r border-border/30",
    stickyCellClassName:
      "sticky left-[120px] z-[21] bg-card border-r border-border/30 group-hover:bg-muted",
  },
  {
    id: "customer",
    sortable: true,
    label: PROJECTS_PAGE.columnCustomer,
    cellClassName: "min-w-0 max-w-[120px] truncate",
  },
  {
    id: "space",
    sortable: true,
    label: PROJECTS_PAGE.columnSpace,
    cellClassName: "min-w-0 max-w-[160px] truncate",
  },
  {
    id: "date",
    sortable: true,
    label: PROJECTS_PAGE.columnDate,
    cellClassName: "tabular-nums whitespace-nowrap",
  },
  {
    id: "eventStartTime",
    sortable: true,
    label: PROJECTS_PAGE.columnEventStartTime,
    headerClassName: "tabular-nums whitespace-nowrap",
    cellClassName: "tabular-nums whitespace-nowrap",
  },
  {
    id: "eventEndTime",
    sortable: true,
    label: PROJECTS_PAGE.columnEventEndTime,
    headerClassName: "tabular-nums whitespace-nowrap",
    cellClassName: "tabular-nums whitespace-nowrap",
  },
  {
    id: "contactPerson",
    sortable: true,
    label: PROJECTS_PAGE.columnContact,
    cellClassName: "min-w-0 max-w-[100px] truncate",
  },
  {
    id: "amount",
    sortable: true,
    label: PROJECTS_PAGE.columnAmount,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "status",
    sortable: false,
    label: PROJECTS_PAGE.columnStatus,
    cellClassName: "",
  },
  {
    id: "totalAttendees",
    sortable: true,
    label: PROJECTS_PAGE.columnTotalAttendees,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "tables",
    sortable: true,
    label: PROJECTS_PAGE.columnTables,
    cellClassName: "min-w-0 max-w-[80px] truncate",
  },
  {
    id: "chairs",
    sortable: true,
    label: PROJECTS_PAGE.columnChairs,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "otherEquipment",
    sortable: true,
    label: PROJECTS_PAGE.columnOtherEquipment,
    cellClassName: "min-w-0 max-w-[160px] truncate",
  },
  {
    id: "rentalAmountTotal",
    sortable: true,
    label: PROJECTS_PAGE.columnRentalAmount,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "fnbAmountTotal",
    sortable: true,
    label: PROJECTS_PAGE.columnFnbAmount,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "paidAmountTotal",
    sortable: true,
    label: PROJECTS_PAGE.columnPaidAmount,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "pendingAmountTotal",
    sortable: true,
    label: PROJECTS_PAGE.columnPendingAmount,
    headerClassName: "text-right tabular-nums",
    cellClassName: "text-right tabular-nums",
    headerButtonJustifyEnd: true,
  },
  {
    id: "fnbItems",
    sortable: true,
    label: PROJECTS_PAGE.columnFnbItems,
    cellClassName: "min-w-0 max-w-[140px] truncate",
  },
  {
    id: "needsPrintedNotice",
    sortable: true,
    label: PROJECTS_PAGE.columnNeedsPrintedNotice,
    cellClassName: "whitespace-nowrap",
  },
  {
    id: "internalNotes",
    sortable: true,
    label: PROJECTS_PAGE.columnInternalNotes,
    cellClassName: "min-w-0 max-w-[180px] truncate",
  },
  {
    id: "actions",
    sortable: false,
    label: PROJECTS_PAGE.columnActions,
    headerClassName: "w-0",
    cellClassName: "w-0 whitespace-nowrap",
  },
] as const;

/** 單一欄位設定列 */
export type ProjectsListColumnConfig = (typeof PROJECTS_LIST_COLUMNS)[number];

/** 可排序欄位鍵 */
export type ProjectsListSortKey = Extract<
  ProjectsListColumnConfig,
  { sortable: true }
>["id"];

/** 含操作欄在內的欄位識別 */
export type ProjectsListColumnId = ProjectsListColumnConfig["id"];
