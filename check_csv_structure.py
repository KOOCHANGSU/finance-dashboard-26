# -*- coding: utf-8 -*-
import csv
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/2025_분기IS_법인별.csv', 'r', encoding='cp949') as f:
    reader = csv.reader(f)
    rows = list(reader)

# 헤더 출력
print("=== 헤더 행 (열 번호 : 값) ===")
for i, val in enumerate(rows[0]):
    if i < 60:
        print(f"{i}: {val}")

# 기타손익 계정들의 모든 열 확인
print("\n\n=== 잡이익 행 전체 (4Q 구역) ===")
for row in rows:
    if len(row) > 0 and '잡이익' in row[0]:
        # 4Q 구역은 42번부터
        for i in range(42, min(60, len(row))):
            print(f"열{i}: {row[i]}")
        break

print("\n\n=== 수수료수익 행 (4Q 구역) ===")
for row in rows:
    if len(row) > 0 and '수수료수익' in row[0]:
        for i in range(42, min(60, len(row))):
            print(f"열{i}: {row[i]}")
        break
