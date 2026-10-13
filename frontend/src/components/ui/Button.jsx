import styles from './Button.module.css'
export function Button({ variant = 'primary', as: Tag = 'button', className = '', ...props }) {
  return <Tag className={`${styles.btn} ${styles[variant]} ${className}`} {...props} />
}
