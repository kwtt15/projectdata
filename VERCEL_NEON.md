# WASHY on Vercel + Neon

The free tiers have usage limits and cold starts. This setup uses PostgreSQL on Neon; the existing Windows SQL Server remains unchanged. No credentials are committed. Vercel serves both the frontend and API from the same origin, so a Windows computer or Cloudflare Tunnel is no longer needed after deployment.

## 1. Create a Neon project
Choose the Free plan and Singapore. Keep the pooled PostgreSQL connection string private.

## 2. Import your current Windows database (recommended)
On the Windows computer, stop the local Node server and update the source from this repository, preserving the existing .env. Do not add DATABASE_URL to the Windows .env while exporting. From the directory containing package.json:

```powershell
npm.cmd ci
npm.cmd run export:sqlserver
```

This reads the configured SQL Server and creates `exports/windows_data.sql`. It does not modify SQL Server. The export includes actual current records, IDs, stock and credit balances; it is excluded from Git. Do not post the export in chat or on GitHub.

In your NEW EMPTY Neon project's SQL Editor:

1. Run the contents of `database/postgres/neon_schema.sql`.
2. Run the contents of the private `exports/windows_data.sql` generated on Windows.
3. Check counts with `SELECT COUNT(*) FROM dbo.customers; SELECT COUNT(*) FROM dbo.bookings;` and compare with the export command's output.

The import runs in a transaction, rejects nonempty target tables and does not replay historical credit/stock deductions. It temporarily disables only the application triggers while importing recorded historical states; constraints and foreign keys remain enabled. Triggers are re-enabled before commit.

Alternatively, for the sample data shipped in the original ZIP only, run `database/postgres/neon_setup.sql` instead of the two steps above. It creates schema and sample history in one transaction (100 customers, 120 vehicles, 630 bookings); it does NOT include subsequent changes from your Windows database. Choose one path, do not run both on the same database. No automatic migration/seed runs during Vercel builds or API requests.

## 3. Configure Vercel
Import `kwtt15/projectdata`, branch `main`. Root directory `./`, preset Other, default install command. The checked-in vercel.json runs `npm run build:public` and publishes only `public`, plus the Node function under `api`. Leave Build/Output overrides off.

Add environment variables for Production and Preview:

- `DATABASE_URL`: the complete pooled Neon PostgreSQL URL, without surrounding quotes or a `DATABASE_URL=` prefix. Enter securely in Vercel, not in GitHub or chat.
- `PUBLIC_FULL_ACCESS`: `true` to preserve the public editing mode explicitly requested for this demonstration. Anyone reaching the API can read, add, edit and delete data under the application rules. For a private deployment use `false` and set a nonempty `API_ACCESS_TOKEN` instead.

Do not copy SQL Server DB_* settings or the temporary Tunnel URL to Vercel. The PostgreSQL driver validates TLS certificates for Neon. Deploy the latest commit after data import. An existing deployment requires Redeploy after environment-variable changes.

## 4. Verify before turning off Windows
Open the Vercel URL `/api/health`; require `ok:true` and `engine:PostgreSQL`. Open `/dashboard.html` in a private browser window. Compare customers/bookings with your source database. Create, edit and delete a disposable customer; test booking, status, material use and payment with disposable data. Only after these succeed should you stop the local services. Normal application restrictions on changing booking history remain in place.

The live Neon connection, Vercel runtime and current Windows export require checks in the user's account; local tests do not establish those are deployed.

## Development checks

```sh
npm ci
npm run test:postgres
npm run build:public
node scripts/test-connection.cjs
```

The PostgreSQL integration suite uses PGlite (PostgreSQL WASM), exercises real schema, triggers/functions and Express API, and does not connect to the user's database. It does not test network connectivity, Neon pool behavior, independent concurrent database sessions or Vercel routing. A DATABASE_URL selects the PostgreSQL driver; without it the original mssql workflow is retained.
