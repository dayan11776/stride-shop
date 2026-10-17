import { describe, expect, it } from 'vitest'
import { normalizeProduct } from './api'

describe('product image normalization', () => {
  it('uses a neutral placeholder when the API returns no image', () => {
    expect(normalizeProduct({ image: '', images: [] }).image).toBe('/images/product-placeholder.svg')
    expect(normalizeProduct({ image: '   ' }).image).toBe('/images/product-placeholder.svg')
  })

  it('prefers a supplied product image and falls back to the image collection', () => {
    expect(normalizeProduct({ image: 'https://example.test/main.jpg', images: [{ url: 'https://example.test/other.jpg' }] }).image).toBe('https://example.test/main.jpg')
    expect(normalizeProduct({ image: '', images: [{ url: 'https://example.test/other.jpg' }] }).image).toBe('https://example.test/other.jpg')
  })
})
