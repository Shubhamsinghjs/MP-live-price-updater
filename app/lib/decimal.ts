export function toNumber(input: unknown): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input === "string") {
    const n = Number(input);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma Decimal instances have a toNumber() method
  if (typeof (input as { toNumber?: () => number }).toNumber === "function") {
    const n = (input as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function asMoneyString(n: number): string {
  return roundTo2(n).toFixed(2);
}

export function safeParsePercent(input: string | null): number {
  if (!input) return 0;
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

