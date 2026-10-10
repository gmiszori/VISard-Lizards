# Test deployment

## Docker demo on a server

The hackathon managed address forwards plain HTTP to port 8080 on the VM. Copy `.env.example` to
`.env`, set `OPENAI_API_KEY` if AI search should be enabled, and run from the repository root:

```sh
docker compose up --build -d
```

Caddy serves the frontend over plain HTTP on `0.0.0.0:8080`; the backend is reachable only by Caddy
over the private Compose network. The hackathon managed address handles access control and TLS, so
no VM firewall rule or TLS configuration is needed. The `backend-data` volume persists the H2
database. Back up this volume before replacing the server or removing volumes. Do not commit `.env`.

The frontend is statically generated during the image build, so its initial menu is a snapshot and
falls back to bundled sample data if the backend is not reachable while building. Browser features
that call the API use the live backend through Caddy. Rebuild the frontend to refresh the initial
menu snapshot. The dedicated meal scraper remains disabled unless its external connector is set up.

Open the managed address provided by the hackathon to access the demo.

The GitHub Actions workflow in `.github/workflows/ci.yml` checks the Java backend and the Astro
frontend on pushes to `main` and on pull requests. The optional `render.yaml` Blueprint defines a
Spring Boot API and a static Astro site on Render. Adding the Blueprint file does not create the
services; a Render account owner must apply it once.

## Set up the Blueprint

1. In Render, choose **New > Blueprint** and select `gmiszori/VISard-Lizards` on `main`.
2. Apply `render.yaml`. The default service names target `visard-lizards-api.onrender.com` and
   `visard-lizards.onrender.com`; Render may give either service a suffix if a name is taken.
3. If the API host differs, update the static site's `PUBLIC_API_URL` to its actual HTTPS URL and
   redeploy the site. Confirm that `APP_CORS_ALLOWED_ORIGINS` on the API includes the site's origin.
4. Check `/api/meta`, `/`, `/settings`, and a `/canteen/{id}` page on the deployed hosts.

The static build waits for the API before generating pages. If it cannot be reached within five
minutes, the build fails so an older working deployment stays in place instead of silently
publishing bundled sample menus.

## Free-plan limits

The backend may sleep when idle. Its H2 database has no persistent disk on the free plan, so
ratings and crowd reports are lost after a restart or redeploy. Menus in the static HTML are
snapshots from the last successful frontend build; the backend can refresh its own data more often.
