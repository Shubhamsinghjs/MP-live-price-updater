import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useEffect } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  Layout,
  Page,
  Text,
  TextField,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";
import { computeVariantPrices } from "../../lib/pricing";
import { asMoneyString, toNumber } from "../../lib/decimal";
import type { MetalSpotRate, VariantPricingConfig } from "@prisma/client";

type VariantRow = {
  variantId: string;
  productId: string;
  title: string;
  sku: string | null;
  shopifyPrice: string | null;
  configured: boolean;
  previewPrice: string | null;
  previewCompareAtPrice: string | null;
  config?: VariantPricingConfig;
};

type ProductRow = {
  productId: string;
  title: string;
  status: string;
  variants: VariantRow[];
};

type LoaderData = {
  products: ProductRow[];
  ratesPresent: boolean;
};

type ActionData = { ok: true } | { ok: false; error: string };

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
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const query = `#graphql
    query listProducts($productsFirst: Int!, $variantsFirst: Int!) {
      products(first: $productsFirst) {
        nodes {
          id
          title
          status
          variants(first: $variantsFirst) {
            nodes {
              id
              title
              sku
              price
            }
          }
        }
      }
    }
  `;

  const productsResp = await admin.graphql(query, {
    variables: { productsFirst: 10, variantsFirst: 10 },
  });
  const productsPayload = await productsResp.json();
  const productNodes = productsPayload?.data?.products?.nodes ?? [];

  const allVariantIds: string[] = [];
  for (const p of productNodes) {
    for (const v of p.variants?.nodes ?? []) {
      allVariantIds.push(v.id);
    }
  }

  const configs =
    allVariantIds.length > 0
      ? await db.variantPricingConfig.findMany({
          where: { shop, variantGid: { in: allVariantIds } },
        })
      : [];

  const configByVariant = new Map<string, VariantPricingConfig>();
  for (const c of configs) {
    configByVariant.set(c.variantGid, c);
  }

  const latestRates = await db.metalSpotRate.findFirst({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });

  const ratesPresent = Boolean(latestRates);
  const rateSnapshot = latestRates ? normalizeRateSnapshot(latestRates) : null;

  const products: ProductRow[] = productNodes.map((p: any) => {
    const variants: VariantRow[] = (p.variants?.nodes ?? []).map((v: any) => {
      const cfg = configByVariant.get(v.id);
      let previewPrice: string | null = null;
      let previewCompareAtPrice: string | null = null;

      if (cfg && rateSnapshot) {
        const computed = computeVariantPrices(rateSnapshot as any, cfg);
        previewPrice = asMoneyString(computed.priceINR);
        previewCompareAtPrice =
          computed.compareAtPriceINR === null
            ? null
            : asMoneyString(computed.compareAtPriceINR);
      }

      return {
        variantId: v.id,
        productId: p.id,
        title: v.title,
        sku: v.sku ?? null,
        shopifyPrice: v.price ?? null,
        configured: Boolean(cfg),
        previewPrice,
        previewCompareAtPrice,
        config: cfg ?? undefined,
      };
    });

    return {
      productId: p.id,
      title: p.title,
      status: p.status,
      variants,
    };
  });

  return { products, ratesPresent };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "save_variant_config") {
    return json<ActionData>({ ok: false, error: "Unknown intent." }, { status: 400 });
  }

  const variantGid = String(formData.get("variantGid") ?? "");
  const productGid = String(formData.get("productGid") ?? "");
  if (!variantGid || !productGid) {
    return json<ActionData>({ ok: false, error: "Missing variant/product IDs." }, { status: 400 });
  }

  const metalType = String(formData.get("metalType") ?? "GOLD") as VariantPricingConfig["metalType"];
  const goldPurityKaratRaw = formData.get("goldPurityKarat");
  const goldPurityKarat =
    goldPurityKaratRaw !== null && String(goldPurityKaratRaw).trim() !== ""
      ? Number(goldPurityKaratRaw)
      : null;

  const compareAtMarginPercentRaw = formData.get("compareAtMarginPercent");
  const compareAtMarginPercent =
    compareAtMarginPercentRaw !== null &&
    String(compareAtMarginPercentRaw).trim() !== ""
      ? Number(compareAtMarginPercentRaw)
      : null;

  const common = {
    shop,
    variantGid,
    productGid,
    metalType,
    goldPurityKarat,
    metalWeightGrams: toNumber(formData.get("metalWeightGrams")),
    diamondPriceINR: toNumber(formData.get("diamondPriceINR")),
    gemstonePriceINR: toNumber(formData.get("gemstonePriceINR")),
    makingChargesPercent: toNumber(formData.get("makingChargesPercent")),
    wastagePercent: toNumber(formData.get("wastagePercent")),
    miscChargesINR: toNumber(formData.get("miscChargesINR")),
    shippingChargesPercent: toNumber(formData.get("shippingChargesPercent")),
    markupPercent: toNumber(formData.get("markupPercent")),
    taxPercent: toNumber(formData.get("taxPercent")),
    compareAtMarginPercent,
  };

  // Composite unique key: @@unique([shop, variantGid])
  await db.variantPricingConfig.upsert({
    where: {
      shop_variantGid: {
        shop,
        variantGid,
      },
    },
    update: common,
    create: common,
  });

  return json<ActionData>({ ok: true });
};

export default function Products() {
  const { products, ratesPresent } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      shopify.toast.show("Variant configuration saved.");
    } else {
      shopify.toast.show(fetcher.data.error);
    }
  }, [fetcher.data, shopify]);

  return (
    <Page>
      <TitleBar title="Products" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {!ratesPresent && (
              <Card>
                <Text as="p" variant="bodyMd">
                  Please set metal spot rates first in <Text as="span">Dashboard</Text>.
                </Text>
              </Card>
            )}

            {products.map((p) => (
              <Card key={p.productId}>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    {p.title}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Status: {p.status}
                  </Text>

                  <BlockStack gap="300">
                    {p.variants.map((v) => (
                      <Card key={v.variantId}>
                        <BlockStack gap="200">
                          <Text as="h3" variant="headingSm">
                            {v.title}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            SKU: {v.sku ?? "—"}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            Shopify Price: {v.shopifyPrice ?? "—"}{" "}
                            {v.previewPrice ? `| Preview: ${v.previewPrice}` : ""}
                          </Text>
                          {v.previewCompareAtPrice && (
                            <Text as="p" variant="bodyMd">
                              Compare-at Preview: {v.previewCompareAtPrice}
                            </Text>
                          )}

                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="save_variant_config" />
                            <input type="hidden" name="variantGid" value={v.variantId} />
                            <input type="hidden" name="productGid" value={v.productId} />

                            <InlineGrid columns={2} gap="300">
                              <div>
                                <Text as="h4" variant="headingXs">
                                  Metal Type
                                </Text>
                                <select
                                  name="metalType"
                                  defaultValue={v.config?.metalType ?? "GOLD"}
                                  style={{ width: "100%", padding: 8, borderRadius: 6 }}
                                >
                                  <option value="GOLD">Gold</option>
                                  <option value="SILVER">Silver</option>
                                  <option value="PLATINUM">Platinum</option>
                                  <option value="PALLADIUM">Palladium</option>
                                </select>
                              </div>

                              <TextField
                                label="Gold Purity Karat (24/22/18/14/9)"
                                name="goldPurityKarat"
                                defaultValue={
                                  v.config?.goldPurityKarat !== null && v.config?.goldPurityKarat !== undefined
                                    ? String(v.config.goldPurityKarat)
                                    : ""
                                }
                                inputMode="numeric"
                              />

                              <TextField
                                label="Metal Weight (grams)"
                                name="metalWeightGrams"
                                defaultValue={v.config?.metalWeightGrams ? String(v.config.metalWeightGrams) : ""}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Diamond Price (INR)"
                                name="diamondPriceINR"
                                defaultValue={v.config?.diamondPriceINR ? String(v.config.diamondPriceINR) : ""}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Gemstone Price (INR)"
                                name="gemstonePriceINR"
                                defaultValue={v.config?.gemstonePriceINR ? String(v.config.gemstonePriceINR) : ""}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Making Charges %"
                                name="makingChargesPercent"
                                defaultValue={v.config?.makingChargesPercent ? String(v.config.makingChargesPercent) : "0"}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Wastage %"
                                name="wastagePercent"
                                defaultValue={v.config?.wastagePercent ? String(v.config.wastagePercent) : "0"}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Misc Charges (INR)"
                                name="miscChargesINR"
                                defaultValue={v.config?.miscChargesINR ? String(v.config.miscChargesINR) : "0"}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Shipping Charges %"
                                name="shippingChargesPercent"
                                defaultValue={v.config?.shippingChargesPercent ? String(v.config.shippingChargesPercent) : "0"}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Markup %"
                                name="markupPercent"
                                defaultValue={v.config?.markupPercent ? String(v.config.markupPercent) : "0"}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Tax %"
                                name="taxPercent"
                                defaultValue={v.config?.taxPercent ? String(v.config.taxPercent) : "0"}
                                inputMode="decimal"
                              />

                              <TextField
                                label="Compare-at Margin % (optional)"
                                name="compareAtMarginPercent"
                                defaultValue={v.config?.compareAtMarginPercent ? String(v.config.compareAtMarginPercent) : ""}
                                inputMode="decimal"
                              />
                            </InlineGrid>

                            <BlockStack>
                              <Button submit primary>
                                Save Config
                              </Button>
                            </BlockStack>
                          </fetcher.Form>
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

