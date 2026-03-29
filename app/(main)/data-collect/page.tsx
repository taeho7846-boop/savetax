import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DataCollectBoard } from "./DataCollectBoard";

export default async function DataCollectPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const taxYear = params.year || String(new Date().getFullYear() - 1);

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
    },
    select: {
      id: true,
      name: true,
      clientType: true,
      dataCollections: {
        where: { taxYear },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <DataCollectBoard clients={clients} taxYear={taxYear} />
    </div>
  );
}
