import { notFound } from 'next/navigation'

import { Detail, ExtLink, ItemPage, itemMetadata } from '@/components/ItemPage'
import { getItem, getLiquidAssets } from '@/lib/payload'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return (await getLiquidAssets()).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  return itemMetadata(await getItem('liquid-assets', (await params).slug))
}

export default async function LiquidAssetPage({ params }: Props) {
  const asset = await getItem('liquid-assets', (await params).slug)
  if (!asset) notFound()

  return (
    <ItemPage
      item={asset}
      details={
        <>
          <Detail label="TICKER" value={asset.ticker} />
          <Detail label="Blockchain" value={asset.blockchain} />
          <ExtLink href={asset.coingeckoUrl} label="COINGECKO" />
        </>
      }
    />
  )
}
