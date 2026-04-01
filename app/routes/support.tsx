import { Page, Layout, Card, Text, BlockStack, Link } from "@shopify/polaris";

export default function Support() {
  return (
    <Page title="Support">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Need help with MP-live-gold-price-updater?
              </Text>

              <Text as="h2" variant="headingMd">
                Contact
              </Text>
              <Text as="p" variant="bodyMd">
                Email: <Link url="mailto:shubham@mumbaipixels.com">shubham@mumbaipixels.com</Link>
              </Text>

              <Text as="h2" variant="headingMd">
                What to include
              </Text>
              <Text as="p" variant="bodyMd">
                Please include your shop domain, the product/variant you were configuring, and a screenshot of any
                error message shown in the app.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

