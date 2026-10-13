import styles from './Chip.module.css'
export function Chip({ selected, disabled, children, ...props }) {
  return <button className={`${styles.chip} ${selected ? styles.on : ''}`} aria-pressed={!!selected} disabled={disabled} {...props}>{children}</button>
}
