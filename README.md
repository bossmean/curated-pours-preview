# Curated Pours planning tools

Three lead generating calculators that share one drink model, one design
system and one lead pipeline. Each asks six short questions, shows the whole
result before any form appears, then offers the emailed version or a quote.

**Live preview:** https://bossmean.github.io/curated-pours-preview/

| Tool | Page | What it answers |
| --- | --- | --- |
| Event Bar Calculator | `index.html` | How much alcohol, mixers, ice and staff do I need? |
| Bar Budget Calculator | `budget.html` | What will the drinks actually cost, and per guest? |
| Signature Cocktail Menu Builder | `cocktails.html` | What should we serve, and how do we make it? |

The budget tool and the menu builder both call the bar calculator's engine for
drink volume, so the three can never disagree about how much a crowd drinks.

## What is in the box

```
curated-pours/
  calculator/                     the front end, deployable on its own
    index.html                    Event Bar Calculator
    budget.html                   Bar Budget Calculator
    cocktails.html                Signature Cocktail Menu Builder
    assets/css/calculator.css     one stylesheet for all three
    assets/fonts/                 self hosted Poppins and EB Garamond, latin subset
    assets/js/
      shared
        ui.js                     formatting, option buttons, the step machine
        lead-forms.js             both conversion panels and the lead record
        lead-store.js             storage abstraction with offline fallback
        scoring.js                internal lead intent scoring
        analytics.js              tracking abstraction
      bar calculator
        config.js                 every planning assumption and question option
        calculator.js             the drink engine, pure and testable
        app.js
      bar budget
        budget-config.js          every price assumption
        budget.js                 pricing layer over the drink engine
        budget-app.js
      cocktail menu
        cocktail-config.js        the recipe library and matching rules
        cocktails.js              menu selection and batching
        cocktail-app.js
  server/
    server.mjs                    lead API and static host, no npm dependencies
    storage/
      index.mjs                   adapter registry
      fields.mjs                  the canonical lead field list
      sqlite-adapter.mjs          SQLite via node:sqlite
  tests/                          45 scenario and rule tests
  build-preview.mjs               bundles one tool into a single .html file
  deploy-pages.mjs                builds the static site for GitHub Pages
```

## Running it

Node 22.5 or newer is required, for the built in `node:sqlite`. Nothing to
install, there are no dependencies.

```bash
cd curated-pours
ADMIN_TOKEN=devtoken npm start          # or: node server/server.mjs
```

Then open:

| What | Where |
| --- | --- |
| Event Bar Calculator | http://localhost:4173/ |
| Bar Budget Calculator | http://localhost:4173/budget.html |
| Cocktail Menu Builder | http://localhost:4173/cocktails.html |
| Internal leads view | http://localhost:4173/admin?token=devtoken |
| Leads as JSON | http://localhost:4173/api/leads?token=devtoken |
| Leads as CSV | http://localhost:4173/api/leads.csv?token=devtoken |

Run the tests with `npm test`.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | 4173 | Port the server listens on |
| `LEAD_DB` | `leads.db` | SQLite file holding the leads |
| `ADMIN_TOKEN` | empty | Required to read leads back out. Reading is blocked without it |
| `WEBHOOK_URL` | empty | Every saved lead is also POSTed here as JSON, fire and forget |

See `.env.example`.

## Publishing

```bash
node deploy-pages.mjs dist          # static site, preview mode
node build-preview.mjs out.html     # one tool as a single self contained file
```

Both default to **preview mode**: the tools work in full, a notice sits at the
top of the page, and anyone who submits a form is told plainly that nothing was
sent. That is the honest default for a host with no backend. Pass `--live` with
`LEAD_ENDPOINT` set once the forms have somewhere real to go.

The GitHub Pages preview is served from the `gh-pages` branch of
`bossmean/curated-pours-preview`, built by `deploy-pages.mjs`.

## Changing the planning assumptions

Everything lives in `calculator/assets/js/config.js`. Nothing else in the
codebase hard codes a rate. The pieces you are most likely to touch:

- `drinks.firstHourPerDrinker` and `drinks.additionalHourPerDrinker`
- `drinks.profileMultipliers` for the light, average and lively crowds
- `barStyles[key].mix` for the beer, wine and spirit split of each style
- `barStyles[key].bartenderRatio` for guests per bartender
- `servings` for how many pours come out of a bottle
- `mixers.ozPerMixedDrinkLow` and `High`, and the `breakdown` shares
- `ice.lbPerGuestLow`, `lbPerGuestHigh` and `lbPerGuestLowBumped`
- `scoring.rules` and `scoring.bands` for lead intent

The mix percentages and the mixer shares must each add to 1. There is a test
that fails if they do not.

Prices live in `budget-config.js`. **They are starting estimates, not quoted
retail.** They are shown to the visitor and editable on the results screen, so
the tool never presents them as fact, but set the defaults from real shelf
prices in the province you serve before this goes live.

Cocktails live in `cocktail-config.js`. Every build is a standard bar spec in
fluid ounces. Add a drink by appending to `RECIPES` with the same shape and it
enters the matching pool immediately. Tests check that every combination of
season, flavour and spirit still produces a full menu.

## How the numbers are reached

For an average crowd, each drinking guest is planned at two drinks in the first
hour and one for every hour after that. That total is multiplied by the drinking
profile, split across beer, wine and spirits by the bar style, then converted to
bottles: beer one for one, wine at five servings per 750 ml bottle, spirits at
sixteen 1.5 oz pours per 750 ml bottle. Bottle counts always round up.

Mixers are 4 to 6 oz per mixed drink, converted to litres and split across six
common categories. Ice is 1.0 to 1.5 lb per guest, with the bottom of the band
lifted to 1.25 lb for a full bar, a cocktail-focused bar, or any event with five
or more hours of service. Bartenders come from the guests per bartender ratio of
the chosen style, rounded up.

Worked example, which the test suite pins exactly: 100 guests, 75 per cent
drinking, five hours, full bar, average crowd gives 75 drinking guests, six
drinks each, 450 drinks, 135 beers, 23 bottles of wine, 13 bottles of spirits,
125 to 150 lb of ice and 2 bartenders.

## Lead storage

The browser only ever calls `leadStore.save(lead)`. Which adapter that reaches
is a deployment decision:

- `HttpAdapter` POSTs to `CONFIG.integration.leadEndpoint`, `/api/leads` by
  default. Any endpoint that accepts JSON works, including a CRM webhook.
- `LocalAdapter` writes to `localStorage` and is the automatic fallback. A lead
  that cannot reach the endpoint is queued and retried on the next page load, so
  a submission is never silently lost while the backend is down.

Server side, `server/storage/index.mjs` picks the adapter. Every adapter
implements `save`, `list`, `get`, `getBySession` and `close`. To add a CRM,
write one module against that interface and add a case to `createStore`.

One visitor is one lead. The record is keyed on a session id, so someone who
asks for the emailed plan and then requests a quote updates a single row rather
than creating a duplicate. `dateCreated` keeps the first value, the funnel flags
are sticky once true, and the intent score is recalculated from the merged
picture on every write.

### Deploying the front end without the Node server

The `calculator/` directory is a plain static site. Drop it on Netlify, Vercel,
GitHub Pages or any host, then point it at wherever leads should go by adding
this before the module script in `index.html`:

```html
<script>window.CURATED_POURS_CONFIG = { leadEndpoint: 'https://your-endpoint' };</script>
```

Set `leadEndpoint: null` and leads stay in the browser only, which is useful for
a demo but captures nothing.

## Lead intent scoring

Internal only, never shown to the visitor. Event within 90 days +3, 100 or more
guests +3, wedding +2, corporate event +2, quote requested +5, phone number
given +2, emailed plan requested +1. 10 and up is High Intent, 5 to 9 is Medium,
below 5 is Low. The reasons behind each score are stored alongside it so a
number in the CRM can always be explained.

The score is calculated on the server as well as in the browser, from the same
`scoring.js` module, so the rules cannot drift apart and a posted score cannot
be spoofed.

## Conversion tracking

`analytics.js` fires into Google Tag Manager (`dataLayer`), Google Analytics 4
(`gtag`) and the Meta Pixel (`fbq`) if any of them are on the page, and stays
silent otherwise. Events: `calculator_started`, `event_type_selected`,
`step_completed`, `calculator_completed`, `results_viewed`,
`email_plan_requested`, `quote_requested`, `lead_save_failed`. Quote requests
map to the Meta standard `Lead` event and emailed plans to
`CompleteRegistration`. Add a platform by pushing another function into `SINKS`.

Set `CONFIG.integration.debugAnalytics = true` to watch every event in the
browser console while testing.

## Before this goes live

- Set the bottle prices in `budget-config.js` from real shelf prices. The
  current defaults are placeholders and must not ship as though they were checked.
- Add the real Curated Pours phone number and confirm the contact details in the
  header and footer. The phone number on the brand assets is a design
  placeholder and has deliberately been left off the page.
- Decide what actually sends the emailed bar plan. Right now the lead is stored
  and the visitor is told it is coming. Nothing sends mail yet.
- Set a long random `ADMIN_TOKEN` and put the site behind HTTPS.
- Remove `<meta name="robots" content="noindex, nofollow">` from `index.html`
  when the page is ready to be indexed, and set the canonical URL.
- Add rate limiting in front of `POST /api/leads` if the page gets traffic.
