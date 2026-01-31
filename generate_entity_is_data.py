# -*- coding: utf-8 -*-
"""
법인별 IS 데이터 생성 스크립트
- CSV에서 법인별 분기 데이터 추출
- 법인별 누적 데이터는 분기 합산으로 계산
- 연결 기준과 법인 합계의 차이는 '기타(연결조정)'으로 처리
- 법인 구분: OC(국내), 중국, 홍콩, ST미국, 기타(연결조정)
"""

import csv
import json
from pathlib import Path

# 파일 경로
SCRIPT_DIR = Path(__file__).parent
IS_2024_FILE = SCRIPT_DIR / "2024 분기IS_법인별.csv"
IS_2025_FILE = SCRIPT_DIR / "2025_분기IS_법인별.csv"
OUTPUT_FILE = SCRIPT_DIR / "entity_is_data.json"

def parse_number(s):
    """숫자 문자열 파싱 (백만원 단위로 변환)"""
    if not s or s.strip() == '' or s.strip() == '0':
        return 0
    s = s.strip().replace(',', '').replace(' ', '')
    # 음수 처리 (괄호로 표시된 경우)
    if s.startswith('(') and s.endswith(')'):
        s = '-' + s[1:-1]
    try:
        return int(float(s)) // 1_000_000  # 백만원 단위
    except:
        return 0

def read_csv_with_encoding(filepath):
    """여러 인코딩 시도하여 CSV 읽기"""
    encodings = ['utf-8-sig', 'utf-8', 'cp949', 'euc-kr']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                reader = csv.reader(f)
                rows = list(reader)
                # 데이터 검증 (첫 행에 분기 정보가 있는지)
                if rows and len(rows[0]) > 10:
                    print(f"  -> {filepath.name}: {enc} 인코딩으로 읽기 성공")
                    return rows
        except:
            continue
    raise Exception(f"CSV 파일 읽기 실패: {filepath}")

def extract_quarter_data(rows, year, quarter_num):
    """특정 분기의 법인별 데이터 추출"""
    # 각 분기는 14개 컬럼씩
    # 1Q: 0~13, 2Q: 14~27, 3Q: 28~41, 4Q: 42~55
    offset = (quarter_num - 1) * 14
    
    # 컬럼 인덱스 (분기 내 상대 위치)
    COL_FNF = 1       # F&F (국내)
    COL_CHINA = 2     # F&F Shanghai (중국)
    COL_HK = 3        # FnF HONGKONG (홍콩)
    COL_SERGIO = 7    # 세르지오 (ST미국)
    COL_CONSOLIDATED = 13  # 연결 금액
    
    # 주요 계정 행 번호 (1-indexed)
    accounts = {
        '매출액': 2,
        '매출원가': 9,
        '매출총이익': 24,
        '광고선전비': 36,
        '수수료': 42,  # 지급수수료
        '영업이익': 58,
        '당기순이익': 109,
    }
    
    result = {}
    
    for account_name, row_num in accounts.items():
        row_idx = row_num - 1  # 0-indexed
        if row_idx >= len(rows):
            continue
        row = rows[row_idx]
        
        # 법인별 데이터 추출
        fnf = parse_number(row[offset + COL_FNF]) if offset + COL_FNF < len(row) else 0
        china = parse_number(row[offset + COL_CHINA]) if offset + COL_CHINA < len(row) else 0
        hk = parse_number(row[offset + COL_HK]) if offset + COL_HK < len(row) else 0
        sergio = parse_number(row[offset + COL_SERGIO]) if offset + COL_SERGIO < len(row) else 0
        
        # 연결 금액
        consolidated = parse_number(row[offset + COL_CONSOLIDATED]) if offset + COL_CONSOLIDATED < len(row) else 0
        
        # 법인 합계 (4개 법인)
        entity_sum = fnf + china + hk + sergio
        
        # 기타(연결조정) = 연결 금액 - 법인 합계
        other = consolidated - entity_sum
        
        result[account_name] = {
            'OC(국내)': fnf,
            '중국': china,
            '홍콩': hk,
            'ST미국': sergio,
            '기타': other,
            '_연결': consolidated,  # 검증용
        }
    
    # 인건비 = 급여 + 퇴직급여
    row_salary = rows[25]  # 급여 (26번 행, 0-indexed: 25)
    row_retire = rows[26]  # 퇴직급여 (27번 행, 0-indexed: 26)
    
    salary_fnf = parse_number(row_salary[offset + COL_FNF]) if offset + COL_FNF < len(row_salary) else 0
    salary_china = parse_number(row_salary[offset + COL_CHINA]) if offset + COL_CHINA < len(row_salary) else 0
    salary_hk = parse_number(row_salary[offset + COL_HK]) if offset + COL_HK < len(row_salary) else 0
    salary_sergio = parse_number(row_salary[offset + COL_SERGIO]) if offset + COL_SERGIO < len(row_salary) else 0
    
    retire_fnf = parse_number(row_retire[offset + COL_FNF]) if offset + COL_FNF < len(row_retire) else 0
    retire_china = parse_number(row_retire[offset + COL_CHINA]) if offset + COL_CHINA < len(row_retire) else 0
    retire_hk = parse_number(row_retire[offset + COL_HK]) if offset + COL_HK < len(row_retire) else 0
    retire_sergio = parse_number(row_retire[offset + COL_SERGIO]) if offset + COL_SERGIO < len(row_retire) else 0
    
    # 인건비 연결 금액 (급여/퇴직급여의 연결 금액 합산)
    salary_consolidated = parse_number(row_salary[offset + COL_CONSOLIDATED]) if offset + COL_CONSOLIDATED < len(row_salary) else 0
    retire_consolidated = parse_number(row_retire[offset + COL_CONSOLIDATED]) if offset + COL_CONSOLIDATED < len(row_retire) else 0
    total_labor_consolidated = salary_consolidated + retire_consolidated
    
    labor_fnf = salary_fnf + retire_fnf
    labor_china = salary_china + retire_china
    labor_hk = salary_hk + retire_hk
    labor_sergio = salary_sergio + retire_sergio
    labor_entity_sum = labor_fnf + labor_china + labor_hk + labor_sergio
    
    result['인건비'] = {
        'OC(국내)': labor_fnf,
        '중국': labor_china,
        '홍콩': labor_hk,
        'ST미국': labor_sergio,
        '기타': total_labor_consolidated - labor_entity_sum,
        '_연결': total_labor_consolidated,
    }
    
    # 감가상각비 = 감가상각비 + 무형자산상각비
    row_dep = rows[44]  # 감가상각비 (45번 행, 0-indexed: 44)
    row_amort = rows[45]  # 무형자산상각비 (46번 행, 0-indexed: 45)
    
    dep_fnf = parse_number(row_dep[offset + COL_FNF]) if offset + COL_FNF < len(row_dep) else 0
    dep_china = parse_number(row_dep[offset + COL_CHINA]) if offset + COL_CHINA < len(row_dep) else 0
    dep_hk = parse_number(row_dep[offset + COL_HK]) if offset + COL_HK < len(row_dep) else 0
    dep_sergio = parse_number(row_dep[offset + COL_SERGIO]) if offset + COL_SERGIO < len(row_dep) else 0
    
    amort_fnf = parse_number(row_amort[offset + COL_FNF]) if offset + COL_FNF < len(row_amort) else 0
    amort_china = parse_number(row_amort[offset + COL_CHINA]) if offset + COL_CHINA < len(row_amort) else 0
    amort_hk = parse_number(row_amort[offset + COL_HK]) if offset + COL_HK < len(row_amort) else 0
    amort_sergio = parse_number(row_amort[offset + COL_SERGIO]) if offset + COL_SERGIO < len(row_amort) else 0
    
    dep_consolidated = parse_number(row_dep[offset + COL_CONSOLIDATED]) if offset + COL_CONSOLIDATED < len(row_dep) else 0
    amort_consolidated = parse_number(row_amort[offset + COL_CONSOLIDATED]) if offset + COL_CONSOLIDATED < len(row_amort) else 0
    total_dep_consolidated = dep_consolidated + amort_consolidated
    
    dep_total_fnf = dep_fnf + amort_fnf
    dep_total_china = dep_china + amort_china
    dep_total_hk = dep_hk + amort_hk
    dep_total_sergio = dep_sergio + amort_sergio
    dep_entity_sum = dep_total_fnf + dep_total_china + dep_total_hk + dep_total_sergio
    
    result['감가상각비'] = {
        'OC(국내)': dep_total_fnf,
        '중국': dep_total_china,
        '홍콩': dep_total_hk,
        'ST미국': dep_total_sergio,
        '기타': total_dep_consolidated - dep_entity_sum,
        '_연결': total_dep_consolidated,
    }
    
    return result

def calculate_ytd(quarterly_data, up_to_quarter):
    """분기 데이터를 합산하여 누적 데이터 계산"""
    if not quarterly_data or 1 not in quarterly_data:
        return {}
    
    result = {}
    for account in quarterly_data[1].keys():
        ytd = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0, '_연결': 0}
        for q in range(1, up_to_quarter + 1):
            if q in quarterly_data and account in quarterly_data[q]:
                for entity in ytd.keys():
                    ytd[entity] += quarterly_data[q][account].get(entity, 0)
        result[account] = ytd
    return result

def main():
    print("=" * 60)
    print("법인별 IS 데이터 생성 시작")
    print("=" * 60)
    
    # CSV 파일 읽기
    print("\n[1] CSV 파일 읽기...")
    rows_2024 = read_csv_with_encoding(IS_2024_FILE)
    rows_2025 = read_csv_with_encoding(IS_2025_FILE)
    
    # 2024년 데이터 추출
    print("\n[2] 2024년 분기별 데이터 추출...")
    data_2024 = {}
    for q in [1, 2, 3, 4]:
        data_2024[q] = extract_quarter_data(rows_2024, 2024, q)
        print(f"  -> 2024_{q}Q 추출 완료")
    
    # 2025년 데이터 추출
    print("\n[3] 2025년 분기별 데이터 추출...")
    data_2025 = {}
    for q in [1, 2, 3, 4]:
        data_2025[q] = extract_quarter_data(rows_2025, 2025, q)
        print(f"  -> 2025_{q}Q 추출 완료")
    
    # 대시보드용 entityData 형식으로 변환
    print("\n[4] entityData 형식으로 변환...")
    
    entity_data = {}
    accounts = ['매출액', '매출원가', '매출총이익', '인건비', '광고선전비', '수수료', '감가상각비', '영업이익', '당기순이익']
    
    for account in accounts:
        entity_data[account] = {}
        
        # 2024년 분기 및 누적
        for q in [1, 2, 3, 4]:
            period_key = f'2024_{q}Q'
            if q in data_2024 and account in data_2024[q]:
                d = data_2024[q][account]
                entity_data[account][period_key] = {
                    'OC(국내)': d['OC(국내)'],
                    '중국': d['중국'],
                    '홍콩': d['홍콩'],
                    'ST미국': d['ST미국'],
                    '기타': d['기타'],
                }
            
            # 누적 데이터
            ytd_key = f'2024_{q}Q_Year' if q < 4 else '2024_Year'
            ytd = calculate_ytd(data_2024, q)
            if account in ytd:
                d = ytd[account]
                entity_data[account][ytd_key] = {
                    'OC(국내)': d['OC(국내)'],
                    '중국': d['중국'],
                    '홍콩': d['홍콩'],
                    'ST미국': d['ST미국'],
                    '기타': d['기타'],
                }
        
        # 2025년 분기 및 누적
        for q in [1, 2, 3, 4]:
            period_key = f'2025_{q}Q'
            if q in data_2025 and account in data_2025[q]:
                d = data_2025[q][account]
                entity_data[account][period_key] = {
                    'OC(국내)': d['OC(국내)'],
                    '중국': d['중국'],
                    '홍콩': d['홍콩'],
                    'ST미국': d['ST미국'],
                    '기타': d['기타'],
                }
            
            # 누적 데이터
            ytd_key = f'2025_{q}Q_Year' if q < 4 else '2025_Year'
            ytd = calculate_ytd(data_2025, q)
            if account in ytd:
                d = ytd[account]
                entity_data[account][ytd_key] = {
                    'OC(국내)': d['OC(국내)'],
                    '중국': d['중국'],
                    '홍콩': d['홍콩'],
                    'ST미국': d['ST미국'],
                    '기타': d['기타'],
                }
    
    # 기타판관비 계산 (판관비 - 인건비 - 광고선전비 - 수수료 - 감가상각비)
    print("\n[5] 기타판관비 계산...")
    
    entity_data['기타판관비'] = {}
    
    # 판관비 행 (25번 행)
    for year, rows, data_dict in [(2024, rows_2024, data_2024), (2025, rows_2025, data_2025)]:
        for q in [1, 2, 3, 4]:
            offset = (q - 1) * 14
            row_sg = rows[24]  # 판관비 (25번 행, 0-indexed: 24)
            
            sg_fnf = parse_number(row_sg[offset + 1]) if offset + 1 < len(row_sg) else 0
            sg_china = parse_number(row_sg[offset + 2]) if offset + 2 < len(row_sg) else 0
            sg_hk = parse_number(row_sg[offset + 3]) if offset + 3 < len(row_sg) else 0
            sg_sergio = parse_number(row_sg[offset + 7]) if offset + 7 < len(row_sg) else 0
            sg_consolidated = parse_number(row_sg[offset + 13]) if offset + 13 < len(row_sg) else 0
            
            sg_entity_sum = sg_fnf + sg_china + sg_hk + sg_sergio
            sg_other = sg_consolidated - sg_entity_sum
            
            # 기타판관비 = 판관비 - 인건비 - 광고선전비 - 수수료 - 감가상각비
            period_key = f'{year}_{q}Q'
            
            labor = entity_data['인건비'].get(period_key, {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0})
            ad = entity_data['광고선전비'].get(period_key, {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0})
            fee = entity_data['수수료'].get(period_key, {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0})
            dep = entity_data['감가상각비'].get(period_key, {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0})
            
            entity_data['기타판관비'][period_key] = {
                'OC(국내)': sg_fnf - labor['OC(국내)'] - ad['OC(국내)'] - fee['OC(국내)'] - dep['OC(국내)'],
                '중국': sg_china - labor['중국'] - ad['중국'] - fee['중국'] - dep['중국'],
                '홍콩': sg_hk - labor['홍콩'] - ad['홍콩'] - fee['홍콩'] - dep['홍콩'],
                'ST미국': sg_sergio - labor['ST미국'] - ad['ST미국'] - fee['ST미국'] - dep['ST미국'],
                '기타': sg_other - labor['기타'] - ad['기타'] - fee['기타'] - dep['기타'],
            }
        
        # 누적 계산
        for q in [1, 2, 3, 4]:
            ytd_key = f'{year}_{q}Q_Year' if q < 4 else f'{year}_Year'
            ytd_other = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0}
            for qq in range(1, q + 1):
                pk = f'{year}_{qq}Q'
                if pk in entity_data['기타판관비']:
                    for ent in ytd_other.keys():
                        ytd_other[ent] += entity_data['기타판관비'][pk].get(ent, 0)
            entity_data['기타판관비'][ytd_key] = ytd_other
    
    # JSON 파일로 저장
    print("\n[6] JSON 파일 저장...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(entity_data, f, ensure_ascii=False, indent=2)
    print(f"  -> 저장 완료: {OUTPUT_FILE}")
    
    # 결과 미리보기
    print("\n" + "=" * 60)
    print("결과 미리보기 (매출액)")
    print("=" * 60)
    for period in ['2024_4Q', '2024_Year', '2025_4Q', '2025_Year']:
        if period in entity_data['매출액']:
            d = entity_data['매출액'][period]
            print(f"  {period}: 국내={d['OC(국내)']:,}, 중국={d['중국']:,}, 홍콩={d['홍콩']:,}, ST미국={d['ST미국']:,}, 기타={d['기타']:,}")
    
    print("\n" + "=" * 60)
    print("결과 미리보기 (영업이익)")
    print("=" * 60)
    for period in ['2024_4Q', '2024_Year', '2025_4Q', '2025_Year']:
        if period in entity_data['영업이익']:
            d = entity_data['영업이익'][period]
            print(f"  {period}: 국내={d['OC(국내)']:,}, 중국={d['중국']:,}, 홍콩={d['홍콩']:,}, ST미국={d['ST미국']:,}, 기타={d['기타']:,}")
    
    print("\n" + "=" * 60)
    print("결과 미리보기 (당기순이익)")
    print("=" * 60)
    for period in ['2024_4Q', '2024_Year', '2025_4Q', '2025_Year']:
        if period in entity_data['당기순이익']:
            d = entity_data['당기순이익'][period]
            print(f"  {period}: 국내={d['OC(국내)']:,}, 중국={d['중국']:,}, 홍콩={d['홍콩']:,}, ST미국={d['ST미국']:,}, 기타={d['기타']:,}")
    
    print("\n" + "=" * 60)
    print("완료! entity_is_data.json 파일을 확인하세요.")
    print("=" * 60)

if __name__ == "__main__":
    main()
