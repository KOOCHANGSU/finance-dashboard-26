# -*- coding: utf-8 -*-
import csv
import json

# (5)기타에 해당하는 계정명 (맵핑표 기준)
gita_accounts = [
    '복리후생비', '여비교통비', '통신비', '수도광열비', '세금과공과',
    '임차료', '대손상각비', '보험료', '차량유지비', '교육훈련비',
    '접대비', '소모품비', '도서인쇄비', '수선비', '아티스트개발비',
    '판매촉진비', '판매수수료', '판매장려금', '수출제비용', '잡비',
    '해외시장개척비', '용역료', '기타의대손상각비'
]

def parse_number(val):
    """문자열에서 숫자 추출"""
    if not val or val.strip() == '' or val.strip() == '0':
        return 0
    val = val.strip()
    is_negative = val.startswith('(') and val.endswith(')')
    if is_negative:
        val = val[1:-1]
    val = val.replace(',', '').replace(' ', '')
    try:
        result = float(val)
        return -result if is_negative else result
    except:
        return 0

def read_csv_euckr(filepath):
    with open(filepath, 'r', encoding='euc-kr') as f:
        reader = csv.reader(f)
        return list(reader)

def is_gita_account(account_name):
    for gita in gita_accounts:
        if gita in account_name:
            return True
    return False

# ============================================================
# 2024 분기별 법인별 데이터 추출
# ============================================================
print("=" * 80)
print("2024년 분기별 (5)기타판관비 법인별 계산")
print("=" * 80)

data_2024_q = read_csv_euckr('public/2024 분기IS_법인별.csv')

# 분기별 시작 열 인덱스 (0-based)
# 각 분기 섹션: 분기명, F&F, Shanghai, HongKong, Vietnam, 빗앤츠, 엔터테인먼트, 세르지오, 단순합계, 연결조정, (공백), 누적, 전분기누적, 분기연결
# 1Q: 0~13, 2Q: 14~27, 3Q: 28~41, 4Q: 42~55
quarters_2024 = {
    '2024_1Q': {'start': 1, 'bd_idx': 13},   # AR=1, BD=13
    '2024_2Q': {'start': 15, 'bd_idx': 27},  # 2Q 시작
    '2024_3Q': {'start': 29, 'bd_idx': 41},  # 3Q 시작
    '2024_4Q': {'start': 43, 'bd_idx': 55},  # 4Q 시작 (AR=43, BD=55)
}

results_2024_q = {}

for qtr, info in quarters_2024.items():
    totals = {'F&F': 0, 'Shanghai': 0, 'HongKong': 0, 'Vietnam': 0, '빗앤츠': 0, '엔터테인먼트': 0, '세르지오': 0, '단순합계': 0, '연결분기': 0}
    
    for row in data_2024_q[1:]:
        if len(row) < info['bd_idx'] + 1:
            continue
        account_name = row[0].split(',')[0].strip() if row[0] else ''
        
        if is_gita_account(account_name):
            start = info['start']
            totals['F&F'] += parse_number(row[start]) if len(row) > start else 0
            totals['Shanghai'] += parse_number(row[start+1]) if len(row) > start+1 else 0
            totals['HongKong'] += parse_number(row[start+2]) if len(row) > start+2 else 0
            totals['Vietnam'] += parse_number(row[start+3]) if len(row) > start+3 else 0
            totals['빗앤츠'] += parse_number(row[start+4]) if len(row) > start+4 else 0
            totals['엔터테인먼트'] += parse_number(row[start+5]) if len(row) > start+5 else 0
            totals['세르지오'] += parse_number(row[start+6]) if len(row) > start+6 else 0
            totals['단순합계'] += parse_number(row[start+7]) if len(row) > start+7 else 0
            totals['연결분기'] += parse_number(row[info['bd_idx']]) if len(row) > info['bd_idx'] else 0
    
    # 연결조정 계산
    adj = totals['연결분기'] - totals['단순합계']
    기타 = totals['엔터테인먼트'] + adj  # 엔터테인먼트 + 연결조정
    
    results_2024_q[qtr] = {
        'OC(국내)': round(totals['F&F'] / 1e6),
        '중국': round(totals['Shanghai'] / 1e6),
        '홍콩': round(totals['HongKong'] / 1e6),
        'ST미국': round(totals['세르지오'] / 1e6),
        '기타': round(기타 / 1e6),
        '연결': round(totals['연결분기'] / 1e6)
    }
    
    print(f"\n{qtr}: {results_2024_q[qtr]}")

# ============================================================
# 2025 분기별 법인별 데이터 추출
# ============================================================
print("\n" + "=" * 80)
print("2025년 분기별 (5)기타판관비 법인별 계산")
print("=" * 80)

data_2025_q = read_csv_euckr('public/2025_분기IS_법인별.csv')

quarters_2025 = {
    '2025_1Q': {'start': 1, 'bd_idx': 13},
    '2025_2Q': {'start': 15, 'bd_idx': 27},
    '2025_3Q': {'start': 29, 'bd_idx': 41},
    '2025_4Q': {'start': 43, 'bd_idx': 55},
}

results_2025_q = {}

for qtr, info in quarters_2025.items():
    totals = {'F&F': 0, 'Shanghai': 0, 'HongKong': 0, 'Vietnam': 0, '빗앤츠': 0, '엔터테인먼트': 0, '세르지오': 0, '단순합계': 0, '연결분기': 0}
    
    for row in data_2025_q[1:]:
        if len(row) < info['bd_idx'] + 1:
            continue
        account_name = row[0].split(',')[0].strip() if row[0] else ''
        
        if is_gita_account(account_name):
            start = info['start']
            totals['F&F'] += parse_number(row[start]) if len(row) > start else 0
            totals['Shanghai'] += parse_number(row[start+1]) if len(row) > start+1 else 0
            totals['HongKong'] += parse_number(row[start+2]) if len(row) > start+2 else 0
            totals['Vietnam'] += parse_number(row[start+3]) if len(row) > start+3 else 0
            totals['빗앤츠'] += parse_number(row[start+4]) if len(row) > start+4 else 0
            totals['엔터테인먼트'] += parse_number(row[start+5]) if len(row) > start+5 else 0
            totals['세르지오'] += parse_number(row[start+6]) if len(row) > start+6 else 0
            totals['단순합계'] += parse_number(row[start+7]) if len(row) > start+7 else 0
            totals['연결분기'] += parse_number(row[info['bd_idx']]) if len(row) > info['bd_idx'] else 0
    
    adj = totals['연결분기'] - totals['단순합계']
    기타 = totals['엔터테인먼트'] + adj
    
    results_2025_q[qtr] = {
        'OC(국내)': round(totals['F&F'] / 1e6),
        '중국': round(totals['Shanghai'] / 1e6),
        '홍콩': round(totals['HongKong'] / 1e6),
        'ST미국': round(totals['세르지오'] / 1e6),
        '기타': round(기타 / 1e6),
        '연결': round(totals['연결분기'] / 1e6)
    }
    
    print(f"\n{qtr}: {results_2025_q[qtr]}")

# ============================================================
# 2024, 2025 연간 누적 법인별 데이터 (2024_IS.csv, 2025_IS.csv)
# BA~BG열 (법인별), BH열 (단순합계), BK열 (연결누적)
# ============================================================
print("\n" + "=" * 80)
print("연간 누적 (5)기타판관비 계산")
print("=" * 80)

def calc_year_totals(filepath, year):
    data = read_csv_euckr(filepath)
    # BA=52, BB=53, BC=54, BD=55, BE=56, BF=57, BG=58, BH=59, BK=62 (0-indexed)
    # 실제 열 인덱스는 파일 구조에 따라 다를 수 있음
    # 2024_IS.csv와 2025_IS.csv의 열 구조 확인 필요
    
    totals = {'F&F': 0, 'Shanghai': 0, 'HongKong': 0, 'Vietnam': 0, '빗앤츠': 0, '엔터테인먼트': 0, '세르지오': 0, '단순합계': 0, '연결누적': 0}
    
    # 열 인덱스 - 4Q 섹션의 연간 누적
    # 25.4Q 기준: BA=52 (F&F), BB=53 (Shanghai), BC=54 (HK), BD=55 (VN), BE=56 (빗), BF=57 (엔터), BG=58 (세르), BH=59 (단순합계), 공백, 공백, BK=62 (연결누적)
    ba_idx = 52  # BA열 (F&F)
    bk_idx = 62  # BK열 (연결누적)
    
    for row in data[1:]:
        if len(row) < bk_idx + 1:
            continue
        account_name = row[0].split(',')[0].strip() if row[0] else ''
        
        if is_gita_account(account_name):
            totals['F&F'] += parse_number(row[ba_idx]) if len(row) > ba_idx else 0
            totals['Shanghai'] += parse_number(row[ba_idx+1]) if len(row) > ba_idx+1 else 0
            totals['HongKong'] += parse_number(row[ba_idx+2]) if len(row) > ba_idx+2 else 0
            totals['Vietnam'] += parse_number(row[ba_idx+3]) if len(row) > ba_idx+3 else 0
            totals['빗앤츠'] += parse_number(row[ba_idx+4]) if len(row) > ba_idx+4 else 0
            totals['엔터테인먼트'] += parse_number(row[ba_idx+5]) if len(row) > ba_idx+5 else 0
            totals['세르지오'] += parse_number(row[ba_idx+6]) if len(row) > ba_idx+6 else 0
            totals['단순합계'] += parse_number(row[ba_idx+7]) if len(row) > ba_idx+7 else 0
            totals['연결누적'] += parse_number(row[bk_idx]) if len(row) > bk_idx else 0
    
    adj = totals['연결누적'] - totals['단순합계']
    기타 = totals['엔터테인먼트'] + adj
    
    return {
        'OC(국내)': round(totals['F&F'] / 1e6),
        '중국': round(totals['Shanghai'] / 1e6),
        '홍콩': round(totals['HongKong'] / 1e6),
        'ST미국': round(totals['세르지오'] / 1e6),
        '기타': round(기타 / 1e6),
        '연결': round(totals['연결누적'] / 1e6)
    }

result_2024_year = calc_year_totals('public/2024_IS.csv', '2024')
result_2025_year = calc_year_totals('public/2025_IS.csv', '2025')

print(f"\n2024_Year: {result_2024_year}")
print(f"2025_Year: {result_2025_year}")

# ============================================================
# 누적 계산 (1Q_Year, 2Q_Year, 3Q_Year)
# ============================================================
print("\n" + "=" * 80)
print("분기별 누적 계산")
print("=" * 80)

# 2024년 누적
results_2024_cum = {}
cum = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0}
for qtr in ['2024_1Q', '2024_2Q', '2024_3Q', '2024_4Q']:
    for key in cum:
        cum[key] += results_2024_q[qtr][key]
    results_2024_cum[f"{qtr}_Year"] = cum.copy()
    print(f"{qtr}_Year: {results_2024_cum[f'{qtr}_Year']}")

# 2025년 누적
results_2025_cum = {}
cum = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0}
for qtr in ['2025_1Q', '2025_2Q', '2025_3Q', '2025_4Q']:
    for key in cum:
        cum[key] += results_2025_q[qtr][key]
    results_2025_cum[f"{qtr}_Year"] = cum.copy()
    print(f"{qtr}_Year: {results_2025_cum[f'{qtr}_Year']}")

# ============================================================
# JSX 코드 형식으로 출력
# ============================================================
print("\n" + "=" * 80)
print("JSX 코드용 출력")
print("=" * 80)

print("\n'기타판관비': {")
for qtr in ['2024_1Q', '2024_2Q', '2024_3Q', '2024_4Q']:
    r = results_2024_q[qtr]
    print(f"  '{qtr}': {{ 'OC(국내)': {r['OC(국내)']}, '중국': {r['중국']}, '홍콩': {r['홍콩']}, 'ST미국': {r['ST미국']}, '기타': {r['기타']} }},")
    rc = results_2024_cum[f"{qtr}_Year"]
    print(f"  '{qtr}_Year': {{ 'OC(국내)': {rc['OC(국내)']}, '중국': {rc['중국']}, '홍콩': {rc['홍콩']}, 'ST미국': {rc['ST미국']}, '기타': {rc['기타']} }},")

print(f"  '2024_Year': {{ 'OC(국내)': {result_2024_year['OC(국내)']}, '중국': {result_2024_year['중국']}, '홍콩': {result_2024_year['홍콩']}, 'ST미국': {result_2024_year['ST미국']}, '기타': {result_2024_year['기타']} }},")

for qtr in ['2025_1Q', '2025_2Q', '2025_3Q', '2025_4Q']:
    r = results_2025_q[qtr]
    print(f"  '{qtr}': {{ 'OC(국내)': {r['OC(국내)']}, '중국': {r['중국']}, '홍콩': {r['홍콩']}, 'ST미국': {r['ST미국']}, '기타': {r['기타']} }},")
    rc = results_2025_cum[f"{qtr}_Year"]
    print(f"  '{qtr}_Year': {{ 'OC(국내)': {rc['OC(국내)']}, '중국': {rc['중국']}, '홍콩': {rc['홍콩']}, 'ST미국': {rc['ST미국']}, '기타': {rc['기타']} }},")

print(f"  '2025_Year': {{ 'OC(국내)': {result_2025_year['OC(국내)']}, '중국': {result_2025_year['중국']}, '홍콩': {result_2025_year['홍콩']}, 'ST미국': {result_2025_year['ST미국']}, '기타': {result_2025_year['기타']} }},")
print("},")
