import { describe, expect, test } from 'vitest'
import products from '../../../../backend/commerce/fixtures/reference_catalog_20261017.json'
import { shouldBlendProductPhoto, shouldRecenterProductPhoto } from './productPhotoAlignment'

const originallyRecenteredSlugs = [
  'example-adidas-men-kj0817',
  'example-adidas-men-kj1877',
  'example-adidas-men-ki7977',
  'example-adidas-men-ki4776',
  'example-adidas-women-jq3324',
  'example-adidas-women-jq6965',
  'example-adidas-women-jq1690',
  'example-adidas-kids-ki1768',
]

function primaryPhoto(product) {
  return product.images.find((image) => image.is_primary)?.url
}

describe('reference product photo adjustments', () => {
  test('recognizes all 30 exact fixture photo URLs for the background treatment', () => {
    const photos = products.map(primaryPhoto)
    expect(products).toHaveLength(30)
    expect(photos.every((url) => typeof url === 'string' && url.length > 0)).toBe(true)
    expect(new Set(photos).size).toBe(30)

    for (const photo of photos) {
      expect(shouldBlendProductPhoto(photo), photo).toBe(true)
    }
  })

  test('preserves the original eight recentered photos and no other fixture photos', () => {
    const recenteredSlugs = products
      .filter((product) => shouldRecenterProductPhoto(primaryPhoto(product)))
      .map((product) => product.slug)

    expect(recenteredSlugs).toHaveLength(8)
    expect(recenteredSlugs.sort()).toEqual([...originallyRecenteredSlugs].sort())
  })

  test('does not apply an adjustment to a changed crop, query, host, or unknown photo', () => {
    const knownPhoto = primaryPhoto(products.find((product) => product.slug === 'example-adidas-men-ki7977'))
    const unknownPhotos = [
      knownPhoto.replace('w_500', 'w_600'),
      knownPhoto.replace('_HM1.jpg', '_HM2.jpg'),
      `${knownPhoto}?version=2`,
      knownPhoto.replace('assets.adidas.com', 'example.com'),
      '/images/new-product.jpg',
      '',
      null,
      undefined,
    ]

    for (const photo of unknownPhotos) {
      expect(shouldBlendProductPhoto(photo), String(photo)).toBe(false)
      expect(shouldRecenterProductPhoto(photo), String(photo)).toBe(false)
    }
  })
})
