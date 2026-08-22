/*
 * The canonical lead field list and its column types.
 *
 * The API, the SQLite schema, the CSV export and any future CRM mapping all
 * read from this one list, so adding a field is a single edit here.
 */

export const LEAD_FIELDS = [
  ['sessionId', 'TEXT'],
  ['dateCreated', 'TEXT'],
  ['dateUpdated', 'TEXT'],
  ['firstName', 'TEXT'],
  ['lastName', 'TEXT'],
  ['email', 'TEXT'],
  ['phone', 'TEXT'],
  ['eventType', 'TEXT'],
  ['eventTypeLabel', 'TEXT'],
  ['eventDate', 'TEXT'],
  ['eventCity', 'TEXT'],
  ['postalCode', 'TEXT'],
  ['venue', 'TEXT'],
  ['notes', 'TEXT'],
  ['guestCount', 'INTEGER'],
  ['drinkingPct', 'INTEGER'],
  ['estimatedDrinkingGuests', 'INTEGER'],
  ['durationHours', 'INTEGER'],
  ['barStyle', 'TEXT'],
  ['barStyleLabel', 'TEXT'],
  ['drinkingProfile', 'TEXT'],
  ['estimatedTotalDrinks', 'INTEGER'],
  ['beerUnits', 'INTEGER'],
  ['wineBottles', 'INTEGER'],
  ['spiritBottles', 'INTEGER'],
  ['mixerLitresLow', 'INTEGER'],
  ['mixerLitresHigh', 'INTEGER'],
  ['iceLbLow', 'INTEGER'],
  ['iceLbHigh', 'INTEGER'],
  ['recommendedBartenders', 'INTEGER'],
  ['requestedEmailPlan', 'INTEGER'],
  ['requestedQuote', 'INTEGER'],
  ['leadScore', 'INTEGER'],
  ['leadIntent', 'TEXT'],
  ['scoreReasons', 'TEXT'],
  // Bar Budget Calculator
  ['qualityTier', 'TEXT'],
  ['qualityTierLabel', 'TEXT'],
  ['estimatedBudgetLow', 'INTEGER'],
  ['estimatedBudgetHigh', 'INTEGER'],
  ['estimatedPerGuest', 'TEXT'],

  // Signature Cocktail Menu Builder
  ['season', 'TEXT'],
  ['flavourProfiles', 'TEXT'],
  ['preferredSpirits', 'TEXT'],
  ['cocktailMenu', 'TEXT'],
  ['cocktailServings', 'INTEGER'],

  ['funnelSource', 'TEXT'],
  ['leadStatus', 'TEXT'],
  ['pageUrl', 'TEXT'],
  ['referrer', 'TEXT']
];
