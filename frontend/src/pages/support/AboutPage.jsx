import { InfoPage } from '@/components/content/InfoPage'

export function Component() {
  return <InfoPage
    eyebrow="About STRIDE"
    title="Move better, every day."
    lead="STRIDE is a footwear store for people who move through the world in their own way. We make choosing a reliable, well-designed pair simpler."
    sections={[
      { title: 'Our point of view', body: 'A good shoe should work with your actual life: the long walk, the quick errand, the train platform, the weekend outside. We select for comfort, construction and enduring design.' },
      { title: 'Considered by default', body: 'We favour materials, partners and packaging choices that create less waste where we can, and we are always working to do more.' },
      { title: 'For every route', body: 'From everyday runners to easy classics and growing feet, our edit meets you wherever you are headed.' },
    ]}
    links={[["Shop new arrivals", "/new-arrivals"], ["Read the size guide", "/support/size-guide"]]}
  />
}
