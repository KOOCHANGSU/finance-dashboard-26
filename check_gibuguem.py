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

with open('public/2025_분기IS_법인별.csv', 'r', encoding='cp949') as f:
    reader = csv.reader(f)
    rows = list(reader)

print("=== 기부금 행 전체 (4Q 구역) ===")
for row in rows:
    if len(row) > 0 and '기부금' in row[0]:
        print(f"계정명: {row[0]}")
        # 4Q 구역
        # 42: 계정명
        # 43: F&F (OC국내)
        # 44: 중국
        # 45: 홍콩
        # 46: 베트남
        # 47: 빅텐츠
        # 48: 엔터테인먼트
        # 49: 세르지오 (ST미국)
        # 50: 단순합계
        # 51: 연결조정분개
        # 52: 연결조정분개
        # 53: 2025년 누적
        # 54: 2025년 전분기 누적
        # 55: 2025년 4분기
        
        print(f"  F&F(OC국내): {row[43] if len(row) > 43 else 'N/A'}")
        print(f"  중국: {row[44] if len(row) > 44 else 'N/A'}")
        print(f"  홍콩: {row[45] if len(row) > 45 else 'N/A'}")
        print(f"  베트남: {row[46] if len(row) > 46 else 'N/A'}")
        print(f"  빅텐츠: {row[47] if len(row) > 47 else 'N/A'}")
        print(f"  엔터테인먼트: {row[48] if len(row) > 48 else 'N/A'}")
        print(f"  세르지오(ST미국): {row[49] if len(row) > 49 else 'N/A'}")
        print(f"  단순합계: {row[50] if len(row) > 50 else 'N/A'}")
        print(f"  연결조정1: {row[51] if len(row) > 51 else 'N/A'}")
        print(f"  연결조정2: {row[52] if len(row) > 52 else 'N/A'}")
        print(f"  2025년 누적(연결): {row[53] if len(row) > 53 else 'N/A'}")
        
        # 법인별 합계 계산
        oc = parse_number(row[43]) if len(row) > 43 else 0
        cn = parse_number(row[44]) if len(row) > 44 else 0
        hk = parse_number(row[45]) if len(row) > 45 else 0
        us = parse_number(row[49]) if len(row) > 49 else 0
        simple_sum = parse_number(row[50]) if len(row) > 50 else 0
        consolidated = parse_number(row[53]) if len(row) > 53 else 0
        
        print(f"\n  법인별 합계(OC+중국+홍콩+ST미국): {(oc+cn+hk+us)/1000000:.1f}백만원")
        print(f"  단순합계: {simple_sum/1000000:.1f}백만원")
        print(f"  연결 총액: {consolidated/1000000:.1f}백만원")
        print(f"  연결조정(연결-단순합계): {(consolidated-simple_sum)/1000000:.1f}백만원")
        break

# 1Q~4Q 법인별 합계로 연간 누적 계산
print("\n\n=== 기부금 OC(국내) 1Q~4Q 합계 ===")
entity_cols = {'1Q': 1, '2Q': 15, '3Q': 29, '4Q': 43}
for row in rows:
    if len(row) > 0 and '기부금' in row[0]:
        total = 0
        for q, col in entity_cols.items():
            val = parse_number(row[col]) if len(row) > col else 0
            print(f"  {q}: {val/1000000:.1f}백만원")
            total += val
        print(f"  연간합계: {total/1000000:.1f}백만원")
        print(f"  (비용이므로 음수 표시: {-total/1000000:.1f}백만원)")
        break
