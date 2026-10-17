import { findVariantForSize, isVariantAvailable, shoeSizeKey } from './shoeSize'

test('normalizes equivalent numeric shoe-size formats', () => {
  expect(shoeSizeKey('39.0')).toBe('39')
  expect(shoeSizeKey(39)).toBe('39')
})

test('finds a DRF variant when the product size is numeric', () => {
  const variant = { id: 'variant-39', sizeEu: '39.0' }
  expect(findVariantForSize([variant], 39)).toBe(variant)
})

test('does not choose inactive or out-of-stock variants', () => {
  const inactive = { id: 'inactive', sizeEu: '40.0', isActive: false, available: 3 }
  const soldOut = { id: 'sold-out', sizeEu: '40.0', is_active: true, available: 0 }
  const available = { id: 'available', sizeEu: '40.0', isActive: true, available: 4 }
  expect(isVariantAvailable(inactive)).toBe(false)
  expect(isVariantAvailable(soldOut)).toBe(false)
  expect(findVariantForSize([inactive, soldOut, available], 40)).toBe(available)
})

test('matches the requested colour and width for the same EU size', () => {
  const variants = [
    { id: 'sage', sizeEu: 40, colorName: 'Sage', width: 'regular', available: 2 },
    { id: 'black-wide', sizeEu: '40.0', color_name: 'Black', width: 'wide', available: 3 },
  ]
  expect(findVariantForSize(variants, '40.0', { color: 'Black', width: 'wide' }).id).toBe('black-wide')
  expect(findVariantForSize(variants, 40, { color: 'Black', width: 'regular' })).toBeUndefined()
})
