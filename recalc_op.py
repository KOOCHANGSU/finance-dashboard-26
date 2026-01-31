# -*- coding: utf-8 -*-
import csv

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

Q3_COLS = {'OC(국내)': 35, '중국': 36, '홍콩': 37, '기타': 41}
Q4_COLS = {'OC(국내)': 52, '중국': 53, '홍콩': 54, '기타': 58}

# 영업이익 찾기
for i, row in enumerate(rows):
    if not row:
        continue
    account = row[0].strip() if row[0] else ''
    
    if 'Ⅵ.영업이익' in account:
        print(f'영업이익 행 {i+1}: {account}')
        
        # 3Q 누적
        print('3Q 법인별 누적:')
        for entity, col in Q3_COLS.items():
            val = parse_num(row[col]) if col < len(row) else 0
            print(f'  {entity}: {val}백만원')
        
        print()
        
        # 4Q 누적
        print('4Q 법인별 누적:')
        q4_data = {}
        for entity, col in Q4_COLS.items():
            val = parse_num(row[col]) if col < len(row) else 0
            q4_data[entity] = val
            print(f'  {entity}: {val}백만원')
        
        print()
        
        # 4Q 당분기
        print('4Q 당분기 (4Q누적 - 3Q누적):')
        for entity, col in Q3_COLS.items():
            q3 = parse_num(row[col]) if col < len(row) else 0
            q4 = q4_data[entity]
            print(f'  {entity}: {q4 - q3}백만원')
        
        print()
        print('=== 대시보드에 입력할 값 ===')
        print("'영업이익':")
        
        q3_vals = {e: parse_num(row[c]) for e, c in Q3_COLS.items()}
        q4_qtr = {e: q4_data[e] - q3_vals[e] for e in Q3_COLS.keys()}
        
        print(f"  '2025_4Q': {{ 'OC(국내)': {q4_qtr['OC(국내)']}, '중국': {q4_qtr['중국']}, '홍콩': {q4_qtr['홍콩']}, '기타': {q4_qtr['기타']} }},")
        print(f"  '2025_Year': {{ 'OC(국내)': {q4_data['OC(국내)']}, '중국': {q4_data['중국']}, '홍콩': {q4_data['홍콩']}, '기타': {q4_data['기타']} }},")
        break
