import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Settings() {
  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <Text as="h2" variant="headingMd">
                Automation (Render Cron)
              </Text>
              <Text as="p" variant="bodyMd">
                MVP me “Refresh Prices” manual button se chalti hai (Dashboard page).
                Automatic ke liye is app me cron endpoint add kiya gaya hai:
                <Text as="span" fontWeight="semibold">
                  POST
                </Text>{" "}
                `/api/refresh` (metals + DB configs se).
              </Text>
              <Text as="p" variant="bodyMd">
                Is endpoint ko protect karne ke liye Render me header `x-refresh-secret`
                bhejna hoga. Secret value `CRON_REFRESH_SECRET` env var me set hoti hai.
              </Text>
            </Card>

            <Card>
              <Text as="h2" variant="headingMd">
                No Metafields Policy
              </Text>
              <Text as="p" variant="bodyMd">
                Aapke request ke mutabiq, is app me product/variant configuration metafields me store nahi hota.
                Data sirf app database me store hota hai aur price update Shopify se Admin API ke through hota hai.
              </Text>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

