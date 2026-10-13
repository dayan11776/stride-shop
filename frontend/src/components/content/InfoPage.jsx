import { Link } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'

export function InfoPage({ eyebrow = 'STRIDE support', title, lead, sections = [], links = [] }) {
  return <article className="max-w-[790px]"><p className="eyebrow">{eyebrow}</p><h1 className="page-heading">{title}</h1>{lead && <p className="mt-5 max-w-[650px] text-base leading-7 text-[var(--olive-gray)]">{lead}</p>}<div className="mt-10 grid gap-8">{sections.map((section) => <section key={section.title} className="border-t border-[#262B1F22] pt-6"><h2 className="text-[32px]">{section.title}</h2>{section.body && <p className="mt-3 max-w-[680px] leading-6 text-[var(--olive-gray)]">{section.body}</p>}{section.items && <ul className="mt-4 grid gap-2 pl-5 leading-6 text-[var(--olive-gray)]">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}</div>{links.length > 0 && <div className="mt-10 grid gap-3 sm:grid-cols-2">{links.map(([label, to]) => <Link key={to} to={to} className="flex items-center justify-between rounded-ui border border-[#262B1F22] p-4 font-semibold no-underline hover:bg-sand">{label}<Icon name="arrow" size={18} /></Link>)}</div>}</article>
}
