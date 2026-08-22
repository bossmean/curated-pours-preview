# Curated Pours Event Bar Calculator

A lead generating event bar planner. A visitor answers six short questions and
gets a complete bar plan: total drinks, beer, wine, spirits, mixers, ice and a
bartender recommendation. The plan is shown in full before any form appears.
From there they can ask for the emailed shopping list or request a quote, and
both routes carry every answer forward.

## What is in the box

```
curated-pours/
  calculator/                     the front end, deployable on its own
    index.html
    assets/css/calculator.css
    assets/fonts/                 self hosted Poppins and EB Garamond, latin subset
    assets/img/favicon.svg
    assets/js/
      config.js                   every planning assumption and question option
      calculator.js               the calculation engine, pure and testable
      scoring.js                  internal lead intent scoring
      analytics.js                tracking abstraction
      lead-store.js               storage abstraction with offline fallback
      app.js                      UI controller
  server/
    server.mjs                    lead API and static host, no npm dependencies
    storage/
      index.mjs                   adapter registry
      fields.mjs                  the canonical lead field list
      sqlite-adapter.mjs          SQLite via node:sqlite
  tests/calculator.test.mjs       24 scenario and rule tests
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
| The calculator | http://localhost:4173/ |
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

- Add the real Curated Pours phone number and confirm the contact details in the
  header and footer. The phone number on the brand assets is a design
  placeholder and has deliberately been left off the page.
- Decide what actually sends the emailed bar plan. Right now the lead is stored
  and the visitor is told it is coming. Nothing sends mail yet.
- Set a long random `ADMIN_TOKEN` and put the site behind HTTPS.
- Remove `<meta name="robots" content="noindex, nofollow">` from `index.html`
  when the page is ready to be indexed, and set the canonical URL.
- Add rate limiting in front of `POST /api/leads` if the page gets traffic.
