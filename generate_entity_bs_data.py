# -*- coding: utf-8 -*-
"""
BS(재무상태표) 법인별 데이터 JSON 생성 스크립트
- 2024_BS.csv, 2025_BS.csv 파일에서 법인별 데이터를 읽어 JSON 생성
- 법인: OC(국내), 중국, 홍콩, ST미국, 기타(연결조정)
- 모든 분기 데이터 추출: 24.1Q~24.4Q, 25.1Q~25.4Q
"""

import csv
import json
import re

def parse_number(value):
    """숫자 문자열을 정수로 변환 (백만원 단위로 반올림)"""
    if not value or value.strip() == '' or value.strip() == '0':
        return 0
    
    value = value.strip()
    
    is_negative = False
    if value.startswith('(') and value.endswith(')'):
        is_negative = True
        value = value[1:-1]
    
    value = value.replace(',', '').replace(' ', '')
    
    try:
        num = float(value)
        if is_negative:
            num = -num
        return round(num / 1_000_000)
    except ValueError:
        return 0

def read_csv_with_encoding(filepath):
    """여러 인코딩 시도하여 CSV 파일 읽기"""
    encodings = ['utf-8-sig', 'utf-8', 'cp949', 'euc-kr']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                rows = list(csv.reader(f))
                if rows and len(rows) > 0:
                    print(f"  -> {filepath}: {enc} 인코딩으로 읽기 성공")
                    return rows
        except (UnicodeDecodeError, UnicodeError):
            continue
    print(f"  -> {filepath}: 읽기 실패!")
    return []

def get_target_accounts():
    """대시보드에서 사용하는 BS 계정들"""
    return {
        '유동자산': 'Ⅰ.유동자산',
        '비유동자산': 'Ⅱ.비유동자산',
        '자산총계': '자산총계',
        '유동부채': 'Ⅰ.유동부채',
        '비유동부채': 'Ⅱ.비유동부채',
        '부채총계': '부채총계',
        '자본총계': '자본총계',
        '현금성자산': '현금및현금성자산',
        '매출채권': '매출채권',
        '재고자산': '(2)재고자산',
        '유형자산': '(2)유형자산',
        '투자자산': '(1)투자자산',
        '매입채무': '매입채무',
        '차입금': '단기차입금',
        '이익잉여금': 'Ⅳ.이익잉여금',
    }

def find_all_quarter_starts(header):
    """모든 분기 시작 컬럼 인덱스 찾기"""
    quarters = {}
    pattern = re.compile(r'^(\d{2})\.([1-4])Q$')
    
    for i, col in enumerate(header):
        col_stripped = col.strip()
        match = pattern.match(col_stripped)
        if match:
            quarters[col_stripped] = i
            print(f"    분기 발견: {col_stripped} -> 인덱스 {i}")
    
    return quarters

def find_consolidated_col(header, start_idx, target_year, target_month):
    """연결금액 컬럼 찾기"""
    search_pattern = f"{target_year}년 {target_month:02d}월"
    
    for i in range(start_idx + 8, min(start_idx + 20, len(header))):
        if i < len(header) and header[i] and search_pattern in header[i]:
            return i
    return None

def process_quarter(rows, header, quarter_key, start_idx, file_type):
    """특정 분기 데이터 처리"""
    # 컬럼 인덱스 (분기 시작점 기준)
    col_fnf = start_idx + 1       # F&F
    col_shanghai = start_idx + 2  # F&F Shanghai
    col_hongkong = start_idx + 3  # FnF HONGKONG
    col_sergio = start_idx + 7    # 세르지오
    
    # 연결금액 컬럼 찾기
    year = 2000 + int(quarter_key[:2])
    quarter_num = int(quarter_key[3])
    month_map = {1: 3, 2: 6, 3: 9, 4: 12}
    target_month = month_map[quarter_num]
    
    col_consolidated = find_consolidated_col(header, start_idx, year, target_month)
    
    if col_consolidated is None:
        # 기본값 설정 (파일 타입과 분기에 따라)
        if file_type == '2024':
            if quarter_num == 4:
                col_consolidated = start_idx + 13  # 24.4Q는 Dr,Cr 추가
            else:
                col_consolidated = start_idx + 11  # 24.1Q~24.3Q
        else:  # 2025
            col_consolidated = start_idx + 13  # 25.XQ 모두 Dr,Cr 포함
    
    print(f"    {quarter_key}: start={start_idx}, fnf={col_fnf}, sergio={col_sergio}, consolidated={col_consolidated}")
    
    data = {}
    target_accounts = get_target_accounts()
    
    for row in rows[1:]:
        if not row or len(row) <= col_fnf:
            continue
        
        account_name = row[0].strip() if row[0] else ''
        
        matched_key = None
        for key, csv_name in target_accounts.items():
            if account_name == csv_name:
                matched_key = key
                break
        
        if matched_key is None:
            continue
        
        fnf = parse_number(row[col_fnf]) if len(row) > col_fnf else 0
        shanghai = parse_number(row[col_shanghai]) if len(row) > col_shanghai else 0
        hongkong = parse_number(row[col_hongkong]) if len(row) > col_hongkong else 0
        sergio = parse_number(row[col_sergio]) if len(row) > col_sergio else 0
        consolidated = parse_number(row[col_consolidated]) if len(row) > col_consolidated else 0
        
        entity_sum = fnf + shanghai + hongkong + sergio
        others = consolidated - entity_sum
        
        data[matched_key] = {
            'OC(국내)': fnf,
            '중국': shanghai,
            '홍콩': hongkong,
            'ST미국': sergio,
            '기타': others,
            '연결': consolidated
        }
    
    return data

def main():
    print("=== BS 데이터 생성 시작 ===\n")
    
    print("1. CSV 파일 읽기...")
    rows_2024 = read_csv_with_encoding('2024_BS.csv')
    rows_2025 = read_csv_with_encoding('2025_BS.csv')
    
    if not rows_2024:
        print("ERROR: 2024_BS.csv 파일을 읽을 수 없습니다!")
        return
    if not rows_2025:
        print("ERROR: 2025_BS.csv 파일을 읽을 수 없습니다!")
        return
    
    header_2024 = rows_2024[0]
    header_2025 = rows_2025[0]
    
    print(f"\n2024_BS.csv 컬럼 수: {len(header_2024)}")
    print(f"2025_BS.csv 컬럼 수: {len(header_2025)}")
    
    print("\n2. 분기 컬럼 찾기...")
    print("  2024_BS.csv:")
    quarters_2024 = find_all_quarter_starts(header_2024)
    print("  2025_BS.csv:")
    quarters_2025 = find_all_quarter_starts(header_2025)
    
    if not quarters_2024:
        print("ERROR: 2024_BS.csv에서 분기를 찾을 수 없습니다!")
        print(f"  첫 번째 컬럼: [{header_2024[0]}]")
        return
    if not quarters_2025:
        print("ERROR: 2025_BS.csv에서 분기를 찾을 수 없습니다!")
        print(f"  첫 번째 컬럼: [{header_2025[0]}]")
        return
    
    print(f"\n발견된 분기:")
    print(f"  2024: {list(quarters_2024.keys())}")
    print(f"  2025: {list(quarters_2025.keys())}")
    
    entity_bs_data = {}
    
    print("\n3. 2024 데이터 처리...")
    for quarter_key, start_idx in sorted(quarters_2024.items()):
        year = 2000 + int(quarter_key[:2])
        q_num = quarter_key[3]
        period_key = f"{year}_{q_num}Q"
        
        quarter_data = process_quarter(rows_2024, header_2024, quarter_key, start_idx, '2024')
        
        for account, values in quarter_data.items():
            if account not in entity_bs_data:
                entity_bs_data[account] = {}
            entity_bs_data[account][period_key] = values
    
    print("\n4. 2025 데이터 처리...")
    for quarter_key, start_idx in sorted(quarters_2025.items()):
        year = 2000 + int(quarter_key[:2])
        q_num = quarter_key[3]
        period_key = f"{year}_{q_num}Q"
        
        quarter_data = process_quarter(rows_2025, header_2025, quarter_key, start_idx, '2025')
        
        for account, values in quarter_data.items():
            if account not in entity_bs_data:
                entity_bs_data[account] = {}
            entity_bs_data[account][period_key] = values
    
    # JSON 파일로 저장
    with open('entity_bs_data.json', 'w', encoding='utf-8') as f:
        json.dump(entity_bs_data, f, ensure_ascii=False, indent=2)
    
    print("\n=== entity_bs_data.json 파일 생성 완료 ===")
    
    # 검증 출력
    print("\n=== 데이터 검증 (단위: 백만원) ===")
    for account in ['자산총계', '부채총계', '자본총계']:
        if account in entity_bs_data:
            print(f"\n{account}:")
            for period in sorted(entity_bs_data[account].keys()):
                data = entity_bs_data[account][period]
                consolidated = data.get('연결', 0)
                print(f"  {period}: 연결={consolidated:,}백만원 (약 {consolidated/100:,.0f}억원)")

if __name__ == '__main__':
    main()
