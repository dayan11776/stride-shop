import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import batch from '../../../../backend/commerce/catalog_batch_20261018.json'
import { arrivalArtworkFor } from '@/pages/store/homeArtwork'
import { catalogArtworkFor } from './catalogArtwork'

describe('catalog editorial artwork', () => {
  test('assigns every existing example listing artwork without repeating a shoe within a brand', () => {
    const brands = [...new Set(batch.map((product) => product.brand.name))]
    expect(brands).toHaveLength(12)
    expect(batch).toHaveLength(60)

    for (const brand of brands) {
      const entries = batch.filter((product) => product.brand.name === brand)
      const images = entries.map((product) => catalogArtworkFor(product.slug))
      expect(entries, brand).toHaveLength(5)
      expect(images.every((image) => /^\/images\/.+\.webp$/.test(image)), brand).toBe(true)
      for (const image of images) {
        expect(existsSync(resolve(process.cwd(), 'public', image.slice(1))), image).toBe(true)
      }
      expect(new Set(images).size, brand).toBe(entries.length)
    }
  })

  test('matches the ten unique homepage arrival illustrations regardless of order', () => {
    const arrivals = batch.filter((product) => product.is_new_arrival)
    expect(arrivals).toHaveLength(10)
    const homeImages = arrivalArtworkFor(arrivals)
    const images = arrivals.map((product) => catalogArtworkFor(product.slug))
    expect(new Set(images).size).toBe(10)
    for (const product of arrivals.slice().reverse()) {
      expect(catalogArtworkFor(product.slug)).toBe(homeImages[product.slug])
    }
  })

  test('does not invent an image for unknown or invalid slugs', () => {
    for (const slug of ['new-product', 'constructor', '__proto__', '', null, undefined]) {
      expect(catalogArtworkFor(slug)).toBeUndefined()
    }
  })
})
