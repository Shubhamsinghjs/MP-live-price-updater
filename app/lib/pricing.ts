import type { MetalSpotRate, VariantPricingConfig } from "@prisma/client";
import { roundTo2 } from "./decimal";

type MetalRateSnapshot = Pick<
  MetalSpotRate,
  | "gold24KPerGram"
  | "gold22KPerGram"
  | "gold18KPerGram"
  | "gold14KPerGram"
  | "gold9KPerGram"
  | "silverPerGram"
  | "platinumPerGram"
  | "palladiumPerGram"
>;

export type ComputedPrice = {
  priceINR: number;
  compareAtPriceINR: number | null;
};

function pickMetalRatePerGram(
  rate: MetalRateSnapshot,
  metalType: VariantPricingConfig["metalType"],
  goldPurityKarat: number | null,
): number {
  if (metalType === "GOLD") {
    const karat = goldPurityKarat ?? 24;
    switch (karat) {
      case 9:
        return Number(rate.gold9KPerGram);
      case 14:
        return Number(rate.gold14KPerGram);
      case 18:
        return Number(rate.gold18KPerGram);
      case 22:
        return Number(rate.gold22KPerGram);
      case 24:
      default:
        return Number(rate.gold24KPerGram);
    }
  }

  if (metalType === "SILVER") return Number(rate.silverPerGram);
  if (metalType === "PLATINUM") return Number(rate.platinumPerGram);
  return Number(rate.palladiumPerGram); // PALLADIUM
}

export function computeVariantPrices(
  rate: MetalRateSnapshot,
  config: VariantPricingConfig,
): ComputedPrice {
  const metalRatePerGram = pickMetalRatePerGram(
    rate,
    config.metalType,
    config.goldPurityKarat ?? null,
  );

  const metalCost = metalRatePerGram * Number(config.metalWeightGrams);

  // Wastage applied on metal cost
  const wastageMultiplier = 1 + Number(config.wastagePercent) / 100;
  const metalWithWastage = metalCost * wastageMultiplier;

  const makingCharges = metalWithWastage * Number(config.makingChargesPercent) / 100;
  const shippingCharges =
    metalWithWastage * Number(config.shippingChargesPercent) / 100;

  const base =
    metalWithWastage +
    makingCharges +
    shippingCharges +
    Number(config.diamondPriceINR) +
    Number(config.gemstonePriceINR) +
    Number(config.miscChargesINR);

  const markupAmount = base * Number(config.markupPercent) / 100;

  // Tax applied on (base + markup)
  const taxAmount = (base + markupAmount) * Number(config.taxPercent) / 100;

  const priceINR = roundTo2(base + markupAmount + taxAmount);

  const compareAtMargin = config.compareAtMarginPercent;
  const compareAtPriceINR =
    compareAtMargin === null || compareAtMargin === undefined
      ? null
      : roundTo2(priceINR * (1 + Number(compareAtMargin) / 100));

  return { priceINR, compareAtPriceINR };
}

