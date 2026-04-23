import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area, ReferenceLine, LabelList } from 'recharts';

// ============================================
// F&F Corporation Q1 2026 Financial Dashboard
// shadcn/ui 스타일 적용
// Build: 20260409-1
// ============================================

// 커스텀 도넛 차트 툴팁 컴포넌트
const CustomPieTooltip = ({ active, payload, formatter }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const color = data.payload.color;
    const name = data.name;
    const value = formatter ? formatter(data.value) : data.value;
    
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-zinc-200 rounded-lg shadow-lg px-3 py-2 min-w-[160px]">
        <div className="flex items-center gap-2 mb-1">
          <span 
            className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-medium text-zinc-700 whitespace-nowrap">{name}</span>
        </div>
        <div className="text-sm font-semibold text-zinc-900 pl-4 whitespace-nowrap">{value}</div>
      </div>
    );
  }
  return null;
};

// 커스텀 차트 툴팁 컴포넌트
const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-zinc-200 rounded-lg shadow-lg px-3 py-2.5 min-w-[140px]">
        <p className="text-xs font-medium text-zinc-500 mb-1.5 pb-1.5 border-b border-zinc-100 whitespace-nowrap">{label}</p>
        <div className="space-y-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span 
                  className="w-2 h-2 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-zinc-600 whitespace-nowrap">{entry.name || entry.dataKey}</span>
              </div>
              <span className="text-xs font-semibold text-zinc-900 whitespace-nowrap">{entry.value?.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

// localStorage 키 상수
const STORAGE_KEYS = {
  INCOME_EDIT: 'fnf_q1_2026_income_edit',
  BS_EDIT: 'fnf_q1_2026_bs_edit',
  AI_ANALYSIS: 'fnf_q1_2026_ai_analysis',
  ENTITY_STMT_REASONS: 'fnf_q1_2026_entity_stmt_reasons',
  IMPAIRMENT: 'fnf_q1_2026_impairment',
};

// API 엔드포인트 설정
const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
  ? '' 
  : '';

// localStorage에서 안전하게 불러오기
const loadFromStorage = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.warn('localStorage 로드 실패:', e);
    return {};
  }
};

// localStorage에 안전하게 저장
const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('localStorage 저장 실패:', e);
  }
};

const PERIOD_KEY_REGEX = /^(20\d{2})_(?:[1-4]Q(?:_Year)?|Year)$/;

const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some((v) => String(v ?? '').trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((v) => String(v ?? '').trim() !== '')) rows.push(row);
  if (rows.length && rows[0].length) {
    rows[0][0] = String(rows[0][0] ?? '').replace(/^\uFEFF/, '');
  }
  return rows;
};

const decodeCsvBuffer = (buffer) => {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  let eucKr = '';
  try {
    eucKr = new TextDecoder('euc-kr').decode(buffer);
  } catch {
    // 일부 런타임/브라우저에서는 euc-kr 디코더가 없을 수 있음
    // 이 경우 UTF-8 결과를 사용한다.
    return utf8;
  }

  const score = (text) => {
    const replacementCount = (text.match(/�/g) || []).length;
    const hasQuarterHeader = /\d{2}\.[1-4]Q/.test(text);
    const hasMajorAccount = /(매출액|영업이익|당기순이익|법인세비용차감전순이익)/.test(text);
    // 깨짐 문자가 적고, 분기 헤더/핵심 계정이 보이면 높은 점수
    return (hasQuarterHeader ? 2 : 0) + (hasMajorAccount ? 2 : 0) - replacementCount;
  };

  return score(eucKr) > score(utf8) ? eucKr : utf8;
};

const fetchCsvTextWithFallback = async (url) => {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return decodeCsvBuffer(buffer);
};

const parseCsvNumber = (raw) => {
  const s0 = String(raw ?? '').trim();
  if (s0 === '') return undefined;
  const isNeg = s0.includes('(') && s0.includes(')');
  const cleaned = s0.replace(/[(),\s]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return isNeg ? -n / 1_000_000 : n / 1_000_000;
};

const normalizeAccount = (v) =>
  String(v ?? '')
    .replace(/\s+/g, '')
    .replace(/[.,\-_:·]/g, '')
    .replace(/[()]/g, '')
    .replace(/Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ/g, '')
    .trim();

const buildEntityQuarterLookup = (rows, year) => {
  const lookup = {};
  if (!rows?.length) return lookup;
  const header = rows[0].map((c) => String(c ?? '').replace(/^\uFEFF/, '').trim());
  const quarterOffsets = [];
  for (let i = 0; i < header.length; i += 1) {
    if (/^\d{2}\.[1-4]Q$/.test(header[i])) quarterOffsets.push(i);
  }
  // CSV 열 구조: [period, F&F(+1), 중국(+2), 홍콩(+3), 베트남(+4), 빅텐츠(+5), 엔터(+6), ST미국(+7),
  //              단순합계(+8), 연결조정(+9,+10), 누적(+11), 전분기누적(+12), 분기연결합계(+13)]
  const ENTITY_COL_NAMED = {
    'OC(국내)': 1,
    중국: 2,
    홍콩: 3,
    베트남: 4,
    엔터테인먼트: 6,
    ST미국: 7,
  };
  const COL_BIGTENTS = 5;   // 빅텐츠 (별도 법인, 기타(연결조정)에 포함)
  const COL_SIMPLE_SUM = 8; // 단순합계
  const COL_CONSOL_QTR = 13; // 분기 연결합계 (누적 아님!)

  quarterOffsets.forEach((offset) => {
    const m = header[offset].match(/^\d{2}\.([1-4])Q$/);
    if (!m) return;
    const q = Number(m[1]);
    const period = `${year}_${q}Q`;
    if (!lookup[period]) lookup[period] = {};
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const rawAccount = row[offset];
      if (!String(rawAccount ?? '').trim()) continue;
      const accountKey = normalizeAccount(rawAccount);
      if (!lookup[period][accountKey]) lookup[period][accountKey] = {};

      // 명명 법인 (OC·중국·홍콩·베트남·엔터·ST미국)
      Object.entries(ENTITY_COL_NAMED).forEach(([entity, rel]) => {
        const v = parseCsvNumber(row[offset + rel]);
        if (v !== undefined) lookup[period][accountKey][entity] = Math.round(v);
      });

      // 기타(연결조정) = 분기연결합계 − (단순합계 − 빅텐츠)
      //   = 순연결조정분개 + 빅텐츠 (빅텐츠가 표시 합계에서 누락되지 않도록)
      //   → SUM(모든표시법인) = 분기연결합계 보장
      const qConsolidated = parseCsvNumber(row[offset + COL_CONSOL_QTR]);
      const simpleSum = parseCsvNumber(row[offset + COL_SIMPLE_SUM]);
      const bigtents = parseCsvNumber(row[offset + COL_BIGTENTS]) ?? 0;
      if (qConsolidated !== undefined && simpleSum !== undefined) {
        lookup[period][accountKey]['기타(연결조정)'] =
          Math.round(qConsolidated - simpleSum + bigtents);
      }
    }
    // 파생 계정: 배당금수익(CSV명) → 배당수익(대시보드 키) alias
    if (lookup[period]['배당금수익'] && !lookup[period]['배당수익']) {
      lookup[period]['배당수익'] = { ...lookup[period]['배당금수익'] };
    }
    // 파생 계정: 선물환손익 = 파생상품평가이익/거래이익 - 파생상품평가손실/거래손실 (법인별)
    const fwdGainByEntity = lookup[period]['파생상품평가이익'];
    const fwdTradeGainByEntity = lookup[period]['파생상품거래이익'];
    const fwdLossByEntity = lookup[period]['파생상품평가손실'];
    const fwdTradeLossByEntity = lookup[period]['파생상품거래손실'];
    if (fwdGainByEntity || fwdTradeGainByEntity || fwdLossByEntity || fwdTradeLossByEntity) {
      if (!lookup[period]['선물환손익']) lookup[period]['선물환손익'] = {};
      [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
        const g1 = fwdGainByEntity?.[entity] || 0;
        const g2 = fwdTradeGainByEntity?.[entity] || 0;
        const l1 = fwdLossByEntity?.[entity] || 0;
        const l2 = fwdTradeLossByEntity?.[entity] || 0;
        if (g1 !== 0 || g2 !== 0 || l1 !== 0 || l2 !== 0) {
          lookup[period]['선물환손익'][entity] = Math.round(g1 + g2 - l1 - l2);
        }
      });
    }
    // 파생 계정: 인건비 = 급여 + 퇴직급여 (법인별)
    const salaryByEntity = lookup[period]['급여'];
    const retirementByEntity = lookup[period]['퇴직급여'];
    if (salaryByEntity || retirementByEntity) {
      if (!lookup[period]['인건비']) lookup[period]['인건비'] = {};
      [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
        const s = salaryByEntity?.[entity] || 0;
        const r = retirementByEntity?.[entity] || 0;
        if (s !== 0 || r !== 0) {
          lookup[period]['인건비'][entity] = Math.round(s + r);
        }
      });
    }
    // 파생 계정: 수수료 = 지급수수료 + 운반비 (법인별, 맵핑표 기준)
    const feeRawByEntity = lookup[period]['지급수수료'];
    const deliveryByEntity = lookup[period]['운반비'];
    if (feeRawByEntity || deliveryByEntity) {
      if (!lookup[period]['수수료']) lookup[period]['수수료'] = {};
      [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
        const f = feeRawByEntity?.[entity] || 0;
        const d = deliveryByEntity?.[entity] || 0;
        if (f !== 0 || d !== 0) lookup[period]['수수료'][entity] = Math.round(f + d);
      });
    }
    // 파생 계정: 감가상각비 += 무형자산상각비 (법인별, 맵핑표 기준)
    const intanDepByEntity = lookup[period]['무형자산상각비'];
    if (intanDepByEntity) {
      if (!lookup[period]['감가상각비']) lookup[period]['감가상각비'] = {};
      [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
        const d = lookup[period]['감가상각비']?.[entity] || 0;
        const id = intanDepByEntity?.[entity] || 0;
        if (d !== 0 || id !== 0) lookup[period]['감가상각비'][entity] = Math.round(d + id);
      });
    }
    // 파생 계정: 기타판관비 = 판매비와관리비 - 인건비 - 광고선전비 - 수수료 - 감가상각비 (법인별)
    const sgaByEntity = lookup[period]['판매비와관리비'] || lookup[period]['판관비'];
    const laborByEntity = lookup[period]['인건비'];
    const adByEntity = lookup[period]['광고선전비'];
    const feeByEntity = lookup[period]['수수료'];
    const depByEntity = lookup[period]['감가상각비'];
    if (sgaByEntity) {
      if (!lookup[period]['기타판관비']) lookup[period]['기타판관비'] = {};
      [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
        const sga = sgaByEntity?.[entity] || 0;
        const labor = laborByEntity?.[entity] || 0;
        const ad = adByEntity?.[entity] || 0;
        const fee = feeByEntity?.[entity] || 0;
        const dep = depByEntity?.[entity] || 0;
        if (sga !== 0) {
          lookup[period]['기타판관비'][entity] = Math.round(sga - labor - ad - fee - dep);
        }
      });
    }
    // ── 영업외 파생 계정 (법인별) ──────────────────────────────────────────
    // (1) 외환손익 = 외화환산이익 + 외환차익 − 외화환산손실 − 외환차손
    {
      const g1 = lookup[period]['외화환산이익'];
      const g2 = lookup[period]['외환차익'];
      const l1 = lookup[period]['외화환산손실'];
      const l2 = lookup[period]['외환차손'];
      if (g1 || g2 || l1 || l2) {
        if (!lookup[period]['외환손익']) lookup[period]['외환손익'] = {};
        [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
          const v = (g1?.[entity] || 0) + (g2?.[entity] || 0) - (l1?.[entity] || 0) - (l2?.[entity] || 0);
          if (v !== 0) lookup[period]['외환손익'][entity] = Math.round(v);
        });
      }
    }
    // (2) 이자손익 = 이자수익 − 이자비용
    {
      const inc = lookup[period]['이자수익'];
      const exp = lookup[period]['이자비용'];
      if (inc || exp) {
        if (!lookup[period]['이자손익']) lookup[period]['이자손익'] = {};
        [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
          const v = (inc?.[entity] || 0) - (exp?.[entity] || 0);
          if (v !== 0) lookup[period]['이자손익'][entity] = Math.round(v);
        });
      }
    }
    // (3) 기타손익 = 잡이익 − 잡손실
    {
      const gain = lookup[period]['잡이익'];
      const loss = lookup[period]['잡손실'];
      if (gain || loss) {
        if (!lookup[period]['기타손익']) lookup[period]['기타손익'] = {};
        [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
          const v = (gain?.[entity] || 0) - (loss?.[entity] || 0);
          if (v !== 0) lookup[period]['기타손익'][entity] = Math.round(v);
        });
      }
    }
    // (4) 금융상품손익 = (당기손익공정가치금융자산 평가/처분 이익 + 단기매매증권 평가/처분 이익)
    //                  − (당기손익공정가치금융자산 평가/처분 손실)
    {
      const fg1 = lookup[period]['당기손익공정가치측정금융자산평가이익'] || lookup[period]['당기손익인식금융자산처분이익'];
      const fg2 = lookup[period]['단기매매증권평가이익'];
      const fg3 = lookup[period]['단기매매증권처분이익'];
      const fl1 = lookup[period]['당기손익공정가치측정금융자산평가손실'] || lookup[period]['당기손익인식금융자산처분손실'];
      if (fg1 || fg2 || fg3 || fl1) {
        if (!lookup[period]['금융상품손익']) lookup[period]['금융상품손익'] = {};
        [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
          const v = (fg1?.[entity] || 0) + (fg2?.[entity] || 0) + (fg3?.[entity] || 0) - (fl1?.[entity] || 0);
          if (v !== 0) lookup[period]['금융상품손익'][entity] = Math.round(v);
        });
      }
    }
    // (5) 지분법손익 = 지분법이익 − 지분법손실
    {
      const gain = lookup[period]['지분법이익'];
      const loss = lookup[period]['지분법손실'];
      if (gain || loss) {
        if (!lookup[period]['지분법손익']) lookup[period]['지분법손익'] = {};
        [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
          const v = (gain?.[entity] || 0) - (loss?.[entity] || 0);
          if (v !== 0) lookup[period]['지분법손익'][entity] = Math.round(v);
        });
      }
    }
    // (6) 영업외손익 (net) = 외환손익 + 선물환손익 + 금융상품손익 + 이자손익 + 배당수익 + 기부금 + 기타손익
    {
      const components = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '배당금수익', '기부금', '기타손익'];
      const hasAny = components.some(k => lookup[period][k]);
      if (hasAny) {
        if (!lookup[period]['영업외손익']) lookup[period]['영업외손익'] = {};
        [...Object.keys(ENTITY_COL_NAMED), '기타(연결조정)'].forEach((entity) => {
          // 배당수익/배당금수익 중복 방지
          const divid = (lookup[period]['배당수익']?.[entity] || 0) || (lookup[period]['배당금수익']?.[entity] || 0);
          const v = (lookup[period]['외환손익']?.[entity] || 0)
                  + (lookup[period]['선물환손익']?.[entity] || 0)
                  + (lookup[period]['금융상품손익']?.[entity] || 0)
                  + (lookup[period]['이자손익']?.[entity] || 0)
                  + divid
                  + (lookup[period]['기부금']?.[entity] || 0)
                  + (lookup[period]['기타손익']?.[entity] || 0);
          if (v !== 0) lookup[period]['영업외손익'][entity] = Math.round(v);
        });
      }
    }
  });
  return lookup;
};

const mergePeriodMetrics = (baseData, overrideData) => {
  const merged = { ...baseData };
  Object.entries(overrideData || {}).forEach(([period, metrics]) => {
    merged[period] = { ...(baseData?.[period] || {}), ...(metrics || {}) };
  });
  return merged;
};

const addMetric = (obj, period, key, value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return;
  if (!obj[period]) obj[period] = {};
  obj[period][key] = Math.round(Number(value));
};

const buildConsolidatedISLookup = (rows, year) => {
  const lookup = {};
  if (!rows?.length) return lookup;
  const header = rows[0].map((c) => String(c ?? '').trim());
  const quarterOffsets = [];
  for (let i = 0; i < header.length; i += 1) {
    if (/^\d{2}\.[1-4]Q$/.test(header[i])) quarterOffsets.push(i);
  }

  const accountMap = {
    매출액: '매출액',
    매출원가: '매출원가',
    매출총이익: '매출총이익',
    판매비와관리비: '판매비와관리비',
    영업이익: '영업이익',
    영업외손익: '영업외손익',
    영업외수익: '__영업외수익',
    영업외비용: '__영업외비용',
    지분법손익: '지분법손익',
    지분법이익: '__지분법이익',
    지분법손실: '__지분법손실',
    법인세비용차감전순이익: '법인세비용차감전순이익',
    법인세비용: '법인세비용',
    당기순이익: '당기순이익',
    급여: '급여',
    퇴직급여: '퇴직급여',
    광고선전비: '광고선전비',
    지급수수료: '__지급수수료',  // 맵핑표: (3)수수료
    운반비: '__운반비',          // 맵핑표: (3)수수료 — 지급수수료와 합산
    감가상각비: '감가상각비',
    무형자산상각비: '__무형자산상각비', // 맵핑표: (4)감가상각비 — 감가상각비와 합산
    외환손익: '외환손익',
    외환차익: '__외환차익',
    외환차손: '__외환차손',
    외화환산이익: '__외화환산이익',
    외화환산손실: '__외화환산손실',
    선물환손익: '선물환손익',
    금융상품손익: '금융상품손익',
    파생상품평가이익: '__파생평가이익',
    파생상품평가손실: '__파생평가손실',
    파생상품거래이익: '__파생거래이익',
    파생상품거래손실: '__파생거래손실',
    당기손익인식금융자산처분이익: '__당손금융자산처분이익',
    당기손익인식금융자산처분손실: '__당손금융자산처분손실',
    당기손익공정가치측정금융자산평가이익: '__당손금융자산평가이익',
    당기손익공정가치측정금융자산평가손실: '__당손금융자산평가손실',
    이자손익: '이자손익',
    이자수익: '__이자수익',
    이자비용: '__이자비용',
    배당수익: '배당수익',   // fallback: CSV에 없을 경우
    배당금수익: '배당수익', // CSV 실제 계정명 → 배당수익으로 맵핑
    기부금: '기부금',
    기타손익: '기타손익',
    잡이익: '__잡이익',
    잡손실: '__잡손실',
    // (3)금융상품손익: 당기손익-공정가치측정 계정 + 단기매매증권 계정
    단기매매증권평가이익: '__단매평가이익',
    단기매매증권처분이익: '__단매처분이익',
  };

  quarterOffsets.forEach((offset) => {
    const m = header[offset].match(/^\d{2}\.([1-4])Q$/);
    if (!m) return;
    const q = Number(m[1]);
    const qKey = `${year}_${q}Q`;
    const yKey = q === 4 ? `${year}_Year` : `${year}_${q}Q_Year`;
    const qCol = offset + 13;
    const yCol = offset + 11;

    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const account = accountMap[normalizeAccount(row[offset])];
      if (!account) continue;
      const quarterValue = parseCsvNumber(row[qCol]);
      let yearValue = parseCsvNumber(row[yCol]);

      // 1Q 누적은 당분기와 동일해야 하므로, 특정 핵심 계정은 1원 차이도 없도록 동일 컬럼으로 고정한다.
      if (
        q === 1 &&
        (account === '법인세비용차감전순이익' || account === '당기순이익') &&
        quarterValue !== undefined
      ) {
        yearValue = quarterValue;
      }

      addMetric(lookup, qKey, account, quarterValue);
      addMetric(lookup, yKey, account, yearValue);
    }
  });

  Object.keys(lookup).forEach((period) => {
    // 인건비 = 급여 + 퇴직급여
    const salary = lookup[period]?.급여;
    const retirement = lookup[period]?.퇴직급여;
    if (salary !== undefined || retirement !== undefined) {
      lookup[period].인건비 = Math.round(Number(salary || 0) + Number(retirement || 0));
    }
    // 수수료 = 지급수수료 + 운반비 (맵핑표: 둘 다 (3)수수료)
    const fee1 = lookup[period]?.__지급수수료;
    const fee2 = lookup[period]?.__운반비;
    if (fee1 !== undefined || fee2 !== undefined) {
      lookup[period].수수료 = Math.round(Number(fee1 || 0) + Number(fee2 || 0));
    }
    // 감가상각비 += 무형자산상각비 (맵핑표: 둘 다 (4)감가상각비)
    const intanDep = lookup[period]?.__무형자산상각비;
    if (intanDep !== undefined) {
      lookup[period].감가상각비 = Math.round(Number(lookup[period]?.감가상각비 || 0) + Number(intanDep || 0));
    }
    // 기타판관비 = 판관비 - 인건비 - 광고선전비 - 수수료 - 감가상각비
    const sga = lookup[period]?.판매비와관리비;
    const labor = lookup[period]?.인건비;
    const ad = lookup[period]?.광고선전비;
    const fee = lookup[period]?.수수료;
    const dep = lookup[period]?.감가상각비;
    if (sga !== undefined) {
      lookup[period].기타판관비 = Math.round(Number(sga || 0) - Number(labor || 0) - Number(ad || 0) - Number(fee || 0) - Number(dep || 0));
    }

    // CSV가 분리 계정으로 제공되는 항목은 파생 계산으로 맞춘다.
    if (lookup[period].영업외손익 === undefined) {
      const nonOpIncome = Number(lookup[period].__영업외수익 || 0);
      const nonOpExpense = Number(lookup[period].__영업외비용 || 0);
      if (nonOpIncome !== 0 || nonOpExpense !== 0) {
        lookup[period].영업외손익 = Math.round(nonOpIncome - nonOpExpense);
      }
    }
    if (lookup[period].지분법손익 === undefined) {
      const equityGain = Number(lookup[period].__지분법이익 || 0);
      const equityLoss = Number(lookup[period].__지분법손실 || 0);
      if (equityGain !== 0 || equityLoss !== 0) {
        lookup[period].지분법손익 = Math.round(equityGain - equityLoss);
      }
    }
    // CSV의 영업외손익 행은 VI.영업외손익 + VII.지분법손익 합산값 → 지분법 제거하여 VI만 분리
    if (lookup[period].영업외손익 !== undefined && lookup[period].지분법손익 !== undefined) {
      lookup[period].영업외손익 = Math.round(
        Number(lookup[period].영업외손익) - Number(lookup[period].지분법손익)
      );
    }
    if (lookup[period].외환손익 === undefined) {
      const fxGain = Number(lookup[period].__외환차익 || 0) + Number(lookup[period].__외화환산이익 || 0);
      const fxLoss = Number(lookup[period].__외환차손 || 0) + Number(lookup[period].__외화환산손실 || 0);
      if (fxGain !== 0 || fxLoss !== 0) {
        lookup[period].외환손익 = Math.round(fxGain - fxLoss);
      }
    }
    // 선물환손익 = 파생상품 계정 합산 (맵핑표: (2)선물환손익)
    if (lookup[period].선물환손익 === undefined) {
      const fwdGain =
        Number(lookup[period].__파생평가이익 || 0) +
        Number(lookup[period].__파생거래이익 || 0);
      const fwdLoss =
        Number(lookup[period].__파생평가손실 || 0) +
        Number(lookup[period].__파생거래손실 || 0);
      // CSV에 파생상품 계정이 하나라도 존재하면(값=0 포함) 명시적으로 0 세팅
      // → normalizeYearDataset 클론값(-3,333 등)이 남지 않도록
      const hasFwdData =
        lookup[period].__파생평가이익 !== undefined ||
        lookup[period].__파생거래이익 !== undefined ||
        lookup[period].__파생평가손실 !== undefined ||
        lookup[period].__파생거래손실 !== undefined;
      if (hasFwdData || fwdGain !== 0 || fwdLoss !== 0) {
        lookup[period].선물환손익 = Math.round(fwdGain - fwdLoss);
      }
    }
    // 금융상품손익 = 당기손익-공정가치측정 + 단기매매증권 계정 (맵핑표: (3)금융상품손익)
    if (lookup[period].금융상품손익 === undefined) {
      const finGain =
        Number(lookup[period].__당손금융자산처분이익 || 0) +
        Number(lookup[period].__당손금융자산평가이익 || 0) +
        Number(lookup[period].__단매평가이익 || 0) +
        Number(lookup[period].__단매처분이익 || 0);
      const finLoss =
        Number(lookup[period].__당손금융자산처분손실 || 0) +
        Number(lookup[period].__당손금융자산평가손실 || 0);
      if (finGain !== 0 || finLoss !== 0) {
        lookup[period].금융상품손익 = Math.round(finGain - finLoss);
      }
    }
    if (lookup[period].이자손익 === undefined) {
      const interestIncome = Number(lookup[period].__이자수익 || 0);
      const interestExpense = Number(lookup[period].__이자비용 || 0);
      if (interestIncome !== 0 || interestExpense !== 0) {
        lookup[period].이자손익 = Math.round(interestIncome - interestExpense);
      }
    }
    // 기타손익 = 영업외손익(VI pure) - 외환 - 선물환 - 금융상품 - 이자 - 배당 - 기부금 (잔차)
    // → 종속기업투자주식처분이익 등 accountMap에 없는 대형 일회성 계정도 자동 포함
    if (lookup[period].영업외손익 !== undefined) {
      lookup[period].기타손익 = Math.round(
        Number(lookup[period].영업외손익 || 0) -
        Number(lookup[period].외환손익 || 0) -
        Number(lookup[period].선물환손익 || 0) -
        Number(lookup[period].금융상품손익 || 0) -
        Number(lookup[period].이자손익 || 0) -
        Number(lookup[period].배당수익 || 0) -
        Number(lookup[period].기부금 || 0)
      );
    } else if (false) {
      // 아래는 사용 안함 (잔차 방식으로 대체)
      const miscGain = Number(lookup[period].__잡이익 || 0);
      const miscLoss = Number(lookup[period].__잡손실 || 0);
      if (miscGain !== 0 || miscLoss !== 0) {
        lookup[period].기타손익 = Math.round(miscGain - miscLoss);
      }
    }
  });

  return lookup;
};

const buildConsolidatedBSLookup = (rows, year) => {
  const lookup = {};
  if (!rows?.length) return lookup;
  const header = rows[0].map((c) => String(c ?? '').trim());
  const quarterOffsets = [];
  for (let i = 0; i < header.length; i += 1) {
    if (/^\d{2}\.[1-4]Q$/.test(header[i])) quarterOffsets.push(i);
  }

  const addSum = (obj, period, key, value) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return;
    if (!obj[period]) obj[period] = {};
    obj[period][key] = Math.round(Number(obj[period][key] || 0) + Number(value));
  };

  const accountMap = {
    현금및현금성자산: '현금성자산',
    기타유동금융자산: '금융자산',
    통화선도: '금융자산',
    유동당기손익공정가치측정금융자산: '금융자산',
    장기금융상품: '금융자산',
    당기손익공정가치측정금융자산: '금융자산',  // 비유동
    기타포괄손익공정가치측정금융자산: '금융자산',
    상각후원가금융자산: '금융자산',
    파생상품자산: '금융자산',
    매출채권: '매출채권',
    매출채권대손충당금: '매출채권',  // 음수값 → 순매출채권(net) 반영
    장기매출채권: '매출채권',
    // 대여금: 맵핑표 별도 카테고리 (기타자산 residual에서 분리)
    단기대여금: '대여금',
    단기대여금대손충당금: '대여금',  // 충당금(음수) 합산
    장기대여금: '대여금',
    장기대여금대손충당금: '대여금',  // 충당금(음수) 합산
    재고자산: '재고자산',
    투자자산: '투자자산',
    관계기업및종속기업투자: '투자자산',
    유형자산: '유무형자산',
    무형자산: '유무형자산',
    투자부동산: '유무형자산',
    사용권자산: '사용권자산',
    사용권자산감가상각누계액: '사용권자산',  // 음수 → 순사용권자산(net) 반영
    기타비유동자산: '기타자산',
    기타유동자산: '기타자산',
    자산총계: '자산총계',
    매입채무: '매입채무',
    미지급금: '미지급금',
    장기미지급금: '미지급금',
    // 유동성보증금(자산측 당좌자산): 맵핑표→기타자산 (residual에 자동 포함)
    유동성장기예수보증금: '보증금',  // 부채 유동보증금
    장기성예수보증금: '보증금',
    단기차입금: '차입금',
    장기차입금: '차입금',
    유동리스부채: '리스부채',
    리스부채: '리스부채',
    금융부채: '금융부채',
    부채총계: '부채총계',
    자본금: '자본금',
    자본잉여금: '자본잉여금',
    이익잉여금: '이익잉여금',
    기타포괄손익누계액: '기타자본',
    자본총계: '자본총계',
  };

  quarterOffsets.forEach((offset) => {
    const m = header[offset].match(/^\d{2}\.([1-4])Q$/);
    if (!m) return;
    const q = Number(m[1]);
    const qKey = `${year}_${q}Q`;
    const qCol = offset + 13;

    // Pass 1: exact match (plain account names without numeric prefix)
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const mapped = accountMap[normalizeAccount(row[offset])];
      if (!mapped) continue;
      addSum(lookup, qKey, mapped, parseCsvNumber(row[qCol]));
    }

    // Pass 2: for accounts not yet loaded, try rows with leading-digit prefix
    // e.g. "(2)재고자산" → normalizeAccount → "2재고자산" → strip → "재고자산" → accountMap match
    const loadedAccounts = new Set(Object.keys(lookup[qKey] || {}));
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const normalKey = normalizeAccount(row[offset]);
      if (accountMap[normalKey]) continue; // already handled in pass 1
      const stripped = normalKey.replace(/^\d+/, '');
      if (!stripped || stripped === normalKey) continue;
      const mapped = accountMap[stripped];
      if (!mapped) continue;
      if (loadedAccounts.has(mapped)) continue; // plain row already loaded this account
      addSum(lookup, qKey, mapped, parseCsvNumber(row[qCol]));
    }
  });

  // 기타자산/기타부채는 CSV 계정 분류 변동에 따라 중복 집계가 발생할 수 있어
  // 총계 기준 잔차로 보정해 과대계상 이슈를 방지한다.
  Object.keys(lookup).forEach((period) => {
    const item = lookup[period];
    if (!item) return;

    if (item.자산총계 !== undefined) {
      const otherAssets = Number(item.현금성자산 || 0)
        + Number(item.금융자산 || 0)
        + Number(item.매출채권 || 0)
        + Number(item.재고자산 || 0)
        + Number(item.투자자산 || 0)
        + Number(item.유무형자산 || 0)
        + Number(item.사용권자산 || 0)
        + Number(item.대여금 || 0);  // 맵핑표 대여금 카테고리 분리 (기타자산에서 제외)
      item.기타자산 = Math.round(Number(item.자산총계 || 0) - otherAssets);
    }

    if (item.부채총계 !== undefined) {
      const otherLiabilities = Number(item.매입채무 || 0)
        + Number(item.미지급금 || 0)
        + Number(item.보증금 || 0)
        + Number(item.차입금 || 0)
        + Number(item.리스부채 || 0)
        + Number(item.금융부채 || 0);
      item.기타부채 = Math.round(Number(item.부채총계 || 0) - otherLiabilities);
    }
  });
  return lookup;
};

const deepClone = (value) => {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
};

// 2025 데이터를 기준으로 2024/2026 기간 키를 동일값으로 맞춘다.
// - 2024: 비교 기준(전년)도 2025 값으로 표시
// - 2026: 마감 전 임시값으로 2025와 동일 표시
const shouldClonePeriodForYear = (suffix, rule) => {
  if (!rule) return true;
  if (suffix === '_Year') return !!rule.includeYear;
  const m = suffix.match(/^_([1-4])Q(?:_Year)?$/);
  if (!m) return true;
  const q = Number(m[1]);
  return Array.isArray(rule.quarters) ? rule.quarters.includes(q) : true;
};

const normalizeYearDataset = (source, baseYear = '2025', targetRules = { '2024': {}, '2026': {} }) => {
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;

    const result = {};
    Object.entries(node).forEach(([k, v]) => {
      result[k] = walk(v);
    });

    const keys = Object.keys(result);
    const hasPeriodKeys = keys.some((k) => PERIOD_KEY_REGEX.test(k));
    if (!hasPeriodKeys) return result;

    keys.forEach((k) => {
      if (!k.startsWith(`${baseYear}_`)) return;
      const suffix = k.slice(baseYear.length);
      Object.entries(targetRules).forEach(([targetYear, rule]) => {
        if (!shouldClonePeriodForYear(suffix, rule)) return;
        result[`${targetYear}${suffix}`] = deepClone(result[k]);
      });
    });

    return result;
  };

  return walk(source);
};

export default function FnFQ1_2026Dashboard() {
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedEntityTab, setSelectedEntityTab] = useState('OC(국내)');
  const [entityStmtOpExpanded, setEntityStmtOpExpanded] = useState(true);
  const [entityStmtNonOpExpanded, setEntityStmtNonOpExpanded] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState('매출액');  // 영업 섹션용
  const [selectedNonOpAccount, setSelectedNonOpAccount] = useState('영업외손익');  // 영업외 섹션용
  const [selectedBSAccount, setSelectedBSAccount] = useState('자산총계');
  const [isNonOperatingExpanded, setIsNonOperatingExpanded] = useState(false);
  const [operatingSectionExpanded, setOperatingSectionExpanded] = useState(true); // 영업 실적 섹션 접기/펼치기
  const [nonOpSectionExpanded, setNonOpSectionExpanded] = useState(true); // 영업외 손익 섹션 접기/펼치기
  const [plInsightExpanded, setPlInsightExpanded] = useState(false);   // 실적분석 텍스트 접기/펼치기
  const [costInsightExpanded, setCostInsightExpanded] = useState(false); // 비용구조 텍스트 접기/펼치기
  const [nwcInsightExpanded, setNwcInsightExpanded] = useState(false);  // NWC 추세 시사점 접기/펼치기
  const [incomeViewMode, setIncomeViewMode] = useState('quarter'); // 'quarter' | 'annual'
  const [selectedPeriod, setSelectedPeriod] = useState('2026_Q1'); // 선택된 조회기간 ('2026_Q1' ~ '2026_Q4')
  const [summaryKpiMode, setSummaryKpiMode] = useState('quarter'); // 'quarter' | 'cumulative' - 손익 요약 카드 보기 모드
  const [isEntitySubTab, setIsEntitySubTab] = useState('연결'); // 손익계산서 탭 서브탭: '연결' | entity key
  const [bsEntitySubTab, setBsEntitySubTab] = useState('연결'); // 재무상태표 탭 서브탭: '연결' | entity key
  const [balanceKpiMode, setBalanceKpiMode] = useState('yearEnd'); // 'sameQuarter' | 'yearEnd' - 재무상태 요약 카드 보기 모드
  const [incomeEditMode, setIncomeEditMode] = useState(false); // 영업 섹션 증감 분석 편집 모드
  const [nonOpEditMode, setNonOpEditMode] = useState(false); // 영업외 섹션 증감 분석 편집 모드
  const [entityAmtInputMode, setEntityAmtInputMode] = useState(false); // 법인별 금액 직접입력 모드
  const [entityAmtDraft, setEntityAmtDraft] = useState({}); // 법인별 금액 임시 입력값 (억원)
  const [miscEditMode, setMiscEditMode] = useState(false); // 기타손익 구성상세 편집 모드
  const [miscDraft, setMiscDraft] = useState({}); // 기타손익 구성상세 임시 입력값
  // 일별 환율 추이 차트
  const [fxRateData, setFxRateData] = useState([]);
  const [fxVisible, setFxVisible] = useState({ USD: true, CNY: true, HKD: true, EUR: true, TWD: true });
  const [bsEditMode, setBsEditMode] = useState(false); // 재무상태표 증감 분석 편집 모드
  const [hiddenEntityCards, setHiddenEntityCards] = useState(() => {
    // localStorage에서 숨겨진 법인 카드 목록 로드
    try {
      const saved = localStorage.getItem('fnf_q1_2026_hidden_entity_cards');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  }); // { 과목키: ['법인1', '법인2'] }
  
  const [hiddenDetailSections, setHiddenDetailSections] = useState(() => {
    // localStorage에서 숨겨진 구성 상세 섹션 목록 로드
    try {
      const saved = localStorage.getItem('fnf_q1_2026_hidden_detail_sections');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }); // ['매출액', '영업이익', ...] - 숨긴 과목 키 배열
  const [incomeEditData, setIncomeEditData] = useState(() => loadFromStorage(STORAGE_KEYS.INCOME_EDIT)); // localStorage에서 초기값 로드
  const [bsEditData, setBsEditData] = useState(() => loadFromStorage(STORAGE_KEYS.BS_EDIT)); // localStorage에서 초기값 로드
  const [entityStmtReasons, setEntityStmtReasons] = useState(() => loadFromStorage(STORAGE_KEYS.ENTITY_STMT_REASONS));
  const [aiEditMode, setAiEditMode] = useState(false); // AI 분석 편집 모드
  const [aiAnalysisData, setAiAnalysisData] = useState(() => loadFromStorage(STORAGE_KEYS.AI_ANALYSIS)); // AI 분석 편집 데이터
  const [aiAnalysisBackup, setAiAnalysisBackup] = useState(null); // 편집 시작 전 백업 데이터
  const [aiSaveStatus, setAiSaveStatus] = useState(''); // 저장 상태 표시 ('saving', 'saved', 'error', '')
  const [aiLastUpdated, setAiLastUpdated] = useState(null); // 마지막 업데이트 시간
  const [serverSaveStatus, setServerSaveStatus] = useState(''); // 전체 설정 저장 상태
  const fileInputRef = React.useRef(null); // 파일 업로드용 ref
  const isInitialLoadRef = React.useRef(true); // 초기 로드 여부
  const [availableQuarters2026, setAvailableQuarters2026] = useState([1]);
  const [entityCsvLookup, setEntityCsvLookup] = useState({ is: {}, bs: {} });
  const [impairmentData, setImpairmentData] = useState(() => loadFromStorage(STORAGE_KEYS.IMPAIRMENT) || {
    엔터테인먼트: { plan2025Sales: 0, plan2025OpInc: 0, positives: '', monitoring: '' },
    ST미국: { plan2025Sales: 0, plan2025OpInc: 0, positives: '', monitoring: '' },
  });
  const [consolidatedCsvOverride, setConsolidatedCsvOverride] = useState({ income: {}, balance: {} });
  const [plTrendData, setPlTrendData] = useState({ quarterly: [], yearly: [] });

  useEffect(() => {
    let cancelled = false;
    const parseCsv = (text) => {
      const rows = [];
      let row = [];
      let field = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 1;
            } else {
              inQuotes = false;
            }
          } else {
            field += c;
          }
          continue;
        }
        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { row.push(field); field = ''; continue; }
        if (c === '\r') continue;
        if (c === '\n') {
          row.push(field); field = '';
          if (row.some((v) => String(v ?? '').trim() !== '')) rows.push(row);
          row = [];
          continue;
        }
        field += c;
      }
      row.push(field);
      if (row.some((v) => String(v ?? '').trim() !== '')) rows.push(row);
      if (rows.length && rows[0].length) {
        rows[0][0] = String(rows[0][0] ?? '').replace(/^\uFEFF/, '');
      }
      return rows;
    };

    const hasValue = (v) => {
      const s = String(v ?? '').trim();
      return s !== '' && s !== '-' && s !== '0';
    };

    async function detect2026Quarters() {
      try {
        const text = await fetchCsvTextWithFallback('/2026_IS.csv');
        const rows = parseCsv(text);
        if (!rows.length) return;
        const header = rows[0].map((c) => String(c ?? '').trim());
        const saleRow = rows.find((r) => String(r[0] ?? '').includes('Ⅰ.매출액') || String(r[0] ?? '').trim() === '매출액');
        if (!saleRow) return;

        const quarters = [];
        for (let i = 0; i < header.length; i += 1) {
          const m = header[i].match(/^\d{2}\.([1-4])Q$/);
          if (!m) continue;
          const q = Number(m[1]);
          const qtrCol = i + 13;
          if (qtrCol < saleRow.length && hasValue(saleRow[qtrCol])) quarters.push(q);
        }
        if (!cancelled && quarters.length) setAvailableQuarters2026(Array.from(new Set(quarters)).sort((a, b) => a - b));
      } catch {
        // CSV 감지 실패 시 기본 1Q 유지
      }
    }
    detect2026Quarters();
    return () => { cancelled = true; };
  }, []);

  // 일별 환율 CSV 로드 (매매기준율 5개 파일 병합)
  useEffect(() => {
    // 따옴표 포함 CSV 한 줄 파싱 ("1,289.40" 같은 quoted field 처리)
    const parseCsvLine = (line) => {
      const fields = [];
      let cur = '', inQ = false;
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
        else { cur += ch; }
      }
      fields.push(cur);
      return fields;
    };
    const parseFxCsv = async (filename) => {
      try {
        const res = await fetch(`/${encodeURIComponent(filename)}`);
        if (!res.ok) return {};
        const text = await res.text();
        const lines = text.split(/\r?\n/);
        // "날짜,통화명,환율,..." 헤더 행 찾기
        const startIdx = lines.findIndex(l => l.startsWith('날짜,'));
        if (startIdx < 0) return {};
        const result = {};
        for (let i = startIdx + 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const row = parseCsvLine(lines[i]);
          if (row.length < 3) continue;
          const rawDate = row[0].trim(); // "2024.01.02"
          const rawRate = row[2].replace(/[,\s]/g, ''); // "1,289.40" → "1289.40" (따옴표는 이미 제거됨)
          if (!rawDate || !rawRate) continue;
          const date = rawDate.replace(/\./g, '-'); // "2024-01-02"
          const rate = parseFloat(rawRate);
          if (date.length === 10 && !isNaN(rate) && rate > 0) result[date] = rate;
        }
        return result;
      } catch { return {}; }
    };
    Promise.all([
      parseFxCsv('매매기준율(USD).csv'),
      parseFxCsv('매매기준율(CNY).csv'),
      parseFxCsv('매매기준율(HKD).csv'),
      parseFxCsv('매매기준율(EUR).csv'),
      parseFxCsv('매매기준율(TWD).csv'),
    ]).then(([usd, cny, hkd, eur, twd]) => {
      const allDates = [...new Set([
        ...Object.keys(usd), ...Object.keys(cny),
        ...Object.keys(hkd), ...Object.keys(eur), ...Object.keys(twd),
      ])].sort();
      const merged = allDates.map(date => ({
        date,
        label: date.slice(2, 7).replace('-', '.'), // "24.01"
        USD: usd[date] ?? null,
        CNY: cny[date] ?? null,
        HKD: hkd[date] ?? null,
        EUR: eur[date] ?? null,
        TWD: twd[date] ?? null,
      }));
      setFxRateData(merged);
    });
  }, []);

  // 매출·영업이익 추이 CSV 로드
  useEffect(() => {
    let cancelled = false;
    async function loadPlTrend() {
      try {
        const text = await fetchCsvTextWithFallback('/매출,영업이익 추이.csv');
        const rows = parseCsvText(text);
        if (!rows || rows.length < 3) return;
        // rows[0] = 빈 헤더, rows[1] = [구분, 매출액, 영업이익, 영업이익률], rows[2+] = data
        const quarterly = [];
        for (let i = 2; i < rows.length; i++) {
          const label = String(rows[i][0] ?? '').trim();
          if (!label) continue;
          const revenue = Number(String(rows[i][1] ?? '0').replace(/[,\s]/g, '')) || 0;
          const opIncome = Number(String(rows[i][2] ?? '0').replace(/[,\s]/g, '')) || 0;
          const opMarginStr = String(rows[i][3] ?? '').replace('%', '').trim();
          const opMargin = Number(opMarginStr) || 0;
          quarterly.push({ name: label, 매출액: revenue, 영업이익: opIncome, 영업이익률: opMargin });
        }
        // 동일 분기 비교 데이터 (1Q끼리, 2Q끼리 등)
        const quarterGroupMap = { '1Q': [], '2Q': [], '3Q': [], '4Q': [] };
        quarterly.forEach((d) => {
          const m = d.name.match(/^(\d{2})\.([1-4]Q)$/);
          if (!m) return;
          const year = '20' + m[1];
          const qLabel = m[2];
          if (quarterGroupMap[qLabel]) {
            quarterGroupMap[qLabel].push({ year, 매출액: d.매출액, 영업이익: d.영업이익, 영업이익률: d.영업이익률 });
          }
        });
        // 연도별 합산 + 분기별 분해
        const yearMap = {};
        quarterly.forEach((d) => {
          const m = d.name.match(/^(\d{2})\.([1-4])Q$/);
          if (!m) return;
          const year = '20' + m[1];
          const q = m[2];
          if (!yearMap[year]) yearMap[year] = { 매출액: 0, 영업이익: 0, count: 0, q1: 0, q2: 0, q3: 0, q4: 0, op1: 0, op2: 0, op3: 0, op4: 0 };
          yearMap[year].매출액 += d.매출액;
          yearMap[year].영업이익 += d.영업이익;
          yearMap[year].count += 1;
          yearMap[year]['q' + q] = d.매출액;
          yearMap[year]['op' + q] = d.영업이익;
        });
        const yearly = Object.entries(yearMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, v]) => ({
            name: year + '년',
            매출액: v.매출액,
            영업이익: v.영업이익,
            영업이익률: v.매출액 > 0 ? Math.round(v.영업이익 / v.매출액 * 100) : 0,
            quarters: v.count,
            '1Q매출': v.q1, '2Q매출': v.q2, '3Q매출': v.q3, '4Q매출': v.q4,
            '1Q영업이익': v.op1, '2Q영업이익': v.op2, '3Q영업이익': v.op3, '4Q영업이익': v.op4,
          }));
        if (!cancelled) setPlTrendData({ quarterly, yearly, quarterGroup: quarterGroupMap });
      } catch {
        // CSV 로드 실패 시 기존 방식 유지
      }
    }
    loadPlTrend();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadConsolidatedOverrides() {
      try {
        const [is25, is26, bs25, bs26] = await Promise.all([
          fetchCsvTextWithFallback('/2025_IS.csv'),
          fetchCsvTextWithFallback('/2026_IS.csv'),
          fetchCsvTextWithFallback('/2025_BS.csv'),
          fetchCsvTextWithFallback('/2026_BS.csv'),
        ]);
        const income = {
          ...buildConsolidatedISLookup(parseCsvText(is25), '2025'),
          ...buildConsolidatedISLookup(parseCsvText(is26), '2026'),
        };
        const balance = {
          ...buildConsolidatedBSLookup(parseCsvText(bs25), '2025'),
          ...buildConsolidatedBSLookup(parseCsvText(bs26), '2026'),
        };
        if (!cancelled) setConsolidatedCsvOverride({ income, balance });
      } catch {
        // consolidated csv 로드 실패 시 기본 하드코딩 사용
      }
    }
    loadConsolidatedOverrides();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadEntityCsvLookup() {
      try {
        const [is24, is25, is26, bs24, bs25, bs26] = await Promise.all([
          fetchCsvTextWithFallback('/2024 분기IS_법인별.csv'),
          fetchCsvTextWithFallback('/2025_분기IS_법인별.csv'),
          fetchCsvTextWithFallback('/2026_분기IS_법인별.csv'),
          fetchCsvTextWithFallback('/2024_BS.csv'),
          fetchCsvTextWithFallback('/2025_BS.csv'),
          fetchCsvTextWithFallback('/2026_BS.csv'),
        ]);
        const isLookup = {
          ...buildEntityQuarterLookup(parseCsvText(is24), '2024'),
          ...buildEntityQuarterLookup(parseCsvText(is25), '2025'),
          ...buildEntityQuarterLookup(parseCsvText(is26), '2026'),
        };
        const bsLookup = {
          ...buildEntityQuarterLookup(parseCsvText(bs24), '2024'),
          ...buildEntityQuarterLookup(parseCsvText(bs25), '2025'),
          ...buildEntityQuarterLookup(parseCsvText(bs26), '2026'),
        };
        if (!cancelled) setEntityCsvLookup({ is: isLookup, bs: bsLookup });
      } catch {
        // CSV 직접 로딩 실패 시 기존 데이터 소스 사용
      }
    }
    loadEntityCsvLookup();
    return () => {
      cancelled = true;
    };
  }, []);

  // 모든 설정 변경 시 localStorage 저장 + 서버 자동 저장 (debounce 2초)
  React.useEffect(() => {
    // localStorage에 저장
    if (Object.keys(incomeEditData).length > 0) {
      saveToStorage(STORAGE_KEYS.INCOME_EDIT, incomeEditData);
    }
    if (Object.keys(bsEditData).length > 0) {
      saveToStorage(STORAGE_KEYS.BS_EDIT, bsEditData);
    }
    if (Object.keys(aiAnalysisData).length > 0) {
      saveToStorage(STORAGE_KEYS.AI_ANALYSIS, aiAnalysisData);
    }
    saveToStorage(STORAGE_KEYS.ENTITY_STMT_REASONS, entityStmtReasons);
    saveToStorage(STORAGE_KEYS.IMPAIRMENT, impairmentData);
    localStorage.setItem('fnf_q1_2026_hidden_entity_cards', JSON.stringify(hiddenEntityCards));
    localStorage.setItem('fnf_q1_2026_hidden_detail_sections', JSON.stringify(hiddenDetailSections));
    
    // 초기 로드 시에는 서버 저장 안함
    if (isInitialLoadRef.current) {
      return;
    }
    
    // 서버에 자동 저장 (2초 debounce)
    const timeoutId = setTimeout(() => {
      saveAllSettingsToServer();
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [incomeEditData, bsEditData, aiAnalysisData, entityStmtReasons, hiddenEntityCards, hiddenDetailSections, impairmentData]);

  // 컴포넌트 마운트 시 서버에서 모든 설정 불러오기
  React.useEffect(() => {
    loadAllSettingsFromServer();
  }, []);

  // 서버에서 모든 설정 불러오기
  const loadAllSettingsFromServer = async () => {
    console.log('[Redis Sync] 서버에서 데이터 로드 시작...');
    try {
      const response = await fetch('/api/load-data-q1-2026');
      console.log('[Redis Sync] 로드 응답 상태:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log('[Redis Sync] 로드 결과:', result);
        if (result.success && result.data) {
          const data = result.data;
          console.log('[Redis Sync] 로드된 aiAnalysisData:', data.aiAnalysisData);
          
          // 각 설정 복원
          if (data.aiAnalysisData) {
            setAiAnalysisData(data.aiAnalysisData);
            saveToStorage(STORAGE_KEYS.AI_ANALYSIS, data.aiAnalysisData);
          }
          if (data.incomeEditData) {
            setIncomeEditData(data.incomeEditData);
            saveToStorage(STORAGE_KEYS.INCOME_EDIT, data.incomeEditData);
          }
          if (data.bsEditData) {
            setBsEditData(data.bsEditData);
            saveToStorage(STORAGE_KEYS.BS_EDIT, data.bsEditData);
          }
          if (data.entityStmtReasons) {
            setEntityStmtReasons(data.entityStmtReasons);
            saveToStorage(STORAGE_KEYS.ENTITY_STMT_REASONS, data.entityStmtReasons);
          }
          if (data.hiddenEntityCards) {
            setHiddenEntityCards(data.hiddenEntityCards);
            localStorage.setItem('fnf_q1_2026_hidden_entity_cards', JSON.stringify(data.hiddenEntityCards));
          }
          if (data.hiddenDetailSections) {
            setHiddenDetailSections(data.hiddenDetailSections);
            localStorage.setItem('fnf_q1_2026_hidden_detail_sections', JSON.stringify(data.hiddenDetailSections));
          }
          
          setAiLastUpdated(data.lastUpdated);
          console.log('[Redis Sync] 데이터 로드 완료, lastUpdated:', data.lastUpdated);
        } else {
          console.log('[Redis Sync] 서버에 저장된 데이터 없음 (result.data가 null)');
        }
      } else {
        console.error('[Redis Sync] 로드 실패 응답:', await response.text());
      }
    } catch (error) {
      console.error('[Redis Sync] 서버에서 설정 불러오기 실패:', error);
    } finally {
      // 초기 로드 완료 후 플래그 해제 (약간의 딜레이 후)
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
    }
  };

  // 서버에 모든 설정 저장하기
  const saveAllSettingsToServer = async () => {
    console.log('[Redis Sync] 서버 저장 시작...', { aiAnalysisData, incomeEditData, bsEditData });
    setServerSaveStatus('saving');
    try {
      const allSettings = {
        aiAnalysisData,
        incomeEditData,
        bsEditData,
        entityStmtReasons,
        hiddenEntityCards,
        hiddenDetailSections,
      };
      
      const response = await fetch('/api/save-data-q1-2026', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(allSettings),
      });
      console.log('[Redis Sync] 응답 상태:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log('[Redis Sync] 저장 성공:', result);
        setServerSaveStatus('saved');
        setAiLastUpdated(result.timestamp);
        setTimeout(() => setServerSaveStatus(''), 2000);
      } else {
        const errorText = await response.text();
        console.error('[Redis Sync] 저장 실패:', response.status, errorText);
        setServerSaveStatus('error');
        setTimeout(() => setServerSaveStatus(''), 3000);
      }
    } catch (error) {
      console.error('[Redis Sync] 서버 저장 실패:', error);
      setServerSaveStatus('error');
      setTimeout(() => setServerSaveStatus(''), 3000);
    }
  };

  // 편집 모드 시작할 때 현재 표시 데이터를 aiAnalysisData에 초기화하고 백업 저장
  React.useEffect(() => {
    if (aiEditMode) {
      // 현재 자동 분석 데이터 가져오기
      const autoAnalysis = generateAIAnalysis();
      
      // 현재 표시되는 데이터 결정 (저장된 데이터 또는 자동 분석 데이터)
      const currentData = {
        insights: (aiAnalysisData.insights && aiAnalysisData.insights.length > 0) 
          ? aiAnalysisData.insights 
          : (autoAnalysis?.insights || []),
        risks: (aiAnalysisData.risks && aiAnalysisData.risks.length > 0) 
          ? aiAnalysisData.risks 
          : (autoAnalysis?.risks || []),
        actions: (aiAnalysisData.actions && aiAnalysisData.actions.length > 0) 
          ? aiAnalysisData.actions 
          : (autoAnalysis?.actions || []),
        improvementTargets: (aiAnalysisData.improvementTargets && aiAnalysisData.improvementTargets.length > 0) 
          ? aiAnalysisData.improvementTargets 
          : (autoAnalysis?.improvementTargets || []),
      };
      
      // 백업 저장 (편집 전 상태)
      setAiAnalysisBackup(JSON.parse(JSON.stringify(currentData)));
      
      // 현재 데이터를 aiAnalysisData에 설정 (이후 편집은 이 데이터 기반)
      setAiAnalysisData(currentData);
    }
  }, [aiEditMode]);

  // 서버에서 AI 분석 데이터 불러오기 (전체 설정 불러오기로 대체)
  const loadAiAnalysisFromServer = async () => {
    await loadAllSettingsFromServer();
  };

  // 서버에 AI 분석 데이터 저장하기 (전체 설정 저장으로 대체)
  const saveAiAnalysisToServer = async (data) => {
    setAiSaveStatus('saving');
    await saveAllSettingsToServer();
    setAiSaveStatus('saved');
    setTimeout(() => setAiSaveStatus(''), 2000);
  };

  // AI 분석 항목 업데이트 함수들
  const updateAiInsight = (index, field, value) => {
    setAiAnalysisData(prev => {
      const insights = [...(prev.insights || [])];
      insights[index] = { ...insights[index], [field]: value };
      return { ...prev, insights };
    });
  };

  const updateAiRisk = (index, field, value) => {
    setAiAnalysisData(prev => {
      const risks = [...(prev.risks || [])];
      risks[index] = { ...risks[index], [field]: value };
      return { ...prev, risks };
    });
  };

  const updateAiAction = (index, field, value) => {
    setAiAnalysisData(prev => {
      const actions = [...(prev.actions || [])];
      actions[index] = { ...actions[index], [field]: value };
      return { ...prev, actions };
    });
  };

  const updateAiImprovementTarget = (index, field, value) => {
    setAiAnalysisData(prev => {
      const improvementTargets = [...(prev.improvementTargets || [])];
      improvementTargets[index] = { ...improvementTargets[index], [field]: value };
      return { ...prev, improvementTargets };
    });
  };

  // AI 분석 항목 추가 함수들
  const addAiInsight = () => {
    setAiAnalysisData(prev => ({
      ...prev,
      insights: [...(prev.insights || []), { title: '새 인사이트', desc: '내용을 입력하세요' }]
    }));
  };

  const addAiRisk = () => {
    setAiAnalysisData(prev => ({
      ...prev,
      risks: [...(prev.risks || []), { title: '새 리스크', desc: '내용을 입력하세요' }]
    }));
  };

  const addAiAction = () => {
    setAiAnalysisData(prev => ({
      ...prev,
      actions: [...(prev.actions || []), { title: '새 액션', desc: '내용을 입력하세요' }]
    }));
  };

  const addAiImprovementTarget = () => {
    setAiAnalysisData(prev => ({
      ...prev,
      improvementTargets: [...(prev.improvementTargets || []), { 
        area: '새 개선 타겟', 
        current: '현재 상태', 
        target: '목표', 
        impact: '예상 효과', 
        method: '실행 방안',
        rationale: '목표 근거'
      }]
    }));
  };

  // AI 분석 항목 삭제 함수들
  const removeAiInsight = (index) => {
    setAiAnalysisData(prev => ({
      ...prev,
      insights: (prev.insights || []).filter((_, i) => i !== index)
    }));
  };

  const removeAiRisk = (index) => {
    setAiAnalysisData(prev => ({
      ...prev,
      risks: (prev.risks || []).filter((_, i) => i !== index)
    }));
  };

  const removeAiAction = (index) => {
    setAiAnalysisData(prev => ({
      ...prev,
      actions: (prev.actions || []).filter((_, i) => i !== index)
    }));
  };

  const removeAiImprovementTarget = (index) => {
    setAiAnalysisData(prev => ({
      ...prev,
      improvementTargets: (prev.improvementTargets || []).filter((_, i) => i !== index)
    }));
  };

  // 편집 시작 전 상태로 되돌리기
  const resetAiAnalysisToBackup = () => {
    if (window.confirm('편집 전 상태로 되돌리시겠습니까? 방금 수정한 내용이 취소됩니다.')) {
      if (aiAnalysisBackup) {
        // 자동 저장 방지를 위해 편집 모드를 잠시 끄고 데이터 복원
        setAiEditMode(false);
        setTimeout(() => {
          setAiAnalysisData(JSON.parse(JSON.stringify(aiAnalysisBackup)));
          saveToStorage(STORAGE_KEYS.AI_ANALYSIS, aiAnalysisBackup);
          setAiEditMode(true);
        }, 100);
      }
    }
  };

  // 자동 분석 데이터로 복원
  const resetAiAnalysisToAuto = () => {
    if (window.confirm('자동 분석 데이터로 복원하시겠습니까? 직접 편집한 내용이 모두 삭제됩니다.')) {
      setAiEditMode(false);
      setAiAnalysisData({});
      setAiAnalysisBackup(null);
      localStorage.removeItem(STORAGE_KEYS.AI_ANALYSIS);
    }
  };

  // 법인 카드 숨기기/복원 함수 (viewMode로 분기/누적 분리)
  const hideEntityCard = (accountKey, entity, viewMode = '') => {
    const key = viewMode ? `${accountKey}_${viewMode}` : accountKey;
    setHiddenEntityCards(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), entity]
    }));
  };

  const restoreEntityCard = (accountKey, entity, viewMode = '') => {
    const key = viewMode ? `${accountKey}_${viewMode}` : accountKey;
    setHiddenEntityCards(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(e => e !== entity)
    }));
  };

  const getVisibleEntities = (accountKey, entities, viewMode = '') => {
    const key = viewMode ? `${accountKey}_${viewMode}` : accountKey;
    const hidden = hiddenEntityCards[key] || [];
    return entities.filter(e => !hidden.includes(e.entity));
  };

  const getHiddenEntitiesForAccount = (accountKey, viewMode = '') => {
    const key = viewMode ? `${accountKey}_${viewMode}` : accountKey;
    return hiddenEntityCards[key] || [];
  };

  // 구성 상세 섹션 숨기기/복원 함수
  const hideDetailSection = (accountKey) => {
    setHiddenDetailSections(prev => [...prev, accountKey]);
  };

  const restoreDetailSection = (accountKey) => {
    setHiddenDetailSections(prev => prev.filter(k => k !== accountKey));
  };

  const isDetailSectionHidden = (accountKey) => {
    return hiddenDetailSections.includes(accountKey);
  };

  // 클라우드 동기화 상태
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastSyncTime, setLastSyncTime] = React.useState(null);
  const [syncError, setSyncError] = React.useState(null);

  // 클라우드에서 데이터 불러오기
  const loadFromCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncError(null);
      const response = await fetch('/api/load-data-q1-2026');
      const result = await response.json();
      
      if (result.success && result.data) {
        const data = result.data;
        if (data.incomeEditData) {
          setIncomeEditData(data.incomeEditData);
          saveToStorage(STORAGE_KEYS.INCOME_EDIT, data.incomeEditData);
        }
        if (data.bsEditData) {
          setBsEditData(data.bsEditData);
          saveToStorage(STORAGE_KEYS.BS_EDIT, data.bsEditData);
        }
        if (data.entityStmtReasons) {
          setEntityStmtReasons(data.entityStmtReasons);
          saveToStorage(STORAGE_KEYS.ENTITY_STMT_REASONS, data.entityStmtReasons);
        }
        if (data.hiddenEntityCards) {
          setHiddenEntityCards(data.hiddenEntityCards);
          localStorage.setItem('fnf_q1_2026_hidden_entity_cards', JSON.stringify(data.hiddenEntityCards));
        }
        if (data.hiddenDetailSections) {
          setHiddenDetailSections(data.hiddenDetailSections);
          localStorage.setItem('fnf_q1_2026_hidden_detail_sections', JSON.stringify(data.hiddenDetailSections));
        }
        setLastSyncTime(data.lastUpdated || new Date().toISOString());
        return true;
      }
      return false;
    } catch (error) {
      console.error('Cloud load error:', error);
      setSyncError('클라우드 데이터 불러오기 실패');
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // 클라우드에 데이터 저장
  const saveToCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncError(null);
      const exportData = {
        version: '1.1',
        incomeEditData,
        bsEditData,
        entityStmtReasons,
        hiddenEntityCards,
        hiddenDetailSections,
      };
      
      const response = await fetch('/api/save-data-q1-2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData),
      });
      
      const result = await response.json();
      if (result.success) {
        setLastSyncTime(result.timestamp);
        return true;
      }
      throw new Error(result.error || 'Save failed');
    } catch (error) {
      console.error('Cloud save error:', error);
      setSyncError('클라우드 저장 실패');
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // 앱 시작 시 클라우드에서 데이터 불러오기 + 30초마다 자동 동기화
  React.useEffect(() => {
    loadFromCloud();
    
    // 30초마다 다른 사용자의 변경사항 자동 동기화
    const syncInterval = setInterval(() => {
      loadFromCloud();
    }, 30000); // 30초
    
    return () => clearInterval(syncInterval);
  }, []);

  // 편집 데이터 변경 시 자동 저장 (debounce 1초)
  const saveTimeoutRef = React.useRef(null);
  
  React.useEffect(() => {
    // 초기 로드 시에는 저장하지 않음 (isInitialLoadRef는 상단에서 선언됨)
    if (isInitialLoadRef.current) {
      return;
    }
    
    // 이전 타이머 취소
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // 1초 후 자동 저장
    saveTimeoutRef.current = setTimeout(() => {
      saveToCloud();
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [incomeEditData, bsEditData, aiAnalysisData, entityStmtReasons, hiddenEntityCards, hiddenDetailSections]);

  // JSON 내보내기 함수 (로컬 파일)
  const exportEditData = () => {
    const exportData = {
      version: '1.1',
      exportDate: new Date().toISOString(),
      incomeEditData,
      bsEditData,
      entityStmtReasons,
      hiddenEntityCards,
      hiddenDetailSections,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_analysis_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // JSON 가져오기 함수
  const importEditData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result);
        if (data.incomeEditData) {
          setIncomeEditData(data.incomeEditData);
          saveToStorage(STORAGE_KEYS.INCOME_EDIT, data.incomeEditData);
        }
        if (data.bsEditData) {
          setBsEditData(data.bsEditData);
          saveToStorage(STORAGE_KEYS.BS_EDIT, data.bsEditData);
        }
        if (data.entityStmtReasons) {
          setEntityStmtReasons(data.entityStmtReasons);
          saveToStorage(STORAGE_KEYS.ENTITY_STMT_REASONS, data.entityStmtReasons);
        }
        if (data.hiddenEntityCards) {
          setHiddenEntityCards(data.hiddenEntityCards);
          localStorage.setItem('fnf_q1_2026_hidden_entity_cards', JSON.stringify(data.hiddenEntityCards));
        }
        if (data.hiddenDetailSections) {
          setHiddenDetailSections(data.hiddenDetailSections);
          localStorage.setItem('fnf_q1_2026_hidden_detail_sections', JSON.stringify(data.hiddenDetailSections));
        }
        alert('분석 데이터를 성공적으로 불러왔습니다.');
      } catch (err) {
        alert('파일 형식이 올바르지 않습니다.');
        console.error('Import error:', err);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // 같은 파일 다시 선택 가능하도록
  };

  // 편집 데이터 초기화 함수
  const resetEditData = (type) => {
    if (type === 'income') {
      setIncomeEditData({});
      localStorage.removeItem(STORAGE_KEYS.INCOME_EDIT);
    } else if (type === 'bs') {
      setBsEditData({});
      localStorage.removeItem(STORAGE_KEYS.BS_EDIT);
    } else {
      setIncomeEditData({});
      setBsEditData({});
      localStorage.removeItem(STORAGE_KEYS.INCOME_EDIT);
      localStorage.removeItem(STORAGE_KEYS.BS_EDIT);
    }
  };
  
  // 법인 표시 순서 고정
  const ENTITY_ORDER = ['OC(국내)', '중국', '홍콩', 'ST미국', '기타(연결조정)'];
  const [bsCompareMode, setBsCompareMode] = useState('prevYearEnd'); // 'sameQuarter' (동분기) | 'prevYearEnd' (전기말)

  // ============================================
  // 기간 매핑 함수
  // ============================================
  const getPeriodKey = (selectedPeriod, type) => {
    // selectedPeriod: '2025_Q1', '2025_Q2', '2025_Q3', '2025_Q4'
    // type: 'quarter' (분기), 'year' (누적), 'prev_quarter' (전년 동 분기), 'prev_year' (전년 동기 누적), 'prev' (전 분기)
    const [year, quarter] = selectedPeriod.split('_');
    const yearNum = parseInt(year);
    const quarterNum = quarter.replace('Q', '');
    
    if (type === 'quarter') {
      return `${year}_${quarterNum}Q`;
    } else if (type === 'year') {
      // 누적: Q4는 '2025_Year', Q1~Q3는 '2025_1Q_Year' 형식
      if (quarterNum === '4') {
        return `${year}_Year`;
      }
      return `${year}_${quarterNum}Q_Year`;
    } else if (type === 'prev_quarter') {
      const prevYear = (yearNum - 1).toString();
      return `${prevYear}_${quarterNum}Q`;
    } else if (type === 'prev_year') {
      const prevYear = (yearNum - 1).toString();
      // 전년 동기 누적: Q4는 '2024_Year', Q1~Q3는 '2024_1Q_Year' 형식
      if (quarterNum === '4') {
        return `${prevYear}_Year`;
      }
      return `${prevYear}_${quarterNum}Q_Year`;
    } else if (type === 'prev') {
      // 전 분기: Q1이면 전년 Q4, 그 외는 같은 해 전 분기
      if (quarterNum === '1') {
        const prevYear = (yearNum - 1).toString();
        return `${prevYear}_4Q`;
      } else {
        const prevQuarter = (parseInt(quarterNum) - 1).toString();
        return `${year}_${prevQuarter}Q`;
      }
    }
    return `${year}_4Q`; // 기본값
  };

  const getPeriodLabel = (selectedPeriod) => selectedPeriod.replace('_', ' ');

  // ============================================
  // 재무상태표 조회 기준(컴포넌트 전역)
  // - 동분기: 전년 동분기 비교 (예: 2024.3Q vs 2025.3Q)
  // - 전기말: 전년 기말 비교 (예: 2024.4Q vs 2025.3Q)
  // ============================================
  const bsCurrentPeriod = getPeriodKey(selectedPeriod, 'quarter'); // 선택된 분기 기말
  // bsCompareMode에 따라 비교 기간 결정
  const prevYear = String(Number(selectedPeriod?.split('_')?.[0] || '2026') - 1);
  const bsPrevPeriod = bsCompareMode === 'sameQuarter' 
    ? getPeriodKey(selectedPeriod, 'prev_quarter') // 전년 동분기 (예: 2024_3Q)
    : `${prevYear}_4Q`; // 전기말 (선택년도 기준 전년 기말)
  
  // 비교 기간 라벨 생성 (UI 표시용)
  const getBsPeriodLabel = (period) => {
    if (!period) return '';
    const [year, q] = period.split('_');
    return `${year}.${q}`;
  };

    // ============================================
  // 손익계산서 데이터 - 분기(3개월) + 누적(연간) 통합 (CSV 기반)
  // ============================================
  const yearCloneRules = useMemo(() => ({
    '2024': { quarters: [1, 2, 3, 4], includeYear: true },
    '2026': { quarters: availableQuarters2026, includeYear: availableQuarters2026.includes(4) },
  }), [availableQuarters2026]);

  const incomeStatementDataBase = normalizeYearDataset({
    // 2024년 분기 (3개월)
    '2024_1Q': {
      매출액: 507029,
      매출원가: 174545,
      매출총이익: 332484,
      판매비와관리비: 202273,
      인건비: 19658,
      광고선전비: 24097,
      수수료: 118770,
      감가상각비: 20565,
      기타판관비: 19183,
      영업이익: 130211,
      영업외손익: -1250,
      외환손익: 2526,
      선물환손익: 209,
      금융상품손익: -1673,
      이자손익: -1072,
      배당수익: 62,
      기타손익: -1208,
      지분법손익: -803,
      기부금: -94,
      법인세비용차감전순이익: 128159,
      법인세비용: 31837,
      당기순이익: 96322,
    },
    '2024_2Q': {
      매출액: 391473,
      매출원가: 120174,
      매출총이익: 271299,
      판매비와관리비: 179497,
      인건비: 22002,
      광고선전비: 16955,
      수수료: 102336,
      감가상각비: 21537,
      기타판관비: 16667,
      영업이익: 91802,
      영업외손익: 6955,
      외환손익: 2636,
      선물환손익: 243,
      금융상품손익: 3492,
      이자손익: -948,
      배당수익: 2144,
      기타손익: -203,
      지분법손익: -800,
      기부금: -409,
      법인세비용차감전순이익: 97956,
      법인세용: 24005,
      법인세비용: 24005,
      당기순이익: 73951,
    },
    '2024_3Q': {
      매출액: 450963,
      매출원가: 166042,
      매출총이익: 284921,
      판매비와관리비: 176618,
      인건비: 19926,
      광고선전비: 19902,
      수수료: 96464,
      감가상각비: 23267,
      기타판관비: 17059,
      영업이익: 108303,
      영업외손익: -10447,
      외환손익: -3394,
      선물환손익: -358,
      금융상품손익: -2518,
      이자손익: -966,
      배당수익: 1088,
      기타손익: -2389,
      지분법손익: 11982,
      기부금: -1910,
      법인세비용차감전순이익: 109840,
      법인세비용: 30039,
      당기순이익: 79801,
    },
    '2024_4Q': {
      매출액: 546545,
      매출원가: 188255,
      매출총이익: 358290,
      판매비와관리비: 237871,
      인건비: 22685,
      광고선전비: 32179,
      수수료: 135912,
      감가상각비: 23440,
      기타판관비: 23655,
      영업이익: 120419,
      영업외손익: 3273,
      외환손익: 7220,
      선물환손익: 277,
      금융상품손익: 1127,
      이자손익: -2088,
      배당수익: -271,
      기타손익: -2166,
      지분법손익: 17653,
      기부금: -826,
      법인세비용차감전순이익: 141346,
      법인세비용: 35461,
      당기순이익: 105885,
    },

    // 2024년 누적
    '2024_1Q_Year': {
      매출액: 507029,
      매출원가: 174545,
      매출총이익: 332484,
      판매비와관리비: 202273,
      인건비: 19658,
      광고선전비: 24097,
      수수료: 118770,
      감가상각비: 20565,
      기타판관비: 19183,
      영업이익: 130211,
      영업외손익: -1250,
      외환손익: 2526,
      선물환손익: 209,
      금융상품손익: -1673,
      이자손익: -1072,
      배당수익: 62,
      기타손익: -1208,
      지분법손익: -803,
      기부금: -94,
      법인세비용차감전순이익: 128159,
      법인세비용: 31837,
      당기순이익: 96322,
    },
    '2024_2Q_Year': {
      매출액: 898501,
      매출원가: 294720,
      매출총이익: 603781,
      판매비와관리비: 381771,
      인건비: 41660,
      광고선전비: 41052,
      수수료: 221107,
      감가상각비: 42103,
      기타판관비: 35849,
      영업이익: 222010,
      영업외손익: 5705,
      외환손익: 5161,
      선물환손익: 452,
      금융상품손익: 1819,
      이자손익: -2021,
      배당수익: 2207,
      기타손익: -1410,
      지분법손익: -1603,
      기부금: -503,
      법인세비용차감전순이익: 226115,
      법인세비용: 55842,
      당기순이익: 170273,
    },
    '2024_3Q_Year': {
      매출액: 1349465,
      매출원가: 460761,
      매출총이익: 888704,
      판매비와관리비: 558386,
      인건비: 61585,
      광고선전비: 60954,
      수수료: 317570,
      감가상각비: 65370,
      기타판관비: 52907,
      영업이익: 330318,
      영업외손익: -4741,
      외환손익: 1768,
      선물환손익: 92,
      금융상품손익: -699,
      이자손익: -2986,
      배당수익: 3295,
      기타손익: -3798,
      지분법손익: 10379,
      기부금: -2413,
      법인세비용차감전순이익: 335955,
      법인세비용: 85881,
      당기순이익: 250074,
    },
    '2024_Year': {
      매출액: 1896010,
      매출원가: 649017,
      매출총이익: 1246993,
      판매비와관리비: 796256,
      인건비: 84270,
      광고선전비: 93133,
      수수료: 453482,
      감가상각비: 88809,
      기타판관비: 76562,
      영업이익: 450737,
      영업외손익: -1468,
      외환손익: 8989,
      선물환손익: 369,
      금융상품손익: 428,
      이자손익: -5074,
      배당수익: 3024,
      기타손익: -5965,
      지분법손익: 28032,
      기부금: -3239,
      법인세비용차감전순이익: 477301,
      법인세비용: 121341,
      당기순이익: 355960,
    },

    // 2025년 분기 (3개월)
    '2025_1Q': {
      매출액: 505617,
      매출원가: 175882,
      매출총이익: 329735,
      판매비와관리비: 206117,
      인건비: 21638,
      광고선전비: 24609,
      수수료: 114788,
      감가상각비: 24508,
      기타판관비: 20574,
      영업이익: 123618,
      영업외손익: -12187,
      외환손익: -3303,
      선물환손익: -3333,
      금융상품손익: -811,
      이자손익: -2332,
      배당수익: 337,
      기타손익: -2740,
      지분법손익: -766,
      기부금: -5,
      법인세비용차감전순이익: 110663,
      법인세비용: 28094,
      당기순이익: 82569,
    },
    '2025_2Q': {
      매출액: 378870,
      매출원가: 119965,
      매출총이익: 258905,
      판매비와관리비: 174878,
      인건비: 20875,
      광고선전비: 19539,
      수수료: 95162,
      감가상각비: 22116,
      기타판관비: 17186,
      영업이익: 84027,
      영업외손익: 2881,
      외환손익: -3530,
      선물환손익: 11729,
      금융상품손익: 46,
      이자손익: -2058,
      배당수익: 37,
      기타손익: -3343,
      지분법손익: -828,
      기부금: 0,
      법인세비용차감전순이익: 86083,
      법인세비용: 23444,
      당기순이익: 62639,
    },
    '2025_3Q': {
      매출액: 474257,
      매출원가: 165303,
      매출총이익: 308954,
      판매비와관리비: 180936,
      인건비: 20266,
      광고선전비: 25032,
      수수료: 93907,
      감가상각비: 22262,
      기타판관비: 19469,
      영업이익: 128018,
      영업외손익: -4729,
      외환손익: 5851,
      선물환손익: -5573,
      금융상품손익: -500,
      이자손익: -1650,
      배당수익: 482,
      기타손익: -3261,
      지분법손익: 11987,
      기부금: -78,
      법인세비용차감전순이익: 135278,
      법인세비용: 34583,
      당기순이익: 100695,
    },

    // 2025년 누적
    '2025_1Q_Year': {
      매출액: 505617,
      매출원가: 175882,
      매출총이익: 329735,
      판매비와관리비: 206117,
      인건비: 21638,
      광고선전비: 24609,
      수수료: 114788,
      감가상각비: 24508,
      기타판관비: 20574,
      영업이익: 123618,
      영업외손익: -12187,
      외환손익: -3303,
      선물환손익: -3333,
      금융상품손익: -811,
      이자손익: -2332,
      배당수익: 337,
      기타손익: -2740,
      지분법손익: -766,
      기부금: -5,
      법인세비용차감전순이익: 110663,
      법인세비용: 28094,
      당기순이익: 82569,
    },
    '2025_2Q_Year': {
      매출액: 884487,
      매출원가: 295848,
      매출총이익: 588639,
      판매비와관리비: 380996,
      인건비: 42515,
      광고선전비: 44148,
      수수료: 209951,
      감가상각비: 46623,
      기타판관비: 37759,
      영업이익: 207643,
      영업외손익: -9306,
      외환손익: -6833,
      선물환손익: 8395,
      금융상품손익: -765,
      이자손익: -4391,
      배당수익: 373,
      기타손익: -6080,
      지분법손익: -1594,
      기부금: -5,
      법인세비용차감전순이익: 196746,
      법인세비용: 51538,
      당기순이익: 145208,
    },
    '2025_3Q_Year': {
      매출액: 1358744,
      매출원가: 461149,
      매출총이익: 897595,
      판매비와관리비: 561928,
      인건비: 62780,
      광고선전비: 69180,
      수수료: 303857,
      감가상각비: 68886,
      기타판관비: 57225,
      영업이익: 335667,
      영업외손익: -14035,
      외환손익: -982,
      선물환손익: 2820,
      금융상품손익: -1264,
      이자손익: -6040,
      배당수익: 855,
      기타손익: -9341,
      지분법손익: 10393,
      기부금: -83,
      법인세비용차감전순이익: 332024,
      법인세비용: 86121,
      당기순이익: 245903,
    },
    '2025_3Q_Year_old': {
      매출액: 1358744,
      매출원가: 461149,
      매출총이익: 897595,
      판매비와관리비: 561928,
      인건비: 62780,
      광고선전비: 69180,
      수수료: 303857,
      감가상각비: 68886,
      기타판관비: 57225,
      영업이익: 335667,
      영업외손익: 87398,
      외환손익: 41588,
      선물환손익: 3700,
      금융상품손익: 1752,
      이자손익: 10856,
      배당수익: 855,
      기타손익: 17854,
      지분법손익: 10711,
      기부금: -83,
      법인세비용차감전순이익: 332024,
      법인세비용: 86121,
      당기순이익: 245903,
    },

    // 2025년 4분기 (당분기, 3개월) - 2025_IS.csv 기반
    '2025_4Q': {
      매출액: 575252,        // 2025_IS.csv 25.4Q qCol=64
      매출원가: 181037,      // 2025_IS.csv 25.4Q qCol=64
      매출총이익: 394214,    // 2025_IS.csv 25.4Q qCol=64
      판매비와관리비: 261306, // 2025_IS.csv 25.4Q qCol=64
      인건비: 22031,         // 급여 20,948 + 퇴직급여 1,083
      광고선전비: 39905,     // 2025_IS.csv 25.4Q qCol=64
      수수료: 154987,        // 운반비 8,094 + 지급수수료 146,893
      감가상각비: 22962,     // 감가상각비 19,312 + 무형자산상각비 3,650
      기타판관비: 21421,     // 261,306 - 22,031 - 39,905 - 154,987 - 22,962
      영업이익: 132908,      // 2025_IS.csv 25.4Q qCol=64
      영업외손익: -2564,     // PBT(209,814) - OI(132,908) - 지분법(79,470)
      외환손익: 4849,        // (외환차익 8,393+외화환산이익 1,447)-(외환차손 4,060+외화환산손실 931)
      선물환손익: -4172,     // 파생상품 관련
      금융상품손익: 200,     // 금융상품평가손익
      이자손익: -1807,       // 이자수익 1,420 - 이자비용 3,227
      배당수익: 100,         // 배당금수익
      기타손익: -1736,       // 영업외손익 - 외환손익 - 선물환손익 - 금융상품손익 - 이자손익 - 배당수익 - 기부금
      지분법손익: 79470,     // 2025_IS.csv 지분법이익 25.4Q
      기부금: 19,            // 기부금
      법인세비용차감전순이익: 209814, // 2025_IS.csv 25.4Q qCol=64
      법인세비용: 55030,     // 2025_IS.csv 25.4Q qCol=64
      당기순이익: 154783,    // 2025_IS.csv 25.4Q qCol=64
    },

    // 2025년 연간 누적 (4분기까지 포함) - 2025_IS.csv 연간누적 기반
    '2025_Year': {
      매출액: 1933996,       // 2025_IS.csv yCol=62
      매출원가: 642187,      // 2025_IS.csv yCol=62
      매출총이익: 1291809,   // 2025_IS.csv yCol=62
      판매비와관리비: 823235, // 2025_IS.csv yCol=62
      인건비: 84811,         // 급여 80,199 + 퇴직급여 4,612
      광고선전비: 109084,    // 2025_IS.csv yCol=62
      수수료: 458844,        // 운반비 24,855 + 지급수수료 433,989
      감가상각비: 91847,     // 감가상각비 77,445 + 무형자산상각비 14,402
      기타판관비: 78649,     // 823,235 - 84,811 - 109,084 - 458,844 - 91,847
      영업이익: 468574,      // 2025_IS.csv yCol=62
      영업외손익: -16758,    // PBT(541,838) - OI(468,574) - 지분법(90,022)
      외환손익: 3867,        // (외환차익 26,666+외화환산이익 3,477)-(외환차손 22,538+외화환산손실 3,738)
      선물환손익: -1352,     // 파생상품평가/거래손익
      금융상품손익: -1064,   // 당기손익-공정가치측정금융자산 평가/처분손익
      이자손익: -7847,       // 이자수익 3,828 - 이자비용 11,675
      배당수익: 955,         // 배당금수익
      기타손익: -11317,      // 영업외손익 - 합계
      지분법손익: 90022,     // 2025_IS.csv 지분법이익 yCol=62
      기부금: -64,           // 기부금
      법인세비용차감전순이익: 541838, // 2025_IS.csv yCol=62
      법인세비용: 141151,    // 2025_IS.csv yCol=62
      당기순이익: 400686,    // 2025_IS.csv yCol=62
    },
  }, '2025', yearCloneRules);
  const incomeStatementData = useMemo(
    () => mergePeriodMetrics(incomeStatementDataBase, consolidatedCsvOverride.income),
    [consolidatedCsvOverride.income]
  );

  // ============================================
  // 손익계산서 세부 계정 데이터 (증감 분석용) - financial_detail_data.json 기반
  // ============================================
  const incomeDetailData = normalizeYearDataset({
    '2024_1Q_Year': { 매출액: 507029, 제품매출: 165016, 상품매출: 5934, 수수료매출: 360, 임대매출: 68, 기타매출: 3595, 매출원가: 174545, 매출총이익: 332484, 판매비와관리비: 202273, 급여: 18472, 퇴직급여: 1186, 복리후생비: 3796, 광고선전비: 24097, 운반비: 6120, 지급수수료: 112650, 감가상각비: 18718, 무형자산상각비: 1847, 영업이익: 130211 },
    '2024_1Q': { 매출액: 507029, 제품매출: 165016, 상품매출: 5934, 수수료매출: 360, 임대매출: 68, 기타매출: 3595, 매출원가: 174545, 매출총이익: 332484, 판매비와관리비: 202273, 급여: 18472, 퇴직급여: 1186, 복리후생비: 3796, 광고선전비: 24097, 운반비: 6120, 지급수수료: 112650, 감가상각비: 18718, 무형자산상각비: 1847, 영업이익: 130211 },
    '2024_2Q_Year': { 매출액: 898502, 제품매출: 278476, 상품매출: 8382, 수수료매출: 716, 임대매출: 138, 기타매출: 7862, 매출원가: 294719, 매출총이익: 603782, 판매비와관리비: 381770, 급여: 39262, 퇴직급여: 2398, 복리후생비: 7263, 광고선전비: 41052, 운반비: 9961, 지급수수료: 211146, 감가상각비: 38092, 무형자산상각비: 4011, 영업이익: 222012 },
    '2024_2Q': { 매출액: 391473, 제품매출: 113459, 상품매출: 2448, 수수료매출: 356, 임대매출: 70, 기타매출: 4267, 매출원가: 120174, 매출총이익: 271299, 판매비와관리비: 179497, 급여: 20790, 퇴직급여: 1212, 복리후생비: 3467, 광고선전비: 16955, 운반비: 3840, 지급수수료: 98496, 감가상각비: 19373, 무형자산상각비: 2164, 영업이익: 91801 },
    '2024_3Q_Year': { 매출액: 1349465, 제품매출: 427107, 상품매출: 10931, 수수료매출: 1018, 임대매출: 208, 기타매출: 22723, 매출원가: 460761, 매출총이익: 888704, 판매비와관리비: 558387, 급여: 58004, 퇴직급여: 3581, 복리후생비: 11135, 광고선전비: 60954, 운반비: 15655, 지급수수료: 301915, 감가상각비: 57437, 무형자산상각비: 7933, 영업이익: 330317 },
    '2024_3Q': { 매출액: 450963, 제품매출: 148632, 상품매출: 2549, 수수료매출: 302, 임대매출: 70, 기타매출: 14861, 매출원가: 166042, 매출총이익: 284921, 판매비와관리비: 176616, 급여: 18742, 퇴직급여: 1184, 복리후생비: 3872, 광고선전비: 19902, 운반비: 5695, 지급수수료: 90769, 감가상각비: 19346, 무형자산상각비: 3921, 영업이익: 108305 },
    '2024_4Q_Year': { 매출액: 1896010, 제품매출: 602266, 상품매출: 15361, 수수료매출: 1475, 임대매출: 278, 기타매출: 31390, 매출원가: 649017, 매출총이익: 1246993, 판매비와관리비: 796255, 급여: 79511, 퇴직급여: 4759, 복리후생비: 15120, 광고선전비: 93133, 운반비: 22114, 지급수수료: 431368, 감가상각비: 77149, 무형자산상각비: 11660, 영업이익: 450737 },
    '2024_4Q': { 매출액: 546544, 제품매출: 175158, 상품매출: 4430, 수수료매출: 458, 임대매출: 70, 기타매출: 8667, 매출원가: 188256, 매출총이익: 358289, 판매비와관리비: 237868, 급여: 21507, 퇴직급여: 1178, 복리후생비: 3985, 광고선전비: 32179, 운반비: 6459, 지급수수료: 129453, 감가상각비: 19712, 무형자산상각비: 3728, 영업이익: 120420 },
    '2024_Year': { 매출액: 1896010, 제품매출: 602266, 상품매출: 15361, 수수료매출: 1475, 임대매출: 278, 기타매출: 31390, 매출원가: 649017, 매출총이익: 1246993, 판매비와관리비: 796255, 급여: 79511, 퇴직급여: 4759, 복리후생비: 15120, 광고선전비: 93133, 운반비: 22114, 지급수수료: 431368, 감가상각비: 77149, 무형자산상각비: 11660, 영업이익: 450737 },
    '2025_1Q_Year': { 매출액: 505616, 제품매출: 170204, 상품매출: 3836, 수수료매출: 324, 임대매출: 71, 기타매출: 1842, 매출원가: 175883, 매출총이익: 329733, 판매비와관리비: 206117, 급여: 20176, 퇴직급여: 1462, 복리후생비: 4424, 광고선전비: 24609, 운반비: 5928, 지급수수료: 108860, 감가상각비: 20870, 무형자산상각비: 3638, 영업이익: 123616 },
    '2025_1Q': { 매출액: 505616, 제품매출: 170204, 상품매출: 3836, 수수료매출: 324, 임대매출: 71, 기타매출: 1842, 매출원가: 175883, 매출총이익: 329733, 판매비와관리비: 206117, 급여: 20176, 퇴직급여: 1462, 복리후생비: 4424, 광고선전비: 24609, 운반비: 5928, 지급수수료: 108860, 감가상각비: 20870, 무형자산상각비: 3638, 영업이익: 123616 },
    '2025_2Q_Year': { 매출액: 884487, 제품매출: 284912, 상품매출: 6144, 수수료매출: 593, 임대매출: 449, 기타매출: 4560, 매출원가: 295847, 매출총이익: 588640, 판매비와관리비: 380993, 급여: 39940, 퇴직급여: 2575, 복리후생비: 8368, 광고선전비: 44148, 운반비: 10444, 지급수수료: 199507, 감가상각비: 39444, 무형자산상각비: 7179, 영업이익: 207646 },
    '2025_2Q': { 매출액: 378871, 제품매출: 114708, 상품매출: 2308, 수수료매출: 268, 임대매출: 378, 기타매출: 2717, 매출원가: 119964, 매출총이익: 258906, 판매비와관리비: 174877, 급여: 19763, 퇴직급여: 1112, 복리후생비: 3944, 광고선전비: 19539, 운반비: 4516, 지급수수료: 90646, 감가상각비: 18574, 무형자산상각비: 3542, 영업이익: 84030 },
    '2025_3Q_Year': { 매출액: 1358744, 제품매출: 441007, 상품매출: 9784, 수수료매출: 811, 임대매출: 1013, 기타매출: 9948, 매출원가: 461150, 매출총이익: 897594, 판매비와관리비: 561928, 급여: 59251, 퇴직급여: 3529, 복리후생비: 12092, 광고선전비: 69180, 운반비: 16761, 지급수수료: 287096, 감가상각비: 58133, 무형자산상각비: 10753, 영업이익: 335666 },
    '2025_3Q': { 매출액: 474257, 제품매출: 156095, 상품매출: 3640, 수수료매출: 218, 임대매출: 564, 기타매출: 5389, 매출원가: 165303, 매출총이익: 308955, 판매비와관리비: 180935, 급여: 19311, 퇴직급여: 955, 복리후생비: 3725, 광고선전비: 25032, 운반비: 6317, 지급수수료: 87590, 감가상각비: 18689, 무형자산상각비: 3573, 영업이익: 128020 },
    '2025_4Q_Year': { 매출액: 1933996, 제품매출: 610308, 상품매출: 15937, 수수료매출: 1160, 임대매출: 1731, 기타매출: 15333, 매출원가: 642187, 매출총이익: 1291809, 판매비와관리비: 823235, 급여: 80199, 퇴직급여: 4612, 복리후생비: 16516, 광고선전비: 109084, 운반비: 24855, 지급수수료: 433989, 감가상각비: 77445, 무형자산상각비: 14402, 영업이익: 468574 },
    '2025_4Q': { 매출액: 575252, 제품매출: 169301, 상품매출: 6153, 수수료매출: 349, 임대매출: 718, 기타매출: 5385, 매출원가: 181037, 매출총이익: 394214, 판매비와관리비: 261306, 급여: 20948, 퇴직급여: 1083, 복리후생비: 4423, 광고선전비: 39905, 운반비: 8094, 지급수수료: 146893, 감가상각비: 19312, 무형자산상각비: 3650, 영업이익: 132908 },
    '2025_Year': { 매출액: 1933996, 제품매출: 610308, 상품매출: 15937, 수수료매출: 1160, 임대매출: 1731, 기타매출: 15333, 매출원가: 642187, 매출총이익: 1291809, 판매비와관리비: 823235, 급여: 80199, 퇴직급여: 4612, 복리후생비: 16516, 광고선전비: 109084, 운반비: 24855, 지급수수료: 433989, 감가상각비: 77445, 무형자산상각비: 14402, 영업이익: 468574 },
  }, '2025', yearCloneRules);

  // ============================================
  // 법인별 세부 계정 데이터 (증감 분석용) - financial_detail_data.json 기반
  // ============================================
  const entityDetailData = normalizeYearDataset({
    '매출액': {
      '2024_1Q': { 'OC(국내)': 388852, '중국': 238976, '홍콩': 22211, '베트남': 66, '빅텐츠': 212, '엔터테인먼트': 416, 'ST미국': 9208 },
      '2024_1Q_Year': { 'OC(국내)': 388852, '중국': 238976, '홍콩': 22211, '베트남': 66, '빅텐츠': 212, '엔터테인먼트': 416, 'ST미국': 9208 },
      '2024_2Q': { 'OC(국내)': 664484, '중국': 393520, '홍콩': 39176, '베트남': 150, '빅텐츠': 900, '엔터테인먼트': 1424, 'ST미국': 18600 },
      '2024_2Q_Year': { 'OC(국내)': 664484, '중국': 393520, '홍콩': 39176, '베트남': 150, '빅텐츠': 900, '엔터테인먼트': 1424, 'ST미국': 18600 },
      '2024_3Q': { 'OC(국내)': 1081765, '중국': 643675, '홍콩': 54736, '베트남': 259, '빅텐츠': 9175, '엔터테인먼트': 2203, 'ST미국': 26856 },
      '2024_3Q_Year': { 'OC(국내)': 1081765, '중국': 643675, '홍콩': 54736, '베트남': 259, '빅텐츠': 9175, '엔터테인먼트': 2203, 'ST미국': 26856 },
      '2024_4Q': { 'OC(국내)': 1517994, '중국': 857840, '홍콩': 75035, '베트남': 413, '빅텐츠': 9175, '엔터테인먼트': 3030, 'ST미국': 37069 },
      '2024_4Q_Year': { 'OC(국내)': 1517994, '중국': 857840, '홍콩': 75035, '베트남': 413, '빅텐츠': 9175, '엔터테인먼트': 3030, 'ST미국': 37069 },
      '2024_Year': { 'OC(국내)': 1517994, '중국': 857840, '홍콩': 75035, '베트남': 413, '빅텐츠': 9175, '엔터테인먼트': 3030, 'ST미국': 37069 },
      '2025_1Q': { 'OC(국내)': 396770, '중국': 258540, '홍콩': 20663, '베트남': 134, '빅텐츠': 0, '엔터테인먼트': 761, 'ST미국': 8505 },
      '2025_1Q_Year': { 'OC(국내)': 396770, '중국': 258540, '홍콩': 20663, '베트남': 134, '빅텐츠': 0, '엔터테인먼트': 761, 'ST미국': 8505 },
      '2025_2Q': { 'OC(국내)': 704163, '중국': 429243, '홍콩': 36405, '베트남': 287, '빅텐츠': 0, '엔터테인먼트': 1894, 'ST미국': 17474 },
      '2025_2Q_Year': { 'OC(국내)': 704163, '중국': 429243, '홍콩': 36405, '베트남': 287, '빅텐츠': 0, '엔터테인먼트': 1894, 'ST미국': 17474 },
      '2025_3Q': { 'OC(국내)': 1214834, '중국': 713162, '홍콩': 53313, '베트남': 425, '빅텐츠': 0, '엔터테인먼트': 4630, 'ST미국': 33406 },
      '2025_3Q_Year': { 'OC(국내)': 1214834, '중국': 713162, '홍콩': 53313, '베트남': 425, '빅텐츠': 0, '엔터테인먼트': 4630, 'ST미국': 33406 },
      '2025_4Q': { 'OC(국내)': 1694696, '중국': 960334, '홍콩': 76275, '베트남': 656, '빅텐츠': 0, '엔터테인먼트': 7161, 'ST미국': 48561 },
      '2025_4Q_Year': { 'OC(국내)': 1694696, '중국': 960334, '홍콩': 76275, '베트남': 656, '빅텐츠': 0, '엔터테인먼트': 7161, 'ST미국': 48561 },
      '2025_Year': { 'OC(국내)': 1694696, '중국': 960334, '홍콩': 76275, '베트남': 656, '빅텐츠': 0, '엔터테인먼트': 7161, 'ST미국': 48561 },
    },
    '제품매출': {
      '2024_1Q': { 'OC(국내)': 142846, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 0 },
      '2024_Year': { 'OC(국내)': 533273, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 0 },
      '2025_1Q': { 'OC(국내)': 142911, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 0 },
      '2025_Year': { 'OC(국내)': 613289, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 0 },
    },
    '상품매출': {
      '2024_1Q': { 'OC(국내)': 4011, '중국': 173679, '홍콩': 9231, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 1923 },
      '2024_Year': { 'OC(국내)': 6887, '중국': 664166, '홍콩': 32067, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 8474 },
      '2025_1Q': { 'OC(국내)': 1593, '중국': 203778, '홍콩': 9671, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 2243 },
      '2025_Year': { 'OC(국내)': 3210, '중국': 731265, '홍콩': 34810, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 12727 },
    },
    '급여': {
      '2024_1Q': { 'OC(국내)': 8781, '중국': 6513, '홍콩': 1928, '베트남': 0, '빅텐츠': 181, '엔터테인먼트': 312, 'ST미국': 706 },
      '2024_Year': { 'OC(국내)': 39082, '중국': 26130, '홍콩': 7811, '베트남': 0, '빅텐츠': 587, '엔터테인먼트': 1419, 'ST미국': 4165 },
      '2025_1Q': { 'OC(국내)': 8629, '중국': 7851, '홍콩': 2109, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 391, 'ST미국': 1089 },
      '2025_Year': { 'OC(국내)': 36167, '중국': 28888, '홍콩': 8945, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 1684, 'ST미국': 3961 },
    },
    '퇴직급여': {
      '2024_1Q': { 'OC(국내)': 1156, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 14, '엔터테인먼트': 16, 'ST미국': 0 },
      '2024_Year': { 'OC(국내)': 4610, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 52, '엔터테인먼트': 97, 'ST미국': 0 },
      '2025_1Q': { 'OC(국내)': 1127, '중국': 0, '홍콩': 301, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 35, 'ST미국': 0 },
      '2025_Year': { 'OC(국내)': 4360, '중국': 0, '홍콩': 0, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 252, 'ST미국': 0 },
    },
    '광고선전비': {
      '2024_1Q': { 'OC(국내)': 10689, '중국': 12045, '홍콩': 422, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 3, 'ST미국': 937 },
      '2024_Year': { 'OC(국내)': 40355, '중국': 45269, '홍콩': 2014, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 7, 'ST미국': 5489 },
      '2025_1Q': { 'OC(국내)': 8143, '중국': 14554, '홍콩': 534, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 1379 },
      '2025_Year': { 'OC(국내)': 36492, '중국': 60570, '홍콩': 2817, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 0, 'ST미국': 9277 },
    },
    '지급수수료': {
      '2024_1Q': { 'OC(국내)': 103398, '중국': 6675, '홍콩': 3518, '베트남': 1, '빅텐츠': 106, '엔터테인먼트': 43, 'ST미국': 1537 },
      '2024_Year': { 'OC(국내)': 396902, '중국': 26100, '홍콩': 4302, '베트남': 19, '빅텐츠': 355, '엔터테인먼트': 155, 'ST미국': 4518 },
      '2025_1Q': { 'OC(국내)': 98102, '중국': 8799, '홍콩': 1124, '베트남': 5, '빅텐츠': 0, '엔터테인먼트': 32, 'ST미국': 1129 },
      '2025_Year': { 'OC(국내)': 379344, '중국': 34725, '홍콩': 2569, '베트남': 31, '빅텐츠': 0, '엔터테인먼트': 160, 'ST미국': 16606 },
    },
    '감가상각비': {
      '2024_1Q': { 'OC(국내)': 9393, '중국': 5228, '홍콩': 3786, '베트남': 0, '빅텐츠': 41, '엔터테인먼트': 129, 'ST미국': 142 },
      '2024_Year': { 'OC(국내)': 37807, '중국': 23909, '홍콩': 14320, '베트남': 0, '빅텐츠': 117, '엔터테인먼트': 562, 'ST미국': 434 },
      '2025_1Q': { 'OC(국내)': 9949, '중국': 7530, '홍콩': 3123, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 157, 'ST미국': 110 },
      '2025_Year': { 'OC(국내)': 40274, '중국': 24619, '홍콩': 11457, '베트남': 0, '빅텐츠': 0, '엔터테인먼트': 644, 'ST미국': 450 },
    },
    '영업이익': {
      '2024_1Q': { 'OC(국내)': 95454, '중국': 24682, '홍콩': 650, '베트남': -3, '빅텐츠': -191, '엔터테인먼트': -2980, 'ST미국': 2591 },
      '2024_Year': { 'OC(국내)': 402407, '중국': 36099, '홍콩': 3357, '베트남': 45, '빅텐츠': -4678, '엔터테인먼트': -14173, 'ST미국': 6903 },
      '2025_1Q': { 'OC(국내)': 111978, '중국': 6110, '홍콩': 3, '베트남': 12, '빅텐츠': 0, '엔터테인먼트': -1538, 'ST미국': 996 },
      '2025_Year': { 'OC(국내)': 524452, '중국': 40209, '홍콩': 1617, '베트남': 18, '빅텐츠': 0, '엔터테인먼트': -8707, 'ST미국': -1368 },
    },
  }, '2025', yearCloneRules);

  // ============================================
  // 문장형 증감 분석 생성 함수
  // ============================================
  const generateIncomeAnalysisText = (accountKey, entity, currPeriod, prevPeriod) => {
    // 연결 기준 데이터 가져오기
    const currData = incomeStatementData[currPeriod] || {};
    const prevData = incomeStatementData[prevPeriod] || {};
    const currDetail = incomeDetailData[currPeriod] || {};
    const prevDetail = incomeDetailData[prevPeriod] || {};
    
    // 법인별 데이터 가져오기
    const entityCurr = entityData[accountKey]?.[currPeriod] || {};
    const entityPrev = entityData[accountKey]?.[prevPeriod] || {};
    
    const formatRate = (val) => val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`;
    const calcChange = (curr, prev) => prev !== 0 ? ((curr - prev) / Math.abs(prev) * 100) : 0;
    
    let analysis = [];
    
    if (accountKey === '매출액') {
      // 매출액: 제품매출, 상품매출 구성 분석
      const prodCurr = currDetail.제품매출 || 0;
      const prodPrev = prevDetail.제품매출 || 0;
      const merchCurr = currDetail.상품매출 || 0;
      const merchPrev = prevDetail.상품매출 || 0;
      const totalCurr = currData.매출액 || 0;
      const totalPrev = prevData.매출액 || 0;
      
      const prodChange = calcChange(prodCurr, prodPrev);
      const merchChange = calcChange(merchCurr, merchPrev);
      
      const prodRatioCurr = totalCurr > 0 ? (prodCurr / totalCurr * 100).toFixed(1) : 0;
      const merchRatioCurr = totalCurr > 0 ? (merchCurr / totalCurr * 100).toFixed(1) : 0;
      const prodRatioPrev = totalPrev > 0 ? (prodPrev / totalPrev * 100).toFixed(1) : 0;
      const merchRatioPrev = totalPrev > 0 ? (merchPrev / totalPrev * 100).toFixed(1) : 0;
      
      analysis.push(`제품매출 ${formatRate(prodChange)} (비중 ${prodRatioPrev}%→${prodRatioCurr}%)`);
      analysis.push(`상품매출 ${formatRate(merchChange)} (비중 ${merchRatioPrev}%→${merchRatioCurr}%)`);
      
      // 법인별 특이사항
      const entityChange = calcChange(entityCurr[entity] || 0, entityPrev[entity] || 0);
      if (entity === 'OC(국내)') {
        analysis.push(`국내 제품매출 중심 ${entityChange >= 0 ? '성장' : '감소'}`);
      } else if (entity === '중국') {
        analysis.push(`중국 상품매출 ${entityChange >= 0 ? '확대' : '축소'}`);
      }
    }
    
    else if (accountKey === '매출원가') {
      // 매출원가: 매출원가율 분석
      const salesCurr = currData.매출액 || 1;
      const salesPrev = prevData.매출액 || 1;
      const cogsCurr = currData.매출원가 || 0;
      const cogsPrev = prevData.매출원가 || 0;
      
      const cogsRatioCurr = (cogsCurr / salesCurr * 100).toFixed(1);
      const cogsRatioPrev = (cogsPrev / salesPrev * 100).toFixed(1);
      const ratioChange = (parseFloat(cogsRatioCurr) - parseFloat(cogsRatioPrev)).toFixed(1);
      
      analysis.push(`매출원가율 ${cogsRatioPrev}%→${cogsRatioCurr}% (${ratioChange >= 0 ? '+' : ''}${ratioChange}%p)`);
      
      // 법인별 원가율 분석
      const entitySalesCurr = entityData['매출액']?.[currPeriod]?.[entity] || 1;
      const entitySalesPrev = entityData['매출액']?.[prevPeriod]?.[entity] || 1;
      const entityCogsCurr = entityCurr[entity] || 0;
      const entityCogsPrev = entityPrev[entity] || 0;
      const entityRatioCurr = (entityCogsCurr / entitySalesCurr * 100).toFixed(1);
      const entityRatioPrev = (entityCogsPrev / entitySalesPrev * 100).toFixed(1);
      
      if (entity === 'OC(국내)') {
        analysis.push(`국내 원가율 ${entityRatioPrev}%→${entityRatioCurr}%`);
      } else if (entity === '중국') {
        analysis.push(`중국 매입원가 기반 변동`);
      }
    }
    
    else if (accountKey === '매출총이익') {
      // 매출총이익: 매출과 원가 변동 종합
      const salesChange = calcChange(currData.매출액 || 0, prevData.매출액 || 0);
      const cogsChange = calcChange(currData.매출원가 || 0, prevData.매출원가 || 0);
      const grossMarginCurr = currData.매출액 > 0 ? (currData.매출총이익 / currData.매출액 * 100).toFixed(1) : 0;
      const grossMarginPrev = prevData.매출액 > 0 ? (prevData.매출총이익 / prevData.매출액 * 100).toFixed(1) : 0;
      
      analysis.push(`매출총이익률 ${grossMarginPrev}%→${grossMarginCurr}%`);
      analysis.push(`매출 ${formatRate(salesChange)}, 원가 ${formatRate(cogsChange)}`);
      
      if (salesChange > cogsChange) {
        analysis.push('매출 증가율이 원가 증가율 상회');
      } else if (salesChange < cogsChange) {
        analysis.push('원가 증가율이 매출 증가율 상회');
      }
    }
    
    else if (accountKey === '인건비') {
      // 인건비: 급여, 퇴직급여 구성 분석
      const salaryCurr = currDetail.급여 || 0;
      const salaryPrev = prevDetail.급여 || 0;
      const severanceCurr = currDetail.퇴직급여 || 0;
      const severancePrev = prevDetail.퇴직급여 || 0;
      const totalCurr = currData.인건비 || 0;
      const totalPrev = prevData.인건비 || 0;
      
      const salaryChange = calcChange(salaryCurr, salaryPrev);
      const severanceChange = calcChange(severanceCurr, severancePrev);
      const salaryRatio = totalCurr > 0 ? (salaryCurr / totalCurr * 100).toFixed(0) : 0;
      const severanceRatio = totalCurr > 0 ? (severanceCurr / totalCurr * 100).toFixed(0) : 0;
      
      analysis.push(`급여 ${formatRate(salaryChange)} (구성비 ${salaryRatio}%)`);
      analysis.push(`퇴직급여 ${formatRate(severanceChange)} (구성비 ${severanceRatio}%)`);
    }
    
    else if (accountKey === '영업이익') {
      // 영업이익: 주요 비용 항목별 기여도 분석
      const opIncomeCurr = currData.영업이익 || 0;
      const opIncomePrev = prevData.영업이익 || 0;
      const opIncomeChange = opIncomeCurr - opIncomePrev;
      
      // 주요 비용 항목별 증감
      const expenseItems = ['인건비', '광고선전비', '수수료', '감가상각비', '기타판관비'];
      const contributions = expenseItems.map(item => {
        const curr = currData[item] || 0;
        const prev = prevData[item] || 0;
        const diff = curr - prev;
        const contribution = opIncomeChange !== 0 ? ((-diff / Math.abs(opIncomeChange)) * 100).toFixed(0) : 0;
        return { item, diff, contribution, changeRate: calcChange(curr, prev) };
      }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      
      // 가장 영향이 큰 2개 항목
      const top2 = contributions.slice(0, 2);
      top2.forEach(c => {
        const direction = c.diff > 0 ? '증가' : '감소';
        analysis.push(`${c.item} ${direction} (기여도 ${c.contribution}%)`);
      });
      
      // 영업이익률 변동
      const opMarginCurr = currData.매출액 > 0 ? (opIncomeCurr / currData.매출액 * 100).toFixed(1) : 0;
      const opMarginPrev = prevData.매출액 > 0 ? (opIncomePrev / prevData.매출액 * 100).toFixed(1) : 0;
      analysis.push(`영업이익률 ${opMarginPrev}%→${opMarginCurr}%`);
    }
    
    else if (accountKey === '광고선전비' || accountKey === '수수료' || accountKey === '감가상각비' || accountKey === '기타판관비') {
      // 판관비 세부 항목: 매출 대비 비율 분석
      const itemCurr = currData[accountKey] || 0;
      const itemPrev = prevData[accountKey] || 0;
      const salesCurr = currData.매출액 || 1;
      const salesPrev = prevData.매출액 || 1;
      
      const ratioCurr = (itemCurr / salesCurr * 100).toFixed(1);
      const ratioPrev = (itemPrev / salesPrev * 100).toFixed(1);
      const ratioChange = (parseFloat(ratioCurr) - parseFloat(ratioPrev)).toFixed(1);
      
      analysis.push(`매출대비 ${ratioPrev}%→${ratioCurr}% (${ratioChange >= 0 ? '+' : ''}${ratioChange}%p)`);
    }
    
    else if (accountKey === '당기순이익') {
      // 당기순이익: 영업이익과 영업외손익 기여도
      const netIncomeCurr = currData.당기순이익 || 0;
      const netIncomePrev = prevData.당기순이익 || 0;
      const opIncomeCurr = currData.영업이익 || 0;
      const opIncomePrev = prevData.영업이익 || 0;
      const nonOpCurr = currData.영업외손익 || 0;
      const nonOpPrev = prevData.영업외손익 || 0;
      
      const opChange = opIncomeCurr - opIncomePrev;
      const nonOpChange = nonOpCurr - nonOpPrev;
      const netChange = netIncomeCurr - netIncomePrev;
      
      const opContrib = netChange !== 0 ? ((opChange / Math.abs(netChange)) * 100).toFixed(0) : 0;
      const nonOpContrib = netChange !== 0 ? ((nonOpChange / Math.abs(netChange)) * 100).toFixed(0) : 0;
      
      analysis.push(`영업이익 변동 기여도 ${opContrib}%`);
      analysis.push(`영업외손익 변동 기여도 ${nonOpContrib}%`);
    }
    
    return analysis;
  };

  // ============================================
  // 상세 계정 데이터 (bsDetailData) - 법인별 데이터 포함
  // ============================================
  const bsDetailData = normalizeYearDataset({
    // 현금성자산 하위 계정
    '현금및현금성자산': { 
      category: '현금성자산', 
      '2024_4Q': { 'OC(국내)': 61500, '중국': 29229, '홍콩': 6073, 'ST미국': 22881, '기타': 150, 연결: 119833 },
      '2025_4Q': { 'OC(국내)': 270871, '중국': 12231, '홍콩': 5369, 'ST미국': 36527, '기타': 386, 연결: 325384 }
    },
    // 금융자산 하위 계정
    '기타유동금융자산': { 
      category: '금융자산', 
      '2024_4Q': { 'OC(국내)': 350, '중국': 6038, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 6388 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 16381, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 16381 }
    },
    '당기손익-공정가치금융자산': { 
      category: '금융자산', 
      '2024_4Q': { 'OC(국내)': 13091, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 13091 },
      '2025_4Q': { 'OC(국내)': 9288, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 9288 }
    },
    // 재고자산 하위 계정
    '상품': { 
      category: '재고자산', 
      '2024_4Q': { 'OC(국내)': 183245, '중국': 110876, '홍콩': 30215, 'ST미국': 8755, '기타': 0, 연결: 333091 },
      '2025_4Q': { 'OC(국내)': 185123, '중국': 239654, '홍콩': 22876, 'ST미국': 8156, '기타': 0, 연결: 455809 }
    },
    '상품(충당금)': { 
      category: '재고자산', 
      '2024_4Q': { 'OC(국내)': -8234, '중국': -12345, '홍콩': -1500, 'ST미국': -600, '기타': 0, 연결: -22679 },
      '2025_4Q': { 'OC(국내)': -12456, '중국': -35678, '홍콩': -3125, 'ST미국': -1700, '기타': 0, 연결: -52959 }
    },
    '제품': { 
      category: '재고자산', 
      '2024_4Q': { 'OC(국내)': 31036, '중국': 30347, '홍콩': 4990, 'ST미국': 776, '기타': 0, 연결: 67149 },
      '2025_4Q': { 'OC(국내)': 34151, '중국': 66798, '홍콩': 1548, 'ST미국': 816, '기타': 0, 연결: 103313 }
    },
    '재공품': { 
      category: '재고자산', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 6523, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 6523 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 11665, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 11665 }
    },
    '원재료': { 
      category: '재고자산', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 18665, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 18665 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 34028, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 34028 }
    },
    '미착품': { 
      category: '재고자산', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 21030, 연결: 21030 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 7000, '홍콩': 6759, 'ST미국': 0, '기타': 0, 연결: 13759 }
    },
    // 유무형자산 하위 계정 (JSON 기준)
    '토지': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 345733, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 345733 },
      '2025_4Q': { 'OC(국내)': 289435, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 289435 }
    },
    '건물': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 17059, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 17059 },
      '2025_4Q': { 'OC(국내)': 93999, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 93999 }
    },
    '토지(투자부동산)': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 0 },
      '2025_4Q': { 'OC(국내)': 57266, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 57266 }
    },
    '건물(투자부동산)': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 0 },
      '2025_4Q': { 'OC(국내)': 22239, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 22239 }
    },
    '임차시설물': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 32348, '중국': 16951, '홍콩': 10311, 'ST미국': 16, '기타': 280, 연결: 59906 },
      '2025_4Q': { 'OC(국내)': 33354, '중국': 20118, '홍콩': 10947, 'ST미국': 0, '기타': 280, 연결: 64699 }
    },
    '공기구비품': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 9876, '중국': 2234, '홍콩': 0, 'ST미국': 0, '기타': 3877, 연결: 15987 },
      '2025_4Q': { 'OC(국내)': 8654, '중국': 2167, '홍콩': 0, 'ST미국': 0, '기타': 3852, 연결: 14673 }
    },
    '건설중인자산': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 16237, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 16237 },
      '2025_4Q': { 'OC(국내)': 23104, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 23104 }
    },
    '라이선스': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 79662, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 17, 연결: 94380 },
      '2025_4Q': { 'OC(국내)': 76168, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 79654 }
    },
    '브랜드': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 70179, '기타': 0, 연결: 69882 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 68503, '기타': 0, 연결: 68213 }
    },
    '소프트웨어': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 8756, '중국': 100, '홍콩': 0, 'ST미국': 0, '기타': 76, 연결: 8932 },
      '2025_4Q': { 'OC(국내)': 7345, '중국': 123, '홍콩': 0, 'ST미국': 0, '기타': 75, 연결: 7543 }
    },
    '영업권': { 
      category: '유무형자산', 
      '2024_4Q': { 'OC(국내)': 12318, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 12318 },
      '2025_4Q': { 'OC(국내)': 12588, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 12588 }
    },
    // 사용권자산 하위 계정 (감가상각누계액 차감 후 순액)
    '사용권자산': { 
      category: '사용권자산', 
      '2024_4Q': { 'OC(국내)': 146365, '중국': 47203, '홍콩': 11426, 'ST미국': 1315, '기타': 1561, 연결: 207683 },
      '2025_4Q': { 'OC(국내)': 130687, '중국': 34218, '홍콩': 18333, 'ST미국': 861, '기타': 1059, 연결: 185158 }
    },
    // 투자자산 하위 계정
    '관계기업투자': { 
      category: '투자자산', 
      '2024_4Q': { 'OC(국내)': 665564, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 665564 },
      '2025_4Q': { 'OC(국내)': 662420, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 662420 }
    },
    // 매입채무 하위 계정
    '매입채무_상세': { 
      category: '매입채무', 
      '2024_4Q': { 'OC(국내)': 79795, '중국': 17885, '홍콩': 47089, 'ST미국': 6030, '기타': -48114, 연결: 102685 },
      '2025_4Q': { 'OC(국내)': 90452, '중국': 82388, '홍콩': 46803, 'ST미국': 4686, '기타': -119328, 연결: 105001 }
    },
    // 차입금 하위 계정
    '단기차입금': { 
      category: '차입금', 
      '2024_4Q': { 'OC(국내)': 45000, '중국': 100635, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 145635 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 186267, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 186267 }
    },
    '장기차입금': { 
      category: '차입금', 
      '2024_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, 연결: 0 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 80970, '기타': 0, 연결: 80970 }
    },
    // 이익잉여금
    '이익잉여금': { 
      category: '자본', 
      '2024_4Q': { 'OC(국내)': 1222495, '중국': 61851, '홍콩': 3146, 'ST미국': -11153, '기타': 7016, 연결: 1283355 },
      '2025_4Q': { 'OC(국내)': 1558525, '중국': 88199, '홍콩': 4188, 'ST미국': -19074, '기타': -12023, 연결: 1619815 }
    },
  }, '2025', yearCloneRules);

  // 카테고리별 상세 계정 매핑
  const categoryDetailAccounts = {
    '현금성자산': ['현금및현금성자산'],
    '금융자산': ['기타유동금융자산', '당기손익-공정가치금융자산'],
    '재고자산': ['상품', '상품(충당금)', '제품', '재공품', '원재료', '미착품'],
    '유무형자산': ['토지', '건물', '토지(투자부동산)', '건물(투자부동산)', '임차시설물', '공기구비품', '건설중인자산', '라이선스', '브랜드', '소프트웨어', '영업권'],
    '사용권자산': ['사용권자산'],
    '투자자산': ['관계기업투자'],
    '매입채무': ['매입채무_상세'],
    '차입금': ['단기차입금', '장기차입금'],
    '자본총계': ['이익잉여금'],
  };

  // 재무상태표 문장형 분석 생성 함수 - 법인별, 상세 계정 기반 분석
  const generateBSAnalysisText = (accountKey, entity, currPeriod, prevPeriod) => {
    const formatBil = (val) => Math.round(val / 100); // 백만원 → 억원
    const formatRate = (val) => val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`;
    const calcChange = (curr, prev) => prev !== 0 ? ((curr - prev) / Math.abs(prev) * 100) : (curr !== 0 ? 100 : 0);
    
    // 법인명 매핑 (기타(연결조정) -> 기타)
    const entityKey = entity === '기타(연결조정)' ? '기타' : entity;
    
    let analysis = [];
    
    // 해당 카테고리의 상세 계정들 가져오기
    const detailAccounts = categoryDetailAccounts[accountKey] || [];
    
    if (detailAccounts.length > 0) {
      // 상세 계정별 증감 분석 - 법인별
      const changes = detailAccounts.map(account => {
        const data = bsDetailData[account];
        if (!data) return null;
        
        const currData = data[currPeriod];
        const prevData = data[prevPeriod];
        if (!currData || !prevData) return null;
        
        // 법인별 데이터 가져오기
        const curr = currData[entityKey] || 0;
        const prev = prevData[entityKey] || 0;
        const diff = curr - prev;
        const rate = calcChange(curr, prev);
        
        // 계정명 정리
        let displayName = account.replace('_상세', '').replace('(충당금)', ' 충당금');
        return { account, displayName, curr, prev, diff, rate };
      }).filter(c => c && Math.abs(c.diff) > 10).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      
      // 유무형자산 특별 분석 - 계정 대체 감지
      if (accountKey === '유무형자산' && entityKey === 'OC(국내)') {
        const landChange = changes.find(c => c.account === '토지');
        const investLandChange = changes.find(c => c.account === '토지(투자부동산)');
        const buildingChange = changes.find(c => c.account === '건물');
        const investBuildingChange = changes.find(c => c.account === '건물(투자부동산)');
        
        // 토지→투자부동산 대체 감지
        if (landChange && landChange.diff < 0 && investLandChange && investLandChange.diff > 0) {
          const transferAmt = Math.min(Math.abs(landChange.diff), investLandChange.diff);
          const newAcquisition = investLandChange.diff - transferAmt + (investBuildingChange?.diff || 0);
          analysis.push(`토지→투자부동산 대체 ${formatNumber(formatBil(transferAmt))}억`);
          if (newAcquisition > 100) {
            analysis.push(`투자부동산 신규취득 ${formatNumber(formatBil(newAcquisition))}억`);
          }
        }
        // 건물 증가
        if (buildingChange && buildingChange.diff > 1000) {
          analysis.push(`건물 신규취득 +${formatNumber(formatBil(buildingChange.diff))}억`);
        }
      }
      // 중국 법인 유무형자산 분석
      else if (accountKey === '유무형자산' && entityKey === '중국') {
        const facilityChange = changes.find(c => c.account === '임차시설물');
        if (facilityChange && Math.abs(facilityChange.diff) > 100) {
          const diffBil = formatBil(facilityChange.diff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis.push(`임차시설물 ${sign}${formatNumber(diffBil)}억 (점포 확장)`);
        }
      }
      // ST미국 법인 유무형자산 분석
      else if (accountKey === '유무형자산' && entityKey === 'ST미국') {
        const brandChange = changes.find(c => c.account === '브랜드');
        if (brandChange) {
          const diffBil = formatBil(brandChange.diff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis.push(`브랜드 ${sign}${formatNumber(diffBil)}억 (상각/환율효과)`);
        }
      }
      // 홍콩 법인 유무형자산 분석
      else if (accountKey === '유무형자산' && entityKey === '홍콩') {
        const facilityChange = changes.find(c => c.account === '임차시설물');
        if (facilityChange && Math.abs(facilityChange.diff) > 10) {
          const diffBil = formatBil(facilityChange.diff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis.push(`임차시설물 ${sign}${formatNumber(diffBil)}억`);
        }
      }
      // 일반적인 분석
      else if (changes.length > 0) {
        const topChanges = changes.slice(0, 2);
        topChanges.forEach(c => {
          const diffBil = formatBil(c.diff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis.push(`${c.displayName} ${sign}${formatNumber(diffBil)}억 (${formatRate(c.rate)})`);
        });
      }
    }
    
    // 총계 계정인 경우 법인별 주요 항목 분석
    if (accountKey === '자산총계') {
      const currEntityData = entityBSData[currPeriod] || {};
      const prevEntityData = entityBSData[prevPeriod] || {};
      const majorItems = ['현금성자산', '재고자산', '유무형자산', '투자자산'];
      const itemChanges = majorItems.map(item => {
        const curr = currEntityData[item]?.[entity] || 0;
        const prev = prevEntityData[item]?.[entity] || 0;
        return { item, diff: curr - prev, rate: calcChange(curr, prev) };
      }).filter(c => Math.abs(c.diff) > 100).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      
      if (itemChanges.length > 0) {
        analysis = [];
        itemChanges.slice(0, 2).forEach(c => {
          const diffBil = formatBil(c.diff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis.push(`${c.item} ${sign}${formatNumber(diffBil)}억 (${formatRate(c.rate)})`);
        });
      }
    }
    
    else if (accountKey === '부채총계') {
      const currEntityData = entityBSData[currPeriod] || {};
      const prevEntityData = entityBSData[prevPeriod] || {};
      const majorItems = ['차입금', '매입채무', '유동부채', '비유동부채'];
      const itemChanges = majorItems.map(item => {
        const curr = currEntityData[item]?.[entity] || 0;
        const prev = prevEntityData[item]?.[entity] || 0;
        return { item, diff: curr - prev, rate: calcChange(curr, prev) };
      }).filter(c => Math.abs(c.diff) > 100).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      
      if (itemChanges.length > 0) {
        analysis = [];
        itemChanges.slice(0, 2).forEach(c => {
          const diffBil = formatBil(c.diff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis.push(`${c.item} ${sign}${formatNumber(diffBil)}억 (${formatRate(c.rate)})`);
        });
      }
    }
    
    else if (accountKey === '자본총계') {
      // 이익잉여금 법인별 데이터
      const retainedData = bsDetailData['이익잉여금'];
      if (retainedData) {
        const retainedCurr = retainedData[currPeriod]?.[entityKey] || 0;
        const retainedPrev = retainedData[prevPeriod]?.[entityKey] || 0;
        const retainedDiff = retainedCurr - retainedPrev;
        
        if (Math.abs(retainedDiff) > 100) {
          const diffBil = formatBil(retainedDiff);
          const sign = diffBil >= 0 ? '+' : '';
          analysis = [`이익잉여금 ${sign}${formatNumber(diffBil)}억 (${formatRate(calcChange(retainedCurr, retainedPrev))})`];
        }
      }
      
      // 자기자본비율 추가
      const currEntityData = entityBSData[currPeriod] || {};
      const assetCurr = currEntityData['자산총계']?.[entity] || 0;
      const equityCurr = currEntityData['자본총계']?.[entity] || 0;
      if (assetCurr > 0) {
        const equityRatio = (equityCurr / assetCurr * 100).toFixed(1);
        analysis.push(`자기자본비율 ${equityRatio}%`);
      }
    }
    
    // 분석 결과가 없는 경우 기본 메시지
    if (analysis.length === 0) {
      analysis.push('유의미한 변동 없음');
    }
    
    return analysis;
  };

  // ============================================
  // 재무상태표 데이터 - 전년기말 vs 당기말
  // ============================================
  // 재무상태표 데이터 (성격별 분류 - 유동/비유동 통합)
  const balanceSheetDataBase = normalizeYearDataset({
    // 2024년 연결 BS (2024_BS.csv 기반, 단위: 백만원)
    '2024_1Q': {
      현금성자산: 334707,
      금융자산: 32034,
      매출채권: 82369,
      대여금: 5445,
      재고자산: 323836,
      투자자산: 633124,
      유무형자산: 327883,
      사용권자산: 213602,
      기타자산: 109815,
      자산총계: 2057370,
      매입채무: 75896,
      미지급금: 95705,
      보증금: 16360,
      차입금: 73262,
      리스부채: 163946,
      금융부채: 52,
      기타부채: 282478,
      부채총계: 707649,
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -21519,
      이익잉여금: 1018879,
      비지배지분: 30985,
      자본총계: 1349721,
    },
    '2024_2Q': {
      현금성자산: 220611,
      금융자산: 18747,
      매출채권: 65760,
      대여금: 0,
      재고자산: 292899,
      투자자산: 632510,
      유무형자산: 384106,
      사용권자산: 210463,
      기타자산: 101280,
      자산총계: 1926377,
      매입채무: 62956,
      미지급금: 34040,
      보증금: 16225,
      차입금: 820,
      리스부채: 160758,
      금융부채: 0,
      기타부채: 184217,
      부채총계: 514242,
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -33162,
      이익잉여금: 1092725,
      비지배지분: 31196,
      자본총계: 1412135,
    },
    '2024_3Q': {
      현금성자산: 190422,
      금융자산: 17954,
      매출채권: 132681,
      대여금: 0,
      재고자산: 361737,
      투자자산: 634781,
      유무형자산: 441828,
      사용권자산: 207368,
      기타자산: 114554,
      자산총계: 2139478,
      매입채무: 130612,
      미지급금: 37911,
      보증금: 16125,
      차입금: 86820,
      리스부채: 158831,
      금융부채: 107,
      기타부채: 169342,
      부채총계: 654790,
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -40262,
      이익잉여금: 1176364,
      비지배지분: 27209,
      자본총계: 1484687,
    },
    // 2025년 연결 BS (2025_BS.csv 기반, 단위: 백만원)
    '2025_1Q': {
      현금성자산: 164044,
      금융자산: 10966,
      매출채권: 85122,
      대여금: 0,
      재고자산: 314052,
      투자자산: 651745,
      유무형자산: 713433,
      사용권자산: 198220,
      기타자산: 120367,
      자산총계: 2257950,
      매입채무: 81968,
      미지급금: 100026,
      보증금: 18817,
      차입금: 76470,
      리스부채: 151882,
      금융부채: 3115,
      기타부채: 231696,
      부채총계: 663974,
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -43459,
      이익잉여금: 1302260,
      비지배지분: 13799,
      자본총계: 1593976,
    },
    '2025_2Q': {
      현금성자산: 126440,
      금융자산: 18833,
      매출채권: 57519,
      대여금: 0,
      재고자산: 293350,
      투자자산: 650955,
      유무형자산: 702103,
      사용권자산: 184171,
      기타자산: 117330,
      자산총계: 2150700,
      매입채무: 68454,
      미지급금: 28936,
      보증금: 19565,
      차입금: 32157,
      리스부채: 142100,
      금융부채: 0,
      기타부채: 211731,
      부채총계: 502944,
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -51346,
      이익잉여금: 1364602,
      비지배지분: 13124,
      자본총계: 1647756,
    },
    '2025_3Q': {
      현금성자산: 208285,
      금융자산: 37815,
      매출채권: 152793,
      대여금: 0,
      재고자산: 414026,
      투자자산: 653157,
      유무형자산: 703080,
      사용권자산: 186155,
      기타자산: 145351,
      자산총계: 2500662,
      매입채무: 158517,
      미지급금: 36728,
      보증금: 18953,
      차입금: 160605,
      리스부채: 139760,
      금융부채: 0,
      기타부채: 179997,
      부채총계: 750162,
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -50132,
      이익잉여금: 1463247,
      비지배지분: 16009,
      자본총계: 1750500,
    },
    '2024_4Q': {
      // 자산 (성격별 - 맵핑표 기준)
      현금성자산: 119833,
      금융자산: 19479,
      매출채권: 133826,
      대여금: 0,
      재고자산: 324992,
      투자자산: 652474,
      유무형자산: 714996,
      사용권자산: 207683,
      기타자산: 112622,
      자산총계: 2285905,
      // 부채 (성격별 - 맵핑표 기준)
      매입채무: 102685,
      미지급금: 41982,
      보증금: 16534,
      차입금: 145635,
      리스부채: 215428,
      금융부채: 0,
      기타부채: 186343,
      부채총계: 708607,
      // 자본
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -42530,
      이익잉여금: 1283355,
      비지배지분: 15098,
      자본총계: 1577298,
    },
    // 2025년 4분기 연결 BS (2025_BS.csv 기반, 단위: 백만원 - 맵핑표 기준)
    '2025_4Q': {
      // 자산 (성격별)
      현금성자산: 325384,
      금융자산: 25668,
      매출채권: 150809,
      대여금: 0,
      재고자산: 402853,
      투자자산: 732624,
      유무형자산: 690208,
      사용권자산: 185158,
      기타자산: 139219,
      자산총계: 2651925,
      // 부채 (성격별)
      매입채무: 105001,
      미지급금: 47538,
      보증금: 24063,
      차입금: 186267,
      리스부채: 194618,
      금융부채: 0,
      기타부채: 214862,
      부채총계: 772350,
      // 자본
      자본금: 3831,
      자본잉여금: 307395,
      기타자본: -51465,
      이익잉여금: 1619815,
      비지배지분: 0,
      자본총계: 1879575,
    },
  }, '2025', yearCloneRules);
  const balanceSheetData = useMemo(
    () => mergePeriodMetrics(balanceSheetDataBase, consolidatedCsvOverride.balance),
    [consolidatedCsvOverride.balance]
  );

  // ============================================
  // 금융상품평가 데이터
  // ============================================
  const financialInstrumentsData = normalizeYearDataset({
    '2024_4Q': {
      FVPL금융자산: 0,
      FVOCI금융자산: 0,
      AC금융자산: 0,
      파생상품자산: 0,
      당기손익인식금융부채: 0,
      상각후원가금융부채: 0,
      파생상품부채: 0,
      FVPL평가손익: 0,
      FVOCI평가손익: 0,
      파생상품평가손익: 0,
    },
  }, '2025', yearCloneRules);

  // ============================================
  // 유틸리티 함수
  // ============================================
  const formatNumber = (num) => {
    if (num === 0 || num === undefined || num === null) return '-';
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const calculateYoY = (current, previous) => {
    if (!previous || previous === 0) return '-';
    const change = ((current - previous) / Math.abs(previous)) * 100;
    return change.toFixed(1);
  };

  const calculateDiff = (current, previous) => {
    if (current === 0 && previous === 0) return 0;
    return current - previous;
  };

  // ============================================
  // 탭 컴포넌트
  // ============================================
  const tabs = [
    { id: 'summary', label: '전체요약', icon: '📊' },
    { id: 'income', label: '손익계산서', icon: '📈' },
    { id: 'balance', label: '재무상태표', icon: '💰' },
    { id: 'entity', label: '법인별', icon: '🏢', hidden: true },
  ];

  // ============================================
  // 법인별 손익계산서 데이터 (컴포넌트 상위 레벨)
  // ============================================
  // 법인별 데이터 (선택된 과목에 따라) - 분기 및 누적
  // 주의: 법인별 데이터는 연결조정 전 법인별 합산 기준
  // entity_is_data.json에서 자동 생성 (5개 법인: OC(국내), 중국, 홍콩, ST미국, 기타(연결조정))
  // 연결운전자본(24~25).csv 기반 법인별 매출 데이터 (연결조정 완료)
  const entityData = normalizeYearDataset({
    '매출액': {
      '2024_1Q': { 'OC(국내)': 236031, '중국': 238976, '홍콩': 22211, 'ST미국': 9182, '기타': 629 },
      '2024_1Q_Year': { 'OC(국내)': 236031, '중국': 238976, '홍콩': 22211, 'ST미국': 9182, '기타': 629 },
      '2024_2Q': { 'OC(국내)': 208996, '중국': 154544, '홍콩': 16965, 'ST미국': 9282, '기타': 1686 },
      '2024_2Q_Year': { 'OC(국내)': 445027, '중국': 393520, '홍콩': 39176, 'ST미국': 18464, '기타': 2315 },
      '2024_3Q': { 'OC(국내)': 167998, '중국': 250154, '홍콩': 15559, 'ST미국': 8198, '기타': 9054 },
      '2024_3Q_Year': { 'OC(국내)': 613025, '중국': 643674, '홍콩': 54735, 'ST미국': 26662, '기타': 11369 },
      '2024_4Q': { 'OC(국내)': 301138, '중국': 214166, '홍콩': 20299, 'ST미국': 10115, '기타': 826 },
      '2024_Year': { 'OC(국내)': 914163, '중국': 857840, '홍콩': 75034, 'ST미국': 36777, '기타': 12195 },
      '2025_1Q': { 'OC(국내)': 217218, '중국': 258540, '홍콩': 20663, 'ST미국': 8443, '기타': 752 },
      '2025_1Q_Year': { 'OC(국내)': 217218, '중국': 258540, '홍콩': 20663, 'ST미국': 8443, '기타': 752 },
      '2025_2Q': { 'OC(국내)': 182702, '중국': 170703, '홍콩': 15742, 'ST미국': 8590, '기타': 1134 },
      '2025_2Q_Year': { 'OC(국내)': 399920, '중국': 429243, '홍콩': 36405, 'ST미국': 17033, '기타': 1886 },
      '2025_3Q': { 'OC(국내)': 154598, '중국': 283919, '홍콩': 16908, 'ST미국': 16123, '기타': 2709 },
      '2025_3Q_Year': { 'OC(국내)': 554518, '중국': 713162, '홍콩': 53313, 'ST미국': 33156, '기타': 4595 },
      '2025_4Q': { 'OC(국내)': 287542, '중국': 247172, '홍콩': 22962, 'ST미국': 15082, '기타': 2494 },
      '2025_Year': { 'OC(국내)': 842060, '중국': 960334, '홍콩': 76275, 'ST미국': 48238, '기타': 7089 },
    },
    '매출원가': {
      '2024_1Q': { 'OC(국내)': 84861, '중국': 80578, '홍콩': 4359, 'ST미국': 2031, '기타': 2716 },
      '2024_1Q_Year': { 'OC(국내)': 84861, '중국': 80578, '홍콩': 4359, 'ST미국': 2031, '기타': 2716 },
      '2024_2Q': { 'OC(국내)': 62705, '중국': 48588, '홍콩': 3383, 'ST미국': 2144, '기타': 3354 },
      '2024_2Q_Year': { 'OC(국내)': 147566, '중국': 129166, '홍콩': 7742, 'ST미국': 4175, '기타': 6070 },
      '2024_3Q': { 'OC(국내)': 54707, '중국': 90959, '홍콩': 4012, 'ST미국': 2241, '기타': 14123 },
      '2024_3Q_Year': { 'OC(국내)': 202273, '중국': 220125, '홍콩': 11754, 'ST미국': 6416, '기타': 20193 },
      '2024_4Q': { 'OC(국내)': 93282, '중국': 81541, '홍콩': 3631, 'ST미국': 2593, '기타': 7209 },
      '2024_Year': { 'OC(국내)': 295555, '중국': 301666, '홍콩': 15385, 'ST미국': 9009, '기타': 27402 },
      '2025_1Q': { 'OC(국내)': 74004, '중국': 93609, '홍콩': 4773, 'ST미국': 1966, '기타': 1531 },
      '2025_1Q_Year': { 'OC(국내)': 74004, '중국': 93609, '홍콩': 4773, 'ST미국': 1966, '기타': 1531 },
      '2025_2Q': { 'OC(국내)': 55727, '중국': 55489, '홍콩': 4356, 'ST미국': 2337, '기타': 2055 },
      '2025_2Q_Year': { 'OC(국내)': 129731, '중국': 149098, '홍콩': 9129, 'ST미국': 4303, '기타': 3586 },
      '2025_3Q': { 'OC(국내)': 53983, '중국': 100125, '홍콩': 3811, 'ST미국': 2844, '기타': 4540 },
      '2025_3Q_Year': { 'OC(국내)': 183714, '중국': 249223, '홍콩': 12940, 'ST미국': 7147, '기타': 8126 },
      '2025_4Q': { 'OC(국내)': 90916, '중국': 75928, '홍콩': 4409, 'ST미국': 5428, '기타': 4357 },
      '2025_Year': { 'OC(국내)': 274630, '중국': 325151, '홍콩': 17349, 'ST미국': 12575, '기타': 12483 },
    },
    '매출총이익': {
      '2024_1Q': { 'OC(국내)': 151170, '중국': 158398, '홍콩': 17852, 'ST미국': 7151, '기타': -2087 },
      '2024_1Q_Year': { 'OC(국내)': 151170, '중국': 158398, '홍콩': 17852, 'ST미국': 7151, '기타': -2087 },
      '2024_2Q': { 'OC(국내)': 146291, '중국': 105956, '홍콩': 13582, 'ST미국': 7138, '기타': -1668 },
      '2024_2Q_Year': { 'OC(국내)': 297461, '중국': 264354, '홍콩': 31434, 'ST미국': 14289, '기타': -3755 },
      '2024_3Q': { 'OC(국내)': 113291, '중국': 159195, '홍콩': 11547, 'ST미국': 5957, '기타': -5069 },
      '2024_3Q_Year': { 'OC(국내)': 410752, '중국': 423549, '홍콩': 42981, 'ST미국': 20246, '기타': -8824 },
      '2024_4Q': { 'OC(국내)': 207856, '중국': 132625, '홍콩': 16668, 'ST미국': 7522, '기타': -6383 },
      '2024_Year': { 'OC(국내)': 618608, '중국': 556174, '홍콩': 59649, 'ST미국': 27768, '기타': -15207 },
      '2025_1Q': { 'OC(국내)': 143214, '중국': 164931, '홍콩': 15890, 'ST미국': 6477, '기타': -779 },
      '2025_1Q_Year': { 'OC(국내)': 143214, '중국': 164931, '홍콩': 15890, 'ST미국': 6477, '기타': -779 },
      '2025_2Q': { 'OC(국내)': 126975, '중국': 115214, '홍콩': 11386, 'ST미국': 6253, '기타': -921 },
      '2025_2Q_Year': { 'OC(국내)': 270189, '중국': 280145, '홍콩': 27276, 'ST미국': 12730, '기타': -1700 },
      '2025_3Q': { 'OC(국내)': 100615, '중국': 183794, '홍콩': 13097, 'ST미국': 13279, '기타': -1831 },
      '2025_3Q_Year': { 'OC(국내)': 370804, '중국': 463939, '홍콩': 40373, 'ST미국': 26009, '기타': -3531 },
      '2025_4Q': { 'OC(국내)': 196626, '중국': 171244, '홍콩': 18553, 'ST미국': 9654, '기타': -1863 },
      '2025_Year': { 'OC(국내)': 567430, '중국': 635183, '홍콩': 58926, 'ST미국': 35663, '기타': -5394 },
    },
    '인건비': {
      '2024_1Q': { 'OC(국내)': 9937, '중국': 6512, '홍콩': 1928, 'ST미국': 705, '기타': 576 },
      '2024_1Q_Year': { 'OC(국내)': 9937, '중국': 6512, '홍콩': 1928, 'ST미국': 705, '기타': 576 },
      '2024_2Q': { 'OC(국내)': 11938, '중국': 6388, '홍콩': 1977, 'ST미국': 1061, '기타': 636 },
      '2024_2Q_Year': { 'OC(국내)': 21875, '중국': 12900, '홍콩': 3905, 'ST미국': 1766, '기타': 1212 },
      '2024_3Q': { 'OC(국내)': 10187, '중국': 6042, '홍콩': 1724, 'ST미국': 1270, '기타': 702 },
      '2024_3Q_Year': { 'OC(국내)': 32062, '중국': 18942, '홍콩': 5629, 'ST미국': 3036, '기타': 1914 },
      '2024_4Q': { 'OC(국내)': 11626, '중국': 7185, '홍콩': 2181, 'ST미국': 1128, '기타': 563 },
      '2024_Year': { 'OC(국내)': 43688, '중국': 26127, '홍콩': 7810, 'ST미국': 4164, '기타': 2477 },
      '2025_1Q': { 'OC(국내)': 9754, '중국': 7850, '홍콩': 2409, 'ST미국': 1088, '기타': 537 },
      '2025_1Q_Year': { 'OC(국내)': 9754, '중국': 7850, '홍콩': 2409, 'ST미국': 1088, '기타': 537 },
      '2025_2Q': { 'OC(국내)': 10692, '중국': 7019, '홍콩': 1717, 'ST미국': 822, '기타': 625 },
      '2025_2Q_Year': { 'OC(국내)': 20446, '중국': 14869, '홍콩': 4126, 'ST미국': 1910, '기타': 1162 },
      '2025_3Q': { 'OC(국내)': 9632, '중국': 6734, '홍콩': 2155, 'ST미국': 1043, '기타': 701 },
      '2025_3Q_Year': { 'OC(국내)': 30078, '중국': 21603, '홍콩': 6281, 'ST미국': 2953, '기타': 1863 },
      '2025_4Q': { 'OC(국내)': 10445, '중국': 7284, '홍콩': 2661, 'ST미국': 1006, '기타': 633 },
      '2025_Year': { 'OC(국내)': 40523, '중국': 28887, '홍콩': 8942, 'ST미국': 3959, '기타': 2496 },
    },
    '광고선전비': {
      '2024_1Q': { 'OC(국내)': 10689, '중국': 12044, '홍콩': 422, 'ST미국': 937, '기타': 4 },
      '2024_1Q_Year': { 'OC(국내)': 10689, '중국': 12044, '홍콩': 422, 'ST미국': 937, '기타': 4 },
      '2024_2Q': { 'OC(국내)': 9145, '중국': 5745, '홍콩': 634, 'ST미국': 1430, '기타': 1 },
      '2024_2Q_Year': { 'OC(국내)': 19834, '중국': 17789, '홍콩': 1056, 'ST미국': 2367, '기타': 5 },
      '2024_3Q': { 'OC(국내)': 7102, '중국': 10838, '홍콩': 415, 'ST미국': 1542, '기타': 5 },
      '2024_3Q_Year': { 'OC(국내)': 26936, '중국': 28627, '홍콩': 1471, 'ST미국': 3909, '기타': 10 },
      '2024_4Q': { 'OC(국내)': 13417, '중국': 16640, '홍콩': 541, 'ST미국': 1578, '기타': 2 },
      '2024_Year': { 'OC(국내)': 40353, '중국': 45267, '홍콩': 2012, 'ST미국': 5487, '기타': 12 },
      '2025_1Q': { 'OC(국내)': 8142, '중국': 14553, '홍콩': 533, 'ST미국': 1379, '기타': 2 },
      '2025_1Q_Year': { 'OC(국내)': 8142, '중국': 14553, '홍콩': 533, 'ST미국': 1379, '기타': 2 },
      '2025_2Q': { 'OC(국내)': 8488, '중국': 9118, '홍콩': 554, 'ST미국': 1386, '기타': -7 },
      '2025_2Q_Year': { 'OC(국내)': 16630, '중국': 23671, '홍콩': 1087, 'ST미국': 2765, '기타': -5 },
      '2025_3Q': { 'OC(국내)': 6683, '중국': 16327, '홍콩': 584, 'ST미국': 1462, '기타': -25 },
      '2025_3Q_Year': { 'OC(국내)': 23313, '중국': 39998, '홍콩': 1671, 'ST미국': 4227, '기타': -30 },
      '2025_4Q': { 'OC(국내)': 13177, '중국': 20569, '홍콩': 1144, 'ST미국': 5049, '기타': -35 },
      '2025_Year': { 'OC(국내)': 36490, '중국': 60567, '홍콩': 2815, 'ST미국': 9276, '기타': -65 },
    },
    // (3)수수료 = 운반비 + 지급수수료 (맵핑표 기준)
    '수수료': {
      '2024_1Q': { 'OC(국내)': 103398, '중국': 11140, '홍콩': 4655, 'ST미국': 2055, '기타': -2478 },
      '2024_1Q_Year': { 'OC(국내)': 103398, '중국': 11140, '홍콩': 4655, 'ST미국': 2055, '기타': -2478 },
      '2024_2Q': { 'OC(국내)': 89436, '중국': 8168, '홍콩': 1479, 'ST미국': 2746, '기타': 507 },
      '2024_2Q_Year': { 'OC(국내)': 192834, '중국': 19308, '홍콩': 6134, 'ST미국': 4801, '기타': -1970 },
      '2024_3Q': { 'OC(국내)': 82954, '중국': 8951, '홍콩': 811, 'ST미국': 2629, '기타': 1119 },
      '2024_3Q_Year': { 'OC(국내)': 275788, '중국': 28259, '홍콩': 6945, 'ST미국': 7430, '기타': -851 },
      '2024_4Q': { 'OC(국내)': 121114, '중국': 13237, '홍콩': 1688, 'ST미국': -528, '기타': 401 },
      '2024_Year': { 'OC(국내)': 396902, '중국': 41496, '홍콩': 8633, 'ST미국': 6902, '기타': -451 },
      '2025_1Q': { 'OC(국내)': 98102, '중국': 13152, '홍콩': 2341, 'ST미국': 1487, '기타': -294 },
      '2025_1Q_Year': { 'OC(국내)': 98102, '중국': 13152, '홍콩': 2341, 'ST미국': 1487, '기타': -294 },
      '2025_2Q': { 'OC(국내)': 82021, '중국': 10209, '홍콩': 1841, 'ST미국': 1804, '기타': -713 },
      '2025_2Q_Year': { 'OC(국내)': 180123, '중국': 23361, '홍콩': 4182, 'ST미국': 3291, '기타': -1006 },
      '2025_3Q': { 'OC(국내)': 78829, '중국': 11034, '홍콩': 2220, 'ST미국': 1736, '기타': 88 },
      '2025_3Q_Year': { 'OC(국내)': 258952, '중국': 34395, '홍콩': 6402, 'ST미국': 5027, '기타': -919 },
      '2025_4Q': { 'OC(국내)': 120392, '중국': 18816, '홍콩': 452, 'ST미국': 13662, '기타': 1700 },
      '2025_Year': { 'OC(국내)': 379344, '중국': 53211, '홍콩': 6854, 'ST미국': 18689, '기타': 781 },
    },
    '감가상각비': {
      '2024_1Q': { 'OC(국내)': 10413, '중국': 5331, '홍콩': 3792, 'ST미국': 148, '기타': 880 },
      '2024_1Q_Year': { 'OC(국내)': 10413, '중국': 5331, '홍콩': 3792, 'ST미국': 148, '기타': 880 },
      '2024_2Q': { 'OC(국내)': 10777, '중국': 6017, '홍콩': 3759, 'ST미국': -150, '기타': 1134 },
      '2024_2Q_Year': { 'OC(국내)': 21190, '중국': 11348, '홍콩': 7551, 'ST미국': -2, '기타': 2014 },
      '2024_3Q': { 'OC(국내)': 11821, '중국': 6247, '홍콩': 3540, 'ST미국': 344, '기타': 1314 },
      '2024_3Q_Year': { 'OC(국내)': 33011, '중국': 17595, '홍콩': 11091, 'ST미국': 342, '기타': 3328 },
      '2024_4Q': { 'OC(국내)': 12446, '중국': 6711, '홍콩': 3263, 'ST미국': 120, '기타': 898 },
      '2024_Year': { 'OC(국내)': 45457, '중국': 24306, '홍콩': 14354, 'ST미국': 462, '기타': 4226 },
      '2025_1Q': { 'OC(국내)': 12795, '중국': 7629, '홍콩': 3123, 'ST미국': 118, '기타': 842 },
      '2025_1Q_Year': { 'OC(국내)': 12795, '중국': 7629, '홍콩': 3123, 'ST미국': 118, '기타': 842 },
      '2025_2Q': { 'OC(국내)': 13172, '중국': 6120, '홍콩': 1876, 'ST미국': 121, '기타': 825 },
      '2025_2Q_Year': { 'OC(국내)': 25967, '중국': 13749, '홍콩': 4999, 'ST미국': 239, '기타': 1667 },
      '2025_3Q': { 'OC(국내)': 12849, '중국': 5468, '홍콩': 3008, 'ST미국': 118, '기타': 818 },
      '2025_3Q_Year': { 'OC(국내)': 38816, '중국': 19217, '홍콩': 8007, 'ST미국': 357, '기타': 2485 },
      '2025_4Q': { 'OC(국내)': 12720, '중국': 5799, '홍콩': 3462, 'ST미국': 119, '기타': 861 },
      '2025_Year': { 'OC(국내)': 51536, '중국': 25016, '홍콩': 11469, 'ST미국': 476, '기타': 3346 },
    },
    '기타판관비': {
      '2024_1Q': { 'OC(국내)': 11388, '중국': 5585, '홍콩': 1532, 'ST미국': 740, '기타': -69 },
      '2024_1Q_Year': { 'OC(국내)': 11388, '중국': 5585, '홍콩': 1532, 'ST미국': 740, '기타': -69 },
      '2024_2Q': { 'OC(국내)': 10441, '중국': 3883, '홍콩': 1390, 'ST미국': 767, '기타': 103 },
      '2024_2Q_Year': { 'OC(국내)': 21829, '중국': 9468, '홍콩': 2922, 'ST미국': 1507, '기타': 34 },
      '2024_3Q': { 'OC(국내)': 9439, '중국': 5952, '홍콩': 1478, 'ST미국': -1002, '기타': 1228 },
      '2024_3Q_Year': { 'OC(국내)': 31268, '중국': 15420, '홍콩': 4400, 'ST미국': 505, '기타': 1262 },
      '2024_4Q': { 'OC(국내)': 14379, '중국': 4950, '홍콩': 2397, 'ST미국': 1724, '기타': 137 },
      '2024_Year': { 'OC(국내)': 45647, '중국': 20370, '홍콩': 6797, 'ST미국': 2229, '기타': 1399 },
      '2025_1Q': { 'OC(국내)': 10904, '중국': 5466, '홍콩': 2581, 'ST미국': 1470, '기타': 151 },
      '2025_1Q_Year': { 'OC(국내)': 10904, '중국': 5466, '홍콩': 2581, 'ST미국': 1470, '기타': 151 },
      '2025_2Q': { 'OC(국내)': 9650, '중국': 3353, '홍콩': 2577, 'ST미국': 1503, '기타': 110 },
      '2025_2Q_Year': { 'OC(국내)': 20554, '중국': 8819, '홍콩': 5158, 'ST미국': 2973, '기타': 261 },
      '2025_3Q': { 'OC(국내)': 8091, '중국': 5795, '홍콩': 2164, 'ST미국': 3297, '기타': 145 },
      '2025_3Q_Year': { 'OC(국내)': 28645, '중국': 14614, '홍콩': 7322, 'ST미국': 6270, '기타': 406 },
      '2025_4Q': { 'OC(국내)': 13594, '중국': 6556, '홍콩': 2435, 'ST미국': -1322, '기타': 128 },
      '2025_Year': { 'OC(국내)': 42239, '중국': 21170, '홍콩': 9757, 'ST미국': 4948, '기타': 534 },
    },
    '영업이익': {
      '2024_1Q': { 'OC(국내)': 95453, '중국': 24681, '홍콩': 650, 'ST미국': 2590, '기타': 6837 },
      '2024_1Q_Year': { 'OC(국내)': 95453, '중국': 24681, '홍콩': 650, 'ST미국': 2590, '기타': 6837 },
      '2024_2Q': { 'OC(국내)': 54078, '중국': 20705, '홍콩': 496, 'ST미국': -2591, '기타': 19113 },
      '2024_2Q_Year': { 'OC(국내)': 149531, '중국': 45386, '홍콩': 1146, 'ST미국': -1, '기타': 25950 },
      '2024_3Q': { 'OC(국내)': 137103, '중국': 13295, '홍콩': 455, 'ST미국': 3320, '기타': -45869 },
      '2024_3Q_Year': { 'OC(국내)': 286634, '중국': 58681, '홍콩': 1601, 'ST미국': 3319, '기타': -19919 },
      '2024_4Q': { 'OC(국내)': 115771, '중국': -22584, '홍콩': 1754, 'ST미국': 3582, '기타': 21897 },
      '2024_Year': { 'OC(국내)': 402405, '중국': 36097, '홍콩': 3355, 'ST미국': 6901, '기타': 1978 },
      '2025_1Q': { 'OC(국내)': 111977, '중국': 6110, '홍콩': 2, 'ST미국': 996, '기타': 4531 },
      '2025_1Q_Year': { 'OC(국내)': 111977, '중국': 6110, '홍콩': 2, 'ST미국': 996, '기타': 4531 },
      '2025_2Q': { 'OC(국내)': 80599, '중국': -341, '홍콩': 187, 'ST미국': 993, '기타': 2591 },
      '2025_2Q_Year': { 'OC(국내)': 192576, '중국': 5769, '홍콩': 189, 'ST미국': 1989, '기타': 7122 },
      '2025_3Q': { 'OC(국내)': 192567, '중국': 30053, '홍콩': -1247, 'ST미국': 5429, '기타': -98783 },
      '2025_3Q_Year': { 'OC(국내)': 385143, '중국': 35822, '홍콩': -1058, 'ST미국': 7418, '기타': -91661 },
      '2025_4Q': { 'OC(국내)': 139306, '중국': 4385, '홍콩': 2673, 'ST미국': -8788, '기타': -4700 },
      '2025_Year': { 'OC(국내)': 524449, '중국': 40207, '홍콩': 1615, 'ST미국': -1370, '기타': -96361 },
    },
    '외환손익': {
      '2024_1Q': { 'OC(국내)': 2522, '중국': 0, '홍콩': -28, 'ST미국': -153, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 2522, '중국': 0, '홍콩': -28, 'ST미국': -153, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 3226, '중국': 0, '홍콩': -15, 'ST미국': 153, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 5748, '중국': 0, '홍콩': -43, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': -2976, '중국': 0, '홍콩': 42, 'ST미국': -987, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 2772, '중국': 0, '홍콩': -1, 'ST미국': -987, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 8035, '중국': 0, '홍콩': -30, 'ST미국': 384, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': 10807, '중국': 0, '홍콩': -31, 'ST미국': -603, '기타': 0 },
      '2024_Year': { 'OC(국내)': 10807, '중국': 0, '홍콩': -31, 'ST미국': -603, '기타': 0 },
      '2025_1Q': { 'OC(국내)': -3242, '중국': 0, '홍콩': -1, 'ST미국': -105, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': -3242, '중국': 0, '홍콩': -1, 'ST미국': -105, '기타': 0 },
      '2025_2Q': { 'OC(국내)': -4988, '중국': 0, '홍콩': 190, 'ST미국': -164, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': -8230, '중국': 0, '홍콩': 189, 'ST미국': -269, '기타': 0 },
      '2025_3Q': { 'OC(국내)': 6568, '중국': 0, '홍콩': -31, 'ST미국': 176, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': -1662, '중국': 0, '홍콩': 158, 'ST미국': -93, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 4370, '중국': 0, '홍콩': -9, 'ST미국': 283, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': 2708, '중국': 0, '홍콩': 149, 'ST미국': 190, '기타': 0 },
      '2025_Year': { 'OC(국내)': 2708, '중국': 0, '홍콩': 149, 'ST미국': 190, '기타': 0 },
    },
    '선물환손익': {
      '2024_1Q': { 'OC(국내)': 209, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 209, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 243, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 452, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': -358, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 94, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 277, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': 371, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_Year': { 'OC(국내)': 371, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q': { 'OC(국내)': -3333, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': -3333, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 11729, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': 8396, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q': { 'OC(국내)': -5573, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 2823, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q': { 'OC(국내)': -4172, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': -1349, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_Year': { 'OC(국내)': -1349, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
    },
    '금융상품손익': {
      '2024_1Q': { 'OC(국내)': -1673, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': -1673, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 3492, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 1819, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': -2518, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': -699, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 1127, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': 428, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_Year': { 'OC(국내)': 428, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q': { 'OC(국내)': -811, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': -811, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 46, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': -765, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q': { 'OC(국내)': -500, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': -1265, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 200, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': -1065, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_Year': { 'OC(국내)': -1065, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
    },
    '이자손익': {
      '2024_1Q': { 'OC(국내)': -259, '중국': -460, '홍콩': -186, 'ST미국': -135, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': -259, '중국': -460, '홍콩': -186, 'ST미국': -135, '기타': 0 },
      '2024_2Q': { 'OC(국내)': -64, '중국': -510, '홍콩': -159, 'ST미국': 135, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': -323, '중국': -970, '홍콩': -345, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': -253, '중국': -399, '홍콩': -149, 'ST미국': -305, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': -576, '중국': -1369, '홍콩': -494, 'ST미국': -305, '기타': 0 },
      '2024_4Q': { 'OC(국내)': -791, '중국': -802, '홍콩': -140, 'ST미국': -163, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': -1367, '중국': -2171, '홍콩': -634, 'ST미국': -468, '기타': 0 },
      '2024_Year': { 'OC(국내)': -1367, '중국': -2171, '홍콩': -634, 'ST미국': -468, '기타': 0 },
      '2025_1Q': { 'OC(국내)': -971, '중국': -784, '홍콩': -161, 'ST미국': -198, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': -971, '중국': -784, '홍콩': -161, 'ST미국': -198, '기타': 0 },
      '2025_2Q': { 'OC(국내)': -1074, '중국': -381, '홍콩': 73, 'ST미국': -429, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': -2045, '중국': -1165, '홍콩': -88, 'ST미국': -627, '기타': 0 },
      '2025_3Q': { 'OC(국내)': -388, '중국': -587, '홍콩': -117, 'ST미국': -278, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': -2433, '중국': -1752, '홍콩': -205, 'ST미국': -905, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 99, '중국': -1116, '홍콩': -132, 'ST미국': -377, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': -2334, '중국': -2868, '홍콩': -337, 'ST미국': -1282, '기타': 0 },
      '2025_Year': { 'OC(국내)': -2334, '중국': -2868, '홍콩': -337, 'ST미국': -1282, '기타': 0 },
    },
    '배당수익': {
      '2024_1Q': { 'OC(국내)': 61, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 61, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 2144, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 2205, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': 10873, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 13078, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q': { 'OC(국내)': -271, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': 12807, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_Year': { 'OC(국내)': 12807, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q': { 'OC(국내)': 337, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': 337, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 37, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': 374, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q': { 'OC(국내)': 10267, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 10641, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 100, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': 10741, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_Year': { 'OC(국내)': 10741, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
    },
    '기부금': {
      '2024_1Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': -94, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': -94, '기타': 0 },
      '2024_2Q': { 'OC(국내)': -403, '중국': 0, '홍콩': 0, 'ST미국': 94, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': -403, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': -1909, '중국': 0, '홍콩': 0, 'ST미국': -95, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': -2312, '중국': 0, '홍콩': 0, 'ST미국': -95, '기타': 0 },
      '2024_4Q': { 'OC(국내)': -826, '중국': 0, '홍콩': 0, 'ST미국': -1, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': -3138, '중국': 0, '홍콩': 0, 'ST미국': -96, '기타': 0 },
      '2024_Year': { 'OC(국내)': -3138, '중국': 0, '홍콩': 0, 'ST미국': -96, '기타': 0 },
      '2025_1Q': { 'OC(국내)': -5, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': -5, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': -5, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q': { 'OC(국내)': -78, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': -83, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 19, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': -64, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_Year': { 'OC(국내)': -64, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
    },
    '기타손익': {
      '2024_1Q': { 'OC(국내)': -1064, '중국': 110, '홍콩': 8, 'ST미국': 0, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': -1064, '중국': 110, '홍콩': 8, 'ST미국': 0, '기타': 0 },
      '2024_2Q': { 'OC(국내)': -40, '중국': 109, '홍콩': 8, 'ST미국': 0, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': -1104, '중국': 219, '홍콩': 16, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': 490, '중국': -248, '홍콩': 4, 'ST미국': -2381, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': -614, '중국': -29, '홍콩': 20, 'ST미국': -2381, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 229, '중국': -155, '홍콩': 9, 'ST미국': -7193, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': -385, '중국': -184, '홍콩': 29, 'ST미국': -9574, '기타': 0 },
      '2024_Year': { 'OC(국내)': -385, '중국': -184, '홍콩': 29, 'ST미국': -9574, '기타': 0 },
      '2025_1Q': { 'OC(국내)': 1330, '중국': -340, '홍콩': 10, 'ST미국': -3572, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': 1330, '중국': -340, '홍콩': 10, 'ST미국': -3572, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 612, '중국': -1180, '홍콩': -37, 'ST미국': -2590, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': 1942, '중국': -1520, '홍콩': -27, 'ST미국': -6162, '기타': 0 },
      '2025_3Q': { 'OC(국내)': -1012, '중국': -555, '홍콩': 7, 'ST미국': -2722, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 930, '중국': -2075, '홍콩': -20, 'ST미국': -8884, '기타': 0 },
      '2025_4Q': { 'OC(국내)': -1870, '중국': 42, '홍콩': -1, 'ST미국': 7452, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': -940, '중국': -2033, '홍콩': -21, 'ST미국': -1432, '기타': 0 },
      '2025_Year': { 'OC(국내)': -940, '중국': -2033, '홍콩': -21, 'ST미국': -1432, '기타': 0 },
    },
    '영업외손익': {
      '2024_1Q': { 'OC(국내)': -202, '중국': -350, '홍콩': -205, 'ST미국': -382, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': -202, '중국': -350, '홍콩': -205, 'ST미국': -382, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 8597, '중국': -400, '홍콩': -166, 'ST미국': 382, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 8395, '중국': -750, '홍콩': -371, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': 3347, '중국': -647, '홍콩': -104, 'ST미국': -3768, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 11742, '중국': -1397, '홍콩': -475, 'ST미국': -3768, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 12569, '중국': -956, '홍콩': -160, 'ST미국': -6974, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': 24311, '중국': -2353, '홍콩': -635, 'ST미국': -10742, '기타': 0 },
      '2024_Year': { 'OC(국내)': 24311, '중국': -2353, '홍콩': -635, 'ST미국': -10742, '기타': 0 },
      '2025_1Q': { 'OC(국내)': -6695, '중국': -1125, '홍콩': -152, 'ST미국': -3875, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': -6695, '중국': -1125, '홍콩': -152, 'ST미국': -3875, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 6361, '중국': -1560, '홍콩': 227, 'ST미국': -3184, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': -334, '중국': -2685, '홍콩': 75, 'ST미국': -7059, '기타': 0 },
      '2025_3Q': { 'OC(국내)': 9283, '중국': -1142, '홍콩': -140, 'ST미국': -2824, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 8949, '중국': -3827, '홍콩': -65, 'ST미국': -9883, '기타': 0 },
      '2025_4Q': { 'OC(국내)': -1256, '중국': -1075, '홍콩': -141, 'ST미국': 7356, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': 7693, '중국': -4902, '홍콩': -206, 'ST미국': -2527, '기타': 0 },
      '2025_Year': { 'OC(국내)': 7693, '중국': -4902, '홍콩': -206, 'ST미국': -2527, '기타': 0 },
    },
    '지분법손익': {
      '2024_1Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_4Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2024_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_4Q_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
      '2025_Year': { 'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0 },
    },
    '법인세비용차감전순이익': {
      '2024_1Q': { 'OC(국내)': 95252, '중국': 24331, '홍콩': 444, 'ST미국': 2209, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 95252, '중국': 24331, '홍콩': 444, 'ST미국': 2209, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 62676, '중국': 20305, '홍콩': 331, 'ST미국': -2209, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 157928, '중국': 44636, '홍콩': 775, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': 140450, '중국': 12649, '홍콩': 351, 'ST미국': -448, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 298378, '중국': 57285, '홍콩': 1126, 'ST미국': -448, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 128341, '중국': -23541, '홍콩': 1594, 'ST미국': -3391, '기타': 0 },
      '2024_Year': { 'OC(국내)': 426719, '중국': 33744, '홍콩': 2720, 'ST미국': -3839, '기타': 0 },
      '2025_1Q': { 'OC(국내)': 105283, '중국': 4985, '홍콩': -149, 'ST미국': -2879, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': 105283, '중국': 4985, '홍콩': -149, 'ST미국': -2879, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 86960, '중국': -1900, '홍콩': 414, 'ST미국': -2190, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': 192243, '중국': 3085, '홍콩': 265, 'ST미국': -5069, '기타': 0 },
      '2025_3Q': { 'OC(국내)': 201850, '중국': 28911, '홍콩': -1387, 'ST미국': 2607, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 394093, '중국': 31996, '홍콩': -1122, 'ST미국': -2462, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 138051, '중국': 3311, '홍콩': 2532, 'ST미국': -1431, '기타': 0 },
      '2025_Year': { 'OC(국내)': 532144, '중국': 35307, '홍콩': 1410, 'ST미국': -3893, '기타': 0 },
    },
    '법인세비용': {
      '2024_1Q': { 'OC(국내)': 23065, '중국': 6272, '홍콩': 126, 'ST미국': 0, '기타': 0 },
      '2024_1Q_Year': { 'OC(국내)': 23065, '중국': 6272, '홍콩': 126, 'ST미국': 0, '기타': 0 },
      '2024_2Q': { 'OC(국내)': 14172, '중국': 4955, '홍콩': 64, 'ST미국': 0, '기타': 0 },
      '2024_2Q_Year': { 'OC(국내)': 37237, '중국': 11227, '홍콩': 190, 'ST미국': 0, '기타': 0 },
      '2024_3Q': { 'OC(국내)': 34564, '중국': 3170, '홍콩': 349, 'ST미국': 28, '기타': 0 },
      '2024_3Q_Year': { 'OC(국내)': 71801, '중국': 14397, '홍콩': 539, 'ST미국': 28, '기타': 0 },
      '2024_4Q': { 'OC(국내)': 31386, '중국': -5875, '홍콩': 54, 'ST미국': 0, '기타': 0 },
      '2024_Year': { 'OC(국내)': 103187, '중국': 8522, '홍콩': 593, 'ST미국': 28, '기타': 0 },
      '2025_1Q': { 'OC(국내)': 25444, '중국': 1292, '홍콩': 24, 'ST미국': 174, '기타': 0 },
      '2025_1Q_Year': { 'OC(국내)': 25444, '중국': 1292, '홍콩': 24, 'ST미국': 174, '기타': 0 },
      '2025_2Q': { 'OC(국내)': 22754, '중국': -443, '홍콩': 16, 'ST미국': 329, '기타': 0 },
      '2025_2Q_Year': { 'OC(국내)': 48198, '중국': 849, '홍콩': 40, 'ST미국': 503, '기타': 0 },
      '2025_3Q': { 'OC(국내)': 50908, '중국': 7225, '홍콩': -76, 'ST미국': -153, '기타': 0 },
      '2025_3Q_Year': { 'OC(국내)': 99106, '중국': 8074, '홍콩': -36, 'ST미국': 350, '기타': 0 },
      '2025_4Q': { 'OC(국내)': 33548, '중국': 885, '홍콩': 403, 'ST미국': -19, '기타': 0 },
      '2025_Year': { 'OC(국내)': 132654, '중국': 8959, '홍콩': 367, 'ST미국': 331, '기타': 0 },
    },
    '당기순이익': {
      '2024_1Q': { 'OC(국내)': 72186, '중국': 18059, '홍콩': 318, 'ST미국': 2208, '기타': 3550 },
      '2024_1Q_Year': { 'OC(국내)': 72186, '중국': 18059, '홍콩': 318, 'ST미국': 2208, '기타': 3550 },
      '2024_2Q': { 'OC(국내)': 48504, '중국': 15349, '홍콩': 267, 'ST미국': -2157, '기타': 11988 },
      '2024_2Q_Year': { 'OC(국내)': 120690, '중국': 33408, '홍콩': 585, 'ST미국': 51, '기타': 15538 },
      '2024_3Q': { 'OC(국내)': 105886, '중국': 9478, '홍콩': 1, 'ST미국': -528, '기타': -35036 },
      '2024_3Q_Year': { 'OC(국내)': 226576, '중국': 42886, '홍콩': 586, 'ST미국': -477, '기타': -19498 },
      '2024_4Q': { 'OC(국내)': 96955, '중국': -17666, '홍콩': 1540, 'ST미국': -3392, '기타': 28448 },
      '2024_Year': { 'OC(국내)': 323531, '중국': 25220, '홍콩': 2126, 'ST미국': -3869, '기타': 8950 },
      '2025_1Q': { 'OC(국내)': 79838, '중국': 3692, '홍콩': -174, 'ST미국': -3054, '기타': 2267 },
      '2025_1Q_Year': { 'OC(국내)': 79838, '중국': 3692, '홍콩': -174, 'ST미국': -3054, '기타': 2267 },
      '2025_2Q': { 'OC(국내)': 64206, '중국': -1458, '홍콩': 397, 'ST미국': -2519, '기타': 2012 },
      '2025_2Q_Year': { 'OC(국내)': 144044, '중국': 2234, '홍콩': 223, 'ST미국': -5573, '기타': 4279 },
      '2025_3Q': { 'OC(국내)': 150942, '중국': 21685, '홍콩': -1312, 'ST미국': 2759, '기타': -73379 },
      '2025_3Q_Year': { 'OC(국내)': 294986, '중국': 23919, '홍콩': -1089, 'ST미국': -2814, '기타': -69100 },
      '2025_4Q': { 'OC(국내)': 104502, '중국': 2426, '홍콩': 2129, 'ST미국': -1412, '기타': 49163 },
      '2025_Year': { 'OC(국내)': 399488, '중국': 26345, '홍콩': 1040, 'ST미국': -4226, '기타': -19937 },
    },
  }, '2025', yearCloneRules);

  // ============================================
  // 법인별 재무상태표 데이터 (컴포넌트 상위 레벨)
  // entity_bs_data.json 기반 업데이트 (단위: 백만원)
  // ============================================
  const entityBSData = normalizeYearDataset({
    '2024_1Q': {
      현금성자산: { 'OC(국내)': 291693, 중국: 12162, 홍콩: 4132, ST미국: 22754, 기타: 3966 },
      매출채권: { 'OC(국내)': 109224, 중국: 7225, 홍콩: 3399, ST미국: 3441, 기타: -40920 },
      재고자산: { 'OC(국내)': 232095, 중국: 136110, 홍콩: 33179, ST미국: 4244, 기타: -81792 },
      유무형자산: { 'OC(국내)': 197870, 중국: 9894, 홍콩: 3560, ST미국: 58713, 기타: 57846 },
      투자자산: { 'OC(국내)': 713027, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -61516 },
      차입금: { 'OC(국내)': 0, 중국: 72442, 홍콩: 0, ST미국: 9051, 기타: -8751 },
      매입채무: { 'OC(국내)': 69104, 중국: 5104, 홍콩: 45034, ST미국: 1191, 기타: -44537 },
      유동자산: { 'OC(국내)': 669592, 중국: 211429, 홍콩: 43691, ST미국: 33106, 기타: -158204 },
      비유동자산: { 'OC(국내)': 1095826, 중국: 60491, 홍콩: 20923, ST미국: 66182, 기타: 14334 },
      유동부채: { 'OC(국내)': 354161, 중국: 174209, 홍콩: 57363, ST미국: 13068, 기타: -81346 },
      비유동부채: { 'OC(국내)': 138707, 중국: 27039, 홍콩: 6697, ST미국: 1364, 기타: 16387 },
      이익잉여금: { 'OC(국내)': 971301, 중국: 54689, 홍콩: 1337, ST미국: -5831, 기타: -2617 },
      자산총계: { 'OC(국내)': 1765417, 중국: 271920, 홍콩: 64615, ST미국: 99288, 기타: -143870 },
      부채총계: { 'OC(국내)': 492867, 중국: 201248, 홍콩: 64061, ST미국: 14432, 기타: -64959 },
      자본총계: { 'OC(국내)': 1272550, 중국: 70672, 홍콩: 554, ST미국: 84856, 기타: -78911 },
      기타자산: { 'OC(국내)': 51187, 중국: 58620, 홍콩: 6728, ST미국: 3458 },
      미지급금: { 'OC(국내)': 93286, 홍콩: 105, ST미국: 1111 },
      보증금: { 'OC(국내)': 11178, 중국: 5182 },
      리스부채: { 'OC(국내)': 164995, 중국: 36563, 홍콩: 13126, ST미국: 1606 },
      기타부채: { 'OC(국내)': 154252, 중국: 81955, 홍콩: 5795, ST미국: 1472 },
    },
    '2024_2Q': {
      현금성자산: { 'OC(국내)': 161519, 중국: 27175, 홍콩: 3743, ST미국: 23099, 기타: 5075 },
      금융자산: { 'OC(국내)': 17856, 중국: 0, 홍콩: 0, ST미국: 0, 기타: 891 },
      매출채권: { 'OC(국내)': 91507, 중국: 7183, 홍콩: 2816, ST미국: 5174, 기타: -38821 },
      재고자산: { 'OC(국내)': 207444, 중국: 115040, 홍콩: 30582, ST미국: 4806, 기타: -64973 },
      유무형자산: { 'OC(국내)': 251498, 중국: 10189, 홍콩: 3419, ST미국: 66586, 기타: 52414 },
      투자자산: { 'OC(국내)': 722577, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -71320 },
      차입금: { 'OC(국내)': 0, 중국: 0, 홍콩: 0, ST미국: 9440, 기타: -9140 },
      매입채무: { 'OC(국내)': 48681, 중국: 1415, 홍콩: 42027, ST미국: 3799, 기타: -32966 },
      유동자산: { 'OC(국내)': 485999, 중국: 177683, 홍콩: 40576, ST미국: 37121, 기타: -118307 },
      비유동자산: { 'OC(국내)': 1150711, 중국: 65550, 홍콩: 18592, ST미국: 68165, 기타: 287 },
      유동부채: { 'OC(국내)': 195197, 중국: 125339, 홍콩: 52622, ST미국: 15764, 기타: -64084 },
      비유동부채: { 'OC(국내)': 135731, 중국: 30004, 홍콩: 5819, ST미국: 1404, 기타: 16445 },
      이익잉여금: { 'OC(국내)': 1019471, 중국: 70038, 홍콩: 1604, ST미국: -5328, 기타: 6940 },
      자산총계: { 'OC(국내)': 1636710, 중국: 243233, 홍콩: 59168, ST미국: 105286, 기타: -118020 },
      부채총계: { 'OC(국내)': 330928, 중국: 155343, 홍콩: 58441, ST미국: 17169, 기타: -47639 },
      자본총계: { 'OC(국내)': 1305782, 중국: 87890, 홍콩: 727, ST미국: 88118, 기타: -70382 },
      기타자산: { 'OC(국내)': 47727, 중국: 43577, 홍콩: 7002, ST미국: 4918 },
      미지급금: { 'OC(국내)': 30102, 중국: 2096, 홍콩: 191, ST미국: 877 },
      보증금: { 'OC(국내)': 10970, 중국: 5256 },
      리스부채: { 'OC(국내)': 159242, 중국: 42474, 홍콩: 11192, ST미국: 1572 },
      기타부채: { 'OC(국내)': 81934, 중국: 104103, 홍콩: 5031, ST미국: 1480 },
    },
    '2024_3Q': {
      현금성자산: { 'OC(국내)': 142325, 중국: 24304, 홍콩: 3061, ST미국: 19294, 기타: 1438 },
      금융자산: { 'OC(국내)': 12292, 중국: 5662, 홍콩: 0, ST미국: 0, 기타: 916 },
      매출채권: { 'OC(국내)': 137912, 중국: 81857, 홍콩: 2230, ST미국: 6587, 기타: -93341 },
      재고자산: { 'OC(국내)': 247068, 중국: 174481, 홍콩: 34086, ST미국: 5150, 기타: -99048 },
      유무형자산: { 'OC(국내)': 345549, 중국: 9901, 홍콩: 2659, ST미국: 63244, 기타: 20475 },
      투자자산: { 'OC(국내)': 699958, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -52885 },
      차입금: { 'OC(국내)': 0, 중국: 86820, 홍콩: 0, ST미국: 0, 기타: 0 },
      매입채무: { 'OC(국내)': 115166, 중국: 63397, 홍콩: 43473, ST미국: 1942, 기타: -93366 },
      유동자산: { 'OC(국내)': 583615, 중국: 298702, 홍콩: 43269, ST미국: 33198, 기타: -174882 },
      비유동자산: { 'OC(국내)': 1222861, 중국: 64669, 홍콩: 16570, ST미국: 64647, 기타: -13171 },
      유동부채: { 'OC(국내)': 260933, 중국: 238067, 홍콩: 53188, ST미국: 4631, 기타: -89778 },
      비유동부채: { 'OC(국내)': 136287, 중국: 28807, 홍콩: 5837, ST미국: 11729, 기타: 5090 },
      이익잉여금: { 'OC(국내)': 1125421, 중국: 79517, 홍콩: 1606, ST미국: -8634, 기타: -21546 },
      자산총계: { 'OC(국내)': 1806476, 중국: 363370, 홍콩: 59839, ST미국: 97845, 기타: -188052 },
      부채총계: { 'OC(국내)': 397220, 중국: 266874, 홍콩: 59025, ST미국: 16360, 기타: -84689 },
      자본총계: { 'OC(국내)': 1409256, 중국: 96496, 홍콩: 814, ST미국: 81486, 기타: -103365 },
      기타자산: { 'OC(국내)': 57246, 중국: 28043, 홍콩: 6839, ST미국: 3235 },
      미지급금: { 'OC(국내)': 34213, 중국: 1937, 홍콩: 111, ST미국: 990 },
      보증금: { 'OC(국내)': 10935, 중국: 5190 },
      리스부채: { 'OC(국내)': 158911, 중국: 41527, 홍콩: 10615, ST미국: 1411 },
      기타부채: { 'OC(국내)': 77888, 중국: 68002, 홍콩: 4825, ST미국: 1619 },
    },
    '2024_4Q': {
      현금성자산: { 'OC(국내)': 61500, 중국: 29229, 홍콩: 6073, ST미국: 22881, 기타: 150 },
      금융자산: { 'OC(국내)': 13441, 중국: 6038, 홍콩: 0, ST미국: 0, 기타: 916 },
      매출채권: { 'OC(국내)': 132432, 중국: 40081, 홍콩: 3967, ST미국: 5328, 기타: -47982 },
      재고자산: { 'OC(국내)': 214281, 중국: 141223, 홍콩: 35205, ST미국: 8723, 기타: -74440 },
      유무형자산: { 'OC(국내)': 609769, 중국: 10416, 홍콩: 2479, ST미국: 70443, 기타: 21889 },
      투자자산: { 'OC(국내)': 662308, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -9835 },
      차입금: { 'OC(국내)': 45000, 중국: 100635, 홍콩: 0, ST미국: 0, 기타: 0 },
      매입채무: { 'OC(국내)': 79795, 중국: 17885, 홍콩: 47089, ST미국: 6030, 기타: -48114 },
      유동자산: { 'OC(국내)': 441579, 중국: 256681, 홍콩: 48824, ST미국: 40431, 기타: -150721 },
      비유동자산: { 'OC(국내)': 1481924, 중국: 79929, 홍콩: 18420, ST미국: 71898, 기타: -3060 },
      유동부채: { 'OC(국내)': 305881, 중국: 218918, 홍콩: 59408, ST미국: 9779, 기타: -71877 },
      비유동부채: { 'OC(국내)': 123905, 중국: 33979, 홍콩: 5504, ST미국: 17189, 기타: 5920 },
      이익잉여금: { 'OC(국내)': 1222495, 중국: 61851, 홍콩: 3146, ST미국: -11153, 기타: 7016 },
      자산총계: { 'OC(국내)': 1923504, 중국: 336611, 홍콩: 67244, ST미국: 112329, 기타: -153783 },
      부채총계: { 'OC(국내)': 429786, 중국: 252897, 홍콩: 64912, ST미국: 26968, 기타: -65956 },
      자본총계: { 'OC(국내)': 1493718, 중국: 83714, 홍콩: 2333, ST미국: 85361, 기타: -87828 },
      기타자산: { 'OC(국내)': 51373, 중국: 62420, 홍콩: 8095, ST미국: 3639 },
      미지급금: { 'OC(국내)': 36054, 중국: 3925, 홍콩: 39, ST미국: 1601 },
      보증금: { 'OC(국내)': 11129, 중국: 5405 },
      리스부채: { 'OC(국내)': 151633, 중국: 49732, 홍콩: 11250, ST미국: 1477 },
      기타부채: { 'OC(국내)': 106175, 중국: 75315, 홍콩: 6533, ST미국: 1732 },
    },
    '2025_1Q': {
      현금성자산: { 'OC(국내)': 79496, 중국: 60404, 홍콩: 7022, ST미국: 16283, 기타: 839 },
      금융자산: { 'OC(국내)': 10966, 중국: 0, 홍콩: 0, 기타: 0 },
      매출채권: { 'OC(국내)': 123193, 중국: 20896, 홍콩: 2465, ST미국: 8621, 기타: -63936 },
      재고자산: { 'OC(국내)': 214607, 중국: 123617, 홍콩: 33553, ST미국: 9993, 기타: -67718 },
      유무형자산: { 'OC(국내)': 608500, 중국: 9050, 홍콩: 2480, ST미국: 67700, 기타: 14382 },
      투자자산: { 'OC(국내)': 713076, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -50365 },
      차입금: { 'OC(국내)': 20000, 중국: 56470, 홍콩: 0, ST미국: 0, 기타: 0 },
      매입채무: { 'OC(국내)': 69813, 중국: 28622, 홍콩: 44833, ST미국: 3153, 기타: -64453 },
      유동자산: { 'OC(국내)': 452307, 중국: 220602, 홍콩: 46719, ST미국: 36564, 기타: -134762 },
      비유동자산: { 'OC(국내)': 1492197, 중국: 69472, 홍콩: 18311, ST미국: 71798, 기타: -15259 },
      유동부채: { 'OC(국내)': 308799, 중국: 172560, 홍콩: 57271, ST미국: 6850, 기타: -64035 },
      비유동부채: { 'OC(국내)': 126330, 중국: 29892, 홍콩: 5706, ST미국: 20977, 기타: -376 },
      이익잉여금: { 'OC(국내)': 1238228, 중국: 65544, 홍콩: 2973, ST미국: -13973, 기타: 9488 },
      자산총계: { 'OC(국내)': 1944504, 중국: 290073, 홍콩: 65030, ST미국: 108362, 기타: -150019 },
      부채총계: { 'OC(국내)': 435129, 중국: 202453, 홍콩: 62976, ST미국: 27826, 기타: -64410 },
      자본총계: { 'OC(국내)': 1509375, 중국: 87621, 홍콩: 2054, ST미국: 80536, 기타: -85610 },
      기타자산: { 'OC(국내)': 57976, 중국: 39211, 홍콩: 8213, ST미국: 6310 },
      미지급금: { 'OC(국내)': 98569, 홍콩: 106, ST미국: 1020 },
      보증금: { 'OC(국내)': 10850, 중국: 7968 },
      리스부채: { 'OC(국내)': 153055, 중국: 38916, 홍콩: 11785, ST미국: 1360 },
      기타부채: { 'OC(국내)': 79728, 중국: 70477, 홍콩: 6252, ST미국: 2359 },
    },
    '2025_2Q': {
      현금성자산: { 'OC(국내)': 88735, 중국: 20311, 홍콩: 4732, ST미국: 12241, 기타: 421 },
      금융자산: { 'OC(국내)': 18833, 중국: 0, 홍콩: 0, ST미국: 0, 기타: 0 },
      매출채권: { 'OC(국내)': 81953, 중국: 8793, 홍콩: 3324, ST미국: 7117, 기타: -40009 },
      재고자산: { 'OC(국내)': 199308, 중국: 113822, 홍콩: 29260, ST미국: 9317, 기타: -58357 },
      유무형자산: { 'OC(국내)': 607960, 중국: 7699, 홍콩: 2490, ST미국: 64980, 기타: 18974 },
      투자자산: { 'OC(국내)': 714229, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -52262 },
      차입금: { 'OC(국내)': 0, 중국: 32157, 홍콩: 0, ST미국: 0, 기타: 0 },
      매입채무: { 'OC(국내)': 53644, 중국: 10263, 홍콩: 39679, ST미국: 3362, 기타: -38494 },
      유동자산: { 'OC(국내)': 408047, 중국: 167130, 홍콩: 41048, ST미국: 33539, 기타: -110363 },
      비유동자산: { 'OC(국내)': 1483356, 중국: 64553, 홍콩: 15263, ST미국: 66122, 기타: -17995 },
      유동부채: { 'OC(국내)': 192917, 중국: 124707, 홍콩: 49960, ST미국: 6598, 기타: -49258 },
      비유동부채: { 'OC(국내)': 125656, 중국: 26148, 홍콩: 3027, ST미국: 19395, 기타: 3794 },
      이익잉여금: { 'OC(국내)': 1301970, 중국: 64087, 홍콩: 3370, ST미국: -16515, 기타: 11690 },
      자산총계: { 'OC(국내)': 1891404, 중국: 231683, 홍콩: 56311, ST미국: 99662, 기타: -128360 },
      부채총계: { 'OC(국내)': 318573, 중국: 150855, 홍콩: 52987, ST미국: 25993, 기타: -45464 },
      자본총계: { 'OC(국내)': 1572831, 중국: 80828, 홍콩: 3324, ST미국: 73668, 기타: -82895 },
      기타자산: { 'OC(국내)': 50378, 중국: 50281, 홍콩: 7976, ST미국: 7145 },
      미지급금: { 'OC(국내)': 27259, 홍콩: 233, ST미국: 801 },
      보증금: { 'OC(국내)': 11774, 중국: 7791 },
      리스부채: { 'OC(국내)': 149411, 중국: 32763, 홍콩: 8923, ST미국: 1163 },
      기타부채: { 'OC(국내)': 76484, 중국: 67881, 홍콩: 4152, ST미국: 2026 },
    },
    '2025_3Q': {
      현금성자산: { 'OC(국내)': 182075, 중국: 9318, 홍콩: 4446, ST미국: 11400, 기타: 1046 },
      금융자산: { 'OC(국내)': 10260, 중국: 27555, 홍콩: 0, ST미국: 0, 기타: 0 },
      매출채권: { 'OC(국내)': 205309, 중국: 97531, 홍콩: 2871, ST미국: 16277, 기타: -162879 },
      재고자산: { 'OC(국내)': 242024, 중국: 281973, 홍콩: 34165, ST미국: 12558, 기타: -156694 },
      유무형자산: { 'OC(국내)': 605413, 중국: 8114, 홍콩: 3290, ST미국: 67161, 기타: 19102 },
      투자자산: { 'OC(국내)': 720011, 중국: 0, 홍콩: 0, ST미국: 0, 기타: -57764 },
      차입금: { 'OC(국내)': 0, 중국: 160605, 홍콩: 0, ST미국: 0, 기타: 0 },
      매입채무: { 'OC(국내)': 139941, 중국: 131315, 홍콩: 47089, ST미국: 3739, 기타: -163567 },
      유동자산: { 'OC(국내)': 664251, 중국: 430259, 홍콩: 45030, ST미국: 43158, 기타: -321480 },
      비유동자산: { 'OC(국내)': 1480945, 중국: 65505, 홍콩: 26191, ST미국: 68239, 기타: -1437 },
      유동부채: { 'OC(국내)': 302647, 중국: 364920, 홍콩: 60057, ST미국: 6953, 기타: -161014 },
      비유동부채: { 'OC(국내)': 121061, 중국: 24901, 홍콩: 9454, ST미국: 25808, 기타: -4624 },
      이익잉여금: { 'OC(국내)': 1453309, 중국: 85773, 홍콩: 2059, ST미국: -16489, 기타: -61405 },
      자산총계: { 'OC(국내)': 2145196, 중국: 495765, 홍콩: 71221, ST미국: 111397, 기타: -322917 },
      부채총계: { 'OC(국내)': 423707, 중국: 389821, 홍콩: 69512, ST미국: 32762, 기타: -165640 },
      자본총계: { 'OC(국내)': 1721489, 중국: 105943, 홍콩: 1710, ST미국: 78635, 기타: -157277 },
      기타자산: { 'OC(국내)': 55270, 중국: 40692, 홍콩: 8469, ST미국: 7836 },
      미지급금: { 'OC(국내)': 34936, 홍콩: 103, ST미국: 528 },
      보증금: { 'OC(국내)': 11221, 중국: 7732 },
      리스부채: { 'OC(국내)': 143137, 중국: 31700, 홍콩: 18361, ST미국: 1102 },
      기타부채: { 'OC(국내)': 94473, 중국: 58469, 홍콩: 3958, ST미국: 2253 },
    },
    '2025_4Q': {
      현금성자산: { 'OC(국내)': 270871, 중국: 12231, 홍콩: 5369, ST미국: 36527, 기타: 386 },
      금융자산: { 'OC(국내)': 9288, 중국: 16381, 홍콩: 0, ST미국: 0, 기타: 0 },
      매출채권: { 'OC(국내)': 196536, 중국: 67697, 홍콩: 4839, ST미국: 733, 기타: -118996 },
      재고자산: { 'OC(국내)': 219274, 중국: 306452, 홍콩: 31190, ST미국: 9288, 기타: -163351 },
      유무형자산: { 'OC(국내)': 599030, 중국: 7937, 홍콩: 3924, ST미국: 68716, 기타: 10601 },
      투자자산: { 'OC(국내)': 662420, 중국: 0, 홍콩: 0, ST미국: 0, 기타: 70205 },
      차입금: { 'OC(국내)': 0, 중국: 186267, 홍콩: 0, ST미국: 56270, 기타: 24700 },
      매입채무: { 'OC(국내)': 90452, 중국: 82388, 홍콩: 44694, ST미국: 6790, 기타: -119323 },
      유동자산: { 'OC(국내)': 716037, 중국: 418720, 홍콩: 44607, ST미국: 50448, 기타: -286328 },
      비유동자산: { 'OC(국내)': 1499461, 중국: 69389, 홍콩: 27221, ST미국: 69713, 기타: 42658 },
      유동부채: { 'OC(국내)': 280530, 중국: 349400, 홍콩: 58197, ST미국: 9982, 기타: -115701 },
      비유동부채: { 'OC(국내)': 111730, 중국: 26267, 홍콩: 9971, ST미국: 56835, 기타: -14860 },
      이익잉여금: { 'OC(국내)': 1558525, 중국: 88199, 홍콩: 4188, ST미국: -19074, 기타: -12023 },
      자산총계: { 'OC(국내)': 2215497, 중국: 488109, 홍콩: 71828, ST미국: 120161, 기타: -243670 },
      부채총계: { 'OC(국내)': 392260, 중국: 375667, 홍콩: 68168, ST미국: 66816, 기타: -130561 },
      자본총계: { 'OC(국내)': 1823238, 중국: 112443, 홍콩: 3660, ST미국: 53345, 기타: -113111 },
      기타자산: { 'OC(국내)': 48166, 중국: 43193, 홍콩: 8173, ST미국: 4035 },
      미지급금: { 'OC(국내)': 45522, 홍콩: 347, ST미국: 731 },
      보증금: { 'OC(국내)': 16060, 중국: 8003 },
      리스부채: { 'OC(국내)': 139007, 중국: 35073, 홍콩: 18568, ST미국: 1022 },
      기타부채: { 'OC(국내)': 101219, 중국: 63936, 홍콩: 4558, ST미국: 2004 },
    },
  }, '2025', yearCloneRules);
  // ─── 26.1Q 실제 CSV(2026_BS.csv) 기준 법인별 수치 Override ───────────────
  // normalizeYearDataset 이 2025_1Q를 그대로 복제하므로, 확정 수치로 덮어씀
  if (entityBSData['2026_1Q']) {
    Object.assign(entityBSData['2026_1Q'], {
      현금성자산:  { 'OC(국내)': 536963, 중국:  21942, 홍콩:  6260, ST미국:  4407, 기타:   428 },
      금융자산:    { 'OC(국내)':   9201, 중국:      0, 홍콩:     0, ST미국:     0, 기타:     0 },
      매출채권:    { 'OC(국내)': 123484, 중국:  91475, 홍콩:  4193, ST미국:  1159, 기타: -67056 },
      재고자산:    { 'OC(국내)': 221710, 중국: 250497, 홍콩: 31242, ST미국: 10181, 기타:-132907 },
      투자자산:    { 'OC(국내)': 727994, 중국:      0, 홍콩:     0, ST미국:     0, 기타:  13078 },
      차입금:      { 'OC(국내)':      0, 중국: 203391, 홍콩:     0, ST미국:     0, 기타:     0 },
      매입채무:    { 'OC(국내)':  63442, 중국:  30798, 홍콩: 44556, ST미국:  1642, 기타: -67154 },
      유동자산:    { 'OC(국내)': 913463, 중국: 397247, 홍콩: 44968, ST미국: 18194, 기타:-205091 },
      비유동자산:  { 'OC(국내)':1432028, 중국:  69440, 홍콩: 28037, ST미국: 73504, 기타:  55801 },
      유동부채:    { 'OC(국내)': 356027, 중국: 324434, 홍콩: 57763, ST미국:  4558, 기타: -64703 },
      비유동부채:  { 'OC(국내)': 107097, 중국:  14834, 홍콩: 10473, ST미국: 32832, 기타:   8082 },
      이익잉여금:  { 'OC(국내)':1617654, 중국:  95282, 홍콩:  4983, ST미국:-21429, 기타:  16940 },
      자산총계:    { 'OC(국내)':2345491, 중국: 466687, 홍콩: 73005, ST미국: 91698, 기타:-149290 },
      부채총계:    { 'OC(국내)': 463125, 중국: 339268, 홍콩: 68236, ST미국: 37390, 기타: -56622 },
      자본총계:    { 'OC(국내)':1882366, 중국: 127419, 홍콩:  4768, ST미국: 54307, 기타: -92667 },
      미지급금:    { 'OC(국내)': 135516, 중국:   2949, 홍콩:   137, ST미국:   714, 기타:    685 },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────
  // ============================================
  // AI 분석 함수
  // ============================================
  const generateAIAnalysis = () => {
    if (!selectedPeriod) {
      return {
        keyMetrics: {
          opMargin: { curr: 0, prev: 0, change: 0 },
          netMargin: { curr: 0, prev: 0, change: 0 },
          debtRatio: { curr: 0, prev: 0, status: '안정' },
          roe: { curr: 0, prev: 0, change: 0 }
        },
        insights: [],
        risks: [],
        actions: [],
        improvementTargets: []
      };
    }
    const selectedYearKey = getPeriodKey(selectedPeriod, 'year');
    const selectedYear = selectedPeriod ? Number(selectedPeriod.split('_')[0]) : 2026;
    const prevYearKey = getPeriodKey(selectedPeriod, 'prev_year') || `${selectedYear - 1}_Year`;
    // 재무상태표는 분기별 데이터이므로 quarter 키 사용 (bsCurrentPeriod와 동일하게)
    const currentPeriod = bsCurrentPeriod; // 전역 변수 사용으로 일관성 확보
    const prevPeriod = bsPrevPeriod; // 전역 변수 사용으로 일관성 확보
    
    // 1) 핵심 지표 계산
    const salesCurr = incomeStatementData[selectedYearKey]?.매출액 || 0;
    const salesPrev = incomeStatementData[prevYearKey]?.매출액 || 0;
    const opIncomeCurr = incomeStatementData[selectedYearKey]?.영업이익 || 0;
    const opIncomePrev = incomeStatementData[prevYearKey]?.영업이익 || 0;
    const netIncomeCurr = incomeStatementData[selectedYearKey]?.당기순이익 || 0;
    const netIncomePrev = incomeStatementData[prevYearKey]?.당기순이익 || 0;
    
    // 재무상태표 데이터 확인 및 계산 (안전한 접근)
    const bsCurr = balanceSheetData?.[currentPeriod] || {};
    const bsPrev = balanceSheetData?.[prevPeriod] || {};
    const totalAssetsCurr = bsCurr.자산총계 || 0;
    const totalAssetsPrev = bsPrev.자산총계 || 0;
    const totalDebtCurr = bsCurr.부채총계 || 0;
    const totalDebtPrev = bsPrev.부채총계 || 0;
    const totalEquityCurr = bsCurr.자본총계 || 0;
    const totalEquityPrev = bsPrev.자본총계 || 0;
    
    const opMarginCurr = salesCurr > 0 ? (opIncomeCurr / salesCurr * 100) : 0;
    const opMarginPrev = salesPrev > 0 ? (opIncomePrev / salesPrev * 100) : 0;
    const netMarginCurr = salesCurr > 0 ? (netIncomeCurr / salesCurr * 100) : 0;
    const netMarginPrev = salesPrev > 0 ? (netIncomePrev / salesPrev * 100) : 0;
    
    // 부채비율 계산 (부채총계 / 자본총계 * 100)
    let debtRatioCurr = 0;
    if (totalEquityCurr > 0) {
      debtRatioCurr = (totalDebtCurr / totalEquityCurr * 100);
      if (!isFinite(debtRatioCurr) || isNaN(debtRatioCurr)) debtRatioCurr = 0;
    } else if (totalDebtCurr > 0) {
      debtRatioCurr = 999; // 자본이 0인 경우
    }
    
    let debtRatioPrev = 0;
    if (totalEquityPrev > 0) {
      debtRatioPrev = (totalDebtPrev / totalEquityPrev * 100);
      if (!isFinite(debtRatioPrev) || isNaN(debtRatioPrev)) debtRatioPrev = 0;
    } else if (totalDebtPrev > 0) {
      debtRatioPrev = 999;
    }
    
    // ROE 계산 (당기순이익 / 자본총계 * 100)
    let roeCurr = 0;
    if (totalEquityCurr > 0) {
      roeCurr = (netIncomeCurr / totalEquityCurr * 100);
      if (!isFinite(roeCurr) || isNaN(roeCurr)) roeCurr = 0;
    }
    
    let roePrev = 0;
    if (totalEquityPrev > 0) {
      roePrev = (netIncomePrev / totalEquityPrev * 100);
      if (!isFinite(roePrev) || isNaN(roePrev)) roePrev = 0;
    }
    
    const salesGrowth = salesPrev > 0 ? ((salesCurr - salesPrev) / salesPrev * 100) : 0;
    const opMarginChange = opMarginCurr - opMarginPrev;
    const netMarginChange = netMarginCurr - netMarginPrev;
    const roeChange = roeCurr - roePrev;
    
    // 2) 법인별 수익성 분석 (영업이익률 + ROE)
    // entityBSData도 같은 currentPeriod 사용 (fallback 적용됨)
    const entityBSPeriod = entityBSData[currentPeriod] ? currentPeriod : (currentPeriod === '2025_4Q' ? '2025_3Q' : currentPeriod);
    
    const entityProfitability = ['OC(국내)', '중국', '홍콩', 'ST미국', '기타'].map(entity => {
      const sales = entityData.매출액?.[selectedYearKey]?.[entity] || 0;
      const opIncome = entityData.영업이익?.[selectedYearKey]?.[entity] || 0;
      const netIncome = entityData.당기순이익?.[selectedYearKey]?.[entity] || 0;
      const margin = sales > 0 ? (opIncome / sales * 100) : 0;
      
      // 법인별 ROE 계산 (법인별 당기순이익 / 법인별 자본총계 * 100)
      const entityEquity = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].자본총계) 
        ? (entityBSData[entityBSPeriod].자본총계[entity] || 0) 
        : 0;
      let entityROE = 0;
      if (entityEquity > 0) {
        entityROE = (netIncome / entityEquity * 100);
        if (!isFinite(entityROE) || isNaN(entityROE)) entityROE = 0;
      }
      
      return { entity, sales, opIncome, netIncome, margin, equity: entityEquity, roe: entityROE };
    }).sort((a, b) => b.margin - a.margin);
    
    // 3) 판관비 구조 분석
    const sgaBreakdown = ['인건비', '광고선전비', '수수료', '감가상각비', '기타판관비'].map(item => {
      const curr = incomeStatementData[selectedYearKey]?.[item] || 0;
      const prev = incomeStatementData[prevYearKey]?.[item] || 0;
      const change = prev > 0 ? ((curr - prev) / prev * 100) : 0;
      const salesRatio = salesCurr > 0 ? (curr / salesCurr * 100) : 0;
      return { item, curr, prev, change, salesRatio };
    }).sort((a, b) => b.curr - a.curr);
    
    // 4) 재무안정성 분석
    const cashCurr = bsCurr.현금및현금성자산 || bsCurr.현금성자산 || 0;
    const cashPrev = bsPrev.현금및현금성자산 || bsPrev.현금성자산 || 0;
    const arCurr = bsCurr.매출채권 || 0;
    const inventoryCurr = bsCurr.재고자산 || 0;
    const inventoryPrev = bsPrev.재고자산 || 0;
    const apCurr = bsCurr.매입채무 || 0;
    const workingCapitalCurr = arCurr + inventoryCurr - apCurr;
    
    const inventoryGrowth = inventoryPrev > 0 ? ((inventoryCurr - inventoryPrev) / inventoryPrev * 100) : 0;
    const cashGrowth = cashPrev > 0 ? ((cashCurr - cashPrev) / cashPrev * 100) : 0;
    
    // 5) 차입금 분석 (entityBSPeriod 사용)
    const borrowingsByEntity = ['OC(국내)', '중국', '홍콩', 'ST미국'].map(entity => {
      const debt = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].차입금) ? (entityBSData[entityBSPeriod].차입금[entity] || 0) : 0;
      const equity = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].자본총계) ? (entityBSData[entityBSPeriod].자본총계[entity] || 0) : 0;
      const debtRatio = equity > 0 ? (debt / equity * 100) : 0;
      return { entity, debt, equity, debtRatio };
    }).filter(x => x.debt > 0).sort((a, b) => b.debt - a.debt);
    
    const totalBorrowing = borrowingsByEntity.reduce((sum, x) => sum + x.debt, 0);
    
    // 6) 회전율 분석
    const inventoryTurnover = (salesCurr > 0 && inventoryCurr > 0) ? (salesCurr / inventoryCurr) : 0;
    const inventoryDays = inventoryTurnover > 0 ? (365 / inventoryTurnover) : 0;
    const arTurnover = (salesCurr > 0 && arCurr > 0) ? (salesCurr / arCurr) : 0;
    const arDays = arTurnover > 0 ? (365 / arTurnover) : 0;
    const apTurnover = (salesCurr > 0 && apCurr > 0) ? (salesCurr / apCurr) : 0;
    const apDays = apTurnover > 0 ? (365 / apTurnover) : 0;
    const cashConversionCycle = (arDays || 0) + (inventoryDays || 0) - (apDays || 0);
    
    // 7) 매출총이익률 분석
    const grossProfitCurr = incomeStatementData[selectedYearKey]?.매출총이익 || 0;
    const grossProfitPrev = incomeStatementData[prevYearKey]?.매출총이익 || 0;
    const grossMarginCurr = salesCurr > 0 ? (grossProfitCurr / salesCurr * 100) : 0;
    const grossMarginPrev = salesPrev > 0 ? (grossProfitPrev / salesPrev * 100) : 0;
    const grossMarginChange = grossMarginCurr - grossMarginPrev;
    
    // 8) 인사이트 생성
    const insights = [];
    const risks = [];
    const actions = [];
    const improvementTargets = []; // 개선 타겟 배열 초기화
    
    // 수익성 인사이트
    if (opMarginChange > 0) {
      insights.push({
        title: '영업이익률 개선',
        desc: `${opMarginCurr.toFixed(1)}%로 ${Math.abs(opMarginChange).toFixed(1)}%p 상승. ${
          salesGrowth < 0 ? '매출 감소에도 비용 관리 효과로 수익성 개선' : '매출 성장과 함께 수익성 동반 상승'
        }`
      });
    } else if (opMarginChange < -1) {
      risks.push({
        title: '수익성 악화',
        desc: `영업이익률 ${opMarginCurr.toFixed(1)}%로 ${Math.abs(opMarginChange).toFixed(1)}%p 하락. 비용 구조 점검 필요`
      });
    }
    
    // 매출총이익률 분석
    if (grossMarginChange < -2) {
      risks.push({
        title: '매출총이익률 하락',
        desc: `${grossMarginCurr.toFixed(1)}%로 ${Math.abs(grossMarginChange).toFixed(1)}%p 하락. 원가 상승 또는 가격 경쟁 심화`
      });
      actions.push({
        title: '원가율 개선',
        desc: `협력업체 협상력 강화, 소싱 다변화, 생산 효율 개선으로 원가율 2%p 절감 목표`
      });
    } else if (grossMarginChange > 2) {
      insights.push({
        title: '매출총이익률 개선',
        desc: `${grossMarginCurr.toFixed(1)}%로 ${grossMarginChange.toFixed(1)}%p 상승. 원가 관리 및 제품믹스 최적화 효과`
      });
    }
    
    // 회전율 인사이트
    if (inventoryDays > 0 && inventoryDays < 1000 && inventoryDays > 120) {
      risks.push({
        title: '재고회전율 저하',
        desc: `재고회전일수 ${Math.round(inventoryDays)}일. 재고 적체로 인한 현금흐름 악화 및 평가손실 리스크`
      });
    } else if (inventoryDays > 0 && inventoryDays < 60) {
      insights.push({
        title: '재고 효율성 우수',
        desc: `재고회전일수 ${Math.round(inventoryDays)}일. 빠른 재고 회전으로 운전자본 효율 극대화`
      });
    }
    
    if (arDays > 0 && arDays < 1000 && arDays > 60) {
      risks.push({
        title: '매출채권 회수 지연',
        desc: `회수기간 ${Math.round(arDays)}일. 현금흐름 압박 및 대손 리스크 증가`
      });
      actions.push({
        title: '채권 관리 강화',
        desc: `거래처 신용평가 강화, 조기 회수 인센티브, 팩토링 활용으로 회수기간 45일 목표`
      });
    }
    
    if (cashConversionCycle > 0 && cashConversionCycle < 1000 && cashConversionCycle > 90) {
      risks.push({
        title: '현금순환주기 장기화',
        desc: `${Math.round(cashConversionCycle)}일 소요. 운전자본 부담 및 자금 효율 저하`
      });
    }
    
    // 법인별 수익성 분석 (상세)
    // 중국은 이전가격 조정으로 영업이익률 ~4% 구조적 설정이므로 저수익 분석에서 제외
    const topProfitEntity = entityProfitability.length > 0 ? entityProfitability[0] : null;
    const lowProfitEntity = entityProfitability.find(e => e.margin < 15 && e.sales > 50000 && e.entity !== '중국' && e.entity !== 'ST미국');
    
    // 최고 수익성 법인 - 삭제됨 (사용자 요청)
    
    // 법인별 ROE 분석
    const entityROEAnalysis = entityProfitability
      .filter(e => e.equity > 0)
      .sort((a, b) => b.roe - a.roe);
    
    const topROEEntity = entityROEAnalysis.length > 0 ? entityROEAnalysis[0] : null;
    const lowROEEntity = entityROEAnalysis.find(e => e.roe < 10 && e.equity > 10000);
    
    // ST미국, 중국 제외하고 ROE 저하 분석 (ST미국: 소송비용 일시적, 중국: 이전가격 구조)
    const lowROEEntityExcludingST = entityROEAnalysis.find(e => e.roe < 10 && e.equity > 10000 && e.entity !== 'ST미국' && e.entity !== '중국');
    if (lowROEEntityExcludingST && topROEEntity && topROEEntity.roe > lowROEEntityExcludingST.roe + 5) {
      risks.push({
        title: `${lowROEEntityExcludingST.entity} 자본 효율성 저하`,
        desc: `ROE ${lowROEEntityExcludingST.roe.toFixed(1)}% (${topROEEntity.entity}: ${topROEEntity.roe.toFixed(1)}%). 자본 대비 수익 창출 능력 개선 필요`
      });
      actions.push({
        title: `${lowROEEntityExcludingST.entity} ROE 제고`,
        desc: `수익성 개선 또는 자본 구조 최적화로 ROE ${(lowROEEntityExcludingST.roe + 5).toFixed(1)}% 목표`
      });
    }
    
    // 법인별 규모와 수익성 불균형
    const totalSales = entityProfitability.reduce((sum, e) => sum + e.sales, 0);
    const totalOpIncome = entityProfitability.reduce((sum, e) => sum + e.opIncome, 0);
    const entityImbalance = entityProfitability.map(e => ({
      ...e,
      salesShare: totalSales > 0 ? (e.sales / totalSales * 100) : 0,
      profitShare: totalOpIncome > 0 ? (e.opIncome / totalOpIncome * 100) : 0
    })).filter(e => e.salesShare > 15 && e.profitShare < e.salesShare * 0.7 && e.entity !== '중국' && e.entity !== 'ST미국');
    
    if (entityImbalance.length > 0) {
      const target = entityImbalance[0];
      risks.push({
        title: `${target.entity} 수익 기여도 낮음`,
        desc: `매출 비중 ${target.salesShare.toFixed(0)}%지만 이익 기여 ${target.profitShare.toFixed(0)}%. 구조조정 또는 수익성 개선 시급`
      });
    }
    
    // 판관비 분석 (구체화)
    const highSGA = sgaBreakdown.filter(x => x.change > 15 && x.salesRatio > 10);
    if (highSGA.length > 0) {
      const top = highSGA[0];
      risks.push({
        title: `${top.item} 급증`,
        desc: `${formatNumber(Math.round(top.curr/100))}억원으로 전년대비 ${top.change.toFixed(1)}% 증가 (+${formatNumber(Math.round((top.curr-top.prev)/100))}억원), 매출대비 ${top.salesRatio.toFixed(1)}%`
      });
      actions.push({
        title: `${top.item} 최적화`,
        desc: `${top.item === '광고선전비' ? '디지털 마케팅 전환, ROI 2배 개선' : top.item === '인건비' ? '인당 생산성 20% 향상, 아웃소싱 확대' : '업무 프로세스 자동화'}`
      });
      
      const targetReduction = top.curr * 0.15; // 15% 절감 시
      let roeImpact = 0;
      if (totalEquityCurr > 0) {
        roeImpact = (targetReduction*0.73 / totalEquityCurr * 100);
        if (!isFinite(roeImpact) || isNaN(roeImpact)) roeImpact = 0;
      }
      
      improvementTargets.push({
        area: `${top.item} 구조 혁신`,
        current: `${formatNumber(Math.round(top.curr/100))}억원 (매출대비 ${top.salesRatio.toFixed(1)}%, 전년대비 +${top.change.toFixed(0)}%)`,
        target: `${formatNumber(Math.round(top.curr*0.85/100))}억원 (매출대비 ${(top.salesRatio*0.85).toFixed(1)}%)`,
        impact: `영업이익 +${formatNumber(Math.round(targetReduction/100))}억원 (+${(targetReduction/opIncomeCurr*100).toFixed(1)}%), 영업이익률 +${(targetReduction/salesCurr*100).toFixed(1)}%p, 당기순이익 +${formatNumber(Math.round(targetReduction*0.73/100))}억원, ROE +${roeImpact.toFixed(1)}%p`,
        method: top.item === '광고선전비' 
          ? `성과 기반 집행 체계 (매출 전환율 목표 달성 시 집행), 디지털 광고 비중 60%→80% 확대 (CPM 30% 절감), 대행사 수수료 재협상`
          : top.item === '인건비'
          ? `인당 매출액 목표 20% 상향, RPA·AI 도입으로 반복업무 자동화, 성과급 비중 확대 (고정급 억제), 비핵심 기능 아웃소싱`
          : top.item === '수수료'
          ? `물류·결제 수수료율 협상 (볼륨 기반 할인 확보), 직배송 비중 확대, 자체 풀필먼트 센터 구축 검토`
          : `비용 항목별 ROI 분석, 제로베이스 예산 도입, 비핵심 지출 30% 감축`
      });
    }
    
    // 현금 및 유동성 분석
    const cashRatio = totalAssetsCurr > 0 ? (cashCurr / totalAssetsCurr * 100) : 0;
    if (cashGrowth > 50) {
      insights.push({
        title: '유동성 대폭 개선',
        desc: `현금성자산 ${formatNumber(Math.round(cashCurr/100))}억원으로 ${cashGrowth.toFixed(0)}% 증가 (전년 +${formatNumber(Math.round((cashCurr-cashPrev)/100))}억원). 자산대비 ${cashRatio.toFixed(1)}%로 투자 여력 확보`
      });
      
      // 잉여현금이 많으면 활용 방안 제시
      if (cashCurr > totalAssetsCurr * 0.1) {
        actions.push({
          title: '잉여현금 전략적 활용',
          desc: `${formatNumber(Math.round(cashCurr*0.4/100))}억원을 M&A 또는 신규 브랜드에 투자 시 ROE ${totalEquityCurr > 0 ? (cashCurr*0.4*0.15/totalEquityCurr*100).toFixed(1) : '0.0'}%p 추가 개선 가능`
        });
        
        // 차입금 상환 시 이자비용 절감 효과 계산
        const debtRepaymentAmount = Math.min(cashCurr * 0.3, totalBorrowing * 0.5); // 현금의 30% 또는 차입금의 50% 중 작은 값
        const interestSavingFromRepayment = debtRepaymentAmount * 0.045; // 연 4.5% 이자 절감
        
        improvementTargets.push({
          area: '잉여현금 전략적 재배치',
          current: `현금성자산 ${formatNumber(Math.round(cashCurr/100))}억원 (자산대비 ${cashRatio.toFixed(1)}%), 차입금 ${formatNumber(Math.round(totalBorrowing/100))}억원`,
          target: `적정 현금 ${formatNumber(Math.round(cashCurr*0.6/100))}억원 유지 + 전략활용 ${formatNumber(Math.round(cashCurr*0.4/100))}억원`,
          impact: `전략 선택에 따라 ROE +0.5~2.0%p, 이자비용 절감 또는 성장투자 효과`,
          method: `옵션1: 차입금 ${formatNumber(Math.round(debtRepaymentAmount/100))}억원 상환 (이자비용 -${formatNumber(Math.round(interestSavingFromRepayment/100))}억원/년, 부채비율 개선), 옵션2: 고수익 브랜드 M&A (목표 ROE 18%+), 옵션3: 배당성향 확대 + 자사주 매입, 옵션4: 해외 거점 확대 투자`,
          rationale: `[목표 근거] 동종업계 적정 현금보유 비율 5~8% 대비 현재 ${cashRatio.toFixed(1)}%로 과다. 운영자금 + 비상예비금 감안 시 60% 유지로 충분. 잉여 40%는 ①차입금 상환(이자절감+재무안정성), ②M&A(성장), ③주주환원 중 전략적 선택 필요`
        });
      }
    } else if (cashCurr < totalAssetsCurr * 0.05) {
      risks.push({
        title: '유동성 부족',
        desc: `현금성자산 ${formatNumber(Math.round(cashCurr/100))}억원, 자산대비 ${cashRatio.toFixed(1)}%. 단기 자금 압박 리스크`
      });
      actions.push({
        title: '유동성 확보',
        desc: `재고 감축, 매출채권 팩토링, 단기 여신 한도 확보로 ${formatNumber(Math.round(totalAssetsCurr*0.08/100))}억원 확보`
      });
    }
    
    // 자산 효율성 분석
    const assetTurnover = totalAssetsCurr > 0 ? (salesCurr / totalAssetsCurr) : 0;
    const assetTurnoverPrev = totalAssetsPrev > 0 ? (salesPrev / totalAssetsPrev) : 0;
    if (assetTurnover < 0.5 && assetTurnover < assetTurnoverPrev) {
      risks.push({
        title: '자산 효율성 저하',
        desc: `총자산회전율 ${assetTurnover.toFixed(2)}회로 전년(${assetTurnoverPrev.toFixed(2)}회) 대비 하락. 자산 대비 매출 창출력 감소`
      });
      actions.push({
        title: '자산 효율 제고',
        desc: `저효율 자산 매각, 유휴 부동산 활용, 브랜드 가치 극대화로 회전율 ${(assetTurnover*1.2).toFixed(2)}회 목표`
      });
    } else if (assetTurnover > assetTurnoverPrev && assetTurnover > 0.6) {
      insights.push({
        title: '자산 효율성 우수',
        desc: `총자산회전율 ${assetTurnover.toFixed(2)}회로 개선. 효율적 자산 운용으로 수익성 극대화`
      });
    }
    
    // 재고 분석
    if (inventoryGrowth > 30) {
      risks.push({
        title: '재고자산 급증',
        desc: `${formatNumber(Math.round(inventoryCurr/100))}억원으로 ${inventoryGrowth.toFixed(0)}% 증가. 재고회전율 악화 및 평가손실 리스크`
      });
      actions.push({
        title: '재고 효율화',
        desc: `시즌 오프 프로모션 강화, 발주 최적화, VMI 도입으로 재고회전일수 30일 단축 목표`
      });
    }
    
    // 차입금 분석 (강화)
    if (totalBorrowing > 100000 && borrowingsByEntity.length > 0) {
      const topDebtor = borrowingsByEntity[0];
      risks.push({
        title: `${topDebtor.entity} 차입금 부담`,
        desc: `${formatNumber(Math.round(topDebtor.debt/100))}억원 (전체 ${(topDebtor.debt/totalBorrowing*100).toFixed(0)}%), 이자비용 연 ${formatNumber(Math.round(topDebtor.debt*0.045/100))}억원 추정, 환위험 노출`
      });
      actions.push({
        title: '차입금 감축',
        desc: `${topDebtor.entity} 영업현금 창출 강화, 운전자본 효율화로 연간 ${formatNumber(Math.round(topDebtor.debt*0.3/100))}억원 상환 목표`
      });
    }
    
    // 법인별 재무건전성 분석 (2025 4Q 데이터 반영)
    const entityFinancialHealth = ['OC(국내)', '중국', '홍콩', 'ST미국'].map(entity => {
      const assets = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].자산총계) 
        ? (entityBSData[entityBSPeriod].자산총계[entity] || 0) : 0;
      const debt = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].부채총계) 
        ? (entityBSData[entityBSPeriod].부채총계[entity] || 0) : 0;
      const equity = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].자본총계) 
        ? (entityBSData[entityBSPeriod].자본총계[entity] || 0) : 0;
      const retainedEarnings = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].이익잉여금) 
        ? (entityBSData[entityBSPeriod].이익잉여금[entity] || 0) : 0;
      const borrowings = (entityBSData && entityBSData[entityBSPeriod] && entityBSData[entityBSPeriod].차입금) 
        ? (entityBSData[entityBSPeriod].차입금[entity] || 0) : 0;
      const debtRatio = equity > 0 ? (debt / equity * 100) : 0;
      return { entity, assets, debt, equity, retainedEarnings, borrowings, debtRatio };
    });
    
    // ST미국 분석 (Movin 소송 관련 일시적 상황 반영)
    const stUSData = entityFinancialHealth.find(e => e.entity === 'ST미국');
    if (stUSData) {
      // ST미국 누적적자: Movin 소송비용 일시적 과대 계상으로 적자 발생
      if (stUSData.retainedEarnings < 0) {
        insights.push({
          title: 'ST미국 일시적 적자 (Movin 소송)',
          desc: `이익잉여금 ${formatNumber(Math.round(stUSData.retainedEarnings/100))}억원 적자. Movin 소송비용의 일시적 과대 계상에 따른 손실로, 25년내 이슈 해결 예정이며 26년 흑자 전환 전망`
        });
      }
      // ST미국 장기차입금: 소송비용 지급 관련, 경영구조 변경에 따른 일시적 상황
      const stUSBorrowingsPrev = (entityBSData && entityBSData[prevPeriod] && entityBSData[prevPeriod].차입금) 
        ? (entityBSData[prevPeriod].차입금['ST미국'] || 0) : 0;
      if (stUSData.borrowings > 50000 && stUSBorrowingsPrev === 0) {
        insights.push({
          title: 'ST미국 차입금 (소송비용 지급 관련)',
          desc: `${formatNumber(Math.round(stUSData.borrowings/100))}억원 신규 차입. 소송비용 지급 관련 일시적 조달이며 브랜드 투자와 무관. 추후 STE에서 STO로 배당/감자를 통해 상환 가능한 규모로, 경영구조 변경에 따른 일시적 상황`
        });
      }
      if (stUSData.retainedEarnings < 0 || stUSData.borrowings > 50000) {
        actions.push({
          title: 'ST미국 모니터링',
          desc: `26년 흑자 전환 추이 확인, 소송 마무리 후 차입금 상환 계획 점검 필요`
        });
      }
    }
    
    // 중국 부채비율 및 재고/차입금 분석
    const chinaData = entityFinancialHealth.find(e => e.entity === '중국');
    if (chinaData) {
      // 중국 재고자산 증가 분석
      const chinaInventoryCurr = (entityBSData && entityBSData[currentPeriod] && entityBSData[currentPeriod].재고자산) 
        ? (entityBSData[currentPeriod].재고자산['중국'] || 0) : 0;
      const chinaInventoryPrev = (entityBSData && entityBSData[prevPeriod] && entityBSData[prevPeriod].재고자산) 
        ? (entityBSData[prevPeriod].재고자산['중국'] || 0) : 0;
      const chinaInventoryGrowth = chinaInventoryPrev > 0 ? ((chinaInventoryCurr - chinaInventoryPrev) / chinaInventoryPrev * 100) : 0;
      
      if (chinaInventoryGrowth > 80) {
        risks.push({
          title: '중국 재고자산 급증',
          desc: `${formatNumber(Math.round(chinaInventoryCurr/100))}억원 (전년대비 +${chinaInventoryGrowth.toFixed(0)}%, +${formatNumber(Math.round((chinaInventoryCurr-chinaInventoryPrev)/100))}억원). 시장 확대 대응이나 재고 리스크 관리 필요`
        });
        // 중국 재고 회전일수 계산
        const chinaSales = entityData.매출액?.[selectedYearKey]?.['중국'] || 0;
        const chinaInventoryDays = chinaSales > 0 ? (chinaInventoryCurr / chinaSales * 365) : 0;
        const targetInventoryDays = 90; // 업계 적정 수준
        improvementTargets.push({
          area: '중국 재고자산 최적화',
          current: `${formatNumber(Math.round(chinaInventoryCurr/100))}억원 (전년대비 +${chinaInventoryGrowth.toFixed(0)}%)`,
          target: `${formatNumber(Math.round(chinaInventoryCurr*0.8/100))}억원 (20% 감축)`,
          impact: `운전자본 ${formatNumber(Math.round(chinaInventoryCurr*0.2/100))}억원 절감, 이자비용 -${formatNumber(Math.round(chinaInventoryCurr*0.2*0.045/100))}억원/년, 재고평가손실 리스크 감소`,
          method: `재고회전율 KPI 강화, 시즌별 프로모션 조기 집행, 슬로우 상품 처리 가속화, 발주 시스템 고도화`,
          rationale: `[목표 근거] 현재 중국 재고회전일수 ${Math.round(chinaInventoryDays)}일로 의류업계 적정 수준(${targetInventoryDays}일) 대비 ${Math.round(chinaInventoryDays - targetInventoryDays)}일 초과. 전년대비 ${chinaInventoryGrowth.toFixed(0)}% 급증한 점 감안, 매출 성장률 대비 과잉 재고 해소를 위해 20% 감축 목표 설정`
        });
      }
      
      // 중국 차입금 증가 분석 (M&A 등 대규모 현금지출 계획 반영)
      const chinaBorrowingsPrev = (entityBSData && entityBSData[prevPeriod] && entityBSData[prevPeriod].차입금) 
        ? (entityBSData[prevPeriod].차입금['중국'] || 0) : 0;
      const chinaBorrowingsGrowth = chinaBorrowingsPrev > 0 ? ((chinaData.borrowings - chinaBorrowingsPrev) / chinaBorrowingsPrev * 100) : 0;
      
      if (chinaBorrowingsGrowth > 50 && chinaData.borrowings > 100000) {
        insights.push({
          title: '중국 차입금 (M&A 등 투자 대응)',
          desc: `${formatNumber(Math.round(chinaData.borrowings/100))}억원 (전년대비 +${chinaBorrowingsGrowth.toFixed(0)}%). M&A 등 대규모 현금지출 계획으로 일시적 차입 발생. 이자비용 연 84억원 예상. 연결 현금 ${formatNumber(3254)}억원으로 충분하며, 추후 지출 계획에 맞추어 조정 예정`
        });
      }
      
      if (chinaData.debtRatio > 200) {
        insights.push({
          title: '중국 법인 레버리지 활용',
          desc: `부채비율 ${chinaData.debtRatio.toFixed(0)}%. 고성장 시장 대응을 위한 전략적 레버리지 활용 중. 연결 현금 여력 충분`
        });
      }
    }
    
    // 국내 법인 상세 분석
    const domesticData = entityFinancialHealth.find(e => e.entity === 'OC(국내)');
    if (domesticData && domesticData.assets > 1500000) {
      const domesticROA = domesticData.assets > 0 ? ((entityProfitability.find(e => e.entity === 'OC(국내)')?.netIncome || 0) / domesticData.assets * 100) : 0;
      if (domesticROA > 8) {
        insights.push({
          title: '국내 법인 자산 효율성 우수',
          desc: `자산 ${formatNumber(Math.round(domesticData.assets/100))}억원, ROA ${domesticROA.toFixed(1)}%. 안정적 수익 기반 유지`
        });
      }
      
      // OC(국내) 현금성자산 변동 분석
      const domesticCashCurr = (entityBSData && entityBSData[currentPeriod] && entityBSData[currentPeriod].현금성자산) 
        ? (entityBSData[currentPeriod].현금성자산['OC(국내)'] || 0) : 0;
      const domesticCashPrev = (entityBSData && entityBSData[prevPeriod] && entityBSData[prevPeriod].현금성자산) 
        ? (entityBSData[prevPeriod].현금성자산['OC(국내)'] || 0) : 0;
      const domesticCashGrowth = domesticCashPrev > 0 ? ((domesticCashCurr - domesticCashPrev) / domesticCashPrev * 100) : 0;
      
      if (domesticCashGrowth > 200) {
        insights.push({
          title: '국내 현금성자산 대폭 증가',
          desc: `${formatNumber(Math.round(domesticCashCurr/100))}억원 (전년대비 +${domesticCashGrowth.toFixed(0)}%, +${formatNumber(Math.round((domesticCashCurr-domesticCashPrev)/100))}억원). 영업활동 현금흐름 개선 및 투자 여력 확보`
        });
      }
      
      // OC(국내) 유무형자산 변동 분석 (토지→투자부동산 대체)
      const domesticPPECurr = (entityBSData && entityBSData[currentPeriod] && entityBSData[currentPeriod].유무형자산) 
        ? (entityBSData[currentPeriod].유무형자산['OC(국내)'] || 0) : 0;
      const domesticPPEPrev = (entityBSData && entityBSData[prevPeriod] && entityBSData[prevPeriod].유무형자산) 
        ? (entityBSData[prevPeriod].유무형자산['OC(국내)'] || 0) : 0;
      
      // 토지 감소 + 투자부동산 증가 = 계정 대체
      const landCurr = bsDetailData['토지']?.[currentPeriod]?.['OC(국내)'] || 0;
      const landPrev = bsDetailData['토지']?.[prevPeriod]?.['OC(국내)'] || 0;
      const investLandCurr = bsDetailData['토지(투자부동산)']?.[currentPeriod]?.['OC(국내)'] || 0;
      const investLandPrev = bsDetailData['토지(투자부동산)']?.[prevPeriod]?.['OC(국내)'] || 0;
      
      if (landCurr < landPrev && investLandCurr > investLandPrev) {
        const landDecrease = landPrev - landCurr;
        const investIncrease = investLandCurr - investLandPrev;
        insights.push({
          title: '국내 부동산 포트폴리오 재편',
          desc: `토지 ${formatNumber(Math.round(landDecrease/100))}억원 감소, 투자부동산 ${formatNumber(Math.round(investIncrease/100))}억원 증가. 유휴 자산의 수익형 자산 전환으로 자산 효율성 제고`
        });
      }
    }
    
    // 부채비율 분석
    if (debtRatioCurr > 100) {
      risks.push({
        title: '부채비율 위험',
        desc: `${debtRatioCurr.toFixed(1)}%로 자본 대비 부채 과다. 재무 안정성 악화 및 금융비용 부담 증가`
      });
      actions.push({
        title: '부채비율 개선',
        desc: `자기자본 확충 또는 부채 상환으로 부채비율 100% 이하 목표. 연간 ${formatNumber(Math.round(totalDebtCurr*0.2/100))}억원 상환 계획`
      });
    } else if (debtRatioCurr > 50 && debtRatioCurr <= 100) {
      risks.push({
        title: '부채비율 주의',
        desc: `${debtRatioCurr.toFixed(1)}%로 적정 수준이나 지속 모니터링 필요`
      });
    } else if (debtRatioCurr > 0 && debtRatioCurr <= 50) {
      insights.push({
        title: '부채비율 안정',
        desc: `${debtRatioCurr.toFixed(1)}%로 재무 안정성 양호. 적정 수준의 레버리지 활용`
      });
    }
    
    // ROE 분석
    if (roeChange < -3) {
      risks.push({
        title: 'ROE 하락',
        desc: `${roeCurr.toFixed(1)}%로 ${Math.abs(roeChange).toFixed(1)}%p 하락. 자본 효율성 저하`
      });
      actions.push({
        title: 'ROE 제고',
        desc: `순이익률 개선 + 자산회전율 향상으로 ROE 15% 달성. 저효율 자산 매각 검토`
      });
    } else if (roeCurr > 15) {
      insights.push({
        title: 'ROE 우수',
        desc: `${roeCurr.toFixed(1)}%로 자본 효율성 우수. 주주가치 창출 능력 강화`
      });
    } else if (roeCurr > 0 && roeCurr < 10) {
      risks.push({
        title: 'ROE 개선 필요',
        desc: `${roeCurr.toFixed(1)}%로 자본 대비 수익 창출 능력 저조. 수익성 및 자산 효율 개선 필요`
      });
    }
    
    // 운전자본 분석
    const wcSalesRatio = salesCurr > 0 ? (workingCapitalCurr / salesCurr * 100) : 0;
    if (wcSalesRatio > 50) {
      risks.push({
        title: '운전자본 과다',
        desc: `${formatNumber(Math.round(workingCapitalCurr/100))}억원, 매출대비 ${wcSalesRatio.toFixed(0)}%. 자금 효율 저하`
      });
      actions.push({
        title: '운전자본 최적화',
        desc: `매출채권 회수기간 단축, 재고 감축, 매입채무 조건 개선으로 ${formatNumber(Math.round(workingCapitalCurr*0.2/100))}억원 절감`
      });
    }
    
    // 매출 성장 인사이트 (법인별 상세)
    if (salesGrowth < -10) {
      risks.push({
        title: '매출 역성장',
        desc: `전년대비 ${Math.abs(salesGrowth).toFixed(1)}% 감소. 시장 점유율 하락 및 수요 위축`
      });
      actions.push({
        title: '매출 회복',
        desc: `신규 채널 확대, 온라인 강화, 해외시장 공략으로 연간 ${Math.abs(salesGrowth/2).toFixed(0)}% 성장률 회복 목표`
      });
    } else if (salesGrowth > 10) {
      // 법인별 매출 성장 기여도 분석
      const entitySalesGrowth = ['OC(국내)', '중국', '홍콩', 'ST미국'].map(entity => {
        const currSales = entityData.매출액?.[selectedYearKey]?.[entity] || 0;
        const prevSales = entityData.매출액?.[prevYearKey]?.[entity] || 0;
        const growth = prevSales > 0 ? ((currSales - prevSales) / prevSales * 100) : 0;
        const contribution = salesPrev > 0 ? ((currSales - prevSales) / salesPrev * 100) : 0;
        return { entity, currSales, prevSales, growth, contribution };
      }).filter(e => e.currSales > 0).sort((a, b) => b.contribution - a.contribution);
      
      const topGrowthEntity = entitySalesGrowth[0];
      if (topGrowthEntity && topGrowthEntity.growth > 5) {
        insights.push({
          title: '매출 성장',
          desc: `전년대비 ${salesGrowth.toFixed(1)}% 증가 (${topGrowthEntity.entity} +${topGrowthEntity.growth.toFixed(1)}% 주도). 연결 매출 ${(salesCurr/10000).toFixed(2)}조원 달성`
        });
      }
      
      // 중국 매출 성장 상세
      const chinaGrowth = entitySalesGrowth.find(e => e.entity === '중국');
      if (chinaGrowth && chinaGrowth.growth > 10) {
        insights.push({
          title: '중국 시장 고성장',
          desc: `매출 ${formatNumber(Math.round(chinaGrowth.currSales/100))}억원 (전년대비 +${chinaGrowth.growth.toFixed(1)}%, +${formatNumber(Math.round((chinaGrowth.currSales-chinaGrowth.prevSales)/100))}억원). MLB 브랜드 확장 및 온라인 채널 성장`
        });
      }
    }
    
    // 연결 자산총계 성장 분석
    const assetGrowth = totalAssetsPrev > 0 ? ((totalAssetsCurr - totalAssetsPrev) / totalAssetsPrev * 100) : 0;
    if (assetGrowth > 15 && totalAssetsCurr > 2000000) {
      insights.push({
        title: '연결 자산 규모 확대',
        desc: `자산총계 ${(totalAssetsCurr/10000).toFixed(1)}조원 (전년대비 +${assetGrowth.toFixed(1)}%). 사업 규모 및 시장 지배력 강화`
      });
    } else if (assetGrowth < -5) {
      risks.push({
        title: '자산 규모 축소',
        desc: `자산총계 ${formatNumber(Math.round(totalAssetsCurr/100))}억원 (전년대비 ${assetGrowth.toFixed(1)}%). 사업 축소 또는 구조조정 진행 중`
      });
    }
    
    // 자본총계 성장 분석
    const equityGrowth = totalEquityPrev > 0 ? ((totalEquityCurr - totalEquityPrev) / totalEquityPrev * 100) : 0;
    if (equityGrowth > 10) {
      insights.push({
        title: '자기자본 확충',
        desc: `자본총계 ${(totalEquityCurr/10000).toFixed(2)}조원 (전년대비 +${equityGrowth.toFixed(1)}%). 이익 누적으로 재무 안정성 강화`
      });
    }
    
    // 법인별 성장 기여도 분석
    const entityAssetContribution = entityFinancialHealth
      .filter(e => e.assets > 0)
      .map(e => ({
        ...e,
        contribution: totalAssetsCurr > 0 ? (e.assets / totalAssetsCurr * 100) : 0
      }))
      .sort((a, b) => b.contribution - a.contribution);
    
    if (entityAssetContribution.length > 0) {
      const topAssetEntity = entityAssetContribution[0];
      if (topAssetEntity.contribution > 70) {
        insights.push({
          title: `${topAssetEntity.entity} 자산 집중도`,
          desc: `연결 자산의 ${topAssetEntity.contribution.toFixed(0)}% 차지 (${formatNumber(Math.round(topAssetEntity.assets/100))}억원). 핵심 수익 기반`
        });
      }
    }
    
    // 9) 연결관점 개선 타겟 분석
    // 수익성 개선 포텐셜이 큰 영역 파악
    
    // 타겟 1: 저수익 고매출 법인 수익성 개선 (ST미국, 중국 제외)
    // ST미국: Movin 소송 일시적 상황, 중국: 이전가격 조정으로 영업이익률 ~4% 구조적 설정
    const highSalesLowMargin = entityProfitability.filter(e => e.sales > 100000 && e.margin < 20 && e.entity !== 'ST미국' && e.entity !== '중국');
    if (highSalesLowMargin.length > 0) {
      const target = highSalesLowMargin[0];
      const potentialIncrease = (target.sales * 0.05); // 영업이익률 5%p 개선 시
      let roeImpact = 0;
      if (totalEquityCurr > 0) {
        roeImpact = (potentialIncrease / totalEquityCurr * 100);
        if (!isFinite(roeImpact) || isNaN(roeImpact)) roeImpact = 0;
      }
      // 목표 근거: 동종업계 평균 영업이익률 및 그룹 내 최고 수익 법인 기준
      const benchmarkMargin = topProfitEntity ? topProfitEntity.margin : 25;
      improvementTargets.push({
        area: `${target.entity} 수익성 집중 개선`,
        current: `영업이익률 ${target.margin.toFixed(1)}%, 매출 ${Math.round(target.sales/100)}억원`,
        target: `영업이익률 ${(target.margin + 5).toFixed(1)}% 달성`,
        impact: `연결 영업이익 +${Math.round(potentialIncrease/100)}억원 (+${(potentialIncrease/opIncomeCurr*100).toFixed(1)}%), 영업이익률 +${(potentialIncrease/salesCurr*100).toFixed(1)}%p, ROE +${roeImpact.toFixed(1)}%p`,
        method: `원가율 2%p 절감 (소싱 최적화, 로스율 감소), 판관비 매출대비 3%p 절감 (마케팅 ROI 개선, 인력 효율화), 고마진 제품 비중 20%→35% 확대`,
        rationale: `[목표 근거] ${topProfitEntity ? topProfitEntity.entity : '그룹 내 최고 수익 법인'} 영업이익률 ${benchmarkMargin.toFixed(1)}% 대비 ${(benchmarkMargin - target.margin).toFixed(1)}%p 격차 존재. 동종 의류업계 평균 영업이익률 15~20% 수준 감안 시, 단계적 개선 목표로 +5%p 설정`
      });
    }
    
    // 타겟 2: 매출총이익률이 낮은 경우 원가 개선
    if (grossMarginCurr < 60) {
      const targetGrossMargin = 65;
      const potentialIncrease = salesCurr * (targetGrossMargin - grossMarginCurr) / 100;
      const roeImpact = totalEquityCurr > 0 ? (potentialIncrease * 0.7 / totalEquityCurr * 100) : 0; // 세후 70%
      improvementTargets.push({
        area: '연결 매출총이익률 제고',
        current: `매출총이익률 ${grossMarginCurr.toFixed(1)}%`,
        target: `매출총이익률 ${targetGrossMargin}% 달성`,
        impact: `매출총이익 +${Math.round(potentialIncrease/100)}억원, 영업이익률 +${((potentialIncrease*0.8)/salesCurr*100).toFixed(1)}%p, ROE +${roeImpact.toFixed(1)}%p`,
        method: `중국 제조원가 5% 절감 (자동화 투자, 불량률 감소), 물류비 10% 절감 (직배송 확대), 고마진 라인 강화 (MLB, 디스커버리)`,
        rationale: `[목표 근거] 글로벌 스포츠웨어 업계 평균 매출총이익률 60~65% 기준. 프리미엄 브랜드 포지셔닝 감안 시 65% 달성 가능`
      });
    }
    
    // 판관비 효율화 타겟
    const highSGAItem = sgaBreakdown.find(x => x.salesRatio > 12 && x.change > 5);
    if (highSGAItem) {
      const targetReduction = highSGAItem.curr * 0.15; // 15% 절감 시
      improvementTargets.push({
        area: `${highSGAItem.item} 효율화`,
        current: `매출대비 ${highSGAItem.salesRatio.toFixed(1)}%`,
        target: `매출대비 ${(highSGAItem.salesRatio * 0.85).toFixed(1)}%`,
        impact: `연결 영업이익 +${Math.round(targetReduction/100)}억원 (+${(targetReduction/opIncomeCurr*100).toFixed(1)}%)`,
        method: '지출 승인 프로세스 강화, 대행사 통합, 성과 기반 집행'
      });
    }
    
    // 재고 효율화 타겟
    if (inventoryGrowth > 20) {
      const targetReduction = inventoryCurr * 0.25; // 25% 감축 시
      const interestSaving = targetReduction * 0.05; // 연 5% 이자 절감
      // 연결 재고회전일수 계산
      const consolidatedInventoryDays = salesCurr > 0 ? (inventoryCurr / salesCurr * 365) : 0;
      const industryAvgInventoryDays = 90; // 의류업계 평균 회전일수
      improvementTargets.push({
        area: '연결 재고자산 최적화',
        current: `${Math.round(inventoryCurr/100)}억원 (전년대비 +${inventoryGrowth.toFixed(0)}%)`,
        target: `${Math.round(inventoryCurr*0.75/100)}억원 (25% 감축)`,
        impact: `운전자본 ${Math.round(targetReduction/100)}억원 절감, 이자비용 -${Math.round(interestSaving/100)}억원, ROE +${totalEquityCurr > 0 ? (interestSaving/totalEquityCurr*100).toFixed(1) : '0.0'}%p`,
        method: '시즌별 재고 회전율 목표 관리, 프로모션 타이밍 최적화, 느린 상품 조기 할인',
        rationale: `[목표 근거] 연결 재고회전일수 ${Math.round(consolidatedInventoryDays)}일, 전년대비 ${inventoryGrowth.toFixed(0)}% 증가로 매출 성장률 대비 과잉 재고 발생. 의류업계 적정 회전일수 ${industryAvgInventoryDays}일 수준 달성을 위해 25% 감축 목표 설정. 재고 감축 시 평가손실 리스크 감소 및 자금효율 개선`
      });
    }
    
    // 운전자본 효율화 (구체화)
    const wcTurnover = (salesCurr > 0 && workingCapitalCurr > 0) ? (salesCurr / workingCapitalCurr) : 0;
    if (wcTurnover > 0 && wcTurnover < 3 && workingCapitalCurr > 100000) {
      const targetWC = workingCapitalCurr * 0.7; // 30% 개선 시
      const freedCash = workingCapitalCurr - targetWC;
      const interestSaving = freedCash * 0.04; // 연 4% 절감 효과
      let roeImpact = 0;
      if (totalEquityCurr > 0) {
        roeImpact = (interestSaving*0.73 / totalEquityCurr * 100);
        if (!isFinite(roeImpact) || isNaN(roeImpact)) roeImpact = 0;
      }
      
      const arDaysStr = (arDays > 0 && arDays < 1000) ? `${Math.round(arDays)}→${Math.round(arDays*0.8)}일` : '단축';
      const inventoryDaysStr = (inventoryDays > 0 && inventoryDays < 1000) ? `${Math.round(inventoryDays)}→${Math.round(inventoryDays*0.75)}일` : '단축';
      const apDaysStr = (apDays > 0 && apDays < 1000) ? `${Math.round(apDays)}→${Math.round(apDays*1.1)}일` : '개선';
      const cccStr = (cashConversionCycle > 0 && cashConversionCycle < 1000) ? `${Math.round(cashConversionCycle)}일` : '-';
      const targetCccStr = (cashConversionCycle > 0 && cashConversionCycle < 1000) ? `${Math.round(cashConversionCycle*0.7)}일` : '개선';
      
      improvementTargets.push({
        area: '운전자본 순환 효율화',
        current: `${Math.round(workingCapitalCurr/100)}억원 (회전율 ${wcTurnover.toFixed(1)}회, CCC ${cccStr})`,
        target: `${Math.round(targetWC/100)}억원 (회전율 ${(wcTurnover*1.43).toFixed(1)}회, CCC ${targetCccStr})`,
        impact: `현금 ${Math.round(freedCash/100)}억원 확보, 금융비용 -${Math.round(interestSaving/100)}억원/년, 유동비율 개선, ROE +${roeImpact.toFixed(1)}%p`,
        method: `매출채권: 회수기간 ${arDaysStr} (조기결제 할인, 신용관리), 재고: 회전일수 ${inventoryDaysStr} (재고 KPI 강화), 매입채무: ${apDaysStr} (지급조건 협상)`
      });
    }
    
    // 타겟 3: 법인별 불균형 해소
    if (entityImbalance.length > 0 && entityProfitability.length > 0) {
      const target = entityImbalance[0];
      const profitGap = target.salesShare - target.profitShare;
      const potentialIncrease = opIncomeCurr * (profitGap / 100);
      const targetMargin = totalOpIncome > 0 ? (totalOpIncome / totalSales * 100) : 0;
      
      improvementTargets.push({
        area: `${target.entity} 수익구조 정상화`,
        current: `매출비중 ${target.salesShare.toFixed(0)}% vs 이익비중 ${target.profitShare.toFixed(0)}% (${profitGap.toFixed(0)}%p 괴리)`,
        target: `이익 기여도를 매출 비중 수준으로 개선 (영업이익률 ${target.margin.toFixed(1)}%→${targetMargin.toFixed(1)}%)`,
        impact: `연결 영업이익 +${Math.round(potentialIncrease/100)}억원, 영업이익률 +${(potentialIncrease/salesCurr*100).toFixed(1)}%p, ROE +${totalEquityCurr > 0 ? (potentialIncrease*0.73/totalEquityCurr*100).toFixed(1) : '0.0'}%p`,
        method: `저마진 제품 단종/가격 인상, 고마진 법인(${entityProfitability[0].entity})의 운영 노하우 이전, 고정비 구조조정, 브랜드 포트폴리오 재편`
      });
    }
    
    // 우선순위 정렬 (영향도 큰 순)
    // 중요 리스크 우선순위 조정 (법인별 주요 이슈 상단 배치)
    const priorityRiskKeywords = ['ST미국', '중국 재고', '중국 차입'];
    const sortedRisks = [
      ...risks.filter(r => priorityRiskKeywords.some(k => r.title.includes(k))),
      ...risks.filter(r => !priorityRiskKeywords.some(k => r.title.includes(k)))
    ];
    
    return {
      keyMetrics: {
        opMargin: { curr: opMarginCurr, prev: opMarginPrev, change: opMarginChange },
        netMargin: { curr: netMarginCurr, prev: netMarginPrev, change: netMarginChange },
        debtRatio: { curr: debtRatioCurr, prev: debtRatioPrev, status: debtRatioCurr < 100 ? '안정' : '주의' },
        roe: { curr: roeCurr, prev: roePrev, change: roeChange }
      },
      insights: insights.slice(0, 4),
      risks: sortedRisks.slice(0, 4),
      actions: actions.slice(0, 4),
      improvementTargets: improvementTargets.slice(0, 3) // 상위 3개 개선 타겟
    };
  };

  // ============================================
  // 전체요약 탭 렌더링
  // ============================================
  const renderSummaryTab = () => {
    // ============================================
    // 손익 요약 카드 데이터 (summaryKpiMode에 따라 분기/누적 전환)
    // ============================================
    // 분기 모드: 해당 분기(3개월) vs 전년 동분기
    // 누적 모드: 연간 누적 vs 전년 동기 누적
    const isQuarterMode = summaryKpiMode === 'quarter';
    
    // 손익계산서 기간 키 결정
    const incomeCurrentKey = isQuarterMode 
      ? getPeriodKey(selectedPeriod, 'quarter')  // 분기: 2025_4Q
      : getPeriodKey(selectedPeriod, 'year');     // 누적: 2025_4Q_Year
    const incomePrevKey = isQuarterMode 
      ? getPeriodKey(selectedPeriod, 'prev_quarter')  // 분기: 2024_4Q
      : (getPeriodKey(selectedPeriod, 'prev_year') || `${Number(selectedPeriod.split('_')[0]) - 1}_Year`);
    
    // 재무상태표 비교 기간 키 결정 (별도의 balanceKpiMode 사용)
    // 동분기 모드: 동분기 비교 (예: 2025.4Q vs 2024.4Q)
    // 전기말 모드: 전기말 비교 (예: 2025.4Q vs 2024.4Q 전기말)
    const isBalanceSameQuarter = balanceKpiMode === 'sameQuarter';
    const bsSummaryCurrentPeriod = bsCurrentPeriod; // 당기: 선택된 분기
    const bsSummaryPrevPeriod = isBalanceSameQuarter 
      ? getPeriodKey(selectedPeriod, 'prev_quarter')  // 동분기: 전년 동분기
      : '2024_4Q';  // 전기말: 전기말 (2024년말)
    
    // 매출액 (비율 계산용)
    const salesCurr = incomeStatementData[incomeCurrentKey]?.매출액 || 0;
    const salesPrev = incomeStatementData[incomePrevKey]?.매출액 || 0;
    
    // 매출총이익 및 매출총이익률
    const grossProfitCurr = incomeStatementData[incomeCurrentKey]?.매출총이익 || 0;
    const grossProfitPrev = incomeStatementData[incomePrevKey]?.매출총이익 || 0;
    const grossMarginCurr = salesCurr !== 0 ? (grossProfitCurr / salesCurr * 100) : 0;
    const grossMarginPrev = salesPrev !== 0 ? (grossProfitPrev / salesPrev * 100) : 0;
    
    // 영업이익 및 영업이익률
    const operatingIncomeCurr = incomeStatementData[incomeCurrentKey]?.영업이익 || 0;
    const operatingIncomePrev = incomeStatementData[incomePrevKey]?.영업이익 || 0;
    const operatingMarginCurr = salesCurr !== 0 ? (operatingIncomeCurr / salesCurr * 100) : 0;
    const operatingMarginPrev = salesPrev !== 0 ? (operatingIncomePrev / salesPrev * 100) : 0;
    
    // 당기순이익 및 당기순이익률
    const netIncomeCurr = incomeStatementData[incomeCurrentKey]?.당기순이익 || 0;
    const netIncomePrev = incomeStatementData[incomePrevKey]?.당기순이익 || 0;
    const netMarginCurr = salesCurr !== 0 ? (netIncomeCurr / salesCurr * 100) : 0;
    const netMarginPrev = salesPrev !== 0 ? (netIncomePrev / salesPrev * 100) : 0;
    
    // 손익 비교 라벨
    const incomeCompareLabel = isQuarterMode 
      ? `전년 동분기` 
      : '전년 동기';
    
    const incomeCards = [
      { 
        title: '매출액', 
        value: Math.round(salesCurr / 100), 
        prevValue: Math.round(salesPrev / 100), 
        iconColor: 'bg-blue-500',
        hasRate: false,
        compareLabel: incomeCompareLabel
      },
      { 
        title: '매출총이익', 
        value: Math.round(grossProfitCurr / 100), 
        prevValue: Math.round(grossProfitPrev / 100), 
        iconColor: 'bg-blue-500',
        hasRate: true,
        rateLabel: '매출총이익률',
        rateCurr: grossMarginCurr,
        ratePrev: grossMarginPrev,
        compareLabel: incomeCompareLabel
      },
      { 
        title: '영업이익', 
        value: Math.round(operatingIncomeCurr / 100), 
        prevValue: Math.round(operatingIncomePrev / 100), 
        iconColor: 'bg-emerald-500',
        hasRate: true,
        rateLabel: '영업이익률',
        rateCurr: operatingMarginCurr,
        ratePrev: operatingMarginPrev,
        compareLabel: incomeCompareLabel
      },
      { 
        title: '당기순이익', 
        value: Math.round(netIncomeCurr / 100), 
        prevValue: Math.round(netIncomePrev / 100), 
        iconColor: 'bg-violet-500',
        hasRate: true,
        rateLabel: '당기순이익률',
        rateCurr: netMarginCurr,
        ratePrev: netMarginPrev,
        compareLabel: incomeCompareLabel
      },
    ];

    // ============================================
    // 재무상태 요약 카드 데이터 (balanceKpiMode에 따라 동분기/전기말 비교)
    // ============================================
    // ROE 계산용 손익 키 (재무상태 비교 모드에 맞춤)
    const bsIncomeCurrentKey = isBalanceSameQuarter 
      ? getPeriodKey(selectedPeriod, 'quarter')  // 동분기: 분기 손익
      : getPeriodKey(selectedPeriod, 'year');     // 전기말: 누적 손익
    const bsIncomePrevKey = isBalanceSameQuarter 
      ? getPeriodKey(selectedPeriod, 'prev_quarter')  // 동분기: 전년 동분기 손익
      : '2024_Year';  // 전기말: 전년 연간 손익
    
    // ROE 계산 (당기순이익 / 자본총계 * 100)
    const totalEquityCurr = balanceSheetData[bsSummaryCurrentPeriod]?.자본총계 || 0;
    const totalEquityPrev = balanceSheetData[bsSummaryPrevPeriod]?.자본총계 || 0;
    const netIncomeCurrForROE = incomeStatementData[bsIncomeCurrentKey]?.당기순이익 || 0;
    const netIncomePrevForROE = incomeStatementData[bsIncomePrevKey]?.당기순이익 || 0;
    const roeCurr = totalEquityCurr > 0 ? (netIncomeCurrForROE / totalEquityCurr * 100) : 0;
    const roePrev = totalEquityPrev > 0 ? (netIncomePrevForROE / totalEquityPrev * 100) : 0;
    // YoY ROE (전동분기) — 전기말 모드에서도 추가 표시용
    const yoyQKeyForROE = getPeriodKey(selectedPeriod, 'prev_quarter'); // e.g. 2025_1Q
    const totalEquityYoy = balanceSheetData[yoyQKeyForROE]?.자본총계 || 0;
    const netIncomeYoyForROE = incomeStatementData[yoyQKeyForROE]?.당기순이익 || 0;
    const roeYoY = totalEquityYoy > 0 ? (netIncomeYoyForROE / totalEquityYoy * 100) : 0;
    const yoyQShortLabel = yoyQKeyForROE ? yoyQKeyForROE.replace('20','').replace('_','.') : '';
    
    // 재무상태 비교 라벨
    const balanceCompareLabel = isBalanceSameQuarter 
      ? '전년 동분기' 
      : '전기말';
    
    const balanceCards = [
      { title: '자산총계', value: Math.round((balanceSheetData[bsSummaryCurrentPeriod]?.자산총계 || 0) / 100), prevValue: Math.round((balanceSheetData[bsSummaryPrevPeriod]?.자산총계 || 0) / 100), iconColor: 'bg-amber-500', hasRate: false, compareLabel: balanceCompareLabel },
      { title: '부채총계', value: Math.round((balanceSheetData[bsSummaryCurrentPeriod]?.부채총계 || 0) / 100), prevValue: Math.round((balanceSheetData[bsSummaryPrevPeriod]?.부채총계 || 0) / 100), iconColor: 'bg-rose-500', hasRate: false, compareLabel: balanceCompareLabel },
      { title: '자본총계', value: Math.round((balanceSheetData[bsSummaryCurrentPeriod]?.자본총계 || 0) / 100), prevValue: Math.round((balanceSheetData[bsSummaryPrevPeriod]?.자본총계 || 0) / 100), iconColor: 'bg-cyan-500', hasRate: false, compareLabel: balanceCompareLabel },
      { title: 'ROE', value: roeCurr, prevValue: roePrev, iconColor: 'bg-violet-500', hasRate: false, isPercent: true, compareLabel: balanceCompareLabel, yoyValue: roeYoY, yoyLabel: `전동분기(${yoyQShortLabel})`, isYearEndMode: !isBalanceSameQuarter },
    ];

    // 조단위 포맷 함수 (억원 단위 입력) - 숫자와 단위 분리 반환
    const formatTrilBilSummary = (valueInBil) => {
      if (valueInBil === 0 || valueInBil === undefined || valueInBil === null) return { number: '-', unit: '' };
      const absValue = Math.abs(valueInBil);
      const sign = valueInBil < 0 ? '-' : '';
      
      if (absValue >= 10000) {
        const tril = Math.floor(absValue / 10000);
        const bil = Math.round(absValue % 10000);
        return { number: `${sign}${tril}조 ${formatNumber(bil)}`, unit: '억원' };
      }
      return { number: `${sign}${formatNumber(Math.round(absValue))}`, unit: '억원' };
    };

    // 카드 렌더링 함수
    const renderCard = (card, idx) => {
      const iconColorBorderMap = {
        'bg-blue-500': 'border-l-blue-500',
        'bg-emerald-500': 'border-l-emerald-500',
        'bg-violet-500': 'border-l-violet-500',
        'bg-amber-500': 'border-l-amber-500',
        'bg-rose-500': 'border-l-rose-500',
        'bg-cyan-500': 'border-l-cyan-500',
      };
      const leftBorderColor = iconColorBorderMap[card.iconColor] || 'border-l-zinc-300';
      // 퍼센트 타입 카드 (ROE 등)
      if (card.isPercent) {
        const diff = card.value - card.prevValue;
        const isPositive = diff >= 0;
        return (
          <div key={idx} className="bg-white rounded-lg border border-zinc-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
            {/* 헤더: 제목과 증감 박스 */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">{card.title}</span>
              {card.isYearEndMode && card.yoyValue != null ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isPositive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                    전기말 {diff !== 0 ? `${isPositive ? '+' : ''}${diff.toFixed(1)}%p` : '-'}
                  </span>
                  {(() => {
                    const yoyDiff = card.value - card.yoyValue;
                    const yoyPos = yoyDiff >= 0;
                    return (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${yoyPos ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        전동분기 {yoyDiff !== 0 ? `${yoyPos ? '+' : ''}${yoyDiff.toFixed(1)}%p` : '-'}
                      </span>
                    );
                  })()}
                </div>
              ) : (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  isPositive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {diff !== 0 ? `YoY ${isPositive ? '+' : ''}${diff.toFixed(1)}%p` : '-'}
                </span>
              )}
            </div>

            {/* 당년 수치 */}
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">{card.value.toFixed(1)}</span>
              <span className="text-sm font-normal text-zinc-400">%</span>
            </div>

            {/* 비교 기간 수치 */}
            <div className="mb-1">
              <span className="text-[10px] text-zinc-400">{card.compareLabel || '전년'} {card.prevValue.toFixed(1)}%</span>
              {diff !== 0 && (
                <span className={`ml-1 font-bold text-[10px] ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isPositive ? '+' : ''}{diff.toFixed(1)}%p
                </span>
              )}
            </div>
            {/* 전기말 모드: 전동분기 YoY 추가 표시 + 의미 분석 */}
            {card.isYearEndMode && card.yoyValue != null && (() => {
              const yoyDiff = card.value - card.yoyValue;
              const yeDiff  = diff; // 전기말 대비 (위에서 계산된 diff)
              // 4가지 케이스: 전기말↓·전동분기↑ / 전기말↑·전동분기↑ / 전기말↓·전동분기↓ / 전기말↑·전동분기↓
              let memo = '';
              if (yeDiff < -1 && yoyDiff > 1)
                memo = '전기말 하락은 계절성·연간이익 기저 영향 / 동분기 대비 실질 개선';
              else if (yeDiff > 1 && yoyDiff > 1)
                memo = '전기말·전동분기 모두 개선 — 수익성 회복세 확인';
              else if (yeDiff < -1 && yoyDiff < -1)
                memo = '전기말·전동분기 모두 하락 — 수익성 추이 모니터링 필요';
              else if (yeDiff > 1 && yoyDiff < -1)
                memo = '전기말 개선·동분기 하락 — 계절성 외 구조적 요인 점검 필요';
              else
                memo = '전기말 대비 변동 미미 — 계절성 영향 정상 범위';
              return (
                <>
                  <div className="mb-1">
                    <span className="text-[10px] text-zinc-400">{card.yoyLabel} {card.yoyValue.toFixed(1)}%</span>
                    {yoyDiff !== 0 && (
                      <span className={`ml-1 font-bold text-[10px] ${yoyDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {yoyDiff >= 0 ? '+' : ''}{yoyDiff.toFixed(1)}%p
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-indigo-500 leading-tight mt-0.5 italic">{memo}</div>
                </>
              );
            })()}

            {/* ROE 등급 표시 */}
            <div className="pt-2 border-t border-zinc-100 mt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">수익성 등급</span>
                <span className={`font-semibold ${
                  card.value >= 15 ? 'text-emerald-600' : card.value >= 10 ? 'text-blue-600' : card.value >= 5 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  {card.value >= 15 ? '우수' : card.value >= 10 ? '양호' : card.value >= 5 ? '보통' : '개선필요'}
                </span>
              </div>
            </div>
          </div>
        );
      }
      
      // 일반 금액 타입 카드
      const change = card.prevValue !== 0 
        ? ((card.value - card.prevValue) / Math.abs(card.prevValue) * 100).toFixed(1) 
        : 0;
      const isPositive = parseFloat(change) >= 0;
      const formatted = formatTrilBilSummary(card.value);
      const formattedPrev = formatTrilBilSummary(card.prevValue);
      const diff = card.value - card.prevValue;
      const formattedDiff = formatTrilBilSummary(diff);
      
      // 비율 증감 계산
      let rateDiff = null;
      if (card.hasRate && card.rateCurr !== undefined && card.ratePrev !== undefined) {
        rateDiff = (card.rateCurr - card.ratePrev).toFixed(1);
      }
      
      return (
        <div key={idx} className="bg-white rounded-lg border border-zinc-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
          {/* 헤더: 제목과 증감률 박스 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">{card.title}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
              isPositive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              {change != 0 ? `YoY ${isPositive ? '+' : ''}${change}%` : '-'}
            </span>
          </div>

          {/* 당년 수치 */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-2xl font-bold text-zinc-900 tracking-tight">{formatted.number}</span>
            <span className="text-sm font-normal text-zinc-400">{formatted.unit}</span>
          </div>

          {/* 비교 기간 수치 및 차액 (한 줄) */}
          <div className="mb-2">
            <span className="text-[10px] text-zinc-400">{card.compareLabel || '전년'} {formattedPrev.number.replace('억원', '억')}억원</span>
            {diff !== 0 && (
              <span className={`ml-1 font-bold text-[10px] ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {diff >= 0 ? '+' : ''}{formattedDiff.number.replace('억원', '억')}억원
              </span>
            )}
          </div>
          
          {/* 비율 (영업이익률, 당기순이익률) */}
          {card.hasRate && card.rateCurr !== undefined && (
            <div className="pt-3 border-t border-zinc-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{card.rateLabel}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-900 font-semibold">{card.rateCurr.toFixed(1)}%</span>
                  {rateDiff !== null && parseFloat(rateDiff) !== 0 && (
                    <span className={`text-xs font-medium ${parseFloat(rateDiff) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {parseFloat(rateDiff) >= 0 ? '+' : ''}{rateDiff}%p
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    // —— PL·BS 성과분석(요약 탭 전용) ——
    const summaryYear = Number(selectedPeriod?.split('_')?.[0] || '2026');
    const plQuarterTrend = [1, 2, 3, 4]
      .map((qq) => {
        const key = `${summaryYear}_${qq}Q`;
        const rev = incomeStatementData[key]?.매출액;
        const op = incomeStatementData[key]?.영업이익;
        if ((rev === undefined || rev === null) && (op === undefined || op === null)) return null;
        return {
          name: `${qq}Q`,
          매출액: Math.round(Number(rev || 0) / 100),
          영업이익: Math.round(Number(op || 0) / 100),
        };
      })
      .filter(Boolean);

    const qKeyPerf = getPeriodKey(selectedPeriod, 'quarter');
    const laborM = incomeStatementData[qKeyPerf]?.인건비 || 0;
    const adM = incomeStatementData[qKeyPerf]?.광고선전비 || 0;
    const otherSgaM =
      (incomeStatementData[qKeyPerf]?.기타판관비 || 0) +
      (incomeStatementData[qKeyPerf]?.수수료 || 0) +
      (incomeStatementData[qKeyPerf]?.감가상각비 || 0);
    // Quarter performance color coding for ② chart
    const qRevMaxMap = {};
    ['1Q', '2Q', '3Q', '4Q'].forEach(q => {
      const key = `${q}매출`;
      const vals = plTrendData.yearly.map(y => y[key] || 0);
      qRevMaxMap[q] = Math.max(...vals, 0);
    });
    const getQuarterFill = (q, val) => {
      const maxVal = qRevMaxMap[q];
      if (maxVal <= 0) return '#c7d2fe';
      if (val >= maxVal && val > 0) return '#ef4444';
      const ratio = maxVal > 0 ? val / maxVal : 0;
      if (ratio >= 0.95) return '#6366f1';
      if (ratio >= 0.88) return '#818cf8';
      if (ratio >= 0.78) return '#a5b4fc';
      if (ratio >= 0.65) return '#c7d2fe';
      return '#e0e7ff';
    };

    // ② Yearly trend insights (dynamic)
    const yearlyInsights = [];
    if (plTrendData.yearly.length > 0) {
      const completedYears = plTrendData.yearly.filter(y => y.quarters >= 4);
      const allYears = plTrendData.yearly;
      const bestTotalYear   = completedYears.reduce((b, y) => y.매출액      > (b?.매출액      || 0) ? y : b, null);
      const bestMarginYear  = completedYears.reduce((b, y) => y.영업이익률  > (b?.영업이익률  || 0) ? y : b, null);
      const worstMarginYear = completedYears.reduce((b, y) => (y.영업이익률 != null && (b == null || y.영업이익률 < b.영업이익률)) ? y : b, null);
      const firstY = completedYears[0];
      const lastY  = completedYears[completedYears.length - 1];

      // ① 매출 CAGR + 피크 연도
      if (firstY && lastY && firstY !== lastY) {
        const nYears = allYears.indexOf(lastY) - allYears.indexOf(firstY);
        const cagr = nYears > 0 ? ((Math.pow(lastY.매출액 / firstY.매출액, 1 / nYears) - 1) * 100).toFixed(1) : null;
        const yoyLast = allYears.length >= 2 ? ((lastY.매출액 - allYears[allYears.indexOf(lastY) - 1]?.매출액) / (allYears[allYears.indexOf(lastY) - 1]?.매출액 || 1) * 100).toFixed(1) : null;
        yearlyInsights.push(
          `매출 성장 추이: ${firstY.name} ${formatNumber(firstY.매출액)}억 → ${lastY.name} ${formatNumber(lastY.매출액)}억` +
          (cagr ? ` (CAGR +${cagr}%/년)` : '') +
          (yoyLast ? `. 직전연도 대비 YoY ${parseFloat(yoyLast) >= 0 ? '+' : ''}${yoyLast}%.` : '.')
        );
      }

      // ② 영업이익률 밴드 — 최고·최저·최근 흐름
      if (bestMarginYear && worstMarginYear && bestMarginYear !== worstMarginYear) {
        const marginSpread = (bestMarginYear.영업이익률 - worstMarginYear.영업이익률).toFixed(1);
        const avgMargin = completedYears.length > 0
          ? (completedYears.reduce((s, y) => s + (y.영업이익률 || 0), 0) / completedYears.length).toFixed(1)
          : null;
        const lastMargin = lastY?.영업이익률;
        const vsAvg = avgMargin && lastMargin != null ? (lastMargin - parseFloat(avgMargin)).toFixed(1) : null;
        yearlyInsights.push(
          `영업이익률 밴드: 최고 ${bestMarginYear.name} ${bestMarginYear.영업이익률}% / 최저 ${worstMarginYear.name} ${worstMarginYear.영업이익률}% (격차 ${marginSpread}%p)` +
          (avgMargin ? `, 연평균 ${avgMargin}%` : '') +
          (vsAvg != null ? `. 최근 연도 평균 대비 ${parseFloat(vsAvg) >= 0 ? '+' : ''}${vsAvg}%p.` : '.')
        );
      }

      // ③ 분기 계절성 패턴 (전 연도 기준)
      const qs = ['1Q','2Q','3Q','4Q'];
      const seasonality = qs.map(q => {
        const vals = completedYears.map(y => y[`${q}매출`] || 0).filter(v => v > 0);
        const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        return { q, avg };
      });
      const totalAvg = seasonality.reduce((s, d) => s + d.avg, 0);
      if (totalAvg > 0) {
        const seasonStr = seasonality.map(d => `${d.q} ${totalAvg > 0 ? (d.avg / totalAvg * 100).toFixed(0) : 0}%`).join(' / ');
        const peakQ = seasonality.reduce((b, d) => d.avg > b.avg ? d : b, seasonality[0]);
        yearlyInsights.push(
          `분기 계절성(연평균 비중): ${seasonStr}. ${peakQ.q}가 연중 매출 집중 구간 — 시즌 재고·마케팅 선행 투자 타이밍 고려 필요.`
        );
      }

      // ④ 이익률 방향성 — 최근 3년 추세
      const recent3 = completedYears.slice(-3);
      if (recent3.length >= 2) {
        const marginTrend = recent3.map(y => y.영업이익률);
        const isRising   = marginTrend.every((v, i) => i === 0 || v >= marginTrend[i-1]);
        const isFalling  = marginTrend.every((v, i) => i === 0 || v <= marginTrend[i-1]);
        const trendWord  = isRising ? '지속 개선' : isFalling ? '지속 하락' : '등락 반복';
        yearlyInsights.push(
          `최근 ${recent3.length}개년 영업이익률: ${recent3.map(y => `${y.name.replace('년','')} ${y.영업이익률}%`).join(' → ')} (${trendWord}). ` +
          (isFalling ? '수익성 구조 점검 — 원가율·판관비 증가 요인 분리 분석 필요.' :
           isRising  ? '비용 효율화·채널믹스 개선 효과 지속 여부 모니터링.' :
           '이익률 변동성 관리 및 안정적 마진 밴드 유지 전략 필요.')
        );
      }

      // ⑤ 미완분기(진행 중) 26.1Q 맥락
      const currentY = allYears.find(y => y.quarters < 4);
      if (currentY && firstY && lastY) {
        const q1Share = lastY['1Q매출'] > 0 && lastY.매출액 > 0
          ? (lastY['1Q매출'] / lastY.매출액 * 100).toFixed(0) : null;
        yearlyInsights.push(
          `${currentY.name} 진행 현황: 1Q 매출 ${formatNumber(currentY['1Q매출'] || 0)}억` +
          (q1Share ? ` (전년도 연간 대비 ${q1Share}% 수준, 계절성 감안 필요)` : '') +
          `. 연간 예상치는 하반기(3Q·4Q) 성수기 실적에 좌우.`
        );
      }
    }

    // Cost trend data for ② chart (24.1Q~26.1Q, incomeStatementData 기반)
    const costTrendPeriodKeys = ['2024_1Q','2024_2Q','2024_3Q','2024_4Q','2025_1Q','2025_2Q','2025_3Q','2025_4Q','2026_1Q'];
    const costTrendData = costTrendPeriodKeys.map(pk => {
      const d = incomeStatementData[pk] || {};
      const revM = d.매출액 || 0;
      if (!revM) return null;
      const name = pk.replace('20', '').replace('_', '.');
      const pct = (v) => +((v || 0) / revM * 100).toFixed(1);
      const qEntry = plTrendData.quarterly.find(q => q.name === name);
      return {
        name,
        영업이익률: qEntry?.영업이익률 ?? (revM > 0 ? +((d.영업이익 || 0) / revM * 100).toFixed(1) : null),
        매출원가율: pct(d.매출원가),
        인건비율: pct(d.인건비),
        광고선전비율: pct(d.광고선전비),
        수수료율: pct(d.수수료),
        감가상각비율: pct(d.감가상각비),
        기타판관비율: pct(d.기타판관비),
      };
    }).filter(Boolean);

    // Cost insights for ③
    const detailedCostData = costTrendData.filter(d => d.수수료율 !== undefined);
    const latestDt = detailedCostData[detailedCostData.length - 1];
    // 전년동기(YoY) 비교: 최신 분기의 전년 같은 분기 (e.g. 26.1Q → 25.1Q)
    const latestDtName = latestDt?.name ?? '';
    const yoyDtName = latestDtName ? (String(Number(latestDtName.slice(0,2)) - 1) + latestDtName.slice(2)) : null;
    const earliestDt = yoyDtName ? (detailedCostData.find(d => d.name === yoyDtName) ?? detailedCostData[0]) : detailedCostData[0];
    const costInsights = [];
    if (latestDt) {
      costInsights.push(`수수료(지급수수료) ${latestDt.name} 기준 매출액 대비 ${latestDt.수수료율}% — 단일 최대 판관비 항목. 백화점·면세·온라인 채널 수수료로 매출 연동 변동비 성격.`);
      if (earliestDt && earliestDt !== latestDt) {
        const feeDiff = +(latestDt.수수료율 - earliestDt.수수료율).toFixed(1);
        costInsights.push(`수수료율 ${earliestDt.name}(${earliestDt.수수료율}%) → ${latestDt.name}(${latestDt.수수료율}%), ${feeDiff >= 0 ? '+' : ''}${feeDiff}%p. 직매장·D2C 채널 비중 확대로 수수료 비중 최적화 검토 필요.`);
        const adDiff = +(latestDt.광고선전비율 - earliestDt.광고선전비율).toFixed(1);
        costInsights.push(`광고선전비율 ${earliestDt.name}(${earliestDt.광고선전비율}%) → ${latestDt.name}(${latestDt.광고선전비율}%), ${adDiff >= 0 ? '+' : ''}${adDiff}%p. 4Q 집중 집행 패턴(패션 시즌성) — 분기별 ROI 효율 점검 필요.`);
        const depDiff = +(latestDt.감가상각비율 - earliestDt.감가상각비율).toFixed(1);
        if (Math.abs(depDiff) >= 0.2) costInsights.push(`감가상각비율 ${earliestDt.name}(${earliestDt.감가상각비율}%) → ${latestDt.name}(${latestDt.감가상각비율}%), ${depDiff >= 0 ? '+' : ''}${depDiff}%p. IFRS16 리스 자산 또는 유·무형 고정자산 투자 증감 모니터링.`);
      }
      const lastAll = costTrendData[costTrendData.length - 1];
      const yoyAll  = yoyDtName ? costTrendData.find(d => d.name === yoyDtName) : null;
      const firstAll = yoyAll ?? costTrendData[0];
      if (firstAll && lastAll && firstAll !== lastAll) {
        const opDiff = +(lastAll.영업이익률 - firstAll.영업이익률).toFixed(1);
        costInsights.push(`영업이익률 ${firstAll.name}(${firstAll.영업이익률}%) → ${lastAll.name}(${lastAll.영업이익률}%), ${opDiff >= 0 ? '+' : ''}${opDiff}%p (YoY). ${opDiff < 0 ? '원가율·수수료 비중 증가가 마진 하락 주요 원인 — 고수익 채널 확대·원가 절감 병행 필요.' : '비용 효율화 성과 지속.'}`);
      }
      costInsights.push('개선 제안: ① 수수료 최적화(직매장·D2C 채널 비중 확대) ② 광고비 ROI 분석 기반 집행 효율화 ③ 감가상각 증가 구간 신규 자본지출 타당성 검토');
    }

    const bsP = bsSummaryCurrentPeriod;
    const bsRow = balanceSheetData[bsP] || {};

    // ===== 영업운전자본 (NWC = 매출채권 + 재고자산 - 매입채무) =====
    const qSalesM = incomeStatementData[qKeyPerf]?.매출액 || 0;
    const qCogsM = incomeStatementData[qKeyPerf]?.매출원가 || 0;
    const arM = bsRow.매출채권 || 0;
    const invM = bsRow.재고자산 || 0;
    const apM = bsRow.매입채무 || 0;
    const nwcM = arM + invM - apM;
    const nwcPctRev = qSalesM > 0 ? +(nwcM / qSalesM * 100).toFixed(1) : null;
    const dsoNWC = arM > 0 && qSalesM > 0 ? +(arM / qSalesM * 90).toFixed(1) : null;
    const dioNWC = invM > 0 && qCogsM > 0 ? +(invM / qCogsM * 90).toFixed(1) : null;
    const dpoNWC = apM > 0 && qCogsM > 0 ? +(apM / qCogsM * 90).toFixed(1) : null;
    const cccNWC = dsoNWC != null && dioNWC != null && dpoNWC != null
      ? +(dsoNWC + dioNWC - dpoNWC).toFixed(1) : null;

    // 직전분기 (QoQ) 비교 — e.g. 26.1Q → 25.4Q
    const prevQKey = getPeriodKey(selectedPeriod, 'prev');
    const prevQLabel = prevQKey.replace('20','').replace('_','.');
    const bsRowPrev = balanceSheetData[prevQKey] || {};
    const qSalesPrevM = incomeStatementData[prevQKey]?.매출액 || 0;
    const qCogsPrevM = incomeStatementData[prevQKey]?.매출원가 || 0;
    const arMPrev = bsRowPrev.매출채권 || 0;
    const invMPrev = bsRowPrev.재고자산 || 0;
    const apMPrev = bsRowPrev.매입채무 || 0;
    const nwcMPrev = arMPrev + invMPrev - apMPrev;
    const dsoPrev = arMPrev > 0 && qSalesPrevM > 0 ? +(arMPrev / qSalesPrevM * 90).toFixed(1) : null;
    const dioPrev = invMPrev > 0 && qCogsPrevM > 0 ? +(invMPrev / qCogsPrevM * 90).toFixed(1) : null;
    const dpoPrev = apMPrev > 0 && qCogsPrevM > 0 ? +(apMPrev / qCogsPrevM * 90).toFixed(1) : null;
    const cccPrev = dsoPrev != null && dioPrev != null && dpoPrev != null
      ? +(dsoPrev + dioPrev - dpoPrev).toFixed(1) : null;

    // 전년동분기 (YoY) 비교 — e.g. 26.1Q → 25.1Q
    const yoyQKey = getPeriodKey(selectedPeriod, 'prev_quarter');
    const yoyQLabel = yoyQKey.replace('20','').replace('_','.');
    const bsRowYoY = balanceSheetData[yoyQKey] || {};
    const qSalesYoYM = incomeStatementData[yoyQKey]?.매출액 || 0;
    const qCogsYoYM  = incomeStatementData[yoyQKey]?.매출원가 || 0;
    const arYoY  = bsRowYoY.매출채권 || 0;
    const invYoY = bsRowYoY.재고자산 || 0;
    const apYoY  = bsRowYoY.매입채무 || 0;
    const nwcYoY = arYoY + invYoY - apYoY;
    const dsoYoY = arYoY  > 0 && qSalesYoYM > 0 ? +(arYoY  / qSalesYoYM * 90).toFixed(1) : null;
    const dioYoY = invYoY > 0 && qCogsYoYM  > 0 ? +(invYoY / qCogsYoYM  * 90).toFixed(1) : null;
    const dpoYoY = apYoY  > 0 && qCogsYoYM  > 0 ? +(apYoY  / qCogsYoYM  * 90).toFixed(1) : null;
    const cccYoY = dsoYoY != null && dioYoY != null && dpoYoY != null
      ? +(dsoYoY + dioYoY - dpoYoY).toFixed(1) : null;

    // NWC 시계열 (24.1Q~26.1Q, balanceSheetData 기반)
    const nwcTrendPeriods = ['2024_1Q','2024_2Q','2024_3Q','2024_4Q','2025_1Q','2025_2Q','2025_3Q','2025_4Q','2026_1Q'];
    const nwcTrendData = nwcTrendPeriods.map(pk => {
      const bs = balanceSheetData[pk] || {};
      const is = incomeStatementData[pk] || {};
      const ar = bs.매출채권 || 0;
      const inv = bs.재고자산 || 0;
      const ap = bs.매입채무 || 0;
      const rev = is.매출액 || 0;
      const cogs = is.매출원가 || 0;
      if (!ar && !inv && !ap) return null;
      const nwc = ar + inv - ap;
      const dso = ar > 0 && rev > 0 ? +(ar / rev * 90).toFixed(1) : null;
      const dio = inv > 0 && cogs > 0 ? +(inv / cogs * 90).toFixed(1) : null;
      const dpo = ap > 0 && cogs > 0 ? +(ap / cogs * 90).toFixed(1) : null;
      const ccc = dso != null && dio != null && dpo != null ? +(dso + dio - dpo).toFixed(1) : null;
      const name = pk.replace('20', '').replace('_', '.');
      return {
        name, NWC: Math.round(nwc / 100),
        'NWC매출비': rev > 0 ? +(nwc / rev * 100).toFixed(1) : null,
        DSO: dso, DIO: dio, DPO: dpo, CCC: ccc,
        AR: Math.round(ar / 100), INV: Math.round(inv / 100), AP: Math.round(ap / 100),
        AR매출비: rev > 0 ? +(ar / rev * 100).toFixed(1) : null,
        INV매출비: rev > 0 ? +(inv / rev * 100).toFixed(1) : null,
        AP매출비: rev > 0 ? +(ap / rev * 100).toFixed(1) : null,
      };
    }).filter(Boolean);

    // NWC 추세 분석 인사이트 (대표 보고용)
    const nwcTrendInsights = (() => {
      if (nwcTrendData.length < 2) return [];
      const insights = [];
      const first = nwcTrendData[0];
      const last = nwcTrendData[nwcTrendData.length - 1];

      // 1. NWC 규모 변화
      const nwcChange = last.NWC - first.NWC;
      const nwcChangePct = first.NWC > 0 ? Math.round(nwcChange / first.NWC * 100) : null;
      if (nwcChangePct !== null) {
        insights.push(`NWC 규모: ${first.name} ${formatNumber(first.NWC)}억 → ${last.name} ${formatNumber(last.NWC)}억 (${nwcChange >= 0 ? '+' : ''}${nwcChangePct}%). ${nwcChange > 0 ? '운전자본 집약도 확대 — 성장에 따른 자금 소요 증가로 현금흐름 관리 강화 필요' : '운전자본 효율 개선 추세 — 현금 창출 여력 향상'}.`);
      }

      // 2. DSO 추세
      const dsoData = nwcTrendData.filter(d => d.DSO != null);
      if (dsoData.length >= 2) {
        const dsoVals = dsoData.map(d => d.DSO);
        const dsoFirst = dsoVals[0]; const dsoLast = dsoVals[dsoVals.length - 1];
        const dsoMax = Math.max(...dsoVals); const dsoMin = Math.min(...dsoVals);
        const maxPtDso = dsoData.find(d => d.DSO === dsoMax);
        insights.push(`DSO(매출채권 회수일): ${dsoFirst.toFixed(0)}일 → ${dsoLast.toFixed(0)}일 (구간 최대 ${dsoMax.toFixed(0)}일[${maxPtDso?.name}], 최소 ${dsoMin.toFixed(0)}일). ${dsoLast > dsoFirst + 5 ? '회수기일 장기화 추세 — 외상매출 관리 및 대손 리스크 모니터링 강화 필요' : dsoLast < dsoFirst - 5 ? '회수 효율 개선 추세 — 매출채권 관리 정책 효과' : '안정적 수준 유지 — 매출채권 회수 주기 정상 범위'}.`);
      }

      // 3. DIO 추세
      const dioData = nwcTrendData.filter(d => d.DIO != null);
      if (dioData.length >= 2) {
        const dioVals = dioData.map(d => d.DIO);
        const dioFirst = dioVals[0]; const dioLast = dioVals[dioVals.length - 1];
        const dioMax = Math.max(...dioVals);
        const maxPtDio = dioData.find(d => d.DIO === dioMax);
        insights.push(`DIO(재고 회전일): ${dioFirst.toFixed(0)}일 → ${dioLast.toFixed(0)}일 (구간 최대 ${dioMax.toFixed(0)}일[${maxPtDio?.name}]). ${dioLast > dioFirst + 10 ? '재고 체화 심화 추세 — 시즌 재고 소진 전략 및 발주 최적화 시급' : dioLast < dioFirst - 10 ? '재고 관리 효율 대폭 개선 — 수요 예측 정확도 향상 효과' : '재고 관리 수준 안정적 유지'}.`);
      }

      // 4. DPO 추세
      const dpoData = nwcTrendData.filter(d => d.DPO != null);
      if (dpoData.length >= 2) {
        const dpoVals = dpoData.map(d => d.DPO);
        const dpoFirst = dpoVals[0]; const dpoLast = dpoVals[dpoVals.length - 1];
        insights.push(`DPO(매입채무 지급일): ${dpoFirst.toFixed(0)}일 → ${dpoLast.toFixed(0)}일. ${dpoLast > dpoFirst + 5 ? '지급 조건 연장 → 현금 보유 여력 확대(공급업체 관계 지속 모니터링 필요)' : dpoLast < dpoFirst - 5 ? '지급 가속화 → 공급업체 지급 조건 재협상으로 DPO 연장 검토' : '공급업체 지급 조건 안정적 유지'}.`);
      }

      // 5. CCC 추세 및 시사점
      const cccData = nwcTrendData.filter(d => d.CCC != null);
      if (cccData.length >= 2) {
        const cccFirst = cccData[0].CCC; const cccLast = cccData[cccData.length - 1].CCC;
        const cccMin = Math.min(...cccData.map(d => d.CCC));
        const cccMinPt = cccData.find(d => d.CCC === cccMin);
        insights.push(`CCC(현금전환주기): ${cccFirst.toFixed(0)}일 → ${cccLast.toFixed(0)}일 (구간 최저 ${cccMin.toFixed(0)}일[${cccMinPt?.name}]). ${cccLast > cccFirst ? `현금 묶임 기간 연장(+${(cccLast - cccFirst).toFixed(0)}일) — 단기 유동성 압박 요인, 운전자본 효율화 전략 수립 권고` : `현금 회수 주기 단축(${(cccLast - cccFirst).toFixed(0)}일) — 운전자본 효율 개선으로 현금 창출력 강화`}.`);
      }

      return insights;
    })();

    // ④ 리스크 & 이상징후 체크 (전년동기 YoY 대비 — 계절성 제거)
    const nwcRisks = [];
    const riskYoyLabel = yoyQLabel; // e.g. '25.1Q'
    // DSO
    if (dsoNWC != null && dsoYoY != null && dsoNWC > dsoYoY + 5 && qSalesM < qSalesYoYM) {
      nwcRisks.push({ level: 'red', text: `DSO ↑ (전동분기 ${Math.round(dsoYoY)}일→${Math.round(dsoNWC)}일) + 매출 ↓ → 매출채권 회수 지연 🚨` });
    } else if (dsoNWC != null && dsoYoY != null && dsoNWC > dsoYoY + 5) {
      nwcRisks.push({ level: 'orange', text: `DSO ↑ (${riskYoyLabel} ${Math.round(dsoYoY)}일 → 현재 ${Math.round(dsoNWC)}일, +${(dsoNWC-dsoYoY).toFixed(0)}일) → 매출채권 회수기일 장기화 ⚠️` });
    } else if (dsoNWC != null && dsoYoY != null && dsoNWC < dsoYoY - 5) {
      nwcRisks.push({ level: 'green', text: `DSO ↓ (${riskYoyLabel} ${Math.round(dsoYoY)}일 → 현재 ${Math.round(dsoNWC)}일, ${(dsoNWC-dsoYoY).toFixed(0)}일) → 매출채권 회수 효율 개선 ✅` });
    }
    // DIO
    if (dioNWC != null && dioYoY != null && dioNWC > dioYoY + 10) {
      nwcRisks.push({ level: 'orange', text: `DIO ↑ (${riskYoyLabel} ${Math.round(dioYoY)}일 → 현재 ${Math.round(dioNWC)}일, +${(dioNWC-dioYoY).toFixed(0)}일) → 재고 체화 심화, 시즌 소진 전략 점검 🚨` });
    } else if (dioNWC != null && dioYoY != null && dioNWC < dioYoY - 10) {
      nwcRisks.push({ level: 'green', text: `DIO ↓ (${riskYoyLabel} ${Math.round(dioYoY)}일 → 현재 ${Math.round(dioNWC)}일) → 재고 효율 개선 ✅` });
    }
    if (dioNWC != null && dioNWC > 180) {
      nwcRisks.push({ level: 'red', text: `DIO ${Math.round(dioNWC)}일 — 절대 수준 과대, 시즌·트렌드 리스크 긴급 점검 🚨` });
    }
    // DPO
    if (dpoNWC != null && dpoYoY != null && dpoNWC < dpoYoY - 5) {
      nwcRisks.push({ level: 'orange', text: `DPO ↓ (${riskYoyLabel} ${Math.round(dpoYoY)}일 → 현재 ${Math.round(dpoNWC)}일, ${(dpoNWC-dpoYoY).toFixed(0)}일) → 공급업체 지급 가속, 지급조건 재협상 필요 🚨` });
    } else if (dpoNWC != null && dpoYoY != null && dpoNWC > dpoYoY + 5) {
      nwcRisks.push({ level: 'green', text: `DPO ↑ (${riskYoyLabel} ${Math.round(dpoYoY)}일 → 현재 ${Math.round(dpoNWC)}일) → 지급조건 연장, 현금 보유 여력 확대 ✅` });
    }
    // NWC 전체 집약도 (YoY)
    if (nwcM > 0 && nwcYoY > 0 && (nwcM - nwcYoY) / Math.abs(nwcYoY) > 0.2) {
      nwcRisks.push({ level: 'orange', text: `NWC 급증 (${riskYoyLabel} ${formatNumber(Math.round(nwcYoY/100))}억 → 현재 ${formatNumber(Math.round(nwcM/100))}억, +${((nwcM-nwcYoY)/Math.abs(nwcYoY)*100).toFixed(0)}% YoY) → 현금 묶임 확대 🚨` });
    }
    if (nwcRisks.length === 0) {
      const normalDetails = [
        dsoNWC != null && dsoYoY != null ? `DSO ${Math.round(dsoNWC)}일(YoY ${dsoNWC >= dsoYoY ? '+' : ''}${(dsoNWC-dsoYoY).toFixed(0)}일)` : null,
        dioNWC != null && dioYoY != null ? `DIO ${Math.round(dioNWC)}일(YoY ${dioNWC >= dioYoY ? '+' : ''}${(dioNWC-dioYoY).toFixed(0)}일)` : null,
        dpoNWC != null && dpoYoY != null ? `DPO ${Math.round(dpoNWC)}일(YoY ${dpoNWC >= dpoYoY ? '+' : ''}${(dpoNWC-dpoYoY).toFixed(0)}일)` : null,
        cccNWC != null ? `CCC ${Math.round(cccNWC)}일` : null,
      ].filter(Boolean);
      nwcRisks.push({ level: 'green', text: `✅ 이상징후 없음 — DSO·DIO·DPO 전년동기(${riskYoyLabel}) 대비 정상 범위. ${normalDetails.length ? normalDetails.join(' / ') : ''}` });
    }

    // ⑤ 해결책
    const nwcSolutions = [];
    if (nwcRisks.some(r => r.text.includes('회수'))) nwcSolutions.push('매출채권 고령화 분석(30·60·90일 버킷) 및 회수 촉진 강화');
    if (nwcRisks.some(r => r.text.includes('재고'))) nwcSolutions.push('SKU별 재고 회전율 점검, 시즌 말 프로모션·반품 정책 재검토');
    if (nwcRisks.some(r => r.text.includes('DPO') || r.text.includes('현금 압박'))) nwcSolutions.push('주요 공급업체 결제 조건 재협상 — 지급 유예 연장(30→45일) 목표');
    if (nwcRisks.some(r => r.text.includes('현금 묶임'))) nwcSolutions.push('NWC/매출% 목표 밴드 설정 및 분기별 KPI 모니터링 체계화');
    if (nwcSolutions.length === 0) {
      nwcSolutions.push('현행 영업운전자본 관리 수준 유지');
      nwcSolutions.push('NWC/매출% 목표 밴드 설정으로 조기 이상징후 탐지 체계화');
      nwcSolutions.push('DSO·DIO·DPO 분기별 리뷰를 통한 선제적 관리');
    }

    const plHighlights = [];
    if (salesCurr > 0) {
      // ① 매출 모멘텀
      const salesGrowth = salesPrev > 0 ? ((salesCurr - salesPrev) / salesPrev * 100).toFixed(1) : null;
      const salesDiff   = salesPrev > 0 ? Math.round((salesCurr - salesPrev) / 100) : null;
      plHighlights.push(
        `📈 매출 모멘텀: ${Math.round(salesCurr/100)}억원` +
        (salesGrowth ? ` (${incomeCompareLabel} 대비 ${parseFloat(salesGrowth) >= 0 ? '+' : ''}${salesGrowth}%, ${salesDiff >= 0 ? '+' : ''}${formatNumber(Math.abs(salesDiff))}억)` : '') +
        (parseFloat(salesGrowth) > 10 ? ' — 두 자릿수 성장세, 채널 확장·브랜드 모멘텀 견조.' :
         parseFloat(salesGrowth) > 0  ? ' — 완만한 성장. 성장 동력 유지 여부 확인 필요.' :
         ' — 매출 역성장 구간. 채널·브랜드별 원인 분석 필요.')
      );

      // ② 이익 구조 — 매출총이익률 vs 영업이익률 vs 순이익률
      const grossMarginDiff = (grossMarginCurr - grossMarginPrev).toFixed(1);
      const opMarginDiff    = (operatingMarginCurr - operatingMarginPrev).toFixed(1);
      const niMarginDiff    = (netMarginCurr - netMarginPrev).toFixed(1);
      plHighlights.push(
        `💰 이익 구조: 매출총이익률 ${grossMarginCurr.toFixed(1)}%(${parseFloat(grossMarginDiff)>=0?'+':''}${grossMarginDiff}%p) → 영업이익률 ${operatingMarginCurr.toFixed(1)}%(${parseFloat(opMarginDiff)>=0?'+':''}${opMarginDiff}%p) → 순이익률 ${netMarginCurr.toFixed(1)}%(${parseFloat(niMarginDiff)>=0?'+':''}${niMarginDiff}%p). ` +
        (() => {
          const gap = netMarginCurr - operatingMarginCurr;
          if (gap > 5)  return `순이익률이 영업이익률 대비 +${gap.toFixed(1)}%p 높음 — 영업외 이익(외환·투자) 기여 또는 세금 효과 확인 필요.`;
          if (gap < -3) return `순이익률이 영업이익률 대비 ${gap.toFixed(1)}%p 낮음 — 금융비용·영업외손실 부담 점검.`;
          return '영업이익과 순이익 괴리 없음 — 영업활동 중심의 안정적 이익 구조.';
        })()
      );

      // ③ 비용 핵심 드라이버
      if (latestDt) {
        const feeImpact  = latestDt.수수료율    > 20 ? '높음(채널 직판 확대 여력 검토)' : '적정';
        const laborImpact= latestDt.인건비율   > 10 ? '증가 추세' : '안정적';
        const adImpact   = latestDt.광고선전비율 > 5  ? '공격적 투자 구간' : '효율적 집행';
        plHighlights.push(
          `🏷 비용 드라이버(${latestDt.name}): 수수료율 ${latestDt.수수료율}%(${feeImpact}) · 인건비율 ${latestDt.인건비율}%(${laborImpact}) · 광고비율 ${latestDt.광고선전비율}%(${adImpact}) · 감가상각 ${latestDt.감가상각비율}%. 수수료가 최대 판관비 항목 — 직매장·D2C 비중 확대 시 마진 레버리지 여력 존재.`
        );
      }

      // ④ 성장성 vs 수익성 교차 평가
      const growthOk  = salesGrowth  != null && parseFloat(salesGrowth)  > 0;
      const marginOk  = parseFloat(opMarginDiff) >= 0;
      const quadrant  =  growthOk && marginOk  ? '매출↑·이익률↑ — 성장과 수익성 동반 개선(최선 구간)'
                       : growthOk && !marginOk ? '매출↑·이익률↓ — 외형 성장, 수익성 희생. 비용 레버리지 확보 필요'
                       : !growthOk && marginOk ? '매출↓·이익률↑ — 수익성 집중 전략. 볼륨 회복이 다음 과제'
                       :                         '매출↓·이익률↓ — 외형·수익성 동반 약화. 구조적 원인 진단 급선무';
      plHighlights.push(`🎯 성장·수익성 매트릭스: ${quadrant}.`);
    }
    if (plHighlights.length === 0) {
      plHighlights.push('손익 요약 카드 및 조회 기간을 확인해 주세요. CSV·기간 데이터가 채워지면 추이가 표시됩니다.');
    }

    // bsHighlights replaced by nwcRisks / nwcSolutions above

    const performanceAi = generateAIAnalysis();
    const riskItems = performanceAi.risks?.slice(0, 4) || [];
    const actionItems = performanceAi.actions?.slice(0, 4) || [];
    const insightOneOff =
      performanceAi.insights?.find(
        (x) => /일시|일회|소송|특수|비정기/i.test(x.title + x.desc)
      ) || performanceAi.insights?.[0];

    return (
      <div className="space-y-7 mt-4">
        {/* 손익 요약 섹션 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-zinc-800 tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-5 bg-blue-500 rounded"></span>
              손익 요약
            </h3>
            {/* 손익 조회 옵션 */}
            <div className="flex items-center border-b border-zinc-200">
              <button
                onClick={() => setSummaryKpiMode('quarter')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  summaryKpiMode === 'quarter'
                    ? 'text-zinc-900 border-zinc-900'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                }`}
              >
                분기(3개월)
              </button>
              <button
                onClick={() => setSummaryKpiMode('cumulative')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  summaryKpiMode === 'cumulative'
                    ? 'text-zinc-900 border-zinc-900'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                }`}
              >
                누적(연간)
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {incomeCards.map((card, idx) => renderCard(card, idx))}
          </div>
        </div>

        {/* 재무상태 요약 섹션 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-zinc-800 tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-5 bg-amber-500 rounded"></span>
              재무상태 요약
            </h3>
            {/* 재무상태 조회 옵션 */}
            <div className="flex items-center border-b border-zinc-200">
              <button
                onClick={() => setBalanceKpiMode('sameQuarter')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  balanceKpiMode === 'sameQuarter'
                    ? 'text-zinc-900 border-zinc-900'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                }`}
              >
                동분기
              </button>
              <button
                onClick={() => setBalanceKpiMode('yearEnd')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  balanceKpiMode === 'yearEnd'
                    ? 'text-zinc-900 border-zinc-900'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                }`}
              >
                전기말
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {balanceCards.map((card, idx) => renderCard(card, idx))}
          </div>
        </div>

        {/* PL·BS 성과분석 & 기타 (재무상태 요약 ↔ AI 분석) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-5 bg-indigo-500 rounded" />
            <h3 className="text-[13px] font-bold text-zinc-800 tracking-tight">성과분석 · 재무구조</h3>
            <span className="text-[10px] text-zinc-400">
              {qKeyPerf} · {balanceCompareLabel} BS · 단위 차트 억원
            </span>
          </div>

          <div className="space-y-6">
            {/* PL(성과분석) */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 bg-blue-50/60">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-800">PL(성과분석)</h4>
              </div>
              <div className="p-5 space-y-6">
                {/* ① 연도별 실적추이 + ② 비용구조 — 좌우 2열 */}
                {plTrendData.yearly.length > 0 && (
                <div className="grid grid-cols-5 gap-5 items-start">
                {/* 좌: ① 연도별 실적추이 */}
                <div className="col-span-3">
                  <p className="text-[12px] font-semibold text-zinc-700 mb-1.5">
                    ① 연도별 실적추이 — 분기별 구성 <span className="font-normal text-zinc-400 text-[11px]">(단위: 억원)</span>
                  </p>
                  {(() => {
                    const qs = ['1Q','2Q','3Q','4Q'];
                    // 분기별 항목별 최고값 사전계산
                    const colMaxSales = {}, colMaxOp = {}, colMaxRate = {};
                    qs.forEach(q => {
                      colMaxSales[q] = Math.max(...plTrendData.yearly.map(y => y[q+'매출'] || 0));
                      colMaxOp[q]    = Math.max(...plTrendData.yearly.map(y => y[q+'영업이익'] || 0));
                      const rates = plTrendData.yearly.map(y => {
                        const s = y[q+'매출'] || 0; const o = y[q+'영업이익'] || 0;
                        return s > 0 ? o / s : -Infinity;
                      });
                      colMaxRate[q]  = Math.max(...rates);
                    });
                    const fmt = v => v > 0 ? formatNumber(Math.round(v)) : '-';
                    const fmtR = (op, sales) => sales > 0 ? (op / sales * 100).toFixed(1) + '%' : '-';
                    // 범례
                    const legend = [
                      { color: 'bg-blue-100 text-blue-800', label: '매출액 최고' },
                      { color: 'bg-emerald-100 text-emerald-800', label: '영업이익 최고' },
                      { color: 'bg-amber-100 text-amber-800', label: '이익률 최고' },
                    ];
                    return (
                      <>
                        <div className="flex items-center gap-3 mb-1.5 text-[9px]">
                          {legend.map(l => (
                            <span key={l.label} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${l.color}`}>
                              {l.label}
                            </span>
                          ))}
                        </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-zinc-100">
                              <th rowSpan="2" className="text-center py-1.5 px-2 border border-zinc-200 font-bold text-zinc-600 w-10">연도</th>
                              {[...qs, '합계'].map(q => (
                                <th key={q} colSpan="3" className={`text-center py-1 px-1 border border-zinc-200 font-bold ${q === '합계' ? 'bg-zinc-200 text-zinc-700' : 'text-blue-700'}`}>{q}</th>
                              ))}
                            </tr>
                            <tr className="bg-zinc-50 text-zinc-500">
                              {[...qs, '합계'].flatMap(q => [
                                <th key={q+'s'} className="text-right py-1 px-1.5 border border-zinc-200 font-medium whitespace-nowrap">매출액</th>,
                                <th key={q+'o'} className="text-right py-1 px-1.5 border border-zinc-200 font-medium whitespace-nowrap">영업이익</th>,
                                <th key={q+'r'} className="text-right py-1 px-1.5 border border-zinc-200 font-medium whitespace-nowrap">이익률</th>,
                              ])}
                            </tr>
                          </thead>
                          <tbody>
                            {plTrendData.yearly.map(y => {
                              const yearShort = y.name.replace('20','').replace('년','년');
                              return (
                                <tr key={y.name} className="hover:bg-zinc-50/80 border-b border-zinc-100">
                                  <td className="text-center py-1.5 px-1 border border-zinc-200 font-bold text-zinc-700">{yearShort}</td>
                                  {qs.map(q => {
                                    const s = y[q+'매출'] || 0;
                                    const o = y[q+'영업이익'] || 0;
                                    const rate = s > 0 ? o / s : -Infinity;
                                    // 분기 기준 항목별 최고 연도 → 3색 음영
                                    const isBestSales = s > 0 && s === colMaxSales[q];
                                    const isBestOp    = o > 0 && o === colMaxOp[q];
                                    const isBestRate  = s > 0 && Math.abs(rate - colMaxRate[q]) < 0.00001;
                                    const sCls = isBestSales ? 'bg-blue-100 text-blue-800 font-bold' : 'text-zinc-600';
                                    const oCls = isBestOp    ? 'bg-emerald-100 text-emerald-800 font-bold' : 'text-zinc-600';
                                    const rCls = isBestRate  ? 'bg-amber-100 text-amber-800 font-bold' : 'text-zinc-600';
                                    return [
                                      <td key={q+'s'} className={`text-right py-1.5 px-2 border border-zinc-100 tabular-nums ${sCls}`}>{fmt(s)}</td>,
                                      <td key={q+'o'} className={`text-right py-1.5 px-2 border border-zinc-100 tabular-nums ${oCls}`}>{fmt(o)}</td>,
                                      <td key={q+'r'} className={`text-right py-1.5 px-2 border border-zinc-100 tabular-nums ${rCls}`}>{fmtR(o,s)}</td>,
                                    ];
                                  })}
                                  {/* 합계 */}
                                  <td className="text-right py-1.5 px-2 border border-zinc-200 tabular-nums bg-zinc-50 font-medium">{fmt(y.매출액)}</td>
                                  <td className="text-right py-1.5 px-2 border border-zinc-200 tabular-nums bg-zinc-50 font-medium">{fmt(y.영업이익)}</td>
                                  <td className="text-right py-1.5 px-2 border border-zinc-200 tabular-nums bg-zinc-50 font-medium text-teal-700">{y.영업이익률 > 0 ? y.영업이익률.toFixed(1)+'%' : '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      </>
                    );
                  })()}
                  {yearlyInsights.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] font-semibold text-zinc-500 mb-1">실적 분석</p>
                      <ul className="text-[11px] text-zinc-600 space-y-1 list-disc pl-4 leading-relaxed">
                        {yearlyInsights.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                {/* 우: ② 비용구조 */}
                <div className="col-span-2">
                  <p className="text-[12px] font-semibold text-zinc-700 mb-1.5">
                    ② 비용구조 <span className="font-normal text-zinc-400 text-[11px]">(최근 5분기, %)</span>
                  </p>
                  {(() => {
                    const rows = [
                      { label: '매출원가율', key: '매출원가율', dot: 'bg-slate-400' },
                      { label: '수수료율', key: '수수료율', dot: 'bg-amber-400' },
                      { label: '인건비율', key: '인건비율', dot: 'bg-violet-400' },
                      { label: '광고선전비율', key: '광고선전비율', dot: 'bg-blue-400' },
                      { label: '감가상각비율', key: '감가상각비율', dot: 'bg-emerald-400' },
                      { label: '기타판관비율', key: '기타판관비율', dot: 'bg-rose-400' },
                    ];
                    const cols = costTrendData.slice(-5);
                    const latest = cols[cols.length - 1];
                    // 전동분기차: 최신 분기의 전년 동분기 (e.g. 26.1Q → 25.1Q)
                    const latestName = latest?.name ?? '';
                    const yoyName = latestName ? (String(Number(latestName.slice(0,2)) - 1) + latestName.slice(2)) : null;
                    const prev = yoyName ? costTrendData.find(d => d.name === yoyName) : null;
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-zinc-50">
                              <th className="text-left py-1.5 px-2 font-semibold text-zinc-500 border border-zinc-100 w-24">항목</th>
                              {cols.map(d => (
                                <th key={d.name} className={`text-right py-1.5 px-2 font-semibold border border-zinc-100 ${d.name === latest?.name ? 'bg-blue-50 text-blue-800' : 'text-zinc-500'}`}>
                                  {d.name}
                                </th>
                              ))}
                              <th className="text-right py-1.5 px-2 font-semibold text-zinc-400 border border-zinc-100">전동분기차<br/><span className="font-normal text-[9px] text-zinc-300">{yoyName ?? ''}</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ label, key, dot }) => {
                              const diff = latest?.[key] != null && prev?.[key] != null ? (latest[key] - prev[key]).toFixed(1) : null;
                              return (
                                <tr key={key} className="hover:bg-zinc-50/60">
                                  <td className="py-1.5 px-2 border border-zinc-100 text-zinc-700 font-medium">
                                    <span className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                      {label}
                                    </span>
                                  </td>
                                  {cols.map(d => (
                                    <td key={d.name} className={`text-right py-1.5 px-2 tabular-nums border border-zinc-100 ${d.name === latest?.name ? 'bg-blue-50/60 font-semibold text-zinc-800' : 'text-zinc-600'}`}>
                                      {d[key] != null ? `${Number(d[key]).toFixed(1)}%` : '—'}
                                    </td>
                                  ))}
                                  <td className={`text-right py-1.5 px-2 tabular-nums border border-zinc-100 font-semibold ${diff == null ? 'text-zinc-300' : Number(diff) > 0 ? 'text-rose-500' : Number(diff) < 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                                    {diff != null ? (Number(diff) > 0 ? `+${diff}%p` : `${diff}%p`) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                            {/* 영업이익률 구분선 */}
                            <tr className="bg-zinc-50 font-semibold border-t-2 border-zinc-300">
                              <td className="py-1.5 px-2 border border-zinc-100 text-zinc-800">영업이익률</td>
                              {cols.map(d => (
                                <td key={d.name} className={`text-right py-1.5 px-2 tabular-nums border border-zinc-100 ${d.name === latest?.name ? 'bg-blue-50/60 text-blue-700' : 'text-zinc-700'}`}>
                                  {d['영업이익률'] != null ? `${Number(d['영업이익률']).toFixed(1)}%` : '—'}
                                </td>
                              ))}
                              {(() => {
                                const diff = latest?.['영업이익률'] != null && prev?.['영업이익률'] != null
                                  ? (latest['영업이익률'] - prev['영업이익률']).toFixed(1) : null;
                                return (
                                  <td className={`text-right py-1.5 px-2 tabular-nums border border-zinc-100 font-semibold ${diff == null ? 'text-zinc-300' : Number(diff) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {diff != null ? (Number(diff) >= 0 ? `+${diff}%p` : `${diff}%p`) : '—'}
                                  </td>
                                );
                              })()}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                  {costInsights.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] font-semibold text-zinc-500 mb-1">비용구조 분석 및 시사점</p>
                      <ul className="text-[11px] text-zinc-600 space-y-1 list-disc pl-4 leading-relaxed">
                        {costInsights.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                </div>
                )}
                {/* ③ 핵심포인트 */}
                <div>
                  <p className="text-[12px] font-semibold text-zinc-700 mb-2">③ 핵심포인트</p>
                  <ul className="text-[11px] text-zinc-600 space-y-2 list-none pl-0">
                    {plHighlights.map((t, i) => (
                      <li key={i} className="flex gap-1.5 leading-relaxed bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100">{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* BS(재무상태) — 영업운전자본 분석 */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 bg-emerald-50/60">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">BS — 영업운전자본 (NWC) 분석 (24.1Q~26.1Q)</h4>
              </div>
              <div className="p-5">

                {/* ══ 2열 레이아웃: 좌(KPI+추세차트) / 우(구성요소+시사점+리스크+개선방향) ══ */}
                <div className="grid grid-cols-2 gap-5 items-start">

                  {/* ──── 좌 (50%): ① 핵심 KPI + ② 추세 분석 차트 ──── */}
                  <div className="space-y-4">
                  <div>
                    <p className="text-[12px] font-semibold text-zinc-700 mb-2.5">
                      ① 핵심 KPI
                      <span className="font-normal text-zinc-400 text-[10px] ml-1">(NWC = 매출채권 + 재고 − 매입채무)</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          label: 'NWC', val: nwcM > 0 ? `${formatNumber(Math.round(nwcM/100))}억` : '—', color: 'text-emerald-700',
                          rows: [
                            { tag: `직전분기(${prevQLabel})`, v: nwcMPrev > 0 ? `${formatNumber(Math.round(nwcMPrev/100))}억` : '—' },
                            { tag: `전년동기(${yoyQLabel})`, v: nwcYoY > 0 ? `${formatNumber(Math.round(nwcYoY/100))}억` : '—' },
                          ],
                        },
                        {
                          label: 'NWC / 매출', val: nwcPctRev != null ? `${nwcPctRev}%` : '—',
                          color: nwcPctRev != null ? (nwcPctRev < 20 ? 'text-emerald-600' : nwcPctRev > 40 ? 'text-rose-600' : 'text-zinc-700') : 'text-emerald-700',
                          rows: (() => {
                            if (nwcPctRev == null) return [{ tag: '집약도', v: '' }];
                            if (nwcPctRev < 20)  return [{ tag: '▲ 긍정', v: '효율적 자금 운용' }];
                            if (nwcPctRev <= 40) return [{ tag: '◆ 보통', v: '업계 평균 수준' }];
                            return [{ tag: '▼ 부정', v: '현금 묶임 과다', warn: true }];
                          })(),
                        },
                        {
                          label: 'DSO (매출채권 회수일)', val: dsoNWC != null ? `${Math.round(dsoNWC)}일` : '—',
                          color: dsoNWC != null && dsoPrev != null && dsoNWC > dsoPrev ? 'text-rose-600' : 'text-zinc-800',
                          rows: [
                            { tag: `직전분기(${prevQLabel})`, v: dsoPrev != null ? `${Math.round(dsoPrev)}일` : '—', warn: dsoNWC != null && dsoPrev != null && dsoNWC > dsoPrev + 5 },
                            { tag: `전년동기(${yoyQLabel})`, v: dsoYoY != null ? `${Math.round(dsoYoY)}일` : '—', warn: dsoNWC != null && dsoYoY != null && dsoNWC > dsoYoY + 5 },
                          ],
                          bench: '30~45일', benchLow: 30, benchHigh: 45, lowerBetter: true,
                        },
                        {
                          label: 'DIO (재고 회전일)', val: dioNWC != null ? `${Math.round(dioNWC)}일` : '—',
                          color: dioNWC != null && dioPrev != null && dioNWC > dioPrev ? 'text-rose-600' : 'text-zinc-800',
                          rows: [
                            { tag: `직전분기(${prevQLabel})`, v: dioPrev != null ? `${Math.round(dioPrev)}일` : '—', warn: dioNWC != null && dioPrev != null && dioNWC > dioPrev + 5 },
                            { tag: `전년동기(${yoyQLabel})`, v: dioYoY != null ? `${Math.round(dioYoY)}일` : '—', warn: dioNWC != null && dioYoY != null && dioNWC > dioYoY + 5 },
                          ],
                          bench: '90~150일', benchLow: 90, benchHigh: 150, lowerBetter: true,
                        },
                        {
                          label: 'DPO (매입채무 지급일)', val: dpoNWC != null ? `${Math.round(dpoNWC)}일` : '—',
                          color: dpoNWC != null && dpoPrev != null && dpoNWC < dpoPrev ? 'text-rose-600' : 'text-zinc-800',
                          rows: [
                            { tag: `직전분기(${prevQLabel})`, v: dpoPrev != null ? `${Math.round(dpoPrev)}일` : '—', warn: dpoNWC != null && dpoPrev != null && dpoNWC < dpoPrev - 5 },
                            { tag: `전년동기(${yoyQLabel})`, v: dpoYoY != null ? `${Math.round(dpoYoY)}일` : '—', warn: dpoNWC != null && dpoYoY != null && dpoNWC < dpoYoY - 5 },
                          ],
                          bench: '30~60일', benchLow: 30, benchHigh: 60, lowerBetter: false,
                        },
                        {
                          label: 'CCC (현금전환주기)', val: cccNWC != null ? `${Math.round(cccNWC)}일` : '—',
                          color: cccNWC != null && cccNWC > 180 ? 'text-rose-600' : 'text-zinc-800',
                          rows: [
                            { tag: `직전분기(${prevQLabel})`, v: cccPrev != null ? `${Math.round(cccPrev)}일` : '—', warn: cccNWC != null && cccPrev != null && cccNWC > cccPrev + 5 },
                            { tag: `전년동기(${yoyQLabel})`, v: cccYoY != null ? `${Math.round(cccYoY)}일` : '—', warn: cccNWC != null && cccYoY != null && cccNWC > cccYoY + 5 },
                          ],
                          bench: '90~150일', benchLow: 90, benchHigh: 150, lowerBetter: true,
                        },
                      ].map((k, i) => {
                        const numVal = k.bench ? parseFloat(k.val) : null;
                        const benchGood = numVal != null && k.bench && (k.lowerBetter ? numVal < k.benchLow : numVal > k.benchHigh);
                        const benchBad  = numVal != null && k.bench && (k.lowerBetter ? numVal > k.benchHigh : numVal < k.benchLow);
                        return (
                        <div key={i} className="rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-2.5">
                          <div className="text-[10px] text-zinc-400 font-medium leading-tight mb-1">{k.label}</div>
                          <div className={`text-lg font-bold tabular-nums mb-1.5 ${k.color}`}>{k.val}</div>
                          <div className="space-y-0.5 border-t border-zinc-100 pt-1">
                            {k.rows.map((r, ri) => (
                              <div key={ri} className="flex justify-between items-center gap-1">
                                <span className="text-[9px] text-zinc-400 leading-tight">{r.tag}</span>
                                {r.v ? <span className={`text-[10px] tabular-nums font-semibold ${r.warn ? 'text-rose-500' : 'text-zinc-500'}`}>{r.v}</span> : null}
                              </div>
                            ))}
                          </div>
                          {k.bench && (
                            <div className="mt-1.5 pt-1.5 border-t border-zinc-100 flex justify-between items-center">
                              <span className="text-[9px] text-zinc-300">업계 {k.bench}</span>
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${benchBad ? 'bg-rose-50 text-rose-500' : benchGood ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'}`}>
                                {benchBad ? '▼ 부정' : benchGood ? '▲ 긍정' : '◆ 보통'}
                              </span>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* /① 핵심 KPI 섹션 */}

                  {/* ② 추세 분석 차트 — 좌 하단 */}
                  {nwcTrendData.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold text-zinc-700 mb-2">
                        ② 추세 분석
                        <span className="font-normal text-zinc-400 text-[10px] ml-1">(24.1Q~26.1Q)</span>
                      </p>
                      <p className="text-[10px] text-zinc-400 mb-1">DSO · DIO · DPO (일수)</p>
                      <div className="h-52 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={nwcTrendData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#71717a" />
                            <YAxis tick={{ fontSize: 9 }} stroke="#71717a" tickFormatter={v => `${v}일`} domain={[0, 'auto']} />
                            <Tooltip content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-white border border-zinc-200 rounded-lg shadow px-2.5 py-2 text-[10px]">
                                  <div className="font-semibold mb-1 text-zinc-700">{label}</div>
                                  {payload.map((p, i) => (
                                    <div key={i} className="flex justify-between gap-3" style={{ color: p.color }}>
                                      <span>{p.name}</span>
                                      <span className="font-bold">{p.value != null ? `${p.value}일` : '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Line type="monotone" dataKey="DSO" name="DSO" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="DIO" name="DIO" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="DPO" name="DPO" stroke="#10b981" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  </div>{/* /좌 컬럼 */}

                  {/* ──── 우 (50%): 구성요소 상세 + 추세분석 시사점 + 리스크 + 개선방향 ──── */}
                  <div className="space-y-4">
                  <div>
                    <p className="text-[12px] font-semibold text-zinc-700 mb-2.5">구성요소 상세</p>
                    <table className="w-full text-[11px] border-collapse mb-0">
                      <thead>
                        <tr className="bg-zinc-50 text-zinc-500">
                          <th className="text-left py-2 px-2.5 font-semibold border border-zinc-100">항목</th>
                          <th className="text-right py-2 px-2.5 font-semibold border border-zinc-100">금액(억)</th>
                          <th className="text-right py-2 px-2.5 font-semibold border border-zinc-100">매출 대비</th>
                          <th className="text-right py-2 px-2.5 font-semibold border border-zinc-100">전분기比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: '매출채권', valM: arM, valAMPrev: arMPrev, pct: qSalesM > 0 ? (arM/qSalesM*100).toFixed(1) : null, color: 'text-indigo-600' },
                          { label: '재고자산', valM: invM, valAMPrev: invMPrev, pct: qSalesM > 0 ? (invM/qSalesM*100).toFixed(1) : null, color: 'text-amber-600' },
                          { label: '매입채무', valM: apM, valAMPrev: apMPrev, pct: qSalesM > 0 ? (apM/qSalesM*100).toFixed(1) : null, color: 'text-emerald-600' },
                        ].map((row, i) => {
                          const d2 = row.valM - row.valAMPrev;
                          const diffPct = row.valAMPrev > 0 ? (d2 / row.valAMPrev * 100).toFixed(1) : null;
                          const isUp = d2 > 0; const isAsset = i < 2;
                          const isAlert = (isAsset && isUp && Math.abs(d2) > 5000) || (!isAsset && !isUp && Math.abs(d2) > 5000);
                          return (
                            <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                              <td className={`py-2 px-2.5 font-semibold border border-zinc-100 ${row.color}`}>{row.label}</td>
                              <td className="text-right py-2 px-2.5 tabular-nums border border-zinc-100 font-semibold">{formatNumber(Math.round(row.valM/100))}</td>
                              <td className="text-right py-2 px-2.5 tabular-nums border border-zinc-100">{row.pct != null ? `${row.pct}%` : '—'}</td>
                              <td className={`text-right py-2 px-2.5 tabular-nums border border-zinc-100 font-semibold ${isAlert ? 'text-rose-600' : isUp ? 'text-zinc-600' : 'text-zinc-400'}`}>
                                {diffPct != null ? `${isUp ? '↑' : '↓'}${Math.abs(diffPct)}%` : '—'}{isAlert && ' 🚨'}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-emerald-50 font-bold">
                          <td className="py-2 px-2.5 border border-zinc-100 text-emerald-800">NWC 합계</td>
                          <td className="text-right py-2 px-2.5 tabular-nums border border-zinc-100 text-emerald-800">{formatNumber(Math.round(nwcM/100))}</td>
                          <td className="text-right py-2 px-2.5 tabular-nums border border-zinc-100 text-emerald-700">{nwcPctRev != null ? `${nwcPctRev}%` : '—'}</td>
                          <td className={`text-right py-2 px-2.5 tabular-nums border border-zinc-100 ${nwcMPrev > 0 ? (nwcM > nwcMPrev ? 'text-rose-600' : 'text-emerald-700') : 'text-zinc-400'}`}>
                            {nwcMPrev > 0 ? `${nwcM >= nwcMPrev ? '↑' : '↓'}${Math.abs(((nwcM-nwcMPrev)/nwcMPrev*100)).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 추세 분석 시사점 */}
                  {nwcTrendInsights.length > 0 && (
                    <div className="rounded-lg bg-emerald-50/80 border border-emerald-100 px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-emerald-800 mb-1.5">추세 분석 시사점</p>
                      <ul className="space-y-1">
                        {nwcTrendInsights.map((t, i) => (
                          <li key={i} className="flex gap-1.5 text-[11px] text-emerald-900 leading-relaxed">
                            <span className="shrink-0 font-bold text-emerald-500">{i + 1}.</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 리스크 & 이상징후 */}
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-700 mb-1.5">리스크 &amp; 이상징후 <span className="font-normal text-zinc-400 text-[10px]">(전년동기 YoY 대비)</span></p>
                    <ul className="space-y-1.5">
                      {nwcRisks.map((r, i) => (
                        <li key={i} className={`text-[11px] rounded-lg px-3 py-2 leading-relaxed font-medium ${
                          r.level === 'red'    ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                          r.level === 'orange' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          r.level === 'info'   ? 'bg-blue-50 text-blue-700 border border-blue-100 font-normal' :
                          'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>{r.text}</li>
                      ))}
                    </ul>
                  </div>

                  {/* 개선 방향 */}
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-700 mb-1.5">개선 방향</p>
                    <ul className="space-y-1.5">
                      {nwcSolutions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-[11px] text-zinc-700 leading-relaxed bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100">
                          <span className="text-emerald-500 font-bold shrink-0">{i + 1}.</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  </div>{/* /우 컬럼 */}
                </div>{/* /2열 grid */}

                {/* ══ 업계 비교 각주 ══ */}
                <p className="text-[9px] text-zinc-400 mt-0">※ 업계 기준치(국내 패션업계 참고): DSO 30~45일 / DIO 90~150일 / DPO 30~60일 / CCC 90~150일 · 삼성패션연구소·업계 공개 자료 기반 / DSO·DIO·CCC는 낮을수록, DPO는 높을수록 유리.</p>

              </div>
            </div>
          </div>

          {/* 자회사 현황 */}
          {(() => {
            const subEntities = ['중국', '홍콩', '엔터테인먼트', 'ST미국', '베트남'];
            const subColors   = { '중국': '#6366f1', '홍콩': '#f59e0b', '베트남': '#10b981', '엔터테인먼트': '#f43f5e', 'ST미국': '#0ea5e9' };
            const subPeriods  = ['2024_1Q','2024_2Q','2024_3Q','2024_4Q','2025_1Q','2025_2Q','2025_3Q','2025_4Q','2026_1Q'];

            // 법인별 IS/BS 데이터 추출 (백만원 → 억원)
            const getEV = (type, period, account, entity) => {
              const v = entityCsvLookup?.[type]?.[period]?.[normalizeAccount(account)]?.[entity];
              return v != null ? Math.round(v / 100) : null;
            };

            const subData = subEntities.map(entity => {
              const series = subPeriods.map(pk => {
                const name = pk.replace('20','').replace('_','.');
                return {
                  name,
                  매출액:    getEV('is', pk, '매출액', entity),
                  영업이익:  getEV('is', pk, '영업이익', entity),
                  당기순이익: getEV('is', pk, '당기순이익', entity),
                  자산총계:  getEV('bs', pk, '자산총계', entity),
                  부채총계:  getEV('bs', pk, '부채총계', entity),
                  자본총계:  getEV('bs', pk, '자본총계', entity),
                };
              });
              const latest = series[series.length - 1];
              return { entity, series, latest };
            });

            // 요약 분석 텍스트 (법인별)
            const genAnalysis = (entity, series) => {
              const pos = [], neg = [], neu = [];
              const hasData = series.some(s => s.매출액 != null);
              if (!hasData) return { pos: [], neg: [], neu: ['CSV 데이터 로딩 중이거나 해당 법인 데이터 없음.'] };

              const validSales = series.filter(s => s.매출액 != null);
              const validOp    = series.filter(s => s.영업이익 != null);
              const validNi    = series.filter(s => s.당기순이익 != null);
              const validBs    = series.filter(s => s.자본총계 != null);

              // 최신 분기 및 전년동분기 키 계산
              const last = series[series.length - 1];
              const lastQ = last.name.split('.')[1]; // '1Q'
              const prevYY = String(parseInt(last.name) - 1).padStart(2, '0'); // '25'
              const yoyName = `${prevYY}.${lastQ}`; // '25.1Q'

              // ── 매출 — 전년동분기 기준 ──
              const lastSales = validSales.find(s => s.name === last.name);
              const yoySales  = validSales.find(s => s.name === yoyName);
              if (lastSales) {
                if (yoySales && yoySales.매출액 != null && yoySales.매출액 > 0) {
                  const yoyChg = Math.round((lastSales.매출액 - yoySales.매출액) / Math.abs(yoySales.매출액) * 100);
                  if (yoyChg > 5)       pos.push(`매출 전년동기대비 +${yoyChg}% 성장 (${yoyName} ${formatNumber(yoySales.매출액)}억 → ${last.name} ${formatNumber(lastSales.매출액)}억)`);
                  else if (yoyChg < -5) neg.push(`매출 전년동기대비 ${yoyChg}% 감소 (${yoyName} ${formatNumber(yoySales.매출액)}억 → ${last.name} ${formatNumber(lastSales.매출액)}억)`);
                  else                  neu.push(`매출 전년동기 유사 수준: ${yoyName} ${formatNumber(yoySales.매출액)}억 → ${last.name} ${formatNumber(lastSales.매출액)}억 (${yoyChg >= 0 ? '+' : ''}${yoyChg}%)`);
                } else if (validSales.length >= 2) {
                  // YoY 데이터 없을 때 전체 추세 대체
                  const first = validSales[0];
                  const chg = first.매출액 > 0 ? Math.round((lastSales.매출액 - first.매출액) / Math.abs(first.매출액) * 100) : null;
                  if (chg != null) {
                    if (chg > 10)       pos.push(`매출 성장: ${first.name} ${formatNumber(first.매출액)}억 → ${last.name} ${formatNumber(lastSales.매출액)}억 (+${chg}%)`);
                    else if (chg < -10) neg.push(`매출 하락: ${first.name} ${formatNumber(first.매출액)}억 → ${last.name} ${formatNumber(lastSales.매출액)}억 (${chg}%)`);
                    else                neu.push(`매출 보합: ${first.name}→${last.name} ${chg >= 0 ? '+' : ''}${chg}%`);
                  }
                }
              }

              // ── 영업손익 — 전년동분기 기준 ──
              if (validOp.length >= 1) {
                const lastOp = validOp.find(s => s.name === last.name);
                const yoyOp  = validOp.find(s => s.name === yoyName);
                const profitCnt = validOp.filter(s => s.영업이익 >= 0).length;

                if (lastOp) {
                  if (lastOp.영업이익 > 0) pos.push(`흑자 유지: 최신(${last.name}) 영업이익 +${formatNumber(lastOp.영업이익)}억`);
                  else                      neg.push(`영업손실: 최신(${last.name}) ${formatNumber(lastOp.영업이익)}억 — 수익성 개선 필요`);

                  if (yoyOp) {
                    const opDiff = lastOp.영업이익 - yoyOp.영업이익;
                    if (opDiff > 0 && lastOp.영업이익 >= 0)
                      pos.push(`영업이익 전년동기대비 +${formatNumber(opDiff)}억 개선 (${yoyName} ${formatNumber(yoyOp.영업이익)}억 → ${last.name} ${formatNumber(lastOp.영업이익)}억)`);
                    else if (opDiff > 0 && lastOp.영업이익 < 0)
                      pos.push(`영업손실 축소: 전년동기대비 +${formatNumber(opDiff)}억 개선 (${yoyName} ${formatNumber(yoyOp.영업이익)}억 → ${last.name} ${formatNumber(lastOp.영업이익)}억)`);
                    else if (opDiff < 0 && lastOp.영업이익 >= 0)
                      neg.push(`영업이익 전년동기대비 ${formatNumber(opDiff)}억 감소 (${yoyName} ${formatNumber(yoyOp.영업이익)}억 → ${last.name} ${formatNumber(lastOp.영업이익)}억)`);
                    else
                      neg.push(`영업손실 확대: 전년동기대비 ${formatNumber(Math.abs(opDiff))}억 추가 악화 (${yoyName} ${formatNumber(yoyOp.영업이익)}억 → ${last.name} ${formatNumber(lastOp.영업이익)}억)`);
                  }
                }

                if (profitCnt === validOp.length)               pos.push(`전 구간(${validOp.length}분기) 영업흑자 지속 — 안정적 수익 기반`);
                else if (profitCnt === 0 && validOp.length >= 3) neg.push(`전 구간(${validOp.length}분기) 연속 적자 — 구조적 손실 위험`);
              }

              // ── 당기순손익 — 전년동분기 기준 ──
              if (validNi.length >= 1) {
                const lastNi = validNi.find(s => s.name === last.name);
                const yoyNi  = validNi.find(s => s.name === yoyName);
                if (lastNi) {
                  if (lastNi.당기순이익 < 0) {
                    neg.push(`당기순손실: ${formatNumber(lastNi.당기순이익)}억 — 비영업 비용 포함 종합 손실`);
                  } else if (yoyNi) {
                    const niDiff = lastNi.당기순이익 - yoyNi.당기순이익;
                    if (niDiff > 0) pos.push(`당기순이익 전년동기대비 +${formatNumber(niDiff)}억 증가 (${yoyName} ${formatNumber(yoyNi.당기순이익)}억 → ${last.name} ${formatNumber(lastNi.당기순이익)}억)`);
                    else if (niDiff < 0) neg.push(`당기순이익 전년동기대비 ${formatNumber(niDiff)}억 감소 (${yoyName} ${formatNumber(yoyNi.당기순이익)}억 → ${last.name} ${formatNumber(lastNi.당기순이익)}억)`);
                  }
                }
              }

              // ── 재무 건전성 ──
              if (validBs.length >= 1) {
                const lastBs = validBs[validBs.length - 1];
                if (lastBs.자본총계 <= 0) {
                  neg.push(`완전 자본잠식: 자본총계 ${formatNumber(lastBs.자본총계)}억 — 즉각적 재무 구조 개선 필요`);
                } else {
                  if (validBs.length >= 2) {
                    const firstBs = validBs[0];
                    const eqChg = firstBs.자본총계 > 0 ? Math.round((lastBs.자본총계 - firstBs.자본총계) / Math.abs(firstBs.자본총계) * 100) : null;
                    if (eqChg != null) {
                      if (eqChg > 5)        pos.push(`자본 증가 +${eqChg}%: ${firstBs.name} ${formatNumber(firstBs.자본총계)}억 → ${lastBs.name} ${formatNumber(lastBs.자본총계)}억 (이익 누적)`);
                      else if (eqChg < -15) neg.push(`자본 감소 ${eqChg}%: ${firstBs.name}→${lastBs.name} — 자본잠식 진행 가능성`);
                    }
                  }
                  if (lastBs.부채총계 != null && lastBs.자본총계 > 0) {
                    const dr = Math.round(lastBs.부채총계 / lastBs.자본총계 * 100);
                    if (dr > 300)      neg.push(`부채비율 과다: ${dr}% — 재무 레버리지 위험 수준`);
                    else if (dr < 100) pos.push(`재무 건전: 부채비율 ${dr}% — 안정적 재무 구조`);
                    else               neu.push(`부채비율 ${dr}% — 보통 수준, 지속 모니터링`);
                  }
                }
              }

              return {
                pos,
                neg,
                neu,
                verdict: neg.length > pos.length ? 'negative' : pos.length > neg.length ? 'positive' : 'mixed',
              };
            };

            return (
              <div className="space-y-6">

                {/* ① 자회사별 손익·재무 추이 */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-100 bg-violet-50/60">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-violet-800">자회사 현황 — ① 손익 · 재무상태 추이 (24.1Q~26.1Q)</h4>
                  </div>
                  <div className="p-4 space-y-6">
                    {subData.map(({ entity, series, latest }) => {
                      const color = subColors[entity] || '#6366f1';
                      const analysis = genAnalysis(entity, series);

                      return (
                        <div key={entity} className="border-2 border-zinc-800 rounded-xl overflow-hidden bg-white shadow-sm">
                          {/* 법인 헤더 */}
                          <div className="flex items-center px-4 py-2.5 border-b border-zinc-100" style={{ background: `${color}12` }}>
                            <span className="text-[13px] font-bold" style={{ color }}>{entity}</span>
                          </div>
                          {/* ══ 메인: 좌(차트 2개 세로) + 우(분석 3구분) — 반반(50/50) ══ */}
                          <div className="grid grid-cols-2 divide-x divide-zinc-100">

                            {/* 좌: 손익 추이 (상) + 자본구조 추이 (하) */}
                            <div className="divide-y divide-zinc-100">

                              {/* 손익 추이 — 전 법인 동일 색상 */}
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[11px] font-semibold text-zinc-700">손익 추이 (억원)</p>
                                  <div className="flex items-center gap-2.5 text-[10px] text-zinc-500">
                                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-indigo-400 opacity-50"></span>매출</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-teal-500"></span>영업이익</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-5 border-t border-dashed border-slate-400"></span>순이익</span>
                                  </div>
                                </div>
                                {(() => {
                                  // 법인 규모별 Y축 포맷 (억 단위)
                                  const allVals = series.flatMap(s => [s.매출액, s.영업이익, s.당기순이익]).filter(v => v != null);
                                  const maxAbs = Math.max(...allVals.map(Math.abs), 1);
                                  const yFmt = v => maxAbs >= 1000 ? `${(v/1000).toFixed(1)}천` : `${formatNumber(v)}`;
                                  return (
                                <div className="h-40 w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={series} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="2 3" stroke="#f0f0f0" vertical={false} />
                                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={1} />
                                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={40} />
                                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                          <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-[10px] min-w-[130px]">
                                            <div className="font-semibold text-zinc-700 mb-1.5 border-b border-zinc-100 pb-1">{label}</div>
                                            {payload.map((p, pi) => {
                                              const v = p.value;
                                              return (
                                                <div key={pi} className="flex justify-between gap-3 mb-0.5">
                                                  <span className="text-zinc-500">{p.name}</span>
                                                  <span className={`font-semibold tabular-nums ${v != null && v < 0 ? 'text-rose-600' : 'text-zinc-800'}`}>{v != null ? `${formatNumber(v)}억` : '—'}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      }} />
                                      {/* 고정 색상: 매출=인디고, 영업이익=틸, 순이익=슬레이트 */}
                                      <Bar dataKey="매출액" name="매출" fill="#6366f1" fillOpacity={0.25} maxBarSize={22} radius={[2,2,0,0]} />
                                      <Line type="monotone" dataKey="영업이익" name="영업이익" stroke="#0d9488" strokeWidth={2.5} connectNulls
                                        dot={(props) => {
                                          const { cx, cy, value } = props;
                                          if (value == null || cx == null || cy == null) return <g key={`dot-op-${cx}-${cy}`} />;
                                          return <circle key={`dot-op-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={value >= 0 ? '#0d9488' : '#f43f5e'} stroke="white" strokeWidth={1.5} />;
                                        }}
                                        activeDot={{ r: 5, strokeWidth: 2 }}
                                      />
                                      <Line type="monotone" dataKey="당기순이익" name="순이익" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2.5, fill: '#64748b', stroke: 'white', strokeWidth: 1 }} connectNulls />
                                      <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.4} />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                                  );
                                })()}
                              </div>

                              {/* 자본구조 추이 — 전 법인 동일 색상 */}
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[11px] font-semibold text-zinc-700">자본구조 추이 (억원)</p>
                                  <div className="flex items-center gap-2.5 text-[10px] text-zinc-500">
                                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-500 opacity-60"></span>자본</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-rose-400 opacity-60"></span>부채</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-violet-500"></span>자산</span>
                                  </div>
                                </div>
                                {(() => {
                                  const bsVals = series.flatMap(s => [s.자산총계, s.자본총계, s.부채총계]).filter(v => v != null);
                                  const bsMax = Math.max(...bsVals.map(Math.abs), 1);
                                  const bsFmt = v => bsMax >= 1000 ? `${(v/1000).toFixed(1)}천` : `${formatNumber(v)}`;
                                  return (
                                <div className="h-40 w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={series} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="2 3" stroke="#f0f0f0" vertical={false} />
                                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={1} />
                                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={bsFmt} width={40} />
                                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        const assetItem = payload.find(p => p.dataKey === '자산총계');
                                        const debtItem  = payload.find(p => p.dataKey === '부채총계');
                                        const eqItem    = payload.find(p => p.dataKey === '자본총계');
                                        const debtRatio = (eqItem?.value > 0 && debtItem?.value != null) ? Math.round(debtItem.value / eqItem.value * 100) : null;
                                        return (
                                          <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-[10px] min-w-[140px]">
                                            <div className="font-semibold text-zinc-700 mb-1.5 border-b border-zinc-100 pb-1">{label}</div>
                                            {[
                                              { label: '자산총계', val: assetItem?.value, color: '#6366f1' },
                                              { label: '부채총계', val: debtItem?.value,  color: '#f43f5e' },
                                              { label: '자본총계', val: eqItem?.value,    color: '#0d9488' },
                                            ].map((r, ri) => (
                                              <div key={ri} className="flex justify-between gap-3 mb-0.5">
                                                <span style={{ color: r.color }} className="font-medium">{r.label}</span>
                                                <span className="font-semibold tabular-nums text-zinc-800">{r.val != null ? `${formatNumber(r.val)}억` : '—'}</span>
                                              </div>
                                            ))}
                                            {debtRatio != null && (
                                              <div className="mt-1 pt-1 border-t border-zinc-100 text-zinc-500 flex justify-between">
                                                <span>부채비율</span>
                                                <span className={`font-semibold ${debtRatio > 200 ? 'text-rose-600' : 'text-zinc-700'}`}>{debtRatio}%</span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }} />
                                      {/* 고정 색상: 자본=에메랄드, 부채=로즈, 자산=바이올렛 (stackId 제거 → 음수 자본 시 색상 혼합 방지) */}
                                      <Bar dataKey="자본총계" name="자본" fill="#10b981" fillOpacity={0.55} maxBarSize={14} radius={[2,2,0,0]} />
                                      <Bar dataKey="부채총계" name="부채" fill="#f43f5e" fillOpacity={0.5} maxBarSize={14} radius={[2,2,0,0]} />
                                      <Line type="monotone" dataKey="자산총계" name="자산" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, fill: '#7c3aed', stroke: 'white', strokeWidth: 1.5 }} connectNulls />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                                  );
                                })()}
                              </div>

                            </div>{/* /left charts */}

                            {/* 우: 분석 — 긍정적 / 부정적 / 종합분석 */}
                            <div className="p-4 flex flex-col gap-3">

                              {/* 긍정적 */}
                              {analysis.pos.length > 0 && (
                                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 flex-1">
                                  <p className="text-[11px] font-bold text-emerald-700 mb-2 flex items-center gap-1.5">
                                    <span>▲</span><span>긍정적</span>
                                  </p>
                                  <ul className="space-y-2">
                                    {analysis.pos.map((t, i) => (
                                      <li key={i} className="flex gap-1.5 text-[11px] text-emerald-800 leading-relaxed">
                                        <span className="shrink-0 font-bold text-emerald-500 mt-0.5">✓</span>
                                        <span>{t}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* 부정적 */}
                              {analysis.neg.length > 0 && (
                                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-3 flex-1">
                                  <p className="text-[11px] font-bold text-rose-700 mb-2 flex items-center gap-1.5">
                                    <span>▼</span><span>부정적</span>
                                  </p>
                                  <ul className="space-y-2">
                                    {analysis.neg.map((t, i) => (
                                      <li key={i} className="flex gap-1.5 text-[11px] text-rose-800 leading-relaxed">
                                        <span className="shrink-0 font-bold text-rose-400 mt-0.5">!</span>
                                        <span>{t}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* 종합분석 */}
                              {analysis.neu.length > 0 && (
                                <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-3 flex-1">
                                  <p className="text-[11px] font-bold text-zinc-600 mb-2 flex items-center gap-1.5">
                                    <span>◆</span><span>종합분석</span>
                                  </p>
                                  <ul className="space-y-2">
                                    {analysis.neu.map((t, i) => (
                                      <li key={i} className="flex gap-1.5 text-[11px] text-zinc-600 leading-relaxed">
                                        <span className="shrink-0 text-zinc-400 mt-0.5">·</span>
                                        <span>{t}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* 긍정/부정 모두 없을 때 */}
                              {analysis.pos.length === 0 && analysis.neg.length === 0 && analysis.neu.length === 0 && (
                                <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-4 text-[11px] text-zinc-400 text-center">
                                  데이터 로딩 중
                                </div>
                              )}

                            </div>{/* /right analysis */}

                          </div>{/* /main grid */}
                        </div>
                      );
                    })}

                  </div>
                </div>

                {/* ② 손상평가 모니터링 — 임시 숨김 (false && 로 복원) */}
                {false && <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-100 bg-rose-50/60">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-800">자회사 현황 — ② 손상평가 모니터링 (엔터테인먼트 · ST미국)</h4>
                  </div>
                  <div className="p-4 space-y-5">
                    <p className="text-[10px] text-zinc-500 leading-relaxed">손상징후 발견 법인에 대한 25년 사업계획 대비 실적 달성 추이 모니터링. 사업계획 수치 입력 후 실적과 비교.</p>
                    {['엔터테인먼트', 'ST미국'].map(entity => {
                      const color = subColors[entity];
                      const imp = impairmentData[entity] || {};
                      const entitySeries = subData.find(d => d.entity === entity)?.series || [];

                      // 26.1Q 실적 (매출, 영업이익)
                      const actual26_1Q = entitySeries.find(s => s.name === '26.1Q');
                      const actual25_4Q = entitySeries.find(s => s.name === '25.4Q');
                      const actual25_3Q = entitySeries.find(s => s.name === '25.3Q');

                      // 계획 vs 실적 차트 데이터 (25.3Q~26.1Q, 분기 누적 개념)
                      const planVsActualData = [
                        { name: '25.3Q', 실적매출: actual25_3Q?.매출액, 실적영업이익: actual25_3Q?.영업이익 },
                        { name: '25.4Q', 실적매출: actual25_4Q?.매출액, 실적영업이익: actual25_4Q?.영업이익 },
                        { name: '26.1Q', 실적매출: actual26_1Q?.매출액, 실적영업이익: actual26_1Q?.영업이익,
                          계획매출: imp.plan2025Sales || null, 계획영업이익: imp.plan2025OpInc || null },
                      ];

                      return (
                        <div key={entity} className="border-2 border-zinc-800 rounded-xl overflow-hidden bg-white shadow-sm">
                          {/* 법인 헤더 */}
                          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100" style={{ background: `${color}12` }}>
                            <span className="text-[12px] font-bold" style={{ color }}>{entity} — 손상평가 모니터링</span>
                            <span className="text-[10px] text-zinc-400">26.1Q 기준</span>
                          </div>

                          {/* ══ 메인: 좌(입력+차트+달성률) + 우(긍정/모니터링) ══ */}
                          <div className="grid grid-cols-5 divide-x divide-zinc-100">

                            {/* 좌: 계획 입력 + 차트 + 달성률 */}
                            <div className="col-span-3 p-4 space-y-3">

                              {/* 사업계획 입력 */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1">26.1Q 분기 계획 매출 (억원)</label>
                                  <input
                                    type="number"
                                    value={imp.plan2025Sales || ''}
                                    onChange={e => setImpairmentData(prev => ({
                                      ...prev,
                                      [entity]: { ...prev[entity], plan2025Sales: Number(e.target.value) || 0 }
                                    }))}
                                    className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                                    placeholder="예: 150"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1">26.1Q 분기 계획 영업이익 (억원)</label>
                                  <input
                                    type="number"
                                    value={imp.plan2025OpInc || ''}
                                    onChange={e => setImpairmentData(prev => ({
                                      ...prev,
                                      [entity]: { ...prev[entity], plan2025OpInc: Number(e.target.value) || 0 }
                                    }))}
                                    className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                                    placeholder="예: 10"
                                  />
                                </div>
                              </div>

                              {/* 계획 vs 실적 차트 */}
                              <div>
                                <p className="text-[10px] font-semibold text-zinc-500 mb-1.5">매출 · 영업손익 추이 및 계획 비교 (억원)</p>
                                <div className="h-40 w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={planVsActualData} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => formatNumber(v)} width={36} />
                                      <Tooltip content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                          <div className="bg-white border border-zinc-200 rounded-lg shadow px-2.5 py-2 text-[10px]">
                                            <div className="font-semibold text-zinc-700 mb-1 pb-1 border-b border-zinc-100">{label}</div>
                                            {payload.map((p, pi) => (
                                              <div key={pi} className="flex justify-between gap-3" style={{ color: p.color || p.stroke }}>
                                                <span>{p.name}</span>
                                                <span className="font-semibold">{p.value != null ? `${formatNumber(p.value)}억` : '—'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      }} />
                                      <Legend wrapperStyle={{ fontSize: 9 }} />
                                      <Bar dataKey="실적매출" name="실적 매출" fill={color} opacity={0.35} maxBarSize={22} radius={[2,2,0,0]} />
                                      <Bar dataKey="계획매출" name="계획 매출" fill="#94a3b8" opacity={0.4} maxBarSize={22} radius={[2,2,0,0]} />
                                      <Line type="monotone" dataKey="실적영업이익" name="실적 영업이익" stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                      <Line type="monotone" dataKey="계획영업이익" name="계획 영업이익" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2 }} connectNulls />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              {/* 계획 달성률 */}
                              {(imp.plan2025Sales > 0 || imp.plan2025OpInc > 0) && actual26_1Q && (
                                <div className="grid grid-cols-2 gap-2">
                                  {imp.plan2025Sales > 0 && actual26_1Q.매출액 != null && (
                                    <div className={`rounded-lg px-3 py-2 text-center border ${actual26_1Q.매출액 >= imp.plan2025Sales ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                                      <div className="text-[10px] text-zinc-500 mb-0.5">매출 달성률</div>
                                      <div className={`text-base font-bold tabular-nums ${actual26_1Q.매출액 >= imp.plan2025Sales ? 'text-emerald-700' : 'text-rose-600'}`}>
                                        {Math.round(actual26_1Q.매출액 / imp.plan2025Sales * 100)}%
                                      </div>
                                      <div className="text-[10px] text-zinc-400">{formatNumber(actual26_1Q.매출액)} / {formatNumber(imp.plan2025Sales)}억</div>
                                    </div>
                                  )}
                                  {imp.plan2025OpInc !== 0 && actual26_1Q.영업이익 != null && (
                                    <div className={`rounded-lg px-3 py-2 text-center border ${actual26_1Q.영업이익 >= imp.plan2025OpInc ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                                      <div className="text-[10px] text-zinc-500 mb-0.5">영업이익 달성률</div>
                                      <div className={`text-base font-bold tabular-nums ${actual26_1Q.영업이익 >= imp.plan2025OpInc ? 'text-emerald-700' : 'text-rose-600'}`}>
                                        {Math.round(actual26_1Q.영업이익 / imp.plan2025OpInc * 100)}%
                                      </div>
                                      <div className="text-[10px] text-zinc-400">{formatNumber(actual26_1Q.영업이익)} / {formatNumber(imp.plan2025OpInc)}억</div>
                                    </div>
                                  )}
                                </div>
                              )}

                            </div>{/* /left */}

                            {/* 우: 긍정적 사항 + 모니터링 사항 */}
                            <div className="col-span-2 p-4 flex flex-col gap-3">

                              {/* 긍정적 사항 */}
                              <div className="flex-1 flex flex-col">
                                <label className="text-[11px] font-bold text-emerald-700 block mb-1.5 flex items-center gap-1">
                                  <span>✅</span><span>긍정적 사항</span>
                                </label>
                                <textarea
                                  value={imp.positives || ''}
                                  onChange={e => setImpairmentData(prev => ({
                                    ...prev,
                                    [entity]: { ...prev[entity], positives: e.target.value }
                                  }))}
                                  className="flex-1 w-full border border-emerald-100 bg-emerald-50/40 rounded-lg px-3 py-2 text-[11px] text-zinc-700 leading-relaxed resize-none focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                                  placeholder={"· 신규 브랜드 런칭 효과 가시화\n· 온라인 채널 성장률 +15%\n· 주요 거래처 계약 연장"}
                                  rows={5}
                                />
                              </div>

                              {/* 모니터링 사항 */}
                              <div className="flex-1 flex flex-col">
                                <label className="text-[11px] font-bold text-rose-700 block mb-1.5 flex items-center gap-1">
                                  <span>⚠️</span><span>모니터링 사항</span>
                                </label>
                                <textarea
                                  value={imp.monitoring || ''}
                                  onChange={e => setImpairmentData(prev => ({
                                    ...prev,
                                    [entity]: { ...prev[entity], monitoring: e.target.value }
                                  }))}
                                  className="flex-1 w-full border border-rose-100 bg-rose-50/40 rounded-lg px-3 py-2 text-[11px] text-zinc-700 leading-relaxed resize-none focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                  placeholder={"· 영업이익 계획 대비 미달 지속\n· 현지 경기 침체 영향 모니터링\n· 환율 변동 리스크"}
                                  rows={5}
                                />
                              </div>

                            </div>{/* /right */}

                          </div>{/* /main grid */}
                        </div>
                      );
                    })}
                  </div>
                </div>}
              </div>
            );
          })()}
        </div>

        {/* AI 분석 섹션 — 임시 숨김 (false && 로 복원 가능) */}
        {false && <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-zinc-800 tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-5 bg-gradient-to-b from-blue-500 to-violet-500 rounded"></span>
              AI 분석
            </h3>
            {/* 편집 컨트롤 버튼 */}
            <div className="flex items-center gap-2">
              {aiEditMode && aiSaveStatus === 'saving' && (
                <span className="text-[10px] text-zinc-400 animate-pulse">저장 중...</span>
              )}
              {aiEditMode && aiSaveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-500">✓</span>
              )}
              {aiEditMode && aiSaveStatus === 'error' && (
                <span className="text-[10px] text-rose-500">!</span>
              )}
              {aiEditMode ? (
                <>
                  <button
                    onClick={resetAiAnalysisToAuto}
                    className="p-1 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                    title="자동 분석으로 복원"
                  >
                    🔄
                  </button>
                  <button
                    onClick={resetAiAnalysisToBackup}
                    className="p-1 text-zinc-500 hover:text-zinc-600 hover:bg-zinc-100 rounded transition-colors"
                    title="되돌리기"
                  >
                    ↺
                  </button>
                  <button
                    onClick={() => setAiEditMode(false)}
                    className="p-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                    title="편집 완료"
                  >
                    ✓
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setAiEditMode(true)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded transition-colors"
                  title="편집"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
              )}
            </div>
          </div>
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-lg p-5 text-white shadow-lg">
            {(() => {
              try {
                const autoAnalysis = generateAIAnalysis();
                if (!autoAnalysis || !autoAnalysis.keyMetrics) {
                  return <div className="text-xs text-zinc-400">데이터를 불러오는 중...</div>;
                }
                const { keyMetrics } = autoAnalysis;
                
                // 편집 모드일 때는 aiAnalysisData 직접 사용, 아닐 때는 저장된 데이터 또는 자동 분석 데이터 사용
                const insights = aiEditMode 
                  ? (aiAnalysisData.insights || [])
                  : (aiAnalysisData.insights && aiAnalysisData.insights.length > 0) 
                    ? aiAnalysisData.insights 
                    : autoAnalysis.insights || [];
                const risks = aiEditMode 
                  ? (aiAnalysisData.risks || [])
                  : (aiAnalysisData.risks && aiAnalysisData.risks.length > 0) 
                    ? aiAnalysisData.risks 
                    : autoAnalysis.risks || [];
                const actions = aiEditMode 
                  ? (aiAnalysisData.actions || [])
                  : (aiAnalysisData.actions && aiAnalysisData.actions.length > 0) 
                    ? aiAnalysisData.actions 
                    : autoAnalysis.actions || [];
                const improvementTargets = aiEditMode 
                  ? (aiAnalysisData.improvementTargets || [])
                  : (aiAnalysisData.improvementTargets && aiAnalysisData.improvementTargets.length > 0) 
                    ? aiAnalysisData.improvementTargets 
                    : autoAnalysis.improvementTargets || [];
              
              return (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md">
                      <span className="text-white text-xs font-bold">AI</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">F&F {selectedPeriod ? selectedPeriod.split('_')[0] : '2026'}년 재무 종합 분석</div>
                      <div className="text-xs text-zinc-400">수익성 · 안정성 · 리스크 · 액션플랜</div>
                    </div>
                    {aiEditMode && (
                      <span className="ml-auto px-2 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-400/20 rounded">편집 모드</span>
                    )}
                    {serverSaveStatus && (
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                        serverSaveStatus === 'saving' ? 'text-blue-400 bg-blue-400/20' :
                        serverSaveStatus === 'saved' ? 'text-emerald-400 bg-emerald-400/20' :
                        'text-rose-400 bg-rose-400/20'
                      }`}>
                        {serverSaveStatus === 'saving' ? '서버 저장 중...' :
                         serverSaveStatus === 'saved' ? '서버 저장 완료' : '저장 실패'}
                      </span>
                    )}
                  </div>
                  
                  {/* 핵심 지표 요약 (자동 계산 - 편집 불가) */}
                  <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-center">
                      <div className="text-[10px] text-zinc-400 mb-0.5">영업이익률</div>
                      <div className={`text-sm font-bold ${keyMetrics.opMargin.change >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {keyMetrics.opMargin.curr.toFixed(1)}%
                      </div>
                      <div className={`text-[10px] ${keyMetrics.opMargin.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {keyMetrics.opMargin.change >= 0 ? '+' : ''}{keyMetrics.opMargin.change.toFixed(1)}%p
                      </div>
                    </div>
                    <div className="text-center border-l border-white/10">
                      <div className="text-[10px] text-zinc-400 mb-0.5">순이익률</div>
                      <div className={`text-sm font-bold ${keyMetrics.netMargin.change >= 0 ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {keyMetrics.netMargin.curr.toFixed(1)}%
                      </div>
                      <div className={`text-[10px] ${keyMetrics.netMargin.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {keyMetrics.netMargin.change >= 0 ? '+' : ''}{keyMetrics.netMargin.change.toFixed(1)}%p
                      </div>
                    </div>
                    <div className="text-center border-l border-white/10">
                      <div className="text-[10px] text-zinc-400 mb-0.5">부채비율</div>
                      <div className={`text-sm font-bold ${keyMetrics.debtRatio.curr < 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {keyMetrics.debtRatio.curr.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-emerald-400">{keyMetrics.debtRatio.status}</div>
                    </div>
                    <div className="text-center border-l border-white/10">
                      <div className="text-[10px] text-zinc-400 mb-0.5">ROE</div>
                      <div className={`text-sm font-bold ${keyMetrics.roe.change >= 0 ? 'text-emerald-400' : 'text-violet-400'}`}>
                        {keyMetrics.roe.curr.toFixed(1)}%
                      </div>
                      <div className={`text-[10px] ${keyMetrics.roe.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {keyMetrics.roe.change >= 0 ? '+' : ''}{keyMetrics.roe.change.toFixed(1)}%p
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* 주요 인사이트 */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span className="text-xs font-semibold text-emerald-400">주요 인사이트</span>
                        </div>
                        {aiEditMode && (
                          <button
                            onClick={addAiInsight}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            + 추가
                          </button>
                        )}
                      </div>
                      {insights.length > 0 ? (
                        <ul className="text-xs text-zinc-300 space-y-1.5">
                          {insights.map((insight, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              {aiEditMode ? (
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={insight.title}
                                      onChange={(e) => updateAiInsight(idx, 'title', e.target.value)}
                                      className="flex-1 px-1.5 py-0.5 text-xs font-semibold bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-emerald-400"
                                      placeholder="제목"
                                    />
                                    <button
                                      onClick={() => removeAiInsight(idx)}
                                      className="text-rose-400 hover:text-rose-300 text-xs px-1"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <textarea
                                    value={insight.desc}
                                    onChange={(e) => updateAiInsight(idx, 'desc', e.target.value)}
                                    className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-zinc-300 focus:outline-none focus:border-emerald-400 resize-none"
                                    rows={2}
                                    placeholder="설명"
                                  />
                                </div>
                              ) : (
                                <>
                                  <span className="text-emerald-400 mt-0.5">•</span>
                                  <span><strong className="text-white">{insight.title}:</strong> {insight.desc}</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-400 italic">긍정적 인사이트를 발견하지 못했습니다.</p>
                      )}
                    </div>

                    {/* 리스크 분석 */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                          <span className="text-xs font-semibold text-rose-400">리스크 분석</span>
                        </div>
                        {aiEditMode && (
                          <button
                            onClick={addAiRisk}
                            className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
                          >
                            + 추가
                          </button>
                        )}
                      </div>
                      {risks.length > 0 ? (
                        <ul className="text-xs text-zinc-300 space-y-1.5">
                          {risks.map((risk, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              {aiEditMode ? (
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={risk.title}
                                      onChange={(e) => updateAiRisk(idx, 'title', e.target.value)}
                                      className="flex-1 px-1.5 py-0.5 text-xs font-semibold bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-rose-400"
                                      placeholder="제목"
                                    />
                                    <button
                                      onClick={() => removeAiRisk(idx)}
                                      className="text-rose-400 hover:text-rose-300 text-xs px-1"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <textarea
                                    value={risk.desc}
                                    onChange={(e) => updateAiRisk(idx, 'desc', e.target.value)}
                                    className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-zinc-300 focus:outline-none focus:border-rose-400 resize-none"
                                    rows={2}
                                    placeholder="설명"
                                  />
                                </div>
                              ) : (
                                <>
                                  <span className="text-rose-400 mt-0.5">⚠</span>
                                  <span><strong className="text-white">{risk.title}:</strong> {risk.desc}</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-400 italic">주요 리스크가 발견되지 않았습니다.</p>
                      )}
                    </div>
                  </div>

                  {/* 액션 플랜 */}
                  <div className="p-3 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-lg border border-blue-400/30 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                        <span className="text-sm font-semibold text-violet-400">전략적 액션 플랜</span>
                      </div>
                      {aiEditMode && (
                        <button
                          onClick={addAiAction}
                          className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          + 추가
                        </button>
                      )}
                    </div>
                    {actions.length > 0 ? (
                      <div className="grid grid-cols-3 gap-3">
                        {actions.map((action, idx) => (
                          <div key={idx} className="p-2 bg-white/5 rounded">
                            {aiEditMode ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-blue-400 text-base">
                                    {idx === 0 ? '🎯' : idx === 1 ? '⚡' : '💡'}
                                  </span>
                                  <input
                                    type="text"
                                    value={action.title}
                                    onChange={(e) => updateAiAction(idx, 'title', e.target.value)}
                                    className="flex-1 px-1.5 py-0.5 text-xs font-semibold bg-white/10 border border-white/20 rounded text-blue-400 focus:outline-none focus:border-blue-400"
                                    placeholder="제목"
                                  />
                                  <button
                                    onClick={() => removeAiAction(idx)}
                                    className="text-rose-400 hover:text-rose-300 text-xs px-1"
                                  >
                                    ×
                                  </button>
                                </div>
                                <textarea
                                  value={action.desc}
                                  onChange={(e) => updateAiAction(idx, 'desc', e.target.value)}
                                  className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-zinc-300 focus:outline-none focus:border-blue-400 resize-none"
                                  rows={3}
                                  placeholder="설명"
                                />
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-blue-400 text-base">
                                    {idx === 0 ? '🎯' : idx === 1 ? '⚡' : '💡'}
                                  </span>
                                  <span className="text-sm font-semibold text-blue-400">{action.title}</span>
                                </div>
                                <p className="text-xs text-zinc-300 leading-relaxed">
                                  {action.desc}
                                </p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400 italic">전략적 액션이 필요하지 않습니다.</p>
                    )}
                  </div>

                  {/* 연결관점 개선 타겟 */}
                  <div className="p-4 bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-lg border border-violet-400/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                        <span className="text-sm font-semibold text-violet-400">연결관점 수익성·안정성 개선 타겟</span>
                        <span className="text-xs text-zinc-400 ml-2">우선순위 순</span>
                      </div>
                      {aiEditMode && (
                        <button
                          onClick={addAiImprovementTarget}
                          className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          + 추가
                        </button>
                      )}
                    </div>
                    {improvementTargets && improvementTargets.length > 0 ? (
                      <div className="space-y-2.5">
                        {improvementTargets.map((target, idx) => (
                          <div key={idx} className="p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all">
                            <div className="flex items-start gap-2 mb-2">
                              <div className="flex-shrink-0 w-6 h-6 rounded bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                {idx + 1}
                              </div>
                              <div className="flex-1">
                                {aiEditMode ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={target.area}
                                        onChange={(e) => updateAiImprovementTarget(idx, 'area', e.target.value)}
                                        className="flex-1 px-2 py-1 text-sm font-semibold bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-violet-400"
                                        placeholder="개선 영역"
                                      />
                                      <button
                                        onClick={() => removeAiImprovementTarget(idx)}
                                        className="text-rose-400 hover:text-rose-300 text-sm px-2"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] text-zinc-400">현재</label>
                                        <input
                                          type="text"
                                          value={target.current}
                                          onChange={(e) => updateAiImprovementTarget(idx, 'current', e.target.value)}
                                          className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-zinc-200 focus:outline-none focus:border-violet-400"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-zinc-400">목표</label>
                                        <input
                                          type="text"
                                          value={target.target}
                                          onChange={(e) => updateAiImprovementTarget(idx, 'target', e.target.value)}
                                          className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-emerald-400 focus:outline-none focus:border-violet-400"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-emerald-400">예상 효과</label>
                                      <textarea
                                        value={target.impact}
                                        onChange={(e) => updateAiImprovementTarget(idx, 'impact', e.target.value)}
                                        className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-zinc-200 focus:outline-none focus:border-emerald-400 resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-blue-400">실행 방안</label>
                                      <textarea
                                        value={target.method}
                                        onChange={(e) => updateAiImprovementTarget(idx, 'method', e.target.value)}
                                        className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-zinc-300 focus:outline-none focus:border-blue-400 resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-amber-400">목표 근거 (선택)</label>
                                      <textarea
                                        value={target.rationale || ''}
                                        onChange={(e) => updateAiImprovementTarget(idx, 'rationale', e.target.value)}
                                        className="w-full px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-amber-400 focus:outline-none focus:border-amber-400 resize-none"
                                        rows={2}
                                        placeholder="목표 근거를 입력하세요"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-sm font-semibold text-white mb-1">{target.area}</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                      <div className="p-1.5 bg-white/5 rounded">
                                        <span className="text-zinc-400">현재: </span>
                                        <span className="text-zinc-200">{target.current}</span>
                                      </div>
                                      <div className="p-1.5 bg-white/5 rounded">
                                        <span className="text-zinc-400">목표: </span>
                                        <span className="text-emerald-400 font-semibold">{target.target}</span>
                                      </div>
                                    </div>
                                    <div className="p-2 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded border border-emerald-400/20 mb-1.5">
                                      <div className="text-xs text-emerald-400 font-semibold mb-0.5">📊 예상 효과</div>
                                      <div className="text-xs text-zinc-200">{target.impact}</div>
                                    </div>
                                    <div className="p-2 bg-white/5 rounded">
                                      <div className="text-xs text-blue-400 font-semibold mb-0.5">🔧 실행 방안</div>
                                      <div className="text-xs text-zinc-300 leading-relaxed">{target.method}</div>
                                    </div>
                                    {target.rationale && (
                                      <div className="p-2 bg-amber-500/10 rounded border border-amber-400/20 mt-1.5">
                                        <div className="text-xs text-amber-400 leading-relaxed">{target.rationale}</div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic">개선 타겟이 없습니다. {aiEditMode && '위의 + 추가 버튼을 눌러 추가하세요.'}</p>
                    )}
                    
                    {/* 종합 개선 효과 (편집 모드가 아닐 때만 표시) */}
                    {!aiEditMode && improvementTargets && improvementTargets.length > 1 && (() => {
                      // 전체 개선 효과 계산
                      const totalOpIncomeIncrease = improvementTargets.reduce((sum, t) => {
                        const match = t.impact.match(/영업이익 \+(\d+)억원/);
                        return sum + (match ? parseInt(match[1]) : 0);
                      }, 0);
                      const totalRoeIncrease = improvementTargets.reduce((sum, t) => {
                        const match = t.impact.match(/ROE \+(\d+\.?\d*)%p/);
                        return sum + (match ? parseFloat(match[1]) : 0);
                      }, 0);
                      const currentOpMargin = keyMetrics.opMargin.curr;
                      const currentRoe = keyMetrics.roe.curr;
                      const targetOpMargin = currentOpMargin + (totalOpIncomeIncrease * 100 / (incomeStatementData[getPeriodKey(selectedPeriod, 'year')]?.매출액 || 1));
                      const targetRoe = currentRoe + totalRoeIncrease;
                      
                      return (
                        <div className="mt-3 p-3 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-lg border border-emerald-400/30">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-emerald-400 text-base">✨</span>
                            <span className="text-sm font-semibold text-emerald-400">전체 실행 시 예상 효과</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="p-2 bg-white/5 rounded">
                              <div className="text-xs text-zinc-400 mb-0.5">영업이익 증가</div>
                              <div className="text-sm font-bold text-emerald-400">+{totalOpIncomeIncrease}억원</div>
                              <div className="text-xs text-zinc-300">
                                {currentOpMargin.toFixed(1)}% → {targetOpMargin.toFixed(1)}% (+{(targetOpMargin - currentOpMargin).toFixed(1)}%p)
                              </div>
                            </div>
                            <div className="p-2 bg-white/5 rounded">
                              <div className="text-xs text-zinc-400 mb-0.5">ROE 개선</div>
                              <div className="text-sm font-bold text-blue-400">+{totalRoeIncrease.toFixed(1)}%p</div>
                              <div className="text-xs text-zinc-300">
                                {currentRoe.toFixed(1)}% → {targetRoe.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-zinc-200 leading-relaxed">
                            {improvementTargets.length}개 타겟 순차 실행으로 {selectedPeriod && selectedPeriod.split('_')[0] === '2025' ? '2026' : (selectedPeriod ? (Number(selectedPeriod.split('_')[0]) + 1) : '내년')}년 
                            업계 최고 수준의 재무구조 달성 가능. 
                            우선순위: ① 재고 효율화 (즉시 효과) → ② 수익성 개선 (6개월) → ③ 차입금 감축 (12개월)
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">AI 분석은 참고용이며 투자 조언이 아닙니다</span>
                    <span className="text-[10px] text-zinc-500">{selectedPeriod ? `${selectedPeriod.split('_')[0]}년 ${selectedPeriod.split('_')[1]} 기준` : '데이터 기준'}</span>
                  </div>
                </>
              );
              } catch (error) {
                console.error('AI 분석 오류:', error);
                return (
                  <div className="p-4 text-center">
                    <div className="text-sm text-rose-400 mb-2">⚠️ 분석 중 오류가 발생했습니다</div>
                    <div className="text-xs text-zinc-400">{error.message || '알 수 없는 오류'}</div>
                  </div>
                );
              }
            })()}
          </div>
        </div>}
      </div>
    );
  };

  // ============================================
  // 손익계산서 탭 렌더링
  // ============================================
  const renderIncomeTab = () => {
    // 비율 계산 함수
    const calcRate = (numerator, denominator) => {
      if (!denominator || denominator === 0) return '-';
      return ((numerator / denominator) * 100).toFixed(1) + '%';
    };

    // 증감률 계산 (percentage point 용)
    const calcRateDiff = (current, prev) => {
      if (current === '-' || prev === '-') return '-';
      const currNum = parseFloat(current);
      const prevNum = parseFloat(prev);
      if (isNaN(currNum) || isNaN(prevNum)) return '-';
      const diff = currNum - prevNum;
      return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%p';
    };

    // 법인별 데이터는 컴포넌트 상위 레벨에서 정의됨 (entityData)
    // 아래 중복 정의는 제거됨 - 상위 레벨의 entityData 사용
    
    // 현재 모드에 따른 기간 설정 (선택된 기간 기준)
    const getCurrentPeriodKey = () => {
      if (incomeViewMode === 'quarter') {
        return getPeriodKey(selectedPeriod, 'quarter');
      } else {
        // 누적: 선택된 분기까지의 누적
        return getPeriodKey(selectedPeriod, 'year');
      }
    };

    const getPrevPeriodKey = () => {
      if (incomeViewMode === 'quarter') {
        // 분기: 전년 동 분기
        return getPeriodKey(selectedPeriod, 'prev_quarter');
      } else {
        // 누적: 전년 동기 누적
        return getPeriodKey(selectedPeriod, 'prev_year');
      }
    };

    const currPeriod = getCurrentPeriodKey();
    const prevPeriod = getPrevPeriodKey();
    const periodLabel = incomeViewMode === 'quarter'
      ? selectedPeriod.split('_')[1].replace('Q', '') + '분기'
      : '연간';
    // 동적 기간 레이블 (도넛/테이블 헤더에 사용)
    const prevPeriodLabel = incomeViewMode === 'quarter'
      ? prevPeriod.replace('_', '.')   // e.g. 2025_1Q → 2025.1Q
      : prevPeriod.split('_')[0] + '년'; // e.g. 2025_Year → 2025년
    const currPeriodLabel = incomeViewMode === 'quarter'
      ? currPeriod.replace('_', '.')   // e.g. 2026_1Q → 2026.1Q
      : currPeriod.split('_')[0] + '년'; // e.g. 2026_Year → 2026년

    // 법인 색상
    const entityColors = {
      'OC(국내)': '#3B82F6',
      '중국': '#F59E0B',
      '홍콩': '#8B5CF6',
      'ST미국': '#10B981',
      '기타': '#6B7280',
      '연결조정': '#9CA3AF',
    };

    // ============================================
    // 법인별 분석 데이터 정합성 보정
    // - 현재 entityData는 "연결조정 전 합산" 기준이며, 일부 기간(4Q/연간)이 동일 값으로 들어가 있음
    // - UI 표(연결) 합계와 맞추기 위해, 선택 과목/기간의 연결 금액을 기준으로
    //   1) 기준 분해(연간 분해값)를 스케일링하고
    //   2) 반올림 오차/연결조정 차이는 '연결조정' 라인으로 보정
    // ============================================
    const getConsolidatedTotal = (accountKey, period) => {
      const v = incomeStatementData?.[period]?.[accountKey];
      return typeof v === 'number' ? v : 0;
    };

    // 계정 별칭 맵 (IS 클릭 시 entityCsvLookup 조회용)
    const isAccountAliasesForPanel = {
      판매비와관리비: ['판매비와관리비', '판관비'],
      수수료: ['수수료', '지급수수료'],
      법인세비용차감전순이익: ['법인세비용차감전순이익', '세전이익'],
      // 영업외 계정 alias
      외환손익: ['외환손익', '외화환산이익', '외환차익'],
      이자손익: ['이자손익', '이자수익'],
      배당수익: ['배당수익', '배당금수익'],
      기타손익: ['기타손익', '잡이익'],
      영업외손익: ['영업외손익', '영업외수익'],
    };

    // 법인별 수동 입력 오버라이드 조회 (편집모드에서 사용자가 직접 입력한 금액)
    const ALL_PANEL_ENTITIES = ['OC(국내)', '중국', '홍콩', 'ST미국', '엔터테인먼트', '베트남', '기타(연결조정)'];
    const getEntityAmountOverrides = (accountKey, period) => {
      const result = {};
      let hasAny = false;
      ALL_PANEL_ENTITIES.forEach(entity => {
        const key = `amtOverride_${accountKey}_${entity}_${period}`;
        const val = incomeEditData?.[key];
        if (val !== undefined && val !== '' && !isNaN(Number(val))) {
          result[entity] = Math.round(Number(val) * 100); // 억원 → 백만원
          hasAny = true;
        }
      });
      return hasAny ? result : null;
    };

    const getBaseEntityBreakdown = (accountKey, period) => {
      // 0. 사용자 수동 입력 오버라이드 최우선
      const overrides = getEntityAmountOverrides(accountKey, period);
      if (overrides) return overrides;

      const fallbackPeriod = period.endsWith('_4Q') ? period.replace('_4Q', '_Year') : period;
      const csvPeriodKey = fallbackPeriod.replace(/_\dQ_Year$/, match => match.replace('_Year', ''));
      const tryKeys = [accountKey, ...(isAccountAliasesForPanel[accountKey] || [])];

      // 2026 이후: normalizeYearDataset가 2025 데이터를 클론하므로 CSV를 우선 사용
      const isCurrentOrFuture = period.startsWith('2026') || period.startsWith('2027');
      if (isCurrentOrFuture) {
        for (const ak of tryKeys) {
          const csvKey = normalizeAccount(ak);
          const csvData = entityCsvLookup?.is?.[csvPeriodKey]?.[csvKey];
          if (csvData && Object.keys(csvData).length > 0) return csvData;
        }
      }

      // 2025 이하: entityData 하드코딩 우선 (정확히 큐레이션된 데이터)
      const direct = entityData?.[accountKey]?.[period];
      if (direct && Object.keys(direct).length > 0) return direct;
      const fromEntityData = entityData?.[accountKey]?.[fallbackPeriod];
      if (fromEntityData && Object.keys(fromEntityData).length > 0) return fromEntityData;

      // 최종: CSV 폴백
      for (const ak of tryKeys) {
        const csvKey = normalizeAccount(ak);
        const csvData = entityCsvLookup?.is?.[csvPeriodKey]?.[csvKey];
        if (csvData && Object.keys(csvData).length > 0) return csvData;
      }
      return {};
    };

    const getAlignedEntityBreakdown = (accountKey, period) => {
      const consolidatedTotal = getConsolidatedTotal(accountKey, period);
      const base = getBaseEntityBreakdown(accountKey, period);

      const baseKeys = Object.keys(base);
      if (baseKeys.length === 0) {
        return { '연결조정': consolidatedTotal };
      }

      // 스케일링 없이 원본 값 그대로 사용, 차이분은 연결조정에 표시
      const baseSum = baseKeys.reduce((sum, k) => sum + (base[k] || 0), 0);
      const adjustment = consolidatedTotal - baseSum;
      return { ...base, '연결조정': adjustment };
    };

    // 표시용 그룹핑: 비중이 작은 법인 + 연결조정을 '기타(연결조정)'로 합산
    const MINOR_ENTITY_RATIO_THRESHOLD = 0.03; // 3% 미만은 기타로 합산
    const MERGED_ENTITY_LABEL = '기타(연결조정)';
    const MAJOR_ENTITIES = ['OC(국내)', '중국', '홍콩', 'ST미국'];

    // 단일 기간용 (도넛 차트 등)
    const getGroupedEntityBreakdown = (accountKey, period) => {
      return getGroupedEntityBreakdownForComparison(accountKey, period, period);
    };

    // 비교용: 전기/당기 둘 다를 고려하여, 한 기간이라도 유의미하면 개별로 유지
    const getGroupedEntityBreakdownForComparison = (accountKey, prevPeriod, currPeriod) => {
      const totalCurr = getConsolidatedTotal(accountKey, currPeriod);
      const totalPrev = getConsolidatedTotal(accountKey, prevPeriod);
      const alignedCurr = getAlignedEntityBreakdown(accountKey, currPeriod);
      const alignedPrev = getAlignedEntityBreakdown(accountKey, prevPeriod);

      // 전기/당기 모두의 키를 합집합으로 수집
      const allKeys = Array.from(new Set([...Object.keys(alignedPrev), ...Object.keys(alignedCurr)]));

      const merged = {};
      const entitiesToKeep = new Set();

      // 1. OC(국내), 중국은 항상 유지
      MAJOR_ENTITIES.forEach(entity => {
        if (allKeys.includes(entity)) {
          entitiesToKeep.add(entity);
        }
      });

      // 2. 전기나 당기 중 하나라도 데이터가 있고, 그 기간의 비중이 3% 이상이면 개별로 유지
      // MERGED_ENTITY_LABEL('기타(연결조정)')은 step4에서 잔차로 계산하므로 여기서 skip
      for (const name of allKeys) {
        if (MAJOR_ENTITIES.includes(name) || name === '연결조정' || name === '기타' || name === MERGED_ENTITY_LABEL) continue;

        const prevVal = alignedPrev[name] || 0;
        const currVal = alignedCurr[name] || 0;
        
        const prevRatio = totalPrev !== 0 ? Math.abs(prevVal) / Math.abs(totalPrev) : 0;
        const currRatio = totalCurr !== 0 ? Math.abs(currVal) / Math.abs(totalCurr) : 0;

        // 전기나 당기 중 하나라도 데이터가 있고, 그 기간의 비중이 3% 이상이면 개별 유지
        const hasDataInEitherPeriod = prevVal !== 0 || currVal !== 0;
        const isSignificantInEitherPeriod = prevRatio >= MINOR_ENTITY_RATIO_THRESHOLD || currRatio >= MINOR_ENTITY_RATIO_THRESHOLD;

        if (hasDataInEitherPeriod && isSignificantInEitherPeriod) {
          entitiesToKeep.add(name);
        }
      }

      // 3. 유지할 법인들을 merged에 추가 (당기 값을 사용)
      entitiesToKeep.forEach(name => {
        merged[name] = alignedCurr[name] || 0;
      });

      // 4. 나머지는 기타(연결조정)로 흡수 (합계 정합성 보장)
      const keptSum = Object.values(merged).reduce((s, v) => s + (v || 0), 0);
      merged[MERGED_ENTITY_LABEL] = totalCurr - keptSum;

      return merged;
    };

    // 도넛 차트용 데이터 변환 (양수 값만 표시)
    const getDonutData = (period) => {
      const data = getGroupedEntityBreakdown(selectedAccount, period);
      return Object.entries(data)
        .filter(([_, value]) => value > 0) // 양수만 필터링 (도넛은 음수 표현이 어려움)
        .map(([name, value]) => ({
          name,
          value: value || 0,
          color:
            name === MERGED_ENTITY_LABEL
              ? '#6B7280'
              : (entityColors[name] || '#9CA3AF'),
        }));
    };

    // 법인별 테이블 데이터 - 현재 모드에 따라 연동
    const getEntityTableData = () => {
      // 비교용 함수 사용: 전기/당기 둘 다를 고려
      const curr = getGroupedEntityBreakdownForComparison(selectedAccount, prevPeriod, currPeriod);
      const prev = getGroupedEntityBreakdownForComparison(selectedAccount, prevPeriod, prevPeriod);
      const totalCurr = getConsolidatedTotal(selectedAccount, currPeriod);
      
      // 표 표시 순서:
      // - OC/중국은 항상 상단
      // - 그 외(예: 홍콩)가 임계치 이상이면 개별로 남을 수 있으므로 동적으로 포함
      // - 기타(연결조정)는 항상 마지막
      const keyUnion = Array.from(
        new Set([...Object.keys(prev), ...Object.keys(curr)])
      );

      const dynamicEntities = keyUnion
        .filter((k) => k !== MERGED_ENTITY_LABEL && !MAJOR_ENTITIES.includes(k))
        .sort(
          (a, b) =>
            Math.max(Math.abs(curr[b] || 0), Math.abs(prev[b] || 0)) -
            Math.max(Math.abs(curr[a] || 0), Math.abs(prev[a] || 0))
        );

      const entityOrder = [...MAJOR_ENTITIES, ...dynamicEntities, MERGED_ENTITY_LABEL].filter(
        (v, i, arr) => arr.indexOf(v) === i
      );

      return entityOrder.map(entity => {
        const prevVal = prev[entity] || 0;
        const currVal = curr[entity] || 0;
        const ratio = totalCurr > 0 ? ((currVal / totalCurr) * 100).toFixed(1) : '0.0';
        const change = prevVal !== 0 ? (((currVal - prevVal) / Math.abs(prevVal)) * 100).toFixed(1) : '-';
        return { entity, prevVal, currVal, ratio, change };
      });
    };

    // 손익계산서 항목 정의
    // 영업 섹션 과목 (매출액 ~ 영업이익률)
    const operatingItems = [
      { key: '매출액', label: 'I. 매출액', depth: 0, bold: true, selectable: true },
      { key: '매출원가', label: 'II. 매출원가', depth: 0, bold: true, selectable: true },
      { key: '매출총이익', label: 'III. 매출총이익', depth: 0, bold: true, selectable: true },
      { key: '매출총이익률', label: '매출총이익률', depth: 0, isRate: true, rateOf: ['매출총이익', '매출액'], highlight: 'blue' },
      { key: '판매비와관리비', label: 'IV. 판매비와관리비', depth: 0, bold: true },
      { key: '인건비', label: '(1)인건비', depth: 1, selectable: true },
      { key: '광고선전비', label: '(2)광고선전비', depth: 1, selectable: true },
      { key: '수수료', label: '(3)수수료', depth: 1, selectable: true },
      { key: '감가상각비', label: '(4)감가상각비', depth: 1, selectable: true },
      { key: '기타판관비', label: '(5)기타', depth: 1, selectable: true },
      { key: '영업이익', label: 'V. 영업이익', depth: 0, bold: true, highlight: 'green', selectable: true },
      { key: '영업이익률', label: '영업이익률', depth: 0, isRate: true, rateOf: ['영업이익', '매출액'], highlight: 'blue' },
    ];

    // 영업외 섹션 과목 (영업외손익 ~ 당기순이익률)
    const nonOperatingItems = [
      { key: '영업외손익', label: 'VI. 영업외손익', depth: 0, bold: true, selectable: true },
      { key: '외환손익', label: '(1)외환손익', depth: 1, selectable: true },
      { key: '선물환손익', label: '(2)선물환손익', depth: 1, selectable: true },
      { key: '금융상품손익', label: '(3)금융상품손익', depth: 1, selectable: true },
      { key: '이자손익', label: '(4)이자손익', depth: 1, selectable: true },
      { key: '배당수익', label: '(5)배당수익', depth: 1, selectable: true },
      { key: '기부금', label: '(6)기부금', depth: 1, selectable: true },
      { key: '기타손익', label: '(7)기타손익', depth: 1, selectable: true },
      { key: '지분법손익', label: 'VII. 지분법손익', depth: 0, bold: true, selectable: true },
      { key: '법인세비용차감전순이익', label: 'VIII. 법인세비용차감전순이익', depth: 0, bold: true, selectable: true },
      { key: '법인세비용', label: 'IX. 법인세비용', depth: 0, bold: true, selectable: true },
      { key: '법인세율', label: '법인세율', depth: 0, isRate: true, rateOf: ['법인세비용', '법인세비용차감전순이익'], highlight: 'blue' },
      { key: '당기순이익', label: 'X. 당기순이익', depth: 0, bold: true, highlight: 'green', selectable: true },
      { key: '당기순이익률', label: '당기순이익률', depth: 0, isRate: true, rateOf: ['당기순이익', '매출액'], highlight: 'blue' },
    ];

    // 전체 과목 (기존 호환성 유지)
    const incomeItems = [...operatingItems, ...nonOperatingItems];

    // 선택 가능한 과목 목록
    const selectableAccounts = incomeItems.filter(item => item.selectable).map(item => item.key);

    // 요약 카드 데이터
    const summaryCards = [
      {
        title: '매출액',
        key: '매출액',
        hasRate: false,
      },
      {
        title: '매출총이익',
        key: '매출총이익',
        hasRate: true,
        rateLabel: '매출총이익률',
        rateOf: ['매출총이익', '매출액'],
      },
      {
        title: '영업이익',
        key: '영업이익',
        hasRate: true,
        rateLabel: '영업이익률',
        rateOf: ['영업이익', '매출액'],
      },
      {
        title: '당기순이익',
        key: '당기순이익',
        hasRate: true,
        rateLabel: '당기순이익률',
        rateOf: ['당기순이익', '매출액'],
      },
    ];

    // 요약 카드는 조회 시점 기준 누적(연간) 데이터 사용
    const incomeSummaryYearKey = getPeriodKey(selectedPeriod, 'year');
    const incomeSummaryPrevYearKey = getPeriodKey(selectedPeriod, 'prev_year') || `${Number(selectedPeriod.split('_')[0]) - 1}_Year`;

    // 테이블 행 렌더링 함수
    const renderTableRow = (item, idx, items, selectedKey, setSelectedKey, showToggle = false) => {
      const isRateRow = item.isRate;
      const isSelectable = item.selectable;
      const isSelected = selectedKey === item.key;
      const isToggleParent = item.toggleParent;
      const isToggleChild = item.toggleChild;
      
      // 토글 자식 항목이고 접혀있으면 렌더링하지 않음
      if (isToggleChild && !isNonOperatingExpanded) {
        return null;
      }
      
      // 비율 행 처리
      if (isRateRow) {
        const [num, denom] = item.rateOf;
        const ratePrev = calcRate(incomeStatementData[prevPeriod]?.[num] || 0, incomeStatementData[prevPeriod]?.[denom] || 0);
        const rateCurr = calcRate(incomeStatementData[currPeriod]?.[num] || 0, incomeStatementData[currPeriod]?.[denom] || 0);
        const rateDiff = calcRateDiff(rateCurr, ratePrev);
        
        return (
          <tr key={idx} className="border-b border-zinc-100 bg-zinc-50/50">
            <td className="px-3 py-2 text-blue-600 italic border-r border-zinc-200">{item.label}</td>
            <td className="text-center px-3 py-2 text-blue-600 border-r border-zinc-200">{ratePrev}</td>
            <td className="text-center px-3 py-2 font-medium text-blue-600 border-r border-zinc-200 bg-zinc-50">{rateCurr}</td>
            <td colSpan="2" className={`text-center px-3 py-2 font-medium ${rateDiff.includes('+') ? 'text-emerald-600' : rateDiff.includes('-') ? 'text-rose-600' : 'text-blue-600'}`}>
              {rateDiff}
            </td>
          </tr>
        );
      }

      // 일반 금액 행 처리
      const valPrev = incomeStatementData[prevPeriod]?.[item.key] || 0;
      const valCurr = incomeStatementData[currPeriod]?.[item.key] || 0;
      const diff = valCurr - valPrev;
      const changeRate = calculateYoY(valCurr, valPrev);
      
      const highlightClass = item.highlight === 'green' ? 'bg-emerald-50/50' : '';
      const selectableClass = isSelectable ? 'cursor-pointer hover:bg-zinc-100' : '';
      const selectedClass = isSelected ? 'bg-zinc-100 ring-1 ring-zinc-300 ring-inset' : '';
      const toggleParentClass = isToggleParent ? 'cursor-pointer hover:bg-zinc-50' : '';
      
      return (
        <tr 
          key={idx} 
          className={`border-b border-zinc-100 ${highlightClass} ${selectableClass} ${selectedClass} ${toggleParentClass}`}
          onClick={() => {
            if (isSelectable) setSelectedKey(item.key);
            if (isToggleParent && showToggle) setIsNonOperatingExpanded(!isNonOperatingExpanded);
          }}
        >
          <td className={`px-3 py-2 border-r border-zinc-200 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-600'} ${item.depth === 1 ? 'pl-6' : ''}`}>
            {isToggleParent && showToggle && (
              <span className="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded bg-zinc-200 text-zinc-600 text-xs font-medium">
                {isNonOperatingExpanded ? '−' : '+'}
              </span>
            )}
            {item.label}
          </td>
          <td className="text-right px-3 py-2 text-zinc-500 border-r border-zinc-200 tabular-nums">{formatNumber(valPrev)}</td>
          <td className={`text-right px-3 py-2 border-r border-zinc-200 tabular-nums bg-zinc-50/50 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{formatNumber(valCurr)}</td>
          <td className={`text-right px-3 py-2 font-medium border-r border-zinc-200 tabular-nums ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {diff !== 0 ? formatNumber(diff) : '-'}
          </td>
          <td className={`text-right px-3 py-2 font-medium tabular-nums ${parseFloat(changeRate) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {changeRate !== '-' ? `${changeRate}%` : '-'}
          </td>
        </tr>
      );
    };

    const isEntitySubTabList = [
      { id: '연결', label: '연결' },
      { id: 'OC(국내)', label: 'OC(국내)' },
      { id: '중국', label: '중국' },
      { id: '홍콩', label: '홍콩' },
      { id: 'ST미국', label: 'ST미국' },
      { id: '엔터테인먼트', label: '엔터' },
      { id: '베트남', label: '베트남' },
      { id: '기타(연결조정)', label: '기타' },
    ];

    const isSubTabBar = (
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isEntitySubTabList.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setIsEntitySubTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                tab.id === '연결'
                  ? isEntitySubTab === '연결'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                  : isEntitySubTab === tab.id
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    );

    if (isEntitySubTab !== '연결') {
      return (
        <div className="space-y-4">
          {isSubTabBar}
          {renderEntityStatementsTab({ forceEntity: isEntitySubTab, forceMode: 'is' })}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {isSubTabBar}
        <div className="space-y-6">
        {/* ========== 섹션 1: 영업 실적 (매출액 ~ 영업이익) ========== */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => setOperatingSectionExpanded(!operatingSectionExpanded)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-zinc-200 transition-colors"
              title={operatingSectionExpanded ? '섹션 접기' : '섹션 펼치기'}
            >
              <span className={`text-zinc-500 text-sm transition-transform duration-200 ${operatingSectionExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
            </button>
            <h2 className="text-[13px] font-bold text-zinc-800 tracking-tight cursor-pointer" onClick={() => setOperatingSectionExpanded(!operatingSectionExpanded)}>
              영업 실적
            </h2>
            <div className="h-px flex-1 bg-zinc-200"></div>
            {/* 분기/누적 선택 버튼 */}
            {operatingSectionExpanded && (
            <div className="inline-flex p-0.5 bg-zinc-100 rounded-lg border border-zinc-200">
              <button
                onClick={() => setIncomeViewMode('quarter')}
                className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150 ${
                  incomeViewMode === 'quarter'
                    ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                분기(3개월)
              </button>
              <button
                onClick={() => setIncomeViewMode('annual')}
                className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150 ${
                  incomeViewMode === 'annual'
                    ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                누적(연간)
              </button>
            </div>
            )}
          </div>

          {operatingSectionExpanded && (
          <>
          <div className="flex flex-col xl:flex-row gap-4">
            {/* 좌측: 영업 섹션 테이블 */}
            <div className="flex-1 min-w-0 xl:max-w-[55%]">
              <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                  <h3 className="text-sm font-semibold text-zinc-900">연결 손익계산서 (영업)</h3>
                </div>
                <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[130px]">과목</th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[95px]">
                      {(() => {
                        const [yearStr, qStr] = selectedPeriod.split('_'); // 예: ['2025','Q2']
                        const quarterNum = (qStr || 'Q4').replace('Q', '');
                        const prevYear = String(Number(yearStr) - 1);
                        return incomeViewMode === 'quarter'
                          ? `${prevYear}.${quarterNum}Q`
                          : `${prevYear}년`;
                      })()}
                    </th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[95px]">
                      {(() => {
                        const [yearStr, qStr] = selectedPeriod.split('_'); // 예: ['2025','Q2']
                        const quarterNum = (qStr || 'Q4').replace('Q', '');
                        return incomeViewMode === 'quarter'
                          ? `${yearStr}.${quarterNum}Q`
                          : `${yearStr}년`;
                      })()}
                    </th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-600 min-w-[70px]">증감률</th>
                  </tr>
                </thead>
                <tbody>
                  {operatingItems.map((item, idx) => renderTableRow(item, idx, operatingItems, selectedAccount, setSelectedAccount, false))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 우측: 법인별 분석 */}
        {/* 지분법손익은 법인별 분석 표시하지 않음 */}
        {selectedAccount !== '지분법손익' && (
        <div className="w-full xl:w-[45%] xl:min-w-[420px] flex-shrink-0 space-y-3">
          {/* 법인별 분석 헤더 */}
          {(() => {
            // 영업외손익 관련 계정들 (도넛 차트 숨김)
            const nonOperatingSubAccounts = ['영업외손익', '외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익'];
            const hideDonutChart = nonOperatingSubAccounts.includes(selectedAccount);
            
            return (
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">
              {incomeItems.find(i => i.key === selectedAccount)?.label || selectedAccount} 법인별 구성
            </h3>
            <p className="text-xs text-zinc-400">{periodLabel} 기준 법인별 {hideDonutChart ? '금액' : '비중'}</p>
            
            {/* 도넛 차트 영역 - 영업외손익 하위 계정은 숨김 */}
            {!hideDonutChart && (
            <div className="flex justify-around mt-4">
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  {prevPeriodLabel}
                </p>
                <div style={{ width: 110, height: 110 }}>
                  {getDonutData(prevPeriod).length > 0 ? (
                    <PieChart width={110} height={110}>
                      <Pie
                        data={getDonutData(prevPeriod)}
                        cx={55}
                        cy={55}
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getDonutData(prevPeriod).map((entry, index) => (
                          <Cell key={`cell-prev-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={<CustomPieTooltip formatter={(value) => `${formatNumber(Math.round(value/100))}억원`} />}
                      />
                    </PieChart>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                  )}
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  {currPeriodLabel}
                </p>
                <div style={{ width: 110, height: 110 }}>
                  {getDonutData(currPeriod).length > 0 ? (
                    <PieChart width={110} height={110}>
                      <Pie
                        data={getDonutData(currPeriod)}
                        cx={55}
                        cy={55}
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getDonutData(currPeriod).map((entry, index) => (
                          <Cell key={`cell-curr-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={<CustomPieTooltip formatter={(value) => `${formatNumber(Math.round(value/100))}억원`} />}
                      />
                    </PieChart>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                  )}
                </div>
              </div>
            </div>
            )}
            
            {/* 범례 - 영업외손익 하위 계정은 숨김 */}
            {!hideDonutChart && (
            <div className="flex flex-wrap justify-center gap-3 mt-3">
              {Object.entries(entityColors).map(([name, color]) => (
                <div key={name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                  <span className="text-xs text-zinc-500">{name}</span>
                </div>
              ))}
            </div>
            )}
            
            {/* 계정별 설명 멘트 */}
            {selectedAccount === '매출액' && (
              <div className="text-xs text-zinc-500 mt-3 px-1">
                <span className="font-medium text-zinc-600">[매출액]</span> : 내부거래(OC의 중국, 홍콩 수출)제거한 순매출액 표시.
                <div style={{ paddingLeft: '53px' }}>OC(국내)=국내+3자수출분</div>
              </div>
            )}
            {selectedAccount === '매출원가' && (
              <div className="text-xs text-zinc-500 mt-3 px-1">
                <span className="font-medium text-zinc-600">[매출원가]</span> : 내부거래 제거한 실제 연결법인의 매출원가.
                <div style={{ paddingLeft: '62px' }}>중국/홍콩 (OC매입상품의) 매출원가→OC 생산원가</div>
              </div>
            )}
            {selectedAccount === '영업이익' && (
              <div className="text-xs text-zinc-500 mt-3 px-1">
                <span className="font-medium text-zinc-600">[영업이익]</span> : 별도 법인 기준 표시.
                <div style={{ paddingLeft: '62px' }}>기타(연결조정) - 내부거래제거 및 OC 중국/홍콩 수출판매분 이익조정 내역</div>
              </div>
            )}
          </div>
            );
          })()}

          {/* 법인별 테이블 */}
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th rowSpan={2} className="text-center px-2 py-1.5 font-semibold text-zinc-600 min-w-[65px] whitespace-nowrap border-r border-zinc-200">법인</th>
                  <th colSpan={2} className="text-center px-1 py-1 font-semibold text-zinc-600 border-r border-zinc-200">
                    {prevPeriodLabel}
                  </th>
                  <th colSpan={2} className="text-center px-1 py-1 font-semibold text-zinc-600 border-r border-zinc-200">
                    {currPeriodLabel}
                  </th>
                  <th rowSpan={2} className="text-center px-1 py-1.5 font-semibold text-zinc-600 min-w-[55px] border-r border-zinc-200">차이</th>
                  <th rowSpan={2} className="text-center px-1 py-1.5 font-semibold text-zinc-600 min-w-[40px] whitespace-nowrap">YoY</th>
                </tr>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[55px]">금액</th>
                  <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[38px] border-r border-zinc-200">비중</th>
                  <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[55px]">금액</th>
                  <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[38px] border-r border-zinc-200">비중</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const nonOperatingSubAccounts = ['영업외손익', '외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익'];
                  const hideZeroEntities = nonOperatingSubAccounts.includes(selectedAccount);
                  
                  let data = getEntityTableData();
                  // 영업외손익 관련 계정: 전기/당기 모두 0인 법인 숨김
                  if (hideZeroEntities) {
                    data = data.filter(row => row.prevVal !== 0 || row.currVal !== 0);
                  }
                  const totalPrev = data.reduce((sum, r) => sum + r.prevVal, 0);
                  const totalCurr = data.reduce((sum, r) => sum + r.currVal, 0);
                  
                  return data.map((row, idx) => {
                    const diff = row.currVal - row.prevVal;
                    const prevRatio = totalPrev !== 0 ? ((row.prevVal / totalPrev) * 100).toFixed(1) : '0.0';
                    return (
                    <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                      <td className="px-2 py-1.5 text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                        <span 
                          className="inline-block w-1.5 h-1.5 rounded-full mr-1" 
                          style={{ backgroundColor: entityColors[row.entity] }}
                        ></span>
                        {row.entity}
                      </td>
                      <td className="text-right px-1 py-1.5 text-zinc-500 tabular-nums">{formatNumber(row.prevVal)}</td>
                      <td className="text-right px-1 py-1.5 text-zinc-400 tabular-nums border-r border-zinc-100">{prevRatio}%</td>
                      <td className="text-right px-1 py-1.5 text-zinc-900 font-medium tabular-nums">{formatNumber(row.currVal)}</td>
                      <td className="text-right px-1 py-1.5 text-zinc-500 tabular-nums border-r border-zinc-100">{row.ratio}%</td>
                      <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-100 ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diff >= 0 ? '+' : ''}{formatNumber(diff)}
                      </td>
                      <td className={`text-right px-1 py-1.5 font-medium tabular-nums whitespace-nowrap ${parseFloat(row.change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {row.change !== '-' ? `${parseFloat(row.change) >= 0 ? '+' : ''}${row.change}%` : '-'}
                      </td>
                    </tr>
                    );
                  });
                })()}
                {/* 합계 행 */}
                {(() => {
                  const nonOperatingSubAccounts = ['영업외손익', '외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익'];
                  const hideZeroEntities = nonOperatingSubAccounts.includes(selectedAccount);
                  let data = getEntityTableData();
                  if (hideZeroEntities) {
                    data = data.filter(row => row.prevVal !== 0 || row.currVal !== 0);
                  }
                  const totalPrev = data.reduce((sum, r) => sum + r.prevVal, 0);
                  const totalCurr = data.reduce((sum, r) => sum + r.currVal, 0);
                  const totalDiff = totalCurr - totalPrev;
                  return (
                <tr className="bg-zinc-50 font-medium">
                  <td className="px-2 py-1.5 text-zinc-900 whitespace-nowrap border-r border-zinc-200">합계</td>
                  <td className="text-right px-1 py-1.5 text-zinc-700 tabular-nums">{formatNumber(totalPrev)}</td>
                  <td className="text-right px-1 py-1.5 text-zinc-600 tabular-nums border-r border-zinc-200">100%</td>
                  <td className="text-right px-1 py-1.5 text-zinc-900 tabular-nums">{formatNumber(totalCurr)}</td>
                  <td className="text-right px-1 py-1.5 text-zinc-600 tabular-nums border-r border-zinc-200">100%</td>
                  <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-200 ${totalDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {totalDiff >= 0 ? '+' : ''}{formatNumber(totalDiff)}
                  </td>
                  <td className="text-right px-1 py-1.5 text-zinc-400 whitespace-nowrap">-</td>
                </tr>
                  );
                })()}
              </tbody>
            </table>
            <p className="text-[10px] text-zinc-400 px-2 py-1 bg-zinc-50 border-t border-zinc-100">* 단위: 백만원</p>
          </div>
        </div>
        )}
        </div>

        {/* 영업 섹션 법인별 증감 분석 - 전체 너비 */}
        {selectedAccount !== '지분법손익' && !['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익'].includes(selectedAccount) && (
        <>
        {/* 숨겨진 섹션 - 항상 복원 링크 표시 */}
        {isDetailSectionHidden(selectedAccount) ? (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => restoreDetailSection(selectedAccount)}
              className="text-xs text-zinc-400 hover:text-blue-500 transition-colors"
            >
              + 구성 상세 표시
            </button>
          </div>
        ) : (
        <div className="mt-4 bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              {incomeItems.find(i => i.key === selectedAccount)?.label || selectedAccount} 구성 상세
            </h3>
            <div className="flex items-center gap-1">
              {incomeEditMode && (
                <>
                  <button
                    onClick={() => hideDetailSection(selectedAccount)}
                    className="text-xs px-1.5 py-1 rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300 transition-colors"
                    title="이 과목의 구성 상세 숨기기"
                  >
                    👁️‍🗨️
                  </button>
                  <button
                    onClick={exportEditData}
                    className="text-xs px-1.5 py-1 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
                    title="JSON 내보내기"
                  >
                    📥
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs px-1.5 py-1 rounded bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
                    title="JSON 가져오기"
                  >
                    📤
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('손익계산서 분석 내용을 기본값으로 초기화하시겠습니까?')) {
                        resetEditData('income');
                      }
                    }}
                    className="text-xs px-1.5 py-1 rounded bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors"
                    title="초기화"
                  >
                    ↺
                  </button>
                </>
              )}
              <button
                onClick={() => setIncomeEditMode(!incomeEditMode)}
                className={`p-1 rounded transition-colors ${
                  incomeEditMode 
                    ? 'text-blue-500 bg-blue-50' 
                    : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
                }`}
                title={incomeEditMode ? '편집 완료' : '분석 문장 편집'}
              >
                {incomeEditMode ? '✓' : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>}
              </button>
            </div>
            {/* 숨겨진 파일 입력 */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={importEditData}
              accept=".json"
              className="hidden"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              const tableData = getEntityTableData().filter(row => row.entity !== '기타');
              
              const sortedData = [...tableData].sort((a, b) => {
                const orderA = ENTITY_ORDER.indexOf(a.entity);
                const orderB = ENTITY_ORDER.indexOf(b.entity);
                return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
              });
              
              // 숨겨진 법인 필터링 (분기/누적별 분리)
              const visibleData = getVisibleEntities(selectedAccount, sortedData, incomeViewMode);
              
              return visibleData.map((row, idx) => {
                const diff = row.currVal - row.prevVal;
                const isPositive = diff >= 0;
                const diffBil = Math.round(diff / 100);
                
                // 편집 가능한 분석 문장 (분기/누적별 분리 저장)
                const editKey = `${selectedAccount}_${row.entity}_${incomeViewMode}`;
                const defaultTexts = generateIncomeAnalysisText(selectedAccount, row.entity, currPeriod, prevPeriod);
                const analysisTexts = incomeEditData[editKey] || defaultTexts;
                
                return (
                  <div key={idx} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 relative">
                    {/* 삭제 버튼 - 편집 모드에서만 표시 */}
                    {incomeEditMode && (
                      <button
                        onClick={() => hideEntityCard(selectedAccount, row.entity, incomeViewMode)}
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-rose-100 text-rose-500 hover:bg-rose-200 transition-colors text-xs"
                        title={`${row.entity} 카드 숨기기`}
                      >
                        ×
                      </button>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span 
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entityColors[row.entity] }}
                        ></span>
                        <span className="font-medium text-zinc-800 text-sm">{row.entity}</span>
                      </div>
                      <span className={`font-bold text-sm ${isPositive ? 'text-emerald-600' : 'text-rose-600'} ${incomeEditMode ? 'mr-4' : ''}`}>
                        {isPositive ? '+' : ''}{formatNumber(diffBil)}억원
                      </span>
                    </div>
                    {/* 분석 문장 입력 영역 */}
                    <div className="space-y-1">
                      {incomeEditMode ? (
                        <textarea
                          value={analysisTexts.join('\n')}
                          onChange={(e) => {
                            const newTexts = e.target.value.split('\n');
                            setIncomeEditData(prev => ({
                              ...prev,
                              [editKey]: newTexts
                            }));
                          }}
                          placeholder="분석 내용을 입력하세요..."
                          className="w-full text-xs text-zinc-600 leading-relaxed px-2 py-1.5 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                          rows={3}
                        />
                      ) : (
                        analysisTexts.filter(t => t).length > 0 ? (
                          <div className="text-xs text-zinc-600 leading-relaxed">
                            {analysisTexts.filter(t => t).map((text, i) => (
                              <p key={i} className="mb-0.5">• {text}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 italic">분석 내용 없음</p>
                        )
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          
          {/* 숨겨진 법인 복원 영역 - 편집 모드에서만 표시 (분기/누적별 분리) */}
          {incomeEditMode && getHiddenEntitiesForAccount(selectedAccount, incomeViewMode).length > 0 && (
            <div className="mt-2 p-2 bg-zinc-100 rounded-lg">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-xs text-zinc-500">숨겨진 법인:</span>
                {getHiddenEntitiesForAccount(selectedAccount, incomeViewMode).map(entity => (
                  <button
                    key={entity}
                    onClick={() => restoreEntityCard(selectedAccount, entity, incomeViewMode)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    <span 
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: entityColors[entity] }}
                    ></span>
                    {entity}
                    <span className="text-emerald-500 ml-0.5">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* 전체 YoY 변동 요약 */}
          {(() => {
            const tableData = getEntityTableData();
            const totalCurr = tableData.reduce((sum, r) => sum + r.currVal, 0);
            const totalPrev = tableData.reduce((sum, r) => sum + r.prevVal, 0);
            const totalDiff = totalCurr - totalPrev;
            const totalDiffBil = Math.round(totalDiff / 100);
            const totalChange = totalPrev !== 0 ? ((totalDiff / totalPrev) * 100).toFixed(1) : 0;
            const isPositive = totalDiff >= 0;
            
            const totalEditKey = `${selectedAccount}_total_${incomeViewMode}`;
            const totalEdited = incomeEditData[totalEditKey] || {};
            const displayTotalAmount = totalEdited.amount !== undefined ? totalEdited.amount : `${isPositive ? '+' : ''}${formatNumber(totalDiffBil)}`;
            const displayTotalRate = totalEdited.rate !== undefined ? totalEdited.rate : `${isPositive ? '+' : ''}${totalChange}`;
            
            return (
              <div className="mt-3 pt-3 border-t border-zinc-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600 font-medium">전체 YoY 변동</span>
                  {incomeEditMode ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={displayTotalAmount}
                        onChange={(e) => setIncomeEditData(prev => ({
                          ...prev,
                          [totalEditKey]: { ...prev[totalEditKey], amount: e.target.value }
                        }))}
                        className="w-20 text-right text-xs font-bold px-1 py-0.5 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-zinc-500">억원 (</span>
                      <input
                        type="text"
                        value={displayTotalRate}
                        onChange={(e) => setIncomeEditData(prev => ({
                          ...prev,
                          [totalEditKey]: { ...prev[totalEditKey], rate: e.target.value }
                        }))}
                        className="w-14 text-right text-xs font-bold px-1 py-0.5 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-zinc-500">%)</span>
                    </div>
                  ) : (
                    <span className={`font-bold ${parseFloat(displayTotalRate) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {displayTotalAmount}억원 ({displayTotalRate}%)
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        )}
        </>
        )}
        </>
        )}
      </div>

        {/* ========== 섹션 구분자 ========== */}
        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-zinc-300"></div>
        </div>

        {/* ========== 섹션 2: 영업외 손익 (영업외손익 ~ 당기순이익) ========== */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => setNonOpSectionExpanded(!nonOpSectionExpanded)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-zinc-200 transition-colors"
              title={nonOpSectionExpanded ? '섹션 접기' : '섹션 펼치기'}
            >
              <span className={`text-zinc-500 text-sm transition-transform duration-200 ${nonOpSectionExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
            </button>
            <h2 className="text-[13px] font-bold text-zinc-800 tracking-tight cursor-pointer" onClick={() => setNonOpSectionExpanded(!nonOpSectionExpanded)}>
              영업 외 실적
            </h2>
            <div className="h-px flex-1 bg-zinc-200"></div>
          </div>

          {nonOpSectionExpanded && (
          <>
          <div className="flex flex-col xl:flex-row gap-4">
            {/* 좌측: 영업외 섹션 테이블 */}
            <div className="flex-1 min-w-0 xl:max-w-[55%]">
              <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                  <h3 className="text-sm font-semibold text-zinc-900">연결 손익계산서 (영업외)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[130px]">과목</th>
                        <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[95px]">
                          {(() => {
                            const [yearStr, qStr] = selectedPeriod.split('_');
                            const quarterNum = (qStr || 'Q4').replace('Q', '');
                            const prevYear = String(Number(yearStr) - 1);
                            return incomeViewMode === 'quarter'
                              ? `${prevYear}.${quarterNum}Q`
                              : `${prevYear}년`;
                          })()}
                        </th>
                        <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[95px]">
                          {(() => {
                            const [yearStr, qStr] = selectedPeriod.split('_');
                            const quarterNum = (qStr || 'Q4').replace('Q', '');
                            return incomeViewMode === 'quarter'
                              ? `${yearStr}.${quarterNum}Q`
                              : `${yearStr}년`;
                          })()}
                        </th>
                        <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
                        <th className="text-center px-3 py-2 font-semibold text-zinc-600 min-w-[70px]">증감률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonOperatingItems.map((item, idx) => renderTableRow(item, idx, nonOperatingItems, selectedNonOpAccount, setSelectedNonOpAccount, true))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 우측: 영업외 섹션 법인별 분석 */}
            {(
            <div className="w-full xl:w-[45%] xl:min-w-[420px] flex-shrink-0 space-y-3">
              {/* 법인별 분석 헤더 */}
              {(() => {
                // 영업외손익 관련 계정들 (도넛 차트 숨김)
                const nonOperatingSubAccounts = ['영업외손익', '외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익'];
                const hideDonutChart = nonOperatingSubAccounts.includes(selectedNonOpAccount);
                
                // 영업외 섹션용 법인별 분석 데이터 함수
                const getNonOpEntityTableData = () => {
                  const curr = getGroupedEntityBreakdownForComparison(selectedNonOpAccount, prevPeriod, currPeriod);
                  const prev = getGroupedEntityBreakdownForComparison(selectedNonOpAccount, prevPeriod, prevPeriod);
                  const totalCurr = getConsolidatedTotal(selectedNonOpAccount, currPeriod);
                  
                  const keyUnion = Array.from(new Set([...Object.keys(prev), ...Object.keys(curr)]));
                  const dynamicEntities = keyUnion
                    .filter((k) => k !== MERGED_ENTITY_LABEL && !MAJOR_ENTITIES.includes(k))
                    .sort((a, b) => Math.abs(curr[b] || 0) - Math.abs(curr[a] || 0));
                  
                  const entityOrder = [...MAJOR_ENTITIES, ...dynamicEntities, MERGED_ENTITY_LABEL].filter(
                    (v, i, arr) => arr.indexOf(v) === i
                  );

                  return entityOrder
                    .filter((entity) => curr[entity] !== undefined || prev[entity] !== undefined)
                    .map((entity) => {
                      const pVal = prev[entity] || 0;
                      const cVal = curr[entity] || 0;
                      return {
                        entity,
                        prevVal: pVal,
                        currVal: cVal,
                        ratio: totalCurr !== 0 ? ((cVal / totalCurr) * 100).toFixed(1) : '0.0',
                        change: pVal !== 0 ? (((cVal - pVal) / Math.abs(pVal)) * 100).toFixed(1) : (cVal !== 0 ? '100.0' : '-'),
                      };
                    });
                };

                const getNonOpDonutData = (period) => {
                  const data = getGroupedEntityBreakdown(selectedNonOpAccount, period);
                  return Object.entries(data)
                    .filter(([_, value]) => value > 0)
                    .map(([name, value]) => ({
                      name,
                      value: value || 0,
                      color: name === MERGED_ENTITY_LABEL ? '#6B7280' : (entityColors[name] || '#9CA3AF'),
                    }));
                };
                
                return (
              <>
              <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {nonOperatingItems.find(i => i.key === selectedNonOpAccount)?.label || selectedNonOpAccount} 법인별 구성
                  </h3>
                  {/* 직접입력 버튼: 기타손익 등 CSV 미제공 계정 */}
                  {hideDonutChart && (
                    <div className="flex gap-1">
                      {!entityAmtInputMode ? (
                        <button
                          onClick={() => {
                            // 기존 저장값으로 draft 초기화
                            const draft = {};
                            ALL_PANEL_ENTITIES.forEach(entity => {
                              const key = `amtOverride_${selectedNonOpAccount}_${entity}_${currPeriod}`;
                              const val = incomeEditData?.[key];
                              if (val !== undefined && val !== '') draft[entity] = String(val);
                            });
                            setEntityAmtDraft(draft);
                            setEntityAmtInputMode(true);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded border border-violet-300 text-violet-600 hover:bg-violet-50"
                        >✏️ 직접입력</button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              // 저장: draft → incomeEditData
                              const updates = { ...incomeEditData };
                              ALL_PANEL_ENTITIES.forEach(entity => {
                                const key = `amtOverride_${selectedNonOpAccount}_${entity}_${currPeriod}`;
                                const v = entityAmtDraft[entity];
                                if (v !== undefined && v !== '' && !isNaN(Number(v))) {
                                  updates[key] = Number(v);
                                } else {
                                  delete updates[key];
                                }
                              });
                              setIncomeEditData(updates);
                              setEntityAmtInputMode(false);
                            }}
                            className="text-[11px] px-2 py-0.5 rounded border border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
                          >💾 저장</button>
                          <button
                            onClick={() => { setEntityAmtInputMode(false); setEntityAmtDraft({}); }}
                            className="text-[11px] px-2 py-0.5 rounded border border-zinc-300 text-zinc-500 hover:bg-zinc-50"
                          >취소</button>
                          {/* 초기화 버튼 */}
                          <button
                            onClick={() => {
                              if (!window.confirm('입력한 법인별 금액을 모두 초기화할까요?')) return;
                              const updates = { ...incomeEditData };
                              ALL_PANEL_ENTITIES.forEach(entity => {
                                delete updates[`amtOverride_${selectedNonOpAccount}_${entity}_${currPeriod}`];
                              });
                              setIncomeEditData(updates);
                              setEntityAmtInputMode(false);
                              setEntityAmtDraft({});
                            }}
                            className="text-[11px] px-2 py-0.5 rounded border border-rose-300 text-rose-500 hover:bg-rose-50"
                          >초기화</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{periodLabel} 기준 법인별 {hideDonutChart ? '금액' : '비중'}</p>
                {entityAmtInputMode && hideDonutChart && (
                  <p className="text-[11px] text-violet-500 mt-1">✏️ {currPeriodLabel} 법인별 금액을 억원 단위로 입력하세요 (음수 가능)</p>
                )}
                
                {/* 도넛 차트 영역 - 영업외손익 하위 계정은 숨김 */}
                {!hideDonutChart && (
                <div className="flex justify-around mt-4">
                  <div className="text-center">
                    <p className="text-xs font-medium text-zinc-500 mb-2">
                      {prevPeriodLabel}
                    </p>
                    <div style={{ width: 110, height: 110 }}>
                      {getNonOpDonutData(prevPeriod).length > 0 ? (
                        <PieChart width={110} height={110}>
                          <Pie
                            data={getNonOpDonutData(prevPeriod)}
                            cx={55}
                            cy={55}
                            innerRadius={28}
                            outerRadius={48}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {getNonOpDonutData(prevPeriod).map((entry, index) => (
                              <Cell key={`cell-nonop-prev-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip formatter={(value) => `${formatNumber(Math.round(value/100))}억원`} />} />
                        </PieChart>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-zinc-500 mb-2">
                      {currPeriodLabel}
                    </p>
                    <div style={{ width: 110, height: 110 }}>
                      {getNonOpDonutData(currPeriod).length > 0 ? (
                        <PieChart width={110} height={110}>
                          <Pie
                            data={getNonOpDonutData(currPeriod)}
                            cx={55}
                            cy={55}
                            innerRadius={28}
                            outerRadius={48}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {getNonOpDonutData(currPeriod).map((entry, index) => (
                              <Cell key={`cell-nonop-curr-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip formatter={(value) => `${formatNumber(Math.round(value/100))}억원`} />} />
                        </PieChart>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                      )}
                    </div>
                  </div>
                </div>
                )}
                
                {/* 범례 - 영업외손익 하위 계정은 숨김 */}
                {!hideDonutChart && (
                <div className="flex flex-wrap justify-center gap-3 mt-3">
                  {Object.entries(entityColors).map(([name, color]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                      <span className="text-xs text-zinc-500">{name}</span>
                    </div>
                  ))}
                </div>
                )}
              </div>

              {/* 영업외 법인별 테이블 */}
              <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th rowSpan={2} className="text-center px-2 py-1.5 font-semibold text-zinc-600 min-w-[65px] whitespace-nowrap border-r border-zinc-200">법인</th>
                      <th colSpan={2} className="text-center px-1 py-1 font-semibold text-zinc-600 border-r border-zinc-200">
                        {prevPeriodLabel}
                      </th>
                      <th colSpan={2} className="text-center px-1 py-1 font-semibold text-zinc-600 border-r border-zinc-200">
                        {currPeriodLabel}
                      </th>
                      <th rowSpan={2} className="text-center px-1 py-1.5 font-semibold text-zinc-600 min-w-[55px] border-r border-zinc-200">차이</th>
                      <th rowSpan={2} className="text-center px-1 py-1.5 font-semibold text-zinc-600 min-w-[40px] whitespace-nowrap">YoY</th>
                    </tr>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[55px]">금액</th>
                      <th className={`text-center px-1 py-1 font-medium min-w-[38px] border-r border-zinc-200 ${selectedNonOpAccount === '법인세비용' ? 'text-blue-500' : 'text-zinc-500'}`}>
                        {selectedNonOpAccount === '법인세비용' ? '유효세율' : '비중'}
                      </th>
                      <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[55px]">금액</th>
                      <th className={`text-center px-1 py-1 font-medium min-w-[38px] border-r border-zinc-200 ${selectedNonOpAccount === '법인세비용' ? 'text-blue-500' : 'text-zinc-500'}`}>
                        {selectedNonOpAccount === '법인세비용' ? '유효세율' : '비중'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let data = getNonOpEntityTableData();
                      // 영업외손익 하위 계정: 전기/당기 모두 0인 법인 숨김
                      if (hideDonutChart) {
                        data = data.filter(row => row.prevVal !== 0 || row.currVal !== 0);
                      }
                      const totalPrev = data.reduce((sum, r) => sum + r.prevVal, 0);
                      const totalCurr = data.reduce((sum, r) => sum + r.currVal, 0);
                      
                      // 법인세비용 선택 시 법인세비용차감전순이익 데이터 가져오기 (전기/당기)
                      // CSV 기반 데이터 우선 사용 (normalizeYearDataset 클론값 방지)
                      const ebtDataCurr = selectedNonOpAccount === '법인세비용'
                        ? getBaseEntityBreakdown('법인세비용차감전순이익', currPeriod)
                        : {};
                      const ebtDataPrev = selectedNonOpAccount === '법인세비용'
                        ? getBaseEntityBreakdown('법인세비용차감전순이익', prevPeriod)
                        : {};
                      
                      return data.map((row, idx) => {
                        const diff = row.currVal - row.prevVal;
                        const prevRatio = totalPrev !== 0 ? ((row.prevVal / totalPrev) * 100).toFixed(1) : '0.0';
                        
                        // 법인별 유효세율 계산 (법인세비용 / 법인세비용차감전순이익 * 100)
                        let effectiveTaxRateCurr = '-';
                        let effectiveTaxRatePrev = '-';
                        if (selectedNonOpAccount === '법인세비용') {
                          const entityKey = row.entity === '기타(연결조정)' ? '기타' : row.entity;
                          // 당기 유효세율
                          const ebtCurr = ebtDataCurr[entityKey] || 0;
                          if (ebtCurr > 0 && row.currVal > 0) {
                            effectiveTaxRateCurr = ((row.currVal / ebtCurr) * 100).toFixed(1) + '%';
                          }
                          // 전기 유효세율
                          const ebtPrev = ebtDataPrev[entityKey] || 0;
                          if (ebtPrev > 0 && row.prevVal > 0) {
                            effectiveTaxRatePrev = ((row.prevVal / ebtPrev) * 100).toFixed(1) + '%';
                          }
                        }
                        
                        return (
                        <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="px-2 py-1.5 text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                            <span 
                              className="inline-block w-1.5 h-1.5 rounded-full mr-1" 
                              style={{ backgroundColor: entityColors[row.entity] }}
                            ></span>
                            {row.entity}
                          </td>
                          <td className="text-right px-1 py-1.5 text-zinc-500 tabular-nums">{formatNumber(row.prevVal)}</td>
                          <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-100 ${selectedNonOpAccount === '법인세비용' ? 'text-blue-600 font-medium' : 'text-zinc-400'}`}>
                            {selectedNonOpAccount === '법인세비용' ? effectiveTaxRatePrev : `${prevRatio}%`}
                          </td>
                          {/* 당기 금액: 직접입력 모드면 input, 아니면 표시값 */}
                          {entityAmtInputMode && hideDonutChart && row.entity !== '기타(연결조정)' ? (
                            <td className="px-1 py-1" colSpan={2}>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="억원"
                                  value={entityAmtDraft[row.entity] ?? ''}
                                  onChange={(e) => setEntityAmtDraft(prev => ({ ...prev, [row.entity]: e.target.value }))}
                                  className="w-full text-right text-xs border border-violet-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-violet-50"
                                />
                                <span className="text-[10px] text-zinc-400 whitespace-nowrap">억원</span>
                              </div>
                            </td>
                          ) : (
                            <>
                          <td className="text-right px-1 py-1.5 text-zinc-900 font-medium tabular-nums">{formatNumber(row.currVal)}</td>
                          <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-100 ${selectedNonOpAccount === '법인세비용' ? 'text-blue-600 font-medium' : 'text-zinc-500'}`}>
                            {selectedNonOpAccount === '법인세비용' ? effectiveTaxRateCurr : `${row.ratio}%`}
                          </td>
                            </>
                          )}
                          <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-100 ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {entityAmtInputMode && hideDonutChart ? '-' : (diff >= 0 ? '+' : '') + formatNumber(diff)}
                          </td>
                          <td className={`text-right px-1 py-1.5 font-medium tabular-nums whitespace-nowrap ${parseFloat(row.change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {entityAmtInputMode && hideDonutChart ? '-' : (row.change !== '-' ? `${parseFloat(row.change) >= 0 ? '+' : ''}${row.change}%` : '-')}
                          </td>
                        </tr>
                        );
                      });
                    })()}
                    {/* 합계 행 */}
                    {(() => {
                      let data = getNonOpEntityTableData();
                      if (hideDonutChart) {
                        data = data.filter(row => row.prevVal !== 0 || row.currVal !== 0);
                      }
                      const totalPrev = data.reduce((sum, r) => sum + r.prevVal, 0);
                      const totalCurr = data.reduce((sum, r) => sum + r.currVal, 0);
                      const totalDiff = totalCurr - totalPrev;
                      
                      // 합계 유효세율 계산 (전기/당기)
                      let totalEffectiveTaxRateCurr = '-';
                      let totalEffectiveTaxRatePrev = '-';
                      if (selectedNonOpAccount === '법인세비용') {
                        const ebtTotalCurr = incomeStatementData[currPeriod]?.['법인세비용차감전순이익'] || 0;
                        const ebtTotalPrev = incomeStatementData[prevPeriod]?.['법인세비용차감전순이익'] || 0;
                        if (ebtTotalCurr > 0 && totalCurr > 0) {
                          totalEffectiveTaxRateCurr = ((totalCurr / ebtTotalCurr) * 100).toFixed(1) + '%';
                        }
                        if (ebtTotalPrev > 0 && totalPrev > 0) {
                          totalEffectiveTaxRatePrev = ((totalPrev / ebtTotalPrev) * 100).toFixed(1) + '%';
                        }
                      }
                      
                      return (
                    <tr className="bg-zinc-50 font-medium">
                      <td className="px-2 py-1.5 text-zinc-900 whitespace-nowrap border-r border-zinc-200">합계</td>
                      <td className="text-right px-1 py-1.5 text-zinc-700 tabular-nums">{formatNumber(totalPrev)}</td>
                      <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-200 ${selectedNonOpAccount === '법인세비용' ? 'text-blue-600 font-semibold' : 'text-zinc-600'}`}>
                        {selectedNonOpAccount === '법인세비용' ? totalEffectiveTaxRatePrev : '100%'}
                      </td>
                      <td className="text-right px-1 py-1.5 text-zinc-900 tabular-nums">{formatNumber(totalCurr)}</td>
                      <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-200 ${selectedNonOpAccount === '법인세비용' ? 'text-blue-600 font-semibold' : 'text-zinc-600'}`}>
                        {selectedNonOpAccount === '법인세비용' ? totalEffectiveTaxRateCurr : '100%'}
                      </td>
                      <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-200 ${totalDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {totalDiff >= 0 ? '+' : ''}{formatNumber(totalDiff)}
                      </td>
                      <td className="text-right px-1 py-1.5 text-zinc-400 whitespace-nowrap">-</td>
                    </tr>
                      );
                    })()}
                  </tbody>
                </table>
                <p className="text-[10px] text-zinc-400 px-2 py-1 bg-zinc-50 border-t border-zinc-100">* 단위: 백만원</p>
              </div>
              </>
                );
              })()}
            </div>
            )}
          </div>

          {/* 영업외 법인별 증감 분석 - 전체 너비 */}
          {(
          <>
          {/* 숨겨진 섹션 - 항상 복원 링크 표시 */}
          {isDetailSectionHidden(selectedNonOpAccount) ? (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => restoreDetailSection(selectedNonOpAccount)}
                className="text-xs text-zinc-400 hover:text-blue-500 transition-colors"
              >
                + 구성 상세 표시
              </button>
            </div>
          ) : (
          <div className="mt-4 bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-900">
                {nonOperatingItems.find(i => i.key === selectedNonOpAccount)?.label || selectedNonOpAccount} 구성 상세
              </h3>
              <div className="flex items-center gap-1">
                {nonOpEditMode && (
                  <>
                    <button
                      onClick={() => hideDetailSection(selectedNonOpAccount)}
                      className="text-xs px-1.5 py-1 rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300 transition-colors"
                      title="이 과목의 구성 상세 숨기기"
                    >
                      👁️‍🗨️
                    </button>
                    <button
                      onClick={exportEditData}
                      className="text-xs px-1.5 py-1 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
                      title="JSON 내보내기"
                    >
                      📥
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs px-1.5 py-1 rounded bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
                      title="JSON 가져오기"
                    >
                      📤
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('손익계산서 분석 내용을 기본값으로 초기화하시겠습니까?')) {
                          resetEditData('income');
                        }
                      }}
                      className="text-xs px-1.5 py-1 rounded bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors"
                      title="초기화"
                    >
                      ↺
                    </button>
                  </>
                )}
                <button
                  onClick={() => setNonOpEditMode(!nonOpEditMode)}
                  className={`p-1 rounded transition-colors ${
                    nonOpEditMode 
                      ? 'text-blue-500 bg-blue-50' 
                      : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
                  }`}
                  title={nonOpEditMode ? '편집 완료' : '분석 문장 편집'}
                >
                  {nonOpEditMode ? '✓' : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(() => {
                // 영업외 섹션용 데이터 함수
                const getNonOpEntityTableDataLocal = () => {
                  const curr = getGroupedEntityBreakdownForComparison(selectedNonOpAccount, prevPeriod, currPeriod);
                  const prev = getGroupedEntityBreakdownForComparison(selectedNonOpAccount, prevPeriod, prevPeriod);
                  const totalCurr = getConsolidatedTotal(selectedNonOpAccount, currPeriod);
                  
                  const keyUnion = Array.from(new Set([...Object.keys(prev), ...Object.keys(curr)]));
                  const dynamicEntities = keyUnion
                    .filter((k) => k !== MERGED_ENTITY_LABEL && !MAJOR_ENTITIES.includes(k))
                    .sort((a, b) => Math.abs(curr[b] || 0) - Math.abs(curr[a] || 0));
                  
                  const entityOrder = [...MAJOR_ENTITIES, ...dynamicEntities, MERGED_ENTITY_LABEL].filter(
                    (v, i, arr) => arr.indexOf(v) === i
                  );

                  return entityOrder
                    .filter((entity) => curr[entity] !== undefined || prev[entity] !== undefined)
                    .map((entity) => {
                      const pVal = prev[entity] || 0;
                      const cVal = curr[entity] || 0;
                      return {
                        entity,
                        prevVal: pVal,
                        currVal: cVal,
                      };
                    });
                };

                const tableData = getNonOpEntityTableDataLocal().filter(row => row.entity !== '기타');
                
                const sortedData = [...tableData].sort((a, b) => {
                  const orderA = ENTITY_ORDER.indexOf(a.entity);
                  const orderB = ENTITY_ORDER.indexOf(b.entity);
                  return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
                });
                
                // 숨겨진 법인 필터링 (분기/누적별 분리)
                const visibleData = getVisibleEntities(selectedNonOpAccount, sortedData, incomeViewMode);
                
                return visibleData.map((row, idx) => {
                  const diff = row.currVal - row.prevVal;
                  const isPositive = diff >= 0;
                  const diffBil = Math.round(diff / 100);
                  
                  // 편집 가능한 분석 문장 (분기/누적별 분리 저장)
                  const editKey = `${selectedNonOpAccount}_${row.entity}_${incomeViewMode}`;
                  const analysisTexts = incomeEditData[editKey] || [];
                  
                  return (
                    <div key={idx} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 relative">
                      {/* 삭제 버튼 - 편집 모드에서만 표시 */}
                      {nonOpEditMode && (
                        <button
                          onClick={() => hideEntityCard(selectedNonOpAccount, row.entity, incomeViewMode)}
                          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-rose-100 text-rose-500 hover:bg-rose-200 transition-colors text-xs"
                          title={`${row.entity} 카드 숨기기`}
                        >
                          ×
                        </button>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span 
                            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entityColors[row.entity] }}
                          ></span>
                          <span className="font-medium text-zinc-800 text-sm">{row.entity}</span>
                        </div>
                        <span className={`font-bold text-sm ${isPositive ? 'text-emerald-600' : 'text-rose-600'} ${nonOpEditMode ? 'mr-4' : ''}`}>
                          {isPositive ? '+' : ''}{formatNumber(diffBil)}억원
                        </span>
                      </div>
                      {/* 분석 문장 입력 영역 */}
                      <div className="space-y-1">
                        {nonOpEditMode ? (
                          <textarea
                            value={analysisTexts.join('\n')}
                            onChange={(e) => {
                              const newTexts = e.target.value.split('\n');
                              setIncomeEditData(prev => ({
                                ...prev,
                                [editKey]: newTexts
                              }));
                            }}
                            placeholder="분석 내용을 입력하세요..."
                            className="w-full text-xs text-zinc-600 leading-relaxed px-2 py-1.5 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                            rows={3}
                          />
                        ) : (
                          analysisTexts.filter(t => t).length > 0 ? (
                            <div className="text-xs text-zinc-600 leading-relaxed">
                              {analysisTexts.filter(t => t).map((text, i) => (
                                <p key={i} className="mb-0.5">• {text}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">분석 내용 없음</p>
                          )
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            
            {/* 숨겨진 법인 복원 영역 - 편집 모드에서만 표시 (분기/누적별 분리) */}
            {nonOpEditMode && getHiddenEntitiesForAccount(selectedNonOpAccount, incomeViewMode).length > 0 && (
              <div className="mt-2 p-2 bg-zinc-100 rounded-lg">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-xs text-zinc-500">숨겨진 법인:</span>
                  {getHiddenEntitiesForAccount(selectedNonOpAccount, incomeViewMode).map(entity => (
                    <button
                      key={entity}
                      onClick={() => restoreEntityCard(selectedNonOpAccount, entity, incomeViewMode)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                      <span 
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: entityColors[entity] }}
                      ></span>
                      {entity}
                      <span className="text-emerald-500 ml-0.5">+</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* 전체 YoY 변동 요약 */}
            {(() => {
              const getNonOpEntityTableDataLocal = () => {
                const curr = getGroupedEntityBreakdownForComparison(selectedNonOpAccount, prevPeriod, currPeriod);
                const prev = getGroupedEntityBreakdownForComparison(selectedNonOpAccount, prevPeriod, prevPeriod);
                const totalCurr = getConsolidatedTotal(selectedNonOpAccount, currPeriod);
                
                const keyUnion = Array.from(new Set([...Object.keys(prev), ...Object.keys(curr)]));
                const entityOrder = [...MAJOR_ENTITIES, ...keyUnion.filter(k => !MAJOR_ENTITIES.includes(k)), MERGED_ENTITY_LABEL].filter(
                  (v, i, arr) => arr.indexOf(v) === i
                );

                return entityOrder
                  .filter((entity) => curr[entity] !== undefined || prev[entity] !== undefined)
                  .map((entity) => ({
                    entity,
                    prevVal: prev[entity] || 0,
                    currVal: curr[entity] || 0,
                  }));
              };
              
              const tableData = getNonOpEntityTableDataLocal();
              const totalCurr = tableData.reduce((sum, r) => sum + r.currVal, 0);
              const totalPrev = tableData.reduce((sum, r) => sum + r.prevVal, 0);
              const totalDiff = totalCurr - totalPrev;
              const totalDiffBil = Math.round(totalDiff / 100);
              const totalChange = totalPrev !== 0 ? ((totalDiff / totalPrev) * 100).toFixed(1) : 0;
              const isPositive = totalDiff >= 0;
              
              return (
                <div className="mt-3 pt-3 border-t border-zinc-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600 font-medium">전체 YoY 변동</span>
                    <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isPositive ? '+' : ''}{formatNumber(totalDiffBil)}억원 ({isPositive ? '+' : ''}{totalChange}%)
                    </span>
                  </div>
                </div>
              );
            })()}
            
            {/* 이자수익 상세 — 26.1Q vs 25.1Q 비교 (구성상세 하단) */}
            {selectedNonOpAccount === '이자손익' && (
              <div className="mt-4">
                <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="bg-zinc-50 px-3 py-2 border-b border-zinc-200 flex justify-between items-center">
                    <div>
                      <span className="text-sm font-semibold text-zinc-800">이자수익 상세</span>
                      <span className="text-xs text-zinc-500 ml-2">26.1Q vs 25.1Q 비교</span>
                    </div>
                    <span className="text-xs text-zinc-500">단위: 백만원</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-zinc-100 border-b border-zinc-200 text-zinc-600">
                          <th colSpan={2} className="text-left px-3 py-2 font-semibold border-r border-zinc-200">구분</th>
                          <th colSpan={3} className="text-center px-3 py-2 font-semibold border-r border-zinc-200 text-blue-700 bg-blue-50">25.1Q</th>
                          <th colSpan={3} className="text-center px-3 py-2 font-semibold text-emerald-700 bg-emerald-50">26.1Q</th>
                        </tr>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                          <th className="text-left px-3 py-1.5 font-medium border-r border-zinc-100" colSpan={2}>항목</th>
                          <th className="text-right px-2 py-1.5 font-medium border-r border-zinc-100">기말잔액</th>
                          <th className="text-right px-2 py-1.5 font-medium border-r border-zinc-100">이자수익</th>
                          <th className="text-right px-2 py-1.5 font-medium border-r border-zinc-200">수익률</th>
                          <th className="text-right px-2 py-1.5 font-medium border-r border-zinc-100">기말잔액</th>
                          <th className="text-right px-2 py-1.5 font-medium border-r border-zinc-100">이자수익</th>
                          <th className="text-right px-2 py-1.5 font-medium">수익률</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td rowSpan={3} className="px-3 py-1.5 text-zinc-700 font-medium border-r border-zinc-100 align-top">예금</td>
                          <td className="px-2 py-1.5 text-zinc-600 border-r border-zinc-200">보통</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">41,449</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">49</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-200">1.1%</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">282,597</td>
                          <td className="text-right px-2 py-1.5 tabular-nums font-medium text-emerald-700 border-r border-zinc-100">383</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500">1.6%</td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="px-2 py-1.5 text-zinc-600 border-r border-zinc-200">수익성</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">31,090</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">445</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-200">2.9%</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">254,175</td>
                          <td className="text-right px-2 py-1.5 tabular-nums font-medium text-emerald-700 border-r border-zinc-100">1,339</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500">2.2%</td>
                        </tr>
                        <tr className="border-b border-zinc-200 bg-zinc-50 font-medium">
                          <td className="px-2 py-1.5 text-zinc-700 border-r border-zinc-200">계</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">72,539</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-800 border-r border-zinc-100">494</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-200">2.5%</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">536,772</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-emerald-700 border-r border-zinc-100">1,722</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500">2.0%</td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td colSpan={2} className="px-3 py-1.5 text-zinc-700 font-medium border-r border-zinc-200">신탁 (자사주 매입용)</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">6,540</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">37</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-200">—</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-400 border-r border-zinc-100">—</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-400 border-r border-zinc-100">—</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-400">—</td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td colSpan={2} className="px-3 py-1.5 text-zinc-700 font-medium border-r border-zinc-200">대여금</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">39,765</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">392</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-200">4.6%</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">56,368</td>
                          <td className="text-right px-2 py-1.5 tabular-nums font-medium text-emerald-700 border-r border-zinc-100">880</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500">4.6%</td>
                        </tr>
                        <tr className="border-b border-zinc-200 hover:bg-zinc-50">
                          <td className="px-3 py-1.5 text-zinc-700 font-medium border-r border-zinc-100">리스</td>
                          <td className="px-2 py-1.5 text-zinc-600 border-r border-zinc-200">보증금/전대</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">21,516</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">179</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-200">3.3%</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">18,285</td>
                          <td className="text-right px-2 py-1.5 tabular-nums font-medium text-emerald-700 border-r border-zinc-100">135</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500">2.9%</td>
                        </tr>
                        <tr className="border-b border-zinc-200 bg-blue-50 font-semibold">
                          <td colSpan={2} className="px-3 py-1.5 text-blue-800 border-r border-zinc-200">OC 별도 계</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-blue-700 border-r border-zinc-100">140,360</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-blue-800 border-r border-zinc-100">1,102</td>
                          <td className="text-right px-2 py-1.5 border-r border-zinc-200"></td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-blue-700 border-r border-zinc-100">611,425</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-blue-800 border-r border-zinc-100">2,737</td>
                          <td className="text-right px-2 py-1.5"></td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td rowSpan={2} className="px-3 py-1.5 text-zinc-600 border-r border-zinc-100 align-top text-[10px] leading-tight">기타<br/>(연결<br/>조정)</td>
                          <td className="px-2 py-1.5 text-zinc-600 border-r border-zinc-200">관계사 대여금</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-100">(39,765)</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">(392)</td>
                          <td className="text-right px-2 py-1.5 border-r border-zinc-200"></td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-500 border-r border-zinc-100">(56,368)</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">(880)</td>
                          <td className="text-right px-2 py-1.5"></td>
                        </tr>
                        <tr className="border-b border-zinc-200 hover:bg-zinc-50">
                          <td className="px-2 py-1.5 text-zinc-500 text-[10px] border-r border-zinc-200">연결 법인<br/><span className="text-zinc-400">중·홍·엔·ST</span></td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-400 text-[10px] border-r border-zinc-100">(중 229, 홍 40, 엔 20, ST 15)</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">304</td>
                          <td className="text-right px-2 py-1.5 border-r border-zinc-200"></td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-400 text-[10px] border-r border-zinc-100">(중 131, 홍 42, 엔 20, ST 5)</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-zinc-600 border-r border-zinc-100">199</td>
                          <td className="text-right px-2 py-1.5"></td>
                        </tr>
                        <tr className="bg-emerald-50 font-bold border-t-2 border-emerald-200">
                          <td colSpan={2} className="px-3 py-2 text-emerald-800 border-r border-zinc-200">연결 합계</td>
                          <td className="text-right px-2 py-2 border-r border-zinc-100 text-zinc-400">—</td>
                          <td className="text-right px-2 py-2 tabular-nums text-emerald-700 border-r border-zinc-100 text-sm">1,014</td>
                          <td className="text-right px-2 py-2 border-r border-zinc-200"></td>
                          <td className="text-right px-2 py-2 border-r border-zinc-100 text-zinc-400">—</td>
                          <td className="text-right px-2 py-2 tabular-nums text-emerald-700 border-r border-zinc-100 text-sm">2,057</td>
                          <td className="text-right px-2 py-2"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-200 text-[10px] text-zinc-500">
                    ※ 기말잔액 단위: 백만원 | 수익률: 연환산(x4) 기준 | 연결조정 관계사 대여금은 내부거래 제거
                  </div>
                </div>
              </div>
            )}

            {/* 외환손익 상세 — FY26 1Q FNF 외환손익 */}
            {selectedNonOpAccount === '외환손익' && (
              <div className="mt-4">
                <div className="max-w-[1600px] mx-auto space-y-4"><header className="bg-white rounded-lg shadow border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl md:text-2xl font-bold text-slate-900">FY26 1Q FNF 외환손익</h1><p className="text-xs text-slate-600 mt-0.5">기준일 <span className="font-semibold">2026-03-31</span></p></div></div></header><section className="grid grid-cols-2 md:grid-cols-4 gap-3"><div className="bg-white rounded-lg shadow border border-slate-200 p-4 flex flex-col gap-1"><div className="text-xs text-slate-500 font-medium">순외환손익 (26.1Q)</div><div className="flex items-baseline gap-1"><span className="text-2xl font-bold" style={{color:'#2563EB'}}>+144.04</span><span className="text-xs text-slate-500">억원</span></div><div className="text-xs text-slate-600">평가 +86.5 + 거래 +57.6</div><div className="text-xs font-medium" style={{color:'#2563EB'}}>YoY(vs 25.1Q) +177.6억</div></div><div className="bg-white rounded-lg shadow border border-slate-200 p-4 flex flex-col gap-1"><div className="text-xs text-slate-500 font-medium">평가손익 (미실현)</div><div className="flex items-baseline gap-1"><span className="text-2xl font-bold" style={{color:'#2563EB'}}>+86.47</span><span className="text-xs text-slate-500">억원</span></div><div className="text-xs text-slate-600">채권 +99.3 / 채무 -12.9</div><div className="text-xs font-medium" style={{color:'#2563EB'}}>잔액 702억 × Δrate</div></div><div className="bg-white rounded-lg shadow border border-slate-200 p-4 flex flex-col gap-1"><div className="text-xs text-slate-500 font-medium">거래손익 (실현)</div><div className="flex items-baseline gap-1"><span className="text-2xl font-bold" style={{color:'#2563EB'}}>+57.57</span><span className="text-xs text-slate-500">억원</span></div><div className="text-xs text-slate-600">채권 +56.2 / 채무 -5.1 / 기타 +6.4</div><div className="text-xs font-medium" style={{color:'#2563EB'}}>CNY 2,759억 수금 청산이익</div></div><div className="bg-white rounded-lg shadow border border-slate-200 p-4 flex flex-col gap-1"><div className="text-xs text-slate-500 font-medium">기말환율 QoQ</div><div className="flex items-baseline gap-1"><span className="text-2xl font-bold" style={{color:'#DC2626'}}>USD 1,513.4</span><span className="text-xs text-slate-500"></span></div><div className="text-xs text-slate-600">QoQ +5.47% · CNY 218.70 (+6.81%)</div><div className="text-xs font-medium" style={{color:'#DC2626'}}>HKD 193.15 · EUR 1,733.4 · TWD 47.21</div></div></section><section className="space-y-4"><div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><div className="bg-white rounded-lg shadow border border-slate-200 p-4 xl:order-2"><h2 className="text-sm font-bold text-slate-800 mb-2">분기별 외환손익 추이 (9분기)</h2><p className="text-[13px] text-slate-500 mb-2">막대: 평가/거래 손익 · 선: 순외환손익 / CNY 기말환율</p>{(() => { const fxData = [ {q:'24.1Q', 설가손익: 9.80, 거래손익: 2.05, 순외환손익: 11.85, CNY: 185.75}, {q:'24.2Q', 평가손익: 10.21, 거래손익: 6.88, 순외환손익: 17.09, CNY: 190.43}, {q:'24.3Q', 평가손익: -10.67,거래손익: 9.56, 순외환손익: -1.11, CNY: 188.74}, {q:'24.4Q', 평가손익: 20.75, 거래손익: 20.00, 순외환손익: 40.75, CNY: 201.27}, {q:'25.1Q', 평가손익: -1.76, 거래손익: -31.78,순외환손익: -33.54,CNY: 201.68}, {q:'25.2Q', 평가손익: -25.76,거래손익: -4.40, 순외환손익: -30.16,CNY: 189.16}, {q:'25.3Q', 평가손익: 17.67, 거래손익: 31.30, 순외환손익: 48.97, CNY: 196.82}, {q:'25.4Q', 평가손익: 6.89, 거래손익: 38.84, 순외환손익: 45.73, CNY: 204.76}, {q:'26.1Q', 평가손익: 86.47, 거래손익: 57.57, 순외환손익: 144.04,CNY: 218.70}, ]; return ( <ResponsiveContainer width="100%" height={240}> <ComposedChart data={fxData} margin={{top:8,right:44,left:-8,bottom:0}}> <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /> <XAxis dataKey="q" tick={{fontSize:10, fill:'#64748b'}} /> <YAxis yAxisId="left" tick={{fontSize:10, fill:'#64748b'}} tickFormatter={v=>`${v}억`} /> <YAxis yAxisId="right" orientation="right" domain={[160,240]} tick={{fontSize:9, fill:'#EF4444'}} tickFormatter={v=>v} /> <Tooltip formatter={(val, name) => name === 'CNY기말환율' ? [`${val}원`, name] : [`${val>0?'+':''}${Number(val).toFixed(2)}억`, name]} contentStyle={{fontSize:'11px'}} /> <Legend iconSize={10} wrapperStyle={{fontSize:'11px'}} /> <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeWidth={1} /> <Bar yAxisId="left" dataKey="평가손익" name="평가손익" fill="#3B82F6" maxBarSize={18} /> <Bar yAxisId="left" dataKey="거래손익" name="거래손익" fill="#10B981" maxBarSize={18} /> <Line yAxisId="left" type="monotone" dataKey="순외환손익" name="순외환손익" stroke="#f97316" strokeWidth={2} dot={{r:3, fill:'#f97316'}} /> <Line yAxisId="right" type="monotone" dataKey="CNY" name="CNY기말환율" stroke="#EF4444" strokeWidth={1.5} dot={{r:2}}  /> </ComposedChart> </ResponsiveContainer> ); })()}</div><div className="bg-white rounded-lg shadow border border-slate-200 p-4 xl:order-1"><h2 className="text-sm font-bold text-slate-800 mb-2">통화별 잔액 (억원) — 금융자산(예금+대여) · 채권(매출+미수) · 채무(매입+미지급)</h2><table className="w-full text-[13px]"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-1.5 py-1 text-left">통화</th><th className="px-1.5 py-1 text-right bg-purple-50">금융자산<br/>(예금+대여)</th><th className="px-1.5 py-1 text-right bg-blue-50">채권<br/>(매출+미수)</th><th className="px-1.5 py-1 text-right bg-rose-50">채무<br/>(매입+미지급)</th><th className="px-1.5 py-1 text-right">순<br/>(자산-부채)</th><th className="px-1.5 py-1 text-right text-[12px]">금융 25.4Q<br/>증감</th><th className="px-1.5 py-1 text-right text-[12px]">채권 25.4Q<br/>증감</th><th className="px-1.5 py-1 text-right text-[12px]">채무 25.4Q<br/>증감</th></tr></thead><tbody><tr className="border-b border-slate-100"><td className="px-1.5 py-1 font-medium" style={{color:'#3B82F6'}}>USD</td><td className="px-1.5 py-1 text-right tabular-nums bg-purple-50/40">1,137.8</td><td className="px-1.5 py-1 text-right tabular-nums bg-blue-50/40">71.6</td><td className="px-1.5 py-1 text-right tabular-nums bg-rose-50/40 text-rose-600">-389.4</td><td className="px-1.5 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+820.1</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+158.3<span className="block text-[11px] text-slate-500">자산↑</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+32.7<span className="block text-[11px] text-slate-500">채권↑</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+456.6<span className="block text-[11px] text-slate-500">채무↓</span></td></tr><tr className="border-b border-slate-100"><td className="px-1.5 py-1 font-medium" style={{color:'#EF4444'}}>CNY</td><td className="px-1.5 py-1 text-right tabular-nums bg-purple-50/40">1,128.2</td><td className="px-1.5 py-1 text-right tabular-nums bg-blue-50/40">225.9</td><td className="px-1.5 py-1 text-right tabular-nums bg-rose-50/40 text-rose-600">-0.0</td><td className="px-1.5 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+1354.0</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+1128.2<span className="block text-[11px] text-slate-500">자산↑</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#DC2626'}}>-533.7<span className="block text-[11px] text-slate-500">채권↓</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>-</td></tr><tr className="border-b border-slate-100"><td className="px-1.5 py-1 font-medium" style={{color:'#10B981'}}>HKD</td><td className="px-1.5 py-1 text-right tabular-nums bg-purple-50/40">-</td><td className="px-1.5 py-1 text-right tabular-nums bg-blue-50/40">342.9</td><td className="px-1.5 py-1 text-right tabular-nums bg-rose-50/40 text-rose-600">-</td><td className="px-1.5 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+342.9</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#0F172A'}}>-</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#DC2626'}}>-4.7<span className="block text-[11px] text-slate-500">채권↓</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#0F172A'}}>-</td></tr><tr className="border-b border-slate-100"><td className="px-1.5 py-1 font-medium" style={{color:'#8B5CF6'}}>EUR</td><td className="px-1.5 py-1 text-right tabular-nums bg-purple-50/40">11.6</td><td className="px-1.5 py-1 text-right tabular-nums bg-blue-50/40">4.6</td><td className="px-1.5 py-1 text-right tabular-nums bg-rose-50/40 text-rose-600">-0.2</td><td className="px-1.5 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+16.0</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+11.6<span className="block text-[11px] text-slate-500">자산↑</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+1.9<span className="block text-[11px] text-slate-500">채권↑</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+2.2<span className="block text-[11px] text-slate-500">채무↓</span></td></tr><tr className="border-b border-slate-100"><td className="px-1.5 py-1 font-medium" style={{color:'#EC4899'}}>TWD</td><td className="px-1.5 py-1 text-right tabular-nums bg-purple-50/40">-</td><td className="px-1.5 py-1 text-right tabular-nums bg-blue-50/40">56.7</td><td className="px-1.5 py-1 text-right tabular-nums bg-rose-50/40 text-rose-600">-</td><td className="px-1.5 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+56.6</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#0F172A'}}>-</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#DC2626'}}>-14.9<span className="block text-[11px] text-slate-500">채권↓</span></td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#0F172A'}}>-</td></tr><tr className="bg-slate-100 font-bold"><td className="px-1.5 py-1">합계</td><td className="px-1.5 py-1 text-right tabular-nums bg-purple-100">2,277.7</td><td className="px-1.5 py-1 text-right tabular-nums bg-blue-100">701.6</td><td className="px-1.5 py-1 text-right tabular-nums bg-rose-100 text-rose-600">-389.6</td><td className="px-1.5 py-1 text-right tabular-nums" style={{color:'#2563EB'}}>+2589.7</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+1298.2</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#DC2626'}}>-518.7</td><td className="px-1.5 py-1 text-right tabular-nums text-[12px]" style={{color:'#2563EB'}}>+458.8</td></tr></tbody></table><p className="text-[12px] text-slate-500 mt-2"><span className="font-semibold">증감 표시 규약</span>: 자산(금융·채권) ↑ = 파랑(+), ↓ = 빨강(-) / 채무 ↓ = 파랑(+, 부채 감소·긍정), ↑ = 빨강(-, 부채 증가·부정)</p></div></div><div className="bg-white rounded-lg shadow border border-slate-200 p-4"><div className="flex items-center justify-between mb-2"><h2 className="text-sm font-bold text-slate-800">일별 환율 추이 ({fxRateData.length || 547}일)</h2><div className="flex gap-2 flex-wrap">{[{k:'USD',color:'#3B82F6'},{k:'CNY',color:'#EF4444'},{k:'HKD',color:'#10B981'},{k:'EUR',color:'#8B5CF6'},{k:'TWD',color:'#EC4899'}].map(({k,color})=>(<label key={k} className="flex items-center gap-1 text-[13px] cursor-pointer"><input type="checkbox" className="h-3 w-3" style={{accentColor:color}} checked={fxVisible[k]} onChange={()=>setFxVisible(v=>({...v,[k]:!v[k]}))}/><span className="font-medium" style={{color}}>{k}</span></label>))}</div></div><p className="text-[13px] text-slate-500 mb-2">X축: 연월 표기(월 1일 기준) · 툴팁: 일자별 환율 · 25.12.31 Reference Line(25.4Q 기말)</p><ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={fxRateData} margin={{top:4, right:8, left:0, bottom:30}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                        <XAxis dataKey="date"
                          ticks={fxRateData.filter(d => d.date.slice(8)==='01').map(d => d.date)}
                          tickFormatter={d => d.slice(2,7).replace('-','.')}
                          tick={{fontSize:9, angle:-45, textAnchor:'end', dy:4, dx:-4}} interval={0}/>
                        <YAxis yAxisId="left" domain={['auto','auto']} tick={{fontSize:10}} width={55}
                          tickFormatter={v => v.toLocaleString()}/>
                        <YAxis yAxisId="right" orientation="right" domain={['auto','auto']} tick={{fontSize:10}} width={40}
                          tickFormatter={v => v.toFixed(0)}/>
                        <Tooltip content={({active,payload,label}) => {
                          if (!active || !payload?.length) return null;
                          return (<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:6,padding:'6px 10px',fontSize:11}}>
                            <div style={{fontWeight:600,marginBottom:4,color:'#475569'}}>{label}</div>
                            {payload.map(p => p.value != null && <div key={p.dataKey} style={{color:p.color}}>{p.dataKey}: {p.value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>)}
                          </div>);
                        }}/>
                        <ReferenceLine yAxisId="left" x="2025-12-31" stroke="#F59E0B" strokeDasharray="4 2"
                          label={{value:'25.4Q말', position:'insideTopRight', fontSize:9, fill:'#F59E0B'}}/>
                        {fxVisible.USD && <Line yAxisId="left" type="monotone" dataKey="USD" stroke="#3B82F6" dot={false} strokeWidth={1.5} connectNulls/>}
                        {fxVisible.EUR && <Line yAxisId="left" type="monotone" dataKey="EUR" stroke="#8B5CF6" dot={false} strokeWidth={1.5} connectNulls/>}
                        {fxVisible.CNY && <Line yAxisId="right" type="monotone" dataKey="CNY" stroke="#EF4444" dot={false} strokeWidth={1.5} connectNulls/>}
                        {fxVisible.HKD && <Line yAxisId="right" type="monotone" dataKey="HKD" stroke="#10B981" dot={false} strokeWidth={1.5} connectNulls/>}
                        {fxVisible.TWD && <Line yAxisId="right" type="monotone" dataKey="TWD" stroke="#EC4899" dot={false} strokeWidth={1.5} connectNulls/>}
                      </ComposedChart>
                    </ResponsiveContainer>
                    <p className="text-[12px] text-slate-500 mt-1">USD/EUR: 좌측축 · CNY/HKD/TWD: 우측축 (값 범위 차이 고려)</p></div></section><section className="bg-white rounded-lg shadow border border-slate-200 p-4"><h2 className="text-sm font-bold text-slate-800 mb-2">① 거래손익 상세 (억원 · 실현) — 통화×구분(채권/채무) · 청산금액 · 장부환율 vs 결제환율 · 25.1Q YoY</h2><div className="overflow-x-auto"><table className="w-full text-[13px]"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-1.5 py-1 text-left border border-slate-200">통화</th><th className="px-1.5 py-1 text-left border border-slate-200">구분</th><th className="px-1.5 py-1 text-right border border-slate-200">청산금액<br/>(외화 M)</th><th className="px-1.5 py-1 text-right border border-slate-200">청산금액<br/>(억 KRW)</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">장부환율<br/>(invoice)</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">결제환율<br/>(결제)</th><th className="px-1.5 py-1 text-right border border-slate-200">Δ환율<br/>(%)</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-yellow-50">26.1Q<br/>거래손익</th><th className="px-1.5 py-1 text-right border border-slate-200">25.1Q<br/>거래손익</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-emerald-50">YoY<br/>차이</th><th className="px-1.5 py-1 text-left border border-slate-200">비고</th></tr></thead><tbody><tr className="border-b border-slate-100"><td rowSpan="3" className="px-1.5 py-1 font-bold border border-slate-200 align-middle text-center text-sm" style={{color:'#3B82F6'}}>USD</td><td className="px-1.5 py-1 border border-slate-100 font-medium text-blue-700">채권 회수<br/><span className="text-[11px] text-slate-500 font-normal">매출+미수</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">6.79</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">98.4</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">923.83</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,448.57</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+56.80%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+35.63</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#2563EB'}}>+6.78</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+28.85</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매출 +35.59 / 미수 +0.04</td></tr><tr className="border-b border-slate-200"><td className="px-1.5 py-1 border border-slate-100 font-medium text-rose-700">채무 지급<br/><span className="text-[11px] text-slate-500 font-normal">매입+미지급</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">84.53</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-rose-600">-1,234.9</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,452.66</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,460.89</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+0.57%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#DC2626'}}>-6.96</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#DC2626'}}>-13.21</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+6.25</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매입 -0.74 / 미지급 -6.22</td></tr><tr className="border-b border-slate-200 bg-purple-50/40"><td className="px-1.5 py-1 border border-slate-100 font-medium text-purple-700">대여금 회수<br/><span className="text-[11px] text-slate-500 font-normal">STO대여금 회수</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">18.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">258.3</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,434.90</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,513.40</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#DC2626'}}>+5.47%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+2.84</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#0F172A'}}>0.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+2.84</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-purple-700">STO대여금 회수</td></tr><tr className="border-b border-slate-100"><td rowSpan="2" className="px-1.5 py-1 font-bold border border-slate-200 align-middle text-center text-sm" style={{color:'#EF4444'}}>CNY</td><td className="px-1.5 py-1 border border-slate-100 font-medium text-blue-700">채권 회수<br/><span className="text-[11px] text-slate-500 font-normal">매출+미수</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">1,326.52</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">2,759.3</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">206.07</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">208.01</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+0.94%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+25.75</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#DC2626'}}>-37.76</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+63.51</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매출 +25.75 / 미수 0.00</td></tr><tr className="border-b border-slate-200"><td className="px-1.5 py-1 border border-slate-100 font-medium text-rose-700">채무 지급<br/><span className="text-[11px] text-slate-500 font-normal">매입+미지급</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-rose-600">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#0F172A'}}>-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#0F172A'}}>-0.01</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#0F172A'}}>0.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#0F172A'}}>-0.01</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매입 0.00 / 미지급 -0.01</td></tr><tr className="bg-amber-50 cursor-pointer hover:bg-amber-100 border-b border-amber-200"><td className="px-1.5 py-1 font-bold border border-amber-300 text-amber-900 text-center text-sm">▶ 기타</td><td className="px-1.5 py-1 border border-amber-200 font-medium text-amber-800 text-[13px]">HKD·EUR·TWD 통합<br/><span className="text-[11px] text-slate-500 font-normal">클릭: 통화별 펼치기</span></td><td className="px-1.5 py-1 text-right border border-amber-200 text-[12px] text-slate-500">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200">140.4</td><td colSpan="3" className="px-1.5 py-1 text-right border border-amber-200 text-[12px] text-slate-500">청산금액 합산</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200 bg-yellow-50/60 font-semibold" style={{color:'#DC2626'}}>-0.50</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200" style={{color:'#2563EB'}}>+2.12</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200 bg-emerald-50/40 font-semibold" style={{color:'#DC2626'}}>-2.62</td><td className="px-1.5 py-1 border border-amber-200 text-[12px] text-slate-600">채권+채무+대여금 통합</td></tr><tr className="bg-blue-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-blue-800">합계 · 채권 회수</td><td className="px-1.5 py-1 text-right border border-slate-200">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200">2,998.1</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">매출+미수 GL 분해</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#2563EB'}}>+60.92</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200" style={{color:'#DC2626'}}>-29.36</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#2563EB'}}>+90.28</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">CNY/USD/HKD/TWD 청산</td></tr><tr className="bg-rose-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-rose-800">합계 · 채무 지급</td><td className="px-1.5 py-1 text-right border border-slate-200">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 text-rose-600">-1,234.9</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">매입+미지급 GL 분해</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#DC2626'}}>-7.01</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200" style={{color:'#DC2626'}}>-12.71</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#2563EB'}}>+5.70</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">USD 매입채무 지급 중심</td></tr><tr className="bg-purple-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-purple-800">합계 · 대여금 회수</td><td className="px-1.5 py-1 text-right border border-slate-200">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200">-</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">STO대여금 회수 (USD 분개 + KRW 분개 통합 → USD 귀속)</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#2563EB'}}>+2.84</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200" style={{color:'#0F172A'}}>0.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#2563EB'}}>+2.84</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">USD 18M (전 USD 귀속)</td></tr><tr className="bg-amber-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-amber-800">기타 (선수금·금융상품·KRW 잔여)</td><td colSpan="5" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">대여금 분리 후 잔여분 (CNY 선수금·USD 금융상품 등)</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#2563EB'}}>+6.41</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 text-slate-400">N/A</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#2563EB'}}>+6.41</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">선수금 회계처리 등</td></tr><tr className="bg-yellow-100 font-bold"><td colSpan="7" className="px-1.5 py-1 border border-slate-300">순 거래손익 (실현)</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300 text-base" style={{color:'#2563EB'}}>+57.57</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300">-31.78</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300 text-base" style={{color:'#2563EB'}}>+89.35</td><td className="px-1.5 py-1 border border-slate-300 text-[12px]">YoY +89.3억 개선</td></tr></tbody></table></div><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]"><div className="p-2 bg-blue-50 rounded border border-blue-200"><div className="font-bold text-blue-700 mb-1">채권 회수 (CNY 2,759억 중심)</div><ul className="text-[12px] pl-3 list-disc"><li>CNY: 1,326M FX 청산 → 결제환율 208.01 vs 장부 206.07 → +25.8억</li><li>USD: 6.8M FX 청산 → +35.6억 (KRW 약세 기여)</li><li>HKD: 40.6M / TWD: 140M 청산</li></ul></div><div className="p-2 bg-rose-50 rounded border border-rose-200"><div className="font-bold text-rose-700 mb-1">채무 지급 (USD 매입채무 84M)</div><ul className="text-[12px] pl-3 list-disc"><li>USD: 84.5M 매입채무 지급 → 결제환율 1,460.89 vs 장부 1,452.66 → -6.96억</li><li>26.1Q USD 환율 상승 국면 결제 → 환손실 발생</li></ul><div className="font-bold text-purple-700 mt-2 mb-1">대여금 회수 (USD STO 18M 회수)</div><ul className="text-[12px] pl-3 list-disc"><li>STO대여금 회수(2000033) USD 18M · 장부 KRW 25,828,200,000(1,434.90) · 결제환율 1,513.40 → <span className="font-bold">외환차익 +6.31억</span></li></ul></div><div className="p-2 bg-emerald-50 rounded border border-emerald-200"><div className="font-bold text-emerald-700 mb-1">YoY +89.3억 개선 원인</div><ul className="text-[12px] pl-3 list-disc"><li>25.1Q CNY 결제 환율 하락 → -27.2억 손실</li><li>26.1Q CNY 결제 환율 상승 → +27.6억 이익 (반전)</li><li>USD: 25.1Q -8.5억 → 26.1Q +24.0억 (+32.5억 개선)</li></ul></div></div><p className="text-[12px] text-slate-500 mt-2"><span className="font-semibold">계산 규약:</span> 청산금액 = 변제채권/채무 raw PK17(매출)·PK27(매입) FX·KRW 합산 · 장부환율 = 결제환율 - (거래손익/청산FX) 역산 · 거래손익 = 외환차익/차손 분기필터 GL 카테고리 합산 (이익=+, 손실=-)</p></section><section className="bg-white rounded-lg shadow border border-slate-200 p-4"><h2 className="text-sm font-bold text-slate-800 mb-2">② 평가손익 상세 (억원 · 미실현) — 영업자산(매출+미수) · <span className="text-purple-700">금융자산(예금+대여)</span> · 영업부채(매입+미지급) · 25.1Q YoY</h2><div className="overflow-x-auto"><table className="w-full text-[13px]"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-1.5 py-1 text-left border border-slate-200">통화</th><th className="px-1.5 py-1 text-left border border-slate-200">구분</th><th className="px-1.5 py-1 text-right border border-slate-200">잔액<br/>(외화 M)</th><th className="px-1.5 py-1 text-right border border-slate-200">잔액<br/>(억 KRW)</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">장부환율<br/>(25.4Q)</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">평가환율<br/>(26.1Q)</th><th className="px-1.5 py-1 text-right border border-slate-200">Δ환율<br/>(%)</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-yellow-50">26.1Q<br/>평가손익</th><th className="px-1.5 py-1 text-right border border-slate-200">25.1Q<br/>평가손익</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-emerald-50">YoY<br/>차이</th><th className="px-1.5 py-1 text-left border border-slate-200">비고</th></tr></thead><tbody><tr className="border-b border-slate-100"><td rowSpan="3" className="px-1.5 py-1 font-bold border border-slate-200 align-middle text-center text-sm" style={{color:'#3B82F6'}}>USD</td><td className="px-1.5 py-1 border border-slate-100 font-medium text-blue-700">영업자산<br/><span className="text-[11px] text-slate-500 font-normal">매출+미수</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">4.91</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">71.6</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,434.90</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,513.40</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+5.47%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+2.98</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#DC2626'}}>-1.41</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+4.39</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매출 +2.88 / 미수 +0.10</td></tr><tr className="border-b border-slate-100 bg-purple-50/30"><td className="px-1.5 py-1 border border-slate-100 font-medium text-purple-700">금융자산<br/><span className="text-[11px] text-slate-500 font-normal">예금+대여</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">78.17</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">1,137.8</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40 text-[12px] text-slate-600">예 1,446.37<br/>대 1,482.18</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,513.40</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+5.47%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+54.70</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-slate-400">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+54.70</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">예금 +39.00 / 대여 +15.70</td></tr><tr className="border-b border-slate-200"><td className="px-1.5 py-1 border border-slate-100 font-medium text-rose-700">영업부채<br/><span className="text-[11px] text-slate-500 font-normal">매입+미지급</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">26.57</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-rose-600">-389.4</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,434.90</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">1,513.40</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+5.47%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#DC2626'}}>-12.85</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#2563EB'}}>+13.82</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#DC2626'}}>-26.67</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매입 -8.28 / 미지급 -4.57</td></tr><tr className="border-b border-slate-100"><td rowSpan="3" className="px-1.5 py-1 font-bold border border-slate-200 align-middle text-center text-sm" style={{color:'#EF4444'}}>CNY</td><td className="px-1.5 py-1 border border-slate-100 font-medium text-blue-700">영업자산<br/><span className="text-[11px] text-slate-500 font-normal">매출+미수</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">105.91</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">225.9</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">204.76</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">218.70</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+6.81%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+5.41</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#2563EB'}}>+1.22</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+4.19</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매출 +4.64 / 미수 +0.77</td></tr><tr className="border-b border-slate-100 bg-purple-50/30"><td className="px-1.5 py-1 border border-slate-100 font-medium text-purple-700">금융자산<br/><span className="text-[11px] text-slate-500 font-normal">예금+대여</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">524.22</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">1,128.2</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40 text-[12px] text-slate-600">예 215.23</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">218.70</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+6.81%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+18.21</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-slate-400">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+18.21</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">예금 +18.21 / 대여 0.00</td></tr><tr className="border-b border-slate-200"><td className="px-1.5 py-1 border border-slate-100 font-medium text-rose-700">영업부채<br/><span className="text-[11px] text-slate-500 font-normal">매입+미지급</span></td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100">0.02</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-rose-600">-0.0</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">204.76</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-sky-50/40">218.70</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 text-xs" style={{color:'#2563EB'}}>+6.81%</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50/60 font-semibold" style={{color:'#0F172A'}}>0.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100" style={{color:'#0F172A'}}>0.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-emerald-50/40 font-semibold" style={{color:'#0F172A'}}>0.00</td><td className="px-1.5 py-1 border border-slate-100 text-[12px] text-slate-500">매입 0.00 / 미지급 0.00</td></tr><tr className="bg-amber-50 cursor-pointer hover:bg-amber-100 border-b border-amber-200"><td className="px-1.5 py-1 font-bold border border-amber-300 text-amber-900 text-center text-sm">▶ 기타</td><td className="px-1.5 py-1 border border-amber-200 font-medium text-amber-800 text-[13px]">HKD·EUR·TWD 통합<br/><span className="text-[11px] text-slate-500 font-normal">클릭: 통화별 펼치기</span></td><td className="px-1.5 py-1 text-right border border-amber-200 text-[12px] text-slate-500">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200">415.6</td><td colSpan="3" className="px-1.5 py-1 text-right border border-amber-200 text-[12px] text-slate-500">잔액 합산 (자산-부채)</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200 bg-yellow-50/60 font-semibold" style={{color:'#2563EB'}}>+18.02</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200" style={{color:'#DC2626'}}>-45.50</td><td className="px-1.5 py-1 text-right tabular-nums border border-amber-200 bg-emerald-50/40 font-semibold" style={{color:'#2563EB'}}>+63.52</td><td className="px-1.5 py-1 border border-amber-200 text-[12px] text-slate-600">영업+금융+부채 통합</td></tr><tr className="bg-blue-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-blue-800">합계 · 영업자산</td><td className="px-1.5 py-1 text-right border border-slate-200">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200">701.6</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">매출채권+미수금 (외화채권 파일)</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#2563EB'}}>+26.43</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200">-45.66</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#2563EB'}}>+72.09</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">매출 +25.54 / 미수 +0.88</td></tr><tr className="bg-purple-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-purple-800">합계 · 금융자산</td><td className="px-1.5 py-1 text-right border border-slate-200">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200">2,277.7</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">외화예금+외화대여금 (별도 파일)</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#2563EB'}}>+72.91</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 text-slate-400">N/A</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#2563EB'}}>+72.91</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">예금 +57.21 / 대여 +15.70</td></tr><tr className="bg-rose-50 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-200 text-rose-800">합계 · 영업부채</td><td className="px-1.5 py-1 text-right border border-slate-200">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 text-rose-600">-389.6</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-200 text-xs text-slate-500">매입채무+미지급 (외화채무 파일)</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-yellow-50" style={{color:'#DC2626'}}>-12.87</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200">+13.79</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-200 bg-emerald-50" style={{color:'#DC2626'}}>-26.66</td><td className="px-1.5 py-1 border border-slate-200 text-[12px] text-slate-500">매입 -8.28 / 미지급 -4.58</td></tr><tr className="bg-yellow-100 font-bold"><td colSpan="2" className="px-1.5 py-1 border border-slate-300">순 평가손익</td><td className="px-1.5 py-1 text-right border border-slate-300">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300">+2589.7</td><td colSpan="3" className="px-1.5 py-1 text-right border border-slate-300 text-xs">-</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300 text-base" style={{color:'#2563EB'}}>+86.47</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300">-1.76</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-300 text-base" style={{color:'#2563EB'}}>+88.23</td><td className="px-1.5 py-1 border border-slate-300 text-[12px]">26.1Q 총순익 +144.0억 · 평가 비중 60%</td></tr></tbody></table></div><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]"><div className="p-2 bg-blue-50 rounded border border-blue-200"><div className="font-bold text-blue-700 mb-1">영업자산 +26.43억 구성</div><ul className="text-[12px] pl-3 list-disc"><li>매출채권 +25.54억 (HKD 16.56·CNY 4.64·USD 2.88·TWD 1.37·EUR 0.09)</li><li>미수금 +0.88억 (CNY 0.77·USD 0.10·EUR 0.01)</li></ul></div><div className="p-2 bg-purple-50 rounded border border-purple-200"><div className="font-bold text-purple-700 mb-1">금융자산 +72.91억 구성</div><ul className="text-[12px] pl-3 list-disc"><li>보통예금 +57.21억 (<span className="font-bold">USD 39.00 + CNY 18.21</span>)</li><li>대여금 +15.70억 (<span className="font-bold">USD STO대여금 18M</span>)</li><li className="text-purple-600">잔액: USD 78.2M+20M / CNY 524M / EUR 0.9M</li></ul></div><div className="p-2 bg-rose-50 rounded border border-rose-200"><div className="font-bold text-rose-700 mb-1">영업부채 -12.87억 구성</div><ul className="text-[12px] pl-3 list-disc"><li>매입채무 -8.28억 (USD 전액)</li><li>미지급 -4.58억 (USD -4.57·EUR -0.01)</li><li className="text-emerald-700 font-semibold">순 평가손익 = +86.47억</li></ul></div></div></section><section className="bg-white rounded-lg shadow border border-slate-200 p-4"><h2 className="text-sm font-bold text-slate-800 mb-2">③ 25.1Q vs 26.1Q 차이 분석 (YoY)</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><table className="w-full text-[13px]"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-2 py-1 text-left">항목</th><th className="px-2 py-1 text-right">25.1Q</th><th className="px-2 py-1 text-right">26.1Q</th><th className="px-2 py-1 text-right">증감</th></tr></thead><tbody><tr className="border-b border-slate-100"><td className="px-2 py-1">채권 잔액 (기말)</td><td className="px-2 py-1 text-right tabular-nums">0.0</td><td className="px-2 py-1 text-right tabular-nums">701.6</td><td className="px-2 py-1 text-right tabular-nums" style={{color:'#2563EB'}}>+701.5</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1">채무 잔액 (기말)</td><td className="px-2 py-1 text-right tabular-nums text-rose-600">-0.0</td><td className="px-2 py-1 text-right tabular-nums text-rose-600">-389.6</td><td className="px-2 py-1 text-right tabular-nums" style={{color:'#DC2626'}}>-389.6</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1">USD 환율 QoQ</td><td className="px-2 py-1 text-right tabular-nums">-0.24%</td><td className="px-2 py-1 text-right tabular-nums text-rose-600">+5.47%</td><td className="px-2 py-1 text-right tabular-nums text-xs text-slate-500">KRW 약세 전환</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1">CNY 환율 QoQ</td><td className="px-2 py-1 text-right tabular-nums">+0.20%</td><td className="px-2 py-1 text-right tabular-nums text-rose-600">+6.81%</td><td className="px-2 py-1 text-right tabular-nums text-xs text-slate-500">일제 약세</td></tr><tr className="border-b border-slate-200 bg-slate-50"><td className="px-2 py-1 font-semibold">평가손익</td><td className="px-2 py-1 text-right tabular-nums">-1.76</td><td className="px-2 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+86.47</td><td className="px-2 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+88.23</td></tr><tr className="border-b border-slate-200 bg-slate-50"><td className="px-2 py-1 font-semibold">거래손익</td><td className="px-2 py-1 text-right tabular-nums">-31.78</td><td className="px-2 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+57.57</td><td className="px-2 py-1 text-right tabular-nums font-semibold" style={{color:'#2563EB'}}>+89.35</td></tr><tr className="bg-yellow-50 font-bold"><td className="px-2 py-1">순외환손익</td><td className="px-2 py-1 text-right tabular-nums">-33.54</td><td className="px-2 py-1 text-right tabular-nums" style={{color:'#2563EB'}}>+144.04</td><td className="px-2 py-1 text-right tabular-nums" style={{color:'#2563EB'}}>+177.58</td></tr></tbody></table><div className="space-y-2 text-[12px] text-slate-700"><div className="p-3 bg-rose-50 rounded border border-rose-200"><div className="font-bold text-rose-700 mb-1">📉 25.1Q (순손익 -33.5억) 원인</div><ul className="list-disc pl-4 space-y-0.5 text-[13px]"><li>USD QoQ -0.2%·CNY +0.2% 환율 <span className="font-semibold">거의 무변동</span> → 평가손익 -1.76억 소폭</li><li>CNY 결제 시점 환율 하락(-28.4억) → 거래손실 실현</li><li>USD 채무 결제에서도 환손실 -12.7억</li></ul></div><div className="p-3 bg-emerald-50 rounded border border-emerald-200"><div className="font-bold text-emerald-700 mb-1">📈 26.1Q (순손익 +144.0억) 원인</div><ul className="list-disc pl-4 space-y-0.5 text-[13px]"><li><span className="font-semibold">KRW 일제 약세 전환</span>: USD +5.5%·CNY +6.8%·HKD +4.7% → 평가이익 +86.5억</li><li>CNY 2,759억 수금 과정 결제환율 &gt; 장부환율(25.4Q 204.76) → 거래이익 +27.6억</li><li>USD 채권 회수이익 +30.9억 (채무손실 -6.9억 상쇄)</li></ul></div><div className="p-3 bg-sky-50 rounded border border-sky-200"><div className="font-bold text-sky-700 mb-1">💡 핵심 전환</div><p className="text-[13px]">25.1Q 대비 <span className="font-bold">+177.6억 개선</span> = 환율 방향 전환(-0.2%→+5.5%) × 잔액 규모 유지 + CNY 결제 방향 반전.<br/>26.2Q는 기말환율(USD 1,513원) 대비 환율 움직임에 따라 방향 결정 → 현 순포지션 312억에서 환율 1% 변동 시 약 <span className="font-semibold">±3.1억</span> 변동.</p></div></div></div></section><section className="bg-white rounded-lg shadow border border-slate-200 p-4"><h2 className="text-sm font-bold text-slate-800 mb-2">④ 환율 기말 · 평균 전분기 비교 (KRW 기준 · 매매기준율 · 24.1Q~26.1Q)</h2><p className="text-[13px] text-slate-600 mb-2"><span className="font-semibold">기말환율</span>: 분기 마지막 영업일 매매기준율 (예: 26.1Q = 2026-03-31) ·<span className="font-semibold ml-2">평균환율</span>: 해당 분기 <span className="font-bold text-blue-700">3개월 일별 환율 단순평균</span>(예: 26.1Q = 2026-01-01 ~ 03-31 일별 매매기준율 평균, 누계 아님)</p><div className="overflow-x-auto"><table className="w-full text-[13px]"><thead className="bg-slate-100"><tr><th rowSpan="2" className="px-2 py-1 text-left border border-slate-200">통화</th><th colSpan="9" className="px-2 py-1 text-center border border-slate-200 bg-sky-50">기말환율 (원)</th></tr><tr><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">24.1Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">24.2Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">24.3Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">24.4Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">25.1Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">25.2Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">25.3Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">25.4Q</th><th className="px-1.5 py-1 text-right border border-slate-200 bg-sky-50">26.1Q</th></tr></thead><tbody><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200" style={{color:'#3B82F6'}}>USD 기말</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,346.80</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,389.20</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,319.60</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,470.00</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,466.50</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,356.40</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,402.20</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,434.90</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50 font-bold">1,513.40</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200" style={{color:'#EF4444'}}>CNY 기말</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">185.75</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">190.43</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">188.74</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">201.27</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">201.68</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">189.16</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">196.82</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">204.76</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50 font-bold">218.70</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200" style={{color:'#10B981'}}>HKD 기말</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">172.10</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">177.90</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">169.76</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">189.30</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">188.53</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">172.80</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">180.15</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">184.41</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50 font-bold">193.15</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200" style={{color:'#8B5CF6'}}>EUR 기말</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,452.93</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,487.07</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,474.06</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,528.73</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,587.85</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,591.80</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,644.50</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">1,685.72</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50 font-bold">1,733.37</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200" style={{color:'#EC4899'}}>TWD 기말</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">42.13</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">42.71</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">41.77</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">44.81</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">44.17</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">46.60</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">46.01</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 ">45.91</td><td className="px-1.5 py-1 text-right tabular-nums border border-slate-100 bg-yellow-50 font-bold">47.21</td></tr><tr><td colSpan="10" className="h-1 bg-slate-100"></td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200 text-slate-600">USD 평균</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,328.45</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,370.91</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,359.38</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,396.84</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,452.66</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,404.04</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,385.28</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,450.98</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 bg-yellow-50">1,465.16</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200 text-slate-600">CNY 평균</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">184.56</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">188.93</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">189.23</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">193.98</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">199.33</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">193.99</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">193.54</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">204.65</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 bg-yellow-50">211.61</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200 text-slate-600">HKD 평균</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">169.88</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">175.36</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">174.27</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">179.67</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">186.73</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">179.93</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">177.12</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">186.56</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 bg-yellow-50">187.54</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200 text-slate-600">EUR 평균</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,443.10</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,475.88</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,491.65</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,489.10</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,529.33</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,589.40</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,619.25</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">1,688.27</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 bg-yellow-50">1,713.75</td></tr><tr className="border-b border-slate-100"><td className="px-2 py-1 font-medium border border-slate-200 text-slate-600">TWD 평균</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">42.27</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">42.40</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">42.05</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">43.19</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">44.18</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">45.40</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">46.29</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 ">46.70</td><td className="px-1.5 py-1 text-right tabular-nums text-slate-500 border border-slate-100 bg-yellow-50">46.31</td></tr></tbody></table></div><div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[13px]"><div className="p-2 bg-rose-50 rounded border border-rose-200"><span className="font-bold text-rose-700">USD QoQ +5.5%</span>: 1,434.9 → 1,513.4 · 평균 1,451.0 → 1,465.2</div><div className="p-2 bg-rose-50 rounded border border-rose-200"><span className="font-bold text-rose-700">CNY QoQ +6.8%</span>: 204.76 → 218.70 · 평균 204.65 → 211.61</div><div className="p-2 bg-rose-50 rounded border border-rose-200"><span className="font-bold text-rose-700">HKD QoQ +4.7%</span>: 184.41 → 193.15 · 평균 186.56 → 187.54</div><div className="p-2 bg-rose-50 rounded border border-rose-200"><span className="font-bold text-rose-700">TWD QoQ +2.8%</span>: 45.91 → 47.21 · 평균 46.70 → 46.31</div></div></section><footer className="text-[12px] text-slate-500 text-center pt-2">FY26 1Q FNF 외환손익</footer></div>
              </div>
            )}

                        {/* 선물환손익 상세 테이블 - 구성상세 하단 */}
            {selectedNonOpAccount === '선물환손익' && (
              <div className="mt-5 space-y-4">
                {/* 파생상품 거래손익 테이블 */}
                <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="bg-zinc-50 px-3 py-2 border-b border-zinc-200 flex justify-between items-center">
                    <div>
                      <span className="text-sm font-semibold text-zinc-800">[파생상품 거래손익]</span>
                      <span className="text-xs text-zinc-500 ml-2">CNY 선물환 계약 기준</span>
                    </div>
                    <span className="text-xs text-zinc-500">CNY: 천 단위 | KRW: 백만원</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-100 border-b border-zinc-200">
                          <th rowSpan={2} className="text-center px-3 py-2 font-semibold text-zinc-700 border-r border-zinc-200 w-[90px]">구분</th>
                          <th colSpan={3} className="text-center px-1 py-1.5 font-semibold text-zinc-600 border-r border-zinc-300 bg-zinc-100">24.4Q</th>
                          <th colSpan={3} className="text-center px-1 py-1.5 font-semibold text-zinc-700 bg-zinc-50">25.4Q</th>
                        </tr>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-xs">
                          <th className="text-center px-2 py-2 font-medium text-zinc-600 w-[80px]">USD계약</th>
                          <th className="text-center px-2 py-2 font-medium text-zinc-600 w-[80px]">KRW계약</th>
                          <th className="text-center px-2 py-2 font-semibold text-zinc-700 border-r border-zinc-300 w-[80px]">계</th>
                          <th className="text-center px-2 py-2 font-medium text-zinc-600 w-[80px]">USD계약</th>
                          <th className="text-center px-2 py-2 font-medium text-zinc-600 w-[80px]">KRW계약</th>
                          <th className="text-center px-2 py-2 font-semibold text-zinc-700 w-[80px]">계</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="text-center px-3 py-2 text-zinc-700 font-medium border-r border-zinc-200">계약(CNY)</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">186,000</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">58,900</td>
                          <td className="text-right px-2 py-2 text-zinc-700 tabular-nums font-medium border-r border-zinc-300">244,900</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">380,000</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">479,000</td>
                          <td className="text-right px-2 py-2 text-zinc-800 tabular-nums font-semibold">859,000</td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="text-center px-3 py-2 text-zinc-700 font-medium border-r border-zinc-200">계약환율</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">7.13</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">189.67</td>
                          <td className="text-right px-2 py-2 text-zinc-400 tabular-nums border-r border-zinc-300">-</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">7.09</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">199.55</td>
                          <td className="text-right px-2 py-2 text-zinc-400 tabular-nums">-</td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="text-center px-3 py-2 text-zinc-700 font-medium border-r border-zinc-200">만기환율</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">7.22</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">194.22</td>
                          <td className="text-right px-2 py-2 text-zinc-400 tabular-nums border-r border-zinc-300">-</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">7.06</td>
                          <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">204.62</td>
                          <td className="text-right px-2 py-2 text-zinc-400 tabular-nums">-</td>
                        </tr>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="text-center px-3 py-2 text-zinc-700 font-medium border-r border-zinc-200">환율변동</td>
                          <td className="text-right px-2 py-2 text-blue-600 tabular-nums font-medium">+1.3%</td>
                          <td className="text-right px-2 py-2 text-blue-600 tabular-nums font-medium">+2.4%</td>
                          <td className="text-right px-2 py-2 text-zinc-400 tabular-nums border-r border-zinc-300">-</td>
                          <td className="text-right px-2 py-2 text-rose-600 tabular-nums font-medium">-0.4%</td>
                          <td className="text-right px-2 py-2 text-blue-600 tabular-nums font-medium">+2.5%</td>
                          <td className="text-right px-2 py-2 text-zinc-400 tabular-nums">-</td>
                        </tr>
                        {/* 손익 합계 */}
                        <tr className="bg-zinc-100 font-semibold">
                          <td className="text-center px-3 py-2 text-zinc-800 border-r border-zinc-200">손익(KRW)</td>
                          <td className="text-right px-2 py-2 text-zinc-700 tabular-nums">{formatNumber(437)}</td>
                          <td className="text-right px-2 py-2 text-rose-600 tabular-nums">({formatNumber(268)})</td>
                          <td className="text-right px-2 py-2 text-zinc-700 tabular-nums font-semibold border-r border-zinc-300">{formatNumber(170)}</td>
                          <td className="text-right px-2 py-2 text-rose-600 tabular-nums">({formatNumber(401)})</td>
                          <td className="text-right px-2 py-2 text-rose-600 tabular-nums">({formatNumber(2602)})</td>
                          <td className="text-right px-2 py-2 text-rose-600 tabular-nums font-semibold">({formatNumber(3003)})</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 선물환손익 합계 요약 */}
                <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-3 space-y-2">
                  {/* 거래손익 */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-600">거래손익</span>
                    <div className="flex gap-6 text-sm tabular-nums">
                      <div className="text-center w-[60px]">
                        <div className="text-xs text-zinc-400">24.4Q</div>
                        <div className="font-medium text-zinc-600">{formatNumber(170)}</div>
                      </div>
                      <div className="text-center w-[60px]">
                        <div className="text-xs text-zinc-400">25.4Q</div>
                        <div className="font-medium text-rose-600">({formatNumber(3003)})</div>
                      </div>
                      <div className="text-center w-[60px]">
                        <div className="text-xs text-zinc-400">YoY</div>
                        <div className="font-medium text-rose-600">{formatNumber(-3173)}</div>
                      </div>
                    </div>
                  </div>
                  {/* 평가손익 */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-600">평가손익</span>
                    <div className="flex gap-6 text-sm tabular-nums">
                      <div className="text-center w-[60px]">
                        <div className="text-xs text-zinc-400">24.4Q</div>
                        <div className="font-medium text-zinc-600">{formatNumber(107)}</div>
                      </div>
                      <div className="text-center w-[60px]">
                        <div className="text-xs text-zinc-400">25.4Q</div>
                        <div className="font-medium text-rose-600">({formatNumber(1169)})</div>
                      </div>
                      <div className="text-center w-[60px]">
                        <div className="text-xs text-zinc-400">YoY</div>
                        <div className="font-medium text-rose-600">{formatNumber(-1276)}</div>
                      </div>
                    </div>
                  </div>
                  {/* 구분선 */}
                  <div className="border-t border-zinc-300 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-zinc-800">선물환손익 합계</span>
                      <div className="flex gap-6 text-sm tabular-nums">
                        <div className="text-center w-[60px]">
                          <div className="text-xs text-zinc-500">24.4Q</div>
                          <div className="font-semibold text-zinc-700">{formatNumber(277)}</div>
                        </div>
                        <div className="text-center w-[60px]">
                          <div className="text-xs text-zinc-500">25.4Q</div>
                          <div className="font-semibold text-rose-600">({formatNumber(4172)})</div>
                        </div>
                        <div className="text-center w-[60px]">
                          <div className="text-xs text-zinc-500">YoY</div>
                          <div className="font-semibold text-rose-600">{formatNumber(-4449)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-400">* 4Q 분기(3개월) 기준 | 선물환 계약: CNY 기준 USD/KRW 환헤지 | 평가손익은 연 누적기준 0</p>
              </div>
            )}

            {/* ─── 기타손익 구성상세 입력 테이블 ─── */}
            {selectedNonOpAccount === '기타손익' && (() => {
              const MISC_ITEMS = [
                { key: '잡이익',       label: '잡이익',          sign: 1  },
                { key: '잡손실',       label: '잡손실',          sign: -1 },
                { key: '수수료수익',   label: '수수료수익',       sign: 1  },
                { key: '임대료수익',   label: '임대료수익',       sign: 1  },
                { key: '유형자산처분이익', label: '유형자산처분이익', sign: 1  },
                { key: '유형자산처분손실', label: '유형자산처분손실', sign: -1 },
                { key: '대손충당금환입',   label: '대손충당금환입',   sign: 1  },
                { key: '기타의대손상각비', label: '기타의대손상각비', sign: -1 },
                { key: '소송충당부채',     label: '소송충당부채전입', sign: -1 },
                { key: '기타',             label: '기타',             sign: 1  },
              ];

              const editKey = (item, period) => `miscDetail_${item}_${period}`;
              const getVal = (item, period) => {
                const v = incomeEditData?.[editKey(item, period)];
                return (v !== undefined && v !== '' && !isNaN(Number(v))) ? Number(v) : null;
              };
              const getDisp = (item, period) => {
                const v = getVal(item, period);
                return v !== null ? v : 0;
              };

              // 입력된 항목 합계
              const calcTotal = (period) =>
                MISC_ITEMS.reduce((s, it) => s + (getVal(it.key, period) !== null ? getVal(it.key, period) : 0), 0);

              const actualTotal = (period) => (incomeStatementData[period]?.기타손익 || 0) / 100; // 백만원 → 억원

              const startEdit = () => {
                const d = {};
                MISC_ITEMS.forEach(it => {
                  [currPeriod, prevPeriod].forEach(p => {
                    const v = getVal(it.key, p);
                    if (v !== null) d[editKey(it.key, p)] = String(v);
                  });
                });
                setMiscDraft(d);
                setMiscEditMode(true);
              };
              const saveEdit = () => {
                const updates = { ...incomeEditData };
                MISC_ITEMS.forEach(it => {
                  [currPeriod, prevPeriod].forEach(p => {
                    const k = editKey(it.key, p);
                    const v = miscDraft[k];
                    if (v !== undefined && v !== '' && !isNaN(Number(v))) {
                      updates[k] = Number(v);
                    } else {
                      delete updates[k];
                    }
                  });
                });
                setIncomeEditData(updates);
                setMiscEditMode(false);
              };
              const resetAll = () => {
                if (!window.confirm('기타손익 구성상세 입력 내용을 모두 초기화할까요?')) return;
                const updates = { ...incomeEditData };
                MISC_ITEMS.forEach(it => {
                  [currPeriod, prevPeriod].forEach(p => { delete updates[editKey(it.key, p)]; });
                });
                setIncomeEditData(updates);
                setMiscEditMode(false);
              };

              const hasAnyData = MISC_ITEMS.some(it => [currPeriod, prevPeriod].some(p => getVal(it.key, p) !== null));

              return (
                <div className="mt-4">
                  <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                    <div className="bg-zinc-50 px-3 py-2 border-b border-zinc-200 flex justify-between items-center">
                      <div>
                        <span className="text-sm font-semibold text-zinc-800">기타손익 구성상세</span>
                        <span className="text-xs text-zinc-500 ml-2">{currPeriodLabel} vs {prevPeriodLabel} · 억원 단위 입력</span>
                      </div>
                      <div className="flex gap-1">
                        {/* 📋 클립보드 복사 — 편집 모드 여부 무관하게 항상 표시 */}
                        {hasAnyData && (
                          <button onClick={() => {
                            const header = `구분\t${prevPeriodLabel}\t${currPeriodLabel}\t차이`;
                            const rows = MISC_ITEMS.map(it => {
                              const p = getDisp(it.key, prevPeriod);
                              const c = getDisp(it.key, currPeriod);
                              return `${it.label}\t${p !== 0 ? p.toFixed(1) : '-'}\t${c !== 0 ? c.toFixed(1) : '-'}\t${(c - p) !== 0 ? (c - p > 0 ? '+' : '') + (c - p).toFixed(1) : '-'}`;
                            });
                            const totalRow = `합계\t${calcTotal(prevPeriod).toFixed(1)}\t${calcTotal(currPeriod).toFixed(1)}\t${(calcTotal(currPeriod) - calcTotal(prevPeriod)).toFixed(1)}`;
                            navigator.clipboard.writeText([header, ...rows, totalRow].join('\n'))
                              .then(() => alert('📋 클립보드에 복사되었습니다. 엑셀에 붙여넣기 하세요.'));
                          }}
                            className="text-[11px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">
                            📋 복사
                          </button>
                        )}
                        {!miscEditMode ? (
                          <button onClick={startEdit}
                            className="text-[11px] px-2 py-0.5 rounded border border-violet-300 text-violet-600 hover:bg-violet-50">
                            ✏️ 편집
                          </button>
                        ) : (
                          <>
                            <button onClick={saveEdit}
                              className="text-[11px] px-2 py-0.5 rounded border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">
                              💾 저장
                            </button>
                            <button onClick={() => setMiscEditMode(false)}
                              className="text-[11px] px-2 py-0.5 rounded border border-zinc-300 text-zinc-500 hover:bg-zinc-50">
                              취소
                            </button>
                            <button onClick={resetAll}
                              className="text-[11px] px-2 py-0.5 rounded border border-rose-300 text-rose-500 hover:bg-rose-50">
                              초기화
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                            <th className="text-left px-3 py-2 font-semibold border-r border-zinc-200 min-w-[130px]">구분</th>
                            <th className="text-right px-3 py-2 font-semibold border-r border-zinc-200 min-w-[80px] text-blue-700 bg-blue-50">{prevPeriodLabel}</th>
                            <th className="text-right px-3 py-2 font-semibold border-r border-zinc-200 min-w-[80px] text-emerald-700 bg-emerald-50">{currPeriodLabel}</th>
                            <th className="text-right px-3 py-2 font-semibold min-w-[70px] text-zinc-500">차이</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MISC_ITEMS.map((it) => {
                            const prevV = getDisp(it.key, prevPeriod);
                            const currV = getDisp(it.key, currPeriod);
                            const diff = currV - prevV;
                            const isIncome = it.sign > 0;
                            return (
                              <tr key={it.key} className="border-b border-zinc-100 hover:bg-zinc-50">
                                <td className="px-3 py-1.5 text-zinc-700 border-r border-zinc-100">
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isIncome ? 'bg-emerald-400' : 'bg-rose-400'}`}/>
                                  {it.label}
                                  <span className="text-[10px] text-zinc-400 ml-1">{isIncome ? '(수익)' : '(비용)'}</span>
                                </td>
                                {/* 전기 */}
                                <td className="px-2 py-1 border-r border-zinc-100">
                                  {miscEditMode ? (
                                    <input type="number" step="0.01" placeholder="0"
                                      value={miscDraft[editKey(it.key, prevPeriod)] ?? ''}
                                      onChange={e => setMiscDraft(d => ({ ...d, [editKey(it.key, prevPeriod)]: e.target.value }))}
                                      className="w-full text-right text-[12px] border border-blue-200 rounded px-1 py-0.5 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                                  ) : (
                                    <span className={`block text-right tabular-nums ${prevV !== 0 ? (isIncome ? 'text-emerald-700' : 'text-rose-600') : 'text-zinc-300'}`}>
                                      {prevV !== 0 ? (prevV > 0 ? '+' : '') + prevV.toFixed(1) : '-'}
                                    </span>
                                  )}
                                </td>
                                {/* 당기 */}
                                <td className="px-2 py-1 border-r border-zinc-100">
                                  {miscEditMode ? (
                                    <input type="number" step="0.01" placeholder="0"
                                      value={miscDraft[editKey(it.key, currPeriod)] ?? ''}
                                      onChange={e => setMiscDraft(d => ({ ...d, [editKey(it.key, currPeriod)]: e.target.value }))}
                                      className="w-full text-right text-[12px] border border-emerald-200 rounded px-1 py-0.5 bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400"/>
                                  ) : (
                                    <span className={`block text-right tabular-nums font-medium ${currV !== 0 ? (isIncome ? 'text-emerald-700' : 'text-rose-600') : 'text-zinc-300'}`}>
                                      {currV !== 0 ? (currV > 0 ? '+' : '') + currV.toFixed(1) : '-'}
                                    </span>
                                  )}
                                </td>
                                {/* 차이 */}
                                <td className={`text-right px-2 py-1.5 tabular-nums ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-zinc-300'}`}>
                                  {diff !== 0 ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                          {/* 합계 행 */}
                          {hasAnyData && (() => {
                            const tPrev = calcTotal(prevPeriod);
                            const tCurr = calcTotal(currPeriod);
                            const actual = actualTotal(currPeriod);
                            const diff = tCurr - tPrev;
                            const gap = actual - tCurr;
                            return (
                              <>
                              <tr className="bg-zinc-50 font-semibold border-t border-zinc-200">
                                <td className="px-3 py-1.5 text-zinc-800 border-r border-zinc-100">입력 합계</td>
                                <td className="text-right px-2 py-1.5 tabular-nums text-zinc-700 border-r border-zinc-100">{tPrev !== 0 ? tPrev.toFixed(1) : '-'}</td>
                                <td className="text-right px-2 py-1.5 tabular-nums text-zinc-900 border-r border-zinc-100">{tCurr !== 0 ? tCurr.toFixed(1) : '-'}</td>
                                <td className={`text-right px-2 py-1.5 tabular-nums ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{diff !== 0 ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '-'}</td>
                              </tr>
                              <tr className="bg-amber-50 text-[11px]">
                                <td className="px-3 py-1 text-amber-700 border-r border-zinc-100">연결 기타손익 (참고)</td>
                                <td className="text-right px-2 py-1 tabular-nums text-zinc-500 border-r border-zinc-100">{(actualTotal(prevPeriod)).toFixed(1)}</td>
                                <td className="text-right px-2 py-1 tabular-nums text-amber-800 font-semibold border-r border-zinc-100">{actual.toFixed(1)}</td>
                                <td className={`text-right px-2 py-1 tabular-nums font-medium ${Math.abs(gap) < 0.5 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {Math.abs(gap) < 0.5 ? '✓ 일치' : `미배분 ${gap.toFixed(1)}`}
                                </td>
                              </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-zinc-400 px-3 py-1.5 bg-zinc-50 border-t border-zinc-100">
                      * 억원 단위 직접 입력 · 수익 항목(+), 비용 항목(-)으로 순손익에 반영 · 저장 시 분석 노트에 보존
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
          )}
          </>
          )}
          </>
          )}
        </div>
        </div>
      </div>
    );
  };

  // ============================================
  // 재무상태표 탭 렌더링
  // ============================================
  const renderBalanceSheetTab = () => {
      // 운전자본 계산 (매출채권 + 재고자산 - 매입채무)
    const calcWorkingCapital = (period) => {
      const bs = balanceSheetData[period];
      return (bs?.매출채권 || 0) + (bs?.재고자산 || 0) - (bs?.매입채무 || 0);
    };

    // ROE 계산 (당기순이익 / 자본총계 * 100)
    // period에 해당하는 연도의 당기순이익을 사용해야 함
    const calcROE = (period) => {
      // period에서 연도 추출 (예: '2024_4Q' -> '2024', '2025_4Q' -> '2025')
      const periodYear = period.split('_')[0];
      const periodQuarter = period.split('_')[1].replace('Q', '');
      
      // 해당 연도의 연간 당기순이익 키 생성
      // 4Q면 'YYYY_Year', 그 외는 'YYYY_XQ_Year' 형식
      const yearKey = periodQuarter === '4' 
        ? `${periodYear}_Year` 
        : `${periodYear}_${periodQuarter}Q_Year`;
      
      const netIncome = incomeStatementData[yearKey]?.당기순이익 || 0;
      const equity = balanceSheetData[period]?.자본총계 || 0;
      if (!equity || equity === 0) return 0;
      return ((netIncome / equity) * 100).toFixed(1);
    };

    // 조단위 포맷 함수 (억원 단위 입력받아 조단위 표기)
    const formatTrilBil = (valueInBil) => {
      if (valueInBil === 0 || valueInBil === undefined || valueInBil === null) return '-';
      const absValue = Math.abs(valueInBil);
      const sign = valueInBil < 0 ? '-' : '';
      
      if (absValue >= 10000) {
        const tril = Math.floor(absValue / 10000);
        const bil = Math.round(absValue % 10000);
        return `${sign}${tril}조 ${formatNumber(bil)}`;
      }
      return `${sign}${formatNumber(Math.round(absValue))}`;
    };

    // 요약 카드 데이터 (억원 단위) - 항상 전기말(전년 연말)과 비교
    const prevYearEnd = '2024_4Q'; // 전기말 고정
    const summaryCards = [
      { 
        title: '자산총계', 
        curr: (balanceSheetData[bsCurrentPeriod]?.자산총계 || 0) / 100,
        prev: (balanceSheetData[prevYearEnd]?.자산총계 || 0) / 100,
        unit: '억원',
        useTril: true,
      },
      { 
        title: '운전자본', 
        curr: calcWorkingCapital(bsCurrentPeriod) / 100,
        prev: calcWorkingCapital(prevYearEnd) / 100,
        unit: '억원',
        useTril: false,
      },
      { 
        title: '자본총계', 
        curr: (balanceSheetData[bsCurrentPeriod]?.자본총계 || 0) / 100,
        prev: (balanceSheetData[prevYearEnd]?.자본총계 || 0) / 100,
        unit: '억원',
        useTril: true,
      },
      { 
        title: 'ROE', 
        curr: calcROE(bsCurrentPeriod),
        prev: calcROE(prevYearEnd),
        isRatio: true,
      },
    ];

    // 재무상태표 항목 (성격별 분류 - 유동/비유동 통합, 맵핑표 기준)
    const balanceItems = [
      // 자산
      { key: '현금성자산', label: '현금성자산', depth: 1, selectable: true },
      { key: '금융자산', label: '금융자산', depth: 1, selectable: true },
      { key: '매출채권', label: '매출채권', depth: 1, selectable: true },
      { key: '대여금', label: '대여금', depth: 1 },
      { key: '재고자산', label: '재고자산', depth: 1, selectable: true },
      { key: '투자자산', label: '투자자산', depth: 1, selectable: true },
      { key: '유무형자산', label: '유·무형자산', depth: 1, selectable: true },
      { key: '사용권자산', label: '사용권자산', depth: 1, selectable: true },
      { key: '기타자산', label: '기타자산', depth: 1, selectable: true },
      { key: '자산총계', label: '자산총계', bold: true, highlight: 'blue', selectable: true },
      // 부채
      { key: '매입채무', label: '매입채무', depth: 1, selectable: true },
      { key: '미지급금', label: '미지급금', depth: 1, selectable: true },
      { key: '보증금', label: '보증금', depth: 1, selectable: true },
      { key: '차입금', label: '차입금', depth: 1, selectable: true },
      { key: '리스부채', label: '리스부채', depth: 1, selectable: true },
      { key: '금융부채', label: '금융부채', depth: 1 },
      { key: '기타부채', label: '기타부채', depth: 1, selectable: true },
      { key: '부채총계', label: '부채총계', bold: true, highlight: 'red', selectable: true },
      // 자본 (총계만)
      { key: '자본총계', label: '자본총계', bold: true, highlight: 'green', selectable: true },
    ];

    // 법인별 데이터는 컴포넌트 상위 레벨에서 정의됨 (entityBSData)
    // 아래 중복 정의는 제거됨 - 상위 레벨의 entityBSData 사용

    // 분기별 법인별 추이 데이터 (24.1Q ~ 25.4Q) - 그래프용 (홍콩+ST미국 = 기타로 합산)
    const quarterlyEntityData = {
      현금성자산: [
        { quarter: '24.1Q', 'OC(국내)': 291693, 중국: 12162, 기타: 30852 },
        { quarter: '24.2Q', 'OC(국내)': 161519, 중국: 27175, 기타: 31918 },
        { quarter: '24.3Q', 'OC(국내)': 142325, 중국: 24304, 기타: 26134 },
        { quarter: '24.4Q', 'OC(국내)': 61500, 중국: 29229, 기타: 32444 },
        { quarter: '25.1Q', 'OC(국내)': 79496, 중국: 60404, 기타: 24144 },
        { quarter: '25.2Q', 'OC(국내)': 88735, 중국: 20311, 기타: 17394 },
        { quarter: '25.3Q', 'OC(국내)': 182075, 중국: 9318, 기타: 16892 },
        { quarter: '25.4Q', 'OC(국내)': 270871, 중국: 12231, 기타: 42282 },
      ],
      매출채권: [
        { quarter: '24.1Q', 'OC(국내)': 109224, 중국: 7225, 기타: 11233 },
        { quarter: '24.2Q', 'OC(국내)': 91507, 중국: 7183, 기타: 11546 },
        { quarter: '24.3Q', 'OC(국내)': 137912, 중국: 81857, 기타: 15304 },
        { quarter: '24.4Q', 'OC(국내)': 134453, 중국: 40081, 기타: 18050 },
        { quarter: '25.1Q', 'OC(국내)': 123193, 중국: 20896, 기타: 11603 },
        { quarter: '25.2Q', 'OC(국내)': 81953, 중국: 8793, 기타: 11029 },
        { quarter: '25.3Q', 'OC(국내)': 205309, 중국: 97531, 기타: 19691 },
        { quarter: '25.4Q', 'OC(국내)': 196536, 중국: 67697, 기타: 5763 },
      ],
      재고자산: [
        { quarter: '24.1Q', 'OC(국내)': 232095, 중국: 136110, 기타: 37423 },
        { quarter: '24.2Q', 'OC(국내)': 207444, 중국: 115040, 기타: 35388 },
        { quarter: '24.3Q', 'OC(국내)': 247068, 중국: 174481, 기타: 39236 },
        { quarter: '24.4Q', 'OC(국내)': 214281, 중국: 141223, 기타: 43928 },
        { quarter: '25.1Q', 'OC(국내)': 214607, 중국: 123617, 기타: 43546 },
        { quarter: '25.2Q', 'OC(국내)': 199308, 중국: 113822, 기타: 38577 },
        { quarter: '25.3Q', 'OC(국내)': 242024, 중국: 281973, 기타: 46723 },
        { quarter: '25.4Q', 'OC(국내)': 219274, 중국: 306452, 기타: 40478 },
      ],
      유무형자산: [
        { quarter: '24.1Q', 'OC(국내)': 197870, 중국: 9894, 기타: 58713 },
        { quarter: '24.2Q', 'OC(국내)': 251498, 중국: 10189, 기타: 70542 },
        { quarter: '24.3Q', 'OC(국내)': 345549, 중국: 9901, 기타: 66407 },
        { quarter: '24.4Q', 'OC(국내)': 609769, 중국: 10416, 기타: 73425 },
        { quarter: '25.1Q', 'OC(국내)': 611019, 중국: 9130, 기타: 72558 },
        { quarter: '25.2Q', 'OC(국내)': 607960, 중국: 7699, 기타: 67842 },
        { quarter: '25.3Q', 'OC(국내)': 605413, 중국: 8114, 기타: 71004 },
        { quarter: '25.4Q', 'OC(국내)': 599030, 중국: 7937, 기타: 73176 },
      ],
      사용권자산: [
        { quarter: '24.1Q', 'OC(국내)': 162587, 중국: 34263, 기타: 16752 },
        { quarter: '24.2Q', 'OC(국내)': 155781, 중국: 40070, 기타: 14612 },
        { quarter: '24.3Q', 'OC(국내)': 154541, 중국: 39122, 기타: 13892 },
        { quarter: '24.4Q', 'OC(국내)': 146365, 중국: 47203, 기타: 14302 },
        { quarter: '25.1Q', 'OC(국내)': 146937, 중국: 36815, 기타: 14468 },
        { quarter: '25.2Q', 'OC(국내)': 142525, 중국: 30778, 기타: 10868 },
        { quarter: '25.3Q', 'OC(국내)': 135457, 중국: 30581, 기타: 20117 },
        { quarter: '25.4Q', 'OC(국내)': 130687, 중국: 34218, 기타: 20253 },
      ],
      차입금: [
        { quarter: '24.1Q', 'OC(국내)': 0, 중국: 72442, 기타: 19871 },
        { quarter: '24.2Q', 'OC(국내)': 0, 중국: 0, 기타: 20260 },
        { quarter: '24.3Q', 'OC(국내)': 0, 중국: 86820, 기타: 26418 },
        { quarter: '24.4Q', 'OC(국내)': 45000, 중국: 100635, 기타: 33248 },
        { quarter: '25.1Q', 'OC(국내)': 20000, 중국: 56470, 기타: 40635 },
        { quarter: '25.2Q', 'OC(국내)': 0, 중국: 32157, 기타: 41841 },
        { quarter: '25.3Q', 'OC(국내)': 0, 중국: 160605, 기타: 49840 },
        { quarter: '25.4Q', 'OC(국내)': 0, 중국: 186267, 기타: 80970 },
      ],
      매입채무: [
        { quarter: '24.1Q', 'OC(국내)': 69104, 중국: 5104, 기타: 46999 },
        { quarter: '24.2Q', 'OC(국내)': 48681, 중국: 1415, 기타: 46111 },
        { quarter: '24.3Q', 'OC(국내)': 115166, 중국: 63397, 기타: 45417 },
        { quarter: '24.4Q', 'OC(국내)': 79795, 중국: 17885, 기타: 53121 },
        { quarter: '25.1Q', 'OC(국내)': 69813, 중국: 28622, 기타: 47991 },
        { quarter: '25.2Q', 'OC(국내)': 53644, 중국: 10263, 기타: 43041 },
        { quarter: '25.3Q', 'OC(국내)': 139941, 중국: 131315, 기타: 50833 },
        { quarter: '25.4Q', 'OC(국내)': 90452, 중국: 82388, 기타: 51489 },
      ],
      금융자산: [
        { quarter: '24.2Q', 'OC(국내)': 17856, 중국: 0, 기타: 891 },
        { quarter: '24.3Q', 'OC(국내)': 12292, 중국: 5662, 기타: 916 },
        { quarter: '24.4Q', 'OC(국내)': 13441, 중국: 6038, 기타: 916 },
        { quarter: '25.1Q', 'OC(국내)': 10966, 중국: 0, 기타: 0 },
        { quarter: '25.2Q', 'OC(국내)': 18833, 중국: 0, 기타: 0 },
        { quarter: '25.3Q', 'OC(국내)': 10260, 중국: 27555, 기타: 0 },
        { quarter: '25.4Q', 'OC(국내)': 9288, 중국: 16381, 기타: 0 },
      ],
      투자자산: [
        { quarter: '24.1Q', 'OC(국내)': 713027, 중국: 0, 기타: 0 },
        { quarter: '24.2Q', 'OC(국내)': 722577, 중국: 0, 기타: 0 },
        { quarter: '24.3Q', 'OC(국내)': 699958, 중국: 0, 기타: 0 },
        { quarter: '24.4Q', 'OC(국내)': 707434, 중국: 0, 기타: 0 },
        { quarter: '25.1Q', 'OC(국내)': 713076, 중국: 0, 기타: 0 },
        { quarter: '25.2Q', 'OC(국내)': 714229, 중국: 0, 기타: 0 },
        { quarter: '25.3Q', 'OC(국내)': 714229, 중국: 0, 기타: 0 },
        { quarter: '25.4Q', 'OC(국내)': 714266, 중국: 0, 기타: 0 },
      ],
      자산총계: [
        { quarter: '24.1Q', 'OC(국내)': 1765417, 중국: 271920, 기타: 20033 },
        { quarter: '24.2Q', 'OC(국내)': 1636710, 중국: 243233, 기타: 46434 },
        { quarter: '24.3Q', 'OC(국내)': 1806476, 중국: 363370, 기타: -30368 },
        { quarter: '24.4Q', 'OC(국내)': 1923504, 중국: 336611, 기타: 25790 },
        { quarter: '25.1Q', 'OC(국내)': 1944504, 중국: 290073, 기타: 23373 },
        { quarter: '25.2Q', 'OC(국내)': 1891404, 중국: 231683, 기타: 27616 },
        { quarter: '25.3Q', 'OC(국내)': 2145196, 중국: 495765, 기타: 31200 },
        { quarter: '25.4Q', 'OC(국내)': 2215497, 중국: 488109, 기타: -1300 },
      ],
      부채총계: [
        { quarter: '24.1Q', 'OC(국내)': 492867, 중국: 201248, 기타: 13534 },
        { quarter: '24.2Q', 'OC(국내)': 330928, 중국: 155343, 기타: 27971 },
        { quarter: '24.3Q', 'OC(국내)': 397220, 중국: 266874, 기타: -9304 },
        { quarter: '24.4Q', 'OC(국내)': 429786, 중국: 252897, 기타: 25924 },
        { quarter: '25.1Q', 'OC(국내)': 435129, 중국: 202453, 기타: 26392 },
        { quarter: '25.2Q', 'OC(국내)': 318573, 중국: 150855, 기타: 8100 },
        { quarter: '25.3Q', 'OC(국내)': 423707, 중국: 389821, 기타: 5009 },
        { quarter: '25.4Q', 'OC(국내)': 392260, 중국: 375667, 기타: -60235 },
      ],
      자본총계: [
        { quarter: '24.1Q', 'OC(국내)': 1272550, 중국: 70672, 기타: 6499 },
        { quarter: '24.2Q', 'OC(국내)': 1305782, 중국: 87890, 기타: 18463 },
        { quarter: '24.3Q', 'OC(국내)': 1409256, 중국: 96496, 기타: -21065 },
        { quarter: '24.4Q', 'OC(국내)': 1493718, 중국: 83714, 기타: -134 },
        { quarter: '25.1Q', 'OC(국내)': 1509375, 중국: 87621, 기타: -3020 },
        { quarter: '25.2Q', 'OC(국내)': 1572831, 중국: 80828, 기타: 19515 },
        { quarter: '25.3Q', 'OC(국내)': 1721489, 중국: 105943, 기타: 26190 },
        { quarter: '25.4Q', 'OC(국내)': 1823238, 중국: 112443, 기타: 58935 },
      ],
      기타자산: [
        { quarter: '24.1Q', 'OC(국내)': 51187, 중국: 58620, 기타: 10186 },
        { quarter: '24.2Q', 'OC(국내)': 47727, 중국: 43577, 기타: 11920 },
        { quarter: '24.3Q', 'OC(국내)': 57246, 중국: 28043, 기타: 10074 },
        { quarter: '24.4Q', 'OC(국내)': 51373, 중국: 62420, 기타: 11734 },
        { quarter: '25.1Q', 'OC(국내)': 57976, 중국: 39211, 기타: 14523 },
        { quarter: '25.2Q', 'OC(국내)': 50378, 중국: 50281, 기타: 15121 },
        { quarter: '25.3Q', 'OC(국내)': 55270, 중국: 40692, 기타: 16305 },
        { quarter: '25.4Q', 'OC(국내)': 48166, 중국: 43193, 기타: 12208 },
      ],
      미지급금: [
        { quarter: '24.1Q', 'OC(국내)': 93286, 중국: 0, 기타: 1216 },
        { quarter: '24.2Q', 'OC(국내)': 30102, 중국: 2096, 기타: 1068 },
        { quarter: '24.3Q', 'OC(국내)': 34213, 중국: 1937, 기타: 1101 },
        { quarter: '24.4Q', 'OC(국내)': 36054, 중국: 3925, 기타: 1640 },
        { quarter: '25.1Q', 'OC(국내)': 98569, 중국: 0, 기타: 1126 },
        { quarter: '25.2Q', 'OC(국내)': 27259, 중국: 0, 기타: 1034 },
        { quarter: '25.3Q', 'OC(국내)': 34936, 중국: 0, 기타: 631 },
        { quarter: '25.4Q', 'OC(국내)': 45522, 중국: 0, 기타: 1078 },
      ],
      보증금: [
        { quarter: '24.1Q', 'OC(국내)': 11178, 중국: 5182, 기타: 0 },
        { quarter: '24.2Q', 'OC(국내)': 11138, 중국: 5318, 기타: 0 },
        { quarter: '24.3Q', 'OC(국내)': 11190, 중국: 5543, 기타: 0 },
        { quarter: '24.4Q', 'OC(국내)': 11376, 중국: 6001, 기타: 0 },
        { quarter: '25.1Q', 'OC(국내)': 11440, 중국: 6095, 기타: 0 },
        { quarter: '25.2Q', 'OC(국내)': 11547, 중국: 6141, 기타: 0 },
        { quarter: '25.3Q', 'OC(국내)': 11614, 중국: 6281, 기타: 0 },
        { quarter: '25.4Q', 'OC(국내)': 11717, 중국: 7046, 기타: 0 },
      ],
      리스부채: [
        { quarter: '24.1Q', 'OC(국내)': 164995, 중국: 36563, 기타: 14732 },
        { quarter: '24.2Q', 'OC(국내)': 162782, 중국: 51133, 기타: 13803 },
        { quarter: '24.3Q', 'OC(국내)': 167478, 중국: 56166, 기타: 17218 },
        { quarter: '24.4Q', 'OC(국내)': 165755, 중국: 71227, 기타: 19424 },
        { quarter: '25.1Q', 'OC(국내)': 165954, 중국: 53074, 기타: 16069 },
        { quarter: '25.2Q', 'OC(국내)': 165055, 중국: 45015, 기타: 13608 },
        { quarter: '25.3Q', 'OC(국내)': 162933, 중국: 47178, 기타: 16717 },
        { quarter: '25.4Q', 'OC(국내)': 108817, 중국: 27671, 기타: 8741 },
      ],
      기타부채: [
        { quarter: '24.1Q', 'OC(국내)': 154252, 중국: 81955, 기타: 7267 },
        { quarter: '24.2Q', 'OC(국내)': 79205, 중국: 95781, 기타: 7704 },
        { quarter: '24.3Q', 'OC(국내)': 74810, 중국: 143331, 기타: 6579 },
        { quarter: '24.4Q', 'OC(국내)': 100629, 중국: 149935, 기타: 7629 },
        { quarter: '25.1Q', 'OC(국내)': 81377, 중국: 92180, 기타: 7096 },
        { quarter: '25.2Q', 'OC(국내)': 62951, 중국: 63420, 기타: 6681 },
        { quarter: '25.3Q', 'OC(국내)': 81839, 중국: 211328, 기타: 7152 },
        { quarter: '25.4Q', 'OC(국내)': 90698, 중국: 265627, 기타: 7167 },
      ],
    };

    const entityColors = {
      'OC(국내)': '#3B82F6',
      중국: '#F59E0B',
      홍콩: '#8B5CF6',
      ST미국: '#10B981',
      연결조정: '#9CA3AF',
      '기타(연결조정)': '#6B7280',
    };

    // 추이 그래프용 색상 (OC(국내), 중국, 기타만 표시)
    const trendColors = {
      'OC(국내)': '#3B82F6',
      중국: '#F59E0B',
      기타: '#8B5CF6',
    };

    // ============================================
    // 재무상태표 법인별 분석 데이터 정합성 보정
    // - entityBSData는 연결조정 전 법인별 합산이라 연결(BS) 합계와 불일치 가능
    // - 선택 계정/기간의 연결 금액(balanceSheetData)을 기준으로
    //   1) base(법인별 합산) 스케일링
    //   2) 차이는 '연결조정' 항목으로 보정
    // ============================================
    const getBSConsolidatedTotal = (accountKey, period) => {
      const v = balanceSheetData?.[period]?.[accountKey];
      return typeof v === 'number' ? v : 0;
    };

    const getBaseBSBreakdown = (accountKey, period) => {
      // 1. 먼저 entityBSData에서 찾기
      const p = entityBSData?.[period];
      if (p && p[accountKey]) {
        return p[accountKey];
      }
      
      // 2. bsDetailData에서 찾기 (사용권자산 등)
      const detailData = bsDetailData?.[accountKey]?.[period];
      if (detailData) {
        // 연결 키 제외하고 법인별 데이터만 반환
        const { 연결, category, ...entityData } = detailData;
        return entityData;
      }
      
      // 3. 둘 다 없으면 자산총계 반환
      if (p) return p['자산총계'] || {};
      return {};
    };

    const getAlignedBSBreakdown = (accountKey, period) => {
      const consolidatedTotal = getBSConsolidatedTotal(accountKey, period);
      const base = getBaseBSBreakdown(accountKey, period);
      const baseKeys = Object.keys(base);

      if (baseKeys.length === 0) {
        return { 연결조정: consolidatedTotal };
      }

      // 스케일링 없이 원본 값 그대로 사용, 차이분은 연결조정에 표시
      const baseSum = baseKeys.reduce((sum, k) => sum + (base[k] || 0), 0);
      const adjustment = consolidatedTotal - baseSum;
      return { ...base, 연결조정: adjustment };
    };

    // 표시용 그룹핑: 비중이 작은 법인 + 연결조정을 '기타(연결조정)'로 합산
    const BS_MINOR_ENTITY_RATIO_THRESHOLD = 0.03; // 3% 미만은 기타로 합산
    const BS_MERGED_ENTITY_LABEL = '기타(연결조정)';
    const BS_MAJOR_ENTITIES = ['OC(국내)', '중국', '홍콩', 'ST미국'];

    // 단일 기간용 (도넛 차트 등)
    const getGroupedBSBreakdown = (accountKey, period) => {
      return getGroupedBSBreakdownForComparison(accountKey, period, period);
    };

    // 비교용: 전기/당기 둘 다를 고려하여, 한 기간이라도 유의미하면 개별로 유지
    const getGroupedBSBreakdownForComparison = (accountKey, prevPeriod, currPeriod) => {
      const totalCurr = getBSConsolidatedTotal(accountKey, currPeriod);
      const totalPrev = getBSConsolidatedTotal(accountKey, prevPeriod);
      const alignedCurr = getAlignedBSBreakdown(accountKey, currPeriod);
      const alignedPrev = getAlignedBSBreakdown(accountKey, prevPeriod);

      // 전기/당기 모두의 키를 합집합으로 수집
      const allKeys = Array.from(new Set([...Object.keys(alignedPrev), ...Object.keys(alignedCurr)]));

      const grouped = {};
      const entitiesToKeep = new Set();

      // 1. OC(국내), 중국은 항상 유지
      BS_MAJOR_ENTITIES.forEach(entity => {
        if (allKeys.includes(entity)) {
          entitiesToKeep.add(entity);
        }
      });

      // 2. 전기나 당기 중 하나라도 데이터가 있고, 그 기간의 비중이 3% 이상이면 개별로 유지
      for (const name of allKeys) {
        if (BS_MAJOR_ENTITIES.includes(name) || name === '연결조정' || name === '기타') continue;

        const prevVal = alignedPrev[name] || 0;
        const currVal = alignedCurr[name] || 0;
        
        const prevRatio = totalPrev !== 0 ? Math.abs(prevVal) / Math.abs(totalPrev) : 0;
        const currRatio = totalCurr !== 0 ? Math.abs(currVal) / Math.abs(totalCurr) : 0;

        // 전기나 당기 중 하나라도 데이터가 있고, 그 기간의 비중이 3% 이상이면 개별 유지
        const hasDataInEitherPeriod = prevVal !== 0 || currVal !== 0;
        const isSignificantInEitherPeriod = prevRatio >= BS_MINOR_ENTITY_RATIO_THRESHOLD || currRatio >= BS_MINOR_ENTITY_RATIO_THRESHOLD;

        if (hasDataInEitherPeriod && isSignificantInEitherPeriod) {
          entitiesToKeep.add(name);
        }
      }

      // 3. 유지할 법인들을 grouped에 추가 (당기 값을 사용)
      entitiesToKeep.forEach(name => {
        grouped[name] = alignedCurr[name] || 0;
      });

      // 4. 나머지는 기타(연결조정)로 흡수 (합계 정합성 보장)
      const keptSum = Object.values(grouped).reduce((s, v) => s + (v || 0), 0);
      grouped[BS_MERGED_ENTITY_LABEL] = totalCurr - keptSum;

      return grouped;
    };

    // 도넛 차트 데이터 생성 함수
    const getBSDonutData = (period) => {
      const accountData = getGroupedBSBreakdown(selectedBSAccount, period);
      const total = getBSConsolidatedTotal(selectedBSAccount, period);
      if (!accountData || total === 0) return [];

      return Object.entries(accountData)
        .map(([name, value]) => ({
          name,
          value: Math.abs(value),      // 차트 표시용(절대값)
          valueRaw: value || 0,        // 테이블 표시용(원값)
          ratio: total !== 0 ? ((Math.abs(value) / Math.abs(total)) * 100).toFixed(1) : '0.0',
          color:
            name === BS_MERGED_ENTITY_LABEL
              ? '#6B7280'
              : (entityColors[name] || '#9CA3AF'),
        }))
        .filter((item) => item.value > 0);
    };

    // 도넛 차트 데이터 미리 계산
    const donutData2024 = getBSDonutData(bsPrevPeriod);
    const donutData2025 = getBSDonutData(bsCurrentPeriod);

    const bsEntitySubTabList = [
      { id: '연결', label: '연결' },
      { id: 'OC(국내)', label: 'OC(국내)' },
      { id: '중국', label: '중국' },
      { id: '홍콩', label: '홍콩' },
      { id: 'ST미국', label: 'ST미국' },
      { id: '엔터테인먼트', label: '엔터' },
      { id: '베트남', label: '베트남' },
      { id: '기타(연결조정)', label: '기타' },
    ];

    const bsSubTabBar = (
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {bsEntitySubTabList.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBsEntitySubTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                tab.id === '연결'
                  ? bsEntitySubTab === '연결'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                  : bsEntitySubTab === tab.id
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    );

    if (bsEntitySubTab !== '연결') {
      return (
        <div className="space-y-4">
          {bsSubTabBar}
          {renderEntityStatementsTab({ forceEntity: bsEntitySubTab, forceMode: 'bs' })}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {bsSubTabBar}
        <div className="space-y-6">
        {/* 재무상태표 테이블 & 법인별 구성 */}
        <div className="flex flex-col xl:flex-row gap-4">
          {/* 좌측: 재무상태표 테이블 */}
          <div className="flex-1 min-w-0 xl:max-w-[55%]">
            <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-zinc-900">연결 재무상태표</h3>
                  </div>
                  {/* 동분기/전기말 선택 버튼 */}
                  <div className="inline-flex p-0.5 bg-zinc-100 rounded-lg border border-zinc-200">
                    <button
                      onClick={() => setBsCompareMode('sameQuarter')}
                      className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150 ${
                        bsCompareMode === 'sameQuarter'
                          ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                    >
                      동분기
                    </button>
                    <button
                      onClick={() => setBsCompareMode('prevYearEnd')}
                      className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150 ${
                        bsCompareMode === 'prevYearEnd'
                          ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                    >
                      전기말
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[130px]">과목</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[95px]">{getBsPeriodLabel(bsPrevPeriod)}</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[95px]">{getBsPeriodLabel(bsCurrentPeriod)}</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-600 min-w-[70px]">증감률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceItems.map((item, idx) => {
                      const val2024 = balanceSheetData[bsPrevPeriod]?.[item.key] || 0;
                      const val2025 = balanceSheetData[bsCurrentPeriod]?.[item.key] || 0;
                      
                      // 전기/당기 값이 모두 0인 경우 숨김 (총계 항목은 제외)
                      const isTotalItem = item.key.includes('총계');
                      if (!isTotalItem && val2024 === 0 && val2025 === 0) {
                        return null;
                      }
                      
                      const diff = val2025 - val2024;
                      const change = calculateYoY(val2025, val2024);
                      
                      const highlightClass = item.highlight === 'blue' ? 'bg-blue-50/50' 
                        : item.highlight === 'green' ? 'bg-emerald-50/50' 
                        : item.highlight === 'red' ? 'bg-rose-50/50' 
                        : '';
                      const selectableClass = item.selectable ? 'cursor-pointer hover:bg-zinc-100' : '';
                      const isSelected = selectedBSAccount === item.key;
                      const selectedClass = isSelected ? 'bg-zinc-100 ring-1 ring-zinc-300 ring-inset' : '';
                      
                      return (
                        <tr 
                          key={idx} 
                          className={`border-b border-zinc-100 ${highlightClass} ${selectableClass} ${selectedClass}`}
                          onClick={() => item.selectable && setSelectedBSAccount(item.key)}
                        >
                          <td className={`px-3 py-2 border-r border-zinc-200 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-600'} ${item.depth === 1 ? 'pl-6' : ''}`}>
                            {item.label}
                          </td>
                          <td className="text-right px-3 py-2 text-zinc-500 border-r border-zinc-200 tabular-nums">{formatNumber(val2024)}</td>
                          <td className={`text-right px-3 py-2 border-r border-zinc-200 tabular-nums ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{formatNumber(val2025)}</td>
                          <td className={`text-right px-3 py-2 font-medium border-r border-zinc-200 tabular-nums ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {diff !== 0 ? formatNumber(diff) : '-'}
                          </td>
                          <td className={`text-right px-3 py-2 font-medium tabular-nums ${parseFloat(change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {change !== '-' ? `${change}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* 우측: 법인별 구성 */}
          <div className="w-full xl:w-[45%] xl:min-w-[420px] flex-shrink-0 space-y-3">
            {/* 자본총계 변동 분석 - 자본총계 선택 시에만 표시 */}
            {selectedBSAccount === '자본총계' && (
              <>
              <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
                <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-200">
                  <h3 className="text-sm font-semibold text-zinc-800">자본총계 변동 분석 (YoY)</h3>
                </div>
                <div className="p-0">
                  <table className="w-full text-sm">
                    <tbody>
                      {/* 1. 당기순손익 */}
                      <tr className="border-b border-zinc-100 bg-emerald-50/30">
                        <td className="px-4 py-2 text-zinc-800 font-medium">1. 당기순손익</td>
                        <td className="px-4 py-2 text-right text-emerald-600 font-semibold tabular-nums">+4,032억</td>
                      </tr>
                      <tr className="border-b border-zinc-50">
                        <td className="px-4 py-1.5 pl-8 text-zinc-500 text-xs">① 연결당기순이익</td>
                        <td className="px-4 py-1.5 text-right text-emerald-500 text-xs tabular-nums">+4,027억</td>
                      </tr>
                      <tr className="border-b border-zinc-100">
                        <td className="px-4 py-1.5 pl-8 text-zinc-500 text-xs">② 확정급여제도 재측정요소</td>
                        <td className="px-4 py-1.5 text-right text-emerald-500 text-xs tabular-nums">+5억</td>
                      </tr>
                      
                      {/* 2. 기타자본거래 */}
                      <tr className="border-b border-zinc-100 bg-rose-50/30">
                        <td className="px-4 py-2 text-zinc-800 font-medium">2. 기타자본거래</td>
                        <td className="px-4 py-2 text-right text-rose-600 font-semibold tabular-nums">△980억</td>
                      </tr>
                      <tr className="border-b border-zinc-50">
                        <td className="px-4 py-1.5 pl-8 text-zinc-500 text-xs">① 연차배당</td>
                        <td className="px-4 py-1.5 text-right text-rose-500 text-xs tabular-nums">△639억</td>
                      </tr>
                      <tr className="border-b border-zinc-50">
                        <td className="px-4 py-1.5 pl-8 text-zinc-500 text-xs">② 자기주식취득</td>
                        <td className="px-4 py-1.5 text-right text-rose-500 text-xs tabular-nums">△65억</td>
                      </tr>
                      <tr className="border-b border-zinc-100">
                        <td className="px-4 py-1.5 pl-8 text-zinc-500 text-xs">③ STE 지분취득 자본조정 <span className="text-zinc-600">(모빈지분 인수 USD 19.16M)</span><span className="text-zinc-400">*</span></td>
                        <td className="px-4 py-1.5 text-right text-rose-500 text-xs tabular-nums">△276억</td>
                      </tr>
                      
                      {/* 3. 기타포괄손익 */}
                      <tr className="border-b border-zinc-100 bg-rose-50/30">
                        <td className="px-4 py-2 text-zinc-800 font-medium">3. 기타포괄손익</td>
                        <td className="px-4 py-2 text-right text-rose-600 font-semibold tabular-nums">△29억</td>
                      </tr>
                      <tr className="border-b border-zinc-200">
                        <td className="px-4 py-1.5 pl-8 text-zinc-500 text-xs">① 해외사업환산손실</td>
                        <td className="px-4 py-1.5 text-right text-rose-500 text-xs tabular-nums">△29억</td>
                      </tr>
                      
                      {/* 합계 */}
                      <tr className="bg-zinc-100">
                        <td className="px-4 py-2.5 text-zinc-900 font-semibold">자본총계 변동(1+2+3)</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-bold tabular-nums text-base">+3,023억</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* 자본 상세 테이블 */}
              <div className="mt-3 text-right text-[10px] text-zinc-400">(단위 : 백만원)</div>
              <div className="mt-1 overflow-hidden rounded-lg border border-zinc-200">
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-zinc-100">
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">자본</th>
                      <th className="px-3 py-2 text-right font-semibold text-zinc-700 border-b border-zinc-200">24년말</th>
                      <th className="px-3 py-2 text-right font-semibold text-zinc-700 border-b border-zinc-200">25년말</th>
                      <th className="px-3 py-2 text-right font-semibold text-zinc-700 border-b border-zinc-200">차이</th>
                      <th className="px-3 py-2 text-right font-semibold text-blue-600 border-b border-zinc-200">STE조정</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-100">
                      <td className="px-3 py-1.5 text-zinc-600">자본금</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">3,831</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">3,831</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">0</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">0</td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-3 py-1.5 text-zinc-600">자본잉여금</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">317,545</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">307,395</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 tabular-nums">(10,150)</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 tabular-nums">(10,150)</td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-3 py-1.5 text-zinc-600">기타포괄손익</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">10,009</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">7,584</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 tabular-nums">(2,425)</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">+758</td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-3 py-1.5 text-zinc-600">이익잉여금</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">1,283,355</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">1,619,815</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">+336,460</td>
                      <td className="px-3 py-1.5 text-right tabular-nums"></td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-3 py-1.5 text-zinc-600">자본조정</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">(52,539)</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">(59,049)</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 tabular-nums">(6,510)</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 tabular-nums">(6,510)</td>
                    </tr>
                    <tr className="border-b border-zinc-200 bg-amber-50/50">
                      <td className="px-3 py-1.5 text-zinc-800 font-semibold">비지배지분</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">15,098</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">0</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 font-bold tabular-nums">(15,098)</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 font-bold tabular-nums">(15,098)</td>
                    </tr>
                    <tr className="border-b border-zinc-200 bg-zinc-100">
                      <td className="px-3 py-2 text-zinc-800 font-semibold">합계</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">1,577,298</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">1,879,575</td>
                      <td className="px-3 py-2 text-right text-emerald-600 font-semibold tabular-nums">+302,277</td>
                      <td className="px-3 py-2 text-right text-rose-600 font-semibold tabular-nums">(24,490)</td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="px-3 py-1.5 text-zinc-500" colSpan="2"></td>
                      <td className="px-3 py-1.5 text-right text-zinc-500 whitespace-nowrap" colSpan="2">25년 비지배지분이익</td>
                      <td className="px-3 py-1.5 text-right text-rose-600 tabular-nums">(3,112)</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 text-right text-blue-700 font-semibold" colSpan="4">STE 취득(연결 자본상계 → 자본감소)</td>
                      <td className="px-3 py-2 text-right text-rose-600 font-bold tabular-nums border-2 border-rose-400 rounded">(27,603)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-3 px-3 py-2 bg-zinc-50 rounded-lg text-xs text-zinc-600">
                <div className="font-medium text-zinc-700 mb-1">* 연결자본 : 모회사의 자본+비지배지분</div>
                <div className="pl-3">{"→ 추가 비지배지분의 취득 : 지분율↑/자본감소(비지배지분제거)"}</div>
                <div className="mt-2 pl-2 text-zinc-500">
                  {"(예시) 모회사 자본 100/ 종속 자본 10 →"}<br/>
                  <span className="pl-8">{"①100%투자 : 연결자본 100 (종속 자본 10 상계 제거)"}</span><br/>
                  <span className="pl-8">{"②50%투자 : 연결자본 105 (모회사 100 + 비지배 5)"}</span>
                </div>
              </div>
              </>
            )}

            {/* 법인별 분석 헤더 */}
            <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">
                {balanceItems.find(i => i.key === selectedBSAccount)?.label || selectedBSAccount} 법인별 구성
              </h3>
              <p className="text-xs text-zinc-400">기말 기준 법인별 비중</p>
              
              {/* 도넛 차트 영역 */}
              <div className="flex justify-around mt-4">
                {/* 비교 기준 기간 도넛 */}
                <div className="text-center">
                  <p className="text-xs font-medium text-zinc-500 mb-2">{getBsPeriodLabel(bsPrevPeriod)}</p>
                  <div style={{ width: 120, height: 120 }}>
                    {donutData2024.length > 0 ? (
                      <PieChart width={120} height={120}>
                        <Pie
                          data={donutData2024}
                          cx={60}
                          cy={60}
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {donutData2024.map((entry, index) => (
                            <Cell key={`cell-2024-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip formatter={(value) => `${formatNumber(value)} 백만원`} />} />
                      </PieChart>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                    )}
                  </div>
                </div>
                {/* 2025년 도넛 */}
                <div className="text-center">
                  <p className="text-xs font-medium text-zinc-500 mb-2">
                    {(() => {
                      const [yearStr, qStr] = selectedPeriod.split('_');
                      const quarterNum = (qStr || 'Q4').replace('Q', '');
                      return `${yearStr}.${quarterNum}Q`;
                    })()}
                  </p>
                  <div style={{ width: 120, height: 120 }}>
                    {donutData2025.length > 0 ? (
                      <PieChart width={120} height={120}>
                        <Pie
                          data={donutData2025}
                          cx={60}
                          cy={60}
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {donutData2025.map((entry, index) => (
                            <Cell key={`cell-2025-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip formatter={(value) => `${formatNumber(value)} 백만원`} />} />
                      </PieChart>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 범례 */}
              <div className="flex flex-wrap justify-center gap-3 mt-3">
                {Object.entries(entityColors).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                    <span className="text-xs text-zinc-600">{name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 법인별 테이블 */}
            <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th rowSpan={2} className="text-center px-2 py-1.5 font-semibold text-zinc-600 min-w-[65px] whitespace-nowrap border-r border-zinc-200">법인</th>
                    <th colSpan={2} className="text-center px-1 py-1 font-semibold text-zinc-600 border-r border-zinc-200">{getBsPeriodLabel(bsPrevPeriod)}</th>
                    <th colSpan={2} className="text-center px-1 py-1 font-semibold text-zinc-600 border-r border-zinc-200">{getBsPeriodLabel(bsCurrentPeriod)}</th>
                    <th rowSpan={2} className="text-center px-1 py-1.5 font-semibold text-zinc-600 min-w-[55px] border-r border-zinc-200">차이</th>
                    <th rowSpan={2} className="text-center px-1 py-1.5 font-semibold text-zinc-600 min-w-[40px] whitespace-nowrap">YoY</th>
                  </tr>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[55px]">금액</th>
                    <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[38px] border-r border-zinc-200">비중</th>
                    <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[55px]">금액</th>
                    <th className="text-center px-1 py-1 font-medium text-zinc-500 min-w-[38px] border-r border-zinc-200">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // 전기/당기 모든 법인 합치기 (중복 제거)
                    const allEntities = new Map();
                    const totalCurr = getBSConsolidatedTotal(selectedBSAccount, bsCurrentPeriod);
                    const totalPrev = getBSConsolidatedTotal(selectedBSAccount, bsPrevPeriod);
                    
                    // 전기 데이터 추가
                    donutData2024.forEach(e => {
                      if (!allEntities.has(e.name)) {
                        allEntities.set(e.name, { name: e.name, color: e.color, prev: e.valueRaw ?? e.value, curr: 0 });
                      } else {
                        allEntities.get(e.name).prev = e.valueRaw ?? e.value;
                      }
                    });
                    
                    // 당기 데이터 추가/업데이트
                    donutData2025.forEach(e => {
                      if (!allEntities.has(e.name)) {
                        allEntities.set(e.name, { name: e.name, color: e.color, prev: 0, curr: e.valueRaw ?? e.value });
                      } else {
                        allEntities.get(e.name).curr = e.valueRaw ?? e.value;
                        allEntities.get(e.name).color = e.color;
                      }
                    });
                    
                    // 법인 순서 정렬
                    const entityOrder = ['OC(국내)', '중국', '홍콩', 'ST미국', '기타(연결조정)'];
                    const sortedEntities = Array.from(allEntities.values())
                      .filter(e => e.prev !== 0 || e.curr !== 0) // 전기/당기 모두 0인 경우 제외
                      .sort((a, b) => {
                        const orderA = entityOrder.indexOf(a.name);
                        const orderB = entityOrder.indexOf(b.name);
                        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
                      });
                    
                    return sortedEntities.map((entity, idx) => {
                      const diff = entity.curr - entity.prev;
                      const yoy = entity.prev !== 0 ? ((entity.curr - entity.prev) / Math.abs(entity.prev) * 100).toFixed(1) : (entity.curr !== 0 ? '신규' : '-');
                      const isPositive = parseFloat(yoy) >= 0;
                      const isDiffPositive = diff >= 0;
                      const prevRatio = totalPrev !== 0 ? ((Math.abs(entity.prev) / Math.abs(totalPrev)) * 100).toFixed(1) : '0.0';
                      const currRatio = totalCurr !== 0 ? ((Math.abs(entity.curr) / Math.abs(totalCurr)) * 100).toFixed(1) : '0.0';
                      
                      return (
                        <tr key={idx} className="border-b border-zinc-100">
                          <td className="px-2 py-1.5 text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: entity.color }}></span>
                            {entity.name}
                          </td>
                          <td className="text-right px-1 py-1.5 text-zinc-500 tabular-nums">{formatNumber(entity.prev)}</td>
                          <td className="text-right px-1 py-1.5 text-zinc-400 tabular-nums border-r border-zinc-100">{prevRatio}%</td>
                          <td className="text-right px-1 py-1.5 font-medium text-zinc-900 tabular-nums">{formatNumber(entity.curr)}</td>
                          <td className="text-right px-1 py-1.5 text-zinc-500 tabular-nums border-r border-zinc-100">{currRatio}%</td>
                          <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-100 ${isDiffPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isDiffPositive ? '+' : ''}{formatNumber(diff)}
                          </td>
                          <td className={`text-right px-1 py-1.5 font-medium tabular-nums whitespace-nowrap ${
                            yoy === '신규' ? 'text-blue-600' : yoy === '-' ? 'text-zinc-400' : isPositive ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {yoy === '신규' ? '신규' : yoy === '-' ? '-' : `${isPositive ? '+' : ''}${yoy}%`}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                  {/* 합계 행 */}
                  {(() => {
                    const totalPrev = getBSConsolidatedTotal(selectedBSAccount, bsPrevPeriod);
                    const totalCurr = getBSConsolidatedTotal(selectedBSAccount, bsCurrentPeriod);
                    const totalDiff = totalCurr - totalPrev;
                    const totalYoy = totalPrev !== 0 ? ((totalCurr - totalPrev) / totalPrev * 100).toFixed(1) : '-';
                    const isPositive = parseFloat(totalYoy) >= 0;
                    const isDiffPositive = totalDiff >= 0;

                    return (
                      <tr className="bg-zinc-50 font-medium">
                        <td className="px-2 py-1.5 text-zinc-900 whitespace-nowrap border-r border-zinc-200">합계</td>
                        <td className="text-right px-1 py-1.5 text-zinc-700 tabular-nums">{formatNumber(totalPrev)}</td>
                        <td className="text-right px-1 py-1.5 text-zinc-600 tabular-nums border-r border-zinc-200">100%</td>
                        <td className="text-right px-1 py-1.5 text-zinc-900 tabular-nums">{formatNumber(totalCurr)}</td>
                        <td className="text-right px-1 py-1.5 text-zinc-600 tabular-nums border-r border-zinc-200">100%</td>
                        <td className={`text-right px-1 py-1.5 tabular-nums border-r border-zinc-200 ${isDiffPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isDiffPositive ? '+' : ''}{formatNumber(totalDiff)}
                        </td>
                        <td className={`text-right px-1 py-1.5 tabular-nums whitespace-nowrap ${totalYoy === '-' ? 'text-zinc-400' : isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {totalYoy !== '-' ? `${isPositive ? '+' : ''}${totalYoy}%` : '-'}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* 분기별 추이 그래프 */}
            {balanceItems.find(i => i.key === selectedBSAccount)?.selectable && quarterlyEntityData[selectedBSAccount] && (
              <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-bold text-zinc-800 tracking-tight">분기별 추이</h3>
                  <div className="flex items-center gap-4">
                    {Object.entries(trendColors).map(([name, color]) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 rounded" style={{ backgroundColor: color }}></span>
                        <span className="text-xs text-zinc-500">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={quarterlyEntityData[selectedBSAccount]} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis 
                        dataKey="quarter" 
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        axisLine={{ stroke: '#d4d4d8' }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 9, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
                        width={45}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white/95 backdrop-blur-sm border border-zinc-200 rounded-lg shadow-lg px-3 py-2 min-w-[120px]">
                                <p className="text-xs font-medium text-zinc-500 mb-1.5 pb-1.5 border-b border-zinc-100">{label}</p>
                                <div className="space-y-1">
                                  {payload.map((entry, index) => (
                                    <div key={index} className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                        <span className="text-xs text-zinc-600">{entry.dataKey}</span>
                                      </div>
                                      <span className="text-xs font-semibold text-zinc-900">{formatNumber(entry.value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line type="monotone" dataKey="OC(국내)" stroke={trendColors['OC(국내)']} strokeWidth={2} dot={{ r: 3, fill: trendColors['OC(국내)'] }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="중국" stroke={trendColors['중국']} strokeWidth={2} dot={{ r: 3, fill: trendColors['중국'] }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="기타" stroke={trendColors['기타']} strokeWidth={2} dot={{ r: 3, fill: trendColors['기타'] }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-zinc-400 mt-2 text-center">* 기타 = 홍콩 + ST미국</p>
              </div>
            )}
          </div>
        </div>

        {/* 구성 상세 - 전체 너비 */}
        <>
        {/* 숨겨진 섹션 - 항상 복원 링크 표시 */}
        {isDetailSectionHidden(selectedBSAccount) ? (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => restoreDetailSection(selectedBSAccount)}
              className="text-xs text-zinc-400 hover:text-blue-500 transition-colors"
            >
              + 구성 상세 표시
            </button>
          </div>
        ) : (
        <div className="mt-4 bg-white rounded-lg border border-zinc-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              {balanceItems.find(i => i.key === selectedBSAccount)?.label || selectedBSAccount} 구성 상세
            </h3>
            <div className="flex items-center gap-1">
              {bsEditMode && (
                <>
                  <button
                    onClick={() => hideDetailSection(selectedBSAccount)}
                    className="text-xs px-1.5 py-1 rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300 transition-colors"
                    title="이 과목의 구성 상세 숨기기"
                  >
                    👁️‍🗨️
                  </button>
                  <button
                    onClick={exportEditData}
                    className="text-xs px-1.5 py-1 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
                    title="JSON 내보내기"
                  >
                    📥
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs px-1.5 py-1 rounded bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
                    title="JSON 가져오기"
                  >
                    📤
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('재무상태표 분석 내용을 기본값으로 초기화하시겠습니까?')) {
                        resetEditData('bs');
                      }
                    }}
                    className="text-xs px-1.5 py-1 rounded bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors"
                    title="초기화"
                  >
                    ↺
                  </button>
                </>
              )}
              <button
                onClick={() => setBsEditMode(!bsEditMode)}
                className={`p-1 rounded transition-colors ${
                  bsEditMode 
                    ? 'text-blue-500 bg-blue-50' 
                    : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
                }`}
                title={bsEditMode ? '편집 완료' : '분석 문장 편집'}
              >
                {bsEditMode ? '✓' : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              const curr2025Raw = getAlignedBSBreakdown(selectedBSAccount, bsCurrentPeriod);
              const curr2024Raw = getAlignedBSBreakdown(selectedBSAccount, bsPrevPeriod);
              
              // '기타' 키를 '연결조정'으로 합산 (중복 방지)
              const mergeGitaToAdjustment = (data) => {
                const result = { ...data };
                if (result['기타'] !== undefined) {
                  result['연결조정'] = (result['연결조정'] || 0) + result['기타'];
                  delete result['기타'];
                }
                return result;
              };
              
              const curr2025 = mergeGitaToAdjustment(curr2025Raw);
              const curr2024 = mergeGitaToAdjustment(curr2024Raw);
              
              // 법인별 증감 계산
              const changes = Object.keys(curr2025)
                .map(entity => ({
                  name: entity,
                  currVal: curr2025[entity] || 0,
                  prevVal: curr2024[entity] || 0,
                  diff: (curr2025[entity] || 0) - (curr2024[entity] || 0),
                  rate: curr2024[entity] !== 0 ? ((curr2025[entity] - curr2024[entity]) / Math.abs(curr2024[entity]) * 100).toFixed(1) : 0
                }));
              
              // 법인 순서 고정: OC(국내), 중국, 홍콩, ST미국, 연결조정
              const bsEntityOrder = ['OC(국내)', '중국', '홍콩', 'ST미국', '연결조정'];
              const sortedChanges = [...changes].sort((a, b) => {
                const orderA = bsEntityOrder.indexOf(a.name);
                const orderB = bsEntityOrder.indexOf(b.name);
                return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
              });
              
              // 숨겨진 법인 필터링
              const visibleChanges = sortedChanges.filter(row => 
                !getHiddenEntitiesForAccount(selectedBSAccount).includes(row.name)
              );
              
              const total2025 = getBSConsolidatedTotal(selectedBSAccount, bsCurrentPeriod);
              const total2024 = getBSConsolidatedTotal(selectedBSAccount, bsPrevPeriod);
              const totalDiff = total2025 - total2024;
              
              const colorMap = {
                'OC(국내)': { bg: 'bg-blue-50/50', border: 'border-blue-400' },
                '중국': { bg: 'bg-amber-50/50', border: 'border-amber-400' },
                '홍콩': { bg: 'bg-violet-50/50', border: 'border-violet-400' },
                'ST미국': { bg: 'bg-emerald-50/50', border: 'border-emerald-400' },
              };
              
              return visibleChanges.map((row, idx) => {
                const isPositive = row.diff >= 0;
                const diffBil = Math.round(row.diff / 100); // 억원 단위
                const colors = colorMap[row.name] || { bg: 'bg-zinc-50', border: 'border-zinc-300' };
                
                // 문장형 분석 생성 (기본값) 또는 편집된 값 사용
                const editKey = `${selectedBSAccount}_${row.name}`;
                const defaultTexts = generateBSAnalysisText(selectedBSAccount, row.name, bsCurrentPeriod, bsPrevPeriod);
                const bsAnalysisTexts = bsEditData[editKey] || defaultTexts;
                
                return (
                  <div key={idx} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 relative">
                    {/* 삭제 버튼 - 편집 모드에서만 표시 */}
                    {bsEditMode && (
                      <button
                        onClick={() => hideEntityCard(selectedBSAccount, row.name)}
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-rose-100 text-rose-500 hover:bg-rose-200 transition-colors text-xs"
                        title={`${row.name} 카드 숨기기`}
                      >
                        ×
                      </button>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span 
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entityColors[row.name] }}
                        ></span>
                        <span className="font-medium text-zinc-800 text-sm">{row.name}</span>
                      </div>
                      <span className={`font-bold text-sm ${isPositive ? 'text-emerald-600' : 'text-rose-600'} ${bsEditMode ? 'mr-4' : ''}`}>
                        {isPositive ? '+' : ''}{formatNumber(diffBil)}억원
                      </span>
                    </div>
                    {/* 문장형 증감 분석 - 편집 가능 */}
                    {bsEditMode ? (
                      <div className="space-y-1">
                        {bsAnalysisTexts.map((text, i) => (
                          <div key={i} className="flex items-start gap-1">
                            <span className="text-[11px] text-zinc-500 mt-1.5">•</span>
                            <textarea
                              value={text}
                              onChange={(e) => {
                                const newTexts = [...bsAnalysisTexts];
                                newTexts[i] = e.target.value;
                                setBsEditData(prev => ({
                                  ...prev,
                                  [editKey]: newTexts
                                }));
                              }}
                              className="flex-1 text-[11px] text-zinc-600 leading-relaxed px-1.5 py-1 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                              rows={2}
                            />
                            <button
                              onClick={() => {
                                const newTexts = bsAnalysisTexts.filter((_, i2) => i2 !== i);
                                setBsEditData(prev => ({
                                  ...prev,
                                  [editKey]: newTexts.length > 0 ? newTexts : ['']
                                }));
                              }}
                              className="text-zinc-400 hover:text-rose-500 transition-colors p-0.5 mt-0.5"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const newTexts = [...bsAnalysisTexts, ''];
                            setBsEditData(prev => ({
                              ...prev,
                              [editKey]: newTexts
                            }));
                          }}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-blue-500 transition-colors mt-1"
                          title="항목 추가"
                        >
                          <span className="text-sm">＋</span> 항목 추가
                        </button>
                      </div>
                    ) : (
                      bsAnalysisTexts.length > 0 && (
                        <div className="space-y-1">
                          {bsAnalysisTexts.map((text, i) => (
                            text && (
                              <p key={i} className="text-[11px] text-zinc-600 leading-relaxed">
                                • {text}
                              </p>
                            )
                          ))}
                        </div>
                      )
                    )}
                  </div>
                );
              });
            })()}
          </div>
          
          {/* 숨겨진 법인 복원 영역 - 편집 모드에서만 */}
          {bsEditMode && getHiddenEntitiesForAccount(selectedBSAccount).length > 0 && (
            <div className="mt-2 p-2 bg-zinc-100 rounded-lg">
              <span className="text-xs text-zinc-500 mr-2">숨긴 법인:</span>
              {getHiddenEntitiesForAccount(selectedBSAccount).map(entity => (
                <button
                  key={entity}
                  onClick={() => restoreEntityCard(selectedBSAccount, entity)}
                  className="text-xs px-2 py-0.5 mr-1 rounded bg-white border border-zinc-300 text-zinc-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  {entity} ↩
                </button>
              ))}
            </div>
          )}
          
          {/* 전체 요약 */}
              {(() => {
                const total2025 = getBSConsolidatedTotal(selectedBSAccount, bsCurrentPeriod);
                const total2024 = getBSConsolidatedTotal(selectedBSAccount, bsPrevPeriod);
                const totalDiff = total2025 - total2024;
                const totalDiffBil = Math.round(totalDiff / 100);
                const totalChange = total2024 !== 0 ? ((totalDiff / Math.abs(total2024)) * 100).toFixed(1) : 0;
                const isPositive = totalDiff >= 0;
                
                // 편집된 전체 데이터
                const totalEditKey = `${selectedBSAccount}_total`;
                const totalEdited = bsEditData[totalEditKey] || {};
                const displayTotalAmount = totalEdited.amount !== undefined ? totalEdited.amount : `${isPositive ? '+' : ''}${formatNumber(totalDiffBil)}`;
                const displayTotalRate = totalEdited.rate !== undefined ? totalEdited.rate : `${isPositive ? '+' : ''}${totalChange}`;
                
                return (
                  <div className="mt-3 pt-3 border-t border-zinc-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-600 font-medium">전체 YoY 변동</span>
                      {bsEditMode ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={displayTotalAmount}
                            onChange={(e) => setBsEditData(prev => ({
                              ...prev,
                              [totalEditKey]: { ...prev[totalEditKey], amount: e.target.value }
                            }))}
                            className="w-20 text-right text-xs font-bold px-1 py-0.5 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <span className="text-zinc-500">억원 (</span>
                          <input
                            type="text"
                            value={displayTotalRate}
                            onChange={(e) => setBsEditData(prev => ({
                              ...prev,
                              [totalEditKey]: { ...prev[totalEditKey], rate: e.target.value }
                            }))}
                            className="w-14 text-right text-xs font-bold px-1 py-0.5 rounded bg-white border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <span className="text-zinc-500">%)</span>
                        </div>
                      ) : (
                        <span className={`font-bold ${parseFloat(displayTotalRate) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {displayTotalAmount}억원 ({displayTotalRate}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      </div>
      </div>
    );
  };

  // ============================================
  // 법인별 손익/재무상태표 탭
  // ============================================
  const renderEntityStatementsTab = ({ forceEntity = null, forceMode = 'all' } = {}) => {
    const q = Number((selectedPeriod?.split('_')?.[1] || 'Q1').replace('Q', '')) || 1;
    const period25 = `2025_${q}Q`;
    const period26 = `2026_${q}Q`;
    const bsPeriod25 = '2025_4Q'; // 법인별 BS는 전기말(2025.4Q) 비교
    const entityTabs = [
      { label: 'OC(국내)', key: 'OC(국내)' },
      { label: '중국', key: '중국' },
      { label: '홍콩', key: '홍콩' },
      { label: 'ST', key: 'ST미국' },
      { label: '엔터테인먼트', key: '엔터테인먼트' },
      { label: '베트남', key: '베트남' },
      { label: '기타(연결조정)', key: '기타(연결조정)' },
    ];
    const selectedEntityKey = forceEntity || entityTabs.find((t) => t.label === selectedEntityTab)?.key || 'OC(국내)';
    const displayEntityName = forceEntity
      ? (entityTabs.find(t => t.key === forceEntity)?.label || forceEntity)
      : selectedEntityTab;
    const entityKeyAliases = {
      'OC(국내)': ['OC(국내)', 'F&F', 'F&F '],
      중국: ['중국', 'F&F Shanghai', 'F&F Shanghai '],
      홍콩: ['홍콩', 'FnF HONGKONG', 'FnF HONGKONG '],
      ST미국: ['ST미국', '세르지오'],
      엔터테인먼트: ['엔터테인먼트', '엔터테인머트'],
      베트남: ['베트남', 'F&F 베트남', 'F&F 베트남 '],
      '기타(연결조정)': ['기타(연결조정)', '기타', '연결조정', '연결조정분개', '내부거래제거', '빅텐츠'],
    };
    const entityCandidates = entityKeyAliases[selectedEntityKey] || [selectedEntityKey];
    const getPrevYearSameQuarter = (period) =>
      typeof period === 'string' && period.startsWith('2026_')
        ? period.replace(/^2026_/, '2025_')
        : null;

    // 손익계산서 탭과 동일 과목·강조 (법인별 금액은 getISRaw)
    const entityOperatingItems = [
      { key: '매출액', label: 'I. 매출액', depth: 0, bold: true, selectable: true },
      { key: '매출원가', label: 'II. 매출원가', depth: 0, bold: true, selectable: true },
      { key: '매출총이익', label: 'III. 매출총이익', depth: 0, bold: true, selectable: true },
      { key: '매출총이익률', label: '매출총이익률', depth: 0, isRate: true, rateOf: ['매출총이익', '매출액'], highlight: 'blue' },
      { key: '판매비와관리비', label: 'IV. 판매비와관리비', depth: 0, bold: true },
      { key: '인건비', label: '(1)인건비', depth: 1, selectable: true },
      { key: '광고선전비', label: '(2)광고선전비', depth: 1, selectable: true },
      { key: '수수료', label: '(3)수수료', depth: 1, selectable: true },
      { key: '감가상각비', label: '(4)감가상각비', depth: 1, selectable: true },
      { key: '기타판관비', label: '(5)기타', depth: 1, selectable: true },
      { key: '영업이익', label: 'V. 영업이익', depth: 0, bold: true, highlight: 'green', selectable: true },
      { key: '영업이익률', label: '영업이익률', depth: 0, isRate: true, rateOf: ['영업이익', '매출액'], highlight: 'blue' },
    ];

    const entityNonOperatingItems = [
      { key: '영업외손익', label: 'VI. 영업외손익', depth: 0, bold: true, selectable: true },
      { key: '외환손익', label: '(1)외환손익', depth: 1, selectable: true },
      { key: '선물환손익', label: '(2)선물환손익', depth: 1, selectable: true },
      { key: '금융상품손익', label: '(3)금융상품손익', depth: 1, selectable: true },
      { key: '이자손익', label: '(4)이자손익', depth: 1, selectable: true },
      { key: '배당수익', label: '(5)배당수익', depth: 1, selectable: true },
      { key: '기부금', label: '(6)기부금', depth: 1, selectable: true },
      { key: '기타손익', label: '(7)기타손익', depth: 1, selectable: true },
      { key: '지분법손익', label: 'VII. 지분법손익', depth: 0, bold: true, selectable: true },
      { key: '법인세비용차감전순이익', label: 'VIII. 법인세비용차감전순이익', depth: 0, bold: true, selectable: true },
      { key: '법인세비용', label: 'IX. 법인세비용', depth: 0, bold: true, selectable: true },
      { key: '법인세율', label: '법인세율', depth: 0, isRate: true, rateOf: ['법인세비용', '법인세비용차감전순이익'], highlight: 'blue' },
      { key: '당기순이익', label: 'X. 당기순이익', depth: 0, bold: true, highlight: 'green', selectable: true },
      { key: '당기순이익률', label: '당기순이익률', depth: 0, isRate: true, rateOf: ['당기순이익', '매출액'], highlight: 'blue' },
    ];

    // 재무상태표 탭과 동일 과목·강조
    const entityBalanceItems = [
      { key: '현금성자산', label: '현금성자산', depth: 1, selectable: true },
      { key: '금융자산', label: '금융자산', depth: 1, selectable: true },
      { key: '매출채권', label: '매출채권', depth: 1, selectable: true },
      { key: '대여금', label: '대여금', depth: 1 },
      { key: '재고자산', label: '재고자산', depth: 1, selectable: true },
      { key: '투자자산', label: '투자자산', depth: 1, selectable: true },
      { key: '유무형자산', label: '유·무형자산', depth: 1, selectable: true },
      { key: '사용권자산', label: '사용권자산', depth: 1, selectable: true },
      { key: '기타자산', label: '기타자산', depth: 1, selectable: true },
      { key: '자산총계', label: '자산총계', bold: true, highlight: 'blue', selectable: true },
      { key: '매입채무', label: '매입채무', depth: 1, selectable: true },
      { key: '미지급금', label: '미지급금', depth: 1, selectable: true },
      { key: '보증금', label: '보증금', depth: 1, selectable: true },
      { key: '차입금', label: '차입금', depth: 1, selectable: true },
      { key: '리스부채', label: '리스부채', depth: 1, selectable: true },
      { key: '금융부채', label: '금융부채', depth: 1 },
      { key: '기타부채', label: '기타부채', depth: 1, selectable: true },
      { key: '부채총계', label: '부채총계', bold: true, highlight: 'red', selectable: true },
      { key: '자본총계', label: '자본총계', bold: true, highlight: 'green', selectable: true },
    ];

    const isAliasMap = {
      판매비와관리비: ['판매비와관리비', '판관비'],
      법인세비용차감전순이익: ['법인세비용차감전순이익', '세전이익'],
      수수료: ['수수료', '지급수수료'],
      기타판관비: ['기타판관비'],
      매출액: ['매출액'],
      매출원가: ['매출원가'],
      매출총이익: ['매출총이익'],
      인건비: ['인건비'],
      급여: ['급여'],
      퇴직급여: ['퇴직급여'],
      광고선전비: ['광고선전비'],
      감가상각비: ['감가상각비'],
      영업이익: ['영업이익'],
      영업외손익: ['영업외손익'],
      외환손익: ['외환손익'],
      선물환손익: ['선물환손익'],
      금융상품손익: ['금융상품손익'],
      이자손익: ['이자손익'],
      배당수익: ['배당수익', '배당금수익'],
      기부금: ['기부금'],
      기타손익: ['기타손익'],
      잡이익: ['잡이익'],
      잡손실: ['잡손실'],
      지분법손익: ['지분법손익'],
      지분법이익: ['지분법이익'],
      지분법손실: ['지분법손실'],
      영업외수익: ['영업외수익'],
      영업외비용: ['영업외비용'],
      이자수익: ['이자수익'],
      이자비용: ['이자비용'],
      외환차익: ['외환차익'],
      외환차손: ['외환차손'],
      외화환산이익: ['외화환산이익'],
      외화환산손실: ['외화환산손실'],
      파생상품평가이익: ['파생상품평가이익'],
      파생상품평가손실: ['파생상품평가손실'],
      파생상품거래이익: ['파생상품거래이익'],
      파생상품거래손실: ['파생상품거래손실'],
      당기손익인식금융자산처분이익: ['당기손익인식금융자산처분이익'],
      당기손익인식금융자산처분손실: ['당기손익인식금융자산처분손실'],
      당기손익공정가치측정금융자산평가이익: ['당기손익공정가치측정금융자산평가이익', '당기손익공정가치측정금융자산 평가이익'],
      당기손익공정가치측정금융자산평가손실: ['당기손익공정가치측정금융자산평가손실', '당기손익공정가치측정금융자산 평가손실'],
      법인세비용: ['법인세비용'],
      당기순이익: ['당기순이익'],
    };

    const normalizeEntityPeriod = (period) => {
      if (typeof period !== 'string') return period;
      if (/_1Q_Year$/.test(period)) return period.replace('_1Q_Year', '_1Q');
      return period;
    };

    const getISRaw = (account, period) => {
      const resolvedPeriod = normalizeEntityPeriod(period);
      const keys = isAliasMap[account] || [account];
      for (const k of keys) {
        for (const ek of entityCandidates) {
          // CSV 최신값을 최우선으로 사용해 파일 업데이트를 즉시 반영
          const csvKey = normalizeAccount(k);
          const fromCsv = entityCsvLookup?.is?.[resolvedPeriod]?.[csvKey]?.[ek];
          if (fromCsv !== undefined) return fromCsv;
        }
      }

      // 파생 계정 보정 (매핑 누락 대응)
      if (account === '인건비') {
        const salary = getISRaw('급여', resolvedPeriod);
        const retirement = getISRaw('퇴직급여', resolvedPeriod);
        if (salary !== undefined || retirement !== undefined) return Math.round(Number(salary || 0) + Number(retirement || 0));
      }
      if (account === '기타판관비') {
        const sga = getISRaw('판매비와관리비', resolvedPeriod);
        const labor = getISRaw('인건비', resolvedPeriod);
        const ad = getISRaw('광고선전비', resolvedPeriod);
        const fee = getISRaw('수수료', resolvedPeriod);
        const dep = getISRaw('감가상각비', resolvedPeriod);
        if (sga !== undefined) return Math.round(Number(sga || 0) - Number(labor || 0) - Number(ad || 0) - Number(fee || 0) - Number(dep || 0));
      }
      if (account === '판매비와관리비') {
        // ⚠️ '기타판관비'는 포함 금지: 기타판관비→판관비→기타판관비 무한재귀 방지
        const parts = ['인건비', '광고선전비', '수수료', '감가상각비'];
        const vals = parts.map((k) => getISRaw(k, resolvedPeriod));
        if (vals.some((v) => v !== undefined)) return vals.reduce((s, v) => s + Number(v || 0), 0);
      }
      if (account === '외환손익') {
        const g1 = getISRaw('외환차익', resolvedPeriod);
        const g2 = getISRaw('외화환산이익', resolvedPeriod);
        const l1 = getISRaw('외환차손', resolvedPeriod);
        const l2 = getISRaw('외화환산손실', resolvedPeriod);
        if (g1 !== undefined || g2 !== undefined || l1 !== undefined || l2 !== undefined) {
          return Math.round(Number(g1 || 0) + Number(g2 || 0) - Number(l1 || 0) - Number(l2 || 0));
        }
      }
      if (account === '이자손익') {
        const income = getISRaw('이자수익', resolvedPeriod);
        const expense = getISRaw('이자비용', resolvedPeriod);
        if (income !== undefined || expense !== undefined) return Math.round(Number(income || 0) - Number(expense || 0));
      }
      if (account === '금융상품손익') {
        const parts = ['파생상품평가이익', '파생상품거래이익', '당기손익인식금융자산처분이익', '당기손익공정가치측정금융자산평가이익'];
        const lparts = ['파생상품평가손실', '파생상품거래손실', '당기손익인식금융자산처분손실', '당기손익공정가치측정금융자산평가손실'];
        const gains = parts.map(k => getISRaw(k, resolvedPeriod));
        const losses = lparts.map(k => getISRaw(k, resolvedPeriod));
        if (gains.some(v => v !== undefined) || losses.some(v => v !== undefined)) {
          return Math.round(gains.reduce((s, v) => s + Number(v || 0), 0) - losses.reduce((s, v) => s + Number(v || 0), 0));
        }
      }
      if (account === '기타손익') {
        const gain = getISRaw('잡이익', resolvedPeriod);
        const loss = getISRaw('잡손실', resolvedPeriod);
        if (gain !== undefined || loss !== undefined) return Math.round(Number(gain || 0) - Number(loss || 0));
      }
      if (account === '영업외손익') {
        const nonOpIncome = getISRaw('영업외수익', resolvedPeriod);
        const nonOpExpense = getISRaw('영업외비용', resolvedPeriod);
        if (nonOpIncome !== undefined || nonOpExpense !== undefined) {
          return Math.round(Number(nonOpIncome || 0) - Number(nonOpExpense || 0));
        }
        const parts = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익'];
        const vals = parts.map((k) => getISRaw(k, resolvedPeriod));
        if (vals.some((v) => v !== undefined)) return vals.reduce((s, v) => s + Number(v || 0), 0);
      }
      if (account === '지분법손익') {
        const gain = getISRaw('지분법이익', resolvedPeriod);
        const loss = getISRaw('지분법손실', resolvedPeriod);
        if (gain !== undefined || loss !== undefined) return Number(gain || 0) - Number(loss || 0);
      }
      if (account === '법인세비용차감전순이익') {
        const op = getISRaw('영업이익', resolvedPeriod);
        const nonOp = getISRaw('영업외손익', resolvedPeriod);
        const equity = getISRaw('지분법손익', resolvedPeriod);
        if (op !== undefined || nonOp !== undefined || equity !== undefined) {
          return Number(op || 0) + Number(nonOp || 0) + Number(equity || 0);
        }
      }
      if (account === '당기순이익') {
        const ebt = getISRaw('법인세비용차감전순이익', resolvedPeriod);
        const tax = getISRaw('법인세비용', resolvedPeriod);
        if (ebt !== undefined || tax !== undefined) return Number(ebt || 0) - Number(tax || 0);
      }
      const prevYearPeriod = getPrevYearSameQuarter(resolvedPeriod);
      if (prevYearPeriod) return getISRaw(account, prevYearPeriod);
      return undefined;
    };
    const getBSRaw = (account, period) => {
      const resolvedPeriod = normalizeEntityPeriod(period);
      const bsAliasMap = {
        현금성자산: ['현금및현금성자산', '현금성자산'],
        금융자산: ['기타유동금융자산', '유동금융자산', '당기손익공정가치측정금융자산', '유동당기손익공정가치측정금융자산'],
        매출채권: ['매출채권'],
        대여금: ['단기대여금', '대여금'],
        재고자산: ['재고자산', '상품', '제품', '원재료', '재공품', '미착품'],
        투자자산: ['투자자산', '관계기업투자', '관계기업및종속기업투자'],
        유무형자산: ['유무형자산', '유형자산', '무형자산', '토지', '건물', '영업권', '소프트웨어', '공기구비품'],
        사용권자산: ['사용권자산'],
        기타자산: ['기타자산', '기타비유동자산', '기타유동자산'],
        자산총계: ['자산총계'],
        매입채무: ['매입채무'],
        미지급금: ['미지급금'],
        보증금: ['보증금', '유동성보증금'],
        차입금: ['차입금', '단기차입금', '장기차입금'],
        리스부채: ['리스부채', '유동리스부채'],
        금융부채: ['금융부채'],
        기타부채: ['기타부채', '비유동부채', '유동부채'],
        부채총계: ['부채총계'],
        자본총계: ['자본총계'],
      };
      const candidates = bsAliasMap[account] || [account];
      for (const c of candidates) {
        const csvKey = normalizeAccount(c);
        for (const ek of entityCandidates) {
          const fromCsv = entityCsvLookup?.bs?.[resolvedPeriod]?.[csvKey]?.[ek];
          if (fromCsv !== undefined) return fromCsv;
        }
      }

      // CSV에 값이 없을 때만 기존 내장 데이터로 폴백
      const p = entityBSData?.[resolvedPeriod];
      if (p && p[account]) {
        for (const ek of entityCandidates) {
          if (p[account][ek] !== undefined) return p[account][ek];
        }
      }
      const d = bsDetailData?.[account]?.[resolvedPeriod];
      if (d) {
        for (const ek of entityCandidates) {
          if (d[ek] !== undefined) return d[ek];
        }
      }

      // BS 파생/별칭 보정 (매핑 누락 대응)
      const sumFromDetail = (keys) =>
        keys.reduce((sum, k) => {
          const dv = bsDetailData?.[k]?.[resolvedPeriod];
          if (!dv) return sum;
          for (const ek of entityCandidates) {
            if (dv[ek] !== undefined) return sum + Number(dv[ek] || 0);
          }
          return sum;
        }, 0);

      if (account === '재고자산') {
        const v = sumFromDetail(['상품', '상품(충당금)', '제품', '재공품', '원재료', '미착품']);
        if (v !== 0) return v;
      }
      if (account === '유무형자산') {
        const v = sumFromDetail(['토지', '건물', '토지(투자부동산)', '건물(투자부동산)', '임차시설물', '공기구비품', '건설중인자산', '라이선스', '브랜드', '소프트웨어', '영업권']);
        if (v !== 0) return v;
      }
      if (account === '투자자산') {
        const v = sumFromDetail(['관계기업투자']);
        if (v !== 0) return v;
      }
      if (account === '차입금') {
        const v = sumFromDetail(['단기차입금', '장기차입금']);
        if (v !== 0) return v;
      }
      if (account === '현금성자산') {
        const v = sumFromDetail(['현금및현금성자산']);
        if (v !== 0) return v;
      }
      if (account === '금융자산') {
        const v = sumFromDetail(['기타유동금융자산', '당기손익-공정가치금융자산']);
        if (v !== 0) return v;
      }
      if (account === '사용권자산') {
        const v = sumFromDetail(['사용권자산']);
        if (v !== 0) return v;
      }
      const prevYearPeriod = getPrevYearSameQuarter(resolvedPeriod);
      if (prevYearPeriod) return getBSRaw(account, prevYearPeriod);
      return undefined;
    };

    const valIS = (key, period) => Number(getISRaw(key, period) ?? 0);
    const valBS = (key, period) => Number(getBSRaw(key, period) ?? 0);

    const entityReasonKey = (stmt, rowKey) => `${selectedPeriod}::${selectedEntityTab}::${stmt}::${rowKey}`;

    const setEntityReason = (stmt, rowKey, text) => {
      const k = entityReasonKey(stmt, rowKey);
      setEntityStmtReasons((prev) => {
        const next = { ...prev };
        const t = String(text ?? '').trim();
        if (!t) delete next[k];
        else next[k] = text;
        return next;
      });
    };

    const getEntityReason = (stmt, rowKey) => entityStmtReasons[entityReasonKey(stmt, rowKey)] || '';

    const renderReasonCell = (stmt, rowKey) => (
      <td className="align-top px-2 py-1.5 border-l border-zinc-200 min-w-[168px] max-w-[min(280px,36vw)]">
        <textarea
          value={getEntityReason(stmt, rowKey)}
          onChange={(e) => setEntityReason(stmt, rowKey, e.target.value)}
          rows={2}
          placeholder="증감 사유 입력"
          className="w-full text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 resize-y min-h-[2.5rem] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/40 focus:bg-white"
        />
      </td>
    );

    const calcRateDisplay = (numerator, denominator) => {
      if (!denominator || denominator === 0) return '-';
      return ((Number(numerator) / Number(denominator)) * 100).toFixed(1) + '%';
    };

    const calcRateDiffDisplay = (current, prev) => {
      if (current === '-' || prev === '-') return '-';
      const currNum = parseFloat(current);
      const prevNum = parseFloat(prev);
      if (Number.isNaN(currNum) || Number.isNaN(prevNum)) return '-';
      const diff = currNum - prevNum;
      return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%p';
    };

    const renderEntityIncomeRow = (item, idx) => {
      if (item.isRate) {
        const [num, denom] = item.rateOf;
        const ratePrev = calcRateDisplay(valIS(num, period25), valIS(denom, period25));
        const rateCurr = calcRateDisplay(valIS(num, period26), valIS(denom, period26));
        const rateDiff = calcRateDiffDisplay(rateCurr, ratePrev);
        return (
          <tr key={`eis-r-${idx}`} className="border-b border-zinc-100 bg-zinc-50/50">
            <td className="px-3 py-2 text-blue-600 italic border-r border-zinc-200">{item.label}</td>
            <td className="text-center px-3 py-2 text-blue-600 border-r border-zinc-200">{ratePrev}</td>
            <td className="text-center px-3 py-2 font-medium text-blue-600 border-r border-zinc-200 bg-zinc-50">{rateCurr}</td>
            <td
              colSpan={2}
              className={`text-center px-3 py-2 font-medium border-r border-zinc-200 ${
                rateDiff.includes('+') ? 'text-emerald-600' : rateDiff.includes('-') && rateDiff !== '-' ? 'text-rose-600' : 'text-blue-600'
              }`}
            >
              {rateDiff}
            </td>
            {renderReasonCell('is', item.key)}
          </tr>
        );
      }

      const v25 = valIS(item.key, period25);
      const v26 = valIS(item.key, period26);
      const diff = v26 - v25;
      const changeRate = calculateYoY(v26, v25);
      const highlightClass = item.highlight === 'green' ? 'bg-emerald-50/50' : '';

      return (
        <tr key={`eis-${item.key}-${idx}`} className={`border-b border-zinc-100 ${highlightClass}`}>
          <td
            className={`px-3 py-2 border-r border-zinc-200 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-600'} ${item.depth === 1 ? 'pl-6' : ''}`}
          >
            {item.label}
          </td>
          <td className="text-right px-3 py-2 text-zinc-500 border-r border-zinc-200 tabular-nums">{formatNumber(v25)}</td>
          <td
            className={`text-right px-3 py-2 border-r border-zinc-200 tabular-nums bg-zinc-50/50 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}
          >
            {formatNumber(v26)}
          </td>
          <td className={`text-right px-3 py-2 font-medium border-r border-zinc-200 tabular-nums ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {diff !== 0 ? formatNumber(diff) : '-'}
          </td>
          <td className={`text-right px-3 py-2 font-medium tabular-nums border-r border-zinc-200 ${parseFloat(changeRate) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {changeRate !== '-' ? `${changeRate}%` : '-'}
          </td>
          {renderReasonCell('is', item.key)}
        </tr>
      );
    };

    const entityIsThead = (
      <thead>
        <tr className="bg-zinc-50 border-b border-zinc-200">
          <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[130px]">과목</th>
          <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[95px]">{getBsPeriodLabel(period25)}</th>
          <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[95px]">{getBsPeriodLabel(period26)}</th>
          <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
          <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[70px]">증감률</th>
          <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 min-w-[168px] border-l border-zinc-200">증감 사유</th>
        </tr>
      </thead>
    );

    // IS 섹션 JSX (영업 + 영업외)
    const entityISSections = (
      <>
        <div>
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => setEntityStmtOpExpanded(!entityStmtOpExpanded)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-zinc-200 transition-colors"
              title={entityStmtOpExpanded ? '섹션 접기' : '섹션 펼치기'}
            >
              <span className={`text-zinc-500 text-sm transition-transform duration-200 ${entityStmtOpExpanded ? 'rotate-90' : ''}`}>▶</span>
            </button>
            <h2
              className="text-[13px] font-bold text-zinc-800 tracking-tight cursor-pointer"
              onClick={() => setEntityStmtOpExpanded(!entityStmtOpExpanded)}
            >
              영업 실적
            </h2>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          {entityStmtOpExpanded && (
            <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                <h3 className="text-sm font-semibold text-zinc-900">{displayEntityName} 손익계산서 (영업)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {entityIsThead}
                  <tbody>{entityOperatingItems.map((item, idx) => renderEntityIncomeRow(item, idx))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-zinc-300" />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => setEntityStmtNonOpExpanded(!entityStmtNonOpExpanded)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-zinc-200 transition-colors"
              title={entityStmtNonOpExpanded ? '섹션 접기' : '섹션 펼치기'}
            >
              <span className={`text-zinc-500 text-sm transition-transform duration-200 ${entityStmtNonOpExpanded ? 'rotate-90' : ''}`}>▶</span>
            </button>
            <h2
              className="text-[13px] font-bold text-zinc-800 tracking-tight cursor-pointer"
              onClick={() => setEntityStmtNonOpExpanded(!entityStmtNonOpExpanded)}
            >
              영업 외 실적
            </h2>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          {entityStmtNonOpExpanded && (
            <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                <h3 className="text-sm font-semibold text-zinc-900">{displayEntityName} 손익계산서 (영업외)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {entityIsThead}
                  <tbody>{entityNonOperatingItems.map((item, idx) => renderEntityIncomeRow(item, idx))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </>
    );

    // BS 섹션 JSX
    const entityBSSection = (
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
          <h3 className="text-sm font-semibold text-zinc-900">{displayEntityName} 재무상태표</h3>
        </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[130px]">과목</th>
                  <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[95px]">{getBsPeriodLabel(bsPeriod25)}</th>
                  <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[95px]">{getBsPeriodLabel(period26)}</th>
                  <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
                  <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[70px]">증감률</th>
                  <th className="text-left px-2 py-2.5 font-semibold text-zinc-700 min-w-[168px] border-l border-zinc-200">증감 사유</th>
                </tr>
              </thead>
              <tbody>
                {entityBalanceItems.map((item, idx) => {
                  const val25 = valBS(item.key, bsPeriod25);
                  const val26 = valBS(item.key, period26);
                  const isTotalItem = item.key.includes('총계');
                  if (!isTotalItem && val25 === 0 && val26 === 0) return null;
                  const diff = val26 - val25;
                  const change = calculateYoY(val26, val25);
                  const highlightClass =
                    item.highlight === 'blue'
                      ? 'bg-blue-50/50'
                      : item.highlight === 'green'
                        ? 'bg-emerald-50/50'
                        : item.highlight === 'red'
                          ? 'bg-rose-50/50'
                          : '';
                  return (
                    <tr key={`ebs-${item.key}-${idx}`} className={`border-b border-zinc-100 ${highlightClass}`}>
                      <td
                        className={`px-3 py-2 border-r border-zinc-200 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-600'} ${item.depth === 1 ? 'pl-6' : ''}`}
                      >
                        {item.label}
                      </td>
                      <td className="text-right px-3 py-2 text-zinc-500 border-r border-zinc-200 tabular-nums">{formatNumber(val25)}</td>
                      <td className={`text-right px-3 py-2 border-r border-zinc-200 tabular-nums ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>
                        {formatNumber(val26)}
                      </td>
                      <td className={`text-right px-3 py-2 font-medium border-r border-zinc-200 tabular-nums ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diff !== 0 ? formatNumber(diff) : '-'}
                      </td>
                      <td className={`text-right px-3 py-2 font-medium tabular-nums border-r border-zinc-200 ${parseFloat(change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {change !== '-' ? `${change}%` : '-'}
                      </td>
                      {renderReasonCell('bs', item.key)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </div>
    );

    // 서브탭 선택 시 IS/BS만 보여주는 모드
    if (forceMode === 'is') {
      return <div className="space-y-6">{entityISSections}</div>;
    }
    if (forceMode === 'bs') {
      return <div className="space-y-6">{entityBSSection}</div>;
    }

    // 법인별 탭 전체 뷰 (IS + BS + 서브탭 바)
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-3">
          <div className="flex flex-wrap items-center gap-2">
            {entityTabs.map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setSelectedEntityTab(tab.label)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  selectedEntityTab === tab.label
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {entityISSections}
        {entityBSSection}
      </div>
    );
  };

  // ============================================
  // 메인 렌더링
  // ============================================
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sticky 헤더 영역 — 보고서형 네이비 상단 */}
      <div className="sticky top-0 z-50 shadow-md">
        <div className="bg-[#1e3a5f] text-white relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 h-40 w-40 rounded-full bg-white/5"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-16 top-4 h-24 w-24 rounded-full bg-sky-400/10"
            aria-hidden
          />
          <div className="max-w-screen-2xl mx-auto px-4 pt-4 pb-3 relative">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/15 rounded-lg flex items-center justify-center shrink-0 border border-white/20">
                <span className="text-white font-bold text-base tracking-tight">F&F</span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black text-white tracking-tight leading-snug">
                  F&F Corporation 연결 재무제표
                </h1>
                <p className="mt-1.5 text-sm text-white/90">
                  {selectedPeriod?.split('_')?.[0] || '2026'}년 F&F 연결 재무 대시보드
                </p>
                <p className="mt-1 text-xs sm:text-sm text-white/85 leading-relaxed">
                  <span className="text-white/90">(분기·누적 조회 가능 / </span>
                  <span className="text-red-400 font-medium">단위: 백만원</span>
                  <span className="text-white/90">)</span>
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-white/25 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
              <div>
                <span className="font-semibold text-white">보고단위</span>{' '}
                <span className="text-white/90">연결(Consolidated)</span>
              </div>
              <div>
                <span className="font-semibold text-white">조회기간</span>{' '}
                <span className="text-white/90">
                  {selectedPeriod
                    ? `${selectedPeriod.split('_')[0]}년 ${selectedPeriod.split('_')[1]?.replace('Q', '') || '1'}분기`
                    : '2026년 1분기'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-100 border-b border-zinc-200">
          <div className="max-w-screen-2xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="inline-flex p-1 bg-zinc-100 rounded-xl border border-zinc-200">
              {tabs.filter(t => !t.hidden).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm rounded-lg transition-all duration-150 ${
                    activeTab === tab.id
                      ? 'bg-white text-zinc-900 font-semibold shadow-sm border border-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-700 font-medium'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 hidden sm:inline">회계연도</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                title="현재 FY2026 1Q만 선택 가능합니다."
                className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg border border-white/10 outline-none cursor-pointer hover:bg-[#254a75] transition-colors"
              >
                <option value="2026_Q1">FY2026 1Q</option>
                <option value="2026_Q2" disabled>
                  FY2026 2Q (미제공)
                </option>
                <option value="2026_Q3" disabled>
                  FY2026 3Q (미제공)
                </option>
                <option value="2026_Q4" disabled>
                  FY2026 4Q (미제공)
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="max-w-screen-2xl mx-auto p-4">
        {/* 탭 컨텐츠 */}
        <div>
          {activeTab === 'summary' && renderSummaryTab()}
          {activeTab === 'income' && renderIncomeTab()}
          {activeTab === 'balance' && renderBalanceSheetTab()}
          {activeTab === 'entity' && renderEntityStatementsTab()}
        </div>

        {/* 푸터 */}
        <div className="mt-6 pt-4 border-t border-zinc-200">
          <p className="text-xs text-zinc-400 text-center">
            © 2026 F&F Corporation | 단위: 백만원
          </p>
        </div>
      </div>
    </div>
  );
}


