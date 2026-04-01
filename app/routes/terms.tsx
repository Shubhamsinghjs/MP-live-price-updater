import { Page, Layout, Card, Text, BlockStack, Link } from "@shopify/polaris";

export default function TermsOfService() {
  return (
    <Page title="Terms of Service">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                These Terms of Service (“Terms”) govern your use of MP-live-gold-price-updater (“the App”).
                By installing or using the App, you agree to these Terms.
              </Text>

              <Text as="h2" variant="headingMd">
                Service description
              </Text>
              <Text as="p" variant="bodyMd">
                The App calculates and updates Shopify variant prices based on metal spot rates and configuration
                you provide inside the App.
              </Text>

              <Text as="h2" variant="headingMd">
                Merchant responsibilities
              </Text>
              <Text as="p" variant="bodyMd">
                You are responsible for verifying pricing inputs, taxes, and final prices before selling products.
                The App updates variant prices in Shopify based on your saved settings.
              </Text>

              <Text as="h2" variant="headingMd">
                Availability and changes
              </Text>
              <Text as="p" variant="bodyMd">
                We may update the App from time to time. We do not guarantee uninterrupted availability.
              </Text>

              <Text as="h2" variant="headingMd">
                Limitation of liability
              </Text>
              <Text as="p" variant="bodyMd">
                To the maximum extent permitted by law, we are not liable for lost profits, lost revenue, or any
                indirect damages arising from use of the App.
              </Text>

              <Text as="h2" variant="headingMd">
                Contact
              </Text>
              <Text as="p" variant="bodyMd">
                For questions or support, email{" "}
                <Link url="mailto:shubham@mumbaipixels.com">shubham@mumbaipixels.com</Link>.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

