// Editorial art is deliberately kept separate from catalog product photos.
// These associations are for the example arrival listings; verified photos,
// when provided by the store, always take precedence.
const arrivalArtwork = {
  'example-20261018-stride-daily-slip-on': '/images/arrival-slip-on.webp',
  'example-20261018-stride-kids-sprint': '/images/arrival-kids-sprint.webp',
  'example-20261018-asics-novablast-6-1011c243-403': '/images/arrival-blue-runner.webp',
  'example-20261018-on-cloudboom-strike-2': '/images/arrival-sage-runner.webp',
  'example-20261018-salomon-xt-6': '/images/arrival-trail.webp',
  'example-nike-air-force-1-07-cw2288-111': '/images/illustration-casual.webp',
  'example-adidas-tokyo-ih6639': '/images/illustration-runner.webp',
  'example-adidas-sl-72-rs-kids-reference': '/images/illustration-kids.webp',
  'example-puma-turino-ii-397452-02': '/images/illustration-trail.webp',
  'example-vans-mary-jane-leather-reference': '/images/arrival-mary-jane.webp',
}

const artworkPool = Object.values(arrivalArtwork)

// Assign otherwise-unmapped arrivals in slug order, using only unclaimed art.
// Beyond the available artwork, use a truthful placeholder rather than
// duplicating an image and suggesting it is a photo of another product.
export function arrivalArtworkFor(products) {
  const assignments = {}
  const claimed = new Set()
  for (const product of products) {
    const art = arrivalArtwork[product.slug]
    if (art) {
      assignments[product.slug] = art
      claimed.add(art)
    }
  }
  const available = artworkPool.filter((art) => !claimed.has(art))
  const unmapped = products.filter((product) => !assignments[product.slug])
    .slice().sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
  for (const product of unmapped) {
    assignments[product.slug] = available.shift() ?? '/images/product-placeholder.svg'
  }
  return assignments
}
