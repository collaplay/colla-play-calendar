import {
  Calendar,
  Tag,
  Users,
  Home,
  Instagram,
  Facebook,
  Info,
  Mic,
} from "lucide-react";
import {
  STORE_MESSAGES,
  NAV_LABELS,
  SOCIAL_LABELS,
  DASHBOARD_LABELS,
  SPACE_MESSAGES,
} from "../message";

// 商店基本設定
// CollaPlay の店舗情報を一元管理

// 商店基本配置
export const STORE_CONFIG = {
  ...STORE_MESSAGES,
  since: 2025,
  phone: "02 6627 0836",
  email: "hello@collaplay.com",
  address: "108臺北市萬華區武昌街二段83之6號3樓",

  // 營業時間
  businessHours: {
    open: 10, // 10:00
    close: 22, // 22:00
  },

  // 公休日（空陣列表示無公休）
  // 0 = 星期日, 1 = 星期一, ..., 6 = 星期六
  closedDays: [] as number[],
} as const;

// クイックリンク設定
export const PAGE_LINKS = [
  { label: NAV_LABELS.home, href: "/", icon: Home },
  { label: NAV_LABELS.about, href: "/about", icon: Info },
  { label: NAV_LABELS.calendar, href: "/calendar", icon: Calendar },
  { label: NAV_LABELS.recordingBooking, href: "/book/recording", icon: Mic },
];

// ソーシャルリンク設定
// icon: lucide-react のアイコン名を指定
export const SOCIAL_LINKS = [
  {
    icon: Instagram,
    label: SOCIAL_LABELS.instagram,
    href: "https://www.instagram.com/colla_play/",
  },
  {
    icon: Facebook,
    label: SOCIAL_LABELS.facebook,
    href: "https://www.facebook.com/collaplay",
  },
];

export type DashboardTab = "events" | "categories" | "users";

export const dashboardNavigationItems: Array<{
  id: DashboardTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "events",
    label: DASHBOARD_LABELS.events,
    icon: Calendar,
  },
  {
    id: "categories",
    label: DASHBOARD_LABELS.categories,
    icon: Tag,
  },
  {
    id: "users",
    label: DASHBOARD_LABELS.users,
    icon: Users,
  },
];

// 型別定義
export type StoreConfig = typeof STORE_CONFIG;
export type BusinessHours = typeof STORE_CONFIG.businessHours;
export type PageLink = (typeof PAGE_LINKS)[number];
export type SocialLink = (typeof SOCIAL_LINKS)[number];

// 場域靜態資料 - 依樓層分組，供 SpacesTabs 使用
export type FloorKey = "3F" | "4F" | "5F";

export interface SpaceOpeningHours {
  open: number; // 開門時刻（0–24）
  close: number; // 關門時刻（0–24）
}

export interface Space {
  id: string;
  floor: FloorKey;
  name: string;
  description: string;
  openingHours: SpaceOpeningHours;
}

function spaceFromSlug(
  floor: FloorKey,
  slug: string,
  idSuffix?: string,
): Space {
  const msg = SPACE_MESSAGES[slug];
  if (!msg) throw new Error(`Unknown space slug: ${slug}`);
  const id = idSuffix
    ? `${floor.toLowerCase()}-${slug}-${idSuffix}`
    : `${floor.toLowerCase()}-${slug}`;
  return {
    id,
    floor,
    name: msg.name,
    description: msg.description,
    openingHours: { open: 10, close: 22 },
  };
}

/** 場域分頁與清單順序（與營運約定一致，非依樓層數字排序） */
export const ALL_SPACES: Space[] = [
  spaceFromSlug("5F", "exhibition-hall"),
  spaceFromSlug("4F", "event-lounge"),
  spaceFromSlug("4F", "multipurpose-room"),
  spaceFromSlug("4F", "tik-&-sip"),
  spaceFromSlug("4F", "podcast-studio"),
  spaceFromSlug("4F", "screening-room"),
  spaceFromSlug("4F", "product-photo"),
  spaceFromSlug("3F", "community-cafe"),
  spaceFromSlug("3F", "focus-area"),
];

/**
 * 免審核場域：播映室、錄音室。官網報價頁送出後直接算進場域行事曆，
 * 不需要像其他場域一樣先卡在「待處理專案」等人工確認。
 */
export const SELF_SERVE_SPACE_IDS: readonly string[] = [
  "4f-podcast-studio",
  "4f-screening-room",
];

export const SPACE_BORDER_COLORS: Record<string, string> = {
  "3f-community-cafe": "border-white",
  "3f-focus-area": "border-white",
  "4f-multipurpose-room": "border-white",
  "4f-multipurpose-room-1": "border-white",
  "4f-multipurpose-room-2": "border-white",
  "4f-podcast-studio": "border-white",
  "4f-product-photo": "border-white",
  "4f-event-lounge": "border-white",
  "4f-screening-room": "border-white",
  "4f-tik-&-sip": "border-white",
  "5f-exhibition-hall": "border-white",
};

export const SPACES_3F: Space[] = ALL_SPACES.filter((s) => s.floor === "3F");
export const SPACES_4F: Space[] = ALL_SPACES.filter((s) => s.floor === "4F");
export const SPACES_5F: Space[] = ALL_SPACES.filter((s) => s.floor === "5F");

export const SPACES_BY_FLOOR: Record<FloorKey, Space[]> = {
  "3F": SPACES_3F,
  "4F": SPACES_4F,
  "5F": SPACES_5F,
};

/** 已廢除的場域 id（room1/room2 合併為 multipurpose-room），顯示名稱統一回傳多功能教室 */
const DEPRECATED_SPACE_ID_TO_NAME: Record<string, string> = {
  "4f-multipurpose-room-1": SPACE_MESSAGES["multipurpose-room"].name,
  "4f-multipurpose-room-2": SPACE_MESSAGES["multipurpose-room"].name,
};

/** 依場域 id（如 4f-podcast-studio）回傳顯示名稱，供專案列表等使用 */
export function getSpaceNameById(id: string): string {
  if (DEPRECATED_SPACE_ID_TO_NAME[id]) return DEPRECATED_SPACE_ID_TO_NAME[id];
  const space = ALL_SPACES.find((s) => s.id === id);
  return space?.name ?? id;
}

/** 依場域 id 回傳 Space，找不到回傳 undefined（供動態路由驗證與標題使用） */
export function getSpaceById(id: string): Space | undefined {
  return ALL_SPACES.find((s) => s.id === id);
}
