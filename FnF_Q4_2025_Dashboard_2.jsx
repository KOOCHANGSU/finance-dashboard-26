import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area } from 'recharts';
import * as XLSX from 'xlsx';

// ============================================
// F&F Corporation Q4 2025 Financial Dashboard
// shadcn/ui 스타일 적용
// ============================================

export default function FnFQ4Dashboard() {
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedAccount, setSelectedAccount] = useState('매출액');
  const [selectedBSAccount, setSelectedBSAccount] = useState('자산총계');
  const [isNonOperatingExpanded, setIsNonOperatingExpanded] = useState(false);
  const [incomeViewMode, setIncomeViewMode] = useState('quarter'); // 'quarter' | 'annual'
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadDetails, setUploadDetails] = useState(null); // 업로드 상세 정보

  // ============================================
  // 손익계산서 데이터 - 분기(3개월) + 누적(연간) 통합
  // ============================================
  const [incomeStatementData, setIncomeStatementData] = useState({
    '2024_4Q': { // 전년 4분기 (3개월)
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
    },
    '2024_Year': { // 전년 누적 (연간)
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
    },
    '2025_4Q': { // 당기 4분기 (3개월)
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
    },
    '2025_Year': { // 당기 누적 (연간)
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
    },
  });

  // ============================================
  // 엑셀 파일 파싱 및 데이터 업데이트
  // ============================================
  const parseExcelFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          console.log('엑셀 파일 읽기 성공:', file.name);
          console.log('시트 목록:', workbook.SheetNames);
          
          // 첫 번째 시트 읽기
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

          console.log('파싱된 데이터 샘플 (첫 10행):', jsonData.slice(0, 10));

          // 파일명에서 연도 추출
          const fileName = file.name;
          const yearMatch = fileName.match(/20(\d{2})/);
          const fileYear = yearMatch ? `20${yearMatch[1]}` : null;

          // 손익계산서 항목 매핑 (다양한 형식 지원)
          const accountMapping = {
            '매출액': '매출액',
            '매출원가': '매출원가',
            '매출총이익': '매출총이익',
            '판매비와관리비': '판매비와관리비',
            '판관비': '판매비와관리비',
            '인건비': '인건비',
            '광고선전비': '광고선전비',
            '광고비': '광고선전비',
            '수수료': '수수료',
            '감가상각비': '감가상각비',
            '기타판관비': '기타판관비',
            '기타': '기타판관비',
            '영업이익': '영업이익',
            '영업외손익': '영업외손익',
            '외환손익': '외환손익',
            '선물환손익': '선물환손익',
            '금융상품손익': '금융상품손익',
            '이자손익': '이자손익',
            '이자수익': '이자손익',
            '이자비용': '이자손익',
            '배당수익': '배당수익',
            '기부금': '기부금',
            '기타손익': '기타손익',
            '지분법손익': '지분법손익',
            '법인세비용차감전순이익': '법인세비용차감전순이익',
            '법인세비용': '법인세비용',
            '당기순이익': '당기순이익',
          };

          setIncomeStatementData(prevData => {
            const newData = JSON.parse(JSON.stringify(prevData)); // deep copy
            
            // 헤더 행 찾기 (첫 몇 행에서 기간 정보 찾기)
            let headerRowIdx = -1;
            let accountColIdx = 0;
            const periods = [];
            const debugInfo = [];
            
            // 전체 데이터 구조 확인
            debugInfo.push(`전체 행 수: ${jsonData.length}`);
            debugInfo.push(`첫 5행 샘플: ${JSON.stringify(jsonData.slice(0, 5))}`);
            
            // 헤더 행 찾기 (과목, 항목 등이 있는 행)
            for (let rowIdx = 0; rowIdx < Math.min(15, jsonData.length); rowIdx++) {
              const row = jsonData[rowIdx] || [];
              const firstCell = row[0];
              
              if (firstCell && typeof firstCell === 'string') {
                const firstCellStr = String(firstCell).trim();
                
                // 헤더 행 찾기 (과목, 항목, 계정 등)
                if (firstCellStr.includes('과목') || firstCellStr.includes('항목') || firstCellStr.includes('계정') || 
                    firstCellStr === '과목' || firstCellStr === '항목') {
                  headerRowIdx = rowIdx;
                  accountColIdx = 0;
                  
                  debugInfo.push(`헤더 행 발견: ${rowIdx}행`);
                  debugInfo.push(`헤더 행 데이터: ${JSON.stringify(row.slice(0, 10))}`);
                  
                  // 헤더 행에서 기간 정보 찾기
                  for (let colIdx = 1; colIdx < row.length; colIdx++) {
                    const cell = row[colIdx];
                    const cellStr = cell ? String(cell).trim() : '';
                    
                    if (!cellStr) continue;
                    
                    // 2024년 4분기
                    if ((cellStr.includes('2024') || cellStr === '2024') && 
                        (cellStr.includes('4Q') || cellStr.includes('4분기') || cellStr.includes('IV') || 
                         cellStr.includes('Q4') || cellStr.includes('4Q'))) {
                      periods.push({ col: colIdx, period: '2024_4Q' });
                      debugInfo.push(`기간 매핑: "${cellStr}" -> 2024_4Q (열 ${colIdx})`);
                    }
                    // 2024년 연간/누적
                    else if ((cellStr.includes('2024') || cellStr === '2024') && 
                             (cellStr.includes('Year') || cellStr.includes('연간') || cellStr.includes('누적') || 
                              cellStr.includes('년') || cellStr.includes('합계') || cellStr.includes('연') ||
                              cellStr.includes('Y') || cellStr.includes('YTD'))) {
                      periods.push({ col: colIdx, period: '2024_Year' });
                      debugInfo.push(`기간 매핑: "${cellStr}" -> 2024_Year (열 ${colIdx})`);
                    }
                    // 2025년 4분기
                    else if ((cellStr.includes('2025') || cellStr === '2025') && 
                             (cellStr.includes('4Q') || cellStr.includes('4분기') || cellStr.includes('IV') ||
                              cellStr.includes('Q4') || cellStr.includes('4Q'))) {
                      periods.push({ col: colIdx, period: '2025_4Q' });
                      debugInfo.push(`기간 매핑: "${cellStr}" -> 2025_4Q (열 ${colIdx})`);
                    }
                    // 2025년 연간/누적
                    else if ((cellStr.includes('2025') || cellStr === '2025') && 
                             (cellStr.includes('Year') || cellStr.includes('연간') || cellStr.includes('누적') ||
                              cellStr.includes('년') || cellStr.includes('합계') || cellStr.includes('연') ||
                              cellStr.includes('Y') || cellStr.includes('YTD'))) {
                      periods.push({ col: colIdx, period: '2025_Year' });
                      debugInfo.push(`기간 매핑: "${cellStr}" -> 2025_Year (열 ${colIdx})`);
                    }
                    // 숫자만 있는 경우 (2024, 2025)
                    else if (/^20\d{2}$/.test(cellStr)) {
                      const year = cellStr;
                      // 다음 셀 확인
                      const nextCell = row[colIdx + 1];
                      const nextCellStr = nextCell ? String(nextCell).trim() : '';
                      if (nextCellStr.includes('4Q') || nextCellStr.includes('4분기') || nextCellStr.includes('Q4')) {
                        periods.push({ col: colIdx + 1, period: `${year}_4Q` });
                        debugInfo.push(`기간 매핑: ${year} 4Q -> ${year}_4Q (열 ${colIdx + 1})`);
                      } else if (nextCellStr.includes('Year') || nextCellStr.includes('연간') || nextCellStr.includes('누적') || nextCellStr.includes('Y')) {
                        periods.push({ col: colIdx + 1, period: `${year}_Year` });
                        debugInfo.push(`기간 매핑: ${year} Year -> ${year}_Year (열 ${colIdx + 1})`);
                      }
                    }
                  }
                  break;
                }
              }
            }

            // 헤더를 찾지 못한 경우, 첫 번째 행을 헤더로 간주
            if (headerRowIdx === -1) {
              debugInfo.push('헤더 행을 찾지 못함. 첫 번째 행을 헤더로 사용');
              headerRowIdx = 0;
              const firstRow = jsonData[0] || [];
              debugInfo.push(`첫 번째 행: ${JSON.stringify(firstRow.slice(0, 10))}`);
              
              for (let colIdx = 1; colIdx < firstRow.length; colIdx++) {
                const cell = firstRow[colIdx];
                const cellStr = cell ? String(cell).trim() : '';
                if (cellStr.includes('2024') || cellStr === '2024') {
                  if (cellStr.includes('4Q') || cellStr.includes('4분기') || cellStr.includes('Q4')) {
                    periods.push({ col: colIdx, period: '2024_4Q' });
                  } else {
                    periods.push({ col: colIdx, period: '2024_Year' });
                  }
                } else if (cellStr.includes('2025') || cellStr === '2025') {
                  if (cellStr.includes('4Q') || cellStr.includes('4분기') || cellStr.includes('Q4')) {
                    periods.push({ col: colIdx, period: '2025_4Q' });
                  } else {
                    periods.push({ col: colIdx, period: '2025_Year' });
                  }
                }
              }
            }

            console.log('=== 엑셀 파싱 디버그 정보 ===');
            debugInfo.forEach(info => console.log(info));
            console.log('발견된 기간:', periods);

            if (periods.length === 0) {
              console.warn('⚠️ 기간 정보를 찾을 수 없습니다. 파일 구조를 확인해주세요.');
              console.warn('첫 10행 데이터:', jsonData.slice(0, 10));
            }

            // 데이터 행 처리
            let matchedCount = 0;
            const unmatchedAccounts = [];
            const matchedDetails = [];
            
            for (let rowIdx = headerRowIdx + 1; rowIdx < jsonData.length; rowIdx++) {
              const row = jsonData[rowIdx] || [];
              const accountName = row[accountColIdx];
              
              if (!accountName || typeof accountName !== 'string') continue;
              
              // 계정명 정규화 (공백, 특수문자 제거)
              const originalAccount = accountName.trim();
              const normalizedAccount = originalAccount
                .replace(/\s+/g, '')
                .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, '')
                .replace(/[\.\(\)]/g, '')
                .replace(/^[IVX]+\.\s*/, '') // 로마숫자 제거
                .replace(/^[일이삼사오육칠팔구십]+\.\s*/, '') // 한글 숫자 제거
                .replace(/^[0-9]+\.\s*/, ''); // 숫자 제거
              
              // 매핑된 계정 찾기
              let matchedAccount = null;
              for (const [key, value] of Object.entries(accountMapping)) {
                const normalizedKey = key.replace(/\s+/g, '');
                if (normalizedAccount.includes(normalizedKey) || normalizedKey.includes(normalizedAccount)) {
                  matchedAccount = value;
                  break;
                }
              }
              
              if (matchedAccount) {
                matchedCount++;
                const rowData = {};
                
                // 각 기간별 데이터 업데이트
                periods.forEach(({ col, period }) => {
                  const value = row[col];
                  if (value !== undefined && value !== null && value !== '') {
                    let numValue = 0;
                    if (typeof value === 'number') {
                      numValue = value;
                    } else {
                      const strValue = String(value).replace(/,/g, '').replace(/\s+/g, '').replace(/[^\d.-]/g, '');
                      numValue = parseFloat(strValue) || 0;
                    }
                    
                    if (numValue !== 0 && newData[period]) {
                      newData[period] = {
                        ...newData[period],
                        [matchedAccount]: numValue
                      };
                      rowData[period] = numValue;
                    }
                  }
                });
                
                if (Object.keys(rowData).length > 0) {
                  matchedDetails.push(`${matchedAccount}: ${JSON.stringify(rowData)}`);
                  console.log(`✅ 데이터 업데이트: ${matchedAccount}`, rowData);
                }
              } else {
                // 매칭되지 않은 계정명 저장 (처음 10개만)
                if (unmatchedAccounts.length < 10 && originalAccount.length > 0) {
                  unmatchedAccounts.push(originalAccount);
                }
              }
            }

            console.log(`\n=== 파싱 결과 ===`);
            console.log(`매칭된 계정 수: ${matchedCount}`);
            console.log(`발견된 기간 수: ${periods.length}`);
            console.log(`업데이트된 계정 상세:`, matchedDetails);
            
            if (unmatchedAccounts.length > 0) {
              console.log(`\n⚠️ 매칭되지 않은 계정명 (샘플):`, unmatchedAccounts);
            }
            
            console.log('\n업데이트된 데이터 샘플:', {
              '2024_4Q': newData['2024_4Q'],
              '2024_Year': newData['2024_Year'],
              '2025_4Q': newData['2025_4Q'],
              '2025_Year': newData['2025_Year']
            });

            // 업로드 상세 정보 저장
            setUploadDetails({
              fileName: file.name,
              matchedAccounts: matchedCount,
              periods: periods.length,
              unmatchedAccounts: unmatchedAccounts.slice(0, 5),
              timestamp: new Date().toLocaleTimeString('ko-KR'),
              debugInfo: debugInfo.slice(0, 10) // 처음 10개만
            });

            return newData;
          });
          
          resolve(true);
        } catch (error) {
          console.error('엑셀 파싱 오류:', error);
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // 엑셀 파일 업로드 핸들러
  const handleExcelUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadStatus('loading');

    try {
      // 2024 파일과 2025 파일 구분
      let file2024 = null;
      let file2025 = null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.includes('2024')) {
          file2024 = file;
        } else if (file.name.includes('2025')) {
          file2025 = file;
        }
      }

      // 파일이 없으면 모든 파일 처리
      if (!file2024 && !file2025 && files.length > 0) {
        // 파일명에 연도가 없으면 모든 파일 처리
        for (let i = 0; i < files.length; i++) {
          await parseExcelFile(files[i]);
        }
      } else {
        // 2024 파일 처리
        if (file2024) {
          console.log('2024 파일 처리 시작:', file2024.name);
          await parseExcelFile(file2024);
        }

        // 2025 파일 처리
        if (file2025) {
          console.log('2025 파일 처리 시작:', file2025.name);
          await parseExcelFile(file2025);
        }
      }

      // 상태 업데이트 확인을 위해 약간의 지연
      setTimeout(() => {
        setUploadStatus('success');
        setTimeout(() => setUploadStatus(null), 3000);
      }, 500);
      
      event.target.value = '';
    } catch (error) {
      console.error('파일 업로드 오류:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  // 컴포넌트 마운트 시 엑셀 파일 자동 로드 시도
  useEffect(() => {
    const loadExcelFiles = async () => {
      try {
        // public 폴더에서 파일 로드 시도
        const files = [
          { url: '/2024 정산표(IS).xlsx', year: '2024' },
          { url: '/2025 정산표(IS).xlsx', year: '2025' }
        ];

        for (const fileInfo of files) {
          try {
            const response = await fetch(fileInfo.url);
            if (response.ok) {
              const blob = await response.blob();
              const file = new File([blob], fileInfo.url.split('/').pop(), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              await parseExcelFile(file);
            }
          } catch (err) {
            // 파일이 없으면 무시 (정상적인 경우)
            console.log(`${fileInfo.url} 파일을 찾을 수 없습니다. 파일 업로드를 사용해주세요.`);
          }
        }
      } catch (error) {
        console.log('자동 파일 로드 실패:', error);
      }
    };

    loadExcelFiles();
  }, []); // 빈 의존성 배열로 마운트 시 한 번만 실행

  // ============================================
  // 재무상태표 데이터 - 전년기말 vs 당기말
  // ============================================
  // 재무상태표 데이터 (성격별 분류 - 유동/비유동 통합)
  const balanceSheetData = {
    '2025_4Q': {
      // 자산 (성격별)
      현금성자산: 208285,
      금융상품: 37815,      // 유동 28,725 + 비유동 9,090
      매출채권: 152793,
      재고자산: 414026,
      관계기업투자: 653157,
      유무형자산: 703080,   // 유형 423,174 + 투자부동산 79,690 + 무형 200,217
      사용권자산: 186155,
      기타자산: 145351,     // 유동기타 57,390 + 비유동기타 87,961
      자산총계: 2500662,
      // 부채 (성격별)
      차입금: 160605,       // 단기 160,605 + 장기 0
      매입채무: 158517,
      미지급금: 36728,
      리스부채: 195362,     // 유동 55,602 + 비유동 139,760
      보증금: 9968,
      기타부채: 188982,     // 유동기타 162,111 + 비유동기타 26,871
      부채총계: 750162,
      // 자본
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -50132,
      이익잉여금: 1463247,
      비지배지분: 16009,
      자본총계: 1750500,
    },
    '2024_4Q': {
      // 자산 (성격별)
      현금성자산: 119833,
      금융상품: 19479,      // 유동 6,388 + 비유동 13,091
      매출채권: 133826,
      재고자산: 324992,
      관계기업투자: 652474,
      유무형자산: 714996,   // 유형 501,307 + 투자부동산 0 + 무형 213,689
      사용권자산: 207683,
      기타자산: 112622,     // 유동기타 51,755 + 비유동기타 60,867
      자산총계: 2285905,
      // 부채 (성격별)
      차입금: 145635,       // 단기 145,635 + 장기 0
      매입채무: 102685,
      미지급금: 41982,
      리스부채: 215428,     // 유동 57,979 + 비유동 157,449
      보증금: 5692,
      기타부채: 197185,     // 유동기타 173,828 + 비유동기타 23,355
      부채총계: 708607,
      // 자본
      자본금: 3831,
      자본잉여금: 317545,
      기타자본: -42530,
      이익잉여금: 1283355,
      비지배지분: 15098,
      자본총계: 1577298,
    },
  };


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

  // 억 단위를 조/억 조합으로 표기 (예: 25,007억 → {number: "2조 5,007", unit: "억원"})
  const formatEokToJoEok = (valueInEok) => {
    if (valueInEok === 0 || valueInEok === undefined || valueInEok === null) {
      return { number: '-', unit: '' };
    }
    const absValue = Math.abs(valueInEok);
    const sign = valueInEok < 0 ? '-' : '';

    if (absValue >= 10000) {
      const jo = Math.floor(absValue / 10000);
      const eok = Math.round(absValue % 10000);
      return { number: `${sign}${jo}조 ${formatNumber(eok)}`, unit: '억원' };
    }

    return { number: `${sign}${formatNumber(Math.round(absValue))}`, unit: '억원' };
  };

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
    // 손익 요약 카드 데이터 - 실제 데이터 사용 (연간 누적)
    const incomeCards = [
      { 
        title: '매출액', 
        value: (incomeStatementData['2025_Year']?.매출액 || 0) / 100, 
        prevValue: (incomeStatementData['2024_Year']?.매출액 || 0) / 100, 
        iconColor: 'bg-blue-500' 
      },
      { 
        title: '영업이익', 
        value: (incomeStatementData['2025_Year']?.영업이익 || 0) / 100, 
        prevValue: (incomeStatementData['2024_Year']?.영업이익 || 0) / 100, 
        iconColor: 'bg-emerald-500' 
      },
      { 
        title: '당기순이익', 
        value: (incomeStatementData['2025_Year']?.당기순이익 || 0) / 100, 
        prevValue: (incomeStatementData['2024_Year']?.당기순이익 || 0) / 100, 
        iconColor: 'bg-violet-500' 
      },
    ];

    // 재무상태 요약 카드 데이터 - 실제 데이터 사용 (억원 단위)
    const balanceCards = [
      { 
        title: '자산총계', 
        value: (balanceSheetData['2025_4Q']?.자산총계 || 0) / 100, 
        prevValue: (balanceSheetData['2024_4Q']?.자산총계 || 0) / 100, 
        iconColor: 'bg-amber-500' 
      },
      { 
        title: '부채총계', 
        value: (balanceSheetData['2025_4Q']?.부채총계 || 0) / 100, 
        prevValue: (balanceSheetData['2024_4Q']?.부채총계 || 0) / 100, 
        iconColor: 'bg-rose-500' 
      },
      { 
        title: '자본총계', 
        value: (balanceSheetData['2025_4Q']?.자본총계 || 0) / 100, 
        prevValue: (balanceSheetData['2024_4Q']?.자본총계 || 0) / 100, 
        iconColor: 'bg-cyan-500' 
      },
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
            <span className="text-2xl font-bold text-zinc-900">
              {formatEokToJoEok(card.value).number}
            </span>
            <span className="text-sm font-normal text-zinc-500">
              {formatEokToJoEok(card.value).unit}
            </span>
          </div>
          <div className={`text-xs font-semibold mt-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {change != 0 ? `${isPositive ? '▲' : '▼'} ${Math.abs(parseFloat(change))}% YoY` : '-'}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        {/* 손익 요약 섹션 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded"></span>
            손익 요약
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {incomeCards.map((card, idx) => renderCard(card, idx))}
          </div>
        </div>

        {/* 재무상태 요약 섹션 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-amber-500 rounded"></span>
            재무상태 요약
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {balanceCards.map((card, idx) => renderCard(card, idx))}
          </div>
        </div>

        {/* AI 분석 섹션 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-violet-500 rounded"></span>
            AI 분석
          </h3>
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-lg p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div>
                <div className="text-sm font-semibold">F&F 2025년 4분기 재무 분석</div>
                <div className="text-xs text-zinc-400">손익 및 재무상태 종합 분석</div>
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
                  데이터 업데이트 후 경쟁사 대비 강점과 개선 영역 종합 분석이 표시됩니다.
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

    // 법인별 데이터 (선택된 과목에 따라) - 분기 및 누적
    const entityData = {
      '매출액': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '매출원가': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '매출총이익': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '인건비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '광고선전비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '수수료': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '감가상각비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '기타판관비': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '영업이익': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
      '당기순이익': {
        '2024_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_4Q': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2024_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
        '2025_Year': { 'OC(국내)': 0, '3자수출': 0, '중국': 0, '홍마대': 0, '기타': 0 },
      },
    };

    // 현재 모드에 따른 기간 설정
    const currPeriod = incomeViewMode === 'quarter' ? '2025_4Q' : '2025_Year';
    const prevPeriod = incomeViewMode === 'quarter' ? '2024_4Q' : '2024_Year';
    const periodLabel = incomeViewMode === 'quarter' ? '4분기' : '연간';

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

    // 법인별 테이블 데이터 - 현재 모드에 따라 연동
    const getEntityTableData = () => {
      const prev = entityData[selectedAccount]?.[prevPeriod] || {};
      const curr = entityData[selectedAccount]?.[currPeriod] || {};
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
        {/* 요약 카드 섹션 - 누적 실적으로 고정 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-700">실적 요약 (연간)</h3>
          </div>

          <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card, idx) => {
            // 누적(연간) 데이터로 고정
            const curr = incomeStatementData['2025_Year'][card.key];
            const prev = incomeStatementData['2024_Year'][card.key];
            const diff = curr - prev;
            const changeRate = calculateYoY(curr, prev);
            const isPositive = parseFloat(changeRate) >= 0;
            
            // 비율 계산
            let currRate = null;
            let prevRate = null;
            let rateDiff = null;
            if (card.hasRate) {
              const [num, denom] = card.rateOf;
              const currNum = incomeStatementData['2025_Year'][num];
              const currDenom = incomeStatementData['2025_Year'][denom];
              const prevNum = incomeStatementData['2024_Year'][num];
              const prevDenom = incomeStatementData['2024_Year'][denom];
              
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
                  <span className="text-zinc-400">{incomeViewMode === 'quarter' ? '전년동기' : '전년'} {formatNumber(prev)}</span>
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
        </div>

        {/* 손익계산서 테이블 & 법인별 분석 */}
        <div className="flex gap-4">
        {/* 좌측: 손익계산서 테이블 */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-zinc-900">연결 손익계산서</h3>
                </div>
                {/* 분기/누적 선택 버튼 */}
                <div className="inline-flex p-0.5 bg-zinc-100 rounded-lg border border-zinc-200">
                  <button
                    onClick={() => setIncomeViewMode('quarter')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150 ${
                      incomeViewMode === 'quarter'
                        ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    분기 (4Q)
                  </button>
                  <button
                    onClick={() => setIncomeViewMode('annual')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all duration-150 ${
                      incomeViewMode === 'annual'
                        ? 'bg-white text-zinc-900 border border-zinc-200 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    누적 (연간)
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[180px]">과목</th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[100px]">
                      {incomeViewMode === 'quarter' ? '2024.4Q' : '2024년'}
                    </th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[100px]">
                      {incomeViewMode === 'quarter' ? '2025.4Q' : '2025년'}
                    </th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
                    <th className="text-center px-3 py-2 font-semibold text-zinc-600 min-w-[70px]">증감률</th>
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
                      const ratePrev = calcRate(incomeStatementData[prevPeriod][num], incomeStatementData[prevPeriod][denom]);
                      const rateCurr = calcRate(incomeStatementData[currPeriod][num], incomeStatementData[currPeriod][denom]);
                      const rateDiff = calcRateDiff(rateCurr, ratePrev);
                      
                      return (
                        <tr key={idx} className="border-b border-zinc-100 bg-zinc-50/50">
                          <td className="px-3 py-2 text-zinc-500 italic border-r border-zinc-200 text-xs">{item.label}</td>
                          <td className="text-center px-3 py-2 text-zinc-500 border-r border-zinc-200">{ratePrev}</td>
                          <td className="text-center px-3 py-2 font-medium text-zinc-700 border-r border-zinc-200 bg-zinc-50">{rateCurr}</td>
                          <td colSpan="2" className={`text-center px-3 py-2 font-medium ${rateDiff.includes('+') ? 'text-emerald-600' : rateDiff.includes('-') ? 'text-rose-600' : 'text-zinc-500'}`}>
                            {rateDiff}
                          </td>
                        </tr>
                      );
                    }

                    // 일반 금액 행 처리
                    const valPrev = incomeStatementData[prevPeriod][item.key];
                    const valCurr = incomeStatementData[currPeriod][item.key];
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
            <p className="text-xs text-zinc-400">{periodLabel} 기준 법인별 비중</p>
            
            {/* 도넛 차트 영역 */}
            <div className="flex justify-around mt-4">
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  {incomeViewMode === 'quarter' ? '2024.4Q' : '2024년'}
                </p>
                <div className="w-[110px] h-[110px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getDonutData(prevPeriod)}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getDonutData(prevPeriod).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  {incomeViewMode === 'quarter' ? '2025.4Q' : '2025년'}
                </p>
                <div className="w-[110px] h-[110px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getDonutData(currPeriod)}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getDonutData(currPeriod).map((entry, index) => (
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
                  <th className="text-right px-2 py-2 font-semibold text-zinc-600">
                    {incomeViewMode === 'quarter' ? '24.4Q' : '2024'}
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-zinc-600">
                    {incomeViewMode === 'quarter' ? '25.4Q' : '2025'}
                  </th>
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
      return (bs.매출채권 || 0) + (bs.재고자산 || 0) - (bs.매입채무 || 0);
    };

    // ROE 계산 (당기순이익 / 자본총계 * 100)
    const calcROE = (period) => {
      const netIncome = period === '2025_4Q' 
        ? incomeStatementData['2025_Year'].당기순이익 
        : incomeStatementData['2024_Year'].당기순이익;
      const equity = balanceSheetData[period].자본총계;
      if (!equity || equity === 0) return 0;
      return ((netIncome / equity) * 100).toFixed(1);
    };

    // 조단위 포맷 함수 (억원 단위 입력받아 조단위 표기) - 숫자와 단위 분리
    const formatTrilBil = (valueInBil) => {
      if (valueInBil === 0 || valueInBil === undefined || valueInBil === null) {
        return { number: '-', unit: '' };
      }
      const absValue = Math.abs(valueInBil);
      const sign = valueInBil < 0 ? '-' : '';
      
      if (absValue >= 10000) {
        const tril = Math.floor(absValue / 10000);
        const bil = Math.round(absValue % 10000);
        return { number: `${sign}${tril}조 ${formatNumber(bil)}`, unit: '억원' };
      }
      return { number: `${sign}${formatNumber(Math.round(absValue))}`, unit: '억원' };
    };

    // 요약 카드 데이터 (억원 단위)
    const summaryCards = [
      { 
        title: '자산총계', 
        curr: balanceSheetData['2025_4Q'].자산총계 / 100,
        prev: balanceSheetData['2024_4Q'].자산총계 / 100,
        unit: '억원',
        useTril: true,
      },
      { 
        title: '운전자본', 
        curr: calcWorkingCapital('2025_4Q') / 100,
        prev: calcWorkingCapital('2024_4Q') / 100,
        unit: '억원',
        useTril: false,
      },
      { 
        title: '자본총계', 
        curr: balanceSheetData['2025_4Q'].자본총계 / 100,
        prev: balanceSheetData['2024_4Q'].자본총계 / 100,
        unit: '억원',
        useTril: true,
      },
      { 
        title: 'ROE', 
        curr: calcROE('2025_4Q'),
        prev: calcROE('2024_4Q'),
        isRatio: true,
      },
    ];

    // 재무상태표 항목 (성격별 분류 - 유동/비유동 통합)
    const balanceItems = [
      // 자산
      { key: '현금성자산', label: '현금성자산', depth: 1, selectable: true },
      { key: '금융상품', label: '금융상품', depth: 1 },
      { key: '매출채권', label: '매출채권', depth: 1, selectable: true },
      { key: '재고자산', label: '재고자산', depth: 1, selectable: true },
      { key: '관계기업투자', label: '관계기업투자', depth: 1 },
      { key: '유무형자산', label: '유·무형자산', depth: 1, selectable: true },
      { key: '사용권자산', label: '사용권자산', depth: 1, selectable: true },
      { key: '기타자산', label: '기타자산', depth: 1 },
      { key: '자산총계', label: '자산총계', bold: true, highlight: 'blue' },
      // 부채
      { key: '차입금', label: '차입금', depth: 1, selectable: true },
      { key: '매입채무', label: '매입채무', depth: 1, selectable: true },
      { key: '미지급금', label: '미지급금', depth: 1 },
      { key: '리스부채', label: '리스부채', depth: 1 },
      { key: '보증금', label: '보증금', depth: 1 },
      { key: '기타부채', label: '기타부채', depth: 1 },
      { key: '부채총계', label: '부채총계', bold: true, highlight: 'red' },
      // 자본 (총계만)
      { key: '자본총계', label: '자본총계', bold: true, highlight: 'green' },
    ];

    // 법인별 데이터 (재무상태표용) - 엑셀에서 추출한 실제 데이터
    // 분기별 데이터 (24.1Q ~ 25.4Q) - 보간 또는 실제 데이터
    const entityBSData = {
      '2024_1Q': {
        현금성자산: { 'OC(국내)': 50000, 중국: 25000, 홍콩: 5000, ST미국: 20000 },
        매출채권: { 'OC(국내)': 120000, 중국: 35000, 홍콩: 3000, ST미국: 7000 },
        재고자산: { 'OC(국내)': 200000, 중국: 130000, 홍콩: 30000, ST미국: 8000 },
        유무형자산: { 'OC(국내)': 610000, 중국: 11000, 홍콩: 2500, ST미국: 71000 },
        사용권자산: { 'OC(국내)': 150000, 중국: 48000, 홍콩: 12000, ST미국: 1400 },
        차입금: { 'OC(국내)': 50000, 중국: 95000, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 75000, 중국: 16000, 홍콩: 46000, ST미국: 5800 },
        자산총계: { 'OC(국내)': 1900000, 중국: 320000, 홍콩: 65000, ST미국: 110000 },
        부채총계: { 'OC(국내)': 420000, 중국: 240000, 홍콩: 63000, ST미국: 26000 },
        자본총계: { 'OC(국내)': 1480000, 중국: 80000, 홍콩: 2000, ST미국: 84000 },
      },
      '2024_2Q': {
        현금성자산: { 'OC(국내)': 55000, 중국: 27000, 홍콩: 5500, ST미국: 21000 },
        매출채권: { 'OC(국내)': 127000, 중국: 37500, 홍콩: 3500, ST미국: 7200 },
        재고자산: { 'OC(국내)': 207000, 중국: 135500, 홍콩: 32600, ST미국: 8500 },
        유무형자산: { 'OC(국내)': 610000, 중국: 10700, 홍콩: 2490, ST미국: 70500 },
        사용권자산: { 'OC(국내)': 148000, 중국: 47500, 홍콩: 11300, ST미국: 1350 },
        차입금: { 'OC(국내)': 47000, 중국: 98000, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 77000, 중국: 17000, 홍콩: 46500, ST미국: 5900 },
        자산총계: { 'OC(국내)': 1910000, 중국: 328000, 홍콩: 66000, ST미국: 111000 },
        부채총계: { 'OC(국내)': 425000, 중국: 246000, 홍콩: 64000, ST미국: 26500 },
        자본총계: { 'OC(국내)': 1485000, 중국: 82000, 홍콩: 2000, ST미국: 84500 },
      },
      '2024_3Q': {
        현금성자산: { 'OC(국내)': 58000, 중국: 28000, 홍콩: 5800, ST미국: 22000 },
        매출채권: { 'OC(국내)': 130000, 중국: 38500, 홍콩: 3700, ST미국: 7300 },
        재고자산: { 'OC(국내)': 210000, 중국: 138000, 홍콩: 33900, ST미국: 8600 },
        유무형자산: { 'OC(국내)': 610000, 중국: 10500, 홍콩: 2485, ST미국: 70450 },
        사용권자산: { 'OC(국내)': 147000, 중국: 47350, 홍콩: 11400, ST미국: 1330 },
        차입금: { 'OC(국내)': 46000, 중국: 99000, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 78000, 중국: 17400, 홍콩: 46800, ST미국: 6000 },
        자산총계: { 'OC(국내)': 1915000, 중국: 332000, 홍콩: 66700, ST미국: 111500 },
        부채총계: { 'OC(국내)': 427000, 중국: 249000, 홍콩: 64500, ST미국: 26800 },
        자본총계: { 'OC(국내)': 1488000, 중국: 83000, 홍콩: 2200, ST미국: 84700 },
      },
      '2024_4Q': {
        현금성자산: { 'OC(국내)': 61500, 중국: 29229, 홍콩: 6073, ST미국: 22881 },
        매출채권: { 'OC(국내)': 134453, 중국: 40081, 홍콩: 3967, ST미국: 7463 },
        재고자산: { 'OC(국내)': 214281, 중국: 141223, 홍콩: 35205, ST미국: 8723 },
        유무형자산: { 'OC(국내)': 609769, 중국: 10416, 홍콩: 2479, ST미국: 70443 },
        사용권자산: { 'OC(국내)': 146365, 중국: 47203, 홍콩: 11426, ST미국: 1315 },
        차입금: { 'OC(국내)': 45000, 중국: 100635, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 79795, 중국: 17885, 홍콩: 47089, ST미국: 6030 },
        자산총계: { 'OC(국내)': 1923504, 중국: 336611, 홍콩: 67244, ST미국: 112329 },
        부채총계: { 'OC(국내)': 429786, 중국: 252897, 홍콩: 64912, ST미국: 26968 },
        자본총계: { 'OC(국내)': 1493718, 중국: 83714, 홍콩: 2333, ST미국: 85361 },
      },
      '2025_1Q': {
        현금성자산: { 'OC(국내)': 100000, 중국: 15000, 홍콩: 5000, ST미국: 12000 },
        매출채권: { 'OC(국내)': 180000, 중국: 70000, 홍콩: 3000, ST미국: 15000 },
        재고자산: { 'OC(국내)': 220000, 중국: 200000, 홍콩: 32000, ST미국: 11000 },
        유무형자산: { 'OC(국내)': 607000, 중국: 9000, 홍콩: 3200, ST미국: 68000 },
        사용권자산: { 'OC(국내)': 140000, 중국: 35000, 홍콩: 16000, ST미국: 1000 },
        차입금: { 'OC(국내)': 0, 중국: 130000, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 120000, 중국: 110000, 홍콩: 47000, ST미국: 3500 },
        자산총계: { 'OC(국내)': 2080000, 중국: 420000, 홍콩: 70000, ST미국: 111000 },
        부채총계: { 'OC(국내)': 410000, 중국: 350000, 홍콩: 68000, ST미국: 31000 },
        자본총계: { 'OC(국내)': 1670000, 중국: 70000, 홍콩: 2000, ST미국: 80000 },
      },
      '2025_2Q': {
        현금성자산: { 'OC(국내)': 130000, 중국: 12000, 홍콩: 4800, ST미국: 11500 },
        매출채권: { 'OC(국내)': 195000, 중국: 85000, 홍콩: 2900, ST미국: 15800 },
        재고자산: { 'OC(국내)': 230000, 중국: 240000, 홍콩: 33000, ST미국: 12000 },
        유무형자산: { 'OC(국내)': 606000, 중국: 8500, 홍콩: 3250, ST미국: 67500 },
        사용권자산: { 'OC(국내)': 138000, 중국: 33000, 홍콩: 17000, ST미국: 950 },
        차입금: { 'OC(국내)': 0, 중국: 145000, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 130000, 중국: 120000, 홍콩: 47050, ST미국: 3600 },
        자산총계: { 'OC(국내)': 2100000, 중국: 450000, 홍콩: 70500, ST미국: 111200 },
        부채총계: { 'OC(국내)': 415000, 중국: 370000, 홍콩: 69000, ST미국: 32000 },
        자본총계: { 'OC(국내)': 1685000, 중국: 80000, 홍콩: 1500, ST미국: 79200 },
      },
      '2025_3Q': {
        현금성자산: { 'OC(국내)': 160000, 중국: 10000, 홍콩: 4600, ST미국: 11200 },
        매출채권: { 'OC(국내)': 200000, 중국: 92000, 홍콩: 2880, ST미국: 16000 },
        재고자산: { 'OC(국내)': 236000, 중국: 260000, 홍콩: 33600, ST미국: 12300 },
        유무형자산: { 'OC(국내)': 605700, 중국: 8300, 홍콩: 3270, ST미국: 67300 },
        사용권자산: { 'OC(국내)': 136500, 중국: 32000, 홍콩: 17500, ST미국: 950 },
        차입금: { 'OC(국내)': 0, 중국: 155000, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 135000, 중국: 125000, 홍콩: 47070, ST미국: 3700 },
        자산총계: { 'OC(국내)': 2120000, 중국: 470000, 홍콩: 70800, ST미국: 111300 },
        부채총계: { 'OC(국내)': 420000, 중국: 380000, 홍콩: 69200, ST미국: 32500 },
        자본총계: { 'OC(국내)': 1700000, 중국: 90000, 홍콩: 1600, ST미국: 78800 },
      },
      '2025_4Q': {
        현금성자산: { 'OC(국내)': 182075, 중국: 9318, 홍콩: 4446, ST미국: 11400 },
        매출채권: { 'OC(국내)': 205309, 중국: 97531, 홍콩: 2871, ST미국: 16277 },
        재고자산: { 'OC(국내)': 242024, 중국: 281973, 홍콩: 34165, ST미국: 12558 },
        유무형자산: { 'OC(국내)': 605414, 중국: 8114, 홍콩: 3290, ST미국: 67161 },
        사용권자산: { 'OC(국내)': 135457, 중국: 30581, 홍콩: 17979, ST미국: 945 },
        차입금: { 'OC(국내)': 0, 중국: 160605, 홍콩: 0, ST미국: 0 },
        매입채무: { 'OC(국내)': 139941, 중국: 131315, 홍콩: 47089, ST미국: 3739 },
        자산총계: { 'OC(국내)': 2145196, 중국: 495765, 홍콩: 71221, ST미국: 111397 },
        부채총계: { 'OC(국내)': 423707, 중국: 389821, 홍콩: 69512, ST미국: 32762 },
        자본총계: { 'OC(국내)': 1721489, 중국: 105943, 홍콩: 1710, ST미국: 78635 },
      },
    };

    const entityColors = {
      'OC(국내)': '#3B82F6',
      중국: '#F59E0B',
      홍콩: '#8B5CF6',
      ST미국: '#10B981',
    };

    // 도넛 차트 데이터 생성 함수
    const getBSDonutData = (period) => {
      const accountData = entityBSData[period][selectedBSAccount] || entityBSData[period]['자산총계'];
      if (!accountData) return [];
      
      const total = Object.values(accountData).reduce((sum, val) => sum + Math.abs(val), 0);
      if (total === 0) return [];
      
      return Object.entries(accountData).map(([name, value]) => ({
        name,
        value: Math.abs(value),
        ratio: ((Math.abs(value) / total) * 100).toFixed(1),
        color: entityColors[name],
      })).filter(item => item.value > 0);
    };

    // 도넛 차트 데이터 미리 계산
    const donutData2024 = getBSDonutData('2024_4Q');
    const donutData2025 = getBSDonutData('2025_4Q');

    return (
      <div className="space-y-4">
        {/* 요약 카드 섹션 */}
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card, idx) => {
            const curr = parseFloat(card.curr) || 0;
            const prev = parseFloat(card.prev) || 0;
            const diff = curr - prev;
            const changeRate = prev !== 0 ? ((curr - prev) / Math.abs(prev) * 100).toFixed(1) : '-';
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
                    {changeRate !== '-' ? `${isPositive ? '+' : ''}${changeRate}%` : '-'}
                  </span>
                </div>
                
                <div className="flex items-baseline gap-1">
                  {card.isRatio ? (
                    <span className="text-2xl font-bold text-zinc-900 tracking-tight">{curr}%</span>
                  ) : card.useTril ? (
                    <>
                      <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                        {formatTrilBil(curr).number}
                      </span>
                      <span className="text-sm font-normal text-zinc-500">
                        {formatTrilBil(curr).unit}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                        {formatNumber(Math.round(curr))}
                      </span>
                      {card.unit && <span className="text-sm font-normal text-zinc-500">{card.unit}</span>}
                    </>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-zinc-400">
                    전년 {card.isRatio ? `${prev}%` : (
                      card.useTril ? `${formatTrilBil(prev).number} ${formatTrilBil(prev).unit}` : `${formatNumber(Math.round(prev))}${card.unit || ''}`
                    )}
                  </span>
                  {!card.isRatio && (
                    <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isPositive ? '+' : ''}{formatNumber(Math.round(diff))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 재무상태표 테이블 & 법인별 분석 */}
        <div className="flex gap-4">
          {/* 좌측: 재무상태표 테이블 */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                <h3 className="text-sm font-semibold text-zinc-900">연결 재무상태표</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="text-left px-3 py-2.5 font-semibold text-zinc-700 border-r border-zinc-200 min-w-[180px]">과목</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[100px]">2024.4Q</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-900 border-r border-zinc-200 bg-zinc-100 min-w-[100px]">2025.4Q</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 min-w-[90px]">증감액</th>
                      <th className="text-center px-3 py-2 font-semibold text-zinc-600 min-w-[70px]">증감률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceItems.map((item, idx) => {
                      const val2024 = balanceSheetData['2024_4Q'][item.key] || 0;
                      const val2025 = balanceSheetData['2025_4Q'][item.key] || 0;
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

          {/* 우측: 법인별 분석 */}
          <div className="w-[320px] flex-shrink-0 space-y-3">
            {/* 법인별 분석 헤더 */}
            <div className="bg-white rounded-lg border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">
                {balanceItems.find(i => i.key === selectedBSAccount)?.label || selectedBSAccount} 법인별 분석
              </h3>
              <p className="text-xs text-zinc-400">기말 기준 법인별 비중</p>
              
              {/* 도넛 차트 영역 */}
              <div className="flex justify-around mt-4">
                {/* 2024년 도넛 */}
                <div className="text-center">
                  <p className="text-xs font-medium text-zinc-500 mb-2">2024년말</p>
                  <div style={{ width: 120, height: 120 }}>
                    {donutData2024.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData2024}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={50}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {donutData2024.map((entry, index) => (
                              <Cell key={`cell-2024-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${formatNumber(value)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                    )}
                  </div>
                </div>
                {/* 2025년 도넛 */}
                <div className="text-center">
                  <p className="text-xs font-medium text-zinc-500 mb-2">2025년말</p>
                  <div style={{ width: 120, height: 120 }}>
                    {donutData2025.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData2025}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={50}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {donutData2025.map((entry, index) => (
                              <Cell key={`cell-2025-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${formatNumber(value)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">데이터 없음</div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 범례 */}
              <div className="flex flex-wrap justify-center gap-3 mt-3">
                {Object.entries(entityColors).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                    <span className="text-xs text-zinc-600">{name}</span>
                  </div>
                ))}
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
                  {donutData2025.map((entity, idx) => {
                    const prev = donutData2024.find(e => e.name === entity.name)?.value || 0;
                    const curr = entity.value;
                    const yoy = prev !== 0 ? ((curr - prev) / prev * 100).toFixed(1) : '-';
                    const isPositive = parseFloat(yoy) >= 0;
                    
                    return (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="px-3 py-2 text-zinc-700">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entity.color }}></span>
                          {entity.name}
                        </td>
                        <td className="text-right px-2 py-2 text-zinc-500 tabular-nums">{formatNumber(prev)}</td>
                        <td className="text-right px-2 py-2 font-medium text-zinc-900 tabular-nums">{formatNumber(curr)}</td>
                        <td className="text-right px-2 py-2 text-zinc-600 tabular-nums">{entity.ratio}%</td>
                        <td className={`text-right px-2 py-2 font-medium tabular-nums ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {yoy !== '-' ? `${isPositive ? '+' : ''}${yoy}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 주요 인사이트 */}
            <div className="bg-white rounded-lg border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">
                {balanceItems.find(i => i.key === selectedBSAccount)?.label || selectedBSAccount} 증감 분석
              </h3>
              <div className="space-y-2 text-xs">
                {(() => {
                  const curr2025 = entityBSData['2025_4Q'][selectedBSAccount] || entityBSData['2025_4Q']['자산총계'];
                  const curr2024 = entityBSData['2024_4Q'][selectedBSAccount] || entityBSData['2024_4Q']['자산총계'];
                  
                  // 법인별 증감 계산
                  const changes = Object.keys(curr2025).map(entity => ({
                    name: entity,
                    diff: curr2025[entity] - curr2024[entity],
                    rate: curr2024[entity] !== 0 ? ((curr2025[entity] - curr2024[entity]) / Math.abs(curr2024[entity]) * 100).toFixed(1) : 0
                  })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
                  
                  const total2025 = Object.values(curr2025).reduce((s, v) => s + v, 0);
                  const total2024 = Object.values(curr2024).reduce((s, v) => s + v, 0);
                  const totalDiff = total2025 - total2024;
                  
                  return (
                    <>
                      <div className="p-2 bg-blue-50 rounded border-l-2 border-blue-400">
                        <p className="font-medium text-blue-800">전체 YoY</p>
                        <p className="text-blue-600 text-[11px] mt-0.5">
                          {totalDiff >= 0 ? '+' : ''}{formatNumber(totalDiff)}백만원 
                          ({total2024 !== 0 ? `${((total2025 - total2024) / Math.abs(total2024) * 100).toFixed(1)}%` : '-'})
                        </p>
                      </div>
                      <div className={`p-2 rounded border-l-2 ${changes[0]?.diff >= 0 ? 'bg-emerald-50 border-emerald-400' : 'bg-rose-50 border-rose-400'}`}>
                        <p className={`font-medium ${changes[0]?.diff >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                          최대 {changes[0]?.diff >= 0 ? '증가' : '감소'}: {changes[0]?.name}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${changes[0]?.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {changes[0]?.diff >= 0 ? '+' : ''}{formatNumber(changes[0]?.diff)}백만원 ({changes[0]?.rate}%)
                        </p>
                      </div>
                      {changes[1] && Math.abs(changes[1].diff) > 0 && (
                        <div className={`p-2 rounded border-l-2 ${changes[1]?.diff >= 0 ? 'bg-amber-50 border-amber-400' : 'bg-zinc-50 border-zinc-300'}`}>
                          <p className={`font-medium ${changes[1]?.diff >= 0 ? 'text-amber-800' : 'text-zinc-700'}`}>
                            {changes[1]?.diff >= 0 ? '증가' : '감소'}: {changes[1]?.name}
                          </p>
                          <p className={`text-[11px] mt-0.5 ${changes[1]?.diff >= 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
                            {changes[1]?.diff >= 0 ? '+' : ''}{formatNumber(changes[1]?.diff)}백만원 ({changes[1]?.rate}%)
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 분기별 추이 그래프 - 선택 가능한 계정에 대해서만 */}
        {(() => {
          const selectedItem = balanceItems.find(item => item.key === selectedBSAccount);
          if (!selectedItem || !selectedItem.selectable) return null;

          // 분기별 데이터 생성 (24.1Q ~ 25.4Q)
          const quarters = ['2024_1Q', '2024_2Q', '2024_3Q', '2024_4Q', '2025_1Q', '2025_2Q', '2025_3Q', '2025_4Q'];
          const quarterLabels = ['24.1Q', '24.2Q', '24.3Q', '24.4Q', '25.1Q', '25.2Q', '25.3Q', '25.4Q'];

          // 그래프 데이터 생성 (OC(국내), 중국, 기타 법인 합산)
          const chartData = quarters.map((quarter, idx) => {
            const accountData = entityBSData[quarter]?.[selectedBSAccount] || {};
            const ocDomestic = accountData['OC(국내)'] || 0;
            const china = accountData['중국'] || 0;
            const others = (accountData['홍콩'] || 0) + (accountData['ST미국'] || 0);

            return {
              quarter: quarterLabels[idx],
              'OC(국내)': ocDomestic,
              '중국': china,
              '기타 법인': others,
            };
          });

          return (
            <div className="bg-white rounded-lg border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">
                {selectedItem.label} 분기별 추이 (법인별)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis 
                      dataKey="quarter" 
                      stroke="#71717a"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#71717a"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => formatNumber(value)}
                    />
                    <Tooltip 
                      formatter={(value) => formatNumber(value)}
                      labelStyle={{ color: '#18181b' }}
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e4e4e7',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="line"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="OC(국내)" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="중국" 
                      stroke="#F59E0B" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="기타 법인" 
                      stroke="#8B5CF6" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-blue-500"></div>
                  <span className="text-zinc-600">OC(국내)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-amber-500"></div>
                  <span className="text-zinc-600">중국</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-violet-500"></div>
                  <span className="text-zinc-600">기타 법인</span>
                </div>
              </div>
            </div>
          );
        })()}
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
              <label className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1.5">
                <span>📤</span>
                <span>손익계산서 엑셀 업로드</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
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
                : uploadStatus === 'loading'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {uploadStatus === 'success' ? (
                <div>
                  <div className="font-semibold mb-1">✅ 손익계산서 데이터가 성공적으로 업로드되었습니다.</div>
                  {uploadDetails && (
                    <div className="text-[11px] text-emerald-600 mt-1 space-y-0.5">
                      <div>📄 파일: {uploadDetails.fileName}</div>
                      <div>📊 매칭된 계정: {uploadDetails.matchedAccounts}개</div>
                      <div>📅 발견된 기간: {uploadDetails.periods}개</div>
                      {uploadDetails.matchedAccounts === 0 && (
                        <div className="text-amber-600 font-semibold mt-2">
                          ⚠️ 계정이 매칭되지 않았습니다. 엑셀 파일의 계정명 형식을 확인해주세요.
                        </div>
                      )}
                      {uploadDetails.periods === 0 && (
                        <div className="text-amber-600 font-semibold mt-2">
                          ⚠️ 기간 정보를 찾을 수 없습니다. 엑셀 파일의 헤더 형식을 확인해주세요.
                        </div>
                      )}
                      {uploadDetails.unmatchedAccounts && uploadDetails.unmatchedAccounts.length > 0 && (
                        <div className="text-zinc-500 mt-1">
                          <div>매칭 안된 계정 (샘플): {uploadDetails.unmatchedAccounts.join(', ')}</div>
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-emerald-200">
                        <div className="text-[10px] text-zinc-500">
                          💡 데이터가 0으로 표시되면 F12 키를 눌러 개발자 도구(Console 탭)에서 상세 정보를 확인하세요.
                        </div>
                      </div>
                      <div>🕐 업로드 시간: {uploadDetails.timestamp}</div>
                    </div>
                  )}
                </div>
              ) : uploadStatus === 'loading' ? (
                '⏳ 파일을 처리 중입니다...'
              ) : (
                <div>
                  <div className="font-semibold mb-1">❌ 업로드 중 오류가 발생했습니다.</div>
                  <div className="text-[11px] text-rose-600 mt-1">
                    파일 형식을 확인해주세요. 문제가 계속되면 F12 키를 눌러 개발자 도구를 열고 Console 탭에서 오류를 확인하세요.
                  </div>
                </div>
              )}
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
