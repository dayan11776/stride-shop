import { createBrowserRouter } from 'react-router-dom'
import { StoreLayout } from '@/layouts/StoreLayout'
import { CheckoutLayout } from '@/layouts/CheckoutLayout'
import { AccountLayout } from '@/layouts/AccountLayout'
import { SupportLayout } from '@/layouts/SupportLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { RequireAuth, RequireAdmin } from '@/features/auth/guards'
import { RouteError } from '@/app/RouteError'

// Every page is lazy-loaded, so each route is its own JavaScript chunk.
// A page module exports `Component` (and optionally `loader`).
export const router = createBrowserRouter([
  {
    element: <StoreLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('@/pages/store/HomePage') },
      { path: 'shop', lazy: () => import('@/pages/store/ShopPage') },
      { path: 'men', lazy: () => import('@/pages/store/CategoryPage'), handle: { audience: 'men' } },
      { path: 'women', lazy: () => import('@/pages/store/CategoryPage'), handle: { audience: 'women' } },
      { path: 'kids', lazy: () => import('@/pages/store/CategoryPage'), handle: { audience: 'kids' } },
      { path: 'new-arrivals', lazy: () => import('@/pages/store/NewArrivalsPage') },
      { path: 'sale', lazy: () => import('@/pages/store/SalePage') },
      { path: 'brands', lazy: () => import('@/pages/store/BrandsPage') },
      { path: 'search', lazy: () => import('@/pages/store/SearchPage') },
      { path: 'products/:slug', lazy: () => import('@/pages/store/ProductPage') },
      { path: 'cart', lazy: () => import('@/pages/store/CartPage') },
      { path: 'lookbook', lazy: () => import('@/pages/store/LookbookPage') },
      { path: 'newsletter/subscribed', lazy: () => import('@/pages/store/NewsletterSubscribedPage') },
      { path: 'login', lazy: () => import('@/pages/store/LoginPage') },
      {
        path: 'support',
        element: <SupportLayout />,
        children: [
          { index: true, lazy: () => import('@/pages/support/SupportHubPage') },
          { path: 'about', lazy: () => import('@/pages/support/AboutPage') },
          { path: 'contact', lazy: () => import('@/pages/support/ContactPage') },
          { path: 'faq', lazy: () => import('@/pages/support/FaqPage') },
          { path: 'size-guide', lazy: () => import('@/pages/support/SizeGuidePage') },
          { path: 'shipping', lazy: () => import('@/pages/support/ShippingPage') },
          { path: 'returns-policy', lazy: () => import('@/pages/support/ReturnsPolicyPage') },
          { path: 'privacy', lazy: () => import('@/pages/support/PrivacyPage') },
          { path: 'terms', lazy: () => import('@/pages/support/TermsPage') },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'account',
            element: <AccountLayout />,
            children: [
              { index: true, lazy: () => import('@/pages/account/AccountPage') },
              { path: 'profile', lazy: () => import('@/pages/account/ProfilePage') },
              { path: 'addresses', lazy: () => import('@/pages/account/AddressesPage') },
              { path: 'orders', lazy: () => import('@/pages/account/OrderHistoryPage') },
              { path: 'orders/:orderId', lazy: () => import('@/pages/account/OrderTrackingPage') },
              { path: 'returns', lazy: () => import('@/pages/account/ReturnsPage') },
              { path: 'wishlist', lazy: () => import('@/pages/account/WishlistPage') },
            ],
          },
        ],
      },
    ],
  },
  {
    element: <CheckoutLayout />,
    errorElement: <RouteError />,
    children: [
      { path: 'checkout', lazy: () => import('@/pages/checkout/CheckoutPage') },
      { path: 'order-confirmation/:orderNumber', lazy: () => import('@/pages/checkout/ConfirmationPage') },
    ],
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        path: 'admin',
        element: <AdminLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: () => import('@/pages/admin/DashboardPage') },
          { path: 'products', lazy: () => import('@/pages/admin/ProductsPage') },
          { path: 'orders', lazy: () => import('@/pages/admin/OrdersPage') },
          { path: 'returns', lazy: () => import('@/pages/admin/ReturnsPage') },
          { path: 'customers', lazy: () => import('@/pages/admin/CustomersPage') },
          { path: 'discounts', lazy: () => import('@/pages/admin/DiscountsPage') },
          { path: 'homepage', lazy: () => import('@/pages/admin/HomepageContentPage') },
          { path: 'reports', lazy: () => import('@/pages/admin/ReportsPage') },
        ],
      },
    ],
  },
])
