import { notFound } from 'next/navigation'

import { Detail, ExtLink, ItemPage, itemMetadata } from '@/components/ItemPage'
import { dateLong } from '@/lib/format'
import { getItem, getMemes } from '@/lib/payload'

type Props = { params: Promise<{ slug: string }> }

const TAGS = [
  ['isMemeNft', 'MEME NFT'],
  ['isToken', 'Token'],
  ['isPhysical', 'Physical'],
] as const

export async function generateStaticParams() {
  return (await getMemes()).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  return itemMetadata(await getItem('memes', (await params).slug))
}

export default async function MemePage({ params }: Props) {
  const meme = await getItem('memes', (await params).slug)
  if (!meme) notFound()

  return (
    <ItemPage
      item={meme}
      details={
        <>
          <Detail label="Creator" value={meme.creator} />
          <Detail label="Date acquired" value={dateLong(meme.dateAcquired)} />
          <div className="project-client-name">TAGS</div>
          <div className="meme-page-tags-list">
            {TAGS.filter(([key]) => meme[key]).map(([key, label]) => (
              <div key={key} className="project-client-description tag">
                {label}
              </div>
            ))}
          </div>
          <ExtLink href={meme.knowYourMemeUrl} label="KNOWYOURMEME" />
          <ExtLink href={meme.provenanceUrl} label="PROVENANCE" />
        </>
      }
    />
  )
}
