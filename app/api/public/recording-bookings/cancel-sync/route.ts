// POST /api/public/recording-bookings/cancel-sync
// liuchiawei 的正式系統在取消／刪除一筆錄音室預約時呼叫這支，
// 把我們自己留的那份副本也標成取消，客人查詢記錄時才看得到最新狀態。
// 因為寫入當下沒有共用的訂單 ID，比對方式是「電話＋日期＋起訖時間」。
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import {
  ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG,
  ADMIN_PROJECTS_LIST_CACHE_TAG,
} from "@/lib/services/project/project.service";

const RECORDING_ROOM_SPACE_ID = "4f-podcast-studio";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.RECORDING_BOOKING_API_KEY;
  if (!apiKey || request.headers.get("x-api-key") !== apiKey) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
  }

  const get = (key: string) => {
    const v = (body as Record<string, unknown>)?.[key];
    return typeof v === "string" ? v : "";
  };
  const customerPhone = normalizePhone(get("customerPhone"));
  const date = get("date").trim();
  const startTime = get("startTime").trim();
  const endTime = get("endTime").trim();
  if (!customerPhone || !date || !startTime || !endTime) {
    return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
  }

  const projects = await prisma.project.findMany({
    where: {
      status: { not: "cancelled" },
      rentals: { some: { spaceIds: { has: RECORDING_ROOM_SPACE_ID }, date, startTime, endTime } },
    },
    select: { id: true, customerPhone: true },
  });
  const match = projects.find((p) => normalizePhone(p.customerPhone) === customerPhone);

  if (!match) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }

  await prisma.project.update({ where: { id: match.id }, data: { status: "cancelled" } });

  revalidatePath("/dashboard/projects");
  revalidateTag(ADMIN_PROJECTS_LIST_CACHE_TAG, "max");
  revalidateTag(ADMIN_PROJECTS_ANY_WINDOW_CACHE_TAG, "max");

  return NextResponse.json({ success: true });
}
