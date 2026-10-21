const paths = {
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  search: <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m15.2 15.2 4.4 4.4" /></>,
  bag: <><path d="M5.5 8.5h13l1 12h-15l1-12Z" /><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.8 20c.9-3.5 3.3-5.3 7.2-5.3s6.3 1.8 7.2 5.3" /></>,
  heart: <path d="M20.8 8.4c0 5.1-8.8 10.5-8.8 10.5S3.2 13.5 3.2 8.4A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.8 1.4Z" />,
  arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  trash: <><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5" /></>,
  home: <><path d="m4 11 8-7 8 7v9H4v-9Z" /><path d="M9 20v-6h6v6" /></>,
  truck: <><path d="M3 6h11v11H3zM14 10h3l3 3v4h-6z" /><circle cx="7" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  logout: <><path d="M10 5H5v14h5" /><path d="M13 8l4 4-4 4M8 12h9" /></>,
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className = '', title }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {paths[name] ?? null}
    </svg>
  )
}
