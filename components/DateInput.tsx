"use client";

import { useRef, useState } from "react";

export function DateInput({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const parts = (defaultValue ?? "").split("-");
  const [year, setYear] = useState(parts[0] ?? "");
  const [month, setMonth] = useState(parts[1] ?? "");
  const [day, setDay] = useState(parts[2] ?? "");

  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  // hidden input에 YYYY-MM-DD 형태로 전달
  const combined = year && month && day ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={combined} />
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        value={year}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          setYear(v);
          if (v.length === 4) monthRef.current?.focus();
        }}
        className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
      />
      <span className="text-gray-400 text-sm">-</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        maxLength={2}
        value={month}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          setMonth(v);
          if (v.length === 2) dayRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !month) {
            setYear((prev) => prev.slice(0, -1));
            (e.target as HTMLInputElement).previousElementSibling?.previousElementSibling &&
              ((e.target as HTMLInputElement).parentElement?.querySelector("input:first-of-type") as HTMLInputElement)?.focus();
          }
        }}
        className="w-12 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
      />
      <span className="text-gray-400 text-sm">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="DD"
        maxLength={2}
        value={day}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          setDay(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !day) {
            setMonth((prev) => prev.slice(0, -1));
            monthRef.current?.focus();
          }
        }}
        className="w-12 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
      />
    </div>
  );
}
