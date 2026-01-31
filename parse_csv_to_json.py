# -*- coding: utf-8 -*-
"""
F&F 2025년 4분기 BS/IS 데이터 파싱 스크립트
CSV 파일을 읽어서 대시보드에서 사용할 수 있는 형태로 변환합니다.
"""

import csv
import json
import re
from pathlib import Path

# 파일 경로 설정
BASE_DIR = Path(__file__).parent
BS_FILE = BASE_DIR / "2025_BS.csv"
IS_FILE = BASE_DIR / "2025_IS.csv"
OUTPUT_FILE = BASE_DIR / "dashboard_data_2025Q4.json"

def parse_number(value):
    """숫자 문자열을 파싱 (콤마, 괄호 처리)"""
    if not value or value.strip() in ['', '0', '-']:
        return 0
    
    # 공백 제거
    value = value.strip()
    
    # 괄호가 있으면 음수
    is_negative = '(' in value and ')' in value
    
    # 괄호, 콤마, 공백 제거
    value = re.sub(r'[(),\s]', '', value)
    
    try:
        num = float(value)
        return -num if is_negative else num
    except ValueError:
        return 0

def read_bs_csv():
    """재무상태표 CSV 읽기"""
    with open(BS_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = list(reader)
    return rows

def read_is_csv():
    """손익계산서 CSV 읽기 (인코딩 처리)"""
    # UTF-8로 먼저 시도, 실패하면 cp949 시도
    encodings = ['utf-8-sig', 'utf-8', 'cp949', 'euc-kr']
    
    for encoding in encodings:
        try:
            with open(IS_FILE, 'r', encoding=encoding) as f:
                reader = csv.reader(f)
                rows = list(reader)
            # 첫 번째 행에서 한글이 정상적으로 읽히는지 확인
            if rows and '매출액' in str(rows[1]) or '¸ÅÃâ¾×' not in str(rows[1]):
                print(f"IS 파일 인코딩: {encoding}")
                return rows
        except (UnicodeDecodeError, UnicodeError):
            continue
    
    raise ValueError("손익계산서 CSV 인코딩을 인식할 수 없습니다.")

def parse_bs_data(rows):
    """
    재무상태표 데이터 파싱
    헤더 구조: 
    - 각 분기별로 법인별 컬럼 반복
    - 25.4Q 데이터는 과목, F&F, F&F Shanghai, FnF HONGKONG, F&F 베트남, 빅텐츠, 엔터테인먼트, 세르지오, 단순합계, 연결분개 DR, 연결분개 CR, Dr, Cr, 2025년 12월 31일, 2024년 12월 31일
    """
    header = rows[0]
    
    # 분기별 컬럼 범위 찾기 (4분기 = 25.4Q)
    # 헤더에서 25.4Q 또는 '과  목' 위치 찾기
    q4_start = None
    for i, cell in enumerate(header):
        if '과  목' in cell or cell.strip() == '과목':
            if q4_start is None:
                q4_start = 0
            else:
                q4_start = i
    
    # 실제 헤더에서 각 분기 컬럼 범위 계산
    # 헤더: 25.1Q, F&F, F&F Shanghai, ..., 연결결과, 전년, 25.2Q, F&F, ...
    # 각 분기당 15개 컬럼 (분기명 + 7개 법인 + 단순합계 + 연결분개 DR + 연결분개 CR + Dr + Cr + 당기결과 + 전기결과)
    cols_per_quarter = 15
    
    # 4분기 시작 인덱스 (0-indexed: 0, 15, 30, 45)
    q4_offset = cols_per_quarter * 3  # 45번 컬럼부터 4분기
    
    print(f"헤더 길이: {len(header)}")
    print(f"4분기 시작 오프셋: {q4_offset}")
    
    # 법인 인덱스 매핑 (4분기 기준, 오프셋 적용)
    entity_cols = {
        'OC(국내)': q4_offset + 1,      # F&F
        '중국': q4_offset + 2,           # F&F Shanghai
        '홍콩': q4_offset + 3,           # FnF HONGKONG
        'ST미국': q4_offset + 7,         # 세르지오
    }
    
    # 연결 결과 컬럼 (2025년 12월 31일)
    consolidated_col = q4_offset + 13
    # 전년 동기 (2024년 12월 31일)
    prev_year_col = q4_offset + 14
    
    print(f"연결결과 컬럼: {consolidated_col}")
    print(f"전년동기 컬럼: {prev_year_col}")
    
    # 계정 매핑 (CSV 계정명 -> 대시보드 키)
    account_mapping = {
        'Ⅰ.유동자산': '유동자산',
        '현금및현금성자산': '현금성자산',
        '매출채권': '매출채권',
        '(2)재고자산': '재고자산',
        'Ⅱ.비유동자산': '비유동자산',
        '(2)유형자산': '유형자산',
        '(4)무형자산': '무형자산',
        '(5)사용권자산': '사용권자산',
        '(3)투자부동산': '투자부동산',
        '(1)투자자산': '투자자산',
        '관계기업및종속기업투자': '관계기업',
        '(6)기타비유동자산': '기타비유동자산',
        '자산총계': '자산총계',
        'Ⅰ.유동부채': '유동부채',
        '매입채무': '매입채무',
        '미지급금': '미지급금',
        '유동리스부채': '유동리스부채',
        '리스부채': '비유동리스부채',
        '단기차입금': '단기차입금',
        '장기차입금': '장기차입금',
        'Ⅱ.비유동부채': '비유동부채',
        '부채총계': '부채총계',
        'Ⅰ.자본금': '자본금',
        'Ⅱ.자본잉여금': '자본잉여금',
        'Ⅳ.이익잉여금': '이익잉여금',
        'Ⅲ.기타포괄손익누계액': '기타자본',
        '자본총계': '자본총계',
    }
    
    # 결과 데이터 구조
    bs_consolidated = {}  # 연결 재무상태표
    bs_entity = {}        # 법인별 재무상태표
    
    for row in rows[1:]:
        if len(row) < consolidated_col + 1:
            continue
            
        account_name = row[q4_offset].strip() if q4_offset < len(row) else ''
        
        # 계정 매핑
        dashboard_key = None
        for csv_key, db_key in account_mapping.items():
            if csv_key in account_name:
                dashboard_key = db_key
                break
        
        if not dashboard_key:
            continue
        
        # 연결 금액 파싱 (백만원 단위로 변환)
        try:
            consolidated_value = parse_number(row[consolidated_col]) / 1_000_000  # 원 -> 백만원
            prev_value = parse_number(row[prev_year_col]) / 1_000_000 if prev_year_col < len(row) else 0
        except (IndexError, ValueError):
            consolidated_value = 0
            prev_value = 0
        
        bs_consolidated[dashboard_key] = {
            '2025_4Q': round(consolidated_value),
            '2024_4Q': round(prev_value)
        }
        
        # 법인별 금액 파싱
        entity_values = {}
        for entity_name, col_idx in entity_cols.items():
            if col_idx < len(row):
                value = parse_number(row[col_idx]) / 1_000_000
                entity_values[entity_name] = round(value)
            else:
                entity_values[entity_name] = 0
        
        bs_entity[dashboard_key] = entity_values
    
    return bs_consolidated, bs_entity

def parse_is_data(rows):
    """
    손익계산서 데이터 파싱
    4분기 누적(연간) 데이터와 당분기 데이터 추출
    """
    header = rows[0]
    
    # 분기별 컬럼 구조 (IS)
    # 각 분기당 17개 컬럼: 분기명 + 7개 법인 + 단순합계 + 연결조정분개 + + 누적 + 전분기누적 + 당분기 + 전년누적 + 전년전분기누적 + 전년당분기
    cols_per_quarter = 17
    q4_offset = cols_per_quarter * 3  # 4분기 시작 오프셋 (51번 컬럼부터)
    
    print(f"IS 헤더 길이: {len(header)}")
    print(f"IS 4분기 시작 오프셋: {q4_offset}")
    
    # 법인 인덱스 매핑 (4분기 기준)
    entity_cols = {
        'OC(국내)': q4_offset + 1,      # F&F
        '중국': q4_offset + 2,           # F&F Shanghai
        '홍콩': q4_offset + 3,           # FnF HONGKONG
        'ST미국': q4_offset + 7,         # 세르지오
    }
    
    # 연결 누적 (2025년 누적)
    consolidated_ytd_col = q4_offset + 11  # 2025년 누적
    # 당분기
    consolidated_qtr_col = q4_offset + 13  # 2025년 4분기
    # 전년 동기 (2024년 누적)
    prev_year_ytd_col = q4_offset + 14
    # 전년 당분기
    prev_year_qtr_col = q4_offset + 16
    
    # 계정 매핑 (CSV 계정명 -> 대시보드 키)
    account_mapping = {
        'Ⅰ.매출액': '매출액',
        '매출액': '매출액',
        'Ⅱ.매출원가': '매출원가',
        '매출원가': '매출원가',
        'Ⅲ.매출총이익': '매출총이익',
        '매출총이익': '매출총이익',
        'Ⅳ.판매비와관리비': '판관비',
        '판매비와관리비': '판관비',
        'Ⅴ.영업이익': '영업이익',
        '영업이익': '영업이익',
        'Ⅵ.영업외수익': '영업외수익',
        '영업외수익': '영업외수익',
        'Ⅶ.영업외비용': '영업외비용',
        '영업외비용': '영업외비용',
        'Ⅷ.법인세비용차감전순이익': '세전이익',
        '법인세비용차감전순이익': '세전이익',
        'Ⅸ.법인세비용': '법인세비용',
        '법인세비용': '법인세비용',
        'Ⅹ.당기순이익': '당기순이익',
        '당기순이익': '당기순이익',
        '급여': '인건비',
        '퇴직급여': '퇴직급여',
        '복리후생비': '복리후생비',
        '광고선전비': '광고선전비',
        '지급수수료': '수수료',
        '감가상각비': '감가상각비',
        '무형자산상각비': '무형자산상각비',
        '이자수익': '이자수익',
        '이자비용': '이자비용',
        '외환차익': '외환차익',
        '외환차손': '외환차손',
        '외화환산이익': '외화환산이익',
        '외화환산손실': '외화환산손실',
    }
    
    # 결과 데이터 구조
    is_consolidated = {}  # 연결 손익계산서
    is_entity = {}        # 법인별 손익계산서
    
    for row in rows[1:]:
        if len(row) < q4_offset + 10:
            continue
            
        account_name = row[q4_offset].strip() if q4_offset < len(row) else ''
        
        # 계정 매핑
        dashboard_key = None
        for csv_key, db_key in account_mapping.items():
            if csv_key in account_name or account_name == csv_key:
                dashboard_key = db_key
                break
        
        if not dashboard_key:
            continue
        
        # 연결 금액 파싱 (백만원 단위로 변환)
        try:
            # 누적(연간)
            ytd_value = parse_number(row[consolidated_ytd_col]) / 1_000_000 if consolidated_ytd_col < len(row) else 0
            # 당분기
            qtr_value = parse_number(row[consolidated_qtr_col]) / 1_000_000 if consolidated_qtr_col < len(row) else 0
            # 전년 누적
            prev_ytd_value = parse_number(row[prev_year_ytd_col]) / 1_000_000 if prev_year_ytd_col < len(row) else 0
            # 전년 당분기
            prev_qtr_value = parse_number(row[prev_year_qtr_col]) / 1_000_000 if prev_year_qtr_col < len(row) else 0
        except (IndexError, ValueError):
            ytd_value = qtr_value = prev_ytd_value = prev_qtr_value = 0
        
        is_consolidated[dashboard_key] = {
            '2025_Year': round(ytd_value),      # 연간 누적
            '2025_4Q': round(qtr_value),        # 당분기
            '2024_Year': round(prev_ytd_value), # 전년 연간
            '2024_4Q': round(prev_qtr_value)    # 전년 동기
        }
        
        # 법인별 금액 파싱 (누적 기준)
        entity_values = {}
        for entity_name, col_idx in entity_cols.items():
            if col_idx < len(row):
                value = parse_number(row[col_idx]) / 1_000_000
                entity_values[entity_name] = round(value)
            else:
                entity_values[entity_name] = 0
        
        is_entity[dashboard_key] = entity_values
    
    return is_consolidated, is_entity

def main():
    print("=" * 60)
    print("F&F 2025년 4분기 데이터 파싱 시작")
    print("=" * 60)
    
    # BS 파싱
    print("\n[1] 재무상태표(BS) 파싱...")
    try:
        bs_rows = read_bs_csv()
        bs_consolidated, bs_entity = parse_bs_data(bs_rows)
        print(f"  - BS 연결 계정 수: {len(bs_consolidated)}")
        print(f"  - BS 법인별 계정 수: {len(bs_entity)}")
    except Exception as e:
        print(f"  - BS 파싱 오류: {e}")
        bs_consolidated, bs_entity = {}, {}
    
    # IS 파싱
    print("\n[2] 손익계산서(IS) 파싱...")
    try:
        is_rows = read_is_csv()
        is_consolidated, is_entity = parse_is_data(is_rows)
        print(f"  - IS 연결 계정 수: {len(is_consolidated)}")
        print(f"  - IS 법인별 계정 수: {len(is_entity)}")
    except Exception as e:
        print(f"  - IS 파싱 오류: {e}")
        is_consolidated, is_entity = {}, {}
    
    # 결과 출력
    print("\n" + "=" * 60)
    print("파싱 결과 (대시보드 데이터 형식)")
    print("=" * 60)
    
    # balanceSheetData 형식으로 변환
    print("\n[balanceSheetData 업데이트 - '2025_4Q' 추가]")
    print("```javascript")
    print("'2025_4Q': {")
    for key, values in bs_consolidated.items():
        val_2025 = values.get('2025_4Q', 0)
        print(f"  {key}: {val_2025},")
    print("},")
    print("```")
    
    # incomeStatementData 형식으로 변환
    print("\n[incomeStatementData 업데이트]")
    print("```javascript")
    print("// 2025년 4분기 (당분기)")
    print("'2025_4Q': {")
    for key, values in is_consolidated.items():
        val = values.get('2025_4Q', 0)
        print(f"  {key}: {val},")
    print("},")
    print()
    print("// 2025년 연간 누적")
    print("'2025_Year': {")
    for key, values in is_consolidated.items():
        val = values.get('2025_Year', 0)
        print(f"  {key}: {val},")
    print("},")
    print("```")
    
    # entityBSData 형식으로 변환
    print("\n[entityBSData 업데이트 - '2025_4Q' 추가]")
    print("```javascript")
    print("'2025_4Q': {")
    for key, entity_values in bs_entity.items():
        values_str = ", ".join([f"'{k}': {v}" for k, v in entity_values.items()])
        print(f"  {key}: {{ {values_str} }},")
    print("},")
    print("```")
    
    # JSON 파일로 저장
    output_data = {
        "balanceSheetData_2025_4Q": {k: v.get('2025_4Q', 0) for k, v in bs_consolidated.items()},
        "incomeStatementData_2025_4Q": {k: v.get('2025_4Q', 0) for k, v in is_consolidated.items()},
        "incomeStatementData_2025_Year": {k: v.get('2025_Year', 0) for k, v in is_consolidated.items()},
        "entityBSData_2025_4Q": bs_entity,
        "entityISData_2025_4Q": is_entity,
    }
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n결과가 '{OUTPUT_FILE}'에 저장되었습니다.")
    print("\n" + "=" * 60)
    print("파싱 완료!")
    print("=" * 60)

if __name__ == "__main__":
    main()
