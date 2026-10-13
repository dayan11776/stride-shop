export function Badge({ children, className = '' }) {
  return <span className={className} style={{ background: 'var(--sage)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>{children}</span>
}
