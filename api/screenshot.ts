import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' })
  }

  const siteUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    // Use microlink.io screenshot API (free tier, no API key needed)
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(siteUrl)}&screenshot=true&meta=false`
    const r = await fetch(apiUrl, {
      signal: AbortSignal.timeout(25000),
      headers: { 'x-api-key': process.env.MICROLINK_API_KEY ?? '' },
    })

    if (!r.ok) {
      return res.status(502).json({ error: 'screenshot service unavailable' })
    }

    const data = await r.json() as { data?: { screenshot?: { url?: string } }; status?: string }
    const screenshotUrl = data?.data?.screenshot?.url

    if (!screenshotUrl) {
      return res.status(502).json({ error: 'no screenshot returned' })
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.json({ url: screenshotUrl })
  } catch {
    return res.status(502).json({ error: 'screenshot failed' })
  }
}
