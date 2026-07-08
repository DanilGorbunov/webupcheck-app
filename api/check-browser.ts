import type { VercelRequest, VercelResponse } from '@vercel/node'
import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'

export const maxDuration = 45

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.tar'

const PARKING_SIGNALS = [
  'domain for sale',
  'buy this domain',
  'parked domain',
  'domain is available',
  'domain parking',
  'this domain is for sale',
  'sedo.com',
  'dan.com',
  'afternic',
  'hugedomains',
  'godaddy.com/domain',
  'register this domain',
  'united domains',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { domain } = req.query
  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'domain required' })
  }

  const hostname = domain.split('/')[0]
  const url = `https://${hostname}`

  const proxyRaw = process.env.BRIGHT_DATA_PROXY
  let proxyServer: string | null = null
  let proxyUser: string | null = null
  let proxyPass: string | null = null

  if (proxyRaw) {
    try {
      const u = new URL(proxyRaw)
      proxyServer = `${u.hostname}:${u.port}`
      proxyUser = decodeURIComponent(u.username)
      proxyPass = decodeURIComponent(u.password)
    } catch { /* no proxy */ }
  }

  let executablePath: string
  try {
    executablePath = await chromium.executablePath(CHROMIUM_PACK_URL)
  } catch (err) {
    return res.status(500).json({ error: `chromium init failed: ${String(err)}` })
  }

  const args = [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
  ]

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({ args, executablePath, headless: true })

    const page = await browser.newPage()

    if (proxyUser && proxyPass) {
      await page.authenticate({ username: proxyUser, password: proxyPass })
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
    )
    await page.setViewport({ width: 1280, height: 800 })

    let finalHttpStatus = 0
    page.on('response', response => {
      try {
        const rUrl = response.url()
        if (rUrl.startsWith(url) && !rUrl.match(/\.(css|js|png|jpg|gif|ico|woff|svg)(\?|$)/)) {
          finalHttpStatus = response.status()
        }
      } catch { /* ignore */ }
    })

    let timedOut = false
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('Timeout')) timedOut = true
      else timedOut = true
    }

    const title = await page.title().catch(() => '')
    const bodyText = await page
      .evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '')
      .catch(() => '')

    const titleLower = title.toLowerCase()
    const bodyLower = bodyText.toLowerCase()
    const isParked = PARKING_SIGNALS.some(s => titleLower.includes(s) || bodyLower.includes(s))

    let status: 'alive' | 'parked' | 'error' | 'timeout'
    if (timedOut) {
      status = 'timeout'
    } else if (isParked) {
      status = 'parked'
    } else if (finalHttpStatus >= 400 && finalHttpStatus !== 403) {
      status = 'error'
    } else {
      // 200, 301, 302, 403 (behind auth), or 0 with content loaded = alive
      status = title.length > 0 ? 'alive' : 'error'
    }

    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.json({ status, title, httpStatus: finalHttpStatus })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
