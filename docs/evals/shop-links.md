# Shopping increment — 1 November 2026

Runtime has no configured shopping/search provider. `ShopLinks` therefore offers explicitly labelled UK retailer searches, making no product, inventory, price or fibre claims. No paid calls, affiliates, accounts, tracking or fetching are added. Only visible editable garment terms leave the app when a retailer link is clicked; consultation descriptions and constraints stay local. Fields now start with bounded allowlisted clothing vocabulary extracted from the approved look description/title. Per-garment chips preserve separate pieces; users can edit terms. Emails and URLs are removed before extraction; raw consultation prose is never copied into outgoing search terms. No wool/cashmere terms are extracted because they may express an avoidance.

Mount from the exact approved output, inside the existing `approved` section:

```tsx
import ShopLinks from './shop-links';
// output.board.options is structurally compatible. A changed revision resets searches.
<ShopLinks approved={approved} outputId={output.id}
  documentRevision={output.documentRevision} looks={output.board.options}
  constraints={/* explicit saved practical requirements only; omit if unavailable */ []} />
```

The component must not be presented for a rejected/replaced sheet. `approved` should already compare both output ID and document revision, as the existing style page does. It does not authenticate or approve anything itself.

## Fictional-board source proof (never shipped as user results)

Opened live primary retailer pages on 1 November 2026. Board reference: private synthesis trial, four textured, relaxed, wool-free looks. No private asset copied into this repository.

- [M&S pure linen drawstring wide-leg trousers](https://www.marksandspencer.com/pure-linen-high-waisted-wide-leg-trousers/p/clp60749555): similar to the fluid pale trousers in look 1. Page describes high waist, drawstring and wide leg; composition lists linen with polyester/cotton pocketing. Ecru Mix displayed. These are candidate characteristics, not a verified fit, exact colour match or size availability.
- [White Stuff June linen notch-neck dress](https://www.whitestuff.com/p/7067/june-linen-notch-neck-dress/NAVY_PR): similar open neckline, short sleeves and A-line movement to look 3; primary page lists 100% linen. Significant mismatch: navy print and above-knee length, whereas the board has a plain muted blue midi. Reject if plain midi is essential. Size/stock not confirmed.
- [Seasalt pure cotton notch-neck top at M&S](https://www.marksandspencer.com/pure-cotton-notch-neck-top/p/clp23028425?color=TEAL): unusually close texture/neckline candidate for look 1; primary page lists crinkly cotton, notch V and short grown-on sleeves. **Rejected for shopping: page explicitly says no longer available.** Sleeve shape also differs from the board’s elbow sleeve. This is why search snippets alone are insufficient.

Browser verification used T3 first, which returned “calling provider no longer owns an active thread run”; existing installed Playwright + Chrome was used as fallback. Actual M&S site search submitted “teal top” and navigated to `/search?searchTerm=teal+top&intid=normal&searchType=normal`, rendering “Search results for teal top” and 63 items. The initial guessed `/l/search` endpoint returned 404 and was corrected. John Lewis search failed with HTTP2 protocol error and then timed out with HTTP2 disabled, so it was removed from shipped links rather than described as working.

Actual React component rendered from fictional board descriptors at 1200px and 390px. Both had contentWidth equal to viewport width. Initial query “teal textured blouse”; separate “cream fluid trousers” chip; constraints shown locally. Screenshots remain ephemeral `/tmp/stylist-shop-1200.png` and `/tmp/stylist-shop-390.png`, not committed. This proves the component presentation, not a production approved-user session or interactive hydration.

## Remaining work for verified product recommendations

A configured runtime product/search provider, per-piece garment metadata tied to the approved revision, primary-page verification, timestamps, explicit mismatch and constraint evidence, and current size/region checks are needed. The current feature intentionally does not claim this capability. No budget question is required for retailer search; users apply budget and size filters on the retailer.
