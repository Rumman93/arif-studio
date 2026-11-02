# Arif Studio website

Mobile-first website, accessories catalog and password-protected admin dashboard for **Arif Studio & Telecom**.

- Production: <https://arifstudio.pages.dev/>
- Accessories: <https://arifstudio.pages.dev/accessories>
- Admin: <https://arifstudio.pages.dev/admin/>
- Hosting: Cloudflare Pages (Direct Upload)
- Runtime: Cloudflare Pages Advanced Mode Worker
- Database and image storage: Cloudflare D1
- R2: not required

## What the website includes

- Bilingual Bangla/English homepage.
- Shop, agent, contact, map and opening-hours information.
- Editable proprietor and technician profile photos.
- Accessories catalog with product images, BDT prices, stock quantities, stock and price filters, and WhatsApp ordering.
- Homepage accessories preview with four products and a link to the full catalog.
- Mobile-friendly admin dashboard for products, website settings, profile photos and visitor analytics.
- Cloudflare Web Analytics data in the admin dashboard without storing visitor analytics in D1.
- Signed admin sessions that expire one hour after login.
- Password reconfirmation and a permanent-deletion warning before a product can be deleted.

## Technology and request flow

The frontend uses plain HTML, CSS and JavaScript. There is no framework build step.

`worker.js` handles API requests, authentication, D1 access, image responses and server-rendered catalog cards. Cloudflare Pages Advanced Mode expects that Worker at `public/_worker.js`. The generated file is intentionally ignored by Git and is created by:

```bash
npm run prepare:pages
```

Never edit `public/_worker.js` directly. Edit `worker.js`, then regenerate it.

Product records and optimized WebP image blobs are stored in the same D1 `products` row. Deleting a product therefore also removes its image data; no separate image garbage remains.

## Important project names

| Item | Value |
| --- | --- |
| Pages project | `arifstudio` |
| Production branch | `main` |
| Preview branch used by the npm script | `feature-accessories-catalog-admin` |
| D1 database | `arif-studio-products` |
| D1 binding | `DB` |
| Static/Pages output directory | `public` |
| Migration directory | `migrations` |

These values are configured in `wrangler.jsonc` and `package.json`. Run all commands from the repository root—the directory containing both files.

## Repository structure

```text
migrations/                 Versioned D1 migrations
public/                     Pages static output
  admin/index.html          Admin dashboard markup
  css/                      Homepage, catalog and admin styles
  images/                   Logos, brand assets and social preview
  js/                       Browser JavaScript
  _headers                  Cache and security headers
scripts/prepare-pages.mjs   Copies worker.js to public/_worker.js
test/                       Static and Worker integration tests
worker.js                   Pages Worker and APIs
wrangler.jsonc              Cloudflare Pages and D1 configuration
package.json                Local, test and preview deployment commands
```

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- A Cloudflare account with access to the `arifstudio` Pages project and `arif-studio-products` D1 database.
- Wrangler authentication for remote commands.

Confirm the tools:

```bash
node --version
npm --version
npx wrangler --version
```

## First local setup

### 1. Enter the repository

Always run npm and Wrangler commands from the project directory:

```bash
cd ~/MiliStudio
```

If npm reports that `/home/<user>/package.json` does not exist, you are in the wrong directory. Run `pwd` and return to the repository root.

### 2. Install dependencies

```bash
npm install
```

Use `npm install` for this existing checkout so the lock file remains authoritative. Do not install a global Wrangler version; use the project version through `npx wrangler` or the npm scripts.

### 3. Create local secrets

Create `.dev.vars` beside `wrangler.jsonc`:

```dotenv
ADMIN_PASSWORD="use-a-private-local-password"
SESSION_SECRET="use-a-different-long-random-value"
# Optional: required only to load real Cloudflare visitor analytics locally.
CLOUDFLARE_ANALYTICS_TOKEN=""
```

Generate a strong signing secret if OpenSSL is available:

```bash
openssl rand -hex 32
```

Security rules:

- Never commit `.dev.vars`, `.env`, API tokens, admin passwords or session secrets.
- `.dev.vars` and `.env` are ignored by Git.
- Use different values for `ADMIN_PASSWORD` and `SESSION_SECRET`.
- Prefer a separate local password instead of copying the production password.
- If `.dev.vars` exists, do not also depend on `.env`; Wrangler gives `.dev.vars` precedence.

### 4. Apply migrations to the local D1 database

Check pending local migrations:

```bash
npx wrangler d1 migrations list arif-studio-products --local
```

Apply them:

```bash
npx wrangler d1 migrations apply arif-studio-products --local
```

Local D1 state is stored under `.wrangler/` and is separate from the remote database.

### 5. Start the complete local website

```bash
npm run dev
```

Use the URL Wrangler prints, normally `http://localhost:8788`.

Test these routes:

- `/` — homepage
- `/accessories` — complete accessories catalog
- `/admin/` — admin login and dashboard
- `/api/products` — public product JSON
- `/api/site-settings` — public website settings JSON

Stop the local server with `Ctrl+C`.

The homepage can be viewed with a simple static server, but the catalog, admin, D1 data, images and APIs require Wrangler:

```bash
python3 -m http.server 8000 --directory public
```

## Everyday workflow after making changes

Use this order after every code or content change:

1. Make changes on a feature branch, not `main`.
2. If the schema changed, create a new migration and apply it locally.
3. Run the complete checks.
4. Test locally when the change affects behavior or layout.
5. Confirm which D1 database the Preview environment uses.
6. Apply a required migration to that preview-bound database before deploying code that needs it.
7. Deploy and test the preview on mobile and desktop.
8. Apply the migration to the production D1 database if it has not already been applied there.
9. Deploy production only after preview approval.
10. Run production smoke tests, then commit and push the feature branch separately.

Quick local gate:

```bash
npm run check
npm run prepare:pages
cmp -s worker.js public/_worker.js && echo "Worker bundle matches"
```

`npm run check` validates JavaScript syntax and runs all static and Worker integration tests. The tests cover local assets, translation keys, authentication, same-origin protection, products, stock, images, settings, profile photos, caching, analytics and secure deletion.

## Database migrations

### Current migrations

| Migration | Purpose |
| --- | --- |
| `0001_products.sql` | Products and failed-login tracking |
| `0002_d1_product_images.sql` | Product image blob and ETag columns |
| `0003_site_settings.sql` | Permanent editable website settings row |
| `0004_profile_images.sql` | Proprietor and technician image rows |
| `0005_product_stock_quantity.sql` | Product stock quantity, default `10`, range `0–1000` |

### Create a migration

Never edit a migration that has already been applied to any shared database. Generate the next migration:

```bash
npx wrangler d1 migrations create arif-studio-products descriptive_change_name
```

Wrangler creates the next numbered SQL file inside `migrations/`. Review it carefully before applying it.

Migration rules:

- Prefer additive changes.
- Preserve existing data.
- Give new columns safe defaults when old rows require a value.
- Use `IF NOT EXISTS` where SQLite supports it.
- SQLite does **not** support `ADD COLUMN IF NOT EXISTS`.
- Do not manually execute an `ALTER TABLE` migration twice.
- Do not rename, reorder or edit an applied migration.
- For a correction, create a new forward migration.

Wrangler records applied migration filenames in D1's `d1_migrations` table. Re-running `migrations apply` safely skips migrations already recorded as applied; this does not make the raw SQL itself repeatable.

### Local migration commands

List pending migrations:

```bash
npx wrangler d1 migrations list arif-studio-products --local
```

Apply pending migrations:

```bash
npx wrangler d1 migrations apply arif-studio-products --local
```

Run the application and tests after applying them:

```bash
npm run check
npm run dev
```

### Remote migration commands

Authenticate first:

```bash
npx wrangler login
npx wrangler whoami
```

List pending remote migrations without changing data:

```bash
npx wrangler d1 migrations list arif-studio-products --remote
```

Apply pending remote migrations:

```bash
npx wrangler d1 migrations apply arif-studio-products --remote
```

Wrangler shows the pending files and asks for confirmation. Read the list before accepting. Cloudflare captures a D1 backup when migrations are applied.

Apply a required remote migration **before** deploying code that reads its new table or column. Do not apply migrations just because a deployment contains frontend-only changes.

### Preview database warning

`wrangler.jsonc` currently declares one remote D1 database and does not declare a separate `preview_database_id`. Do not assume preview data is isolated from production.

Before adding, editing or deleting products through a preview deployment, open Cloudflare Dashboard → Workers & Pages → `arifstudio` → Settings → Bindings and confirm which D1 database the Preview environment uses. If Preview uses `arif-studio-products`, preview admin actions affect production data.

If a separate Preview D1 database has been configured, list and apply its migrations with:

```bash
npx wrangler d1 migrations list arif-studio-products --preview
npx wrangler d1 migrations apply arif-studio-products --preview
```

These commands require a valid preview database configuration. If Preview points to the production database instead, `--preview` is not a substitute for that missing isolation: use the normal `--remote` workflow, keep the migration backward-compatible with the currently deployed production code, and avoid destructive preview testing.

## Cloudflare configuration

### Authenticate Wrangler

```bash
npx wrangler login
npx wrangler whoami
```

### Required Pages bindings and secrets

In Cloudflare Dashboard → Workers & Pages → `arifstudio` → Settings, configure both **Production** and **Preview** environments as required.

Bindings:

| Type | Name | Value |
| --- | --- | --- |
| D1 database | `DB` | `arif-studio-products` or the intentionally selected preview database |

Encrypted secrets:

| Secret | Required | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | Login and product-deletion reconfirmation |
| `SESSION_SECRET` | Yes | Signs one-hour admin sessions |
| `CLOUDFLARE_ANALYTICS_TOKEN` | Optional | Loads visitor analytics in the admin dashboard |

Use Cloudflare's encrypted **Secret** type, not a plain-text variable. Set secrets before the deployment that needs them. Preview and Production settings are separate in the dashboard, so verify both.

Web Analytics itself must also be enabled for the Pages project under Metrics. Cloudflare injects its beacon during deployment. The API token is only for reading aggregated analytics into the admin dashboard.

## Deploy a preview

A preview deployment does not replace `arifstudio.pages.dev`.

For schema-changing releases, confirm the Preview D1 binding and apply the migration to that database before deploying the preview code. A frontend-only or Worker-only release does not need a migration command.

### Standard preview command

From the repository root:

```bash
npm run check
npm run deploy:preview
```

The script regenerates `public/_worker.js` and deploys `public` to branch `feature-accessories-catalog-admin`:

```bash
npm run prepare:pages
npx wrangler pages deploy public --project-name arifstudio --branch feature-accessories-catalog-admin
```

Wrangler prints an immutable deployment URL and a branch alias similar to:

```text
https://<deployment-id>.arifstudio.pages.dev
https://feature-accessories-catalog-admin.arifstudio.pages.dev
```

To use another preview branch:

```bash
npm run prepare:pages
npx wrangler pages deploy public --project-name arifstudio --branch your-preview-branch
```

### Preview test checklist

Test with the exact URL Wrangler prints:

- Homepage loads in Bangla and English.
- Header, services, agent numbers, contact and map links work.
- Four accessories appear under the agent-number section.
- “আরও দেখুন” opens the full catalog in a new tab.
- Catalog cards show images, BDT prices and stock quantities.
- In-stock and minimum/maximum price filters work.
- WhatsApp order opens with the product name and price.
- Admin login succeeds.
- Product add and edit work.
- Delete shows the permanent warning, rejects an incorrect password and only deletes with the correct password.
- Website settings save without removing products.
- Proprietor and technician photos upload and replace correctly.
- Visitor analytics loads when its token is configured.
- Layout works at narrow mobile widths without horizontal scrolling.
- Browser console and Network panels show no unexpected errors.

Do not create throwaway preview products unless you have confirmed Preview uses an isolated D1 database.

## Deploy production

Production deployment replaces the code served by `https://arifstudio.pages.dev/`. Use branch `main` only after the preview has passed.

### Production gate

```bash
cd ~/MiliStudio
npm install
npm run check
npm run prepare:pages
cmp -s worker.js public/_worker.js && echo "Worker bundle matches"
```

If a required migration exists, list and apply it before deployment:

```bash
npx wrangler d1 migrations list arif-studio-products --remote
npx wrangler d1 migrations apply arif-studio-products --remote
```

Skip the apply command when there are no pending migrations or when the release has no schema change.

### Production deploy command

```bash
npx wrangler pages deploy public --project-name arifstudio --branch main
```

Wrangler must report all of the following before the deployment is considered successful:

- Assets uploaded or already present.
- `_headers` uploaded.
- Worker compiled successfully.
- Worker bundle uploaded.
- Deployment complete with an immutable `*.arifstudio.pages.dev` URL.

### Production smoke test

Check both the immutable deployment URL and `https://arifstudio.pages.dev/`:

- `/` returns the homepage.
- `/accessories` contains product cards and filters.
- `/api/products` returns JSON with `stockQuantity`.
- `/api/site-settings` returns the current public settings.
- `/admin/` loads but is not indexed.
- `/api/admin/session` responds without exposing secrets.
- A known product image URL returns `image/webp`.
- Admin login and logout work.
- The one-hour session and password-protected delete flow work.
- Existing products, settings and profile photos are unchanged.

Never use a real product to test deletion in production. Test destructive behavior locally or against an isolated preview database.

### List deployments

```bash
npx wrangler pages deployment list --project-name arifstudio --environment production
npx wrangler pages deployment list --project-name arifstudio --environment preview
```

## Roll back a bad production deployment

Application rollback does not require another upload:

1. Open Cloudflare Dashboard → Workers & Pages → `arifstudio` → Deployments.
2. Find a previous successful **production** deployment.
3. Open its three-dot menu.
4. Select **Rollback to this deployment** and confirm.
5. Repeat the production smoke tests.

Preview deployments cannot be selected as production rollback targets.

A Pages rollback changes application code and assets only. It does **not** undo a D1 migration or restore changed product data. Database problems require a reviewed forward migration or a deliberate D1 backup restore through Cloudflare.

## Git workflow

Production deployment and Git push are separate operations.

```bash
git status
git branch --show-current
git diff --check
git add <reviewed-files>
git commit -m "Describe the feature and date"
git push origin <feature-branch>
```

Rules:

- Work on a feature branch; do not develop directly on `main`.
- Review changed files before staging.
- Never commit `.dev.vars`, `.env`, `.wrangler/`, secrets or `public/_worker.js`.
- Do not force-push unless explicitly required and reviewed.
- A production deployment does not automatically push source code to GitHub.

## Editing content and branding

### Website settings

Sign in at `/admin/` and open **Website Settings**. The permanent settings row can be edited but not deleted.

Editable values include:

- Shop names.
- Proprietor and technician names, phones and profile photos.
- Main phone, WhatsApp, email and Facebook.
- bKash, Nagad, Rocket and Upay agent numbers.
- Map URL and bilingual address.
- Opening and closing times and weekly closed days.

Leave an agent number empty to hide that brand. Leave Facebook empty to hide the Facebook button. `public/config.js` remains the immediate browser fallback and the seed source for a new database.

### Homepage text

- Bangla text: `public/index.html`.
- English translations: `public/js/en.js`.
- Translation keys must match the homepage `data-i18n` values.
- Use `<em>…</em>` for highlighted heading words.

### Logo and images

- Brand assets: `public/images/logo/`.
- MFS logos: `public/images/mfs/`.
- Operator and utility logos: `public/images/brands/`.
- Social preview: `public/images/og.jpg` at 1200×630.

Keep an existing filename when replacing a brand asset, or update every HTML/CSS reference and run `npm run check`.

## Security and performance behavior

- Admin cookies are signed, `HttpOnly`, `Secure` and `SameSite=Strict`.
- Admin sessions have an absolute one-hour lifetime; activity does not extend them.
- Product writes require a valid session and a same-origin request.
- Product deletion additionally requires the current admin password.
- Failed logins are rate-limited.
- Admin responses use `no-store`, and admin pages are marked `noindex`.
- Product and profile uploads are converted to WebP in the browser and validated again by the Worker.
- Optimized uploaded files are limited to 500 KB.
- Product images preserve their original aspect ratio and use lazy loading.
- Product and settings reads use short browser/CDN caching plus Cloudflare Cache API caching to reduce D1 reads.
- Product writes invalidate the shared product cache.
- Profile images and product images use versioned immutable URLs.
- Analytics reads Cloudflare's aggregated API and does not add D1 storage.
- Security headers and Content Security Policy are defined in `public/_headers` and reinforced by the Worker.

## Troubleshooting

### `npm ERR! enoent ... package.json`

You ran npm outside the repository:

```bash
cd ~/MiliStudio
npm install
```

### `No configuration file found`

Run Wrangler from the directory containing `wrangler.jsonc`:

```bash
cd ~/MiliStudio
```

### Compatibility date is newer than the local runtime

Install the versions recorded in `package-lock.json`:

```bash
npm install
npx wrangler --version
```

Do not change `compatibility_date` merely to hide an installation problem.

### Admin login returns `500`

Check the Pages Production/Preview environment separately:

- `ADMIN_PASSWORD` exists as an encrypted secret.
- `SESSION_SECRET` exists as a different encrypted secret.
- D1 binding name is exactly `DB`.
- All required migrations were applied to the database bound to that environment.

Redeploy after adding or changing Pages secrets.

### Visitor analytics says it is not configured

- Enable Web Analytics under the Pages project's Metrics tab.
- Add `CLOUDFLARE_ANALYTICS_TOKEN` as an encrypted Pages secret.
- Configure the secret in the correct Production or Preview environment.
- Redeploy, visit the public website and allow Cloudflare time to aggregate data.

### Products load but images do not

- Confirm migrations `0002_d1_product_images.sql` and later were applied.
- Open the product image request in the browser Network panel.
- Confirm it returns `200` and `Content-Type: image/webp`.
- Do not add an R2 binding; this project stores images in D1.

### Duplicate-column error while applying a migration

- Do not manually rerun raw `ALTER TABLE` SQL.
- Check what Wrangler considers pending:

```bash
npx wrangler d1 migrations list arif-studio-products --local
npx wrangler d1 migrations list arif-studio-products --remote
```

- Never delete migration history to force a migration to run again.
- Create a new corrective migration if the database and migration history disagree.

### Preview works but production fails

Preview and Production can have different secrets and bindings. Compare both environments in Pages Settings, then verify that production has `DB`, `ADMIN_PASSWORD`, `SESSION_SECRET` and, when needed, `CLOUDFLARE_ANALYTICS_TOKEN`.

### Deployment succeeded but the domain looks old

- Open the immutable deployment URL Wrangler printed.
- Hard-refresh the production URL.
- Check the latest production deployment:

```bash
npx wrangler pages deployment list --project-name arifstudio --environment production
```

- Confirm the deployment used `--branch main`.

## Official Cloudflare references

- [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/)
- [Pages bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
