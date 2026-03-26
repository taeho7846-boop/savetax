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
    scheduled: "bg-blue-100 text-blue-700 border-blue-200",
    in_progress: "bg-yellow-100 text-yellow-700 border-yellow-200",
    done: "bg-green-100 text-green-700 border-green-200",
    hold: "bg-gray-100 text-gray-700 border-gray-200",
    delayed: "bg-red-100 text-red-700 border-red-200",
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
