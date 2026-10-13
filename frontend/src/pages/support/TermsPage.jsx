import { InfoPage } from '@/components/content/InfoPage'

export function Component() {
  return <InfoPage
    eyebrow="The fine print, plainly"
    title="Terms & conditions"
    lead="Using STRIDE means you agree to use the store lawfully, provide accurate order information, and review the delivery and returns terms before purchasing."
    sections={[
      { title: 'Orders', body: 'An order is subject to product availability and payment confirmation. We may contact you if there is an issue with stock, pricing or delivery details.' },
      { title: 'Product information', body: 'We work to display colours, specifications and sizing accurately, though screen settings can affect how colours appear.' },
      { title: 'Returns', body: 'Returns and exchanges are governed by our returns policy. Nothing here limits rights you have under applicable consumer-protection law.' },
    ]}
    links={[["Returns policy", "/support/returns-policy"], ["Contact STRIDE", "/support/contact"]]}
  />
}
