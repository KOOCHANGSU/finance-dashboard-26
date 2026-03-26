# -*- coding: utf-8 -*-
import csv
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/2025_분기IS_법인별.csv', 'r', encoding='cp949') as f:
    reader = csv.reader(f)
    rows = list(reader)

# 영업외수익 / 영업외비용 관련 모든 계정 찾기
print("=== 영업외수익 항목 (4Q OC국내 열) ===")
for row in rows:
    if len(row) > 43:
        account = row[0]
        # 영업외수익 관련
        if any(x in account for x in ['이자수익', '수수료수익', '외화환산이익', '외환차익', '배당금수익', '잡이익', '처분이익', '평가이익', '거래이익', '환입']):
            print(f'{account}: {row[43]}')

print("\n=== 영업외비용 항목 (4Q OC국내 열) ===")
for row in rows:
    if len(row) > 43:
        account = row[0]
        # 영업외비용 관련
        if any(x in account for x in ['이자비용', '외화환산손실', '외환차손', '잡손실', '처분손실', '평가손실', '거래손실', '기부금', '폐기손실', '상각비', '손상']):
            print(f'{account}: {row[43]}')

# 4Q 누적 열 (연간 누적 = 2025_Year)
print("\n\n=== 2025_Year (4Q 연간 누적) 영업외수익 - OC국내 열 11번 ===")
for row in rows:
    if len(row) > 54:
        account = row[0]
        if any(x in account for x in ['이자수익', '수수료수익', '외화환산이익', '외환차익', '배당금수익', '잡이익', '처분이익', '평가이익', '거래이익', '환입']):
            print(f'{account}: {row[54]}')  # 연간 누적 열

print("\n=== 2025_Year 영업외비용 - OC국내 열 ===")
for row in rows:
    if len(row) > 54:
        account = row[0]
        if any(x in account for x in ['이자비용', '외화환산손실', '외환차손', '잡손실', '처분손실', '평가손실', '거래손실', '기부금', '폐기손실', '상각비', '손상']):
            print(f'{account}: {row[54]}')
