import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook (App Store apps):
 * - shop/redact
 *
 * Delete shop-specific data we store (sessions, rates, variant configs).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await Promise.all([
    db.variantPricingConfig.deleteMany({ where: { shop } }),
    db.metalSpotRate.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};

