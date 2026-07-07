import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const domain = req.query.url as string
  if (!domain) return res.status(400).json({ image: null, title: null })

  const base = domain.startsWith('http') ? domain : `https://${domain}`

  try {
    const response = await fetch(base, {
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      res.setHeader('Cache-Control', 's-maxage=3600')
      return res.json({ image: null, title: null })
    }

    const html = await response.text()

    // og:image — two attribute orderings
    let image =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1] ??
      null

    // Resolve relative URLs
    if (image && image.startsWith('/')) {
      const origin = new URL(base).origin
      image = origin + image
    }

    const title =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
      null

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
    return res.json({ image: image ?? null, title: title ?? null })
  } catch {
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.json({ image: null, title: null })
  }
}
