import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { computeVariantPrices } from "../lib/pricing";
import { asMoneyString } from "../lib/decimal";

const SHOPIFY_ADMIN_API_VERSION =
  process.env.SHOPIFY_ADMIN_API_VERSION ?? "2024-10";

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = process.env.CRON_REFRESH_SECRET;
  if (!secret) {
    return json({ ok: false, error: "CRON_REFRESH_SECRET is not set." }, { status: 500 });
  }

  const provided =
    request.headers.get("x-refresh-secret") ??
    (await request.formData()).get("secret");

  if (provided !== secret) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await db.session.findMany({
    select: { shop: true, accessToken: true },
  });

  const uniqueByShop = new Map<string, string>();
  for (const s of sessions) {
    if (!uniqueByShop.has(s.shop)) uniqueByShop.set(s.shop, s.accessToken);
  }

  const mutation = `#graphql
    mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price compareAtPrice }
        userErrors { field message }
      }
    }
  `;

  let totalUpdatedVariants = 0;
  let totalUpdatedProducts = 0;
  let shopsProcessed = 0;

  const chunkSize = Number(process.env.SHOPIFY_BULK_CHUNK_SIZE ?? 50);

  for (const [shop, accessToken] of uniqueByShop.entries()) {
    const latestRates = await db.metalSpotRate.findFirst({
      where: { shop },
      orderBy: { updatedAt: "desc" },
    });
    if (!latestRates) continue;

    const configs = await db.variantPricingConfig.findMany({
      where: { shop },
    });
    if (configs.length === 0) continue;

    shopsProcessed++;

    const rateSnapshot = {
      gold24KPerGram: Number(latestRates.gold24KPerGram),
      gold22KPerGram: Number(latestRates.gold22KPerGram),
      gold18KPerGram: Number(latestRates.gold18KPerGram),
      gold14KPerGram: Number(latestRates.gold14KPerGram),
      gold9KPerGram: Number(latestRates.gold9KPerGram),
      silverPerGram: Number(latestRates.silverPerGram),
      platinumPerGram: Number(latestRates.platinumPerGram),
      palladiumPerGram: Number(latestRates.palladiumPerGram),
    };

    const updatesByProduct = new Map<
      string,
      Array<{ variantGid: string; priceINR: number; compareAtPriceINR: number | null }>
    >();

    const computedPerConfig: Array<{
      configId: string;
      lastPriceINR: number;
      lastCompareAtPriceINR: number | null;
    }> = [];

    for (const cfg of configs) {
      const computed = computeVariantPrices(rateSnapshot as any, cfg);
      computedPerConfig.push({
        configId: cfg.id,
        lastPriceINR: computed.priceINR,
        lastCompareAtPriceINR: computed.compareAtPriceINR,
      });

      const list = updatesByProduct.get(cfg.productGid) ?? [];
      list.push({
        variantGid: cfg.variantGid,
        priceINR: computed.priceINR,
        compareAtPriceINR: computed.compareAtPriceINR,
      });
      updatesByProduct.set(cfg.productGid, list);
    }

    for (const [productGid, variants] of updatesByProduct.entries()) {
      totalUpdatedProducts++;

      for (let i = 0; i < variants.length; i += chunkSize) {
        const chunk = variants.slice(i, i + chunkSize);
        const gqlVariants = chunk.map((v) => {
          const base: { id: string; price: string; compareAtPrice?: string } = {
            id: v.variantGid,
            price: asMoneyString(v.priceINR),
          };
          if (v.compareAtPriceINR !== null && v.compareAtPriceINR !== undefined) {
            base.compareAtPrice = asMoneyString(v.compareAtPriceINR);
          }
          return base;
        });

        const resp = await fetch(
          `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              query: mutation,
              variables: { productId: productGid, variants: gqlVariants },
            }),
          },
        );

        const payload = await resp.json();
        const errors = payload?.data?.productVariantsBulkUpdate?.userErrors ?? [];
        if (errors.length > 0) {
          return json(
            {
              ok: false,
              error: errors[0]?.message ?? "Shopify bulk update error.",
              shop,
            },
            { status: 400 },
          );
        }

        totalUpdatedVariants += chunk.length;
      }
    }

    // Persist last computed values
    await Promise.all(
      computedPerConfig.map((c) =>
        db.variantPricingConfig.update({
          where: { id: c.configId },
          data: {
            lastPriceINR: c.lastPriceINR,
            lastCompareAtPriceINR: c.lastCompareAtPriceINR,
          },
        }),
      ),
    );
  }

  return json({
    ok: true,
    shopsProcessed,
    updatedVariants: totalUpdatedVariants,
    updatedProducts: totalUpdatedProducts,
  });
};

