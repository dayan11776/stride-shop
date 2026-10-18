import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { Component } from './SearchPage'

vi.mock('@/features/catalog/components/CatalogPage', () => ({
  CatalogPage: ({ title, filters }) => <div data-testid="catalog">{JSON.stringify({ title, filters })}</div>,
}))

test('passes an exact brand filter for a brand link', () => {
  render(<MemoryRouter initialEntries={['/search?brand=ON']}><Component /></MemoryRouter>)
  expect(JSON.parse(screen.getByTestId('catalog').textContent)).toEqual({ title: 'ON', filters: { brand: 'ON' } })
})

test('preserves normal keyword search', () => {
  render(<MemoryRouter initialEntries={['/search?q=runner']}><Component /></MemoryRouter>)
  expect(JSON.parse(screen.getByTestId('catalog').textContent)).toEqual({ title: 'Results for “runner”', filters: { q: 'runner' } })
})
