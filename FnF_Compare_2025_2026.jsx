import React, { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function parseNumberToMillionWon(raw) {
  if (raw == null) return 0
  const s0 = String(raw).trim()
  if (!s0 || s0 === '-' || s0 === '0') return 0

  const isNegative = s0.includes('(') && s0.includes(')')
  const s = s0.replace(/[(),\s]/g, '').replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  const v = n / 1_000_000
  return Math.round(isNegative ? -v : v)
}

// Minimal CSV parser that handles quoted fields and commas/newlines inside quotes.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1]
        if (next === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') {
      inQuotes = true
      continue
    }

    if (c === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (c === '\r') continue

    if (c === '\n') {
      row.push(field)
      field = ''
      // skip trailing completely empty last row
      if (row.some((v) => String(v ?? '').trim() !== '')) rows.push(row)
      row = []
      continue
    }

    field += c
  }

  row.push(field)
  if (row.some((v) => String(v ?? '').trim() !== '')) rows.push(row)
  return rows
}

function parseIsCsvToQuarterMetrics(csvText, yearLabel) {
  const rows = parseCsv(csvText)
  if (!rows.length) return { quarters: [], quarter: {}, ytd: {} }

  const header = rows[0].map((c) => String(c ?? '').trim())

  const quarterOffsets = []
  const quarterRe = /^\d{2}\.[1-4]Q$/
  for (let i = 0; i < header.length; i += 1) {
    if (quarterRe.test(header[i])) quarterOffsets.push(i)
  }

  const colsPerQuarter = quarterOffsets.length >= 2 ? quarterOffsets[1] - quarterOffsets[0] : 17

  const accountMapping = [
    ['Ⅰ.매출액', '매출액'],
    ['매출액', '매출액'],
    ['Ⅱ.매출원가', '매출원가'],
    ['매출원가', '매출원가'],
    ['Ⅲ.매출총이익', '매출총이익'],
    ['매출총이익', '매출총이익'],
    ['Ⅳ.판매비와관리비', '판관비'],
    ['판매비와관리비', '판관비'],
    ['Ⅴ.영업이익', '영업이익'],
    ['영업이익', '영업이익'],
    ['Ⅹ.당기순이익', '당기순이익'],
    ['당기순이익', '당기순이익'],
  ]

  const quarter = {}
  const ytd = {}
  const quarters = []

  for (const offset of quarterOffsets) {
    const token = header[offset]
    const qMatch = token.match(/^\d{2}\.([1-4])Q$/)
    const q = qMatch ? Number(qMatch[1]) : null
    if (!q) continue

    quarters.push(q)
    const qKey = `${yearLabel}_${q}Q`

    // Relative positions (matches current CSV layout)
    const ytdCol = offset + 11
    const qtrCol = offset + 13

    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r]
      const accountName = String(row[offset] ?? '').trim()
      if (!accountName) continue

      let dashKey = null
      for (const [csvKey, k] of accountMapping) {
        if (accountName === csvKey || accountName.includes(csvKey)) {
          dashKey = k
          break
        }
      }
      if (!dashKey) continue

      if (!quarter[qKey]) quarter[qKey] = {}
      if (!ytd[qKey]) ytd[qKey] = {}

      quarter[qKey][dashKey] = parseNumberToMillionWon(row[qtrCol])
      ytd[qKey][dashKey] = parseNumberToMillionWon(row[ytdCol])
    }
  }

  const uniqQuarters = Array.from(new Set(quarters)).sort((a, b) => a - b)
  return { quarters: uniqQuarters, quarter, ytd, colsPerQuarter }
}

function formatMillionWon(n) {
  const v = Number(n || 0)
  return `${v.toLocaleString('ko-KR')}`
}

function pctChange(curr, prev) {
  const c = Number(curr || 0)
  const p = Number(prev || 0)
  if (p === 0) return null
  return ((c - p) / Math.abs(p)) * 100
}

function MetricCard({ title, aValue, bValue, aLabel, bLabel, unit = '백만원' }) {
  const delta = (bValue ?? 0) - (aValue ?? 0)
  const pct = pctChange(bValue, aValue)
  const pctText = pct == null ? 'N/A' : `${pct.toFixed(1)}%`
  const deltaText = `${delta >= 0 ? '+' : ''}${formatMillionWon(delta)}`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-700">{title}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-slate-500">{aLabel}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {formatMillionWon(aValue)} <span className="text-xs font-normal text-slate-500">{unit}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{bLabel}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {formatMillionWon(bValue)} <span className="text-xs font-normal text-slate-500">{unit}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 text-sm text-slate-700">
        증감: <span className="font-semibold">{deltaText} {unit}</span> / YoY: <span className="font-semibold">{pctText}</span>
      </div>
    </div>
  )
}

export default function FnFCompare2025vs2026({
  title = '최신 분기 비교 리포트 (2025 vs 2026)',
  fixedQuarter = null, // 1~4
  initialMode = '분기', // '분기' | '누적'
  hideQuarterSelector = false,
  hideModeToggle = false,
} = {}) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [selectedQ, setSelectedQ] = useState(null)
  const [mode, setMode] = useState(initialMode) // '분기' | '누적'

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [is25, is26] = await Promise.all([
          fetch('/2025_IS.csv').then((r) => r.text()),
          fetch('/2026_IS.csv').then((r) => r.text()),
        ])

        const p25 = parseIsCsvToQuarterMetrics(is25, '2025')
        const p26 = parseIsCsvToQuarterMetrics(is26, '2026')

        const common = p25.quarters.filter((q) => p26.quarters.includes(q))
        const autoDefaultQ =
          (common.length ? common : [...p25.quarters, ...p26.quarters]).sort((a, b) => a - b).at(-1) ?? null
        const defaultQ = fixedQuarter ?? autoDefaultQ

        const payload = { y2025: p25, y2026: p26, commonQuarters: common, defaultQ }
        if (!cancelled) {
          setState({ loading: false, error: null, data: payload })
          setSelectedQ(defaultQ)
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e?.message || e), data: null })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const view = useMemo(() => {
    if (!state.data || !selectedQ) return null
    const { y2025, y2026 } = state.data
    const key25 = `2025_${selectedQ}Q`
    const key26 = `2026_${selectedQ}Q`
    const src25 = mode === '누적' ? y2025.ytd[key25] : y2025.quarter[key25]
    const src26 = mode === '누적' ? y2026.ytd[key26] : y2026.quarter[key26]

    const m25 = src25 || {}
    const m26 = src26 || {}

    const sales25 = m25.매출액 ?? 0
    const sales26 = m26.매출액 ?? 0
    const gp25 = m25.매출총이익 ?? 0
    const gp26 = m26.매출총이익 ?? 0
    const op25 = m25.영업이익 ?? 0
    const op26 = m26.영업이익 ?? 0

    const gm25 = sales25 ? (gp25 / sales25) * 100 : null
    const gm26 = sales26 ? (gp26 / sales26) * 100 : null
    const om25 = sales25 ? (op25 / sales25) * 100 : null
    const om26 = sales26 ? (op26 / sales26) * 100 : null

    return {
      key25,
      key26,
      m25,
      m26,
      gm25,
      gm26,
      om25,
      om26,
    }
  }, [state.data, selectedQ, mode])

  const chartSeries = useMemo(() => {
    if (!state.data) return []
    const { y2025, y2026 } = state.data
    const qs = Array.from(new Set([...y2025.quarters, ...y2026.quarters])).sort((a, b) => a - b)

    return qs.map((q) => {
      const k25 = `2025_${q}Q`
      const k26 = `2026_${q}Q`
      const src25 = mode === '누적' ? y2025.ytd[k25] : y2025.quarter[k25]
      const src26 = mode === '누적' ? y2026.ytd[k26] : y2026.quarter[k26]
      return {
        quarter: `${q}Q`,
        '2025 매출액': src25?.매출액 ?? null,
        '2026 매출액': src26?.매출액 ?? null,
        '2025 영업이익': src25?.영업이익 ?? null,
        '2026 영업이익': src26?.영업이익 ?? null,
      }
    })
  }, [state.data, mode])

  const barData = useMemo(() => {
    if (!view) return []
    return [
      { name: '매출액', '2025': view.m25.매출액 ?? 0, '2026': view.m26.매출액 ?? 0 },
      { name: '매출총이익', '2025': view.m25.매출총이익 ?? 0, '2026': view.m26.매출총이익 ?? 0 },
      { name: '판관비', '2025': view.m25.판관비 ?? 0, '2026': view.m26.판관비 ?? 0 },
      { name: '영업이익', '2025': view.m25.영업이익 ?? 0, '2026': view.m26.영업이익 ?? 0 },
      { name: '당기순이익', '2025': view.m25.당기순이익 ?? 0, '2026': view.m26.당기순이익 ?? 0 },
    ]
  }, [view])

  if (state.loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-slate-900">데이터 로딩 중…</div>
            <div className="mt-1 text-sm text-slate-600">CSV 파일(2025/2026)을 읽어 최신 분기 비교 리포트를 생성합니다.</div>
          </div>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-rose-700">로딩 실패</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{state.error}</div>
            <div className="mt-3 text-sm text-slate-600">
              확인: <code className="rounded bg-slate-100 px-1">public/2025_IS.csv</code>,{' '}
              <code className="rounded bg-slate-100 px-1">public/2026_IS.csv</code> 존재/경로
            </div>
          </div>
        </div>
      </div>
    )
  }

  const qs = state.data?.commonQuarters?.length ? state.data.commonQuarters : Array.from(new Set([...(state.data?.y2025?.quarters ?? []), ...(state.data?.y2026?.quarters ?? [])]))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-2xl font-bold text-slate-900">{title}</div>
              <div className="mt-1 text-sm text-slate-600">
                데이터 소스: <code className="rounded bg-slate-100 px-1">public/2025_IS.csv</code>,{' '}
                <code className="rounded bg-slate-100 px-1">public/2026_IS.csv</code>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!hideModeToggle && (
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-600">기준</div>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                    <button
                      className={`px-3 py-2 text-sm ${mode === '분기' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                      onClick={() => setMode('분기')}
                    >
                      분기
                    </button>
                    <button
                      className={`px-3 py-2 text-sm ${mode === '누적' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                      onClick={() => setMode('누적')}
                    >
                      누적
                    </button>
                  </div>
                </div>
              )}

              {!hideQuarterSelector && fixedQuarter == null && (
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-600">분기</div>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={selectedQ ?? ''}
                    onChange={(e) => setSelectedQ(Number(e.target.value))}
                  >
                    {qs
                      .slice()
                      .sort((a, b) => a - b)
                      .map((q) => (
                        <option key={q} value={q}>
                          {q}Q
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {view && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetricCard title="매출액" aValue={view.m25.매출액} bValue={view.m26.매출액} aLabel={`2025 ${selectedQ}Q`} bLabel={`2026 ${selectedQ}Q`} />
              <MetricCard title="영업이익" aValue={view.m25.영업이익} bValue={view.m26.영업이익} aLabel={`2025 ${selectedQ}Q`} bLabel={`2026 ${selectedQ}Q`} />
              <MetricCard title="당기순이익" aValue={view.m25.당기순이익} bValue={view.m26.당기순이익} aLabel={`2025 ${selectedQ}Q`} bLabel={`2026 ${selectedQ}Q`} />
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-700">마진</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-500">2025 {selectedQ}Q</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      매출총이익률 {view.gm25 == null ? 'N/A' : `${view.gm25.toFixed(1)}%`}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      영업이익률 {view.om25 == null ? 'N/A' : `${view.om25.toFixed(1)}%`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">2026 {selectedQ}Q</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      매출총이익률 {view.gm26 == null ? 'N/A' : `${view.gm26.toFixed(1)}%`}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      영업이익률 {view.om26 == null ? 'N/A' : `${view.om26.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-base font-semibold text-slate-900">핵심 항목 비교 ({mode} / {selectedQ}Q)</div>
                <div className="mt-4 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => `${formatMillionWon(v)} 백만원`} />
                      <Legend />
                      <Bar dataKey="2025" fill="#64748b" />
                      <Bar dataKey="2026" fill="#0f172a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-base font-semibold text-slate-900">분기 추이 (매출액/영업이익)</div>
                <div className="mt-4 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartSeries} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => (v == null ? 'N/A' : `${formatMillionWon(v)} 백만원`)} />
                      <Legend />
                      <Line type="monotone" dataKey="2025 매출액" stroke="#64748b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="2026 매출액" stroke="#0f172a" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="2025 영업이익" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="2026 영업이익" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <div className="font-semibold">주의</div>
              <div className="mt-1">
                현재 <code className="rounded bg-amber-100 px-1">2026_IS.csv</code> 내부 헤더에 <code className="rounded bg-amber-100 px-1">26.xQ</code> 토큰이 없어,
                파일명 기준으로 2026으로 라벨링해 비교합니다. (또한 2026 수치는 마감 전이라 2025와 동일하게 보일 수 있습니다.)
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

