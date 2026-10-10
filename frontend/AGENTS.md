## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Search handoff for Martin's agent

The user asked to simplify commit `c6a7b2d`. We kept multiword search, diet-label matching, umlaut folding, and a small set of German/English equivalents. We removed the delayed `/api/search` override because its canteen IDs could replace correct local dish matches after a pause; its request omitted descriptions and categories that the local matcher searched. We also removed typo guessing and broad related-food expansions (for example, tofu matching seitan), which produced surprising results. The overview now has one immediate, deterministic result set. Please preserve that behavior unless a future change can test the complete UI flow and show a clear user benefit.
