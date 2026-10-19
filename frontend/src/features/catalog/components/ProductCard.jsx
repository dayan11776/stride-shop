import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPeso } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { useWishlistStore } from '@/features/wishlist/wishlistStore'
import styles from './ProductCard.module.css'

export function ProductCard({ product, artwork }) {
  const saved = useWishlistStore((state) => state.ids.includes(product.id))
  const toggle = useWishlistStore((state) => state.toggle)
  const quantity = product.availableQuantity
  const hasQuantity = typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 0
  const image = typeof product.image === 'string' ? product.image.trim() : ''
  const artworkUrl = typeof artwork === 'string' ? artwork.trim() : ''
  const placeholder = '/images/product-placeholder.svg'
  const [failedImage, setFailedImage] = useState(null)
  const [failedArtwork, setFailedArtwork] = useState(null)
  const hasPhoto = Boolean(image && image !== placeholder && image !== failedImage)
  const hasArtwork = Boolean(!hasPhoto && artworkUrl && artworkUrl !== placeholder && artworkUrl !== failedArtwork)
  const imageSource = hasPhoto ? image : hasArtwork ? artworkUrl : placeholder
  const imageAlt = hasPhoto ? product.name : hasArtwork ? `Illustration, not the actual product: ${product.name}` : 'Product image unavailable'
  const handleImageError = hasPhoto ? () => setFailedImage(image) : hasArtwork ? () => setFailedArtwork(artworkUrl) : undefined
  const pairCount = hasQuantity ? `${quantity.toLocaleString('en-PH')} ${quantity === 1 ? 'pair' : 'pairs'}` : null
  const stockLabel = product.isExampleStock
    ? pairCount ? `Example stock: ${pairCount} (not verified)` : 'Example stock: quantity unavailable (not verified)'
    : pairCount ? `${pairCount} available in total` : 'Stock information unavailable'
  return <article className={styles.card}>
    <Link to={`/products/${product.slug}`} className={styles.tile} aria-label={`View ${product.name}`}>
      <img src={imageSource} alt={imageAlt} loading="lazy" onError={handleImageError} />
      <span className={styles.view}>View shoe <Icon name="arrow" size={16} /></span>
    </Link>
    {(product.salePrice != null || product.isNew) && <Badge className={styles.badge}>{product.salePrice != null ? 'Sale' : 'New'}</Badge>}
    <button className={styles.heart} aria-label={saved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={saved} onClick={() => toggle(product.id)}><Icon name="heart" size={20} strokeWidth={saved ? 2.4 : 1.7} /></button>
    <div className={styles.copy}><p className={styles.brand}>{product.brand}</p><h3 className={styles.name}><Link to={`/products/${product.slug}`}>{product.name}</Link></h3>{hasArtwork && <p className={styles.artworkDisclosure}>Illustration — not actual product</p>}<p className={styles.price}><strong>{formatPeso(product.salePrice ?? product.price)}</strong>{product.salePrice != null && <s>{formatPeso(product.price)}</s>}</p>{product.isExamplePrice && <p className={styles.stock}>Example price; not verified by the store.</p>}<p className={styles.stock}>{stockLabel}</p></div>
  </article>
}
