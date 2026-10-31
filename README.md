# Arif Studio website

Static site: plain HTML, CSS and JS. No build step. First load ≈ 20 KB of our own files
plus the official MFS logos (≈ 24 KB) and web fonts from Google Fonts (cached): Anek Bangla 700/800
for headings, Hind Siliguri 400/500/600 for text.

Theme: Monzo-style — white page, Hot Coral `#ff4f40` + navy `#091723` blocks, mist-grey cards, pill buttons; all colours are CSS
variables at the top of `css/style.css`.

## Change phone / agent numbers, address, hours
Edit **`config.js`** only, then deploy again.
- Leave an agent number empty (`""`) to hide that brand everywhere.
- Leave `facebook` empty to hide the Facebook button.

## Edit text
- Bangla: directly in `index.html`
- English: `js/en.js` (keys match `data-i18n="..."` in `index.html`)
- In headings, wrap the highlighted words in `<em>…</em>`.

## Arif Studio logo
A camera whose lens is a ৳ coin — photo studio + mobile-banking agent in one mark. `images/logo/` holds the brand assets:
- `mark.svg` — icon (also used as `favicon.svg`); `mark-white.svg` for dark backgrounds; `mark-mono.svg` single-colour for stamps/print
- `logo-bn.svg`, `logo-en.svg` — horizontal lockups; `*-white.svg` versions for the blue header
- `logo-stacked.svg` — for signboards and social avatars
- PNG exports: `mark-512.png`, `mark-192.png`, `logo-bn-1740.png`, `logo-en-1740.png`, `logo-stacked-900.png`
- `images/og.jpg` — 1200×630 preview shown when the link is shared on WhatsApp/Facebook
Colours: navy `#091723`, coral `#ff4f40`. Fonts: Noto Serif Bengali (headings), Hind Siliguri (text).

## Official logos
`images/mfs/` holds the official bKash (SVG from bkash.com), Nagad (nagad.com.bd), Rocket
(dutchbanglabank.com) and Upay (upaybd.com) logos. They are trademarks of those companies, shown
here to indicate agent status. If a company sends updated brand files, replace the file with the
same name.

## Operator & utility logos
`images/brands/` holds logos shown inside the service detail panels: Grameenphone, Robi, Banglalink
(from the operators' own sites), BPDB (Wikipedia), Teletalk (teletalk.com.bd). Airtel was rebranded **Cirkle** (Aug 2026); its logo is `cirkle.svg` from Wikimedia Commons.
No official logo could be found for পল্লী বিদ্যুৎ (BREB) or বাখরাবাদ গ্যাস — their gov.bd sites only serve the
national emblem — so those appear as text tiles. Drop a `breb.png` / `bakhrabad.png` in this folder and swap
the text tile for an `<img>` in `index.html` if you obtain them.

## Drop the web font (optional)
Delete the three `fonts.googleapis.com` / `fonts.gstatic.com` lines in the `<head>` of
`index.html`. Headings then use the phone's own Bangla font.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Deploy (Cloudflare, free) — no commands needed
Upload the whole folder in the Cloudflare dashboard (Workers & Pages → your project → upload).
Make sure the `_headers` file is included: it tells browsers to re-check HTML, CSS, JS and
`config.js` on every visit, so changes appear on phones immediately without any refresh.
Images and logos are cached for a week (they rarely change).
