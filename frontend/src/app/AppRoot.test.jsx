import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { AppRoot } from './AppRoot'

afterEach(() => vi.restoreAllMocks())

test('new pages start at the top and going back restores the listing position', async () => {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(820)
  const router = createMemoryRouter([{
    element: <AppRoot />,
    children: [
      { path: '/shop', element: <Link to="/products/shoe">View shoe</Link> },
      { path: '/products/shoe', element: <h1>Shoe details</h1> },
    ],
  }], { initialEntries: ['/shop'] })

  render(<RouterProvider router={router} />)
  scrollTo.mockClear()
  fireEvent.click(screen.getByRole('link', { name: 'View shoe' }))
  expect(await screen.findByRole('heading', { name: 'Shoe details' })).toBeTruthy()
  await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 0))

  await act(async () => { await router.navigate(-1) })
  expect(screen.getByRole('link', { name: 'View shoe' })).toBeTruthy()
  await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 820))
})
