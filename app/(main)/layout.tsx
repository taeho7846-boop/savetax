import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/app/actions/settings";
import TopNav from "@/components/TopNav";
import DockBar from "@/components/DockBar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DriveBasePathSync } from "@/components/DriveBasePathSync";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const settings = await getSettings();

  return (
    <div className="glass-canvas min-h-screen flex flex-col">
      <TopNav user={session} settings={settings} />
      <main className="flex-1 px-6 pb-[100px] overflow-y-auto text-[#4E5968]">{children}</main>
      <DockBar />
      <GlobalSearch />
      <DriveBasePathSync value={settings?.driveBasePath ?? null} />
    </div>
  );
}
