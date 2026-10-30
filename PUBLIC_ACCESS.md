# Public access for a temporary demonstration

Update server/index.js and js/app.js on the Windows computer, keeping the existing .env and database settings. Add PUBLIC_FULL_ACCESS=true to .env, stop the old server, then run npm.cmd start from the project directory. Keep cloudflared running.

PUBLIC_FULL_ACCESS=true allows anyone reaching the API to read, add, edit and delete database records without a password. API_ACCESS_TOKEN is bypassed in this mode. Set PUBLIC_FULL_ACCESS=false and retain a nonempty API_ACCESS_TOKEN to restore authentication. Set PUBLIC_READ_ONLY=false as well to require authentication for reads.

The Pages frontend defaults to https://expires-comment-chrome-soon.trycloudflare.com. A saved backend URL in the browser overrides that default. A new Quick Tunnel may have a new URL; update the frontend default in js/app.js and push it when that happens.

The database and Windows computer must remain running. SQL Server operations have not been revalidated from the cloud machine; verify record creation, editing and deletion with a disposable record on the actual Windows database.
