// POST /api/public/booking-lookup
// 公開端點：客人輸入電話號碼，查詢自己「未來日期」的錄音室預約記錄。
// 只回傳電話完全相符（去除空格／連字號後比對）的紀錄，不洩漏其他客人的資料。
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { effectiveEndDate } from "@/lib/utils/project-rental-interval";

const SPACE_ID = "4f-podcast-studio";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 20;

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
  }

  const rawPhone = typeof (body as { phone?: unknown })?.phone === "string" ? (body as { phone: string }).phone : "";
  const phone = normalizePhone(rawPhone);
  if (phone.length < 8) {
    return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.webInquiryAttempt.count({
    where: { ip, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_PER_IP) {
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }
  await prisma.webInquiryAttempt.create({ data: { ip } });

  const today = todayStr();

  const projects = await prisma.project.findMany({
    where: {
      status: { not: "cancelled" },
      rentals: {
        some: {
          spaceIds: { has: SPACE_ID },
        },
      },
    },
    select: {
      customerPhone: true,
      referenceNumber: true,
      rentals: {
        where: { spaceIds: { has: SPACE_ID } },
        select: { date: true, endDate: true, startTime: true, endTime: true },
      },
    },
  });

  const bookings = projects
    .filter((p) => normalizePhone(p.customerPhone) === phone)
    .flatMap((p) =>
      p.rentals
        .filter((r) => effectiveEndDate(r.date, r.endDate) >= today)
        .map((r) => ({
          date: r.date,
          endDate: effectiveEndDate(r.date, r.endDate),
          startTime: r.startTime,
          endTime: r.endTime,
          referenceNumber: p.referenceNumber,
        })),
    )
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));

  return NextResponse.json({ success: true, bookings });
}
