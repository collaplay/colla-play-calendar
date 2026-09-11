// Project type for dashboard project list
// 專案列表型別

export type ProjectStatus =
  | "negotiating"
  | "confirmed"
  | "deposit_paid"
  | "completed"
  | "cancelled";

/** 專案設備勾選（存於 equipmentNeeds JSONB） */
export type ProjectEquipmentNeeds = {
  microphone?: boolean;
  extensionCord?: boolean;
  projector?: boolean;
  whiteboard?: boolean;
  /** 與上述四項互斥：明確表示無其他設備需求 */
  noOtherEquipmentNeeds?: boolean;
};

export interface Project {
  id: string;
  /** 對應 DB customerName（客戶姓名） */
  customer: string;
  /** 活動名稱（歷史欄位名沿用） */
  eventOrVenueUse: string;
  /** 活動類型（新欄位；舊資料預設「其他」） */
  eventType: string;
  space: string;
  date: string; // ISO date string
  /** 專案建立時間 */
  createdAt: string; // ISO datetime string
  /** 對應 DB collaPlayContactId（CollaPlay 窗口） */
  contactPerson: string;
  amount: number;
  /** 列表用：各筆租借場租加總 */
  rentalAmountTotal: number;
  /** 列表用：各筆租借餐飲金額加總 */
  fnbAmountTotal: number;
  /** 列表用：任一段租借為餐飲待定時，餐飲欄顯示「餐飲金額待定」 */
  hasFnbAmountPending: boolean;
  /** 列表用：各筆租借已付加總 */
  paidAmountTotal: number;
  /** 列表用：各筆租借待付加總 */
  pendingAmountTotal: number;
  status: ProjectStatus;
  /** 選填：桌數等 */
  tables?: string | null;
  /** 選填：椅子數（可為數字字串、TBC 等） */
  chairs?: string | null;
  /** 選填：餐飲項目 */
  fnbItems?: string | null;
  /** 選填：預計人數（可為數字字串、TBC 等） */
  totalAttendees?: string | null;
  /** 選填：專案備註 */
  projectNotes?: string | null;
  /** 選填：內部備註（列表欄位） */
  internalNotes?: string | null;
  /** 選填：設備勾選（舊資料可能為 null） */
  equipmentNeeds?: ProjectEquipmentNeeds | null;
  /** 是否需要列印告示 */
  needsPrintedNotice?: boolean | null;
  /** 選填：每筆租借的日期與場域（週曆依空間分組用） */
  rentals?: {
    date: string;
    /** 結束日；未傳視同與 date 同日 */
    endDate?: string | null;
    spaceIds: string[];
    startTime?: string;
    endTime?: string;
    setupMinutesBefore?: number;
    teardownMinutesAfter?: number;
  }[];
}

// Create project form: single rental item (場域可多選)
export interface RentalItem {
  spaceIds: string[];
  date: string; // ISO date YYYY-MM-DD
  /** 結束日 YYYY-MM-DD；與 date 相同或未填時可省略，DB 存 null */
  endDate?: string | null;
  startTime: string; // HH:mm 24h
  endTime: string; // HH:mm 24h
  setupMinutesBefore?: number; // 場佈提前分鐘數，預設 30
  teardownMinutesAfter?: number; // 場復延後分鐘數，預設 30
  rentalAmount: number;
  fnbAmount: number;
  /** 未傳視同 false（API 向前相容） */
  fnbAmountPending?: boolean;
  paidAmount: number;
  pendingAmount: number;
}

/** 單筆租借更新用（供 updateProjectRental / updateRental 使用） */
export type UpdateRentalInput = RentalItem;

export interface CreateProjectInput {
  customerName: string;
  customerPhone: string;
  company?: string;
  taxId?: string;
  /** 活動名稱（歷史欄位名沿用） */
  eventOrVenueUse: string;
  /** 活動類型（新欄位；API 會對舊 payload 補預設「其他」） */
  eventType: string;
  totalAttendees?: string;
  tables?: string;
  chairs?: string;
  fnbItems?: string;
  projectNotes?: string;
  collaPlayContactId: string;
  internalNotes?: string;
  /** 選填；全未勾選時服務層存 null */
  equipmentNeeds?: ProjectEquipmentNeeds | null;
  /** 是否需要列印告示（必填） */
  needsPrintedNotice: boolean;
  /** 官網報價頁產生的預約編號（CP-YYYYMMDD-####），僅公開報價流程會帶入 */
  referenceNumber?: string | null;
  rentals: RentalItem[];
}

/** 更新專案用，與 Create 相同欄位；RentalItem 可帶 id 表示更新既有，無 id 表示新增；未在列表中的既有 rental 會被刪除 */
export interface UpdateProjectInput {
  customerName: string;
  customerPhone: string;
  company?: string;
  taxId?: string;
  /** 活動名稱（歷史欄位名沿用） */
  eventOrVenueUse: string;
  /** 活動類型（新欄位；未傳則不更新，向後相容舊客戶端） */
  eventType?: string;
  totalAttendees?: string;
  tables?: string;
  chairs?: string;
  fnbItems?: string;
  projectNotes?: string;
  collaPlayContactId: string;
  internalNotes?: string;
  /** 未傳則不更新此欄（向後相容舊客戶端） */
  equipmentNeeds?: ProjectEquipmentNeeds | null;
  /** 是否需要列印告示（未傳則不更新，向後相容） */
  needsPrintedNotice?: boolean;
  status?: ProjectStatus;
  rentals: (RentalItem & { id?: string })[];
}

// API / service 回傳：建立後的專案含租借項目
export type ProjectWithRentals =
  import("@/lib/generated/prisma/models/Project").ProjectModel & {
    rentals: import("@/lib/generated/prisma/models/ProjectRental").ProjectRentalModel[];
  };

/** 總覽統計資料（與 overview-stats 的 data prop 一致） */
export interface OverviewStatsData {
  monthlyRentalIncome: number;
  negotiatingCount: number;
  confirmedCount: number;
  todayReservations: number;
}
