// POST /api/public/rental-inquiries
// 公開端點：接收官網報價頁（Claude Artifact）表單送出的預約請求，
// 建立一筆 status = negotiating 的 Project + ProjectRental，供員工用預約編號在後台核對。
//
// 這支端點沒有登入保護（設計上就是給匿名訪客用），因此：
// - 一律用 <form> 送出（不是 fetch），前端平台的限制見 PR 說明
// - 只做輕量防灌水（頻率限制＋蜜罐欄位＋格式驗證），不追求滴水不漏
// - 絕不信任前端送來的金額，僅原樣寫進 projectNotes 供人工參考，正式金額欄位一律為 0
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getAdminContactOptions } from "@/lib/services/admin-contact.service";
import {
  ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG,
  ADMIN_PROJECTS_LIST_CACHE_TAG,
  createProject,
  ProjectRentalConflictError,
} from "@/lib/services/project/project.service";
import { isValidRentalTimeWindow } from "@/lib/utils/project-rental-interval";
import { SELF_SERVE_SPACE_IDS } from "@/lib/config/config";
import type { CreateProjectInput } from "@/lib/types/project";

const REFERENCE_NUMBER_PATTERN = /^CP-\d{8}-\d{4}$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 50;

// 錄音室專用：liuchiawei 提供的正式系統寫回 API，只有錄音室單一場域的預約會呼叫這支，
// 寫入成功才視為「真的佔住時段」，接著才在我們自己的資料庫留一份供客人查詢／取消用。
const RECORDING_ROOM_SPACE_ID = "4f-podcast-studio";
const RECORDING_ROOM_BOOKING_ENDPOINT =
  "https://colla-play-calendar.vercel.app/api/public/recording-bookings";

type ThanksParams = {
  status: "ok" | "error";
  ref?: string;
  reason?:
    | "bad_request"
    | "rate_limited"
    | "conflict"
    | "duplicate_reference"
    | "server_error"
    | "rejected";
};

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function redirectToThanks(request: NextRequest, params: ThanksParams) {
  const url = new URL("/rental-inquiry/thanks", request.url);
  url.searchParams.set("status", params.status);
  if (params.ref) url.searchParams.set("ref", params.ref);
  if (params.reason) url.searchParams.set("reason", params.reason);
  return NextResponse.redirect(url, { status: 303 });
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectToThanks(request, { status: "error", reason: "bad_request" });
  }

  // 蜜罐欄位：一般訪客看不到、只有機器人才會填
  if (String(form.get("website") ?? "").trim() !== "") {
    return redirectToThanks(request, { status: "error", reason: "rejected" });
  }

  const referenceNumber = String(form.get("referenceNumber") ?? "").trim();
  if (!REFERENCE_NUMBER_PATTERN.test(referenceNumber)) {
    console.error("[rental-inquiries][DEBUG] bad referenceNumber:", JSON.stringify(referenceNumber));
    return redirectToThanks(request, { status: "error", reason: "bad_request" });
  }

  const customerName = String(form.get("customerName") ?? "").trim();
  const customerPhone = String(form.get("customerPhone") ?? "").trim();
  const eventOrVenueUse = String(form.get("eventOrVenueUse") ?? "").trim();
  const eventTypeRaw = String(form.get("eventType") ?? "").trim();
  const eventType = eventTypeRaw || "其他";
  const spaceIdsRaw = String(form.get("spaceIds") ?? "").trim();
  const date = String(form.get("date") ?? "").trim();
  const endDateRaw = String(form.get("endDate") ?? "").trim();
  const startTime = String(form.get("startTime") ?? "").trim();
  const endTime = String(form.get("endTime") ?? "").trim();
  const quoteSummary = String(form.get("quoteSummary") ?? "").trim();
  const openToPublic = String(form.get("openToPublic") ?? "").trim();
  const openToPublicLink = String(form.get("openToPublicLink") ?? "").trim();
  const customerNote = String(form.get("customerNote") ?? "").trim();

  if (!customerName || !customerPhone || !eventOrVenueUse) {
    console.error("[rental-inquiries][DEBUG] missing required field:", JSON.stringify({ customerName, customerPhone, eventOrVenueUse }));
    return redirectToThanks(request, { status: "error", reason: "bad_request" });
  }
  if (!/^[\d\s\-]+$/.test(customerPhone)) {
    console.error("[rental-inquiries][DEBUG] bad customerPhone format:", JSON.stringify(customerPhone));
    return redirectToThanks(request, { status: "error", reason: "bad_request" });
  }

  const spaceIds = spaceIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (spaceIds.length < 1) {
    console.error("[rental-inquiries][DEBUG] no spaceIds from raw:", JSON.stringify(spaceIdsRaw));
    return redirectToThanks(request, { status: "error", reason: "bad_request" });
  }

  const endDate = endDateRaw || null;
  if (!date || !isValidRentalTimeWindow({ date, endDate, startTime, endTime })) {
    console.error("[rental-inquiries][DEBUG] bad time window:", JSON.stringify({ date, endDate, startTime, endTime }));
    return redirectToThanks(request, { status: "error", reason: "bad_request" });
  }

  // 同一 IP 一小時內最多送出 RATE_LIMIT_MAX_PER_IP 次
  const ip = getClientIp(request);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.webInquiryAttempt.count({
    where: { ip, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_PER_IP) {
    return redirectToThanks(request, { status: "error", reason: "rate_limited" });
  }
  await prisma.webInquiryAttempt.create({ data: { ip } });

  // 錄音室：先呼叫正式系統的寫回 API，真正佔住時段；失敗或衝突就整筆擋下，
  // 不在我們自己的資料庫留下紀錄（避免跟正式系統對不上）。
  const isRecordingRoomBooking = spaceIds.length === 1 && spaceIds[0] === RECORDING_ROOM_SPACE_ID;
  if (isRecordingRoomBooking) {
    const apiKey = process.env.RECORDING_BOOKING_API_KEY;
    if (!apiKey) {
      console.error("[rental-inquiries] missing RECORDING_BOOKING_API_KEY env var");
      return redirectToThanks(request, { status: "error", reason: "server_error" });
    }

    // 防止連點兩下／網路重送造成重複寫入正式系統：同一支電話、同一個時段，
    // 5 分鐘內已經成功建立過的話，直接視為同一筆，不再呼叫一次正式系統。
    const dedupeWindowStart = new Date(Date.now() - 5 * 60 * 1000);
    const duplicate = await prisma.project.findFirst({
      where: {
        customerPhone,
        status: { not: "cancelled" },
        createdAt: { gte: dedupeWindowStart },
        rentals: { some: { spaceIds: { has: RECORDING_ROOM_SPACE_ID }, date, startTime, endTime } },
      },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) {
      return redirectToThanks(request, {
        status: "ok",
        ref: duplicate.referenceNumber ?? referenceNumber,
      });
    }

    let realRes: Response;
    try {
      realRes = await fetch(RECORDING_ROOM_BOOKING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          customerName,
          customerPhone,
          date,
          startTime,
          endTime,
          notes: customerNote || undefined,
        }),
      });
    } catch (error) {
      console.error("[rental-inquiries] recording-bookings network error:", error);
      return redirectToThanks(request, { status: "error", reason: "server_error" });
    }
    if (realRes.status === 409) {
      return redirectToThanks(request, { status: "error", reason: "conflict" });
    }
    if (!realRes.ok) {
      const bodyText = await realRes.text().catch(() => "");
      console.error("[rental-inquiries] recording-bookings rejected:", realRes.status, bodyText);
      return redirectToThanks(request, { status: "error", reason: "server_error" });
    }
  }

  // 尚未有指派窗口的機制，先掛在第一位管理員名下，待人工重新指派
  const contacts = await getAdminContactOptions();
  const collaPlayContactId = contacts[0]?.id;
  if (!collaPlayContactId) {
    console.error("[rental-inquiries] no admin contact available to assign");
    return redirectToThanks(request, { status: "error", reason: "server_error" });
  }

  const noteLines = ["此筆由官網報價頁自動建立，尚待人工核實內容與指派窗口。"];
  if (quoteSummary) {
    noteLines.push(`客戶端試算金額（僅供參考，未經人工確認，勿直接採用）：${quoteSummary}`);
  }

  // 開放參加網址／客戶備註：官網報價頁填的內容，後台看得到的地方是「內部備註」，不是 projectNotes
  const internalNoteLines: string[] = [];
  if (openToPublic) {
    const linkPart =
      openToPublic === "是" && openToPublicLink
        ? `（報名網址：${openToPublicLink}）`
        : "";
    internalNoteLines.push(`活動是否開放 CollaPlay 客人參加：${openToPublic}${linkPart}`);
  }
  if (customerNote) {
    internalNoteLines.push(`客戶備註：${customerNote}`);
  }

  // 播映室／錄音室無須人工審核：送出後直接算確定，不卡在待處理專案
  const isSelfServeSpace = spaceIds.every((id) => SELF_SERVE_SPACE_IDS.includes(id));

  const input: CreateProjectInput = {
    customerName,
    customerPhone,
    eventOrVenueUse,
    // 免審核場域（錄音室／播映室）為系統自動建立，沒有人工填寫，活動類型與人數/桌椅
    // 一律填入後台慣用的預設值，避免後台編輯時卡在必填欄位。
    eventType: isSelfServeSpace ? "場租" : eventType,
    totalAttendees: isSelfServeSpace ? "0" : undefined,
    tables: isSelfServeSpace ? "0" : undefined,
    chairs: isSelfServeSpace ? "0" : undefined,
    collaPlayContactId,
    projectNotes: noteLines.join("\n"),
    internalNotes: internalNoteLines.length ? internalNoteLines.join("\n") : undefined,
    needsPrintedNotice: !isSelfServeSpace,
    referenceNumber,
    status: isSelfServeSpace ? "confirmed" : undefined,
    rentals: [
      {
        spaceIds,
        date,
        endDate,
        startTime,
        endTime,
        rentalAmount: 0,
        fnbAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
      },
    ],
  };

  try {
    const project = await createProject(input);
    revalidatePath("/dashboard/projects");
    revalidateTag(ADMIN_PROJECTS_LIST_CACHE_TAG, "max");
    revalidateTag(ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG, "max");
    return redirectToThanks(request, {
      status: "ok",
      ref: project.referenceNumber ?? referenceNumber,
    });
  } catch (error) {
    if (error instanceof ProjectRentalConflictError) {
      return redirectToThanks(request, { status: "error", reason: "conflict" });
    }
    if (isPrismaUniqueConstraintError(error)) {
      return redirectToThanks(request, { status: "error", reason: "duplicate_reference" });
    }
    console.error("[rental-inquiries] failed to create project:", error);
    return redirectToThanks(request, { status: "error", reason: "server_error" });
  }
}
