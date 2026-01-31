import React, { useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area } from 'recharts';
import * as XLSX from 'xlsx';

// ============================================
// F&F Corporation Q4 2025 Financial Dashboard
// shadcn/ui 스타일 적용
// ============================================

// ============================================
// 기본 데이터 구조 생성 함수
// ============================================
const createEmptyIncomeStatement = () => ({
  매출액: 0,
  매출원가: 0,
  매출총이익: 0,
  판매비와관리비: 0,
  인건비: 0,
  광고선전비: 0,
  수수료: 0,
  감가상각비: 0,
  기타판관비: 0,
  영업이익: 0,
  영업외손익: 0,
  외환손익: 0,
  선물환손익: 0,
  금융상품손익: 0,
  이자손익: 0,
  배당수익: 0,
  기부금: 0,
  기타손익: 0,
  지분법손익: 0,
  법인세비용차감전순이익: 0,
  법인세비용: 0,
  당기순이익: 0,
});

// 성격별 분류 매핑: A열(업로드용) -> B열(성격별 분류)
const NATURE_MAPPING = {
  // 자산
  '현금및현금성자산': '현금성자산',
  '매출채권': '매출채권',
  '재고자산': '재고자산',
  '유형자산': '유무형자산',
  '무형자산': '유무형자산',
  '관계기업': '관계기업',
  '사용권자산': '사용권자산',
  '금융상품': '금융상품',
  '대여금': '대여금',
  '기타비유동자산': '기타(차감항목)',
  '투자부동산': '기타(차감항목)', // 투자부동산도 기타에 포함
  '기타유동자산': '기타(차감항목)', // 기타유동자산도 기타에 포함
  // 부채
  '매입채무': '외상매입금',
  '미지급금': '미지급금',
  '리스부채': '리스부채',
  '보증금': '보증금',
  '단기차입금': '차입금',
  '장기차입금': '차입금',
  '기타유동부채': '기타',
  '기타비유동부채': '기타',
};

// 성격별 분류 역매핑: B열(성격별 분류) -> A열(업로드용) 배열
const NATURE_REVERSE_MAPPING = {
  '현금성자산': ['현금및현금성자산'],
  '매출채권': ['매출채권'],
  '재고자산': ['재고자산'],
  '유무형자산': ['유형자산', '무형자산'],
  '관계기업': ['관계기업'],
  '사용권자산': ['사용권자산'],
  '금융상품': ['금융상품'],
  '대여금': ['대여금'],
  '기타(차감항목)': ['기타비유동자산', '투자부동산', '기타유동자산'],
  '외상매입금': ['매입채무'],
  '미지급금': ['미지급금'],
  '리스부채': ['리스부채'],
  '보증금': ['보증금'],
  '차입금': ['단기차입금', '장기차입금'],
  '기타': ['기타유동부채', '기타비유동부채'],
};

// 계정과목명 매핑: 다양한 입력 형식을 표준 형식으로 변환
const ACCOUNT_NAME_MAPPING = {
  // 현금 관련
  '현금': '현금및현금성자산',
  '현금 및 현금성자산': '현금및현금성자산',
  '현금및현금성자산': '현금및현금성자산',
  '현금성자산': '현금및현금성자산',
  '현금 및 현금성 자산': '현금및현금성자산',
  
  // 매출채권 관련
  '매출채권': '매출채권',
  '매출채권 및 기타채권': '매출채권',
  '외상매출금': '매출채권',
  
  // 재고자산
  '재고자산': '재고자산',
  '재고': '재고자산',
  '상품': '재고자산',
  
  // 기타유동자산
  '기타유동자산': '기타유동자산',
  '기타 유동자산': '기타유동자산',
  
  // 유형자산
  '유형자산': '유형자산',
  '유형 자산': '유형자산',
  '유형고정자산': '유형자산',
  '유형 고정자산': '유형자산',
  
  // 무형자산
  '무형자산': '무형자산',
  '무형 자산': '무형자산',
  '무형고정자산': '무형자산',
  '무형 고정자산': '무형자산',
  
  // 사용권자산
  '사용권자산': '사용권자산',
  '사용권 자산': '사용권자산',
  '리스자산': '사용권자산',
  
  // 투자부동산
  '투자부동산': '투자부동산',
  '투자 부동산': '투자부동산',
  
  // 기타비유동자산
  '기타비유동자산': '기타비유동자산',
  '기타 비유동자산': '기타비유동자산',
  
  // 관계기업
  '관계기업': '관계기업',
  '관계 기업': '관계기업',
  '관계기업투자': '관계기업',
  
  // 금융상품
  '금융상품': '금융상품',
  '금융 상품': '금융상품',
  
  // 대여금
  '대여금': '대여금',
  '대여 금': '대여금',
  
  // 매입채무
  '매입채무': '매입채무',
  '매입 채무': '매입채무',
  '외상매입금': '매입채무',
  '외상 매입금': '매입채무',
  
  // 미지급금
  '미지급금': '미지급금',
  '미지급 금': '미지급금',
  
  // 리스부채
  '리스부채': '리스부채',
  '리스 부채': '리스부채',
  '리스 의무': '리스부채',
  
  // 보증금
  '보증금': '보증금',
  '보증 금': '보증금',
  
  // 단기차입금
  '단기차입금': '단기차입금',
  '단기 차입금': '단기차입금',
  '단기 차입 금': '단기차입금',
  '단기차입': '단기차입금',
  
  // 장기차입금
  '장기차입금': '장기차입금',
  '장기 차입금': '장기차입금',
  '장기 차입 금': '장기차입금',
  '장기차입': '장기차입금',
  
  // 기타유동부채
  '기타유동부채': '기타유동부채',
  '기타 유동부채': '기타유동부채',
  
  // 기타비유동부채
  '기타비유동부채': '기타비유동부채',
  '기타 비유동부채': '기타비유동부채',
  
  // 자본금
  '자본금': '자본금',
  '자본 금': '자본금',
  
  // 자본잉여금
  '자본잉여금': '자본잉여금',
  '자본 잉여금': '자본잉여금',
  
  // 이익잉여금
  '이익잉여금': '이익잉여금',
  '이익 잉여금': '이익잉여금',
  '이익잉여금(결손금)': '이익잉여금',
  
  // 기타자본
  '기타자본': '기타자본',
  '기타 자본': '기타자본',
};

// 계정과목명 정규화 함수 (공백 제거, 대소문자 통일 등)
const normalizeAccountName = (accountName) => {
  if (!accountName || typeof accountName !== 'string') return null;
  
  // 앞뒤 공백 및 특수 공백 문자 제거 (\xa0 등)
  let cleaned = accountName.replace(/[\xa0\u00A0\u2000-\u200B\uFEFF]/g, ' ').trim();
  
  // 대분류 행 무시 (I., II., III. 등으로 시작하는 행)
  if (/^[IVX]+\.\s|^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s|^[일이삼사오육칠팔구십]+\.\s|^[一二三四五六七八九十]+\.\s/.test(cleaned)) {
    return null;
  }
  
  // 합계 행 무시 ("총계", "합계" 등이 포함된 행)
  if (/총\s*계|합\s*계|총\s*합|자\s*산\s*총\s*계|부\s*채\s*총\s*계|자\s*본\s*총\s*계/.test(cleaned)) {
    return null;
  }
  
  // 들여쓰기 제거 (앞쪽 공백 제거)
  cleaned = cleaned.replace(/^\s+/, '');
  
  // 공백 정규화 (연속된 공백을 하나로)
  let normalized = cleaned.replace(/\s+/g, '');
  
  // 1. 정확한 매칭 (공백 제거 후)
  if (ACCOUNT_NAME_MAPPING[normalized]) {
    return ACCOUNT_NAME_MAPPING[normalized];
  }
  
  // 2. 원본 이름 확인 (공백 포함)
  if (ACCOUNT_NAME_MAPPING[cleaned]) {
    return ACCOUNT_NAME_MAPPING[cleaned];
  }
  
  // 3. 정확한 부분 매칭 (계정과목명이 키에 포함되거나, 키가 계정과목명에 포함되는 경우)
  // 우선순위: 더 긴 키부터 매칭
  const sortedKeys = Object.keys(ACCOUNT_NAME_MAPPING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const keyNormalized = key.replace(/\s+/g, '');
    // 정확한 매칭이거나, 계정과목명이 키로 시작하는 경우만 매칭
    if (normalized === keyNormalized || normalized.startsWith(keyNormalized) || keyNormalized.startsWith(normalized)) {
      // 너무 짧은 부분 매칭은 제외 (예: "현금"만으로는 매칭하지 않음)
      if (keyNormalized.length >= 3 && normalized.length >= 3) {
        return ACCOUNT_NAME_MAPPING[key];
      }
    }
  }
  
  // 매칭 실패 시 원본 반환 (기존 로직과의 호환성 유지)
  return normalized;
};

const createEmptyBalanceSheet = () => ({
  // 업로드용 과목 (A열)
  현금및현금성자산: 0,
  매출채권: 0,
  재고자산: 0,
  기타유동자산: 0,
  유형자산: 0,
  무형자산: 0,
  사용권자산: 0,
  투자부동산: 0,
  기타비유동자산: 0,
  관계기업: 0,
  금융상품: 0,
  대여금: 0,
  매입채무: 0,
  미지급금: 0,
  리스부채: 0,
  보증금: 0,
  단기차입금: 0,
  장기차입금: 0,
  기타유동부채: 0,
  기타비유동부채: 0,
  자본금: 0,
  자본잉여금: 0,
  이익잉여금: 0,
  기타자본: 0,
});

const createEmptyFinancialInstruments = () => ({
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
});

const createInitialIncomeStatementData = () => ({
  '2024_1Q': createEmptyIncomeStatement(),
  '2024_2Q': createEmptyIncomeStatement(),
  '2024_3Q': createEmptyIncomeStatement(),
  '2024_4Q': createEmptyIncomeStatement(),
  '2024_Year': createEmptyIncomeStatement(),
  '2025_1Q': createEmptyIncomeStatement(),
  '2025_2Q': createEmptyIncomeStatement(),
  '2025_3Q': createEmptyIncomeStatement(),
  '2025_4Q': createEmptyIncomeStatement(),
  '2025_Year': createEmptyIncomeStatement(),
});

const createInitialBalanceSheetData = () => ({
  '2024_Year': createEmptyBalanceSheet(),
  '2025_Year': createEmptyBalanceSheet(),
});

const createInitialFinancialInstrumentsData = () => ({
  '2024_Year': createEmptyFinancialInstruments(),
  '2025_Year': createEmptyFinancialInstruments(),
});

export default function FnFQ4Dashboard() {
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedAccount, setSelectedAccount] = useState('매출액');
  const [selectedBalanceAccount, setSelectedBalanceAccount] = useState('현금성자산');
  const [isNonOperatingExpanded, setIsNonOperatingExpanded] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'error', null

  // ============================================
  // 손익계산서 데이터 - 분기별 (2024~2025)
  // ============================================
  const [incomeStatementData, setIncomeStatementData] = useState(createInitialIncomeStatementData());

  // ============================================
  // 재무상태표 데이터 - 기말 기준 (2024, 2025)
  // ============================================
  const [balanceSheetData, setBalanceSheetData] = useState(createInitialBalanceSheetData());

  // ============================================
  // 금융상품평가 데이터
  // ============================================
  const [financialInstrumentsData, setFinancialInstrumentsData] = useState(createInitialFinancialInstrumentsData());

  // ============================================
  // 유틸리티 함수
  // ============================================
  const formatNumber = (num) => {
    if (num === undefined || num === null || isNaN(num)) return '-';
    if (num === 0) return '0';
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
  // 엑셀 템플릿 생성 및 다운로드
  // ============================================
  const downloadExcelTemplate = useCallback(() => {
    const workbook = XLSX.utils.book_new();

    // 손익계산서 시트
    const incomeAccounts = [
      '매출액', '매출원가', '매출총이익', '판매비와관리비', '인건비', '광고선전비', 
      '수수료', '감가상각비', '기타판관비', '영업이익', '영업외손익', '외환손익', 
      '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', 
      '지분법손익', '법인세비용차감전순이익', '법인세비용', '당기순이익'
    ];
    const incomePeriods = ['2024_1Q', '2024_2Q', '2024_3Q', '2024_4Q', '2024_Year', '2025_1Q', '2025_2Q', '2025_3Q', '2025_4Q', '2025_Year'];
    const incomeData = [
      ['과목', ...incomePeriods],
      ...incomeAccounts.map(account => [account, ...incomePeriods.map(period => incomeStatementData[period]?.[account] || 0)])
    ];
    const incomeSheet = XLSX.utils.aoa_to_sheet(incomeData);
    XLSX.utils.book_append_sheet(workbook, incomeSheet, 'IncomeStatement');

    // 재무상태표 시트 (A열 기준 - 업로드용 과목, createEmptyBalanceSheet 순서와 일치)
    const balanceAccounts = [
      // 자산 (A열 순서대로)
      '현금및현금성자산', '매출채권', '재고자산', '기타유동자산',
      '유형자산', '무형자산', '사용권자산', '투자부동산', '기타비유동자산',
      '관계기업', '금융상품', '대여금',
      // 부채 (A열 순서대로)
      '매입채무', '미지급금', '리스부채', '보증금',
      '단기차입금', '장기차입금', '기타유동부채', '기타비유동부채',
      // 자본 (A열 순서대로)
      '자본금', '자본잉여금', '이익잉여금', '기타자본'
    ];
    const balancePeriods = ['2024_Year', '2025_Year'];
    const balanceData = [
      ['과목', ...balancePeriods],
      ...balanceAccounts.map(account => [account, ...balancePeriods.map(period => balanceSheetData[period]?.[account] || 0)])
    ];
    const balanceSheet = XLSX.utils.aoa_to_sheet(balanceData);
    XLSX.utils.book_append_sheet(workbook, balanceSheet, 'BalanceSheet');

    // 금융상품 시트
    const financialAccounts = [
      'FVPL금융자산', 'FVOCI금융자산', 'AC금융자산', '파생상품자산',
      '당기손익인식금융부채', '상각후원가금융부채', '파생상품부채',
      'FVPL평가손익', 'FVOCI평가손익', '파생상품평가손익'
    ];
    const financialPeriods = ['2024_Year', '2025_Year'];
    const financialData = [
      ['과목', ...financialPeriods],
      ...financialAccounts.map(account => [account, ...financialPeriods.map(period => financialInstrumentsData[period]?.[account] || 0)])
    ];
    const financialSheet = XLSX.utils.aoa_to_sheet(financialData);
    XLSX.utils.book_append_sheet(workbook, financialSheet, 'FinancialInstruments');

    // 파일 다운로드
    XLSX.writeFile(workbook, 'F&F_Q4_2025_Dashboard_Template.xlsx');
    setUploadStatus('success');
    setTimeout(() => setUploadStatus(null), 3000);
  }, [incomeStatementData, balanceSheetData, financialInstrumentsData]);

  // ============================================
  // 엑셀 파일 업로드 및 파싱
  // ============================================
  const handleExcelUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // 손익계산서 파싱
        if (workbook.SheetNames.includes('IncomeStatement')) {
          const incomeSheet = workbook.Sheets['IncomeStatement'];
          const incomeJson = XLSX.utils.sheet_to_json(incomeSheet, { header: 1 });
          const incomeHeaders = incomeJson[0]?.slice(1) || [];
          const newIncomeData = { ...incomeStatementData };
          
          incomeJson.slice(1).forEach((row) => {
            const account = row[0];
            if (account && typeof account === 'string') {
              incomeHeaders.forEach((period, idx) => {
                if (period && newIncomeData[period]) {
                  const value = row[idx + 1];
                  newIncomeData[period] = {
                    ...newIncomeData[period],
                    [account]: typeof value === 'number' ? value : (parseFloat(value) || 0)
                  };
                }
              });
            }
          });
          setIncomeStatementData(newIncomeData);
        }

        // 재무상태표 파싱 (첫 번째 시트 또는 'BalanceSheet' 시트)
        const balanceSheetName = workbook.SheetNames.includes('BalanceSheet') 
          ? 'BalanceSheet' 
          : workbook.SheetNames[0]; // 첫 번째 시트 사용
        const balanceSheet = workbook.Sheets[balanceSheetName];
        const balanceJson = XLSX.utils.sheet_to_json(balanceSheet, { header: 1, defval: '' });
        
        // 첫 번째 행이 헤더인지 확인 (과목, 2024_Year, 2025_Year 등)
        const firstRow = balanceJson[0] || [];
        let headerRowIndex = 0;
        let dataStartRow = 1;
        
        // 헤더 행 찾기 (첫 번째 열이 '과목'이거나 첫 번째 행이 헤더인 경우)
        if (firstRow[0] === '과목' || firstRow[0] === '항목') {
          headerRowIndex = 0;
          dataStartRow = 1;
        } else {
          // 헤더가 없는 경우, 첫 번째 행부터 데이터로 간주
          headerRowIndex = -1;
          dataStartRow = 0;
        }
        
        // 헤더에서 기간 정보 추출
        const balanceHeaders = headerRowIndex >= 0 ? balanceJson[headerRowIndex]?.slice(1) || [] : [];
        const newBalanceData = { ...balanceSheetData };
        
        // 헤더가 없거나 비어있으면 기본 기간 사용
        const periods = balanceHeaders.length > 0 ? balanceHeaders : ['2024_Year', '2025_Year'];
        
        balanceJson.slice(dataStartRow).forEach((row) => {
          const account = row[0];
          if (account && typeof account === 'string' && account.trim() !== '') {
            // 계정과목명 정규화 (들여쓰기, 대분류, 합계 행 필터링 포함)
            const normalizedAccount = normalizeAccountName(account);
            
            // 정규화된 계정과목명이 있고, 시스템에 정의된 계정인 경우에만 처리
            if (normalizedAccount) {
              const emptyBalanceSheet = createEmptyBalanceSheet();
              if (emptyBalanceSheet.hasOwnProperty(normalizedAccount)) {
                periods.forEach((period, idx) => {
                  if (period !== undefined && period !== null && period !== '') {
                    // period가 '2024_Year', '2025_Year' 형식이 아니면 변환 시도
                    let periodKey = period;
                    if (typeof period === 'string') {
                      // '2024년 기말', '2025년 기말', '2024_Year', '2025_Year' 등의 형식 처리
                      if (period.includes('2024')) {
                        periodKey = '2024_Year';
                      } else if (period.includes('2025')) {
                        periodKey = '2025_Year';
                      } else if (period === '2024_Year' || period === '2025_Year') {
                        periodKey = period;
                      }
                    } else if (typeof period === 'number') {
                      // 숫자로 된 경우 (예: 2024, 2025)
                      if (period === 2024) {
                        periodKey = '2024_Year';
                      } else if (period === 2025) {
                        periodKey = '2025_Year';
                      }
                    }
                    
                    if (newBalanceData[periodKey]) {
                      const value = row[idx + 1];
                      const numValue = typeof value === 'number' ? value : (parseFloat(value) || 0);
                      
                      newBalanceData[periodKey] = {
                        ...newBalanceData[periodKey],
                        [normalizedAccount]: numValue
                      };
                    }
                  }
                });
              }
            }
            // normalizedAccount가 null인 경우 (대분류, 합계 행 등)는 무시
          }
        });
        setBalanceSheetData(newBalanceData);

        // 금융상품 파싱
        if (workbook.SheetNames.includes('FinancialInstruments')) {
          const financialSheet = workbook.Sheets['FinancialInstruments'];
          const financialJson = XLSX.utils.sheet_to_json(financialSheet, { header: 1 });
          const financialHeaders = financialJson[0]?.slice(1) || [];
          const newFinancialData = { ...financialInstrumentsData };
          
          financialJson.slice(1).forEach((row) => {
            const account = row[0];
            if (account && typeof account === 'string') {
              financialHeaders.forEach((period, idx) => {
                if (period && newFinancialData[period]) {
                  const value = row[idx + 1];
                  newFinancialData[period] = {
                    ...newFinancialData[period],
                    [account]: typeof value === 'number' ? value : (parseFloat(value) || 0)
                  };
                }
              });
            }
          });
          setFinancialInstrumentsData(newFinancialData);
        }

        setUploadStatus('success');
        setTimeout(() => setUploadStatus(null), 3000);
        event.target.value = ''; // 파일 입력 초기화
      } catch (error) {
        console.error('엑셀 파싱 오류:', error);
        setUploadStatus('error');
        setTimeout(() => setUploadStatus(null), 3000);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [incomeStatementData, balanceSheetData, financialInstrumentsData]);

  // ============================================
  // 탭 컴포넌트
  // ============================================
  const tabs = [
    { id: 'summary', label: '전체요약', icon: '📊' },
    { id: 'income', label: '손익계산서', icon: '📈' },
    { id: 'balance', label: '재무상태표', icon: '💰' },
  ];

  // ============================================
  // 전체요약 탭 렌더링
  // ============================================
  const renderSummaryTab = () => {
    // 성격별 분류 값 계산 함수 (전체요약 탭용)
    const calculateNatureValue = (natureKey, period) => {
      const data = balanceSheetData[period] || {};
      const sourceKeys = NATURE_REVERSE_MAPPING[natureKey] || [];
      return sourceKeys.reduce((sum, key) => sum + (data[key] || 0), 0);
    };

    // 자산총계 계산
    const calculateTotalAssets = (period) => {
      const assetNatures = ['현금성자산', '매출채권', '재고자산', '유무형자산', '관계기업', 
                           '사용권자산', '금융상품', '대여금', '기타(차감항목)'];
      return assetNatures.reduce((sum, key) => sum + calculateNatureValue(key, period), 0);
    };

    // 부채총계 계산
    const calculateTotalLiabilities = (period) => {
      const liabilityNatures = ['외상매입금', '미지급금', '리스부채', '보증금', '차입금', '기타'];
      return liabilityNatures.reduce((sum, key) => sum + calculateNatureValue(key, period), 0);
    };

    // 자본총계 계산
    const calculateTotalEquity = (period) => {
      const data = balanceSheetData[period] || {};
      return (data.자본금 || 0) + 
             (data.자본잉여금 || 0) + 
             (data.이익잉여금 || 0) + 
             (data.기타자본 || 0);
    };

    // 손익 요약 카드 데이터
    const incomeCards = [
      { title: '매출액', value: incomeStatementData['2025_4Q']?.매출액 || 0, prevValue: incomeStatementData['2024_4Q']?.매출액 || 0, iconColor: 'bg-blue-500' },
      { title: '영업이익', value: incomeStatementData['2025_4Q']?.영업이익 || 0, prevValue: incomeStatementData['2024_4Q']?.영업이익 || 0, iconColor: 'bg-emerald-500' },
      { title: '당기순이익', value: incomeStatementData['2025_4Q']?.당기순이익 || 0, prevValue: incomeStatementData['2024_4Q']?.당기순이익 || 0, iconColor: 'bg-violet-500' },
    ];

    // 재무상태 요약 카드 데이터 (계산된 값 사용)
    const balanceCards = [
      { title: '자산총계', value: calculateTotalAssets('2025_Year'), prevValue: calculateTotalAssets('2024_Year'), iconColor: 'bg-amber-500' },
      { title: '부채총계', value: calculateTotalLiabilities('2025_Year'), prevValue: calculateTotalLiabilities('2024_Year'), iconColor: 'bg-rose-500' },
      { title: '자본총계', value: calculateTotalEquity('2025_Year'), prevValue: calculateTotalEquity('2024_Year'), iconColor: 'bg-cyan-500' },
    ];


    // 카드 렌더링 함수
    const renderCard = (card, idx) => {
      const change = card.prevValue !== 0 
        ? ((card.value - card.prevValue) / Math.abs(card.prevValue) * 100).toFixed(1) 
        : 0;
      const isPositive = parseFloat(change) >= 0;
      
      return (
        <div key={idx} className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${card.iconColor}`}></span>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{card.title}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-zinc-900">{formatNumber(card.value)}</span>
            <span className="text-sm text-zinc-400">백만원</span>
          </div>
          <div className={`text-xs font-semibold mt-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {change != 0 ? `${isPositive ? '▲' : '▼'} ${Math.abs(parseFloat(change))}% YoY` : '-'}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        {/* 메인 헤더 섹션 */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-xl p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">F&F 연결 재무제표 총괄</h2>
              <p className="text-zinc-300 text-sm">2025년 4분기 기준 연결 재무제표 요약 정보</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setActiveTab('income')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <span className="text-lg">📈</span>
                <span>손익계산서 보기</span>
              </button>
              <button
                onClick={() => setActiveTab('balance')}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <span className="text-lg">💰</span>
                <span>재무상태표 보기</span>
              </button>
            </div>
          </div>
        </div>

        {/* 손익 요약 섹션 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded"></span>
              손익 요약
            </h3>
            <button
              onClick={() => setActiveTab('income')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              상세 보기 <span>→</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {incomeCards.map((card, idx) => renderCard(card, idx))}
          </div>
        </div>

        {/* 재무상태 요약 섹션 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded"></span>
              재무상태 요약
            </h3>
            <button
              onClick={() => setActiveTab('balance')}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              상세 보기 <span>→</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {balanceCards.map((card, idx) => renderCard(card, idx))}
          </div>
        </div>


        {/* AI 분석 섹션 */}
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-violet-500 rounded"></span>
            AI 분석
          </h3>
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-lg p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div>
                <div className="text-sm font-semibold">F&F 2025년 4분기 재무 분석</div>
                <div className="text-xs text-zinc-400">종합 재무 분석</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {/* 수익성 분석 */}
              <div className="p-3 bg-white/5 rounded border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-xs font-semibold text-emerald-400">수익성 분석</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  데이터 업데이트 후 영업이익률, ROE 등 수익성 지표 분석이 표시됩니다.
                </p>
              </div>

              {/* 안정성 분석 */}
              <div className="p-3 bg-white/5 rounded border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span className="text-xs font-semibold text-blue-400">안정성 분석</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  데이터 업데이트 후 부채비율, 유동비율 등 재무 안정성 분석이 표시됩니다.
                </p>
              </div>

              {/* 성장성 분석 */}
              <div className="p-3 bg-white/5 rounded border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-xs font-semibold text-amber-400">성장성 분석</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  데이터 업데이트 후 매출 성장률, 시장 점유율 변화 분석이 표시됩니다.
                </p>
              </div>

              {/* 종합 의견 */}
              <div className="p-3 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded border border-blue-400/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                  <span className="text-xs font-semibold text-violet-400">종합 의견</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  데이터 업데이트 후 강점과 개선 영역 종합 분석이 표시됩니다.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">AI 분석은 참고용이며 투자 조언이 아닙니다</span>
              <span className="text-[10px] text-zinc-500">25.4Q 기준</span>
            </div>
          </div>
        </div>
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

    // 법인별 데이터 (선택된 과목에 따라)
    const entityData = {
      '매출액': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '매출원가': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '매출총이익': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '인건비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '광고선전비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '수수료': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '감가상각비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '기타판관비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '영업이익': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '당기순이익': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
    };

    // 법인 색상
    const entityColors = {
      'OC(국내)': '#3B82F6',
      '3자수출': '#10B981',
      '중국': '#F59E0B',
      '홍마대': '#8B5CF6',
      '기타': '#6B7280',
    };

    // 도넛 차트용 데이터 변환
    const getDonutData = (period) => {
      const data = entityData[selectedAccount]?.[period] || {};
      return Object.entries(data).map(([name, value]) => ({
        name,
        value: value || 0,
        color: entityColors[name],
      }));
    };

    // 법인별 테이블 데이터
    const getEntityTableData = () => {
      const prev = entityData[selectedAccount]?.['2024_4Q'] || {};
      const curr = entityData[selectedAccount]?.['2025_4Q'] || {};
      const totalCurr = Object.values(curr).reduce((a, b) => a + b, 0);
      
      return Object.keys(entityColors).map(entity => {
        const prevVal = prev[entity] || 0;
        const currVal = curr[entity] || 0;
        const ratio = totalCurr > 0 ? ((currVal / totalCurr) * 100).toFixed(1) : '0.0';
        const change = prevVal > 0 ? (((currVal - prevVal) / prevVal) * 100).toFixed(1) : '-';
        return { entity, prevVal, currVal, ratio, change };
      });
    };

    // 손익계산서 항목 정의
    const incomeItems = [
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
      { key: '영업외손익', label: 'VI. 영업외손익', depth: 0, bold: true, toggleParent: true },
      { key: '외환손익', label: '(1)외환손익', depth: 1, toggleChild: true },
      { key: '선물환손익', label: '(2)선물환손익', depth: 1, toggleChild: true },
      { key: '금융상품손익', label: '(3)금융상품손익', depth: 1, toggleChild: true },
      { key: '이자손익', label: '(4)이자손익', depth: 1, toggleChild: true },
      { key: '배당수익', label: '(5)배당수익', depth: 1, toggleChild: true },
      { key: '기부금', label: '(6)기부금', depth: 1, toggleChild: true },
      { key: '기타손익', label: '(7)기타손익', depth: 1, toggleChild: true },
      { key: '지분법손익', label: 'VII. 지분법손익', depth: 0, bold: true },
      { key: '법인세비용차감전순이익', label: 'VIII. 법인세비용차감전순이익', depth: 0, bold: true },
      { key: '법인세비용', label: 'IX. 법인세비용', depth: 0, bold: true },
      { key: '법인세율', label: '법인세율', depth: 0, isRate: true, rateOf: ['법인세비용', '법인세비용차감전순이익'], highlight: 'blue' },
      { key: '당기순이익', label: 'X. 당기순이익', depth: 0, bold: true, highlight: 'green', selectable: true },
      { key: '당기순이익률', label: '당기순이익률', depth: 0, isRate: true, rateOf: ['당기순이익', '매출액'], highlight: 'blue' },
    ];

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

    return (
      <div className="space-y-4">
        {/* 요약 카드 섹션 - 가로 배열, 균등 너비 */}
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card, idx) => {
            const curr = incomeStatementData['2025_4Q']?.[card.key] || 0;
            const prev = incomeStatementData['2024_4Q']?.[card.key] || 0;
            const diff = curr - prev;
            const changeRate = calculateYoY(curr, prev);
            const isPositive = parseFloat(changeRate) >= 0;
            
            // 비율 계산
            let currRate = null;
            let prevRate = null;
            let rateDiff = null;
            if (card.hasRate) {
              const [num, denom] = card.rateOf;
              const currNum = incomeStatementData['2025_4Q']?.[num] || 0;
              const currDenom = incomeStatementData['2025_4Q']?.[denom] || 0;
              const prevNum = incomeStatementData['2024_4Q']?.[num] || 0;
              const prevDenom = incomeStatementData['2024_4Q']?.[denom] || 0;
              
              currRate = currDenom > 0 ? ((currNum / currDenom) * 100).toFixed(1) : '0.0';
              prevRate = prevDenom > 0 ? ((prevNum / prevDenom) * 100).toFixed(1) : '0.0';
              rateDiff = (parseFloat(currRate) - parseFloat(prevRate)).toFixed(1);
            }
            
            return (
              <div 
                key={idx}
                className="bg-white rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{card.title}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {changeRate !== '-' ? `${isPositive ? '+' : ''}${changeRate}%` : '-'}
                  </span>
                </div>
                
                {/* 금액 */}
                <div className="text-2xl font-bold text-zinc-900 tracking-tight">
                  {formatNumber(curr)}
                </div>
                
                {/* 전년동기 & 증감 */}
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-zinc-400">전년 {formatNumber(prev)}</span>
                  <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isPositive ? '+' : ''}{formatNumber(diff)}
                  </span>
                </div>
                
                {/* 비율 (해당되는 경우) */}
                {card.hasRate && (
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">{card.rateLabel}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-zinc-900">{currRate}%</span>
                        <span className={`text-xs font-semibold ${parseFloat(rateDiff) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {parseFloat(rateDiff) >= 0 ? '+' : ''}{rateDiff}%p
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 손익계산서 테이블 & 법인별 분석 */}
        <div className="flex gap-4">
        {/* 좌측: 손익계산서 테이블 */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">연결 손익계산서</h3>
                <span className="text-xs text-zinc-400">● 클릭 시 법인별 분석</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th rowSpan="2" className="text-left px-3 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[160px]">과목</th>
                    <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200">2024년 4분기</th>
                    <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100">2025년 4분기</th>
                    <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200">증감 (전년동기)</th>
                    <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-600">증감 (누적)</th>
                  </tr>
                  <tr className="bg-zinc-50/50 border-b border-zinc-200">
                    <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-100 min-w-[65px]">4Q</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-200 min-w-[65px]">누적</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-700 border-r border-zinc-100 bg-zinc-100/50 min-w-[65px]">4Q</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-700 border-r border-zinc-200 bg-zinc-100/50 min-w-[65px]">누적</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-100 min-w-[60px]">금액</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-200 min-w-[50px]">비율</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-100 min-w-[60px]">금액</th>
                    <th className="text-center px-2 py-2 font-medium text-zinc-500 min-w-[50px]">비율</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeItems.map((item, idx) => {
                    const isRateRow = item.isRate;
                    const isSelectable = item.selectable;
                    const isSelected = selectedAccount === item.key;
                    const isToggleParent = item.toggleParent;
                    const isToggleChild = item.toggleChild;
                    
                    // 토글 자식 항목이고 접혀있으면 렌더링하지 않음
                    if (isToggleChild && !isNonOperatingExpanded) {
                      return null;
                    }
                    
                    // 비율 행 처리
                    if (isRateRow) {
                      const [num, denom] = item.rateOf;
                      const rate2024Q = calcRate(incomeStatementData['2024_4Q']?.[num] || 0, incomeStatementData['2024_4Q']?.[denom] || 0);
                      const rate2024Y = calcRate(incomeStatementData['2024_Year']?.[num] || 0, incomeStatementData['2024_Year']?.[denom] || 0);
                      const rate2025Q = calcRate(incomeStatementData['2025_4Q']?.[num] || 0, incomeStatementData['2025_4Q']?.[denom] || 0);
                      const rate2025Y = calcRate(incomeStatementData['2025_Year']?.[num] || 0, incomeStatementData['2025_Year']?.[denom] || 0);
                      const diffQ = calcRateDiff(rate2025Q, rate2024Q);
                      const diffY = calcRateDiff(rate2025Y, rate2024Y);
                      
                      return (
                        <tr key={idx} className="border-b border-zinc-100 bg-zinc-50/50">
                          <td className="px-3 py-2 text-zinc-500 italic border-r border-zinc-200 text-xs">{item.label}</td>
                          <td className="text-center px-2 py-2 text-zinc-500 border-r border-zinc-100">{rate2024Q}</td>
                          <td className="text-center px-2 py-2 text-zinc-500 border-r border-zinc-200">{rate2024Y}</td>
                          <td className="text-center px-2 py-2 font-medium text-zinc-700 border-r border-zinc-100">{rate2025Q}</td>
                          <td className="text-center px-2 py-2 font-medium text-zinc-700 border-r border-zinc-200">{rate2025Y}</td>
                          <td colSpan="2" className={`text-center px-2 py-2 font-medium border-r border-zinc-200 ${diffQ.includes('+') ? 'text-emerald-600' : diffQ.includes('-') ? 'text-rose-600' : 'text-zinc-500'}`}>
                            {diffQ}
                          </td>
                          <td colSpan="2" className={`text-center px-2 py-2 font-medium ${diffY.includes('+') ? 'text-emerald-600' : diffY.includes('-') ? 'text-rose-600' : 'text-zinc-500'}`}>
                            {diffY}
                          </td>
                        </tr>
                      );
                    }

                    // 일반 금액 행 처리
                    const val2024Q = incomeStatementData['2024_4Q']?.[item.key] || 0;
                    const val2024Y = incomeStatementData['2024_Year']?.[item.key] || 0;
                    const val2025Q = incomeStatementData['2025_4Q']?.[item.key] || 0;
                    const val2025Y = incomeStatementData['2025_Year']?.[item.key] || 0;
                    
                    const diffQ = val2025Q - val2024Q;
                    const diffY = val2025Y - val2024Y;
                    const changeQ = calculateYoY(val2025Q, val2024Q);
                    const changeY = calculateYoY(val2025Y, val2024Y);
                    
                    const highlightClass = item.highlight === 'green' ? 'bg-emerald-50/50' : '';
                    const selectableClass = isSelectable ? 'cursor-pointer hover:bg-zinc-100' : '';
                    const selectedClass = isSelected ? 'bg-zinc-100 ring-1 ring-zinc-300 ring-inset' : '';
                    const toggleParentClass = isToggleParent ? 'cursor-pointer hover:bg-zinc-50' : '';
                    
                    return (
                      <tr 
                        key={idx} 
                        className={`border-b border-zinc-100 ${highlightClass} ${selectableClass} ${selectedClass} ${toggleParentClass}`}
                        onClick={() => {
                          if (isSelectable) setSelectedAccount(item.key);
                          if (isToggleParent) setIsNonOperatingExpanded(!isNonOperatingExpanded);
                        }}
                      >
                        <td className={`px-3 py-2 border-r border-zinc-200 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-600'} ${item.depth === 1 ? 'pl-6' : ''}`}>
                          {isToggleParent && (
                            <span className="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded bg-zinc-200 text-zinc-600 text-xs font-medium">
                              {isNonOperatingExpanded ? '−' : '+'}
                            </span>
                          )}
                          {isSelectable && <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400 mr-1.5"></span>}
                          {item.label}
                        </td>
                        <td className="text-right px-2 py-2 text-zinc-500 border-r border-zinc-100 tabular-nums">{formatNumber(val2024Q)}</td>
                        <td className="text-right px-2 py-2 text-zinc-500 border-r border-zinc-200 tabular-nums">{formatNumber(val2024Y)}</td>
                        <td className={`text-right px-2 py-2 border-r border-zinc-100 tabular-nums ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{formatNumber(val2025Q)}</td>
                        <td className={`text-right px-2 py-2 border-r border-zinc-200 tabular-nums ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{formatNumber(val2025Y)}</td>
                        <td className={`text-right px-2 py-2 font-medium border-r border-zinc-100 tabular-nums ${diffQ >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diffQ !== 0 ? formatNumber(diffQ) : '-'}
                        </td>
                        <td className={`text-right px-2 py-2 font-medium border-r border-zinc-200 tabular-nums ${parseFloat(changeQ) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {changeQ !== '-' ? `${changeQ}%` : '-'}
                        </td>
                        <td className={`text-right px-2 py-2 font-medium border-r border-zinc-100 tabular-nums ${diffY >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diffY !== 0 ? formatNumber(diffY) : '-'}
                        </td>
                        <td className={`text-right px-2 py-2 font-medium tabular-nums ${parseFloat(changeY) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {changeY !== '-' ? `${changeY}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 우측: 법인별 분석 */}
        <div className="w-[320px] flex-shrink-0 space-y-3">
          {/* 법인별 분석 헤더 */}
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">
              {incomeItems.find(i => i.key === selectedAccount)?.label || selectedAccount} 법인별 분석
            </h3>
            <p className="text-xs text-zinc-400">4분기 기준 법인별 비중</p>
            
            {/* 도넛 차트 영역 */}
            <div className="flex justify-around mt-4">
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-500 mb-2">2024년 4분기</p>
                <div className="w-[110px] h-[110px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getDonutData('2024_4Q')}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getDonutData('2024_4Q').map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-500 mb-2">2025년 4분기</p>
                <div className="w-[110px] h-[110px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getDonutData('2025_4Q')}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getDonutData('2025_4Q').map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* 법인별 테이블 */}
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left px-3 py-2 font-semibold text-zinc-600">법인</th>
                  <th className="text-right px-2 py-2 font-semibold text-zinc-600">2024</th>
                  <th className="text-right px-2 py-2 font-semibold text-zinc-600">2025</th>
                  <th className="text-right px-2 py-2 font-semibold text-zinc-600">비중</th>
                  <th className="text-right px-2 py-2 font-semibold text-zinc-600">YoY</th>
                </tr>
              </thead>
              <tbody>
                {getEntityTableData().map((row, idx) => (
                  <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-3 py-2 text-zinc-700">
                      <span 
                        className="inline-block w-2 h-2 rounded-full mr-1.5" 
                        style={{ backgroundColor: entityColors[row.entity] }}
                      ></span>
                      {row.entity}
                    </td>
                    <td className="text-right px-2 py-2 text-zinc-500 tabular-nums">{formatNumber(row.prevVal)}</td>
                    <td className="text-right px-2 py-2 text-zinc-900 font-medium tabular-nums">{formatNumber(row.currVal)}</td>
                    <td className="text-right px-2 py-2 text-zinc-500 tabular-nums">{row.ratio}%</td>
                    <td className={`text-right px-2 py-2 font-medium tabular-nums ${parseFloat(row.change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {row.change !== '-' ? `${parseFloat(row.change) >= 0 ? '+' : ''}${row.change}%` : '-'}
                    </td>
                  </tr>
                ))}
                {/* 합계 행 */}
                <tr className="bg-zinc-50 font-medium">
                  <td className="px-3 py-2 text-zinc-900">합계</td>
                  <td className="text-right px-2 py-2 text-zinc-700 tabular-nums">
                    {formatNumber(getEntityTableData().reduce((sum, r) => sum + r.prevVal, 0))}
                  </td>
                  <td className="text-right px-2 py-2 text-zinc-900 tabular-nums">
                    {formatNumber(getEntityTableData().reduce((sum, r) => sum + r.currVal, 0))}
                  </td>
                  <td className="text-right px-2 py-2 text-zinc-700 tabular-nums">100%</td>
                  <td className="text-right px-2 py-2 text-zinc-400">-</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 법인별 증감 분석 */}
          <div className="bg-white rounded-lg border border-zinc-200 p-3">
            <h4 className="text-xs font-semibold text-zinc-700 mb-2">증감 분석</h4>
            <div className="space-y-2 text-xs">
              <div className="p-2 bg-amber-50/50 rounded border-l-2 border-amber-400">
                <p className="font-medium text-zinc-800">중국 (F&F Shanghai)</p>
                <p className="text-zinc-500 text-[11px] mt-0.5">전년 대비 변동 내용</p>
              </div>
              <div className="p-2 bg-blue-50/50 rounded border-l-2 border-blue-400">
                <p className="font-medium text-zinc-800">OC(국내)</p>
                <p className="text-zinc-500 text-[11px] mt-0.5">전년 대비 변동 내용</p>
              </div>
              <div className="p-2 bg-zinc-50 rounded border-l-2 border-zinc-300">
                <p className="font-medium text-zinc-800">기타 법인</p>
                <p className="text-zinc-500 text-[11px] mt-0.5">전년 대비 변동 내용</p>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* 주요 지표 분석 */}
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded"></span>
              주요 수익성 지표 분석
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">매출액 성장률</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const curr = incomeStatementData['2025_Year']?.매출액 || 0;
                    const prev = incomeStatementData['2024_Year']?.매출액 || 1;
                    return prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  전년 대비 매출 성장률
                </div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">영업이익률</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const revenue = incomeStatementData['2025_Year']?.매출액 || 1;
                    const operating = incomeStatementData['2025_Year']?.영업이익 || 0;
                    return revenue > 0 ? ((operating / revenue) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  매출 대비 영업이익 비율
                </div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">순이익률</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const revenue = incomeStatementData['2025_Year']?.매출액 || 1;
                    const net = incomeStatementData['2025_Year']?.당기순이익 || 0;
                    return revenue > 0 ? ((net / revenue) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  매출 대비 순이익 비율
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // 재무상태표 탭 렌더링
  // ============================================
  const renderBalanceSheetTab = () => {
    // 성격별 분류 값 계산 함수
    const calculateNatureValue = (natureKey, period) => {
      const data = balanceSheetData[period] || {};
      const sourceKeys = NATURE_REVERSE_MAPPING[natureKey] || [];
      
      return sourceKeys.reduce((sum, key) => sum + (data[key] || 0), 0);
    };

    // 자산총계 계산
    const calculateTotalAssets = (period) => {
      const assetNatures = ['현금성자산', '매출채권', '재고자산', '유무형자산', '관계기업', 
                           '사용권자산', '금융상품', '대여금', '기타(차감항목)'];
      return assetNatures.reduce((sum, key) => sum + calculateNatureValue(key, period), 0);
    };

    // 부채총계 계산
    const calculateTotalLiabilities = (period) => {
      const liabilityNatures = ['외상매입금', '미지급금', '리스부채', '보증금', '차입금', '기타'];
      return liabilityNatures.reduce((sum, key) => sum + calculateNatureValue(key, period), 0);
    };

    // 자본총계 계산
    const calculateTotalEquity = (period) => {
      const data = balanceSheetData[period] || {};
      return (data.자본금 || 0) + 
             (data.자본잉여금 || 0) + 
             (data.이익잉여금 || 0) + 
             (data.기타자본 || 0);
    };

    // 성격별 분류 항목 정의
    const balanceItems = [
      // 자산
      { key: '현금성자산', label: '현금성자산', section: 'asset', isNature: true },
      { key: '매출채권', label: '매출채권', section: 'asset', isNature: true },
      { key: '재고자산', label: '재고자산', section: 'asset', isNature: true },
      { key: '유무형자산', label: '유,무형자산', section: 'asset', isNature: true },
      { key: '관계기업', label: '관계기업', section: 'asset', isNature: true },
      { key: '사용권자산', label: '사용권자산', section: 'asset', isNature: true },
      { key: '금융상품', label: '금융상품', section: 'asset', isNature: true },
      { key: '대여금', label: '대여금', section: 'asset', isNature: true },
      { key: '기타(차감항목)', label: '기타(차감항목)', section: 'asset', isNature: true },
      { key: '자산총계', label: '자산총계', section: 'asset', highlight: 'blue', isNature: true, isTotal: true },
      // 부채
      { key: '외상매입금', label: '외상매입금', section: 'liability', isNature: true },
      { key: '미지급금', label: '미지급금', section: 'liability', isNature: true },
      { key: '리스부채', label: '리스부채', section: 'liability', isNature: true },
      { key: '보증금', label: '보증금', section: 'liability', isNature: true },
      { key: '차입금', label: '차입금', section: 'liability', isNature: true },
      { key: '기타', label: '기타', section: 'liability', isNature: true },
      { key: '부채총계', label: '부채총계', section: 'liability', highlight: 'red', isNature: true, isTotal: true },
      // 자본
      { key: '자본총계', label: '자본총계', section: 'equity', highlight: 'green', isNature: true, isTotal: true },
    ];

    // 요약 카드 데이터
    const summaryCards = [
      {
        title: '자산총계',
        key: '자산총계',
        isCalculated: true,
        calcFn: (data, period) => calculateTotalAssets(period),
      },
      {
        title: '운전자본',
        key: '운전자본',
        isCalculated: true,
        calcFn: (data) => {
          const 매출채권 = data?.매출채권 || 0;
          const 재고자산 = data?.재고자산 || 0;
          const 매입채무 = data?.매입채무 || 0;
          return 매출채권 + 재고자산 - 매입채무;
        },
      },
      {
        title: '부채비율',
        key: '부채비율',
        isRate: true,
        isCalculated: true,
        calcFn: (period) => {
          const debt = calculateTotalLiabilities(period);
          const equity = calculateTotalEquity(period) || 1;
          return equity > 0 ? ((debt / equity) * 100) : 0;
        },
      },
      {
        title: 'ROE',
        key: 'ROE',
        isRate: true,
        isCalculated: true,
        calcFn: (balanceData, period) => {
          const netIncome = incomeStatementData[period]?.당기순이익 || 0;
          const equity = calculateTotalEquity(period) || 1;
          return equity > 0 ? ((netIncome / equity) * 100) : 0;
        },
      },
    ];

    return (
      <div className="space-y-4">
        {/* 요약 카드 섹션 */}
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card, idx) => {
            let curr, prev;
            
            if (card.isCalculated) {
              if (card.key === '운전자본') {
                curr = card.calcFn(balanceSheetData['2025_Year']);
                prev = card.calcFn(balanceSheetData['2024_Year']);
              } else if (card.key === 'ROE') {
                curr = card.calcFn(balanceSheetData['2025_Year'], '2025_Year');
                prev = card.calcFn(balanceSheetData['2024_Year'], '2024_Year');
              } else if (card.key === '자산총계') {
                curr = card.calcFn(balanceSheetData['2025_Year'], '2025_Year');
                prev = card.calcFn(balanceSheetData['2024_Year'], '2024_Year');
              } else {
                curr = 0;
                prev = 0;
              }
            } else if (card.isRate && !card.isCalculated) {
              curr = (balanceSheetData['2025_Year']?.[card.rateOf[0]] || 0) / (balanceSheetData['2025_Year']?.[card.rateOf[1]] || 1) * 100;
              prev = (balanceSheetData['2024_Year']?.[card.rateOf[0]] || 0) / (balanceSheetData['2024_Year']?.[card.rateOf[1]] || 1) * 100;
            } else if (card.isRate && card.isCalculated && card.key === '부채비율') {
              curr = card.calcFn('2025_Year');
              prev = card.calcFn('2024_Year');
            } else {
              curr = balanceSheetData['2025_Year']?.[card.key] || 0;
              prev = balanceSheetData['2024_Year']?.[card.key] || 0;
            }
            
            const diff = curr - prev;
            const changeRate = card.isRate 
              ? (diff).toFixed(1) + '%p'
              : calculateYoY(curr, prev);
            const isPositive = parseFloat(changeRate) >= 0;
            
            return (
              <div 
                key={idx}
                className="bg-white rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{card.title}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {changeRate !== '-' ? `${isPositive ? '+' : ''}${changeRate}${card.isRate ? '' : '%'}` : '-'}
                  </span>
                </div>
                
                {/* 금액 또는 비율 */}
                <div className="text-2xl font-bold text-zinc-900 tracking-tight">
                  {card.isRate ? `${curr.toFixed(1)}%` : formatNumber(curr)}
                </div>
                
                {/* 전년 & 증감 */}
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-zinc-400">전년 {card.isRate ? `${prev.toFixed(1)}%` : formatNumber(prev)}</span>
                  <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isPositive ? '+' : ''}{card.isRate ? diff.toFixed(1) + '%p' : formatNumber(diff)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 재무상태표 테이블 및 법인별 분석 */}
        <div className="flex gap-4">
        {/* 좌측: 재무상태표 테이블 */}
        <div className="flex-1 bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
            <h3 className="text-sm font-semibold text-zinc-900">연결 재무상태표</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th rowSpan="2" className="text-left px-3 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[200px]">과목</th>
                  <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200">2024년 기말</th>
                  <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100">2025년 기말</th>
                  <th colSpan="2" className="text-center px-3 py-2 font-semibold text-zinc-600">증감</th>
                </tr>
                <tr className="bg-zinc-50/50 border-b border-zinc-200">
                  <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-100 min-w-[100px]">금액</th>
                  <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-200 min-w-[80px]">구성비</th>
                  <th className="text-center px-2 py-2 font-medium text-zinc-700 border-r border-zinc-100 bg-zinc-100/50 min-w-[100px]">금액</th>
                  <th className="text-center px-2 py-2 font-medium text-zinc-700 border-r border-zinc-200 bg-zinc-100/50 min-w-[80px]">구성비</th>
                  <th className="text-center px-2 py-2 font-medium text-zinc-500 border-r border-zinc-100 min-w-[100px]">금액</th>
                  <th className="text-center px-2 py-2 font-medium text-zinc-500 min-w-[80px]">비율</th>
                </tr>
              </thead>
              <tbody>
                {balanceItems.map((item, idx) => {
                  // 헤더 항목인 경우 데이터 표시 안 함
                  if (item.isHeader) {
                    return (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td colSpan="7" className={`px-3 py-2 font-semibold text-zinc-900 bg-zinc-50`}>
                          {item.label}
                        </td>
                      </tr>
                    );
                  }
                  
                  // 성격별 분류 값 계산
                  let val2024, val2025;
                  if (item.isTotal) {
                    if (item.key === '자산총계') {
                      val2024 = calculateTotalAssets('2024_Year');
                      val2025 = calculateTotalAssets('2025_Year');
                    } else if (item.key === '부채총계') {
                      val2024 = calculateTotalLiabilities('2024_Year');
                      val2025 = calculateTotalLiabilities('2025_Year');
                    } else if (item.key === '자본총계') {
                      val2024 = calculateTotalEquity('2024_Year');
                      val2025 = calculateTotalEquity('2025_Year');
                    } else {
                      val2024 = 0;
                      val2025 = 0;
                    }
                  } else {
                    val2024 = calculateNatureValue(item.key, '2024_Year');
                    val2025 = calculateNatureValue(item.key, '2025_Year');
                  }
                  
                  const diff = val2025 - val2024;
                  const change = calculateYoY(val2025, val2024);
                  
                  // 구성비 계산 (집계된 자산총계 기준)
                  const total2024 = calculateTotalAssets('2024_Year') || 1;
                  const total2025 = calculateTotalAssets('2025_Year') || 1;
                  const ratio2024 = total2024 > 0 ? ((val2024 / total2024) * 100).toFixed(1) : '0.0';
                  const ratio2025 = total2025 > 0 ? ((val2025 / total2025) * 100).toFixed(1) : '0.0';
                  
                  const highlightClass = item.highlight === 'green' ? 'bg-emerald-50/50' 
                    : item.highlight === 'red' ? 'bg-rose-50/50'
                    : item.highlight === 'blue' ? 'bg-blue-50/50' : '';
                  
                  const isSelected = item.key === selectedBalanceAccount;
                  
                  return (
                    <tr 
                      key={idx} 
                      className={`border-b border-zinc-100 ${highlightClass} ${isSelected ? 'bg-blue-50/50' : ''} cursor-pointer hover:bg-zinc-50`}
                      onClick={() => !item.isTotal && setSelectedBalanceAccount(item.key)}
                    >
                      <td className={`px-3 py-2 border-r border-zinc-200 ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-600'} ${item.depth === 1 ? 'pl-6' : ''}`}>
                        {item.label}
                      </td>
                      <td className="text-right px-2 py-2 text-zinc-500 border-r border-zinc-100 tabular-nums">{formatNumber(val2024)}</td>
                      <td className="text-right px-2 py-2 text-zinc-500 border-r border-zinc-200 tabular-nums">{ratio2024}%</td>
                      <td className={`text-right px-2 py-2 border-r border-zinc-100 tabular-nums ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{formatNumber(val2025)}</td>
                      <td className={`text-right px-2 py-2 border-r border-zinc-200 tabular-nums ${item.bold ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{ratio2025}%</td>
                      <td className={`text-right px-2 py-2 font-medium border-r border-zinc-100 tabular-nums ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diff !== 0 ? formatNumber(diff) : '-'}
                      </td>
                      <td className={`text-right px-2 py-2 font-medium tabular-nums ${parseFloat(change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {change !== '-' ? `${change}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 법인별 분석 */}
        <div className="w-[320px] flex-shrink-0 space-y-3">
          {(() => {
            // 법인별 데이터 (선택된 과목에 따라)
            const entityData = {
              '현금성자산': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '매출채권': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '재고자산': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '유무형자산': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '관계기업': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '사용권자산': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '금융상품': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '대여금': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '기타(차감항목)': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '외상매입금': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '미지급금': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '리스부채': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '보증금': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '차입금': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
              '기타': {
                '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
                '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
              },
            };

            // 법인 색상
            const entityColors = {
              'OC(국내)': '#3B82F6',
              '3자수출': '#10B981',
              '중국': '#F59E0B',
              '홍마대': '#8B5CF6',
              '기타': '#6B7280',
            };

            // 도넛 차트용 데이터 변환
            const getDonutData = (period) => {
              const data = entityData[selectedBalanceAccount]?.[period] || {};
              return Object.entries(data).map(([name, value]) => ({
                name,
                value: value || 0,
                color: entityColors[name],
              }));
            };

            // 법인별 테이블 데이터
            const getEntityTableData = () => {
              const prev = entityData[selectedBalanceAccount]?.['2024_Year'] || {};
              const curr = entityData[selectedBalanceAccount]?.['2025_Year'] || {};
              const totalCurr = Object.values(curr).reduce((a, b) => a + b, 0);
              
              return Object.keys(entityColors).map(entity => {
                const prevVal = prev[entity] || 0;
                const currVal = curr[entity] || 0;
                const ratio = totalCurr > 0 ? ((currVal / totalCurr) * 100).toFixed(1) : '0.0';
                const change = prevVal > 0 ? (((currVal - prevVal) / prevVal) * 100).toFixed(1) : '-';
                
                return {
                  entity,
                  prevVal,
                  currVal,
                  ratio,
                  change,
                };
              });
            };

            return (
              <>
                {/* 법인별 분석 헤더 */}
                <div className="bg-white rounded-lg border border-zinc-200 p-4">
                  <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">
                    {balanceItems.find(i => i.key === selectedBalanceAccount)?.label || selectedBalanceAccount} 법인별 분석
                  </h3>
                  <p className="text-xs text-zinc-400">기말 기준 법인별 비중</p>
                  
                  {/* 도넛 차트 영역 */}
                  <div className="flex justify-around mt-4">
                    <div className="text-center">
                      <p className="text-xs font-medium text-zinc-500 mb-2">2024년 기말</p>
                      <div className="w-[110px] h-[110px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={getDonutData('2024_Year')}
                              cx="50%"
                              cy="50%"
                              innerRadius={28}
                              outerRadius={48}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {getDonutData('2024_Year').map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-zinc-500 mb-2">2025년 기말</p>
                      <div className="w-[110px] h-[110px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={getDonutData('2025_Year')}
                              cx="50%"
                              cy="50%"
                              innerRadius={28}
                              outerRadius={48}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {getDonutData('2025_Year').map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 법인별 테이블 */}
                <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="text-left px-3 py-2 font-semibold text-zinc-600">법인</th>
                        <th className="text-right px-2 py-2 font-semibold text-zinc-600">2024</th>
                        <th className="text-right px-2 py-2 font-semibold text-zinc-600">2025</th>
                        <th className="text-right px-2 py-2 font-semibold text-zinc-600">비중</th>
                        <th className="text-right px-2 py-2 font-semibold text-zinc-600">YoY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getEntityTableData().map((row, idx) => (
                        <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="px-3 py-2 text-zinc-700">
                            <span 
                              className="inline-block w-2 h-2 rounded-full mr-1.5" 
                              style={{ backgroundColor: entityColors[row.entity] }}
                            ></span>
                            {row.entity}
                          </td>
                          <td className="text-right px-2 py-2 text-zinc-500 tabular-nums">{formatNumber(row.prevVal)}</td>
                          <td className="text-right px-2 py-2 text-zinc-900 font-medium tabular-nums">{formatNumber(row.currVal)}</td>
                          <td className="text-right px-2 py-2 text-zinc-500 tabular-nums">{row.ratio}%</td>
                          <td className={`text-right px-2 py-2 font-medium tabular-nums ${parseFloat(row.change) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.change !== '-' ? `${parseFloat(row.change) >= 0 ? '+' : ''}${row.change}%` : '-'}
                          </td>
                        </tr>
                      ))}
                      {/* 합계 행 */}
                      <tr className="bg-zinc-50 font-medium">
                        <td className="px-3 py-2 text-zinc-900">합계</td>
                        <td className="text-right px-2 py-2 text-zinc-700 tabular-nums">
                          {formatNumber(getEntityTableData().reduce((sum, r) => sum + r.prevVal, 0))}
                        </td>
                        <td className="text-right px-2 py-2 text-zinc-900 tabular-nums">
                          {formatNumber(getEntityTableData().reduce((sum, r) => sum + r.currVal, 0))}
                        </td>
                        <td className="text-right px-2 py-2 text-zinc-700 tabular-nums">100%</td>
                        <td className="text-right px-2 py-2 text-zinc-400">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 법인별 증감 분석 */}
                <div className="bg-white rounded-lg border border-zinc-200 p-3">
                  <h4 className="text-xs font-semibold text-zinc-700 mb-2">증감 분석</h4>
                  <div className="space-y-2 text-xs">
                    <div className="p-2 bg-amber-50/50 rounded border-l-2 border-amber-400">
                      <p className="font-medium text-zinc-800">중국 (F&F Shanghai)</p>
                      <p className="text-zinc-500 text-[11px] mt-0.5">전년 대비 변동 내용</p>
                    </div>
                    <div className="p-2 bg-blue-50/50 rounded border-l-2 border-blue-400">
                      <p className="font-medium text-zinc-800">OC(국내)</p>
                      <p className="text-zinc-500 text-[11px] mt-0.5">전년 대비 변동 내용</p>
                    </div>
                    <div className="p-2 bg-zinc-50 rounded border-l-2 border-zinc-300">
                      <p className="font-medium text-zinc-800">기타 법인</p>
                      <p className="text-zinc-500 text-[11px] mt-0.5">전년 대비 변동 내용</p>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
        </div>

        {/* 재무비율 분석 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <h4 className="text-sm font-semibold text-zinc-900 mb-3">재무비율</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">부채비율</span>
                <span className="text-sm font-bold text-zinc-900">
                  {(() => {
                    const debt = calculateTotalLiabilities('2025_Year');
                    const equity = calculateTotalEquity('2025_Year') || 1;
                    return equity > 0 ? ((debt / equity) * 100).toFixed(1) : '0.0';
                  })()}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">유동비율</span>
                <span className="text-sm font-bold text-zinc-900">
                  {(() => {
                    // 유동자산 = 현금성자산 + 매출채권 + 재고자산 + 기타(차감항목 중 유동)
                    const currentAsset = calculateNatureValue('현금성자산', '2025_Year') + 
                                        calculateNatureValue('매출채권', '2025_Year') + 
                                        calculateNatureValue('재고자산', '2025_Year');
                    // 유동부채 = 외상매입금 + 미지급금 + 리스부채 + 보증금 + 차입금(단기) + 기타(유동)
                    const currentLiability = calculateNatureValue('외상매입금', '2025_Year') + 
                                            calculateNatureValue('미지급금', '2025_Year') + 
                                            calculateNatureValue('리스부채', '2025_Year') + 
                                            (balanceSheetData['2025_Year']?.단기차입금 || 0) || 1;
                    return currentLiability > 0 ? ((currentAsset / currentLiability) * 100).toFixed(1) : '0.0';
                  })()}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">자기자본비율</span>
                <span className="text-sm font-bold text-zinc-900">
                  {(() => {
                    const equity = calculateTotalEquity('2025_Year');
                    const total = calculateTotalAssets('2025_Year') || 1;
                    return total > 0 ? ((equity / total) * 100).toFixed(1) : '0.0';
                  })()}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <h4 className="text-sm font-semibold text-zinc-900 mb-3">자산 구성</h4>
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-600">유동자산</span>
                  <span className="text-xs font-medium text-zinc-900">
                    {(() => {
                      // 유동자산 = 현금성자산 + 매출채권 + 재고자산
                      const current = calculateNatureValue('현금성자산', '2025_Year') + 
                                     calculateNatureValue('매출채권', '2025_Year') + 
                                     calculateNatureValue('재고자산', '2025_Year');
                      const total = calculateTotalAssets('2025_Year') || 1;
                      return total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
                    })()}%
                  </span>
                </div>
                <div className="w-full bg-zinc-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ 
                      width: `${(() => {
                        const current = calculateNatureValue('현금성자산', '2025_Year') + 
                                       calculateNatureValue('매출채권', '2025_Year') + 
                                       calculateNatureValue('재고자산', '2025_Year');
                        const total = calculateTotalAssets('2025_Year') || 1;
                        return total > 0 ? ((current / total) * 100) : 0;
                      })()}%` 
                    }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-600">비유동자산</span>
                  <span className="text-xs font-medium text-zinc-900">
                    {(() => {
                      // 비유동자산 = 나머지 모든 자산
                      const nonCurrent = calculateNatureValue('유무형자산', '2025_Year') + 
                                        calculateNatureValue('관계기업', '2025_Year') + 
                                        calculateNatureValue('사용권자산', '2025_Year') + 
                                        calculateNatureValue('금융상품', '2025_Year') + 
                                        calculateNatureValue('대여금', '2025_Year') + 
                                        calculateNatureValue('기타(차감항목)', '2025_Year');
                      const total = calculateTotalAssets('2025_Year') || 1;
                      return total > 0 ? ((nonCurrent / total) * 100).toFixed(1) : '0.0';
                    })()}%
                  </span>
                </div>
                <div className="w-full bg-zinc-200 rounded-full h-2">
                  <div 
                    className="bg-amber-500 h-2 rounded-full" 
                    style={{ 
                      width: `${(() => {
                        const nonCurrent = calculateNatureValue('유무형자산', '2025_Year') + 
                                          calculateNatureValue('관계기업', '2025_Year') + 
                                          calculateNatureValue('사용권자산', '2025_Year') + 
                                          calculateNatureValue('금융상품', '2025_Year') + 
                                          calculateNatureValue('대여금', '2025_Year') + 
                                          calculateNatureValue('기타(차감항목)', '2025_Year');
                        const total = calculateTotalAssets('2025_Year') || 1;
                        return total > 0 ? ((nonCurrent / total) * 100) : 0;
                      })()}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 경쟁사 비교 및 주요 지표 분석 */}
        <div className="mt-6 space-y-4">
          {/* 경쟁사 비교 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-violet-500 rounded"></span>
              경쟁사 비교 (재무 안정성 지표)
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {(() => {
                // 재무상태표 데이터 기반 경쟁사 비교 (성격별 분류 값 사용)
                const fnfDebt = calculateTotalLiabilities('2025_Year');
                const fnfEquity = calculateTotalEquity('2025_Year') || 1;
                const fnfDebtRatio = fnfEquity > 0 ? ((fnfDebt / fnfEquity) * 100) : 0;
                const fnfCurrentAsset = calculateNatureValue('현금성자산', '2025_Year') + 
                                       calculateNatureValue('매출채권', '2025_Year') + 
                                       calculateNatureValue('재고자산', '2025_Year');
                const fnfCurrentLiability = calculateNatureValue('외상매입금', '2025_Year') + 
                                           calculateNatureValue('미지급금', '2025_Year') + 
                                           calculateNatureValue('리스부채', '2025_Year') + 
                                           (balanceSheetData['2025_Year']?.단기차입금 || 0) || 1;
                const fnfCurrentRatio = fnfCurrentLiability > 0 ? ((fnfCurrentAsset / fnfCurrentLiability) * 100) : 0;
                const fnfRevenue = incomeStatementData['2025_Year']?.매출액 || 0;
                const fnfNetIncome = incomeStatementData['2025_Year']?.당기순이익 || 0;
                const fnfROE = fnfEquity > 0 ? ((fnfNetIncome / fnfEquity) * 100) : 0;
                const fnfYoY = incomeStatementData['2024_Year']?.매출액 > 0
                  ? (((fnfRevenue - incomeStatementData['2024_Year'].매출액) / incomeStatementData['2024_Year'].매출액) * 100) : 0;

                const competitors = [
                  { 
                    company: 'F&F', 
                    isBase: true,
                    매출액: fnfRevenue, // 백만원 단위
                    yoy: fnfYoY.toFixed(1),
                    영업이익률: 0,
                    ROE: fnfROE.toFixed(1),
                    부채비율: fnfDebtRatio.toFixed(1),
                    유동비율: fnfCurrentRatio.toFixed(1),
                    color: '#3B82F6'
                  },
                  { 
                    company: '휠라(미스토홀딩스)', 
                    isBase: false,
                    매출액: 0, 
                    yoy: 0, 
                    영업이익률: 0, 
                    ROE: 0, 
                    부채비율: 0, 
                    유동비율: 0,
                    color: '#EF4444'
                  },
                  { 
                    company: '신세계INT', 
                    isBase: false,
                    매출액: 0, 
                    yoy: 0, 
                    영업이익률: 0, 
                    ROE: 0, 
                    부채비율: 0, 
                    유동비율: 0,
                    color: '#8B5CF6'
                  },
                  { 
                    company: 'LG생활건강', 
                    isBase: false,
                    매출액: 0, 
                    yoy: 0, 
                    영업이익률: 0, 
                    ROE: 0, 
                    부채비율: 0, 
                    유동비율: 0,
                    color: '#10B981'
                  },
                ];

                return competitors.map((comp, idx) => (
                  <div 
                    key={idx} 
                    className={`bg-white rounded-lg border p-4 ${
                      comp.isBase ? 'border-blue-300 ring-1 ring-blue-100' : 'border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: comp.color }}></span>
                      <span className="text-sm font-semibold text-zinc-900">{comp.company}</span>
                      {comp.isBase && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">기준</span>
                      )}
                    </div>
                    <div className="mb-3">
                      <div className="text-xs text-zinc-400 mb-0.5">자산총계</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-zinc-900">{formatNumber(calculateTotalAssets('2025_Year') || 0)}</span>
                        <span className="text-xs text-zinc-400">백만원</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100">
                      <div>
                        <div className="text-[10px] text-zinc-400">부채비율</div>
                        <div className={`text-sm font-bold ${parseFloat(comp.부채비율) <= 100 ? 'text-emerald-600' : 'text-zinc-900'}`}>
                          {comp.부채비율}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-400">유동비율</div>
                        <div className={`text-sm font-bold ${parseFloat(comp.유동비율) >= 150 ? 'text-emerald-600' : 'text-zinc-900'}`}>
                          {comp.유동비율}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-400">ROE</div>
                        <div className={`text-sm font-bold ${parseFloat(comp.ROE) >= 10 ? 'text-emerald-600' : parseFloat(comp.ROE) >= 0 ? 'text-zinc-900' : 'text-rose-600'}`}>
                          {comp.ROE}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-400">자기자본비율</div>
                        <div className={`text-sm font-bold ${(() => {
                          const equity = calculateTotalEquity('2025_Year');
                          const total = calculateTotalAssets('2025_Year') || 1;
                          const ratio = total > 0 ? ((equity / total) * 100) : 0;
                          return ratio >= 50 ? 'text-emerald-600' : 'text-zinc-900';
                        })()}`}>
                          {(() => {
                            const equity = calculateTotalEquity('2025_Year');
                            const total = calculateTotalAssets('2025_Year') || 1;
                            return total > 0 ? ((equity / total) * 100).toFixed(1) : '0.0';
                          })()}%
                        </div>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* 주요 지표 분석 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-500 rounded"></span>
              주요 안정성 지표 분석
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">부채비율</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const debt = calculateTotalLiabilities('2025_Year');
                    const equity = calculateTotalEquity('2025_Year') || 1;
                    return equity > 0 ? ((debt / equity) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  부채 / 자본 비율
                </div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">유동비율</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const current = calculateNatureValue('현금성자산', '2025_Year') + 
                                   calculateNatureValue('매출채권', '2025_Year') + 
                                   calculateNatureValue('재고자산', '2025_Year');
                    const liability = calculateNatureValue('외상매입금', '2025_Year') + 
                                     calculateNatureValue('미지급금', '2025_Year') + 
                                     calculateNatureValue('리스부채', '2025_Year') + 
                                     (balanceSheetData['2025_Year']?.단기차입금 || 0) || 1;
                    return liability > 0 ? ((current / liability) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  유동자산 / 유동부채
                </div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">자기자본비율</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const equity = calculateTotalEquity('2025_Year');
                    const total = calculateTotalAssets('2025_Year') || 1;
                    return total > 0 ? ((equity / total) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  자본 / 자산 비율
                </div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-xs text-zinc-400 mb-2">ROE</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">
                  {(() => {
                    const net = incomeStatementData['2025_Year']?.당기순이익 || 0;
                    const equity = calculateTotalEquity('2025_Year') || 1;
                    return equity > 0 ? ((net / equity) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-xs text-zinc-500">
                  자기자본이익률
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // 메인 렌더링
  // ============================================
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto p-4">
        {/* 헤더 */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-zinc-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">F&F</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900">F&F Corporation</h1>
                <p className="text-xs text-zinc-500">2025년 4분기 연결 재무제표</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadExcelTemplate}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
              >
                <span>📥</span>
                <span>양식 다운로드</span>
              </button>
              <label className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1.5">
                <span>📤</span>
                <span>엑셀 업로드</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
              </label>
              <div className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded">
                FY2025 Q4
              </div>
            </div>
          </div>
          {uploadStatus && (
            <div className={`mt-2 px-3 py-2 rounded text-xs font-medium ${
              uploadStatus === 'success' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {uploadStatus === 'success' 
                ? '✅ 데이터가 성공적으로 업로드되었습니다.' 
                : '❌ 업로드 중 오류가 발생했습니다. 파일 형식을 확인해주세요.'}
            </div>
          )}
        </div>

        {/* 탭 네비게이션 */}
        <div className="mb-4">
          <div className="inline-flex p-0.5 bg-zinc-100 rounded-lg border border-zinc-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 컨텐츠 */}
        <div>
          {activeTab === 'summary' && renderSummaryTab()}
          {activeTab === 'income' && renderIncomeTab()}
          {activeTab === 'balance' && renderBalanceSheetTab()}
        </div>

        {/* 푸터 */}
        <div className="mt-6 pt-4 border-t border-zinc-200">
          <p className="text-xs text-zinc-400 text-center">
            © 2025 F&F Corporation | 단위: 백만원
          </p>
        </div>
      </div>
    </div>
  );
}
