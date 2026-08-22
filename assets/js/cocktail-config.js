/*
 * Signature Cocktail Menu Builder: the recipe library and the matching rules.
 *
 * Every build below is a standard bar spec for a well known drink, in fluid
 * ounces per single serving. Nothing here is an invented ratio. Add a drink by
 * appending to RECIPES with the same shape and it enters the matching pool
 * immediately.
 *
 * Ingredient types drive the shopping list rollup:
 *   spirit, liqueur, wine   priced and counted in 750 ml bottles
 *   citrus                  counted in whole fruit
 *   syrup                   made or bought, reported in millilitres
 *   mixer                   reported in litres
 *   bitters                 reported in dashes
 *   fresh                   reported as a count, herbs and produce
 */

export const COCKTAIL_CONFIG = {
  // Share of the total drink count the signature menu is expected to cover.
  // The rest is beer, wine and whatever else is on the bar.
  signatureShareOfDrinks: 0.55,
  // Non-alcoholic servings, as a share of total guests.
  nonAlcoholicShareOfGuests: 0.45,
  howManySignatures: 3,

  conversions: {
    ozPerBottle750: 25.36,
    ozPerLitre: 33.814,
    ozPerLimeFruit: 1,
    ozPerLemonFruit: 1.5,
    ozPerGrapefruitFruit: 4,
    ozPerDash: 0.03
  },

  // How strongly each signal counts when ranking the pool.
  weights: { profile: 3, season: 2, spirit: 4, eventFit: 1 }
};

export const SEASONS = [
  { key: 'spring', label: 'Spring', blurb: 'March to May' },
  { key: 'summer', label: 'Summer', blurb: 'June to August' },
  { key: 'autumn', label: 'Autumn', blurb: 'September to November' },
  { key: 'winter', label: 'Winter', blurb: 'December to February' }
];

export const PROFILES = [
  { key: 'bright', label: 'Bright and citrus forward', blurb: 'Lemon, lime and grapefruit. Easy to drink.' },
  { key: 'spirit-forward', label: 'Rich and spirit forward', blurb: 'Stirred, strong and slow. For a crowd that sips.' },
  { key: 'fruity', label: 'Fruity and approachable', blurb: 'Sweeter, softer, hard to dislike.' },
  { key: 'herbal', label: 'Herbal and botanical', blurb: 'Mint, bitters and garden notes.' },
  { key: 'sparkling', label: 'Light and sparkling', blurb: 'Bubbles, low proof, built for toasting.' }
];

export const SPIRITS = [
  { key: 'gin', label: 'Gin' },
  { key: 'vodka', label: 'Vodka' },
  { key: 'whisky', label: 'Whisky' },
  { key: 'rum', label: 'Rum' },
  { key: 'tequila', label: 'Tequila' },
  { key: 'aperitif', label: 'Aperitifs and bubbles' }
];

/* ------------------------------------------------------------- recipes */

export const RECIPES = [
  {
    key: 'french-75', name: 'French 75', spirit: 'gin', abv: 'medium',
    profiles: ['bright', 'sparkling'], seasons: ['spring', 'summer', 'winter'],
    eventFit: ['wedding', 'engagement', 'anniversary', 'corporate'],
    blurb: 'Gin, lemon and sparkling wine. Reads as celebration in a single sip.',
    glass: 'Flute', garnish: 'Lemon twist',
    build: [
      { name: 'Gin', oz: 1, type: 'spirit' },
      { name: 'Lemon juice', oz: 0.5, type: 'citrus', fruit: 'lemon' },
      { name: 'Simple syrup', oz: 0.5, type: 'syrup' },
      { name: 'Sparkling wine', oz: 2, type: 'wine' }
    ]
  },
  {
    key: 'bees-knees', name: "Bee's Knees", spirit: 'gin', abv: 'medium',
    profiles: ['bright', 'fruity'], seasons: ['spring', 'summer'],
    eventFit: ['wedding', 'birthday', 'backyard', 'engagement'],
    blurb: 'Gin, lemon and honey. Soft enough for people who say they do not like gin.',
    glass: 'Coupe', garnish: 'Lemon twist',
    build: [
      { name: 'Gin', oz: 2, type: 'spirit' },
      { name: 'Lemon juice', oz: 0.75, type: 'citrus', fruit: 'lemon' },
      { name: 'Honey syrup', oz: 0.75, type: 'syrup' }
    ]
  },
  {
    key: 'negroni', name: 'Negroni', spirit: 'gin', abv: 'high',
    profiles: ['spirit-forward', 'herbal'], seasons: ['autumn', 'winter'],
    eventFit: ['corporate', 'private-party', 'anniversary'],
    blurb: 'Equal parts gin, Campari and sweet vermouth. Bitter, confident, batches beautifully.',
    glass: 'Rocks', garnish: 'Orange peel',
    build: [
      { name: 'Gin', oz: 1, type: 'spirit' },
      { name: 'Campari', oz: 1, type: 'liqueur' },
      { name: 'Sweet vermouth', oz: 1, type: 'liqueur' }
    ]
  },
  {
    key: 'espresso-martini', name: 'Espresso Martini', spirit: 'vodka', abv: 'medium',
    profiles: ['spirit-forward', 'fruity'], seasons: ['autumn', 'winter'],
    eventFit: ['corporate', 'birthday', 'private-party', 'wedding'],
    blurb: 'The drink that restarts a room late in the evening.',
    glass: 'Coupe', garnish: 'Three coffee beans',
    build: [
      { name: 'Vodka', oz: 2, type: 'spirit' },
      { name: 'Coffee liqueur', oz: 1, type: 'liqueur' },
      { name: 'Fresh espresso', oz: 1, type: 'fresh', perServing: 1, unit: 'shots' },
      { name: 'Simple syrup', oz: 0.25, type: 'syrup' }
    ]
  },
  {
    key: 'moscow-mule', name: 'Moscow Mule', spirit: 'vodka', abv: 'low',
    profiles: ['bright', 'sparkling'], seasons: ['spring', 'summer'],
    eventFit: ['backyard', 'birthday', 'private-party', 'corporate'],
    blurb: 'Vodka, lime and ginger beer. Fast to build when the queue is long.',
    glass: 'Copper mug', garnish: 'Lime wedge',
    build: [
      { name: 'Vodka', oz: 2, type: 'spirit' },
      { name: 'Lime juice', oz: 0.5, type: 'citrus', fruit: 'lime' },
      { name: 'Ginger beer', oz: 4, type: 'mixer' }
    ]
  },
  {
    key: 'cosmopolitan', name: 'Cosmopolitan', spirit: 'vodka', abv: 'medium',
    profiles: ['fruity', 'bright'], seasons: ['autumn', 'winter', 'spring'],
    eventFit: ['birthday', 'engagement', 'private-party'],
    blurb: 'Tart, pink and completely undefeated at a party.',
    glass: 'Coupe', garnish: 'Orange peel',
    build: [
      { name: 'Vodka', oz: 1.5, type: 'spirit' },
      { name: 'Triple sec', oz: 0.5, type: 'liqueur' },
      { name: 'Cranberry juice', oz: 1, type: 'mixer' },
      { name: 'Lime juice', oz: 0.5, type: 'citrus', fruit: 'lime' }
    ]
  },
  {
    key: 'old-fashioned', name: 'Old Fashioned', spirit: 'whisky', abv: 'high',
    profiles: ['spirit-forward'], seasons: ['autumn', 'winter'],
    eventFit: ['corporate', 'anniversary', 'private-party'],
    blurb: 'Whisky, sugar and bitters. Nothing to hide behind, which is the point.',
    glass: 'Rocks', garnish: 'Orange peel',
    build: [
      { name: 'Rye or bourbon', oz: 2, type: 'spirit' },
      { name: 'Simple syrup', oz: 0.25, type: 'syrup' },
      { name: 'Angostura bitters', oz: 0.06, type: 'bitters', dashes: 2 }
    ]
  },
  {
    key: 'whisky-sour', name: 'Whisky Sour', spirit: 'whisky', abv: 'medium',
    profiles: ['bright', 'spirit-forward'], seasons: ['autumn', 'winter', 'spring'],
    eventFit: ['birthday', 'private-party', 'corporate', 'backyard'],
    blurb: 'Whisky, lemon and sugar in the classic two, three quarter, three quarter.',
    glass: 'Rocks', garnish: 'Lemon wheel and bitters',
    build: [
      { name: 'Rye or bourbon', oz: 2, type: 'spirit' },
      { name: 'Lemon juice', oz: 0.75, type: 'citrus', fruit: 'lemon' },
      { name: 'Simple syrup', oz: 0.75, type: 'syrup' }
    ]
  },
  {
    key: 'mojito', name: 'Mojito', spirit: 'rum', abv: 'low',
    profiles: ['herbal', 'bright'], seasons: ['spring', 'summer'],
    eventFit: ['backyard', 'birthday', 'wedding', 'private-party'],
    blurb: 'White rum, lime and a lot of mint. The drink people photograph.',
    glass: 'Highball', garnish: 'Mint bouquet',
    build: [
      { name: 'White rum', oz: 2, type: 'spirit' },
      { name: 'Lime juice', oz: 0.75, type: 'citrus', fruit: 'lime' },
      { name: 'Simple syrup', oz: 0.75, type: 'syrup' },
      { name: 'Soda water', oz: 2, type: 'mixer' },
      { name: 'Fresh mint', oz: 0, type: 'fresh', perServing: 8, unit: 'leaves', per: { count: 60, of: 'bunch', ofPlural: 'bunches' } }
    ]
  },
  {
    key: 'daiquiri', name: 'Daiquiri', spirit: 'rum', abv: 'medium',
    profiles: ['bright'], seasons: ['spring', 'summer'],
    eventFit: ['wedding', 'engagement', 'backyard', 'birthday'],
    blurb: 'Rum, lime, sugar. Three ingredients, nowhere to hide, always empty first.',
    glass: 'Coupe', garnish: 'Lime wheel',
    build: [
      { name: 'White rum', oz: 2, type: 'spirit' },
      { name: 'Lime juice', oz: 1, type: 'citrus', fruit: 'lime' },
      { name: 'Simple syrup', oz: 0.75, type: 'syrup' }
    ]
  },
  {
    key: 'rum-ginger-highball', name: 'Dark Rum and Ginger Highball', spirit: 'rum', abv: 'low',
    profiles: ['fruity', 'sparkling'], seasons: ['summer', 'autumn'],
    eventFit: ['backyard', 'private-party', 'birthday'],
    blurb: 'Dark rum floated over ginger beer. Looks like weather in a glass.',
    glass: 'Highball', garnish: 'Lime wedge',
    build: [
      { name: 'Dark rum', oz: 2, type: 'spirit' },
      { name: 'Ginger beer', oz: 4, type: 'mixer' },
      { name: 'Lime juice', oz: 0.5, type: 'citrus', fruit: 'lime' }
    ]
  },
  {
    key: 'margarita', name: 'Margarita', spirit: 'tequila', abv: 'medium',
    profiles: ['bright', 'fruity'], seasons: ['spring', 'summer', 'autumn'],
    eventFit: ['birthday', 'backyard', 'private-party', 'wedding'],
    blurb: 'Tequila, triple sec and lime. The safest crowd pleaser on any menu.',
    glass: 'Rocks', garnish: 'Salt rim and lime',
    build: [
      { name: 'Blanco tequila', oz: 2, type: 'spirit' },
      { name: 'Triple sec', oz: 1, type: 'liqueur' },
      { name: 'Lime juice', oz: 1, type: 'citrus', fruit: 'lime' }
    ]
  },
  {
    key: 'paloma', name: 'Paloma', spirit: 'tequila', abv: 'low',
    profiles: ['bright', 'sparkling'], seasons: ['spring', 'summer'],
    eventFit: ['backyard', 'birthday', 'wedding', 'engagement'],
    blurb: 'Tequila and grapefruit soda over ice. Lower proof, disappears fast on a hot day.',
    glass: 'Highball', garnish: 'Grapefruit wedge and salt',
    build: [
      { name: 'Blanco tequila', oz: 2, type: 'spirit' },
      { name: 'Lime juice', oz: 0.5, type: 'citrus', fruit: 'lime' },
      { name: 'Grapefruit soda', oz: 4, type: 'mixer' }
    ]
  },
  {
    key: 'aperol-spritz', name: 'Aperol Spritz', spirit: 'aperitif', abv: 'low',
    profiles: ['sparkling', 'bright', 'herbal'], seasons: ['spring', 'summer'],
    eventFit: ['wedding', 'engagement', 'anniversary', 'corporate', 'backyard'],
    blurb: 'Three, two, one. Low proof, bright orange, and it photographs like nothing else.',
    glass: 'Wine glass', garnish: 'Orange slice',
    build: [
      { name: 'Prosecco', oz: 3, type: 'wine' },
      { name: 'Aperol', oz: 2, type: 'liqueur' },
      { name: 'Soda water', oz: 1, type: 'mixer' }
    ]
  },
  {
    key: 'kir-royale', name: 'Kir Royale', spirit: 'aperitif', abv: 'low',
    profiles: ['sparkling', 'fruity'], seasons: ['autumn', 'winter', 'spring'],
    eventFit: ['wedding', 'anniversary', 'corporate', 'engagement'],
    blurb: 'Sparkling wine over blackcurrant liqueur. One pour, no shaking, endlessly elegant.',
    glass: 'Flute', garnish: 'Lemon twist',
    build: [
      { name: 'Crème de cassis', oz: 0.5, type: 'liqueur' },
      { name: 'Sparkling wine', oz: 4, type: 'wine' }
    ]
  },
  {
    key: 'gin-tonic', name: 'Garden Gin and Tonic', spirit: 'gin', abv: 'low',
    profiles: ['herbal', 'sparkling', 'bright'], seasons: ['spring', 'summer'],
    eventFit: ['backyard', 'birthday', 'wedding', 'corporate'],
    blurb: 'Gin and tonic built properly, with cucumber and a lot of ice.',
    glass: 'Wine glass', garnish: 'Cucumber ribbon and rosemary',
    build: [
      { name: 'Gin', oz: 2, type: 'spirit' },
      { name: 'Tonic water', oz: 4, type: 'mixer' },
      { name: 'Lime juice', oz: 0.25, type: 'citrus', fruit: 'lime' },
      { name: 'Cucumber', oz: 0, type: 'fresh', perServing: 2, unit: 'slices', per: { count: 18, of: 'cucumber' } }
    ]
  }
];

/* Always one on the menu. Nobody should be handed a soda water and a shrug. */
export const ZERO_PROOF = [
  {
    key: 'cucumber-cooler', name: 'Cucumber and Mint Cooler', spirit: 'none', abv: 'none',
    profiles: ['herbal', 'bright'], seasons: ['spring', 'summer'],
    blurb: 'Cucumber, mint and lime over crushed ice.',
    glass: 'Highball', garnish: 'Cucumber ribbon',
    build: [
      { name: 'Lime juice', oz: 0.75, type: 'citrus', fruit: 'lime' },
      { name: 'Simple syrup', oz: 0.5, type: 'syrup' },
      { name: 'Soda water', oz: 4, type: 'mixer' },
      { name: 'Cucumber', oz: 0, type: 'fresh', perServing: 3, unit: 'slices', per: { count: 18, of: 'cucumber' } },
      { name: 'Fresh mint', oz: 0, type: 'fresh', perServing: 6, unit: 'leaves', per: { count: 60, of: 'bunch', ofPlural: 'bunches' } }
    ]
  },
  {
    key: 'virgin-paloma', name: 'Grapefruit and Lime Paloma', spirit: 'none', abv: 'none',
    profiles: ['bright', 'sparkling'], seasons: ['spring', 'summer', 'autumn'],
    blurb: 'Grapefruit soda, fresh lime and a salted rim. Nobody misses the tequila.',
    glass: 'Highball', garnish: 'Salt rim and grapefruit',
    build: [
      { name: 'Grapefruit soda', oz: 5, type: 'mixer' },
      { name: 'Lime juice', oz: 0.5, type: 'citrus', fruit: 'lime' }
    ]
  },
  {
    key: 'ginger-citrus-fizz', name: 'Ginger and Citrus Fizz', spirit: 'none', abv: 'none',
    profiles: ['sparkling', 'fruity'], seasons: ['autumn', 'winter'],
    blurb: 'Ginger beer, lemon and honey. Warming without being sweet.',
    glass: 'Highball', garnish: 'Lemon wheel',
    build: [
      { name: 'Ginger beer', oz: 4, type: 'mixer' },
      { name: 'Lemon juice', oz: 0.75, type: 'citrus', fruit: 'lemon' },
      { name: 'Honey syrup', oz: 0.5, type: 'syrup' }
    ]
  },
  {
    key: 'berry-shrub-soda', name: 'Berry Shrub Soda', spirit: 'none', abv: 'none',
    profiles: ['fruity', 'spirit-forward'], seasons: ['autumn', 'winter', 'spring'],
    blurb: 'Berry shrub topped with soda. Tart and grown up, not a fruit punch.',
    glass: 'Wine glass', garnish: 'Berries and lemon',
    build: [
      { name: 'Berry shrub', oz: 1, type: 'syrup' },
      { name: 'Soda water', oz: 5, type: 'mixer' },
      { name: 'Lemon juice', oz: 0.25, type: 'citrus', fruit: 'lemon' }
    ]
  }
];
