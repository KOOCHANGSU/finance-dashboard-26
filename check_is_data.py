# -*- coding: utf-8 -*-
import csv

# IS CSV 읽기
with open('2025_IS.csv', 'r', encoding='cp949') as f:
    reader = csv.reader(f)
    rows = list(reader)

def parse_num(s):
    """숫자 문자열 파싱"""
    if not s or s.strip() == '':
        return 0
    s = s.strip().replace(',', '').replace(' ', '')
    if s.startswith('(') and s.endswith(')'):
        s = '-' + s[1:-1]
    try:
        return int(float(s))
    except:
        return 0

# 헤더 확인
header = rows[0]
print('=== IS CSV 컬럼 구조 ===')
print('각 분기별 17개 컬럼 반복')
print('1Q: 0~16, 2Q: 17~33, 3Q: 34~50, 4Q: 51~67')
print()

# 매출액 (2행, index 1)
row = rows[1]
print('=== 매출액 법인별 데이터 ===')
print()

# 3Q 법인별 누적 (컬럼 35~41)
print('3Q 법인별 누적:')
q3_fnf = parse_num(row[35])
q3_china = parse_num(row[36])
q3_hk = parse_num(row[37])
q3_st = parse_num(row[41])  # 세르지오
print(f'  F&F(국내): {q3_fnf:,} = {q3_fnf//1000000}백만원')
print(f'  중국: {q3_china:,} = {q3_china//1000000}백만원')
print(f'  홍콩: {q3_hk:,} = {q3_hk//1000000}백만원')
print(f'  ST미국: {q3_st:,} = {q3_st//1000000}백만원')
print()

# 4Q 법인별 누적 (컬럼 52~58)
print('4Q 법인별 누적:')
q4_fnf = parse_num(row[52])
q4_china = parse_num(row[53])
q4_hk = parse_num(row[54])
q4_st = parse_num(row[58])  # 세르지오
print(f'  F&F(국내): {q4_fnf:,} = {q4_fnf//1000000}백만원')
print(f'  중국: {q4_china:,} = {q4_china//1000000}백만원')
print(f'  홍콩: {q4_hk:,} = {q4_hk//1000000}백만원')
print(f'  ST미국: {q4_st:,} = {q4_st//1000000}백만원')
print()

# 4Q 당분기 = 4Q 누적 - 3Q 누적
print('4Q 당분기 (계산: 4Q누적 - 3Q누적):')
print(f'  F&F(국내): {(q4_fnf-q3_fnf)//1000000}백만원')
print(f'  중국: {(q4_china-q3_china)//1000000}백만원')
print(f'  홍콩: {(q4_hk-q3_hk)//1000000}백만원')
print(f'  ST미국: {(q4_st-q3_st)//1000000}백만원')
print()

# 영업이익 확인
print('=== 영업이익 법인별 데이터 ===')
# 영업이익 행 찾기
for i, r in enumerate(rows):
    if r and '영업이익' in r[0]:
        row = r
        print(f'행 번호: {i+1}')
        break

q3_fnf = parse_num(row[35])
q3_china = parse_num(row[36])
q3_hk = parse_num(row[37])
q3_st = parse_num(row[41])

q4_fnf = parse_num(row[52])
q4_china = parse_num(row[53])
q4_hk = parse_num(row[54])
q4_st = parse_num(row[58])

print('3Q 법인별 누적:')
print(f'  F&F(국내): {q3_fnf//1000000}백만원')
print(f'  중국: {q3_china//1000000}백만원')
print(f'  홍콩: {q3_hk//1000000}백만원')
print(f'  ST미국: {q3_st//1000000}백만원')
print()

print('4Q 법인별 누적:')
print(f'  F&F(국내): {q4_fnf//1000000}백만원')
print(f'  중국: {q4_china//1000000}백만원')
print(f'  홍콩: {q4_hk//1000000}백만원')
print(f'  ST미국: {q4_st//1000000}백만원')
print()

print('4Q 당분기 (계산: 4Q누적 - 3Q누적):')
print(f'  F&F(국내): {(q4_fnf-q3_fnf)//1000000}백만원')
print(f'  중국: {(q4_china-q3_china)//1000000}백만원')
print(f'  홍콩: {(q4_hk-q3_hk)//1000000}백만원')
print(f'  ST미국: {(q4_st-q3_st)//1000000}백만원')
