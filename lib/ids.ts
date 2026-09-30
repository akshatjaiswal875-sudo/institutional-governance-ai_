export type EntityType = "POLICY" | "EVENT";

type Prefix = "PC" | "EV";

type AtomicQueryClient = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

const PREFIXES: Record<EntityType, Prefix> = {
  POLICY: "PC",
  EVENT: "EV",
};

const COUNTER_KEYS: Record<EntityType, string> = {
  POLICY: "policy",
  EVENT: "event",
};

export function formatCustomId(entity: EntityType, value: number | bigint): string {
  const numeric = typeof value === "bigint" ? value : BigInt(value);

  if (numeric < 1n) {
    throw new Error("Custom ID sequence must be greater than zero.");
  }

  return `${PREFIXES[entity]}-${numeric.toString().padStart(4, "0")}`;
}

export function parseCustomId(value: string): {
  entity: EntityType;
  sequence: bigint;
} | null {
  const match = /^\s*(PC|EV)-(\d+)\s*$/i.exec(value);

  if (!match) {
    return null;
  }

  const sequence = BigInt(match[2]);

  if (sequence < 1n) {
    return null;
  }

  return {
    entity: match[1].toUpperCase() === "PC" ? "POLICY" : "EVENT",
    sequence,
  };
}

/**
 * The SQL uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so two
 * concurrent requests cannot receive the same sequence number.
 *
 * Pass a PrismaClient or transaction client at the call site. The small
 * structural type keeps this helper testable without importing Prisma into
 * the Next.js bundle.
 */
export async function generateCustomId(
  prisma: AtomicQueryClient,
  entity: EntityType,
): Promise<string> {
  const key = COUNTER_KEYS[entity];

  const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`
    INSERT INTO counters (key, value, "updatedAt")
    VALUES (${key}, 1, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = counters.value + 1, "updatedAt" = NOW()
    RETURNING value
  `;

  const value = rows[0]?.value;

  if (value === undefined) {
    throw new Error("Unable to allocate a custom ID.");
  }

  return formatCustomId(entity, value);
}
