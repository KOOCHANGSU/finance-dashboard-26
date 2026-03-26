# -*- coding: utf-8 -*-
import csv
import codecs

# (5)기타에 해당하는 계정명 (맵핑표 기준)
gita_accounts = [
    '복리후생비', '여비교통비', '통신비', '수도광열비', '세금과공과',
    '임차료', '대손상각비', '보험료', '차량유지비', '교육훈련비',
    '접대비', '소모품비', '도서인쇄비', '수선비', '아티스트개발비',
    '판매촉진비', '판매수수료', '판매장려금', '수출제비용', '잡비',
    '해외시장개척비', '용역료'
]

# CSV 파일 읽기
def read_csv_euckr(filepath):
    with codecs.open(filepath, 'r', encoding='euc-kr') as f:
        reader = csv.reader(f)
        return list(reader)

# 25.4Q 법인별 데이터 추출 (AR~AX열 = 인덱스 43~49, AY=50 단순합계)
# 열 구조: 25.4Q 섹션 시작 = 인덱스 43 (0-indexed)
# F&F=43, Shanghai=44, HongKong=45, Vietnam=46, 빗앤츠=47, 엔터테인먼트=48, 세르지오=49, 단순합계=50, 연결조정=51

data = read_csv_euckr('public/2025_분기IS_법인별.csv')

print("=" * 80)
print("25.4Q 법인별 (5)기타 계정 합산")
print("=" * 80)

# 법인별 합계 초기화
totals = {
    'F&F': 0,
    'Shanghai': 0,
    'HongKong': 0,
    'Vietnam': 0,
    '빗앤츠': 0,
    '엔터테인먼트': 0,
    '세르지오': 0,
    '단순합계': 0,
    '연결조정': 0
}

def parse_number(val):
    """문자열에서 숫자 추출"""
    if not val or val.strip() == '' or val.strip() == '0':
        return 0
    # 괄호로 둘러싸인 음수 처리
    val = val.strip()
    is_negative = val.startswith('(') and val.endswith(')')
    if is_negative:
        val = val[1:-1]
    # 쉼표와 공백 제거
    val = val.replace(',', '').replace(' ', '')
    try:
        result = float(val)
        return -result if is_negative else result
    except:
        return 0

# 각 계정별로 25.4Q 값 추출
for row in data[1:]:  # 헤더 제외
    if len(row) < 52:
        continue
    
    # 계정명 (첫 번째 열에서 계정명 추출)
    account_name = row[0].split(',')[0].strip() if row[0] else ''
    
    # (5)기타에 해당하는 계정인지 확인
    is_gita = False
    for gita in gita_accounts:
        if gita in account_name:
            is_gita = True
            break
    
    if is_gita:
        # 25.4Q 섹션 열 인덱스 (CSV 열 구조 확인 필요)
        # 각 분기 섹션은 14열씩 (헤더 포함)
        # 25.4Q 시작: 43번째 열 (0-indexed)
        idx_25_4q_start = 43
        
        fnf = parse_number(row[idx_25_4q_start]) if len(row) > idx_25_4q_start else 0
        shanghai = parse_number(row[idx_25_4q_start + 1]) if len(row) > idx_25_4q_start + 1 else 0
        hongkong = parse_number(row[idx_25_4q_start + 2]) if len(row) > idx_25_4q_start + 2 else 0
        vietnam = parse_number(row[idx_25_4q_start + 3]) if len(row) > idx_25_4q_start + 3 else 0
        bitenz = parse_number(row[idx_25_4q_start + 4]) if len(row) > idx_25_4q_start + 4 else 0
        enter = parse_number(row[idx_25_4q_start + 5]) if len(row) > idx_25_4q_start + 5 else 0
        sergio = parse_number(row[idx_25_4q_start + 6]) if len(row) > idx_25_4q_start + 6 else 0
        simple_sum = parse_number(row[idx_25_4q_start + 7]) if len(row) > idx_25_4q_start + 7 else 0
        adj = parse_number(row[idx_25_4q_start + 8]) if len(row) > idx_25_4q_start + 8 else 0
        
        print(f"{account_name}: F&F={fnf/1e6:.0f}, 중국={shanghai/1e6:.0f}, 홍콩={hongkong/1e6:.0f}, 기타={(enter+sergio)/1e6:.0f}, 연결조정={adj/1e6:.0f}")
        
        totals['F&F'] += fnf
        totals['Shanghai'] += shanghai
        totals['HongKong'] += hongkong
        totals['Vietnam'] += vietnam
        totals['빗앤츠'] += bitenz
        totals['엔터테인먼트'] += enter
        totals['세르지오'] += sergio
        totals['단순합계'] += simple_sum
        totals['연결조정'] += adj

print("\n" + "=" * 80)
print("25.4Q (5)기타 법인별 합계 (백만원)")
print("=" * 80)
print(f"OC(국내): {totals['F&F']/1e6:.0f}")
print(f"중국: {totals['Shanghai']/1e6:.0f}")
print(f"홍콩: {totals['HongKong']/1e6:.0f}")
print(f"기타(엔터+세르지오): {(totals['엔터테인먼트'] + totals['세르지오'])/1e6:.0f}")
print(f"연결조정: {totals['연결조정']/1e6:.0f}")
print(f"단순합계: {totals['단순합계']/1e6:.0f}")

# 현재 entityIncomeData 값과 비교
print("\n" + "=" * 80)
print("현재 코드 값 vs 계산된 값")
print("=" * 80)
current = {'OC(국내)': 13623, '중국': 12658, '홍콩': 3539, 'ST미국': -427, '기타': 123}
calculated = {
    'OC(국내)': round(totals['F&F']/1e6),
    '중국': round(totals['Shanghai']/1e6),
    '홍콩': round(totals['HongKong']/1e6),
    'ST미국(세르지오)': round(totals['세르지오']/1e6),
    '기타(엔터+연결조정)': round((totals['엔터테인먼트'] + totals['연결조정'])/1e6)
}
print(f"현재: {current}")
print(f"계산: {calculated}")
