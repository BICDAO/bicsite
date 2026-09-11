import { Fragment, type ReactNode } from 'react'

/** Renders heading markup: ~dim~ → .half-opacity, **bold** → <strong>, newline → <br>. */
export function Marked({ text }: { text?: string | null }) {
  if (!text) return null
  let dim = false
  let bold = false
  const out: ReactNode[] = []
  text.split(/(\*\*|~|\n)/).forEach((t, i) => {
    if (t === '**') bold = !bold
    else if (t === '~') dim = !dim
    else if (t === '\n') out.push(<br key={i} />)
    else if (t) {
      let node: ReactNode = t
      if (bold) node = <strong>{node}</strong>
      if (dim) node = <span className="half-opacity">{node}</span>
      out.push(<Fragment key={i}>{node}</Fragment>)
    }
  })
  return <>{out}</>
}
