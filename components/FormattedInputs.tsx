"use client";

function formatBizNumber(val: string) {
  const digits = val.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatPhone(val: string) {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatResidentNumber(val: string) {
  const digits = val.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export function ResidentNumberInput({ defaultValue }: { defaultValue?: string }) {
  return (
    <input
      name="residentNumber"
      defaultValue={defaultValue || ""}
      placeholder="000000-0000000"
      maxLength={14}
      onChange={(e) => {
        e.target.value = formatResidentNumber(e.target.value);
      }}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
    />
  );
}

export function BizNumberInput({ defaultValue }: { defaultValue?: string }) {
  return (
    <input
      name="bizNumber"
      defaultValue={defaultValue || ""}
      placeholder="000-00-00000"
      maxLength={12}
      onChange={(e) => {
        const formatted = formatBizNumber(e.target.value);
        e.target.value = formatted;
      }}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
    />
  );
}

export function PhoneInput({ defaultValue }: { defaultValue?: string }) {
  return (
    <input
      name="phone"
      defaultValue={defaultValue || ""}
      placeholder="010-0000-0000"
      maxLength={13}
      onChange={(e) => {
        const formatted = formatPhone(e.target.value);
        e.target.value = formatted;
      }}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
    />
  );
}
