export const ROLE_LABELS: Record<string, string> = {
  owner: "대표",
  admin: "관리자",
  staff: "실무자",
  readonly: "조회전용",
};

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정",
  in_progress: "진행중",
  done: "완료",
  hold: "보류",
  delayed: "지연",
};

export const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-[#eff6ff] text-[#1e40af]",
  in_progress: "bg-[#fffbeb] text-[#92400e]",
  done: "bg-[#ecfdf5] text-[#065f46]",
  hold: "bg-white text-[#4E5968]",
  delayed: "bg-[#fef2f2] text-[#dc2626]",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  vat: "부가가치세",
  withholding: "원천세",
  income: "종합소득세",
  corporate: "법인세",
  insurance: "4대보험",
  settlement: "결산",
  other: "기타",
};
