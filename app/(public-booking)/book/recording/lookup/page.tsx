"use client";

// 預約記錄查詢頁：客人輸入電話號碼，查詢自己未來日期的錄音室預約。
// 只比對電話完全相符的紀錄，不會顯示其他人的預約內容。

import { useState } from "react";

type Booking = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  referenceNumber: string | null;
};

type SearchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "found"; bookings: Booking[] }
  | { phase: "not_found" }
  | { phase: "error" };

function fmtDate(d: string, end: string): string {
  return d === end ? d : `${d} – ${end}`;
}

export default function BookingLookupPage() {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });
  const [confirmingRef, setConfirmingRef] = useState<string | null>(null);
  const [cancelingRef, setCancelingRef] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel(referenceNumber: string) {
    setCancelingRef(referenceNumber);
    setCancelError(null);
    try {
      const res = await fetch("/api/public/booking-lookup/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, referenceNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setCancelError("取消失敗，請稍後再試或洽詢Line官方");
        setCancelingRef(null);
        return;
      }
      setState((cur) =>
        cur.phase === "found"
          ? { phase: "found", bookings: cur.bookings.filter((b) => b.referenceNumber !== referenceNumber) }
          : cur,
      );
      setConfirmingRef(null);
      setCancelingRef(null);
    } catch {
      setCancelError("取消失敗，請稍後再試或洽詢Line官方");
      setCancelingRef(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ phase: "loading" });
    setConfirmingRef(null);
    setCancelError(null);
    try {
      const res = await fetch("/api/public/booking-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        setState({ phase: "error" });
        return;
      }
      const data = await res.json();
      if (!data?.success) {
        setState({ phase: "error" });
        return;
      }
      const bookings: Booking[] = data.bookings ?? [];
      setState(bookings.length > 0 ? { phase: "found", bookings } : { phase: "not_found" });
    } catch {
      setState({ phase: "error" });
    }
  }

  return (
    <main className="min-h-screen bg-[#EEEDE2] text-[#23302B]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#BB7F36]">
          CollaPlay ・ 錄音室租借
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium">預約記錄查詢</h1>
        <p className="mt-2 text-sm text-[#5B6961]">
          輸入您預約時填寫的電話號碼，查詢未來日期的錄音室預約記錄（已過期的時段不會顯示）。
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-[#D8D3BF] bg-[#F8F7EF] p-6 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            電話號碼 <span className="text-[#B65545]">*</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
              required
            />
          </label>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={!phone.trim() || state.phase === "loading"}
              className="rounded-lg bg-[#EA9F44] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#D8D3BF] disabled:text-[#5B6961]"
            >
              {state.phase === "loading" ? "查詢中…" : "查詢"}
            </button>
          </div>
        </form>

        {state.phase === "found" ? (
          <div className="mt-6 rounded-2xl border border-[#D8D3BF] bg-[#F8F7EF] p-6">
            <h2 className="font-serif text-xl font-medium">查詢結果</h2>
            {cancelError ? (
              <p className="mt-2 text-sm text-[#B65545]">{cancelError}</p>
            ) : null}
            {state.bookings.length === 0 ? (
              <p className="mt-2 text-sm text-[#5B6961]">目前已無未來預約記錄。</p>
            ) : null}
            <ul className="mt-4 flex flex-col gap-3">
              {state.bookings.map((b, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-[#D8D3BF] bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {fmtDate(b.date, b.endDate)}　{b.startTime}–{b.endTime}
                      </p>
                      {b.referenceNumber ? (
                        <p className="mt-1 text-[#5B6961]">預約編號：{b.referenceNumber}</p>
                      ) : null}
                    </div>
                    {b.referenceNumber && confirmingRef !== b.referenceNumber ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingRef(b.referenceNumber)}
                        className="rounded-md border border-[#B65545] px-3 py-1.5 text-xs font-semibold text-[#B65545]"
                      >
                        取消預約
                      </button>
                    ) : null}
                  </div>
                  {b.referenceNumber && confirmingRef === b.referenceNumber ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-[#F3DAD4] p-2 text-xs text-[#B65545]">
                      <span>確定要取消這筆預約嗎？取消後無法復原。</span>
                      <button
                        type="button"
                        disabled={cancelingRef === b.referenceNumber}
                        onClick={() => handleCancel(b.referenceNumber!)}
                        className="rounded-md bg-[#B65545] px-3 py-1 font-semibold text-white disabled:opacity-60"
                      >
                        {cancelingRef === b.referenceNumber ? "取消中…" : "確定取消"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingRef(null)}
                        className="rounded-md border border-[#B65545] px-3 py-1 font-semibold"
                      >
                        不取消
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.phase === "not_found" ? (
          <div className="mt-6 rounded-xl border border-[#B65545] bg-[#F3DAD4] p-4 text-sm text-[#B65545]">
            查詢不到此紀錄，請確認是否預約成功或洽詢Line官方
          </div>
        ) : null}

        {state.phase === "error" ? (
          <div className="mt-6 rounded-xl border border-[#B65545] bg-[#F3DAD4] p-4 text-sm text-[#B65545]">
            查詢失敗，請稍後再試或洽詢Line官方
          </div>
        ) : null}

        <div className="mt-8 border-t border-[#D8D3BF] pt-6 text-sm">
          <a href="/book/recording" className="font-semibold text-[#BB7F36] underline">
            返回錄音室預約頁
          </a>
          <br />
          <a
            href="https://line.me/R/ti/p/@collaplay.venue"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-semibold text-[#BB7F36] underline"
          >
            其他場租需求請洽官方Line
          </a>
        </div>

        <footer className="mt-10 text-center text-xs text-[#5B6961]">
          CollaPlay・台北市萬華區武昌街二段 83-6 號 ｜ 電話:(02)-6627-0836
        </footer>
      </div>
    </main>
  );
}
