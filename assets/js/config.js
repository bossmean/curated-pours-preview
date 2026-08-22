/*
 * Curated Pours Event Bar Calculator
 * Every planning assumption lives here. Change a number in this file and the
 * whole calculator follows. Nothing else in the codebase hard codes a rate.
 */

export const CONFIG = {
  /* ---------------------------------------------------------------- drinks */
  drinks: {
    // Industry planning rule of thumb for an average drinking crowd.
    firstHourPerDrinker: 2,
    additionalHourPerDrinker: 1,
    // Applied to the total after the hourly maths.
    profileMultipliers: {
      light: 0.75,
      average: 1.0,
      lively: 1.2
    }
  },

  /* ------------------------------------------------------------ bar styles */
  // mix values must add to 1. bartenderRatio is guests per bartender.
  // iceHighEnd flags styles that push the ice estimate to the top of the band.
  barStyles: {
    'beer-wine': {
      label: 'Beer & Wine',
      blurb: 'Simple beer, wine and non-alcoholic service.',
      mix: { beer: 0.55, wine: 0.45, spirits: 0 },
      serviceNoun: 'beer and wine bar',
      bartenderRatio: 75,
      iceHighEnd: false
    },
    'beer-wine-mixed': {
      label: 'Beer, Wine & Simple Mixed Drinks',
      blurb: 'Includes common spirits and basic mixed drinks.',
      mix: { beer: 0.35, wine: 0.30, spirits: 0.35 },
      serviceNoun: 'bar with beer, wine and mixed drinks',
      bartenderRatio: 50,
      iceHighEnd: false
    },
    'full-bar': {
      label: 'Full Bar',
      blurb: 'Beer, wine, spirits and cocktails.',
      mix: { beer: 0.30, wine: 0.25, spirits: 0.45 },
      serviceNoun: 'full bar',
      bartenderRatio: 50,
      iceHighEnd: true
    },
    'cocktail': {
      label: 'Cocktail-Focused',
      blurb: 'Fewer drink options but more premium cocktails.',
      mix: { beer: 0.15, wine: 0.15, spirits: 0.70 },
      serviceNoun: 'cocktail-focused bar',
      // Guideline is one bartender per 35 to 40 guests. 38 is the midpoint.
      bartenderRatio: 38,
      iceHighEnd: true
    },
    'not-sure': {
      label: 'Not Sure',
      blurb: 'Let Curated Pours recommend the best setup.',
      // Falls back to the Full Bar assumptions and is labelled as a
      // recommended starting point on the results screen.
      fallsBackTo: 'full-bar',
      recommended: true
    }
  },

  /* ------------------------------------------------------- bottle servings */
  servings: {
    beerServingsPerUnit: 1,      // one bottle or can is one serving
    wineServingsPerBottle: 5,    // 750 ml at roughly 5 oz per pour
    spiritServingsPerBottle: 16  // 750 ml at 1.5 oz per pour
  },

  /* ------------------------------------------------------------- mixers */
  mixers: {
    ozPerMixedDrinkLow: 4,
    ozPerMixedDrinkHigh: 6,
    ozPerLitre: 33.814,
    // Shares of the recommended mixer volume. Must add to 1.
    breakdown: [
      { key: 'soda-water', label: 'Soda water', share: 0.20 },
      { key: 'cola', label: 'Cola', share: 0.20 },
      { key: 'tonic', label: 'Tonic', share: 0.15 },
      { key: 'lemon-lime', label: 'Lemon-lime soda', share: 0.15 },
      { key: 'ginger-ale', label: 'Ginger ale', share: 0.15 },
      { key: 'juice', label: 'Juice and citrus mixers', share: 0.15 }
    ]
  },

  /* ---------------------------------------------------------------- ice */
  ice: {
    lbPerGuestLow: 1.0,
    lbPerGuestHigh: 1.5,
    // When a high end trigger applies, the bottom of the band lifts to this.
    lbPerGuestLowBumped: 1.25,
    // Events at or beyond this many hours count as a high end trigger.
    longEventHours: 5,
    lbPerKg: 2.20462
  },

  /* ------------------------------------------------------------ staffing */
  staffing: {
    minBartenders: 1,
    maxBartenders: 20
  },

  /* --------------------------------------------------------------- input */
  limits: {
    guestsMin: 10,
    guestsMax: 1000,
    drinkingPctMin: 10,
    drinkingPctMax: 100,
    durationMinHours: 2,
    durationMaxHours: 7
  },

  /* --------------------------------------------------- lead intent scoring */
  scoring: {
    rules: {
      eventWithin90Days: 3,
      guests100Plus: 3,
      wedding: 2,
      corporate: 2,
      requestedQuote: 5,
      providedPhone: 2,
      requestedEmailPlan: 1
    },
    eventWindowDays: 90,
    largeGuestCount: 100,
    // Lower bound of each band, checked from the top down.
    bands: { high: 10, medium: 5 }
  },

  /* ------------------------------------------------------------ integration */
  integration: {
    // Set to a URL to POST leads to the bundled Node API or any other endpoint.
    // Leave null and leads are held in the browser only. This can also be set
    // at deploy time with window.CURATED_POURS_CONFIG = { leadEndpoint: '...' }
    leadEndpoint: '/api/leads',
    // Set true to mirror every tracking call to the console while testing.
    debugAnalytics: false,
    // Preview mode is for client demos and shared links, where the calculator
    // is fully usable but nothing is wired to an inbox yet. It shows a notice
    // at the top of the page and tells anyone who submits a form the truth:
    // their details were not sent anywhere. Never leave this on in production.
    previewMode: false
  }
};

/* Deploy time overrides without touching this file. */
const override = (typeof window !== 'undefined' && window.CURATED_POURS_CONFIG) || {};
if (override.leadEndpoint !== undefined) CONFIG.integration.leadEndpoint = override.leadEndpoint;
if (override.debugAnalytics !== undefined) CONFIG.integration.debugAnalytics = override.debugAnalytics;
if (override.previewMode !== undefined) CONFIG.integration.previewMode = override.previewMode;

/* ------------------------------------------------------- question options */

export const EVENT_TYPES = [
  { key: 'wedding', label: 'Wedding' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'corporate', label: 'Corporate Event' },
  { key: 'engagement', label: 'Engagement Party' },
  { key: 'anniversary', label: 'Anniversary' },
  { key: 'private-party', label: 'Private Party' },
  { key: 'backyard', label: 'Backyard Event' },
  { key: 'other', label: 'Other' }
];

export const DRINKING_PCT_OPTIONS = [
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 75, label: '75%' },
  { value: 90, label: '90%' },
  { value: 100, label: 'Almost everyone' }
];

export const DURATION_OPTIONS = [
  { value: 2, label: '2 hours' },
  { value: 3, label: '3 hours' },
  { value: 4, label: '4 hours' },
  { value: 5, label: '5 hours' },
  { value: 6, label: '6 hours' },
  { value: 7, label: '7+ hours' }
];

export const DRINKING_PROFILES = [
  { key: 'light', label: 'Light', blurb: 'Most guests will have 1 to 2 drinks.' },
  { key: 'average', label: 'Average', blurb: 'Typical social event drinking.' },
  { key: 'lively', label: 'Lively', blurb: 'Expect a stronger drinking crowd.' }
];

export const BAR_STYLE_ORDER = ['beer-wine', 'beer-wine-mixed', 'full-bar', 'cocktail', 'not-sure'];
