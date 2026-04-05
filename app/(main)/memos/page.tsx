import { redirect } from "next/navigation";

export default function MemosPage() {
  redirect("/tasks?itemType=memo");
}
