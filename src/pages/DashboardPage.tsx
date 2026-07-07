import { useState, useMemo, useEffect } from 'react'
import { useQuery, useAction } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { Page } from '../App'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

// ─── Convex references ────────────────────────────────────────────────────────
// FAST: reads only 7 counter docs — used for stat cards
const siteCountersFn = makeFunctionReference<'query', Record<string, never>, {
  active: number; warning: number; unreachable: number; parked: number
  blacklisted: number; needsReview: number; issues: number; unknown: number; checked: number; total: number
}>('sites:siteCounters')
// FAST: simple counter reads
const countAlertsFn       = makeFunctionReference<'query', { dismissed?: boolean }, number>('sites:countAlerts')
const countAlertsByTypeFn = makeFunctionReference<'query', Record<string, never>, { critical: number; needsReview: number; warning: number }>('sites:countAlertsByType')
const alertWorkflowCountsFn = makeFunctionReference<'query', Record<string, never>,
  { new: number; urgent: number; in_progress: number; done: number }
>('sites:alertWorkflowCounts')
const urgentBreakdownFn = makeFunctionReference<'query', Record<string, never>,
  { dead: number; critical: number; inProgress: number }
>('sites:urgentBreakdown')
const resetAllFn = makeFunctionReference<'action', Record<string, never>, { total: number }>('sites:resetAllToUnknown')

// SLOW: chart / visualization queries — loaded deferred after first paint
const listFn          = makeFunctionReference<'query', { status?: string; limit?: number }, Any[]>('sites:list')
const statusTrendFn   = makeFunctionReference<'query', Record<string, never>, TrendPoint[]>('sites:statusTrend')
const topUnreachableFn = makeFunctionReference<'query', Record<string, never>,
  { domain: string; dr: number; price: number; status: string }[]
>('sites:topUnreachableByDR')
const siteStatusByPriceFn = makeFunctionReference<'query', Record<string, never>,
  Record<string, Record<string, number>>
>('sites:siteStatusByPrice')
const languageBreakdownFn = makeFunctionReference<'query', Record<string, never>,
  { lang: string; unreachable: number; warning: number; total: number }[]
>('sites:languageBreakdown')
const syncHistoryFn = makeFunctionReference<'query', Record<string, never>,
  { startedAt: number; completedAt?: number; totalItems: number; processed: number; status: string }[]
>('sites:syncHistory')
const alertStatsFn = makeFunctionReference<'query', { nowMs: number }, {
  httpTypes: Record<string, number>
  ageBuckets: Record<string, number>
  byDay: { date: string; total: number; critical: number }[]
  byDayType: { date: string; dead: number; blocked: number; serverError: number; unreachable: number; parked: number; other: number }[]
  avgAgeDays: number
  totalAlerts: number
}>('sites:dashboardAlertStats')
const riskMatrixFn = makeFunctionReference<'query', Record<string, never>,
  { domain: string; dr: number; price: number; status: string }[]
>('sites:riskMatrixSites')

type TrendPoint = { date: string; unreachable: number; warning: number; active: number; parked: number }

interface Props {
  totalItems: number; syncing: boolean; syncProgress: number; syncTotal: number; onNav: (p: Page) => void
}

const STATUS_COLOR: Record<string, string> = {
  Active: '#16A34A', Warning: '#D97706', Unreachable: '#DC2626', Parked: '#94A3B8',
}
const STATUS_BG: Record<string, string> = {
  Active: '#dcfce7', Warning: '#fef9c3', Unreachable: '#fee2e2', Parked: '#f1f5f9',
}
const STATUS_TEXT: Record<string, string> = {
  Active: '#15803d', Warning: '#92400e', Unreachable: '#b91c1c', Parked: '#475569',
}

function Panel({ title, sub, action, children, mb = 16 }: {
  title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; mb?: number
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: mb }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ color, up }: { color: string; up: boolean }) {
  const pts = up ? [0,5,3,8,6,12,10,16,14,20] : [20,16,18,12,15,8,10,5,7,2]
  const w=60,h=24,max=Math.max(...pts),min=Math.min(...pts)
  const sc=(v: number)=>h-((v-min)/(max-min+0.01))*(h-4)-2
  const d=pts.map((v,i)=>`${i===0?'M':'L'} ${(i/(pts.length-1))*w} ${sc(v)}`).join(' ')
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{flexShrink:0}}><path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label,value,sub,subColor,icon,iconBg,trend,onClick }: {
  label:string;value:string;sub:React.ReactNode;subColor:string;icon:React.ReactNode;iconBg:string;trend?:'up'|'down';onClick?:()=>void
}) {
  return (
    <div onClick={onClick}
      style={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',cursor:onClick?'pointer':'default'}}
      onMouseEnter={e=>{if(onClick)(e.currentTarget as HTMLDivElement).style.borderColor='#BFDBFE'}}
      onMouseLeave={e=>{if(onClick)(e.currentTarget as HTMLDivElement).style.borderColor='#E2E8F0'}}
    >
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10.5,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>{label}</div>
          <div style={{fontSize:26,fontWeight:700,color:'#0F172A',letterSpacing:-1,lineHeight:1}}>{value}</div>
          <div style={{fontSize:11.5,color:subColor,marginTop:5,fontWeight:500}}>{sub}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
          <div style={{width:34,height:34,background:iconBg,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{icon}</div>
          {trend && <Sparkline color={trend==='up'?'#16A34A':'#DC2626'} up={trend==='up'}/>}
        </div>
      </div>
    </div>
  )
}

// ─── DonutChart ───────────────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const [hov, setHov] = useState<number|null>(null)
  const total = segments.reduce((s,x)=>s+x.value,0)
  if (!total) return <div style={{color:'#94A3B8',fontSize:12,padding:'20px 0'}}>No data yet</div>
  const R=72,r=46,CX=90,CY=90
  let angle=-Math.PI/2
  const arcs = segments.map((seg,i)=>{
    const pct=seg.value/total, sa=angle, ea=angle+pct*2*Math.PI
    angle=ea
    const large=pct>0.5?1:0
    const x1=CX+R*Math.cos(sa), y1=CY+R*Math.sin(sa)
    const x2=CX+R*Math.cos(ea), y2=CY+R*Math.sin(ea)
    const ix1=CX+r*Math.cos(sa), iy1=CY+r*Math.sin(sa)
    const ix2=CX+r*Math.cos(ea), iy2=CY+r*Math.sin(ea)
    const d=`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`
    return { ...seg, d, i, pct }
  })
  return (
    <div style={{display:'flex',alignItems:'center',gap:16}}>
      <svg width={180} height={180} viewBox="0 0 180 180" style={{flexShrink:0}}>
        {arcs.map(arc=>(
          <path key={arc.i} d={arc.d} fill={arc.color} opacity={hov===null||hov===arc.i?1:0.5}
            onMouseEnter={()=>setHov(arc.i)} onMouseLeave={()=>setHov(null)}
            style={{cursor:'pointer',transition:'opacity 0.1s'}}/>
        ))}
        <text x={CX} y={CY-5} textAnchor="middle" fontSize={17} fontWeight={700} fill="#0F172A">{total.toLocaleString()}</text>
        <text x={CX} y={CY+13} textAnchor="middle" fontSize={9} fill="#94A3B8">alerts</text>
      </svg>
      <div style={{display:'flex',flexDirection:'column',gap:5,flex:1}}>
        {arcs.map(arc=>(
          <div key={arc.i} style={{display:'flex',alignItems:'center',gap:6,opacity:hov===null||hov===arc.i?1:0.5}}
            onMouseEnter={()=>setHov(arc.i)} onMouseLeave={()=>setHov(null)}>
            <span style={{width:9,height:9,borderRadius:2,background:arc.color,flexShrink:0}}/>
            <span style={{fontSize:11.5,color:'#374151',flex:1}}>{arc.label}</span>
            <span style={{fontSize:12,fontWeight:700,color:'#0F172A'}}>{arc.value.toLocaleString()}</span>
            <span style={{fontSize:10,color:'#94A3B8',width:32,textAlign:'right'}}>{Math.round(arc.pct*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ScatterPlot ──────────────────────────────────────────────────────────────
function ScatterPlot({ points }: { points: { domain: string; dr: number; price: number; status: string }[] }) {
  const [hov, setHov] = useState<{domain:string;dr:number;price:number;status:string;px:number;py:number}|null>(null)
  const W=580, H=260, PAD={left:46,right:20,top:10,bottom:36}
  const innerW=W-PAD.left-PAD.right, innerH=H-PAD.top-PAD.bottom
  const maxP=Math.min(Math.max(...points.map(p=>p.price),100),600)
  const xS=(dr:number)=>PAD.left+(dr/100)*innerW
  const yS=(price:number)=>PAD.top+innerH-(Math.min(price,maxP)/maxP)*innerH
  const xTicks=[0,20,40,60,80,100]
  const yTicks=[0,100,200,300,400,500,600].filter(v=>v<=maxP)
  return (
    <div style={{position:'relative'}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible'}}>
        {/* Grid */}
        {yTicks.map(v=>(
          <g key={v}>
            <line x1={PAD.left} x2={W-PAD.right} y1={yS(v)} y2={yS(v)} stroke="#F1F5F9" strokeWidth={1}/>
            <text x={PAD.left-4} y={yS(v)+4} textAnchor="end" fontSize={9} fill="#94A3B8">${v}</text>
          </g>
        ))}
        {xTicks.map(v=>(
          <g key={v}>
            <line x1={xS(v)} x2={xS(v)} y1={PAD.top} y2={H-PAD.bottom} stroke="#F1F5F9" strokeWidth={1}/>
            <text x={xS(v)} y={H-PAD.bottom+14} textAnchor="middle" fontSize={9} fill="#94A3B8">{v}</text>
          </g>
        ))}
        {/* Danger quadrant */}
        <rect x={xS(50)} y={PAD.top} width={xS(100)-xS(50)} height={yS(200)-PAD.top} fill="#FEF2F2" opacity={0.4}/>
        <text x={xS(75)} y={PAD.top+10} textAnchor="middle" fontSize={8} fill="#DC2626" opacity={0.6}>HIGH RISK ZONE</text>
        {/* Points — Active behind, Warning/Unreachable on top */}
        {['Active','Parked','Warning','Unreachable'].flatMap(status=>
          points.filter(p=>p.status===status).map((p,i)=>(
            <circle key={`${status}-${i}`}
              cx={xS(p.dr)} cy={yS(p.price)} r={status==='Unreachable'?4.5:3.5}
              fill={STATUS_COLOR[status]??'#94A3B8'} fillOpacity={status==='Active'?0.3:0.75}
              stroke={STATUS_COLOR[status]??'#94A3B8'} strokeWidth={0.5}
              onMouseEnter={()=>setHov({...p,px:xS(p.dr)/W,py:yS(p.price)/H})}
              onMouseLeave={()=>setHov(null)}
              style={{cursor:'pointer'}}
            />
          ))
        )}
        <text x={W/2} y={H} textAnchor="middle" fontSize={10} fill="#6B7280">Domain Rating (DR) →</text>
        <text x={10} y={H/2} textAnchor="middle" fontSize={10} fill="#6B7280" transform={`rotate(-90,10,${H/2})`}>Price ($) →</text>
      </svg>
      {hov && (
        <div style={{position:'absolute',top:`${Math.max(0,hov.py*100-20)}%`,left:`${Math.min(hov.px*100+2,65)}%`,
          background:'white',border:'1px solid #E2E8F0',borderRadius:6,padding:'8px 12px',
          boxShadow:'0 4px 12px rgba(0,0,0,0.12)',pointerEvents:'none',zIndex:10,minWidth:140}}>
          <div style={{fontSize:12,fontWeight:700,color:'#0F172A',marginBottom:3}}>{hov.domain}</div>
          <div style={{fontSize:11,color:'#6B7280'}}>DR: {hov.dr} · ${hov.price}</div>
          <div style={{fontSize:11,fontWeight:600,color:STATUS_COLOR[hov.status]??'#94A3B8'}}>{hov.status}</div>
        </div>
      )}
      <div style={{display:'flex',gap:14,justifyContent:'center',marginTop:6}}>
        {Object.entries(STATUS_COLOR).map(([s,c])=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:c,flexShrink:0}}/>
            <span style={{fontSize:11,color:'#6B7280'}}>{s} ({points.filter(p=>p.status===s).length})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── StackedTypeBarChart — Alert types per day, stacked bars ─────────────────
type DayTypeDatum = { date: string; dead: number; blocked: number; serverError: number; unreachable: number; parked: number; other: number }
function StackedTypeBarChart({ data }: { data: DayTypeDatum[] }) {
  const SERIES = [
    { key: 'dead' as const,        color: '#DC2626', label: 'DEAD' },
    { key: 'blocked' as const,     color: '#EA580C', label: 'BLOCKED' },
    { key: 'serverError' as const, color: '#D97706', label: 'SVR ERR' },
    { key: 'unreachable' as const, color: '#7C3AED', label: 'UNREACH' },
    { key: 'parked' as const,      color: '#94A3B8', label: 'PARKED' },
    { key: 'other' as const,       color: '#CBD5E1', label: 'OTHER' },
  ]
  if (!data.length) return <div style={{height:120,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8',fontSize:13}}>Accumulating data…</div>
  const H = 120
  const maxTotal = Math.max(...data.map(d => SERIES.reduce((s, t) => s + (d[t.key] ?? 0), 0)), 1)
  const n = data.length
  const W = Math.max(14, Math.floor(300 / n) - 5)
  const GAP = 4
  return (
    <div>
      <div style={{overflowX:'auto'}}>
        <svg height={H + 24} width={n * (W + GAP) + 8} style={{display:'block'}}>
          {data.map((d, i) => {
            const segs: {y:number; h:number; color:string; key:string}[] = []
            let yBottom = H
            SERIES.forEach(t => {
              const count = d[t.key] ?? 0
              if (count === 0) return
              const h = Math.max(2, Math.round(count / maxTotal * H))
              yBottom -= h
              segs.push({y: yBottom, h, color: t.color, key: t.key})
            })
            return (
              <g key={d.date} transform={`translate(${i * (W + GAP) + 4}, 0)`}>
                {segs.map(s => <rect key={s.key} x={0} y={s.y} width={W} height={s.h} fill={s.color} rx={1}/>)}
                <text x={W/2} y={H+16} textAnchor="middle" fontSize={9} fill="#94A3B8">{d.date.slice(5)}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:6,paddingTop:6,borderTop:'1px solid #F1F5F9'}}>
        {SERIES.slice(0,5).map(t=>(
          <div key={t.key} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:8,height:8,background:t.color,borderRadius:2,flexShrink:0,display:'inline-block'}}/>
            <span style={{fontSize:10,color:'#6B7280'}}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── DashboardCharts — all slow/heavy queries, only mounts after stat cards painted ──
function DashboardCharts({ onNav, alertWorkflowCounts }: { onNav: (p: Page) => void; alertWorkflowCounts: Any }) {
  const nowMs = Math.floor(Date.now() / 3600000) * 3600000
  const topSites   = useQuery(listFn, { limit: 50 })
  const trend      = useQuery(statusTrendFn, {}) ?? []
  const topUnreach = useQuery(topUnreachableFn, {}) ?? []
  const priceData  = useQuery(siteStatusByPriceFn, {})
  const langData   = useQuery(languageBreakdownFn, {}) ?? []
  const syncHist   = useQuery(syncHistoryFn, {}) ?? []
  const alertStats = useQuery(alertStatsFn, { nowMs })
  const riskPoints = useQuery(riskMatrixFn, {}) ?? []
  const alertTypeTrendData = useMemo(() => alertStats?.byDayType ?? [], [alertStats])

  const httpSegments = useMemo(()=>{
    if (!alertStats) return []
    const colors: Record<string,string> = {
      'HTTP 0':'#DC2626','HTTP 404':'#EA580C','Server 5xx':'#D97706',
      'Redirect':'#2563EB','Parked/Bot':'#7C3AED','Other':'#94A3B8',
    }
    return Object.entries(alertStats.httpTypes)
      .filter(([,v])=>v>0)
      .map(([label,value])=>({ label, value, color: colors[label]??'#94A3B8' }))
  }, [alertStats])

  const ageBars = useMemo(()=>{
    if (!alertStats) return []
    const order = ['<1d', '1-7d', '7-30d', '>30d'] as const
    const colors: Record<string, string> = { '<1d':'#16A34A','1-7d':'#D97706','7-30d':'#EA580C','>30d':'#DC2626' }
    return order.map(label => ({ label, value: alertStats.ageBuckets[label] ?? 0, color: colors[label] }))
  }, [alertStats])

  const weeklyDigest = useMemo(()=>{
    const now7 = trend.slice(-7)
    const prev7 = trend.slice(-14,-7)
    const sumKey = (arr: TrendPoint[], k: keyof TrendPoint) => arr.reduce((s,d)=>s+(d[k] as number),0)
    const thisW = { unreachable: sumKey(now7,'unreachable'), warning: sumKey(now7,'warning'), active: sumKey(now7,'active') }
    const prevW = { unreachable: sumKey(prev7,'unreachable'), warning: sumKey(prev7,'warning'), active: sumKey(prev7,'active') }
    const newAlerts = alertStats?.byDay.slice(-7).reduce((s,d)=>s+d.total,0) ?? 0
    const delta = (a:number,b:number) => b===0 ? null : Math.round(((a-b)/b)*100)
    return { thisW, prevW, newAlerts, deltaUnreach: delta(thisW.unreachable,prevW.unreachable) }
  }, [trend, alertStats])

  const avgAgeDays = alertStats?.avgAgeDays ?? 0
  const sortedTopSites = useMemo(()=>[...(topSites??[])].filter((s:Any)=>s.dr!=null).sort((a:Any,b:Any)=>(b.dr??0)-(a.dr??0)).slice(0,6), [topSites])

  return (
    <>
      {/* ROW 1 — ① Risk Matrix  +  ② HTTP Error */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Panel title="Publisher Risk Matrix" sub="DR × Price, кольором статус. Червона зона (DR>50, $>200) = найбільший ризик" mb={0}>
          {riskPoints.length === 0
            ? <div style={{height:200,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8',fontSize:13}}>Loading…</div>
            : <ScatterPlot points={riskPoints}/>
          }
        </Panel>
        <Panel title="Why Are Sites Failing?" sub="Розподіл алертів по типу помилки" mb={0}>
          <DonutChart segments={httpSegments}/>
        </Panel>
      </div>

      {/* ROW 2 — ③ Alert Age  +  ④ Error Trend */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Panel title="Alert Age Distribution" sub="Скільки часу проблеми залишаються відкритими" mb={0}>
          {ageBars.length===0
            ? <div style={{color:'#94A3B8',fontSize:12}}>Loading…</div>
            : (
              <div style={{display:'flex',flexDirection:'column',gap:10,paddingTop:4}}>
                {ageBars.map(b=>{
                  const maxV=Math.max(...ageBars.map(x=>x.value),1)
                  return (
                    <div key={b.label}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <span style={{fontSize:12,color:'#374151',fontWeight:500}}>{b.label}</span>
                        <span style={{fontSize:13,fontWeight:700,color:b.color}}>{b.value.toLocaleString()}</span>
                      </div>
                      <div style={{background:'#F1F5F9',borderRadius:4,height:8,overflow:'hidden'}}>
                        <div style={{background:b.color,height:'100%',borderRadius:4,width:`${(b.value/maxV)*100}%`,transition:'width 0.6s ease'}}/>
                      </div>
                    </div>
                  )
                })}
                <div style={{marginTop:8,padding:'10px 12px',background:'#F8FAFC',borderRadius:6,display:'flex',gap:16}}>
                  <div>
                    <div style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em'}}>Avg Age</div>
                    <div style={{fontSize:18,fontWeight:700,color:avgAgeDays>7?'#DC2626':avgAgeDays>2?'#D97706':'#16A34A'}}>{avgAgeDays.toFixed(1)}d</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em'}}>MTTD proxy</div>
                    <div style={{fontSize:11,color:'#64748B',marginTop:4,lineHeight:1.4}}>{avgAgeDays<1?'Good — issues caught quickly':avgAgeDays<7?'Moderate — review aging alerts':'High — many stale issues'}</div>
                  </div>
                </div>
              </div>
            )
          }
        </Panel>
        <Panel title="New Alerts — Last 14 Days (by Type)" sub="Кожен стовпчик = 1 день; кольори = тип помилки" mb={0}
          action={<button onClick={()=>onNav('alerts')} style={{fontSize:12,color:'#2563EB',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>View alerts →</button>}>
          <StackedTypeBarChart data={alertTypeTrendData}/>
        </Panel>
      </div>

      {/* ROW 3 — ⑥ Top Unreachable by DR (full width) */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:16, marginBottom:16 }}>
        <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{padding:'16px 20px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #F1F5F9'}}>
            <div>
              <div style={{fontSize:13.5,fontWeight:600,color:'#0F172A'}}>Top Unreachable by DR</div>
              <div style={{fontSize:11.5,color:'#94A3B8',marginTop:2}}>Найцінніші сайти з проблемами</div>
            </div>
            <button onClick={()=>onNav('alerts')} style={{fontSize:12,color:'#2563EB',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>View alerts →</button>
          </div>
          {topUnreach.length===0
            ? <div style={{padding:'32px',textAlign:'center',color:'#94A3B8',fontSize:13}}>No data</div>
            : (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#F8FAFC'}}>
                    {['#','Domain','DR','Price','Status'].map(h=>(
                      <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #E2E8F0'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topUnreach.map((s,i)=>(
                    <tr key={s.domain} style={{borderTop:'1px solid #F1F5F9'}}>
                      <td style={{padding:'7px 12px',fontSize:11,color:'#94A3B8',width:24}}>{i+1}</td>
                      <td style={{padding:'7px 12px',fontSize:12,fontWeight:600,color:'#0F172A',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.domain}</td>
                      <td style={{padding:'7px 12px',fontSize:13,fontWeight:700,color:'#1E293B'}}>{s.dr}</td>
                      <td style={{padding:'7px 12px',fontSize:12,color:'#374151'}}>{s.price?`$${s.price}`:'—'}</td>
                      <td style={{padding:'7px 12px'}}>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:STATUS_BG[s.status]??'#f1f5f9',color:STATUS_TEXT[s.status]??'#475569'}}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {/* ROW 4 — ⑦ Price Segment  +  ⑧ Language Breakdown */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Panel title="Health by Price Segment" sub="Яка цінова категорія надійніша" mb={0}>
          {!priceData
            ? <div style={{color:'#94A3B8',fontSize:12}}>Loading…</div>
            : (
              <div style={{display:'flex',flexDirection:'column',gap:14,paddingTop:4}}>
                {Object.entries(priceData).map(([bucket, counts])=>{
                  const bucketTotal=Object.values(counts as Record<string,number>).reduce((s,v)=>s+v,0)
                  if (bucketTotal===0) return null
                  return (
                    <div key={bucket}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                        <span style={{fontSize:12.5,fontWeight:600,color:'#0F172A'}}>${bucket}</span>
                        <span style={{fontSize:11,color:'#94A3B8'}}>{bucketTotal.toLocaleString()} sites</span>
                      </div>
                      <div style={{background:'#F1F5F9',borderRadius:4,height:10,overflow:'hidden',display:'flex'}}>
                        {(['Active','Warning','Unreachable','Parked'] as const).map(s=>{
                          const pct=((counts as Record<string,number>)[s]??0)/bucketTotal*100
                          return pct>0 ? <div key={s} title={`${s}: ${Math.round(pct)}%`} style={{background:STATUS_COLOR[s],width:`${pct}%`,transition:'width 0.6s ease'}}/> : null
                        })}
                      </div>
                      <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap'}}>
                        {(['Active','Warning','Unreachable'] as const).map(s=>(
                          <span key={s} style={{fontSize:10,color:STATUS_TEXT[s]}}>
                            {s}: {Math.round(((counts as Record<string,number>)[s]??0)/bucketTotal*100)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </Panel>

        <Panel title="Problems by Language / Market" sub="Топ ринки з Unreachable + Warning сайтами" mb={0}>
          {langData.length===0
            ? <div style={{color:'#94A3B8',fontSize:12}}>Loading…</div>
            : (
              <div style={{display:'flex',flexDirection:'column',gap:8,paddingTop:4}}>
                {langData.slice(0,10).map(l=>{
                  const maxT=Math.max(...langData.map(x=>x.total),1)
                  return (
                    <div key={l.lang}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                        <span style={{fontSize:12,color:'#374151',fontWeight:600,width:32,flexShrink:0}}>{l.lang.toUpperCase()}</span>
                        <div style={{flex:1,background:'#F1F5F9',borderRadius:3,height:8,overflow:'hidden',display:'flex'}}>
                          <div style={{background:'#DC2626',width:`${(l.unreachable/maxT)*100}%`,transition:'width 0.6s ease'}}/>
                          <div style={{background:'#D97706',width:`${(l.warning/maxT)*100}%`,transition:'width 0.6s ease'}}/>
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:'#374151',width:28,textAlign:'right',flexShrink:0}}>{l.total}</span>
                      </div>
                    </div>
                  )
                })}
                <div style={{display:'flex',gap:12,marginTop:4}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:8,height:8,background:'#DC2626',borderRadius:2}}/><span style={{fontSize:10,color:'#6B7280'}}>Unreachable</span></div>
                  <div style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:8,height:8,background:'#D97706',borderRadius:2}}/><span style={{fontSize:10,color:'#6B7280'}}>Warning</span></div>
                </div>
              </div>
            )
          }
        </Panel>
      </div>

      {/* ⑨ Workflow */}
      <div style={{ marginBottom:16 }}>
        <Panel title="Alerts Workflow" sub="Розподіл алертів по стадіях обробки" mb={0}>
          {!alertWorkflowCounts
            ? <div style={{color:'#94A3B8',fontSize:12}}>Loading…</div>
            : (() => {
              const stages = [
                { key: 'new',         label: 'New',         color: '#DC2626', bg: '#FEE2E2', desc: 'Щойно виявлені' },
                { key: 'urgent',      label: 'Urgent',      color: '#EA580C', bg: '#FFEDD5', desc: 'Потребують уваги' },
                { key: 'in_progress', label: 'In Progress', color: '#D97706', bg: '#FEF3C7', desc: 'В роботі' },
                { key: 'done',        label: 'Done',        color: '#16A34A', bg: '#DCFCE7', desc: 'Вирішені' },
              ]
              const total = stages.reduce((s, st) => s + (alertWorkflowCounts[st.key as keyof typeof alertWorkflowCounts] ?? 0), 0)
              return (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {stages.map(st => {
                    const count = alertWorkflowCounts[st.key as keyof typeof alertWorkflowCounts] ?? 0
                    const pct = total > 0 ? (count / total) * 100 : 0
                    return (
                      <div key={st.key}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                          <div style={{display:'flex',alignItems:'center',gap:7}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'1px 7px',borderRadius:10,background:st.bg,color:st.color}}>{st.label}</span>
                            <span style={{fontSize:11,color:'#94A3B8'}}>{st.desc}</span>
                          </div>
                          <span style={{fontSize:14,fontWeight:700,color:st.color}}>{count.toLocaleString()}</span>
                        </div>
                        <div style={{background:'#F1F5F9',borderRadius:4,height:6,overflow:'hidden'}}>
                          <div style={{background:st.color,height:'100%',borderRadius:4,width:`${pct}%`,transition:'width 0.6s ease'}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()
          }
        </Panel>
      </div>

      {/* ⑪ Weekly Digest  +  ⑫ Sync History */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Panel title="Weekly Digest" sub="This week vs last week" mb={0}>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              { label:'New Alerts (7d)', value: weeklyDigest.newAlerts, fmt:(v:number)=>v.toLocaleString(), color:'#DC2626' },
              { label:'Unreachable avg', value: Math.round(weeklyDigest.thisW.unreachable/Math.max(trend.slice(-7).length,1)), fmt:(v:number)=>v.toLocaleString(), delta: weeklyDigest.deltaUnreach, color:'#DC2626' },
              { label:'Warning avg', value: Math.round(weeklyDigest.thisW.warning/Math.max(trend.slice(-7).length,1)), fmt:(v:number)=>v.toLocaleString(), color:'#D97706' },
              { label:'Active sites avg / day', value: Math.round(weeklyDigest.thisW.active / Math.max(trend.slice(-7).length, 1)), fmt:(v:number)=>v.toLocaleString(), color:'#16A34A' },
            ].map(row=>(
              <div key={row.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'#F8FAFC',borderRadius:6}}>
                <span style={{fontSize:12,color:'#374151'}}>{row.label}</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {'delta' in row && row.delta!=null && (
                    <span style={{fontSize:10,fontWeight:600,color:row.delta>0?'#DC2626':'#16A34A'}}>
                      {row.delta>0?'↑':'↓'}{Math.abs(row.delta)}%
                    </span>
                  )}
                  <span style={{fontSize:15,fontWeight:700,color:row.color}}>{row.fmt(row.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Sync History" sub="Last Medialister sync runs" mb={0}>
          {syncHist.length===0
            ? <div style={{color:'#94A3B8',fontSize:12}}>No sync history</div>
            : (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {syncHist.map((s,i)=>{
                  const dur=s.completedAt?Math.round((s.completedAt-s.startedAt)/60000):null
                  const date=new Date(s.startedAt)
                  const dateStr=`${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
                  return (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:'#F8FAFC',borderRadius:6}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:s.status==='completed'?'#16A34A':s.status==='running'?'#2563EB':'#DC2626',flexShrink:0}}/>
                      <span style={{fontSize:11,color:'#374151',flex:1}}>{dateStr}</span>
                      <span style={{fontSize:11,color:'#6B7280'}}>{s.totalItems.toLocaleString()} sites</span>
                      {dur!=null && <span style={{fontSize:10,color:'#94A3B8'}}>{dur}min</span>}
                    </div>
                  )
                })}
              </div>
            )
          }
        </Panel>
      </div>

      {/* Top sites by DR */}
      <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
        <div style={{padding:'16px 20px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #F1F5F9'}}>
          <div style={{fontSize:13.5,fontWeight:600,color:'#0F172A'}}>Top Sites by Domain Rating</div>
          <button onClick={()=>onNav('sites')} style={{fontSize:12,color:'#2563EB',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>View all sites →</button>
        </div>
        {sortedTopSites.length===0
          ? <div style={{padding:'32px',textAlign:'center',color:'#94A3B8',fontSize:13}}>Loading…</div>
          : (
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#F8FAFC'}}>
                  {['Domain','DR','Traffic','Price','Status'].map(h=>(
                    <th key={h} style={{padding:'9px 16px',textAlign:'left',fontSize:10.5,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #E2E8F0'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTopSites.map((site:Any)=>{
                  const traffic=site.organicTraffic
                  const ts=!traffic?'—':traffic>=1_000_000?`${(traffic/1_000_000).toFixed(1)}M`:traffic>=1_000?`${(traffic/1_000).toFixed(0)}K`:String(traffic)
                  const sc=site.status??'Unknown'
                  return (
                    <tr key={site._id} style={{borderTop:'1px solid #F1F5F9'}}>
                      <td style={{padding:'10px 16px'}}><span style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{site.domain}</span></td>
                      <td style={{padding:'10px 16px',fontSize:14,fontWeight:700,color:'#1E293B'}}>{site.dr??'—'}</td>
                      <td style={{padding:'10px 16px',fontSize:12.5,color:'#374151',fontWeight:500}}>{ts}</td>
                      <td style={{padding:'10px 16px',fontSize:12.5,color:'#374151'}}>{site.price?`$${site.price.toFixed(0)}`:'—'}</td>
                      <td style={{padding:'10px 16px'}}><span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:4,background:STATUS_BG[sc]??'#f1f5f9',color:STATUS_TEXT[sc]??'#6B7280'}}>{sc}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        }
      </div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function DashboardPage({ totalItems, syncing, syncProgress, syncTotal, onNav }: Props) {
  const siteCounters   = useQuery(siteCountersFn, {})
  const alertCount     = useQuery(countAlertsFn, { dismissed: false }) ?? 0
  const alertsByType   = useQuery(countAlertsByTypeFn, {})
  const workflowCounts = useQuery(alertWorkflowCountsFn, {})
  const urgentBreakdown = useQuery(urgentBreakdownFn, {})
  const resetAll        = useAction(resetAllFn)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState<number|null>(null)
  // Charts mount after stat cards are already painted
  const [showCharts, setShowCharts] = useState(false)
  useEffect(() => { setShowCharts(true) }, [])

  async function handleReset() {
    if (!confirm('Скинути всі статуси на Unknown і почати перевірку заново?')) return
    setResetting(true); setResetDone(null)
    try { const r = await resetAll({}); setResetDone(r.total) } catch { /* ignore */ }
    setResetting(false)
  }

  const checked  = siteCounters?.checked ?? 0
  const total    = totalItems || checked
  const checkPct = total > 0 ? Math.round((checked / total) * 100) : 0
  const syncPct  = syncTotal > 0 ? Math.round((syncProgress / syncTotal) * 100) : 100

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:22 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:'#0F172A', letterSpacing:-0.4 }}>Dashboard</h1>
          <p style={{ fontSize:12.5, color:'#64748B', marginTop:3 }}>
            {syncing
              ? `Syncing Medialister… ${syncProgress.toLocaleString()} / ${syncTotal.toLocaleString()} (${syncPct}%)`
              : `Monitoring ${total.toLocaleString()} publisher domains · ${checked.toLocaleString()} checked (${checkPct}%)`}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {resetDone!==null && <span style={{fontSize:12,color:'#16A34A',fontWeight:500}}>✓ {resetDone.toLocaleString()} sites reset — checker starting…</span>}
          <button onClick={handleReset} disabled={resetting} title="Reset all site statuses"
            style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:resetting?'#F1F5F9':'white',color:'#DC2626',border:'1px solid #FECACA',borderRadius:6,fontSize:13,fontWeight:500,cursor:resetting?'default':'pointer',fontFamily:'inherit'}}>
            {resetting?<><span style={{width:11,height:11,border:'2px solid #FECACA',borderTopColor:'#DC2626',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite'}}/> Resetting…</>:'🔄 Re-check All'}
          </button>
          <button onClick={()=>onNav('checker')} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'white',color:'#374151',border:'1px solid #D1D5DB',borderRadius:6,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Quick Check
          </button>
          <button onClick={()=>onNav('sites')} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'#2563EB',color:'white',border:'none',borderRadius:6,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            View All Sites
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        <StatCard label="Total Sites" value={total.toLocaleString()}
          sub={syncing?`Syncing ${syncPct}%…`:`${totalItems.toLocaleString()} in Medialister`}
          subColor={syncing?'#2563EB':'#16A34A'} iconBg="#EFF6FF"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
        />
        <StatCard label="Alerts" value={alertCount.toLocaleString()}
          sub={alertCount > 0
            ? `${(alertsByType?.critical ?? 0).toLocaleString()} critical · ${(alertsByType?.warning ?? 0).toLocaleString()} warning`
            : 'No active alerts'}
          subColor={alertCount > 0 ? '#DC2626' : '#16A34A'} iconBg="#FEF2F2"
          onClick={()=>onNav('alerts')}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
        />
        <StatCard label="New Alerts" value={(workflowCounts?.new ?? 0).toLocaleString()}
          sub={(workflowCounts?.new ?? 0) > 0 ? 'Not yet triaged' : 'Queue is clear'}
          subColor={(workflowCounts?.new ?? 0) > 0 ? '#D97706' : '#16A34A'} iconBg="#FFFBEB"
          onClick={()=>onNav('alerts')}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>}
        />
        <StatCard label="Urgent" value={(workflowCounts?.urgent ?? 0).toLocaleString()}
          sub={urgentBreakdown
            ? <span style={{display:'flex',flexDirection:'column',gap:2}}>
                <span>
                  <span style={{fontWeight:700,color:'#DC2626'}}>DEAD</span>
                  <span style={{color:'#6B7280'}}> · {urgentBreakdown.dead.toLocaleString()}  </span>
                  <span style={{fontWeight:700,color:'#EA580C'}}>CRITICAL</span>
                  <span style={{color:'#6B7280'}}> · {urgentBreakdown.critical.toLocaleString()}</span>
                </span>
                <span style={{color:'#94A3B8',fontSize:11}}>{urgentBreakdown.inProgress} in progress</span>
              </span>
            : 'Loading…'
          }
          subColor='#DC2626' iconBg="#FFF7ED"
          onClick={()=>onNav('alerts')}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
        />
      </div>

      {showCharts && <DashboardCharts onNav={onNav} alertWorkflowCounts={workflowCounts} />}
    </div>
  )
}
