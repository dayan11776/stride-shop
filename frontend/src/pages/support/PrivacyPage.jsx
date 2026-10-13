import { InfoPage } from '@/components/content/InfoPage'

export function Component() {
  return <InfoPage
    eyebrow="Your data, respected"
    title="Privacy policy"
    lead="We collect only what we need to make STRIDE useful: ordering, delivering, supporting you and improving the experience."
    sections={[
      { title: 'What we collect', body: 'This includes the contact, delivery and payment-status information required to complete an order, plus optional account and newsletter details you provide.' },
      { title: 'How we use it', body: 'We use your details to process purchases, prevent fraud, provide customer support, and send only the updates or marketing messages you choose to receive.' },
      { title: 'Payment data', body: 'Payment is processed by Xendit. STRIDE does not store your full card or wallet credentials in this application.' },
      { title: 'Your choices', body: 'You can update account details, unsubscribe from marketing, or contact us to ask about personal-data requests.' },
    ]}
    links={[["Contact privacy support", "/support/contact"], ["Read terms", "/support/terms"]]}
  />
}
