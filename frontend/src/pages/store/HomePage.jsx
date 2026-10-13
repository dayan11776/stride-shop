import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ErrorState } from '@/components/ui/PageState'
import { useProducts } from '@/features/catalog/hooks'
import { ProductCard } from '@/features/catalog/components/ProductCard'

const categories = [['Women', '/women', '/images/shoe3.jpg'], ['Men', '/men', '/images/shoe1.jpg'], ['Kids', '/kids', '/images/shoe6.jpg']]

export function Component() {
  const { data: newArrivals = [], isLoading, isError, error, refetch } = useProducts({ isNew: true })
  return <>
    <section className="overflow-hidden bg-ink text-cream">
      <div className="container grid min-h-[520px] items-stretch lg:grid-cols-[1.05fr_.95fr]">
        <div className="flex flex-col justify-center py-14 lg:py-20">
          <p className="eyebrow !text-[#b7c49d]">New collection · 2026</p>
          <h1 className="max-w-[630px] text-[clamp(68px,9.2vw,148px)] leading-[.78] tracking-[.01em]">MOVE<br /><em className="font-normal text-sage">YOUR WAY.</em></h1>
          <p className="mt-7 max-w-[390px] text-base leading-6 text-[#EAE2D6]">Performance-led footwear with the comfort to take you further — on every kind of day.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button as={Link} to="/new-arrivals">Shop new arrivals <Icon name="arrow" size={17} /></Button><Button as={Link} to="/lookbook" variant="secondary" className="!border-[#EAE2D6] !text-cream">Explore the lookbook</Button></div>
        </div>
        <div className="relative min-h-[310px] overflow-hidden bg-[#dad2c4] lg:mr-[-80px]">
          <img src="/images/shoe6.jpg" alt="STRIDE Track Lite shoe" className="h-full w-full object-cover mix-blend-multiply" />
          <div className="absolute bottom-5 left-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.12em] text-ink"><span className="h-px w-10 bg-ink" />Built for the everyday</div>
        </div>
      </div>
    </section>
    <section className="container section">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Shop by collection</p><h2 className="text-[clamp(34px,4vw,58px)]">Find your stride</h2></div><Link className="inline-flex items-center gap-2 text-sm font-bold no-underline" to="/shop">View all shoes <Icon name="arrow" size={17} /></Link></div>
      <div className="grid gap-4 md:grid-cols-3">
        {categories.map(([label, to, image]) => <Link key={label} to={to} className="group relative block aspect-[1.05] overflow-hidden rounded-ui bg-sand"><img src={image} alt="" className="h-full w-full object-cover mix-blend-multiply transition duration-500 group-hover:scale-105" /><span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-[#262B1Fbb] to-transparent px-5 pb-5 pt-14 text-[27px] font-display font-bold uppercase tracking-wide text-cream">{label}<Icon name="arrow" size={22} /></span></Link>)}
      </div>
    </section>
    <section className="container section !pt-0">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Just landed</p><h2 className="text-[clamp(34px,4vw,58px)]">New arrivals</h2></div><Link className="inline-flex items-center gap-2 text-sm font-bold no-underline" to="/new-arrivals">Shop the edit <Icon name="arrow" size={17} /></Link></div>
      {isError ? <ErrorState title="New arrivals are unavailable." detail={error?.message} onRetry={refetch} /> : <div className="product-grid">{isLoading ? Array.from({ length: 4 }, (_, index) => <div key={index}><div className="skeleton" style={{ height: 320 }} /><div className="skeleton mt-3" style={{ width: '65%' }} /></div>) : newArrivals.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}</div>}
    </section>
    <section className="container pb-12 md:pb-20"><div className="grid overflow-hidden rounded-ui bg-sand md:grid-cols-2"><img src="/images/shoe5.jpg" alt="Trail Pro on a textured background" className="h-full min-h-[280px] w-full object-cover mix-blend-multiply" /><div className="flex flex-col justify-center p-8 md:p-14"><p className="eyebrow">Designed to go farther</p><h2 className="text-[clamp(42px,5vw,72px)]">Trail ready.<br />City approved.</h2><p className="mt-5 max-w-[390px] leading-6 text-[var(--olive-gray)]">The Trail Pro pairs weather-ready grip with a clean, easy silhouette. One pair, every plan.</p><div className="mt-6"><Button as={Link} to="/products/trail-pro" variant="secondary">Meet Trail Pro</Button></div></div></div></section>
  </>
}
