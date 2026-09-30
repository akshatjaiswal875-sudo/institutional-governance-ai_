import type { PrismaClient } from "@prisma/client";

export type EntityType = "POLICY" | "EVENT";

type Prefix = "PC" | "EV";

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

  const prefix = match[1].toUpperCase();
  const sequence = BigInt(match[2]);

  if (sequence < 1n) {
    return null;
  }

  return {
    entity: prefix === "PC" ? "POLICY" : "EVENT",
    sequence,
  };
}

export async function generateCustomId(
  prisma: PrismaClient,
  entity: EntityType,
): Promise<string> {
  const key = COUNTER_KEYS[entity];

  const counter = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1n },
    update: { value: { increment: 1n } },
    select: { value: true },
  });

  return formatCustomId(entity, counter.value);
}
