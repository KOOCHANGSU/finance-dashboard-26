# -*- coding: utf-8 -*-
"""
F&F 재무 데이터 CSV 파싱 스크립트
- 손익계산서(IS) CSV 파일을 파싱하여 세부 계정 데이터 추출
- 대시보드용 JSON 파일 생성

사용법:
1. 이 스크립트를 CSV 파일과 같은 폴더에 저장
2. python parse_financial_data.py 실행
3. 생성된 financial_detail_data.json 파일 확인
"""

import pandas as pd
import json
import re
import os
from pathlib import Path

# 현재 스크립트 위치 기준으로 파일 경로 설정
BASE_DIR = Path(__file__).parent

# 법인명 매핑 (CSV 컬럼 순서 -> 대시보드 표시명)
# CSV 구조: 분기명, F&F, F&F Shanghai, FnF HONGKONG, F&F 베트남, 빅텐츠, 엔터테인먼트, 세르지오, 단순합계, 연결조정분개
ENTITY_ORDER = ['OC(국내)', '중국', '홍콩', '베트남', '빅텐츠', '엔터테인먼트', 'ST미국']

def parse_number(val):
    """숫자 문자열을 float으로 변환 (원 단위 -> 백만원 단위)"""
    if pd.isna(val) or val == '' or val == '-' or val == 0:
        return 0
    if isinstance(val, (int, float)):
        return float(val)
    
    val = str(val).strip()
    val = val.replace(',', '').replace(' ', '')
    
    # 괄호로 감싸진 음수 처리 (123) -> -123
    if val.startswith('(') and val.endswith(')'):
        val = '-' + val[1:-1]
    
    try:
        return float(val)
    except:
        return 0

def parse_is_file(filepath, file_year):
    """손익계산서 CSV 파일 파싱
    
    CSV 구조:
    - 각 분기가 17개 열 단위로 반복
    - 열 순서: 계정명, F&F, F&F Shanghai, FnF HONGKONG, F&F 베트남, 빅텐츠, 엔터테인먼트, 세르지오, 단순합계, 연결조정분개, (빈칸), 당해연도누적, 전분기누적, 당분기, 전년도누적, 전년전분기누적, 전년당분기
    """
    print(f"\n{'='*60}")
    print(f"파싱 중: {filepath}")
    print(f"{'='*60}")
    
    # 인코딩 시도
    df = None
    for encoding in ['cp949', 'euc-kr', 'utf-8', 'utf-8-sig']:
        try:
            df = pd.read_csv(filepath, encoding=encoding, header=None)
            print(f"인코딩 성공: {encoding}")
            break
        except Exception as e:
            continue
    
    if df is None:
        print("파일을 읽을 수 없습니다.")
        return None, None
    
    print(f"행 수: {len(df)}, 열 수: {len(df.columns)}")
    
    # 결과 저장
    consolidated_data = {}  # 연결 기준 데이터 (기간별 > 계정별)
    entity_data = {}        # 법인별 데이터 (계정별 > 기간별 > 법인별)
    
    # 한 분기당 열 수 (헤더 분석하여 결정)
    # 2025_IS.csv 기준: 25.1Q부터 시작, 각 분기 17열
    COLS_PER_QUARTER = 17
    
    # 추출할 세부 계정 목록
    target_accounts = {
        '제품매출': '제품매출',
        '상품매출': '상품매출', 
        '수수료매출': '수수료매출',
        '임대매출': '임대매출',
        '기타매출': '기타매출',
        '급여': '급여',
        '퇴직급여': '퇴직급여',
        '복리후생비': '복리후생비',
        '지급수수료': '지급수수료',
        '운반비': '운반비',
        '광고선전비': '광고선전비',
        '감가상각비': '감가상각비',
        '무형자산상각비': '무형자산상각비',
        'Ⅰ.매출액': '매출액',
        'Ⅱ.매출원가': '매출원가',
        'Ⅲ.매출총이익': '매출총이익',
        'Ⅳ.판매비와관리비': '판매비와관리비',
        'Ⅴ.영업이익': '영업이익',
    }
    
    # 분기별 열 시작 위치 (0부터)
    # Q1: 0~16, Q2: 17~33, Q3: 34~50, Q4: 51~67
    quarters = [
        (0, '1Q'),
        (17, '2Q'),
        (34, '3Q'),
        (51, '4Q'),
    ]
    
    # 각 행 처리
    for row_idx, row in df.iterrows():
        if row_idx == 0:  # 헤더 행 스킵
            continue
        
        # 첫 번째 열에서 계정명 추출 (각 분기마다 반복됨)
        first_cell = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
        
        # 대상 계정인지 확인
        matched_key = None
        for pattern, account_name in target_accounts.items():
            if first_cell == pattern or first_cell.startswith(pattern):
                matched_key = account_name
                break
        
        if not matched_key:
            continue
        
        print(f"  발견: {first_cell} -> {matched_key}")
        
        # 각 분기별로 데이터 추출
        for q_start, q_name in quarters:
            try:
                # 분기 확인 (첫 번째 셀이 분기명인지)
                q_check = str(row.iloc[q_start]).strip() if q_start < len(row) and pd.notna(row.iloc[q_start]) else ''
                
                # 법인별 데이터 (인덱스 1~7)
                entity_values = {}
                for e_idx, entity_name in enumerate(ENTITY_ORDER):
                    col_idx = q_start + 1 + e_idx
                    if col_idx < len(row):
                        val = parse_number(row.iloc[col_idx])
                        entity_values[entity_name] = round(val / 1_000_000)  # 백만원 단위
                
                # 연결 누적 데이터 (인덱스 11: 당해연도 누적)
                consolidated_col = q_start + 11
                if consolidated_col < len(row):
                    consolidated_val = parse_number(row.iloc[consolidated_col])
                    consolidated_val = round(consolidated_val / 1_000_000)  # 백만원 단위
                else:
                    consolidated_val = 0
                
                # 당분기(3개월) 데이터 (인덱스 13)
                quarter_col = q_start + 13
                if quarter_col < len(row):
                    quarter_val = parse_number(row.iloc[quarter_col])
                    quarter_val = round(quarter_val / 1_000_000)
                else:
                    quarter_val = 0
                
                # 기간 키 생성
                year = file_year
                period_quarter = f"{year}_{q_name}"        # 예: 2025_1Q (당분기)
                period_year = f"{year}_{q_name}_Year"      # 예: 2025_1Q_Year (누적)
                
                # 연결 기준 데이터 저장 (누적)
                if period_year not in consolidated_data:
                    consolidated_data[period_year] = {}
                consolidated_data[period_year][matched_key] = consolidated_val
                
                # 연결 기준 데이터 저장 (당분기)
                if period_quarter not in consolidated_data:
                    consolidated_data[period_quarter] = {}
                consolidated_data[period_quarter][matched_key] = quarter_val
                
                # 법인별 데이터 저장 (당분기 기준)
                if matched_key not in entity_data:
                    entity_data[matched_key] = {}
                if period_quarter not in entity_data[matched_key]:
                    entity_data[matched_key][period_quarter] = {}
                entity_data[matched_key][period_quarter] = entity_values
                
                # 법인별 데이터 저장 (누적 기준) - 별도 계산 필요하면 추가
                if period_year not in entity_data[matched_key]:
                    entity_data[matched_key][period_year] = {}
                entity_data[matched_key][period_year] = entity_values.copy()
                
            except Exception as e:
                print(f"    오류 ({q_name}): {e}")
                continue
    
    # 연간 누적 계산 (Year 키)
    year_key = f"{file_year}_Year"
    if quarters:
        last_q = quarters[-1][1]  # 4Q
        last_period_year = f"{file_year}_{last_q}_Year"
        if last_period_year in consolidated_data:
            consolidated_data[year_key] = consolidated_data[last_period_year].copy()
        
        # 법인별 연간 데이터도 추가
        for account in entity_data:
            if last_period_year in entity_data[account]:
                entity_data[account][year_key] = entity_data[account][last_period_year].copy()
    
    return consolidated_data, entity_data

def main():
    """메인 실행 함수"""
    print("=" * 70)
    print("F&F 재무 데이터 파싱 스크립트")
    print("=" * 70)
    
    # 결과 저장 구조
    all_consolidated = {}  # 기간별 > 계정별 연결 데이터
    all_entity = {}        # 계정별 > 기간별 > 법인별 데이터
    
    # IS 파일 처리
    is_files = [
        (BASE_DIR / "2024_IS.csv", "2024"),
        (BASE_DIR / "2025_IS.csv", "2025"),
    ]
    
    for filepath, year in is_files:
        if filepath.exists():
            cons_data, ent_data = parse_is_file(filepath, year)
            
            if cons_data:
                for period, accounts in cons_data.items():
                    if period not in all_consolidated:
                        all_consolidated[period] = {}
                    all_consolidated[period].update(accounts)
            
            if ent_data:
                for account, periods in ent_data.items():
                    if account not in all_entity:
                        all_entity[account] = {}
                    for period, entities in periods.items():
                        if period not in all_entity[account]:
                            all_entity[account][period] = {}
                        all_entity[account][period].update(entities)
        else:
            print(f"파일 없음: {filepath}")
    
    # 결과 출력
    print("\n" + "=" * 70)
    print("파싱 완료!")
    print("=" * 70)
    
    # JSON 구조로 변환
    output_data = {
        "incomeDetailData": all_consolidated,
        "entityDetailData": all_entity,
    }
    
    # JSON 파일 저장
    output_file = BASE_DIR / "financial_detail_data.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"\nJSON 파일 저장됨: {output_file}")
    
    # JavaScript 형식으로 콘솔 출력
    print("\n" + "=" * 70)
    print("JavaScript 코드 (대시보드에 복사)")
    print("=" * 70)
    
    print("\n// 연결 기준 세부 계정 데이터")
    print("const incomeDetailData = ", end="")
    print(json.dumps(all_consolidated, ensure_ascii=False, indent=2), end=";\n")
    
    print("\n// 법인별 세부 계정 데이터")
    print("const entityDetailData = ", end="")
    print(json.dumps(all_entity, ensure_ascii=False, indent=2), end=";\n")
    
    # 요약 통계
    print("\n" + "=" * 70)
    print("요약")
    print("=" * 70)
    print(f"기간 수: {len(all_consolidated)}")
    print(f"기간 목록: {sorted(all_consolidated.keys())}")
    print(f"계정 수 (법인별): {len(all_entity)}")
    print(f"계정 목록: {list(all_entity.keys())}")
    
    return output_data

if __name__ == "__main__":
    main()
