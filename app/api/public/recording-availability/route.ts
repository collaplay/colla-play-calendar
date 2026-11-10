// GET /api/public/recording-availability
// 公開唯讀端點：給官網報價頁（Claude Artifact）即時查詢錄音室（或其他指定場域）目前已佔用的時段，
// 讓報價頁顯示跟後台一致的真實忙碌時段。不含客戶個資，只回傳時段區間。
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const spaceId = request.nextUrl.searchParams.get("spaceId");
  if (!spaceId) {
    return NextResponse.json(
      { error: "缺少 spaceId" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const rentals = await prisma.projectRental.findMany({
    where: {
      spaceIds: { has: spaceId },
      project: { status: { not: "cancelled" } },
    },
    select: { date: true, startTime: true, endTime: true },
  });

  const busy: Record<string, [number, number][]> = {};
  for (const r of rentals) {
    const start = timeToMin(r.startTime);
    const end = timeToMin(r.endTime);
    if (!busy[r.date]) busy[r.date] = [];
    busy[r.date].push([start, end]);
  }

  return NextResponse.json(
    { asOf: new Date().toISOString(), busy },
    { headers: CORS_HEADERS },
  );
}
