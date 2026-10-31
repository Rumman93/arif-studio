# Arif Studio website

Static site: plain HTML, CSS and JS. No build step. First load ≈ 20 KB of our own files
plus the official MFS logos (≈ 24 KB) and web fonts from Google Fonts (cached): Anek Bangla 700/800
for headings, Hind Siliguri 400/500/600 for text.

Theme: Monzo-style — white page, Hot Coral `#ff4f40` + navy `#091723` blocks, mist-grey cards, pill buttons; all colours are CSS
variables at the top of `public/css/style.css`.

## Change phone / agent numbers, address, hours
Edit **`public/config.js`** only, then deploy again.
- Leave an agent number empty (`""`) to hide that brand everywhere.
- Leave `facebook` empty to hide the Facebook button.

## Edit text
- Bangla: directly in `public/index.html`
- English: `public/js/en.js` (keys match `data-i18n="..."` in `public/index.html`)
- In headings, wrap the highlighted words in `<em>…</em>`.

## Arif Studio logo
A camera whose lens is a ৳ coin — photo studio + mobile-banking agent in one mark. `public/images/logo/` holds the brand assets:
- `mark.svg` — icon (also used as `favicon.svg`); `mark-white.svg` for dark backgrounds; `mark-mono.svg` single-colour for stamps/print
- `logo-bn.svg`, `logo-en.svg` — horizontal lockups; `*-white.svg` versions for the blue header
- `logo-stacked.svg` — for signboards and social avatars
- PNG exports: `mark-512.png`, `mark-192.png`, `logo-bn-1740.png`, `logo-en-1740.png`, `logo-stacked-900.png`
- `public/images/og.jpg` — 1200×630 preview shown when the link is shared on WhatsApp/Facebook
Colours: navy `#091723`, coral `#ff4f40`. Fonts: Noto Serif Bengali (headings), Hind Siliguri (text).

## Official logos
`public/images/mfs/` holds the official bKash (SVG from bkash.com), Nagad (nagad.com.bd), Rocket
(dutchbanglabank.com) and Upay (upaybd.com) logos. They are trademarks of those companies, shown
here to indicate agent status. If a company sends updated brand files, replace the file with the
same name.

## Operator & utility logos
`public/images/brands/` holds logos shown inside the service detail panels: Grameenphone, Robi, Banglalink
(from the operators' own sites), BPDB (Wikipedia), Teletalk (teletalk.com.bd). Airtel was rebranded **Cirkle** (Aug 2026); its logo is `cirkle.svg` from Wikimedia Commons.
No official logo could be found for পল্লী বিদ্যুৎ (BREB) or বাখরাবাদ গ্যাস — their gov.bd sites only serve the
national emblem — so those appear as text tiles. Drop a `breb.png` / `bakhrabad.png` in this folder and swap
the text tile for an `<img>` in `public/index.html` if you obtain them.

## Drop the web font (optional)
Delete the three `fonts.googleapis.com` / `fonts.gstatic.com` lines in the `<head>` of
`public/index.html`. Headings then use the phone's own Bangla font.

## Run locally

The homepage alone can still be previewed with `python3 -m http.server 8000 --directory public`. The accessories
catalog and admin need Cloudflare Pages Functions and the D1 binding:

```bash
npm install
npx wrangler d1 migrations apply arif-studio-products --local
npm run dev
```

Create a local `.dev.vars` file (it is ignored by Git) containing:

```text
ADMIN_PASSWORD=choose-a-private-admin-password
SESSION_SECRET=choose-a-long-random-value
```

Open `/accessories.html` for the public catalog or `/admin/` to manage products.

## Accessories catalog and admin

- Public product cards show the image, product name, price and stock status.
- The admin can add, edit and delete products from a phone at `/admin/`.
- Images are resized in the browser to a maximum width or height of 720 px and converted to WebP
  before upload. Their original proportions are preserved and product cards never stretch or crop them.
- Product records and optimized images live in Cloudflare D1, so this project does not require R2.
  Images are served through the Pages Function with long-lived immutable caching.
- The admin password and session signing key are Cloudflare secrets and are never committed.

## First Cloudflare Pages deployment

The existing `arifstudio` production deployment remains untouched while you test this feature on a
preview deployment. The D1 database has already been created and its ID is configured in `wrangler.jsonc`.
Sign in and apply both migrations once:

```bash
npx wrangler login
npx wrangler d1 migrations apply arif-studio-products --remote
```

Configure the two Pages secrets. Wrangler will securely prompt for each value; use your chosen admin
password first and a different, long random value second:

```bash
npx wrangler pages secret put ADMIN_PASSWORD --project-name arifstudio --env preview
npx wrangler pages secret put SESSION_SECRET --project-name arifstudio --env preview
```

Create a preview deployment on a separate branch URL (this does not replace production):

```bash
npm run deploy:preview
```

Wrangler prints the preview URL when deployment finishes. Only merge or deploy to the production
branch after testing the homepage, accessories page, login and product management there.

The migrations use text UUIDs, so there is no numeric ID sequence to reset. For later database
changes, add a new migration instead of editing an already-applied migration.

## Security and performance notes

- Admin sessions use signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookies and expire after 12 hours.
- Product writes require a valid session and a same-origin request. Failed logins are rate-limited.
- Uploads are validated again by the Pages Function and are limited to optimized WebP files up to 500 KB.
- Public product data uses one D1 query and a short browser cache; product images are lazy-loaded.
- `public/_headers` keeps static files fresh. The Pages Function also applies security headers,
  a content security policy and no-store caching to the admin page.

## Checks

```bash
npm run check
```
