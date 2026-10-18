import { InfoPage } from '@/components/content/InfoPage'

export function Component() {
  return <InfoPage
    eyebrow="Delivery, clearly"
    title="Shipping policy"
    lead="We pack every order with care and keep you posted from confirmation through delivery. Delivery availability and timing are confirmed at checkout."
    sections={[
      { title: 'Delivery times', body: 'Standard delivery typically arrives in 2–4 working days within Metro Manila and 3–7 working days elsewhere in the Philippines. Express options appear when available.' },
      { title: 'Delivery cost', body: 'Standard delivery is complimentary when your merchandise subtotal is over ₱3,500 before promo discounts. Express delivery is charged separately unless a free-delivery promo applies. Any delivery cost is shown before you place an order, with no surprise charges.' },
      { title: 'Tracking', body: 'Once dispatched, your tracking number and shipping updates appear in Order history. We will also email the update to the address used at checkout.' },
    ]}
    links={[["Track an order", "/account/orders"], ["Contact support", "/support/contact"]]}
  />
}
