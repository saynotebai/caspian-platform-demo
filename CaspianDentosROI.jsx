/**
 * CaspianDentos · Калькулятор окупаемости инвестиций (ROI)
 * ─────────────────────────────────────────────────────────
 * Изолированный модуль для Dental OS.
 *
 * Зависимости:
 *   react, react-dom, framer-motion, tailwindcss
 *
 * Встраивание:
 *   import { CaspianDentosROI } from "./CaspianDentosROI";
 *   <CaspianDentosROI /> // или с пропсами ниже
 *
 * Пропсы (все опциональны):
 *   currency       — символ валюты (по умолчанию "₸")
 *   locale         — локаль форматирования (по умолчанию "ru-RU")
 *   defaultCheck   — начальный средний чек
 *   defaultPackage — начальная сумма пакета / инвестиций
 *   defaultPerMonth— начальное кол-во процедур в месяц
 *   onChange       — колбэк ({ months, monthlyRevenue, ... }) при каждом пересчёте
 *   className      — доп. классы внешнего контейнера
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useSpring, AnimatePresence } from "framer-motion";

/* ── Форматтеры ─────────────────────────────────────────── */
const onlyDigits = (s) => String(s).replace(/[^\d]/g, "");

function useFormatter(locale) {
  return useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale]
  );
}

/* ── Анимированное число (плавный спринг) ───────────────── */
function AnimatedNumber({ value, decimals = 0, locale = "ru-RU" }) {
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.7 });
  const [shown, setShown] = useState(value);

  useEffect(() => {
    spring.set(Number.isFinite(value) ? value : 0);
  }, [spring, value]);

  useEffect(() => spring.on("change", (v) => setShown(v)), [spring]);

  const text = Number.isFinite(value)
    ? new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(shown)
    : "∞";

  return <span className="tabular-nums">{text}</span>;
}

/* ── Поле ввода с «валютной маской» ─────────────────────── */
function CurrencyField({ id, label, hint, value, onChange, currency, fmt }) {
  const display = value > 0 ? fmt.format(value) : "";
  return (
    <label htmlFor={id} className="block group">
      <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={display}
          onChange={(e) => onChange(Number(onlyDigits(e.target.value)))}
          className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3.5 pr-12
                     text-[17px] font-semibold text-slate-900 shadow-sm
                     transition-all placeholder:text-slate-300
                     focus:border-cyan-400 focus:bg-white focus:outline-none
                     focus:ring-4 focus:ring-cyan-500/10"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-slate-400">
          {currency}
        </span>
      </div>
      {hint && <span className="mt-1.5 block text-[12px] text-slate-400">{hint}</span>}
    </label>
  );
}

/* ── Главный компонент ──────────────────────────────────── */
export function CaspianDentosROI({
  currency = "₸",
  locale = "ru-RU",
  defaultCheck = 85000,
  defaultPackage = 2400000,
  defaultPerMonth = 12,
  onChange,
  className = "",
}) {
  const fmt = useFormatter(locale);
  const [avgCheck, setAvgCheck] = useState(defaultCheck);
  const [pkg, setPkg] = useState(defaultPackage);
  const [perMonth, setPerMonth] = useState(defaultPerMonth);

  const monthlyRevenue = avgCheck * perMonth;
  const months = monthlyRevenue > 0 ? pkg / monthlyRevenue : Infinity;
  const ready = avgCheck > 0 && pkg > 0;

  const years = Math.floor(months / 12);
  const restMonths = months - years * 12;

  useEffect(() => {
    onChange?.({ avgCheck, pkg, perMonth, monthlyRevenue, months });
  }, [avgCheck, pkg, perMonth, monthlyRevenue, months, onChange]);

  const verdict = !ready
    ? null
    : months <= 6
    ? { tone: "emerald", text: "Стремительная окупаемость" }
    : months <= 12
    ? { tone: "cyan", text: "Здоровая динамика" }
    : months <= 24
    ? { tone: "amber", text: "Умеренный горизонт" }
    : { tone: "slate", text: "Долгий горизонт" };

  const toneMap = {
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-500/20",
    cyan: "bg-cyan-50 text-cyan-600 ring-cyan-500/20",
    amber: "bg-amber-50 text-amber-600 ring-amber-500/20",
    slate: "bg-slate-100 text-slate-500 ring-slate-400/20",
  };

  const sliderPct = ((perMonth - 1) / (100 - 1)) * 100;

  return (
    <div
      className={
        "w-full max-w-md rounded-[28px] border border-slate-200/70 bg-white/90 " +
        "p-6 shadow-[0_1px_3px_rgba(15,23,42,.04),0_30px_60px_-30px_rgba(15,23,42,.18)] " +
        "backdrop-blur sm:p-8 " +
        className
      }
    >
      {/* Header */}
      <div className="mb-7 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/25">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="m7 14 4-4 3 3 5-6" />
          </svg>
        </div>
        <div>
          <h2 className="text-[17px] font-bold leading-tight text-slate-900">
            Окупаемость инвестиций
          </h2>
          <p className="text-[12px] text-slate-400">Расчёт на лету · без формул вручную</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-5">
        <CurrencyField
          id="cdt-check"
          label="Средний чек в клинике"
          value={avgCheck}
          onChange={setAvgCheck}
          currency={currency}
          fmt={fmt}
        />
        <CurrencyField
          id="cdt-package"
          label="Сумма пакета / инвестиции"
          value={pkg}
          onChange={setPkg}
          currency={currency}
          fmt={fmt}
        />

        {/* Slider */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Процедур в месяц
            </span>
            <span className="text-[15px] font-bold tabular-nums text-cyan-600">
              {perMonth}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={perMonth}
            onChange={(e) => setPerMonth(Number(e.target.value))}
            className="cdt-slider w-full"
            style={{
              background: `linear-gradient(to right, #06b6d4 ${sliderPct}%, #e2e8f0 ${sliderPct}%)`,
            }}
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-300">
            <span>1</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="mt-7 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/50">
            Срок окупаемости
          </span>
          <AnimatePresence>
            {verdict && (
              <motion.span
                key={verdict.text}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 " +
                  toneMap[verdict.tone]
                }
              >
                {verdict.text}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3 flex items-end gap-2">
          {ready ? (
            <>
              <span className="text-[56px] font-extrabold leading-none tracking-tight">
                <AnimatedNumber value={months} decimals={1} locale={locale} />
              </span>
              <span className="mb-2 text-[18px] font-medium text-white/60">мес.</span>
            </>
          ) : (
            <span className="py-3 text-[18px] font-medium text-white/40">
              Заполните поля выше
            </span>
          )}
        </div>

        {ready && Number.isFinite(months) && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-[13px]">
            <div>
              <div className="text-white/40">≈ в годах</div>
              <div className="font-semibold tabular-nums">
                {years > 0 ? `${years} г ` : ""}
                {Math.round(restMonths)} мес.
              </div>
            </div>
            <div>
              <div className="text-white/40">Выручка / мес.</div>
              <div className="font-semibold tabular-nums">
                <AnimatedNumber value={monthlyRevenue} decimals={0} locale={locale} />{" "}
                {currency}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
        Формула: сумма пакета ÷ (средний чек × процедуры в месяц).
        <br />
        Оценка носит ориентировочный характер.
      </p>
    </div>
  );
}

export default CaspianDentosROI;
