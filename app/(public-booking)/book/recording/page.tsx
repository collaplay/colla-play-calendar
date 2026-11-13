"use client";

// 錄音室預約頁（真實網頁，非 Claude Artifact）
// Claude Artifact 公開連結本身受 claude.ai 的安全政策限制，無法對外送表單／抓資料，
// 所以錄音室預約改成這個專案自己的頁面，直接跟 /api/public/rental-inquiries、
// /api/public/recording-availability 同源溝通，不會再遇到「被封鎖」的問題。

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

const SPACE_ID = "4f-podcast-studio";
const OPEN_HOUR = 10;
const CLOSE_HOUR = 22;
// liuchiawei 提供的正式系統唯讀檔期 API（含場佈／場撤緩衝時間），不需要帳密
const REAL_AVAILABILITY_ENDPOINT =
  "https://colla-play-calendar.vercel.app/api/public/recording-availability";
const REAL_AVAILABILITY_QUERY_DAYS = 90;

type RealBooking = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  setupMinutesBefore: number;
  teardownMinutesAfter: number;
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期+時間 → 以「日序 × 1440 + 當天分鐘數」表示的絕對分鐘數，方便跨日運算 */
function toAbsoluteMinutes(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return dayIndex * 1440 + hh * 60 + mm;
}

/** 絕對分鐘數 → 所屬日期字串 + 當天分鐘數 */
function fromAbsoluteMinutes(abs: number): { date: string; minuteOfDay: number } {
  const dayIndex = Math.floor(abs / 1440);
  const minuteOfDay = abs - dayIndex * 1440;
  const dt = new Date(dayIndex * 86400000);
  return {
    date: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
    minuteOfDay,
  };
}

/** 把一筆（含場佈／場撤緩衝、可能跨日的）預約，展開成逐日的忙碌分鐘區間 */
function expandRealBooking(b: RealBooking): Array<{ date: string; start: number; end: number }> {
  let startAbs = toAbsoluteMinutes(b.date, b.startTime) - (b.setupMinutesBefore || 0);
  const endAbs = toAbsoluteMinutes(b.endDate, b.endTime) + (b.teardownMinutesAfter || 0);
  const segments: Array<{ date: string; start: number; end: number }> = [];
  while (startAbs < endAbs) {
    const { date, minuteOfDay } = fromAbsoluteMinutes(startAbs);
    const dayStartAbs = startAbs - minuteOfDay;
    const dayEndAbs = Math.min(endAbs, dayStartAbs + 1440);
    segments.push({ date, start: minuteOfDay, end: minuteOfDay + (dayEndAbs - startAbs) });
    startAbs = dayEndAbs;
  }
  return segments;
}

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

/** 一整條時段列：營業時間內忙碌區段顯示為紅色，游標移上去顯示確切時間 */
function DayTimeline({ busy }: { busy: [number, number][] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const rangeStart = OPEN_HOUR * 60;
  const rangeEnd = CLOSE_HOUR * 60;
  const totalMin = rangeEnd - rangeStart;
  const pct = (m: number) => ((m - rangeStart) / totalMin) * 100;

  const ticks: number[] = [];
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h += 3) ticks.push(h);

  return (
    <div className="mt-2">
      <div className="relative h-10 rounded-lg border border-[#D8D3BF] bg-white">
        {ticks.map((h) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 w-px bg-[#D8D3BF]"
            style={{ left: `${pct(h * 60)}%` }}
          />
        ))}
        {busy.map(([s, e], i) => {
          const left = Math.max(0, pct(s));
          const width = Math.min(100, pct(e)) - left;
          if (width <= 0) return null;
          return (
            <button
              key={i}
              type="button"
              title={`${minToTime(s)}–${minToTime(e)}`}
              onClick={() => setActiveIndex((cur) => (cur === i ? null : i))}
              className="absolute top-0 bottom-0 cursor-pointer border-x border-[#B65545] bg-[#F3DAD4]"
              style={{ left: `${left}%`, width: `${width}%` }}
              aria-label={`忙碌時段 ${minToTime(s)} 到 ${minToTime(e)}`}
            />
          );
        })}
      </div>
      <div className="relative mt-1 h-4 text-xs text-[#5B6961]">
        {ticks.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${pct(h * 60)}%` }}
          >
            {pad(h % 24)}:00
          </span>
        ))}
      </div>
      {activeIndex !== null && busy[activeIndex] ? (
        <p className="mt-2 inline-block rounded-md bg-[#F3DAD4] px-2 py-1 text-sm font-semibold text-[#B65545]">
          已選時段：{minToTime(busy[activeIndex][0])}–{minToTime(busy[activeIndex][1])}
        </p>
      ) : null}
      {busy.length === 0 ? (
        <p className="mt-1 text-[#5B6961]">目前這天沒有已排定的時段。</p>
      ) : null}
    </div>
  );
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + REAL_AVAILABILITY_QUERY_DAYS);

    fetch(`${REAL_AVAILABILITY_ENDPOINT}?from=${ymd(today)}&to=${ymd(to)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.success || !Array.isArray(data.data)) return;
        const merged: Record<string, [number, number][]> = {};
        for (const booking of data.data as RealBooking[]) {
          for (const seg of expandRealBooking(booking)) {
            (merged[seg.date] ??= []).push([seg.start, seg.end]);
          }
        }
        setBusy(merged);
        setBusyAsOf(new Date().toISOString());
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

        <div className="mt-6 rounded-xl border border-dashed border-[#D8D3BF] bg-[#F8F7EF] p-5 text-sm text-[#5B6961]">
          <p>
            本系統僅供錄音室租借，其他場租需求請洽官方Line @Collaplay.venue
          </p>
          <p className="mt-2">
            <a
              className="text-[#BB7F36] underline"
              href="https://collaplay.com/rental/"
              target="_blank"
              rel="noopener noreferrer"
            >
              詳細場地資訊、圖片請參考 collaplay.com/rental
            </a>
          </p>
        </div>

        <p className="mt-3 text-sm">
          <a
            className="inline-flex items-center gap-1.5 text-[#BB7F36] underline"
            href="/book/recording/lookup"
          >
            <Search className="size-4" />
            查詢我未來的預約紀錄
          </a>
        </p>

        <form
          method="POST"
          action="/api/public/rental-inquiries"
          onSubmit={() => setSubmitting(true)}
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
              日期 <span className="text-[#B65545]">*</span>
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
              開始時間 <span className="text-[#B65545]">*</span>
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
              結束時間 <span className="text-[#B65545]">*</span>
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
              <DayTimeline key={date} busy={dayBusy} />
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
              disabled={!canSubmit || submitting}
              className="rounded-lg bg-[#EA9F44] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#D8D3BF] disabled:text-[#5B6961]"
            >
              {submitting ? "送出中…" : "送出預約"}
            </button>
          </div>
        </form>

        <div className="mt-8 border-t border-[#D8D3BF] pt-6 text-sm">
          <p className="mb-2 text-[#5B6961]">
            超時／未滿30分鐘一律以完整 30 分鐘計費。
          </p>
          <a
            href="https://line.me/R/ti/p/@collaplay.venue"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#BB7F36] underline"
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
