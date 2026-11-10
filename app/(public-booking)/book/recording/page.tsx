"use client";

// 錄音室預約頁（真實網頁，非 Claude Artifact）
// Claude Artifact 公開連結本身受 claude.ai 的安全政策限制，無法對外送表單／抓資料，
// 所以錄音室預約改成這個專案自己的頁面，直接跟 /api/public/rental-inquiries、
// /api/public/recording-availability 同源溝通，不會再遇到「被封鎖」的問題。

import { useEffect, useMemo, useState } from "react";

const SPACE_ID = "4f-podcast-studio";
const OPEN_HOUR = 10;
const CLOSE_HOUR = 22;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(m: number): string {
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}
function roundHalf(hours: number): number {
  return Math.ceil(hours * 2) / 2;
}
function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("zh-Hant")}`;
}
function genRef(dateStr: string): string {
  const d = dateStr
    ? dateStr.replace(/-/g, "")
    : new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CP-${d}-${rand}`;
}

const TIME_OPTIONS: string[] = [];
for (let m = OPEN_HOUR * 60; m <= CLOSE_HOUR * 60; m += 15) {
  TIME_OPTIONS.push(minToTime(m % 1440));
}

type Quote =
  | { ready: false; blocked?: false }
  | { ready: false; blocked: true; reason: string }
  | { ready: true; blocked?: false; durHr: number; total: number; label: string };

function computeQuote(date: string, startTime: string, endTime: string): Quote {
  if (!date || !startTime || !endTime) return { ready: false };
  const sMin = timeToMin(startTime);
  const eMin = timeToMin(endTime);
  if (eMin <= sMin) return { ready: false };
  const durHr = roundHalf((eMin - sMin) / 60);
  if (durHr < 1) {
    return { ready: false, blocked: true, reason: "未滿一小時無法預約，請至少選擇 1 小時。" };
  }
  const total = durHr * 2 * 300;
  return {
    ready: true,
    durHr,
    total,
    label: `Podcast 錄音室租借（${durHr} 小時 × $300／半小時，1 小時起租）`,
  };
}

export default function BookRecordingPage() {
  const [busy, setBusy] = useState<Record<string, [number, number][]>>({});
  const [busyAsOf, setBusyAsOf] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot，一般訪客看不到

  useEffect(() => {
    fetch(`/api/public/recording-availability?spaceId=${SPACE_ID}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.busy) return;
        setBusy(data.busy);
        setBusyAsOf(data.asOf);
      })
      .catch(() => {});
  }, []);

  const dayBusy = date ? busy[date] ?? [] : [];
  const hasTime = !!startTime && !!endTime && timeToMin(endTime) > timeToMin(startTime);
  const conflict =
    hasTime &&
    dayBusy.some(([s, e]) => timeToMin(startTime) < e && timeToMin(endTime) > s);
  const quote = computeQuote(date, startTime, endTime);
  const contactReady = !!name.trim() && !!phone.trim();
  const canSubmit =
    hasTime && !conflict && quote.ready && contactReady && !quote.blocked;

  const referenceNumber = useMemo(() => genRef(date), [date]);
  const quoteSummary = quote.ready ? fmtMoney(quote.total) : "";

  return (
    <main className="min-h-screen bg-[#EEEDE2] text-[#23302B]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#BB7F36]">
          CollaPlay ・ 錄音室租借
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium">確認時間，預約錄音——</h1>

        <div className="mt-6 rounded-xl border border-dashed border-[#D8D3BF] bg-[#F8F7EF] p-4 text-sm text-[#5B6961]">
          <b className="text-[#23302B]">注意事項：</b>
          本系統僅供錄音室租借，如須其他場租需求，請洽官方Line
        </div>

        <p className="mt-3 text-sm">
          <a
            className="text-[#BB7F36] underline"
            href="https://collaplay.com/rental/"
            target="_blank"
            rel="noopener noreferrer"
          >
            詳細場地資訊、圖片請參考 collaplay.com/rental
          </a>
        </p>

        <form
          method="POST"
          action="/api/public/rental-inquiries"
          className="mt-6 rounded-2xl border border-[#D8D3BF] bg-[#F8F7EF] p-6 shadow-sm"
        >
          <h2 className="font-serif text-xl font-medium">選擇場地與時段</h2>
          <p className="mt-1 text-sm text-[#5B6961]">
            先選日期查看目前檔期
            {busyAsOf ? `（資料即時同步）` : ""}
            ，再選起訖時間。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              日期
              <input
                type="date"
                name="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              開始時間
              <select
                name="startTime"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
                required
              >
                <option value="">請選擇</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              結束時間
              <select
                name="endTime"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
                required
              >
                <option value="">請選擇</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {date ? (
            <div className="mt-4 text-sm">
              <p className="font-semibold">已排定忙碌時段（{date}）</p>
              {dayBusy.length === 0 ? (
                <p className="mt-1 text-[#5B6961]">目前這天沒有已排定的時段。</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[#B65545]">
                  {dayBusy.map(([s, e], i) => (
                    <li key={i}>
                      {minToTime(s)}–{minToTime(e)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {conflict ? (
            <div className="mt-4 rounded-lg border border-[#B65545] bg-[#F3DAD4] p-3 text-sm text-[#B65545]">
              <b>時段衝突：</b>所選時間與目前已排定的檔期重疊，請調整起訖時間。
            </div>
          ) : null}
          {quote.blocked ? (
            <div className="mt-4 rounded-lg border border-[#B65545] bg-[#F3DAD4] p-3 text-sm text-[#B65545]">
              <b>無法預約：</b>
              {quote.reason}
            </div>
          ) : null}
          {quote.ready ? (
            <div className="mt-4 rounded-lg bg-[#DCEEE9] p-3 text-sm">
              {quote.label}　<b>{fmtMoney(quote.total)}</b>
              <br />
              <span className="text-[#5B6961]">無須訂金，場地僅保留 10 分鐘</span>
            </div>
          ) : null}

          <div className="mt-6 border-t border-dashed border-[#D8D3BF] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5B6961]">
              聯絡資訊
            </p>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                姓名 <span className="text-[#B65545]">*</span>
                <input
                  type="text"
                  name="customerName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                電話 <span className="text-[#B65545]">*</span>
                <input
                  type="tel"
                  name="customerPhone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
                  required
                />
              </label>
            </div>
            <label className="mt-4 flex flex-col gap-1 text-sm font-semibold">
              備註
              <textarea
                name="customerNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="rounded-md border border-[#D8D3BF] bg-white px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>

          {/* 隱藏欄位：後端寫入用 */}
          <input type="hidden" name="referenceNumber" value={referenceNumber} />
          <input type="hidden" name="eventOrVenueUse" value="錄音室租借" />
          <input type="hidden" name="eventType" value="錄音室租借" />
          <input type="hidden" name="spaceIds" value={SPACE_ID} />
          <input type="hidden" name="endDate" value="" />
          <input type="hidden" name="quoteSummary" value={quoteSummary} />
          {/* 蜜罐欄位：一般訪客看不到，機器人才會填 */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-[#EA9F44] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#D8D3BF] disabled:text-[#5B6961]"
            >
              送出預約
            </button>
          </div>
        </form>

        <div className="mt-8 border-t border-[#D8D3BF] pt-6 text-sm">
          <p className="mb-2 text-[#5B6961]">
            超時／未滿30分鐘一律以完整 30 分鐘計費。
            <br />
            其他場租需求請洽官方Line
          </p>
          <a
            href="https://line.me/R/ti/p/@collaplay.venue"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#BB7F36] underline"
          >
            大型需求請直接洽官方Line
          </a>
        </div>

        <footer className="mt-10 text-center text-xs text-[#5B6961]">
          CollaPlay・台北市萬華區武昌街二段 83-6 號 — 本頁報價為系統試算，實際金額與檔期以官方
          LINE 人工確認為準
        </footer>
      </div>
    </main>
  );
}
