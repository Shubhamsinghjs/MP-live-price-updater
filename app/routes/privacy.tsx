export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: "0 16px", lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p>
        MP-live-gold-price-updater helps merchants update Shopify variant prices based on metal spot rates and
        per-variant pricing inputs.
      </p>

      <h2>Data we collect</h2>
      <p>
        The app stores pricing configuration data (spot rates and per-variant inputs) and Shopify session tokens
        required for authenticated Shopify API access.
      </p>

      <h2>Customer data</h2>
      <p>
        The app does not intentionally collect or store customer personal data (PII).
      </p>

      <h2>How we use data</h2>
      <p>
        Configuration data is used to calculate and update variant prices in Shopify.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Data is retained only as long as required to provide the service. Compliance webhook requests are supported
        for data deletion.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:shubham@mumbaipixels.com">shubham@mumbaipixels.com</a>
      </p>
    </main>
  );
}
