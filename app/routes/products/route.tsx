import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
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
  /** ISO timestamp; bumps when config row updates so the form can remount with saved values */
  configUpdatedAt: string | null;
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

type ActionData =
  | { ok: true; updatedShopify: boolean; shopifyPrice?: string; shopifyCompareAtPrice?: string | null }
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
        configUpdatedAt: cfg?.updatedAt?.toISOString() ?? null,
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
  const { admin, session } = await authenticate.admin(request);
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
  const saved = await db.variantPricingConfig.upsert({
    where: {
      shop_variantGid: {
        shop,
        variantGid,
      },
    },
    update: common,
    create: common,
  });

  // If rates exist, immediately push the calculated price to Shopify so storefront updates too.
  const latestRates = await db.metalSpotRate.findFirst({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });

  if (!latestRates) {
    return json<ActionData>({
      ok: true,
      updatedShopify: false,
    });
  }

  const rateSnapshot = normalizeRateSnapshot(latestRates);
  const computed = computeVariantPrices(rateSnapshot as any, saved as VariantPricingConfig);

  const mutation = `#graphql
    mutation updateVariantNow($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price compareAtPrice }
        userErrors { field message }
      }
    }
  `;

  const gqlVariant: { id: string; price: string; compareAtPrice?: string } = {
    id: variantGid,
    price: asMoneyString(computed.priceINR),
  };
  if (computed.compareAtPriceINR !== null && computed.compareAtPriceINR !== undefined) {
    gqlVariant.compareAtPrice = asMoneyString(computed.compareAtPriceINR);
  }

  const resp = await admin.graphql(mutation, {
    variables: { productId: productGid, variants: [gqlVariant] },
  });
  const payload = await resp.json();
  const errors = payload?.data?.productVariantsBulkUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    return json<ActionData>(
      { ok: false, error: errors[0]?.message ?? "Shopify update error." },
      { status: 400 },
    );
  }

  await db.variantPricingConfig.update({
    where: { id: saved.id },
    data: {
      lastPriceINR: computed.priceINR,
      lastCompareAtPriceINR: computed.compareAtPriceINR,
    },
  });

  return json<ActionData>({
    ok: true,
    updatedShopify: true,
    shopifyPrice: asMoneyString(computed.priceINR),
    shopifyCompareAtPrice:
      computed.compareAtPriceINR === null ? null : asMoneyString(computed.compareAtPriceINR),
  });
};

function dToStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(v) : String(v);
}

function configToFieldState(cfg: VariantPricingConfig | undefined) {
  return {
    metalType: (cfg?.metalType ?? "GOLD") as string,
    goldPurityKarat:
      cfg?.goldPurityKarat !== null && cfg?.goldPurityKarat !== undefined
        ? String(cfg.goldPurityKarat)
        : "",
    metalWeightGrams: cfg?.metalWeightGrams != null ? dToStr(cfg.metalWeightGrams) : "",
    diamondPriceINR: cfg?.diamondPriceINR != null ? dToStr(cfg.diamondPriceINR) : "",
    gemstonePriceINR: cfg?.gemstonePriceINR != null ? dToStr(cfg.gemstonePriceINR) : "",
    makingChargesPercent: cfg?.makingChargesPercent != null ? dToStr(cfg.makingChargesPercent) : "0",
    wastagePercent: cfg?.wastagePercent != null ? dToStr(cfg.wastagePercent) : "0",
    miscChargesINR: cfg?.miscChargesINR != null ? dToStr(cfg.miscChargesINR) : "0",
    shippingChargesPercent:
      cfg?.shippingChargesPercent != null ? dToStr(cfg.shippingChargesPercent) : "0",
    markupPercent: cfg?.markupPercent != null ? dToStr(cfg.markupPercent) : "0",
    taxPercent: cfg?.taxPercent != null ? dToStr(cfg.taxPercent) : "0",
    compareAtMarginPercent:
      cfg?.compareAtMarginPercent != null ? dToStr(cfg.compareAtMarginPercent) : "",
  };
}

type FieldState = ReturnType<typeof configToFieldState>;

function VariantConfigForm({ v, productId }: { v: VariantRow; productId: string }) {
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const configVersion = v.configUpdatedAt ?? "new";
  const [open, setOpen] = useState(false);

  const [fields, setFields] = useState<FieldState>(() =>
    configToFieldState(v.config),
  );

  useEffect(() => {
    setFields(configToFieldState(v.config));
  }, [configVersion]);

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      if (fetcher.data.updatedShopify) {
        shopify.toast.show("Saved and Shopify price updated.");
      } else {
        shopify.toast.show("Saved. Set rates on Dashboard to auto-update Shopify.");
      }
    } else {
      shopify.toast.show(fetcher.data.error);
    }
  }, [fetcher.data, shopify]);

  const setF = <K extends keyof FieldState>(key: K, value: FieldState[K]) => {
    setFields((p) => ({ ...p, [key]: value }));
  };

  const panelId = useMemo(
    () => `variant-panel-${v.variantId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    [v.variantId],
  );

  const inputStyle: CSSProperties = {
    width: "100%",
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #c9cccf",
    fontSize: "0.925rem",
    background: "var(--p-color-bg-surface, #fff)",
    boxSizing: "border-box",
  };

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              {v.title}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              SKU: {v.sku ?? "—"} · Shopify: {v.shopifyPrice ?? "—"}
              {v.previewPrice ? ` · Preview: ${v.previewPrice}` : ""}
            </Text>
            {v.previewCompareAtPrice && (
              <Text as="p" variant="bodyMd" tone="subdued">
                Compare-at preview: {v.previewCompareAtPrice}
              </Text>
            )}
          </BlockStack>
          <Button
            ariaControls={panelId}
            ariaExpanded={open}
            onClick={() => setOpen((p) => !p)}
          >
            {open ? "Hide" : "Edit"}
          </Button>
        </InlineStack>

        <div id={panelId} style={{ display: open ? "block" : "none" }}>
          <BlockStack gap="300">
            <fetcher.Form method="post">
            <input type="hidden" name="intent" value="save_variant_config" />
            <input type="hidden" name="variantGid" value={v.variantId} />
            <input type="hidden" name="productGid" value={productId} />

            <InlineGrid columns={2} gap="300">
              <div>
                <Text as="h4" variant="headingXs">
                  Metal Type
                </Text>
                <select
                  name="metalType"
                  value={fields.metalType}
                  onChange={(e) => setF("metalType", e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #c9cccf",
                    fontSize: "0.925rem",
                    background: "var(--p-color-bg-surface, #fff)",
                  }}
                >
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="PLATINUM">Platinum</option>
                  <option value="PALLADIUM">Palladium</option>
                </select>
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Gold Purity Karat (24/22/18/14/9)
                </Text>
                <input
                  name="goldPurityKarat"
                  value={fields.goldPurityKarat}
                  onChange={(e) => setF("goldPurityKarat", e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Metal Weight (grams)
                </Text>
                <input
                  name="metalWeightGrams"
                  value={fields.metalWeightGrams}
                  onChange={(e) => setF("metalWeightGrams", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Diamond Price (INR)
                </Text>
                <input
                  name="diamondPriceINR"
                  value={fields.diamondPriceINR}
                  onChange={(e) => setF("diamondPriceINR", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Gemstone Price (INR)
                </Text>
                <input
                  name="gemstonePriceINR"
                  value={fields.gemstonePriceINR}
                  onChange={(e) => setF("gemstonePriceINR", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Making Charges %
                </Text>
                <input
                  name="makingChargesPercent"
                  value={fields.makingChargesPercent}
                  onChange={(e) => setF("makingChargesPercent", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Wastage %
                </Text>
                <input
                  name="wastagePercent"
                  value={fields.wastagePercent}
                  onChange={(e) => setF("wastagePercent", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Misc Charges (INR)
                </Text>
                <input
                  name="miscChargesINR"
                  value={fields.miscChargesINR}
                  onChange={(e) => setF("miscChargesINR", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Shipping Charges %
                </Text>
                <input
                  name="shippingChargesPercent"
                  value={fields.shippingChargesPercent}
                  onChange={(e) => setF("shippingChargesPercent", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Markup %
                </Text>
                <input
                  name="markupPercent"
                  value={fields.markupPercent}
                  onChange={(e) => setF("markupPercent", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Tax %
                </Text>
                <input
                  name="taxPercent"
                  value={fields.taxPercent}
                  onChange={(e) => setF("taxPercent", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>

              <div>
                <Text as="h4" variant="headingXs">
                  Compare-at Margin % (optional)
                </Text>
                <input
                  name="compareAtMarginPercent"
                  value={fields.compareAtMarginPercent}
                  onChange={(e) => setF("compareAtMarginPercent", e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>
            </InlineGrid>

            <BlockStack>
              <Button submit variant="primary" loading={fetcher.state !== "idle"}>
                Save Config
              </Button>
            </BlockStack>
          </fetcher.Form>
        </BlockStack>
        </div>
      </BlockStack>
    </Card>
  );
}

export default function Products() {
  const { products, ratesPresent } = useLoaderData<typeof loader>();

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
                      <VariantConfigForm key={v.variantId} v={v} productId={p.productId} />
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

