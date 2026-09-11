// 官網報價頁（Claude Artifact）表單送出後的著陸頁
// 因為報價頁所在平台不能背景呼叫 API，只能用 <form> 真的送出、離開頁面，
// 所以需要這個頁面接住送出後的結果（成功／失敗原因）。
import Link from "next/link";
import SectionContainer from "@/components/layout/section-container";

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

  const lineText = ok
    ? `我剛在官網送出場地預約，編號：${ref}，麻煩協助確認訂金與細節。`
    : "我在官網送出場地預約時遇到問題，麻煩協助處理。";
  const lineUrl = `https://line.me/R/oaMessage/%40collaplay/?${encodeURIComponent(lineText)}`;

  return (
    <SectionContainer>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {ok ? (
          <>
            <p className="text-sm font-medium text-muted-foreground">預約已收到</p>
            <h1 className="mt-2 text-2xl font-semibold">您的預約編號</h1>
            <p className="mt-3 rounded-lg bg-muted px-4 py-2 font-mono text-lg tracking-wide">
              {ref}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              目前狀態為「洽談中」，請點下方按鈕把編號傳給官方 LINE，我們會協助確認訂金與細節。
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">無法送出預約</p>
            <h1 className="mt-2 text-2xl font-semibold">請透過官方 LINE 聯絡我們</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              {ERROR_MESSAGES[reason ?? ""] ?? ERROR_MESSAGES.server_error}
            </p>
          </>
        )}
        <a
          href={lineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-full bg-[#06C755] px-6 py-3 font-semibold text-white"
        >
          {ok ? "傳送編號給官方 LINE" : "聯絡官方 LINE"}
        </a>
        <div className="mt-6 text-sm">
          <Link href="/" className="text-muted-foreground underline underline-offset-4">
            回到首頁
          </Link>
        </div>
      </div>
    </SectionContainer>
  );
}
