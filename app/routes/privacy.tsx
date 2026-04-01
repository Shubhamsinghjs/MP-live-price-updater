import { Page, Layout, Card, Text, BlockStack, Link } from "@shopify/polaris";

export default function PrivacyPolicy() {
  return (
    <Page title="Privacy Policy">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                MP-live-gold-price-updater (“the App”) helps merchants update Shopify variant prices based on
                metal spot rates and per-variant pricing inputs.
              </Text>

              <Text as="h2" variant="headingMd">
                Data we collect
              </Text>
              <Text as="p" variant="bodyMd">
                The App stores app configuration you enter, such as metal spot rates and per-variant pricing inputs
                (metal type, purity, weight, charges, taxes). The App also stores Shopify session tokens required to
                authenticate with Shopify Admin API.
              </Text>

              <Text as="h2" variant="headingMd">
                Customer data
              </Text>
              <Text as="p" variant="bodyMd">
                The App does not intentionally collect or store customer personal data (PII). Pricing calculations are
                based on product and variant configuration only.
              </Text>

              <Text as="h2" variant="headingMd">
                How we use data
              </Text>
              <Text as="p" variant="bodyMd">
                Configuration data is used to calculate variant prices and write updated prices back to Shopify.
                Sessions are used only to securely access Shopify APIs for your shop.
              </Text>

              <Text as="h2" variant="headingMd">
                Data retention and deletion
              </Text>
              <Text as="p" variant="bodyMd">
                App data is stored only as long as needed to provide the service. If the app is uninstalled, the app
                deletes stored sessions. Shopify compliance webhooks are supported to delete shop data upon request.
              </Text>

              <Text as="h2" variant="headingMd">
                Contact
              </Text>
              <Text as="p" variant="bodyMd">
                If you have questions about this Privacy Policy, contact{" "}
                <Link url="mailto:shubham@mumbaipixels.com">shubham@mumbaipixels.com</Link>.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

