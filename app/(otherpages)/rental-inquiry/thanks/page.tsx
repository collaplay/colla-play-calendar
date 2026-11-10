// 官網報價頁（Claude Artifact）表單送出後的著陸頁
// 因為報價頁所在平台不能背景呼叫 API，只能用 <form> 真的送出、離開頁面，
// 所以需要這個頁面接住送出後的結果（成功／失敗原因）。
import Link from "next/link";
import SectionContainer from "@/components/layout/section-container";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type NextSearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams?: Promise<NextSearchParams>;
}

const ERROR_MESSAGES: Record<string, string> = {
  bad_request: "送出的內容不完整或格式有誤，麻煩回到報價頁重新操作一次。",
  rate_limited: "短時間內送出太多次，請稍後再試，或直接透過官方 LINE 聯絡我們。",
  conflict: "所選時段可能剛被其他人預訂，請回到報價頁重新選擇時段。",
  duplicate_reference: "這筆預約似乎已經送出過了，請直接透過官方 LINE 確認進度。",
  server_error: "系統暫時發生問題，請直接透過官方 LINE 聯絡我們，我們會盡快處理。",
  rejected: "這筆請求無法處理，請直接透過官方 LINE 聯絡我們。",
};

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RentalInquiryThanksPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : undefined;
  const status = firstValue(sp?.status);
  const ref = firstValue(sp?.ref);
  const reason = firstValue(sp?.reason);
  const ok = status === "ok" && !!ref;

  const booking = ok
    ? await prisma.project.findUnique({
        where: { referenceNumber: ref },
        select: {
          customerName: true,
          customerPhone: true,
          rentals: {
            select: { date: true, startTime: true, endTime: true },
            take: 1,
          },
        },
      })
    : null;
  const rental = booking?.rentals[0];

  const lineText = "我在官網送出場地預約時遇到問題，麻煩協助處理。";
  const lineUrl = `https://line.me/R/oaMessage/%40collaplay.venue/?${encodeURIComponent(lineText)}`;

  return (
    <SectionContainer>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {ok ? (
          <>
            <h1 className="text-2xl font-semibold">預約成功！</h1>
            <p className="mt-4 text-sm font-medium text-muted-foreground">您的預約資料</p>
            <div className="mt-2 space-y-1 text-left text-sm">
              <p>姓名：{booking?.customerName}</p>
              <p>電話：{booking?.customerPhone}</p>
              <p>
                預約時段：
                {rental ? `${rental.date} ${rental.startTime}–${rental.endTime}` : "—"}
              </p>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              請當日準時抵達，於3F咖啡廳櫃台告知預約資料，
              <br />
              無須支付訂金，請直接於當日支付全額款項，
              <br />
              感謝您：）！
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">無法送出預約</p>
            <h1 className="mt-2 text-2xl font-semibold">請透過官方 LINE 聯絡我們</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              {ERROR_MESSAGES[reason ?? ""] ?? ERROR_MESSAGES.server_error}
            </p>
            <a
              href={lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-full bg-[#06C755] px-6 py-3 font-semibold text-white"
            >
              聯絡官方 LINE
            </a>
          </>
        )}
        <div className="mt-6 text-sm">
          <Link href="/" className="text-muted-foreground underline underline-offset-4">
            回到首頁
          </Link>
        </div>
      </div>
    </SectionContainer>
  );
}
