// POST /api/public/booking-lookup/cancel
// 公開端點：客人憑「電話號碼 + 預約編號」取消自己的錄音室預約。
// 電話需與該筆預約的聯絡電話完全相符（去除空格／連字號後比對），
// 否則一律視為找不到，不透露任何其他資訊，避免被用來亂猜編號或電話。
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import {
  ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG,
  ADMIN_PROJECTS_LIST_CACHE_TAG,
} from "@/lib/services/project/project.service";
import { effectiveEndDate } from "@/lib/utils/project-rental-interval";

const SPACE_ID = "4f-podcast-studio";
const REFERENCE_NUMBER_PATTERN = /^CP-\d{8}-\d{4}$/;
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
  const referenceNumber =
    typeof (body as { referenceNumber?: unknown })?.referenceNumber === "string"
      ? (body as { referenceNumber: string }).referenceNumber.trim()
      : "";
  const phone = normalizePhone(rawPhone);
  if (phone.length < 8 || !REFERENCE_NUMBER_PATTERN.test(referenceNumber)) {
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

  const project = await prisma.project.findUnique({
    where: { referenceNumber },
    select: {
      id: true,
      status: true,
      customerPhone: true,
      rentals: {
        where: { spaceIds: { has: SPACE_ID } },
        select: { date: true, endDate: true },
      },
    },
  });

  const today = todayStr();
  const notFound =
    !project ||
    normalizePhone(project.customerPhone) !== phone ||
    project.status === "cancelled" ||
    project.rentals.length === 0 ||
    !project.rentals.some((r) => effectiveEndDate(r.date, r.endDate) >= today);

  if (notFound) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }

  await prisma.project.update({
    where: { id: project!.id },
    data: { status: "cancelled" },
  });

  revalidatePath("/dashboard/projects");
  revalidateTag(ADMIN_PROJECTS_LIST_CACHE_TAG, "max");
  revalidateTag(ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG, "max");

  return NextResponse.json({ success: true });
}
