// Message and Text Content Configuration
// 訊息與文字內容配置
// This file contains all user-facing text, labels, and messages used throughout the application

// Store Information Messages
export const STORE_MESSAGES = {
  name: "CollaPlay",
  subtitle: "可能存在的遊樂園",
  catchphrase: "一座專為大人打造的遊樂園。",
  description: [
    "Collaboration + Play = CollaPlay",
    "一座專為大人打造的遊樂園",
    "咖啡館｜工作空間｜多功能教室｜社群活動｜場地租借",
  ],
} as const;

// Navigation Labels
export const NAV_LABELS = {
  home: "首頁",
  about: "關於我們",
  calendar: "活動行事曆",
  recordingBooking: "預約錄音室",
} as const;

// Social Media Labels
export const SOCIAL_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
} as const;

// Common Actions / Buttons (通用操作)
export const COMMON_ACTIONS = {
  login: "登入",
  logout: "登出",
  save: "儲存",
  cancel: "取消",
  delete: "刪除",
  clear: "清除",
} as const;

// Common UI placeholders / labels (通用 UI 文案)
export const COMMON_PLACEHOLDERS = {
  dash: "—",
} as const;

// Common Auth Messages (通用權限/登入訊息)
export const COMMON_AUTH = {
  loginRequired: "需要登入",
  forbidden: "無權限",
} as const;

// Common Error Messages (通用失敗訊息)
export const COMMON_ERRORS = {
  updateFailed: "更新失敗",
  deleteFailed: "刪除失敗",
  removeFailed: "移除失敗",
  downloadFailed: "下載失敗",
} as const;

// Nav Sheet (側邊導覽選單) 文案
export const NAV_SHEET = {
  adminBadge: "管理員",
  defaultUserName: "用戶",
  welcomeTitle: "歡迎",
  welcomeDescription: "請登入以使用完整功能",
  dashboardLinkLabel: "管理後台",
} as const;

// Dashboard Navigation Labels
export const DASHBOARD_LABELS = {
  events: "活動管理",
  categories: "類型管理",
  users: "會員管理",
} as const;

// Dashboard New Navigation Labels
export const DASHBOARD_NEW_LABELS = {
  overview: "總覽",
  spaces: "場域列表",
  pendingProjects: "待處理專案",
  projects: "專案管理",
  users: "成員管理",
  reports: "報表下載",
} as const;

// Projects API Messages (/api/projects)
export const API_PROJECTS = {
  validationMissingBody: "請提供專案資料",
  validationCustomerNameRequired: "聯絡人姓名為必填",
  validationCustomerPhoneInvalid: "聯絡電話格式錯誤",
  validationEventOrVenueUseRequired: "活動或場地用途為必填",
  validationCollaPlayContactRequired: "CollaPlay 窗口為必填",
  validationRentalsAtLeastOne: "至少需一筆租借項目",
  validationRentalItemInvalid: "第 {index} 筆租借項目格式錯誤",
  validationRentalItemSpaceRequired:
    "第 {index} 筆租借項目至少需選擇一個場域",
  validationEquipmentNeedsInvalid: "設備需求格式錯誤",
  fetchListFailed: "專案列表取得失敗",
  createFailed: "專案建立失敗",
} as const;

// Space names and descriptions (keyed by slug = function, second part of Chinese name)
export const SPACE_MESSAGES: Record<
  string,
  { name: string; description: string }
> = {
  "community-cafe": {
    name: "社群咖啡廳",
    description: "開放式社群交流空間，適合小型聚會與工作坊",
  },
  "focus-area": {
    name: "專注工作區",
    description: "安靜的專注工作環境，適合深度工作與學習",
  },
  "multipurpose-room": {
    name: "多功能教室",
    description: "彈性時段制，適合課程、工作坊與團體活動",
  },
  "tik-&-sip": {
    name: "Tik & Sip",
    description: "自然酒酒吧，適合小酌與放鬆",
  },
  "podcast-studio": {
    name: "Podcast 錄音室",
    description: "專業 Podcast 錄音空間，配備高品質錄音設備",
  },
  "product-photo": {
    name: "攝影室",
    description: "專業小物攝影空間，適合產品拍攝與內容創作",
  },
  "event-lounge": {
    name: "交誼廳",
    description: "舒適的活動交誼空間，適合聚會與小型活動",
  },
  "screening-room": {
    name: "播映室",
    description: "專業播映空間，適合影片放映與簡報展示",
  },
  "exhibition-hall": {
    name: "展演廳",
    description: "大型展演空間，適合展覽、表演與大型活動",
  },
} as const;

// Spaces Page (場域列表頁)
export const SPACES_PAGE = {
  title: "場域列表",
  description: "管理與檢視所有場域空間",
  tabsFilterAriaLabel: "依樓層篩選場域",
  tabAll: "全部",
  tab3F: "3F",
  tab4F: "4F",
  tab5F: "5F",
  sectionAll: "全部場域",
  section3F: "3F 場域",
  section4F: "4F 場域",
  section5F: "5F 場域",
  emptyFloor: "此樓層尚無場域",
} as const;

// Space Detail Page (單一場域專案列表，動態路由 /spaces/[slug])
export const SPACE_DETAIL_PAGE = {
  description: "此場域下的專案列表",
  buttonBackToList: "返回場域列表",
  emptyProjects: "此場域尚無專案",
  tableCaption: "專案列表",
  tabCalendarView: "月曆",
  tabListView: "列表",
  tabsAriaLabel: "專案檢視方式",
  emptyDayProjects: "當日無專案",
} as const;

// Dashboard Overview (總覽頁區塊)
export const DASHBOARD_OVERVIEW = {
  recentProjectsTitle: "最近新增專案",
  recentProjectsFilterNote: "僅顯示最近 14 天內新增、且活動尚未發生的專案",
  upcomingProjectsTitle: "未來 28 天新增活動專案",
  upcomingProjectsFilterNote: "最近 14 天內新增．活動日期在未來 28 天內",
  seeAll: "查看全部",
  seeAllProjectsAria: "查看全部專案",
  noProjectsYet: "尚無專案",
  // 總覽統計四項
  statsMonthlyRentalLabel: "當月場租收入",
  statsMonthlyRentalDescription: "僅計算已確定專案（含已付訂）",
  statsNegotiatingLabel: "洽談中專案",
  statsNegotiatingDescription: "待確認訂金",
  statsConfirmedLabel: "已確認專案",
  statsConfirmedDescription: "已收取訂金",
  statsTodayReservationsLabel: "今日預定",
  statsTodayReservationsDescription: "今日場域使用",
} as const;

// Projects Page (專案管理頁)
export const PROJECTS_PAGE = {
  title: "專案管理",
  description: "管理與追蹤所有專案進度",
  createNewProject: "建立專案",
  createNewProjectAria: "建立新專案",
  searchPlaceholder: "搜尋客戶、活動名稱、場域、接洽人…",
  searchAriaLabel: "搜尋專案",
  searchNoResults: "搜尋無結果",
  tableCaption: "專案列表",
  columnReferenceNumber: "預約編號",
  columnActivityType: "活動類型",
  columnCustomer: "客戶",
  columnEventOrVenueUse: "活動名稱",
  columnSpace: "場域",
  columnDate: "日期",
  columnEventStartTime: "開始時間",
  columnEventEndTime: "結束時間",
  columnSetupTime: "場佈時間",
  columnTeardownTime: "場復時間",
  columnContact: "接洽人",
  columnAmount: "金額",
  columnStatus: "狀態",
  columnTables: "桌子",
  columnChairs: "椅子",
  columnFnbItems: "餐飲項目",
  columnNeedsPrintedNotice: "告示",
  columnTotalAttendees: "人數",
  columnInternalNotes: "內部備註",
  columnOtherEquipment: "其他設備",
  columnRentalAmount: "場租",
  columnFnbAmount: "餐飲",
  columnPaidAmount: "已付",
  columnPendingAmount: "待付",
  columnActions: "操作",
  actionEditAria: "編輯",
  actionDuplicateAria: "複製",
  actionDeleteAria: "刪除",
  actionDownloadTooltip: "下載專案 CSV",
  actionDuplicateTooltip: "複製此專案",
  actionEditTooltip: "編輯",
  actionDeleteTooltip: "刪除",
  statusNegotiating: "洽談中",
  statusConfirmed: "已確定",
  statusDepositPaid: "已付訂",
  statusCompleted: "已完成",
  statusCancelled: "取消",
  statusCancelledOption: "已取消",
  emptyProjects: "尚無專案或搜尋無結果",
  emptySpaceBookingsThisWeek: "本週無場地預訂",
  tabListView: "列表",
  tabWeekView: "週曆",
  tabsAriaLabel: "專案檢視方式",
  downloadListCsv: "下載 CSV",
  downloadListCsvAria: "下載專案列表 CSV（可選日期區間）",
  downloadListCsvPopoverTitle: "匯出專案列表",
  downloadListCsvPopoverDescription: "選擇報表涵蓋的開始與結束日期，將匯出該區間內曾排程的專案（與列表欄位相同，不含操作）。",
  downloadListCsvConfirm: "下載",
  downloadListCsvResetMonth: "重設為當月",
  downloadListCsvResetMonthAria: "將日期區間重設為目前月份",
  listPaginationSummary: "顯示第 {start}–{end} 筆，共 {total} 筆",
  listPaginationSrOnly: "，第 {page} 頁，共 {pages} 頁",
  paginationPageAria: "第 {page} 頁",
  filterAll: "全部",
  selectedCount: "已選 {count}",
  statusFilterAria: "{label}篩選（{selectedSummary}）",
  statusSelectAria: "選取狀態：{label}",
  statusUpdateAria: "更新狀態：{name}",
  columnConfirm: "確認",
  confirmSelectPlaceholder: "請選擇",
  confirmSelectAria: "確認或取消：{name}",
  confirmOptionApprove: "已確認",
  confirmOptionCancel: "已取消",
  cancelDeleteConfirmTitle: "確定刪除嗎？",
  cancelDeleteConfirmDescription: "取消這筆待處理專案後會直接從系統中刪除，無法復原。",
} as const;

/** 餐飲金額尚未確定：列表／詳情／CSV 顯示與表單勾選（單一來源） */
export const FNB_AMOUNT_PENDING_LABEL = "餐飲金額待定" as const;

// Create Project Page (建立新專案表單)
export const CREATE_PROJECT_PAGE = {
  pageTitle: "建立專案",
  pageDescription: "填寫客戶與專案資訊以建立新專案",

  sectionCustomer: "客戶資訊",
  sectionProject: "專案資訊",
  sectionEquipment: "設備需求",
  sectionNotice: "告示",
  sectionNotes: "專案備註",
  sectionRentals: "租借項目",
  labelNeedsPrintedNotice: "是否需要列印告示",

  labelActivityType: "活動類型",
  placeholderSelectActivityType: "選擇活動類型",
  labelActivityTypeOtherDetail: "活動類型說明",
  placeholderActivityTypeOtherDetail: "請輸入自訂活動類型…",

  labelEquipmentExtras: "其他設備（可複選）",
  labelEquipmentMicrophone: "麥克風",
  labelEquipmentExtensionCord: "延長線",
  labelEquipmentProjector: "投影設備",
  labelEquipmentWhiteboard: "白板／白板筆",
  labelEquipmentNoOtherNeeds: "無其他設備需求",

  labelCustomerName: "客戶名稱",
  labelCustomerNameRequired: "客戶名稱 *",
  placeholderCustomerName: "請輸入姓名…",
  labelPhone: "聯絡電話",
  labelPhoneRequired: "聯絡電話 *",
  placeholderPhone: "0912-345-678",
  labelCompany: "公司行號",
  optional: "選填",
  labelTaxId: "統一編號",

  labelEventOrVenueUse: "活動名稱",
  labelEventOrVenueUseRequired: "活動名稱 *",
  placeholderEventOrVenueUse: "例如：產品發表會、工作坊、Podcast 錄製…",
  labelTotalAttendees: "活動總人數",
  labelTotalAttendeesRequired: "活動總人數 *",
  placeholderAttendees: "數字或 TBC（暫定）",
  labelTables: "桌子需求",
  labelTablesRequired: "桌子需求 *",
  placeholderTables: "數字或 TBC（暫定）",
  labelChairs: "椅子需求",
  labelChairsRequired: "椅子需求 *",
  placeholderChairs: "數字或 TBC（暫定）",
  labelFnb: "餐飲品項",
  labelProjectNotes: "備註",
  labelCollaPlayContact: "CollaPlay 接洽人",
  labelCollaPlayContactRequired: "CollaPlay 接洽人 *",
  placeholderSelectContact: "選擇接洽人…",

  labelInternalNotes: "內部備註",
  placeholderInternalNotes: "內部備註，例如特殊需求、注意事項…",

  addRental: "新增場域",
  labelSpaces: "場域",
  labelSpacesRequired: "場域 *",
  placeholderSelectSpaces: "選擇場域…",
  labelDate: "日期",
  labelDateRequired: "日期 *",
  dateFormat: "年 / 月 / 日",
  labelEndDate: "結束日期",
  labelEndDateHint: "跨日時選擇；未選則與開始日相同",
  labelStartTime: "開始時間",
  labelStartTimeRequired: "開始時間 *",
  placeholderSelectTime: "選擇時間…",
  labelEndTime: "結束時間",
  labelEndTimeRequired: "結束時間 *",
  labelSetupTime: "場佈時間",
  setupDefault: "預設：開始前 30 分鐘",
  labelTeardownTime: "場復時間",
  teardownDefault: "預設：結束後 30 分鐘",
  labelRentalAmount: "場租金額 (NT$)",
  labelFnbAmount: "餐飲金額 (NT$)",
  /** 與 {@link FNB_AMOUNT_PENDING_LABEL} 同文案，供勾選項使用 */
  labelFnbAmountPending: FNB_AMOUNT_PENDING_LABEL,
  labelPaidAmount: "已付款項 (NT$)",
  /** 建立專案時：任一段已付款項大於 0 則狀態為已確定 */
  hintPaidAmountSetsConfirmed:
    "任一段已付款項大於 0 時，建立後專案狀態將為「已確定」。",
  labelPendingAmount: "待付金額 (NT$)",

  submit: "建立專案",
  submitting: "儲存中…",
  removeRental: "移除",
  removeRentalAria: "移除此筆租借",
  copyRental: "複製",
  copyRentalAria: "複製此筆租借",

  errorRequired: "此欄位為必填",
  errorActivityTypeRequired: "請選擇活動類型",
  errorActivityTypeOtherRequired: "選擇「其他」時請填寫說明",
  errorPhoneInvalid: "請輸入有效的聯絡電話",
  errorEndBeforeStart: "結束時間須晚於開始時間",
  /** 同日須 end > start；跨日時結束日不可早於開始日 */
  errorInvalidRentalWindow:
    "請確認日期與時間：同日時結束須晚於開始；跨日時結束日不可早於開始日。",
  errorRentalOverlapInternal: "表單內有租借在相同空間時段重疊，請調整。",
} as const;

// Project Detail Page (專案詳情頁)
export const PROJECT_DETAIL_PAGE = {
  title: "專案詳情",
  description: "檢視與編輯專案資訊",

  sectionCustomer: "客戶資訊",
  sectionProject: "專案資訊",
  sectionEquipment: "設備需求",
  sectionNotice: "告示",
  sectionNotes: "備註",
  sectionRentals: "租借項目",
  labelNeedsPrintedNotice: "是否需要列印告示",

  labelActivityType: "活動類型",
  placeholderSelectActivityType: "選擇活動類型",
  labelActivityTypeOtherDetail: "活動類型說明",
  placeholderActivityTypeOtherDetail: "請輸入自訂活動類型…",

  labelEquipmentExtras: "其他設備（可複選）",
  labelEquipmentMicrophone: "麥克風",
  labelEquipmentExtensionCord: "延長線",
  labelEquipmentProjector: "投影設備",
  labelEquipmentWhiteboard: "白板／白板筆",
  labelEquipmentNoOtherNeeds: "無其他設備需求",
  labelEquipmentSummary: "設備勾選",

  labelReferenceNumber: "預約編號",
  labelCustomerName: "客戶名稱",
  labelPhone: "聯絡電話",
  labelCompany: "公司行號",
  labelTaxId: "統一編號",
  labelEventOrVenueUse: "活動名稱",
  labelTotalAttendees: "活動總人數",
  labelTables: "桌子需求",
  labelChairs: "椅子需求",
  labelFnb: "餐飲品項",
  labelProjectNotes: "專案備註",
  labelCollaPlayContact: "CollaPlay 接洽人",
  labelInternalNotes: "內部備註",
  labelStatus: "狀態",
  labelCreatedAt: "建立時間",
  labelUpdatedAt: "更新時間",

  labelDate: "日期",
  labelTimeRange: "時段",
  labelSpaces: "場域",
  labelRentalAmount: "場租",
  labelFnbAmount: "餐飲",
  labelPaidAmount: "已付",
  labelPendingAmount: "待付",
  totalAmount: "總金額",

  buttonEdit: "編輯",
  buttonDelete: "刪除",
  buttonSave: "儲存",
  buttonCancel: "取消",
  buttonBackToList: "返回列表",
  buttonDownloadCsv: "下載 CSV",

  deleteConfirmTitle: "確認刪除專案",
  deleteConfirmDescription: "刪除後無法復原，確定要刪除此專案嗎？",
  deleteConfirmConfirm: "刪除",
  deleteConfirmCancel: "取消",
  deleteConfirmDeleting: "刪除中…",

  deleteRentalConfirmTitle: "確認移除此筆租借",
  deleteRentalConfirmDescription: "移除此筆租借後無法復原，確定要移除嗎？",
  deleteRentalError: "移除失敗",

  editRentalTitle: "編輯此筆租借",
  editRentalSuccess: "已更新",
  addRentalLabel: "新增租借",
  addRentalDialogTitle: "新增租借項目",
  labelOperations: "操作",

  updateSuccess: "已儲存",
  updateError: "更新失敗",
  deleteError: "刪除失敗",
  notFound: "找不到此專案",
} as const;

// Users Page (成員管理頁 /dashboard/users)
export const USERS_PAGE = {
  title: "成員管理",
  description: "檢視與管理所有成員",
  searchPlaceholder: "搜尋姓名或 Email…",
  searchAriaLabel: "搜尋成員",
  filterLabel: "篩選",
  filterAll: "全部用戶",
  filterAdmin: "僅管理員",
  filterUser: "僅一般用戶",
  tableCaption: "成員列表",
  columnName: "姓名",
  columnEmail: "Email",
  columnCreatedAt: "註冊時間",
  columnVerified: "驗證狀態",
  columnAdmin: "管理員",
  columnActions: "操作",
  verified: "已驗證",
  unverified: "未驗證",
  adminBadge: "管理員",
  buttonEdit: "編輯",
  buttonDelete: "刪除",
  buttonSave: "儲存",
  buttonCancel: "取消",
  buttonRefresh: "重新整理",
  buttonRefreshAria: "重新載入列表",
  editDialogTitle: "編輯成員",
  editDialogDescription: "修改成員姓名",
  editLabelName: "姓名",
  editPlaceholderName: "請輸入姓名…",
  deleteConfirmTitle: "確認刪除成員",
  deleteConfirmDescription: "刪除後無法復原，確定要刪除此成員嗎？",
  deleteConfirmConfirm: "刪除",
  deleteConfirmCancel: "取消",
  emptyUsers: "尚無成員或搜尋無結果",
  emptyHint: "嘗試調整搜尋條件",
  paginationRange: "第 {from}–{to} 筆，共 {total} 筆",
  paginationPrev: "上一頁",
  paginationNext: "下一頁",
  updateSuccess: "已儲存",
  updateError: "更新失敗",
  deleteError: "刪除失敗",
  toggleAdminAria: "切換 {name} 的管理員狀態",
} as const;

// Type exports for type safety
export type StoreMessages = typeof STORE_MESSAGES;
export type NavLabels = typeof NAV_LABELS;
export type SocialLabels = typeof SOCIAL_LABELS;
export type CommonActions = typeof COMMON_ACTIONS;
export type CommonAuthMessages = typeof COMMON_AUTH;
export type CommonErrorMessages = typeof COMMON_ERRORS;
export type NavSheetMessages = typeof NAV_SHEET;
export type DashboardLabels = typeof DASHBOARD_LABELS;
export type DashboardNewLabels = typeof DASHBOARD_NEW_LABELS;
export type ApiProjectsMessages = typeof API_PROJECTS;
export type SpacesPageMessages = typeof SPACES_PAGE;
export type SpaceMessages = typeof SPACE_MESSAGES;
export type DashboardOverviewMessages = typeof DASHBOARD_OVERVIEW;
export type ProjectsPageMessages = typeof PROJECTS_PAGE;
export type CreateProjectPageMessages = typeof CREATE_PROJECT_PAGE;
export type ProjectDetailPageMessages = typeof PROJECT_DETAIL_PAGE;
export type UsersPageMessages = typeof USERS_PAGE;
