# MP-live-gold-price-updater — App Store Listing (Copy/Paste)

## App name
MP-live-gold-price-updater

## Tagline (short)
Update gold & metal jewelry prices from live spot rates.

## Short description
Set metal spot rates and per-variant weights/charges. One click updates Shopify variant prices automatically.

## Long description
MP-live-gold-price-updater helps jewelry merchants keep prices accurate when metal rates move.

### Key features
- Edit metal spot rates (INR/gram): Gold (24K/22K/18K/14K/9K), Silver, Platinum, Palladium
- Configure each variant: metal type, purity, metal weight, wastage, making/shipping, taxes, diamond/gemstone/misc costs
- Auto-calculate price and (optional) compare-at price
- Save config in the app (no metafields required)
- Update Shopify variant prices instantly (and optionally in bulk from Dashboard)

### How pricing is calculated
- metalCost = ratePerGram × metalWeightGrams
- metalWithWastage = metalCost × (1 + wastage%)
- makingCharges = metalWithWastage × making%
- shippingCharges = metalWithWastage × shipping%
- base = metalWithWastage + makingCharges + shippingCharges + diamond + gemstone + misc
- markup = base × markup%
- tax = (base + markup) × tax%
- finalPrice = base + markup + tax
- compareAt (optional) = finalPrice × (1 + compareAtMargin%)

## Pricing
Free

## Support
- Support email: shubham@mumbaipixels.com
- Support URL: /support (your app URL + `/support`)

## Legal URLs
- Privacy Policy: /privacy
- Terms of Service: /terms

## Permissions explanation (for listing)
The app requires product read/write access to update variant prices in Shopify. It stores your pricing configuration (spot rates and per-variant inputs) and Shopify session tokens required to authenticate API requests. The app does not store customer personal data.

## Screenshots checklist (take from Shopify Admin)
1. Dashboard: Metal Spot Rates (filled sample values)
2. Products: Variant list collapsed (show “Edit” button)
3. Products: One variant expanded with filled inputs
4. Dashboard: “Refresh Prices” action + success toast
5. Shopify product variant price updated in Admin (proof)

## Demo video script (60–90 seconds)
1. Open Dashboard → set spot rates → Save
2. Open Products → expand one variant → fill weights/charges → Save Config (show toast “Shopify price updated”)
3. Open Shopify product in Admin / storefront → show updated price

