import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPeso } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { useWishlistStore } from '@/features/wishlist/wishlistStore'
import { shouldBlendProductPhoto, shouldRecenterProductPhoto } from '@/features/catalog/productPhotoAlignment'
import styles from './ProductCard.module.css'

function audienceLabel(audience) {
  if (typeof audience !== 'string' || audience.trim() === '') return null
  return audience.charAt(0).toUpperCase() + audience.slice(1)
}

function productColorName(product) {
  const direct = product.colorName ?? product.color_name ?? product.color
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const variant = (product.variants ?? []).find((entry) => {
    const color = entry?.colorName ?? entry?.color_name ?? entry?.color
    return typeof color === 'string' && color.trim()
  })
  const variantColor = variant?.colorName ?? variant?.color_name ?? variant?.color
  return typeof variantColor === 'string' && variantColor.trim() ? variantColor.trim() : null
}

export function ProductCard({ product, artwork, showExampleMetadata = true, presentation = 'default', imagePreference = 'photo' }) {
  const isCatalogPresentation = presentation === 'catalog'
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
  const hasArtwork = Boolean(artworkUrl && artworkUrl !== placeholder && artworkUrl !== failedArtwork)
  const useArtwork = hasArtwork && (imagePreference === 'artwork' || !hasPhoto)
  const activePhoto = hasPhoto && !useArtwork
  const recenterPhoto = activePhoto && shouldRecenterProductPhoto(image)
  const imageSource = useArtwork ? artworkUrl : activePhoto ? image : placeholder
  const imageAlt = activePhoto ? product.name : useArtwork ? `Illustration, not the actual product: ${product.name}` : 'Product image unavailable'
  const handleImageError = activePhoto ? () => setFailedImage(image) : useArtwork ? () => setFailedArtwork(artworkUrl) : undefined
  const pairCount = hasQuantity ? `${quantity.toLocaleString('en-PH')} ${quantity === 1 ? 'pair' : 'pairs'}` : null
  const color = productColorName(product)
  const audience = audienceLabel(product.audience)
  // Compact category cards intentionally omit unverified example stock rather
  // than presenting it as confirmed availability.
  const stockLabel = product.isExampleStock && !showExampleMetadata
    ? null
    : product.isExampleStock
      ? pairCount ? `Example stock: ${pairCount} (not verified)` : 'Example stock: quantity unavailable (not verified)'
      : pairCount ? `${pairCount} available in total` : 'Stock information unavailable'
  return <article className={`${styles.card}${isCatalogPresentation ? ` ${styles.catalogCard}` : ''}`}>
    <Link to={`/products/${product.slug}`} className={`${styles.tile}${activePhoto && shouldBlendProductPhoto(image) ? ` ${styles.tileProductPhoto}` : ''}${recenterPhoto ? ` ${styles.tileRecenteredPhoto}` : ''}`} aria-label={`View ${product.name}`}>
      <img src={imageSource} alt={imageAlt} loading="lazy" onError={handleImageError} />
      <span className={styles.view}>View shoe <Icon name="arrow" size={16} /></span>
    </Link>
    {!isCatalogPresentation && (product.salePrice != null || product.isNew) && <Badge className={styles.badge}>{product.salePrice != null ? 'Sale' : 'New'}</Badge>}
    <button className={styles.heart} aria-label={saved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={saved} onClick={() => toggle(product.id)}><Icon name="heart" size={20} strokeWidth={saved ? 2.4 : 1.7} /></button>
    <div className={styles.copy}>
      <p className={styles.brand}>{product.brand}</p>
      <h3 className={styles.name}><Link to={`/products/${product.slug}`}>{product.name}</Link></h3>
      {isCatalogPresentation ? <>
        {audience && <p className={styles.productMeta}>{audience}</p>}
        {color && <p className={styles.productMeta}>Color : {color}</p>}
      </> : useArtwork && <p className={styles.artworkDisclosure}>Illustration — not actual product</p>}
      <p className={styles.price}><strong>{formatPeso(product.salePrice ?? product.price)}</strong>{!isCatalogPresentation && product.salePrice != null && <s>{formatPeso(product.price)}</s>}</p>
      {!isCatalogPresentation && showExampleMetadata && product.isExamplePrice && <p className={styles.stock}>Example price; not verified by the store.</p>}
      {!isCatalogPresentation && stockLabel && <p className={styles.stock}>{stockLabel}</p>}
    </div>
  </article>
}
