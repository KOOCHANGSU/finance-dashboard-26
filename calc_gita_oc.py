# -*- coding: utf-8 -*-
import csv
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def parse_number(s):
    if not s or s.strip() in ['', '-', '0']:
        return 0
    s = s.strip().replace(' ', '')
    neg = False
    if s.startswith('(') and s.endswith(')'):
        neg = True
        s = s[1:-1]
    s = s.replace(',', '')
    try:
        val = float(s)
        return -val if neg else val
    except:
        return 0

# 기타손익 관련 계정 (맵핑표 기준)
gita_income_accounts = [
    '수수료수익', '임대료수익', '대손충당금환입', '무형자산손상차손환입',
    '투자부동산처분이익', '유형자산처분이익', '무형자산처분이익',
    '금융보증부채환입액', '잡이익', '관계기업투자주식처분이익', '종속기업투자주식처분이익'
]

gita_expense_accounts = [
    '기타의대손상각비', '금융보증비용', '기타의금융수수료',
    '무형자산폐기손실', '무형자산손상차손', '재고자산폐기손실',
    '유형자산처분손실', '유형자산폐기손실', '유형자산손상차손',
    '무형자산처분손실', '잡손실', '소송충당부채전입액', '종속기업처분손실'
]

with open('public/2025_분기IS_법인별.csv', 'r', encoding='cp949') as f:
    reader = csv.reader(f)
    rows = list(reader)

# OC(국내) 열 위치: 1Q=열1, 2Q=열15, 3Q=열29, 4Q=열43
oc_cols = [1, 15, 29, 43]

total_income = 0
total_expense = 0

print("=== 기타손익 수익 항목 (OC국내 1Q~4Q 합계) ===")
for row in rows:
    if len(row) < 44:
        continue
    account = row[0]
    for acc in gita_income_accounts:
        if acc in account:
            vals = [parse_number(row[col]) for col in oc_cols if col < len(row)]
            total = sum(vals)
            total_income += total
            print(f"{account}: {total/1000000:.0f}백만원 (1Q:{vals[0]/1000000:.0f}, 2Q:{vals[1]/1000000:.0f}, 3Q:{vals[2]/1000000:.0f}, 4Q:{vals[3]/1000000:.0f})")
            break

print(f"\n수익 합계: {total_income/1000000:.0f}백만원")

print("\n=== 기타손익 비용 항목 (OC국내 1Q~4Q 합계, 음수로 처리) ===")
for row in rows:
    if len(row) < 44:
        continue
    account = row[0]
    for acc in gita_expense_accounts:
        if acc in account:
            vals = [parse_number(row[col]) for col in oc_cols if col < len(row)]
            total = sum(vals)
            total_expense += total  # 비용은 양수로 나오므로 차감해야 함
            print(f"{account}: -{total/1000000:.0f}백만원 (1Q:{vals[0]/1000000:.0f}, 2Q:{vals[1]/1000000:.0f}, 3Q:{vals[2]/1000000:.0f}, 4Q:{vals[3]/1000000:.0f})")
            break

print(f"\n비용 합계: -{total_expense/1000000:.0f}백만원")

net_gita = total_income - total_expense
print(f"\n=== 기타손익 OC(국내) 2025년 누적 합계 ===")
print(f"수익 - 비용 = {total_income/1000000:.0f} - {total_expense/1000000:.0f} = {net_gita/1000000:.0f}백만원")
