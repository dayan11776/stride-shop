import { InfoPage } from '@/components/content/InfoPage'

export function Component() {
  return <InfoPage
    eyebrow="30 days, simply"
    title="Returns & refunds"
    lead="If a pair is not quite right, we will help you find the right next step—whether that is an exchange, refund or store credit."
    sections={[
      { title: 'What is eligible?', body: 'Items must be unworn, in their original box, with all tags and accessories. Requests need to be made within 30 days of delivery.' },
      { title: 'Start a request', items: ['Sign in and open Order history.', 'Choose the order and let us know which item you are returning.', 'Select an exchange, refund or store credit and follow the return instructions we send.'] },
      { title: 'Refund timing', body: 'Once a return is received and checked, approved refunds are sent to the original payment method. Your bank or provider may take additional time to post the credit.' },
    ]}
    links={[["View your orders", "/account/orders"], ["Ask about a return", "/support/contact"]]}
  />
}
