import { useQuery } from '@tanstack/react-query'
import { getProduct, getProducts } from './api'

export const productKeys = {
  list: (filters) => ['products', 'list', filters],
  detail: (slug) => ['products', 'detail', slug],
}
export const useProducts = (filters) => useQuery({ queryKey: productKeys.list(filters), queryFn: () => getProducts(filters) })
export const useProduct = (slug) => useQuery({ queryKey: productKeys.detail(slug), queryFn: () => getProduct(slug) })
