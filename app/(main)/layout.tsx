import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/app/actions/settings";
import Sidebar from "@/components/Sidebar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const settings = await getSettings();

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={session} settings={settings} />
      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
