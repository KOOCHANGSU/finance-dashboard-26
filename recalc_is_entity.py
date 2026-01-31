# -*- coding: utf-8 -*-
import csv
import json

# IS CSV 읽기
with open('2025_IS.csv', 'r', encoding='cp949') as f:
    reader = csv.reader(f)
    rows = list(reader)

def parse_num(s):
    """숫자 문자열 파싱 (백만원 단위로 변환)"""
    if not s or s.strip() == '':
        return 0
    s = s.strip().replace(',', '').replace(' ', '')
    if s.startswith('(') and s.endswith(')'):
        s = '-' + s[1:-1]
    try:
        return int(float(s)) // 1000000  # 백만원 단위
    except:
        return 0

# 계정 매핑 (CSV 계정명 -> 대시보드 키)
account_mapping = {
    'Ⅰ.매출액': '매출액',
    'Ⅱ.매출원가': '매출원가',
    'Ⅲ.매출총이익': '매출총이익',
    'Ⅵ.영업이익': '영업이익',
    '당기순이익': '당기순이익',
    '급여': '인건비_급여',
    '퇴직급여': '인건비_퇴직',
    '광고선전비': '광고선전비',
    '지급수수료': '수수료',
    '감가상각비': '감가상각비_1',
    '무형자산상각비': '감가상각비_2',
}

# 3Q 컬럼 인덱스 (법인별)
# 35: F&F, 36: Shanghai, 37: HK, 38: 베트남, 39: 빅텐츠, 40: 엔터, 41: 세르지오
Q3_COLS = {'OC(국내)': 35, '중국': 36, '홍콩': 37, '기타': 41}

# 4Q 컬럼 인덱스 (법인별)
Q4_COLS = {'OC(국내)': 52, '중국': 53, '홍콩': 54, '기타': 58}

results = {}

# 각 행 처리
for i, row in enumerate(rows):
    if not row or len(row) < 60:
        continue
    
    account_name = row[0].strip() if row[0] else ''
    
    # 매출액
    if 'Ⅰ.매출액' in account_name or account_name == 'Ⅰ.매출액':
        key = '매출액'
    elif 'Ⅱ.매출원가' in account_name or account_name == 'Ⅱ.매출원가':
        key = '매출원가'
    elif 'Ⅲ.매출총이익' in account_name or account_name == 'Ⅲ.매출총이익':
        key = '매출총이익'
    elif 'Ⅵ.영업이익' in account_name or account_name == 'Ⅵ.영업이익':
        key = '영업이익'
    elif '당기순이익' in account_name and '지배기업' not in account_name:
        key = '당기순이익'
    elif '급여' == account_name:
        key = '급여'
    elif '퇴직급여' == account_name:
        key = '퇴직급여'
    elif '광고선전비' == account_name:
        key = '광고선전비'
    elif '지급수수료' == account_name:
        key = '수수료'
    elif '감가상각비' == account_name:
        key = '감가상각비'
    else:
        continue
    
    # 3Q 누적
    q3_data = {}
    for entity, col in Q3_COLS.items():
        q3_data[entity] = parse_num(row[col]) if col < len(row) else 0
    
    # 4Q 누적
    q4_data = {}
    for entity, col in Q4_COLS.items():
        q4_data[entity] = parse_num(row[col]) if col < len(row) else 0
    
    # 4Q 당분기 = 4Q 누적 - 3Q 누적
    q4_qtr = {}
    for entity in Q3_COLS.keys():
        q4_qtr[entity] = q4_data[entity] - q3_data[entity]
    
    results[key] = {
        '2025_4Q': q4_qtr,
        '2025_Year': q4_data
    }

# 출력
print('=== IS 법인별 데이터 (정확한 계산값) ===')
print()

for key in ['매출액', '매출원가', '매출총이익', '영업이익', '당기순이익', '급여', '퇴직급여', '광고선전비', '수수료', '감가상각비']:
    if key in results:
        data = results[key]
        print(f"'{key}':")
        print(f"  '2025_4Q': {{ 'OC(국내)': {data['2025_4Q']['OC(국내)']}, '중국': {data['2025_4Q']['중국']}, '홍콩': {data['2025_4Q']['홍콩']}, '기타': {data['2025_4Q']['기타']} }},")
        print(f"  '2025_Year': {{ 'OC(국내)': {data['2025_Year']['OC(국내)']}, '중국': {data['2025_Year']['중국']}, '홍콩': {data['2025_Year']['홍콩']}, '기타': {data['2025_Year']['기타']} }},")
        print()
