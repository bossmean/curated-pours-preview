/*
 * Event Bar Budget Calculator: every price assumption.
 *
 * IMPORTANT: the prices below are starting estimates, not quoted retail. They
 * are shown to the visitor on the results screen and are editable there, so
 * the tool never presents them as fact. Before this goes live, set the
 * defaults from current shelf prices in the province you serve.
 */

export const BUDGET_CONFIG = {
  /* Per unit prices by quality tier, in Canadian dollars.
     beer is one bottle or can, wine and spirits are one 750 ml bottle. */
  tiers: {
    value: {
      label: 'Value',
      blurb: 'House pours and everyday brands.',
      prices: { beer: 2.75, wine: 14, spirits: 32 }
    },
    mid: {
      label: 'Mid-range',
      blurb: 'Recognisable brands your guests will know.',
      prices: { beer: 3.25, wine: 20, spirits: 45 }
    },
    premium: {
      label: 'Premium',
      blurb: 'Call brands and bottles worth pointing at.',
      prices: { beer: 4.25, wine: 30, spirits: 68 }
    }
  },

  /* Everything around the alcohol. */
  extras: {
    mixerPerLitre: 2.25,
    icePerLb: 0.45,
    // Citrus, herbs, olives and cherries, per guest who is drinking.
    garnishPerDrinkingGuest: 1.75,
    // Cups, napkins and straws, per guest. Set to 0 if the venue supplies them.
    suppliesPerGuest: 0.90
  },

  /* The estimate is shown as a band rather than a single number, because
     shelf prices and how much actually gets poured both move. */
  rangeSpread: 0.12,

  /* Bounds for the editable price fields on the results screen. */
  priceLimits: { beer: [1, 20], wine: [5, 200], spirits: [15, 400] }
};

export const TIER_ORDER = ['value', 'mid', 'premium'];
