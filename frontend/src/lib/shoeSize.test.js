import { findVariantForSize, shoeSizeKey } from './shoeSize'

test('normalizes equivalent numeric shoe-size formats', () => {
  expect(shoeSizeKey('39.0')).toBe('39')
  expect(shoeSizeKey(39)).toBe('39')
})

test('finds a DRF variant when the product size is numeric', () => {
  const variant = { id: 'variant-39', sizeEu: '39.0' }
  expect(findVariantForSize([variant], 39)).toBe(variant)
})
