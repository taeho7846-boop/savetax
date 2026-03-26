import { prisma } from "@/lib/prisma";
import { updateClient, deleteClient } from "@/app/actions/clients";
import { EditClientForm } from "./EditClientForm";
import { DeleteClientButton } from "./DeleteClientButton";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [client, users] = await Promise.all([
    prisma.client.findUnique({
      where: { id: parseInt(id), isDeleted: false },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!client) notFound();

  const updateWithId = updateClient.bind(null, client.id);
  const deleteWithId = deleteClient.bind(null, client.id);
  const currentTaxTypes = client.taxTypes?.split(",").map((t) => t.trim()) ?? [];
  const currentLaborTypes = client.laborTypes?.split(",").map((t) => t.trim()) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/clients" className="text-gray-500 hover:text-gray-700 text-sm">
            ← 고객사 목록
          </Link>
          <h1 className="text-xl font-bold text-gray-900">고객사 수정</h1>
        </div>

        <DeleteClientButton action={deleteWithId} name={client.name} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 max-w-2xl">
        <EditClientForm
          action={updateWithId}
          client={client}
          users={users}
          currentTaxTypes={currentTaxTypes}
          currentLaborTypes={currentLaborTypes}
        />
      </div>
    </div>
  );
}
