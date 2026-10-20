// Editorial illustrations for the existing example catalog only. These are
// not photos of the listed products and must always be shown with a visible
// disclosure. Actual product photos should take precedence in the UI.
const artwork = {
  blue: '/images/arrival-blue-runner.webp',
  canvas: '/images/arrival-canvas.webp',
  canvasBlack: '/images/catalog-canvas-black.webp',
  canvasCream: '/images/catalog-canvas-cream.webp',
  canvasPlatform: '/images/catalog-canvas-platform.webp',
  kids: '/images/illustration-kids.webp',
  maryJane: '/images/arrival-mary-jane.webp',
  maryJaneStraps: '/images/catalog-mary-jane-straps.webp',
  retro: '/images/arrival-retro.webp',
  retroLow: '/images/catalog-retro-low.webp',
  runnerCharcoal: '/images/catalog-runner-charcoal.webp',
  runnerWhiteOrange: '/images/catalog-runner-white-orange.webp',
  sage: '/images/arrival-sage-runner.webp',
  slipOn: '/images/arrival-slip-on.webp',
  sprint: '/images/arrival-kids-sprint.webp',
  trail: '/images/arrival-trail.webp',
  trailRunner: '/images/catalog-trail-runner.webp',
  casual: '/images/illustration-casual.webp',
  runner: '/images/illustration-runner.webp',
  everydayTrail: '/images/illustration-trail.webp',
}

// Exact slug mappings keep artwork stable across sorting, filtering, and
// catalog updates. Never assign an illustration to an unknown new product.
// The ten new-arrival choices match homeArtwork.js.
const artworkBySlug = {
  // The reference Men catalogue uses local, profile-oriented artwork so the
  // listing grid never depends on a third-party image host.
  'example-adidas-men-hq9534': artwork.blue,
  'example-adidas-men-kh9103': artwork.runnerCharcoal,
  'example-adidas-men-ki8294': artwork.runnerWhiteOrange,
  'example-adidas-men-kj0427': artwork.runner,
  'example-adidas-men-kj0817': artwork.sage,
  'example-adidas-men-ki3159': artwork.retro,
  'example-adidas-men-kj1877': artwork.trail,
  'example-adidas-men-kj3786': artwork.trailRunner,
  'example-adidas-men-ki7977': artwork.everydayTrail,
  'example-adidas-men-ki4776': artwork.canvas,

  'example-adidas-gazelle-men-reference': artwork.retro,
  'example-adidas-handball-spezial-women-reference': artwork.casual,
  'example-adidas-sl-72-rs-kids-reference': artwork.kids,
  'example-adidas-stadt-ji1884': artwork.retroLow,
  'example-adidas-tokyo-ih6639': artwork.runner,

  'example-20261018-asics-gel-cumulus-28-1011c143-101': artwork.sage,
  'example-20261018-asics-gel-kayano-33-1011c167-101': artwork.runner,
  'example-20261018-asics-gel-nimbus-28-1011c127-102': artwork.runnerWhiteOrange,
  'example-20261018-asics-gt-2000-15-1011c235-002': artwork.runnerCharcoal,
  'example-20261018-asics-novablast-6-1011c243-403': artwork.blue,

  'example-converse-chuck-70-industrial-reference': artwork.canvas,
  'example-converse-chuck-taylor-high-m9160c': artwork.canvasBlack,
  'example-converse-chuck-taylor-lift-high-black': artwork.canvasPlatform,
  'example-converse-chuck-taylor-move-platform': artwork.canvasCream,
  'example-converse-malden-street-a17842c': artwork.retro,

  'example-20261018-hoka-arahi-8': artwork.blue,
  'example-20261018-hoka-bondi-9': artwork.sage,
  'example-20261018-hoka-clifton-10': artwork.runner,
  'example-20261018-hoka-rincon-4': artwork.runnerWhiteOrange,
  'example-20261018-hoka-transport-2': artwork.runnerCharcoal,

  'example-20261018-new-balance-1906': artwork.retro,
  'example-20261018-new-balance-327': artwork.casual,
  'example-20261018-new-balance-530': artwork.blue,
  'example-20261018-new-balance-574': artwork.runner,
  'example-20261018-new-balance-740': artwork.sage,

  'example-nike-air-force-1-07-cw2288-111': artwork.casual,
  'example-nike-air-monarch-iv-415445-102': artwork.retro,
  'example-nike-p-6000-io8711-101': artwork.trail,
  'example-nike-waffle-racer-im8658-103': artwork.blue,
  'example-nikecourt-lite-4-fd6574-125': artwork.runner,

  'example-20261018-on-cloud-6': artwork.blue,
  'example-20261018-on-cloud-x-5': artwork.runner,
  'example-20261018-on-cloudboom-strike-2': artwork.sage,
  'example-20261018-on-cloudtilt-remix': artwork.runnerWhiteOrange,
  'example-20261018-on-cloudzone': artwork.runnerCharcoal,

  'example-puma-rebound-v6-low-392328-32': artwork.retro,
  'example-puma-softride-carson-2-313501-05': artwork.blue,
  'example-puma-suede-classic-399781-01': artwork.casual,
  'example-puma-turino-ii-397452-02': artwork.everydayTrail,
  'example-puma-turino-ii-og-397646-06': artwork.runner,

  'example-reebok-nano-2-0-100244684': artwork.retro,
  'example-reebok-nano-court-100225419': artwork.casual,
  'example-reebok-nano-x5-edge-100244428': artwork.runner,
  'example-reebok-ultra-lo-mary-jane-100261003': artwork.maryJane,
  'example-reebok-workout-plus-100244988': artwork.trail,

  'example-20261018-salomon-acs-pro': artwork.runner,
  'example-20261018-salomon-speedcross-6': artwork.sage,
  'example-20261018-salomon-xa-pro-3d': artwork.trailRunner,
  'example-20261018-salomon-xt-4-og': artwork.everydayTrail,
  'example-20261018-salomon-xt-6': artwork.trail,

  'example-20261018-stride-aero-runner': artwork.blue,
  'example-20261018-stride-daily-slip-on': artwork.slipOn,
  'example-20261018-stride-kids-sprint': artwork.sprint,
  'example-20261018-stride-track-lite': artwork.sage,
  'example-20261018-stride-trail-pro': artwork.trail,

  'example-vans-authentic-navy-reference': artwork.casual,
  'example-vans-knu-skool-brown-reference': artwork.retro,
  'example-vans-mary-jane-leather-reference': artwork.maryJane,
  'example-vans-mary-jane-straps-reference': artwork.maryJaneStraps,
  'example-vans-old-skool-navy-reference': artwork.retroLow,
}

export function catalogArtworkFor(slug) {
  return typeof slug === 'string' && Object.hasOwn(artworkBySlug, slug)
    ? artworkBySlug[slug]
    : undefined
}
