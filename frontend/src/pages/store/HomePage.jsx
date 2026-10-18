import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useProducts } from '@/features/catalog/hooks'
import { formatPeso } from '@/lib/format'
import './HomePage.css'

// The same brands shown on the Brands page, with adidas first as in the
// approved homepage design. Illustrations are used when a product photo is absent.
const brands = ['ADIDAS', 'STRIDE', 'ASICS', 'NEW BALANCE', 'ON', 'SALOMON', 'HOKA', 'NIKE', 'PUMA', 'VANS', 'CONVERSE', 'REEBOK']
const placeholder = '/images/product-placeholder.svg'
const illustrations = ['/images/illustration-runner.png', '/images/illustration-casual.png', '/images/illustration-kids.png', '/images/illustration-trail.png']
const collections = [
  { label: 'Women', to: '/women', audience: 'women', style: 'women' },
  { label: 'Men', to: '/men', audience: 'men', style: 'men' },
  { label: 'Kids', to: '/kids', audience: 'kids', style: 'kids' },
  { label: 'New arrivals', to: '/new-arrivals', style: 'new' },
]

function hasPhoto(product) {
  return Boolean(product?.image && product.image !== placeholder)
}

function featuredProduct(products) {
  return products.find(hasPhoto) ?? products[0]
}

function ProductImage({ product, className = '', decorative = false, caption = false, fallbackIndex = 0 }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const audienceIndex = { men: 0, women: 1, kids: 2 }[product?.audience]
  const image = hasPhoto(product) && product.image !== failedUrl ? product.image : illustrations[audienceIndex ?? fallbackIndex % illustrations.length]
  const isIllustration = image !== product?.image
  return <><img
    className={className}
    src={image}
    alt={decorative ? '' : isIllustration ? 'Illustrative shoe, not an actual product photo' : product.name}
    onError={!isIllustration ? () => setFailedUrl(image) : undefined}
  />{isIllustration && caption && <span className="home-image-note">Illustrative shoe image</span>}</>
}

function CarouselArrow({ label, previous = false, onClick, disabled = false }) {
  return <button type="button" className="home-carousel-arrow" aria-label={label} onClick={onClick} disabled={disabled}>
    <Icon name="arrow" size={22} className={previous ? 'home-arrow-reversed' : ''} />
  </button>
}

function ArrivalSpotlight({ arrivals, isLoading, isError, retry }) {
  const [index, setIndex] = useState(0)
  const currentIndex = arrivals.length ? index % arrivals.length : 0
  const product = arrivals[currentIndex]
  const thumbnailStart = Math.min(Math.max(currentIndex - 1, 0), Math.max(arrivals.length - 4, 0))
  const thumbnails = arrivals.slice(thumbnailStart, thumbnailStart + 4)
  const move = (delta) => setIndex((currentIndex + delta + arrivals.length) % arrivals.length)

  return <section className="home-arrivals" aria-label="New arrivals spotlight">
    <div className="container home-arrivals-inner">
      <div className="home-arrivals-stage">
        <div className="home-arrivals-title">
          <p className="eyebrow">Just landed</p>
          <h1>New<br /> arrivals</h1>
        </div>
        <span className="home-arrivals-watermark" aria-hidden="true">STRIDE</span>
        <div className="home-arrivals-image" aria-busy={isLoading}>
          {isLoading ? <div className="skeleton home-arrivals-skeleton" /> : product && <ProductImage product={product} caption />}
        </div>
        <div className="home-arrivals-info" aria-live="polite">
          {isLoading ? <p>Finding the latest styles…</p> : isError ? <>
            <p>New arrivals could not be loaded.</p>
            <button type="button" className="home-text-button" onClick={retry}>Try again</button>
          </> : product ? <>
            <p className="eyebrow">New arrival · {product.brand}</p>
            <h2>{product.name}</h2>
            {Number(product.salePrice ?? product.price) > 0 && <p className="home-arrivals-price">{formatPeso(product.salePrice ?? product.price)}</p>}
            {product.isExamplePrice && <p className="home-example-note">Example price; not verified.</p>}
            {product.isExampleStock && <p className="home-example-note">Example stock; confirm availability.</p>}
            <Button as={Link} to={`/products/${product.slug}`}>View product <Icon name="arrow" size={17} /></Button>
          </> : <>
            <p className="eyebrow">Coming soon</p>
            <p>New arrivals are on their way.</p>
            <Button as={Link} to="/shop">Explore all shoes <Icon name="arrow" size={17} /></Button>
          </>}
        </div>
      </div>
      {arrivals.length > 0 && <div className="home-arrivals-controls" aria-label="Choose a new arrival">
        <CarouselArrow label="Previous new arrival" previous onClick={() => move(-1)} disabled={arrivals.length < 2} />
        <div className="home-arrivals-thumbnails">
          {thumbnails.map((item, offset) => {
            const itemIndex = thumbnailStart + offset
            return <button type="button" key={item.id ?? item.slug} className={`home-arrivals-thumbnail${itemIndex === currentIndex ? ' is-selected' : ''}`} aria-label={`Show ${item.name}, ${itemIndex + 1} of ${arrivals.length}`} aria-pressed={itemIndex === currentIndex} onClick={() => setIndex(itemIndex)}>
              <ProductImage product={item} decorative />
            </button>
          })}
        </div>
        <CarouselArrow label="Next new arrival" onClick={() => move(1)} disabled={arrivals.length < 2} />
      </div>}
      <Link className="home-underlined-link home-all-arrivals" to="/new-arrivals">Shop all new arrivals <Icon name="arrow" size={17} /></Link>
    </div>
  </section>
}

function Collections({ products, arrivals, isLoading }) {
  return <section className="container home-collections home-section">
    <div className="home-section-heading">
      <div><p className="eyebrow">Shop by collection</p><h2>Find your stride</h2></div>
      <Link className="home-heading-link" to="/shop">View all shoes <Icon name="arrow" size={17} /></Link>
    </div>
    <div className="home-collection-grid" aria-busy={isLoading}>
      {collections.map((collection) => {
        const items = collection.audience ? products.filter((product) => String(product.audience).toLowerCase() === collection.audience) : arrivals
        const product = featuredProduct(items)
        return <Link key={collection.label} to={collection.to} className={`home-collection-card home-collection-card--${collection.style}`}>
          <div className="home-collection-copy"><h3>{collection.label}</h3><span className="home-underlined-link">Explore category <Icon name="arrow" size={17} /></span></div>
          <ProductImage product={product ?? { audience: collection.audience }} className="home-collection-image" decorative caption fallbackIndex={collection.style === 'new' ? 3 : 0} />
        </Link>
      })}
    </div>
  </section>
}

function BrandSpotlight({ products, isLoading, isError, retry }) {
  const [index, setIndex] = useState(0)
  const brand = brands[index]
  const matchingProducts = products.filter((product) => String(product.brand).trim().toUpperCase() === brand)
  const product = featuredProduct(matchingProducts)
  const move = (delta) => setIndex((index + delta + brands.length) % brands.length)
  return <section className="container home-brands home-section" aria-label="Shop by brand">
    <div className="home-section-heading">
      <div><p className="eyebrow">Shop by brand</p><h2>Brands</h2></div>
      <Link className="home-heading-link" to="/brands">View all brands <Icon name="arrow" size={17} /></Link>
    </div>
    <div className="home-brand-stage" aria-live="polite" aria-busy={isLoading}>
      <span className={`home-brand-word${brand.length > 7 ? ' home-brand-word--long' : ''}`} aria-hidden="true">{brand}</span>
      <span className="home-brand-label">{brand}</span>
      <div className="home-brand-image"><ProductImage product={product} fallbackIndex={index} caption /></div>
      <div className="home-brand-arrows">
        <CarouselArrow label="Previous brand" previous onClick={() => move(-1)} />
        <CarouselArrow label="Next brand" onClick={() => move(1)} />
      </div>
      <div className="home-brand-bottom">
        <div><span className="home-brand-count">{String(index + 1).padStart(2, '0')} / {brands.length}</span><span className="home-brand-progress" aria-hidden="true" /></div>
        <div className="home-brand-caption">
          {isError ? <button type="button" className="home-text-button" onClick={retry}>Products unavailable · Try again</button> : !isLoading && !product ? <span className="home-brand-empty">Products coming soon</span> : null}
          <Link className="home-underlined-link" to={`/search?brand=${encodeURIComponent(brand)}`}>Shop this brand <Icon name="arrow" size={17} /></Link>
        </div>
      </div>
    </div>
  </section>
}

export function Component() {
  const { data: arrivals = [], isLoading: arrivalsLoading, isError: arrivalsError, refetch: retryArrivals } = useProducts({ isNew: true })
  const { data: products = [], isLoading: productsLoading, isError: productsError, refetch: retryProducts } = useProducts({})
  return <>
    <ArrivalSpotlight arrivals={arrivals} isLoading={arrivalsLoading} isError={arrivalsError} retry={retryArrivals} />
    <Collections products={products} arrivals={arrivals} isLoading={productsLoading || arrivalsLoading} />
    <BrandSpotlight products={products} isLoading={productsLoading} isError={productsError} retry={retryProducts} />
  </>
}
