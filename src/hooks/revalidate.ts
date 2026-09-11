import { revalidatePath } from 'next/cache'

/** Small site: every page lists items (home, footer), so any change re-renders all pages. */
export const revalidate = <T extends { doc: unknown }>({ doc }: T) => {
  try {
    revalidatePath('/', 'layout')
  } catch {
    // outside the Next runtime (e.g. `payload run` scripts) — nothing to revalidate
  }
  return doc
}
