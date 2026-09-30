import { PrismaClient, Role, PolicyStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const users = await Promise.all(
    [
      ["director@govai.local", "Demo Director", Role.DIRECTOR],
      ["principal@govai.local", "Demo Principal", Role.PRINCIPAL],
      ["hod@govai.local", "Demo HOD", Role.HOD],
      ["coordinator@govai.local", "Demo Coordinator", Role.COORDINATOR],
      ["faculty@govai.local", "Demo Faculty", Role.FACULTY],
    ].map(([email, name, role]) =>
      prisma.user.upsert({
        where: { email: String(email) },
        update: { name: String(name), role: role as Role },
        create: {
          email: String(email),
          name: String(name),
          role: role as Role,
          department: "Administration",
        },
      }),
    ),
  );

  const director = users[0];
  const principal = users[1];

  const policy = await prisma.policy.create({
    data: {
      customId: "PC-9001",
      status: PolicyStatus.ACTIVE,
      updatedById: director.id,
      versions: {
        create: [
          {
            versionNumber: 1,
            title: "Institutional Meeting Governance Policy",
            content: "# Meeting Governance\n\nAll institutional meetings must have an organizer, agenda and recorded decisions.",
            changeSummary: "Initial policy version",
            createdById: director.id,
          },
          {
            versionNumber: 2,
            title: "Institutional Meeting Governance Policy",
            content: "# Meeting Governance\n\nAll institutional meetings must have an organizer, agenda, participants and recorded decisions.",
            changeSummary: "Added participant and decision requirements",
            createdById: principal.id,
          },
        ],
      },
    },
    include: { versions: true },
  });

  const currentVersion = policy.versions.find((version) => version.versionNumber === 2);

  if (!currentVersion) {
    throw new Error("Seed policy current version was not created.");
  }

  await prisma.policy.update({
    where: { id: policy.id },
    data: { currentVersionId: currentVersion.id },
  });

  const event = await prisma.event.create({
    data: {
      customId: "EV-9001",
      title: "Institutional Governance Review",
      description: "Quarterly review of governance operations.",
      startDate: new Date("2026-10-15T10:00:00Z"),
      endDate: new Date("2026-10-15T11:30:00Z"),
      location: "Board Room",
      organizerId: director.id,
    },
  });

  const suggestion = await prisma.suggestion.create({
    data: {
      title: "Improve meeting follow-up",
      content: "Meeting decisions should automatically show their responsible person and deadline.",
      createdById: principal.id,
      policyTags: {
        create: [{ policyId: policy.id }],
      },
      eventTags: {
        create: [{ eventId: event.id }],
      },
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        entityType: "POLICY",
        entityId: policy.id,
        action: "CREATE",
        actorId: director.id,
        metadata: { source: "seed" },
      },
      {
        entityType: "EVENT",
        entityId: event.id,
        action: "CREATE",
        actorId: director.id,
        metadata: { source: "seed" },
      },
      {
        entityType: "SUGGESTION",
        entityId: suggestion.id,
        action: "CREATE",
        actorId: principal.id,
        metadata: { source: "seed" },
      },
    ],
  });

  console.log("Seed completed:", {
    policy: policy.customId,
    event: event.customId,
    suggestion: suggestion.id,
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
