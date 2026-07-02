import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { page = '1', perPage = '100' } = req.query

  const apiRes = await fetch(
    `https://api.medialister.com/api/offers?perPage=${perPage}&page=${page}`,
    {
      headers: {
        apikey: process.env.MEDIALISTER_API_KEY ?? '',
        'User-Agent': 'Mozilla/5.0 (compatible; PRNEWS-Monitor/1.0)',
      },
    }
  )

  const data = await apiRes.json()
  res.status(apiRes.status).json(data)
}
