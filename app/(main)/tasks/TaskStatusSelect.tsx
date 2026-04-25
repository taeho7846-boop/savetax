"use client";

import { updateTaskStatus } from "@/app/actions/tasks";
import { STATUS_LABELS } from "@/lib/constants";

export default function TaskStatusSelect({
  taskId,
  currentStatus,
}: {
  taskId: number;
  currentStatus: string;
}) {
  const statusOptions = ["scheduled", "in_progress", "done", "hold", "delayed"];

  const colorMap: Record<string, string> = {
    scheduled: "bg-[#E8F3FF] text-[#1B64DA] border-[#A3CAFD]",
    in_progress: "bg-[#FFF4D0] text-[#B08809] border-[#FDE68A]",
    done: "bg-[#E7F7EE] text-[#15803D] border-[#BBF7D0]",
    hold: "bg-[#F2F4F6] text-[#333D4B] border-[#E5E8EB]",
    delayed: "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]",
  };

  return (
    <select
      value={currentStatus}
      onChange={async (e) => {
        await updateTaskStatus(taskId, e.target.value);
      }}
      className={`text-xs px-2 py-1 rounded-full border cursor-pointer focus:outline-none ${
        colorMap[currentStatus]
      }`}
    >
      {statusOptions.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
