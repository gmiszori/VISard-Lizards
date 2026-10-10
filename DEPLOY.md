# Test deployment

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
