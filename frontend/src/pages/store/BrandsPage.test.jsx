import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { Component } from './BrandsPage'

test('brand links use the exact brand filter instead of a broad keyword search', () => {
  render(<MemoryRouter><Component /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'ON' }).getAttribute('href')).toBe('/search?brand=ON')
  expect(screen.getByRole('link', { name: 'NEW BALANCE' }).getAttribute('href')).toBe('/search?brand=NEW%20BALANCE')
})
