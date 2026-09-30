import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const policies = await tx.$queryRaw<Array<{
      id: string;
      title: string;
      content: string;
      updated_by: string | null;
    }>>`
      SELECT id, title, content, updated_by
      FROM policies
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
    `;

    let policySequence = 0n;

    for (const policy of policies) {
      const existing = await tx.$queryRaw<Array<{ custom_id: string | null }>>`
        SELECT custom_id FROM policies WHERE id = ${policy.id}::uuid
      `;

      if (!existing[0]?.custom_id) {
        policySequence += 1n;
        const customId = `PC-${policySequence.toString().padStart(4, "0")}`;

        await tx.$executeRaw`
          UPDATE policies
          SET custom_id = ${customId}
          WHERE id = ${policy.id}::uuid
        `;
      }

      if (policy.updated_by) {
        const version = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM policy_versions
          WHERE policy_id = ${policy.id}::uuid
          ORDER BY version_number DESC
          LIMIT 1
        `;

        if (!version.length) {
          const created = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO policy_versions
              (policy_id, version_number, title, content, change_summary, created_by)
            VALUES
              (${policy.id}::uuid, 1, ${policy.title}, ${policy.content},
               'Initial version imported during governance migration', ${policy.updated_by}::uuid)
            RETURNING id
          `;

          await tx.$executeRaw`
            UPDATE policies
            SET current_version_id = ${created[0].id}::uuid
            WHERE id = ${policy.id}::uuid
          `;
        }
      }
    }

    const events = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM events
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
    `;

    let eventSequence = 0n;

    for (const event of events) {
      const existing = await tx.$queryRaw<Array<{ custom_id: string | null }>>`
        SELECT custom_id FROM events WHERE id = ${event.id}::uuid
      `;

      if (!existing[0]?.custom_id) {
        eventSequence += 1n;
        const customId = `EV-${eventSequence.toString().padStart(4, "0")}`;

        await tx.$executeRaw`
          UPDATE events
          SET custom_id = ${customId}
          WHERE id = ${event.id}::uuid
        `;
      }
    }
  });

  console.log("Phase 2 backfill completed successfully.");
}

main()
  .catch((error: unknown) => {
    console.error("Phase 2 backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
