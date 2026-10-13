import { formatPeso, unitPrice } from './format'
test('formats pesos', () => { expect(formatPeso(4495)).toContain('4,495') })
test('uses the sale price when there is one', () => { expect(unitPrice({ price: 100, salePrice: 80 })).toBe(80); expect(unitPrice({ price: 100 })).toBe(100) })
