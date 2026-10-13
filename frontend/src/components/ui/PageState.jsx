import { Button } from './Button'

export function LoadingState({ label = 'Loading' }) {
  return <div className="page-state" aria-live="polite"><div><span className="skeleton" style={{ display: 'block', width: 120, margin: '0 auto 16px' }} /><p className="muted">{label}…</p></div></div>
}

export function ErrorState({ title = 'We could not load this right now.', detail, onRetry }) {
  return (
    <div className="page-state" role="alert">
      <div><p className="eyebrow">Something went wrong</p><h2 style={{ fontSize: 38, marginBottom: 12 }}>{title}</h2>{detail && <p className="muted">{detail}</p>}{onRetry && <Button onClick={onRetry}>Try again</Button>}</div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return <div className="page-state"><div><h2 style={{ fontSize: 38, marginBottom: 12 }}>{title}</h2>{children && <p className="muted">{children}</p>}{action}</div></div>
}
