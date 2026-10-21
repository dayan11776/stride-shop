import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { api, listFrom } from '@/lib/apiClient'
import './productManagement.css'

function primaryImage(product) {
  return product.images?.find((image) => image.is_primary)?.url || product.images?.[0]?.url
}

function availableStock(product) {
  return (product.variants || []).filter((variant) => variant.is_active !== false).reduce((total, variant) =>
    total + Math.max(0, Number(variant.quantity_on_hand || 0) - Number(variant.quantity_reserved || 0)), 0)
}

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function PermanentDeleteDialog({ product, busy, error, onCancel, onConfirm }) {
  const dialog = useRef(null)
  const cancelButton = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    cancelButton.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
      if (event.key === 'Tab') {
        const focusable = [...(dialog.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!dialog.current.contains(document.activeElement)) {
          event.preventDefault()
          const nextFocus = event.shiftKey ? last : first
          nextFocus.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel])

  return <div className="product-admin__dialog-backdrop" onMouseDown={(event) => {
    if (event.currentTarget === event.target && !busy) onCancel()
  }}>
    <section ref={dialog} className="product-admin__dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <button className="product-admin__dialog-close" type="button" aria-label={`Close delete confirmation for ${product.name}`} disabled={busy} onClick={onCancel}><Icon name="close" size={18} /></button>
      <p className="eyebrow">Permanent deletion</p>
      <h2 id={titleId}>Delete permanently?</h2>
      <p id={descriptionId}>“{product.name}” and its product information will be permanently removed. This cannot be undone.</p>
      {error && <p className="product-admin__dialog-error" role="alert">{error}</p>}
      <div className="product-admin__dialog-actions">
        <button ref={cancelButton} className="product-admin__action" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="product-admin__action product-admin__action--danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
      </div>
    </section>
  </div>
}

export function Component() {
  const [params, setParams] = useSearchParams()
  const recycled = params.get('tab') === 'recycled'
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState(location.state?.message || '')
  const [busy, setBusy] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const productsTab = useRef(null)
  const binTab = useRef(null)
  const deleteTrigger = useRef(null)

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/staff/products', { params: { recycled: recycled ? 'true' : undefined }, signal })
      if (!signal?.aborted) setEntries(listFrom(data))
    } catch (reason) {
      if (!signal?.aborted) setError(reason.message || 'Please try again.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [recycled])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return entries.filter((product) => (!term || `${product.name} ${product.category_name || ''} ${product.brand_name || ''} ${product.slug || ''}`.toLowerCase().includes(term)) && (recycled || !status || product.status === status))
  }, [entries, query, status, recycled])

  const selectTab = (isRecycled) => {
    setParams(isRecycled ? { tab: 'recycled' } : {})
    setQuery('')
    setStatus('')
    setMessage('')
    setActionError('')
    setDeleteTarget(null)
    setDeleteError('')
  }

  const handleTabKey = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIsRecycled = event.key === 'End' ? true : event.key === 'Home' ? false : !recycled
    selectTab(nextIsRecycled)
    const nextTab = nextIsRecycled ? binTab : productsTab
    nextTab.current?.focus()
  }

  const changeProduct = async (product) => {
    if (!recycled && !window.confirm(`Move “${product.name}” to the recycle bin? It will be hidden from the store, and you can restore it later as a draft.`)) return
    setBusy(product.id)
    setActionError('')
    setMessage('')
    try {
      if (recycled) {
        await api(`/staff/products/${product.id}/restore`, { method: 'POST' })
      } else {
        await api(`/staff/products/${product.id}`, { method: 'DELETE' })
      }
      setEntries((current) => current.filter((entry) => entry.id !== product.id))
      setMessage(recycled ? `“${product.name}” was restored as a draft.` : `“${product.name}” was moved to the recycle bin.`)
    } catch (reason) {
      setActionError(reason.message || 'The product could not be updated. Please try again.')
    } finally {
      setBusy('')
    }
  }

  const openPermanentDelete = (product, event) => {
    deleteTrigger.current = event.currentTarget
    setActionError('')
    setDeleteError('')
    setDeleteTarget(product)
  }

  const closePermanentDelete = useCallback(() => {
    if (busy) return
    setDeleteError('')
    setDeleteTarget(null)
    requestAnimationFrame(() => deleteTrigger.current?.focus())
  }, [busy])

  const permanentlyDeleteProduct = async () => {
    if (!deleteTarget) return
    const product = deleteTarget
    setBusy(product.id)
    setActionError('')
    setDeleteError('')
    setMessage('')
    try {
      await api(`/staff/products/${product.id}/permanent-delete`, { method: 'DELETE' })
      setEntries((current) => current.filter((entry) => entry.id !== product.id))
      setDeleteTarget(null)
      setMessage(`“${product.name}” was permanently deleted.`)
      requestAnimationFrame(() => binTab.current?.focus())
    } catch (reason) {
      setDeleteError(reason.message || 'The product could not be permanently deleted. Please try again.')
    } finally {
      setBusy('')
    }
  }

  return <section className="product-admin">
    <p className="product-admin__crumb"><Link to="/admin/products">Products</Link> / Product Control</p>
    <div className="product-admin__header"><div><h1 className="page-heading">Product Control</h1><p className="product-admin__intro">Manage and update your products.</p></div></div>
    <div className="product-admin__tabs" role="tablist" aria-label="Product lists">
      <button id="products-tab" ref={productsTab} type="button" className="product-admin__tab" role="tab" tabIndex={recycled ? -1 : 0} aria-selected={!recycled} aria-controls="product-list" onKeyDown={handleTabKey} onClick={() => selectTab(false)}>Products</button>
      <button id="recycle-bin-tab" ref={binTab} type="button" className="product-admin__tab" role="tab" tabIndex={recycled ? 0 : -1} aria-selected={recycled} aria-controls="product-list" onKeyDown={handleTabKey} onClick={() => selectTab(true)}>Recycle Bin</button>
    </div>
    <div className={`product-admin__filters ${recycled ? 'product-admin__filters--bin' : ''}`}>
      <input className="field" type="search" aria-label={recycled ? 'Search recycled products' : 'Search products'} placeholder={recycled ? 'Search recycled products' : 'Search products'} value={query} onChange={(event) => setQuery(event.target.value)} />
      {!recycled && <><select className="field" aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select><Link to="/admin/products/new" className="product-admin__action product-admin__action--primary product-admin__action--link">+ Add Product</Link></>}
    </div>
    {recycled && <p className="product-admin__notice">Products in the recycle bin are hidden from the store. Restored products return as drafts.</p>}
    {message && <p className="status status-success mt-5" role="status">{message}</p>}
    {actionError && <p className="status status-error mt-5" role="alert">{actionError}</p>}
    <div id="product-list" role="tabpanel" aria-labelledby={recycled ? 'recycle-bin-tab' : 'products-tab'} aria-busy={loading}>
      {loading ? <LoadingState label={recycled ? 'Loading recycled products' : 'Loading products'} /> : error ? <ErrorState title="Products could not load" detail={error} onRetry={() => load()} /> : <>
        <div className="table-wrap product-admin__table mt-5"><table className="data-table"><thead><tr><th>Product</th><th>Category</th>{recycled ? <th>Removed on</th> : <><th>Status</th><th>Available</th></>}<th>Actions</th></tr></thead><tbody>
          {filtered.map((product) => <tr key={product.id}>
            <td data-label="Product"><div className="product-admin__product-cell">{primaryImage(product) ? <img className="product-admin__thumb" src={primaryImage(product)} alt="" /> : <span className="product-admin__thumb" aria-hidden="true" />}<div><b>{product.name}</b><div className="muted text-xs">{product.brand_name}</div></div></div></td>
            <td data-label="Category">{product.category_name || '—'}</td>
            {recycled ? <td data-label="Removed on">{dateLabel(product.recycled_at)}</td> : <><td data-label="Status"><span className={`tag ${product.status === 'active' ? 'green' : product.status === 'draft' ? 'gray' : ''}`}>{product.status}</span></td><td data-label="Available">{availableStock(product)}</td></>}
            <td data-label="Actions"><div className="product-admin__row-actions">{!recycled && <Link className="product-admin__action product-admin__action--link" to={`/admin/product-control/${product.id}/edit`}>Edit<span className="sr-only"> {product.name}</span></Link>}<button className="product-admin__action" type="button" disabled={Boolean(busy)} onClick={() => changeProduct(product)}>{busy === product.id ? 'Working…' : recycled ? 'Restore' : 'Move to bin'}<span className="sr-only"> {product.name}</span></button>{recycled && <button className="product-admin__action product-admin__action--danger product-admin__action--link" type="button" aria-label={`Delete ${product.name} permanently`} disabled={Boolean(busy)} onClick={(event) => openPermanentDelete(product, event)}><Icon name="trash" size={15} />Delete</button>}</div></td>
          </tr>)}
        </tbody></table>{!filtered.length && <p className="product-admin__empty">{entries.length ? 'No products match your search or filter.' : recycled ? 'The recycle bin is empty.' : 'No products yet. Add your first product to get started.'}</p>}</div>
        {!recycled && <p className="product-admin__notice">Products moved to the recycle bin can be restored later as drafts.</p>}
      </>}
    </div>
    {deleteTarget && <PermanentDeleteDialog product={deleteTarget} busy={busy === deleteTarget.id} error={deleteError} onCancel={closePermanentDelete} onConfirm={permanentlyDeleteProduct} />}
  </section>
}
