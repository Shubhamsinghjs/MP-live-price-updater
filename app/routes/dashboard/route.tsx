import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  InlineGrid,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";
import { computeVariantPrices } from "../../lib/pricing";
import { asMoneyString, toNumber } from "../../lib/decimal";
import type { MetalSpotRate, VariantPricingConfig } from "@prisma/client";

type LoaderData = {
  rates: Pick<
    MetalSpotRate,
    | "gold24KPerGram"
    | "gold22KPerGram"
    | "gold18KPerGram"
    | "gold14KPerGram"
    | "gold9KPerGram"
    | "silverPerGram"
    | "platinumPerGram"
    | "palladiumPerGram"
  > | null;
  lastUpdatedAt: string | null;
};

type ActionData =
  | { ok: true; mode: "save_rates" }
  | { ok: true; mode: "refresh_prices"; updatedVariants: number; updatedProducts: number }
  | { ok: false; error: string };

function normalizeRateSnapshot(rates: MetalSpotRate) {
  return {
    gold24KPerGram: Number(rates.gold24KPerGram),
    gold22KPerGram: Number(rates.gold22KPerGram),
    gold18KPerGram: Number(rates.gold18KPerGram),
    gold14KPerGram: Number(rates.gold14KPerGram),
    gold9KPerGram: Number(rates.gold9KPerGram),
    silverPerGram: Number(rates.silverPerGram),
    platinumPerGram: Number(rates.platinumPerGram),
    palladiumPerGram: Number(rates.palladiumPerGram),
  };
}

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<LoaderData> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const latest = await db.metalSpotRate.findFirst({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });

  if (!latest) {
    return { rates: null, lastUpdatedAt: null };
  }

  return {
    rates: {
      gold24KPerGram: latest.gold24KPerGram,
      gold22KPerGram: latest.gold22KPerGram,
      gold18KPerGram: latest.gold18KPerGram,
      gold14KPerGram: latest.gold14KPerGram,
      gold9KPerGram: latest.gold9KPerGram,
      silverPerGram: latest.silverPerGram,
      platinumPerGram: latest.platinumPerGram,
      palladiumPerGram: latest.palladiumPerGram,
    },
    lastUpdatedAt: latest.updatedAt.toISOString(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "save_rates") {
    const data = {
      shop,
      gold24KPerGram: toNumber(formData.get("gold24KPerGram")),
      gold22KPerGram: toNumber(formData.get("gold22KPerGram")),
      gold18KPerGram: toNumber(formData.get("gold18KPerGram")),
      gold14KPerGram: toNumber(formData.get("gold14KPerGram")),
      gold9KPerGram: toNumber(formData.get("gold9KPerGram")),
      silverPerGram: toNumber(formData.get("silverPerGram")),
      platinumPerGram: toNumber(formData.get("platinumPerGram")),
      palladiumPerGram: toNumber(formData.get("palladiumPerGram")),
    };

    await db.metalSpotRate.create({ data });

    return json<ActionData>({ ok: true, mode: "save_rates" });
  }

  if (intent === "refresh_prices") {
    const latest = await db.metalSpotRate.findFirst({
      where: { shop },
      orderBy: { updatedAt: "desc" },
    });

    if (!latest) {
      return json<ActionData>(
        { ok: false, error: "Please save metal spot rates first." },
        { status: 400 },
      );
    }

    const configs = await db.variantPricingConfig.findMany({
      where: { shop },
    });

    if (configs.length === 0) {
      return json<ActionData>(
        { ok: false, error: "No variant configurations found. Go to Products and configure variants first." },
        { status: 400 },
      );
    }

    const rateSnapshot = normalizeRateSnapshot(latest);

    const updatesByProduct = new Map<
      string,
      Array<{
        variantGid: string;
        priceINR: number;
        compareAtPriceINR: number | null;
      }>
    >();

    // Compute everything first, then update Shopify in chunks.
    const computedPerConfig: Array<{
      configId: string;
      lastPriceINR: number;
      lastCompareAtPriceINR: number | null;
    }> = [];

    for (const config of configs) {
      const { priceINR, compareAtPriceINR } = computeVariantPrices(
        rateSnapshot as any,
        config as VariantPricingConfig,
      );

      computedPerConfig.push({
        configId: config.id,
        lastPriceINR: priceINR,
        lastCompareAtPriceINR: compareAtPriceINR,
      });

      const list = updatesByProduct.get(config.productGid) ?? [];
      list.push({ variantGid: config.variantGid, priceINR, compareAtPriceINR });
      updatesByProduct.set(config.productGid, list);
    }

    // Update Shopify
    let updatedVariants = 0;
    let updatedProducts = 0;

    const mutation = `#graphql
      mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id price compareAtPrice }
          userErrors { field message }
        }
      }
    `;

    for (const [productId, variants] of updatesByProduct.entries()) {
      updatedProducts++;

      const chunkSize = Number(process.env.SHOPIFY_BULK_CHUNK_SIZE ?? 50);
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

        const response = await admin.graphql(mutation, {
          variables: { productId, variants: gqlVariants },
        });
        const payload = await response.json();

        const errors =
          payload?.data?.productVariantsBulkUpdate?.userErrors ?? [];
        if (errors.length > 0) {
          // For MVP: we don't hard-fail all updates, but we stop further chunks.
          return json<ActionData>(
            { ok: false, error: errors[0]?.message ?? "Shopify bulk update error." },
            { status: 400 },
          );
        }

        updatedVariants += chunk.length;
      }
    }

    // Update DB snapshots (for UI/debug)
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

    return json<ActionData>({
      ok: true,
      mode: "refresh_prices",
      updatedVariants,
      updatedProducts,
    });
  }

  return json<ActionData>({ ok: false, error: "Unknown intent." }, { status: 400 });
};

export default function Dashboard() {
  const { rates, lastUpdatedAt } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const [form, setForm] = useState({
    gold24KPerGram: rates ? String(Number(rates.gold24KPerGram)) : "",
    gold22KPerGram: rates ? String(Number(rates.gold22KPerGram)) : "",
    gold18KPerGram: rates ? String(Number(rates.gold18KPerGram)) : "",
    gold14KPerGram: rates ? String(Number(rates.gold14KPerGram)) : "",
    gold9KPerGram: rates ? String(Number(rates.gold9KPerGram)) : "",
    silverPerGram: rates ? String(Number(rates.silverPerGram)) : "",
    platinumPerGram: rates ? String(Number(rates.platinumPerGram)) : "",
    palladiumPerGram: rates ? String(Number(rates.palladiumPerGram)) : "",
  });

  useEffect(() => {
    if (!fetcher.data) return;
    if (!fetcher.data.ok) {
      shopify.toast.show(fetcher.data.error);
      return;
    }
    if (fetcher.data.mode === "save_rates") {
      shopify.toast.show("Metal rates saved.");
    } else {
      shopify.toast.show(
        `Prices refreshed: ${fetcher.data.updatedVariants} variants.`,
      );
    }
  }, [fetcher.data, shopify]);

  const isBusy = fetcher.state !== "idle";

  return (
    <Page>
      <TitleBar
        title="Dashboard"
        primaryAction={undefined}
      />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Metal Spot Rates (INR / Gram)
                </Text>
                <Text variant="bodyMd" as="p">
                  Last updated:{" "}
                  {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "Not set"}
                </Text>

                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="save_rates" />
                  <InlineGrid columns={2} gap="300">
                    <TextField
                      label="Gold Price 24K / Gram"
                      name="gold24KPerGram"
                      value={form.gold24KPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, gold24KPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Gold Price 22K / Gram"
                      name="gold22KPerGram"
                      value={form.gold22KPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, gold22KPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Gold Price 18K / Gram"
                      name="gold18KPerGram"
                      value={form.gold18KPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, gold18KPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Gold Price 14K / Gram"
                      name="gold14KPerGram"
                      value={form.gold14KPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, gold14KPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Gold Price 9K / Gram"
                      name="gold9KPerGram"
                      value={form.gold9KPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, gold9KPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Silver Price / Gram"
                      name="silverPerGram"
                      value={form.silverPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, silverPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Platinum Price / Gram"
                      name="platinumPerGram"
                      value={form.platinumPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, platinumPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <TextField
                      label="Palladium Price / Gram"
                      name="palladiumPerGram"
                      value={form.palladiumPerGram}
                      onChange={(value) => setForm((p) => ({ ...p, palladiumPerGram: value }))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </InlineGrid>

                  <BlockStack>
                    <Button primary submit loading={isBusy}>
                      Save Rates
                    </Button>
                  </BlockStack>
                </fetcher.Form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Refresh Shopify Variant Prices
                </Text>
                <Text variant="bodyMd" as="p">
                  This will update all variants that you configured in the Products page.
                </Text>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="refresh_prices" />
                  <Button submit loading={isBusy}>
                    Refresh Prices
                  </Button>
                </fetcher.Form>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

