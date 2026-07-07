'use node'

import { internalAction } from './_generated/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'

export const classifyAlert = internalAction({
  args: { alertId: v.id('alerts') },
  handler: async (ctx, { alertId }) => {
    const data = await ctx.runQuery(internal.sites.getAlertWithSite, { alertId })
    if (!data) return

    const { alert, site } = data
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return

    const prompt = `You are analyzing a website monitoring alert for a press release distribution platform. Publishers with issues may block article delivery.

Domain: ${alert.domain}
Alert: ${alert.message}
Severity: ${alert.severity}
Domain Rating (DR): ${site?.dr ?? 'unknown'}
Price: $${site?.price ?? 'unknown'}
Subdomains affected: ${alert.subdomains?.join(', ') ?? 'none'}

Priority scoring (0-100):
- Base: critical=60, warning=30
- DR > 50 → +20, DR > 70 → +30
- Price > 200 → +15
- site_down or HTTP 0 → +15
- domain_parked → +10
- subdomain only → -15

Return JSON only:
{
  "category": "site_down|domain_parked|cdn_issue|ssl_expiry|redirect_change|server_error|unknown",
  "priority": <0-100>,
  "reason": "<specific actionable insight: what happened and why it matters for publishers, max 15 words>"
}`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 120,
      }),
    })

    if (!res.ok) return

    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) return

    let parsed: { category?: string; priority?: number; reason?: string }
    try { parsed = JSON.parse(content) } catch { return }

    const aiCategory = parsed.category ?? 'unknown'
    const aiPriority = Math.min(100, Math.max(0, parsed.priority ?? 50))
    const aiReason   = parsed.reason ?? ''

    // AI only classifies — workflow status is set by the user, not auto-assigned
    await ctx.runMutation(internal.sites.setAlertAiData, {
      alertId,
      aiCategory,
      aiPriority,
      aiReason,
    })
  },
})
