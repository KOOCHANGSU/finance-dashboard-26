# -*- coding: utf-8 -*-
import csv
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 맵핑표 기반 계정 분류
ACCOUNT_MAPPING = {
    # (1)외환손익
    '외화환산이익': '외환손익',
    '외환차익': '외환손익',
    '외화환산손실': '외환손익',  # 비용이므로 음수
    '외환차손': '외환손익',  # 비용이므로 음수
    
    # (2)선물환손익
    '파생상품평가이익': '선물환손익',
    '파생상품거래이익': '선물환손익',
    '파생상품평가손실': '선물환손익',  # 비용이므로 음수
    '파생상품거래손실': '선물환손익',  # 비용이므로 음수
    
    # (3)금융상품손익
    '단기매매증권평가이익': '금융상품손익',
    '단기매매증권처분이익': '금융상품손익',
    '당기손익-공정가치측정금융자산 평가이익': '금융상품손익',
    '당기손익인식금융자산처분이익': '금융상품손익',
    '당기손익-공정가치측정금융자산 평가손실': '금융상품손익',  # 비용
    '당기손익인식금융자산처분손실': '금융상품손익',  # 비용
    
    # (4)이자손익
    '이자수익': '이자손익',
    '이자비용': '이자손익',  # 비용이므로 음수
    
    # (5)배당수익
    '배당금수익': '배당수익',
    
    # (6)기부금
    '기부금': '기부금',  # 비용이므로 음수
    
    # (7)기타손익 - 수익 항목
    '수수료수익': '기타손익',
    '임대료수익': '기타손익',
    '대손충당금환입': '기타손익',
    '무형자산손상차손환입': '기타손익',
    '투자부동산처분이익': '기타손익',
    '유형자산처분이익': '기타손익',
    '무형자산처분이익': '기타손익',
    '금융보증부채환입액': '기타손익',
    '잡이익': '기타손익',
    '관계기업투자주식처분이익': '기타손익',
    '종속기업투자주식처분이익': '기타손익',
    
    # (7)기타손익 - 비용 항목 (음수로 처리)
    '기타의대손상각비': '기타손익',  # 비용
    '금융보증비용': '기타손익',  # 비용
    '기타의금융수수료': '기타손익',  # 비용
    '무형자산폐기손실': '기타손익',  # 비용
    '무형자산손상차손': '기타손익',  # 비용
    '재고자산폐기손실': '기타손익',  # 비용
    '유형자산처분손실': '기타손익',  # 비용
    '유형자산폐기손실': '기타손익',  # 비용
    '유형자산손상차손': '기타손익',  # 비용
    '무형자산처분손실': '기타손익',  # 비용
    '잡손실': '기타손익',  # 비용
    '소송충당부채전입액': '기타손익',  # 비용
    '종속기업처분손실': '기타손익',  # 비용
    
    # 지분법손익
    '지분법이익': '지분법손익',
    '지분법손실': '지분법손익',  # 비용
    
    # 법인세비용차감전순이익
    '법인세비용차감전순이익': '법인세비용차감전순이익',
    
    # 법인세비용
    '법인세비용': '법인세비용',
}

# 비용 항목들 (음수로 처리해야 함)
EXPENSE_ACCOUNTS = [
    '외화환산손실', '외환차손',
    '파생상품평가손실', '파생상품거래손실',
    '당기손익-공정가치측정금융자산 평가손실', '당기손익인식금융자산처분손실',
    '이자비용',
    '기부금',
    '기타의대손상각비', '금융보증비용', '기타의금융수수료',
    '무형자산폐기손실', '무형자산손상차손', '재고자산폐기손실',
    '유형자산처분손실', '유형자산폐기손실', '유형자산손상차손',
    '무형자산처분손실', '잡손실', '소송충당부채전입액', '종속기업처분손실',
    '지분법손실', '법인세비용'
]

def parse_number(s):
    """문자열에서 숫자 추출 (괄호는 음수)"""
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

def process_csv(filepath, year):
    """CSV 파일 처리"""
    results = {}
    
    with open(filepath, 'r', encoding='cp949') as f:
        lines = f.readlines()
    
    # 분기별 시작 열
    quarter_cols = {'1Q': 0, '2Q': 14, '3Q': 28, '4Q': 42}
    
    # 법인 열 오프셋 (각 분기 시작점 기준)
    entity_offsets = {
        'OC(국내)': 1,
        '중국': 2,
        '홍콩': 3,
        'ST미국': 7,
    }
    
    for line in lines[1:]:
        # CSV 파싱 (쉼표와 따옴표 처리)
        parts = []
        current = ''
        in_quotes = False
        for ch in line:
            if ch == '"':
                in_quotes = not in_quotes
            elif ch == ',' and not in_quotes:
                parts.append(current.strip())
                current = ''
            else:
                current += ch
        parts.append(current.strip())
        
        if len(parts) < 10:
            continue
        
        account_name = parts[0].strip()
        
        # 계정명에서 맵핑 찾기
        mapped_category = None
        matched_account = None
        for acc_name, category in ACCOUNT_MAPPING.items():
            if acc_name in account_name:
                mapped_category = category
                matched_account = acc_name
                break
        
        if not mapped_category:
            continue
        
        if mapped_category not in results:
            results[mapped_category] = {}
        
        is_expense = matched_account in EXPENSE_ACCOUNTS
        
        for q, start_col in quarter_cols.items():
            key = f'{year}_{q}'
            if key not in results[mapped_category]:
                results[mapped_category][key] = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0}
            
            for entity, offset in entity_offsets.items():
                col_idx = start_col + offset
                if col_idx < len(parts):
                    val = parse_number(parts[col_idx])
                    if is_expense:
                        val = -val  # 비용은 음수로
                    results[mapped_category][key][entity] += val
    
    return results

def main():
    # 2024, 2025 데이터 처리
    results_2024 = process_csv('public/2024 분기IS_법인별.csv', '2024')
    results_2025 = process_csv('public/2025_분기IS_법인별.csv', '2025')
    
    # 결과 병합
    all_results = {}
    for category in set(list(results_2024.keys()) + list(results_2025.keys())):
        all_results[category] = {}
        for source in [results_2024, results_2025]:
            if category in source:
                for key, data in source[category].items():
                    all_results[category][key] = data
    
    # 연간 누적 계산
    for category in all_results:
        for year in ['2024', '2025']:
            for q_idx, q in enumerate(['1Q', '2Q', '3Q', '4Q'], 1):
                key = f'{year}_{q}'
                if key not in all_results[category]:
                    continue
                key_year = f'{year}_{q}_Year' if q != '4Q' else f'{year}_Year'
                all_results[category][key_year] = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0}
                
                for entity in ['OC(국내)', '중국', '홍콩', 'ST미국']:
                    total = 0
                    for prev_q in ['1Q', '2Q', '3Q', '4Q'][:q_idx]:
                        prev_key = f'{year}_{prev_q}'
                        if prev_key in all_results[category]:
                            total += all_results[category].get(prev_key, {}).get(entity, 0)
                    all_results[category][key_year][entity] = total
    
    # JavaScript 형식으로 출력
    output_lines = []
    categories = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', 
                  '영업외손익', '지분법손익', '법인세비용차감전순이익', '법인세비용']
    
    for category in categories:
        if category not in all_results:
            continue
        output_lines.append(f"    '{category}': {{")
        periods = [
            '2024_1Q', '2024_1Q_Year', '2024_2Q', '2024_2Q_Year', 
            '2024_3Q', '2024_3Q_Year', '2024_4Q', '2024_Year',
            '2025_1Q', '2025_1Q_Year', '2025_2Q', '2025_2Q_Year',
            '2025_3Q', '2025_3Q_Year', '2025_4Q', '2025_Year'
        ]
        for period in periods:
            if period in all_results[category]:
                data = all_results[category][period]
                oc = round(data.get('OC(국내)', 0) / 1000000)
                cn = round(data.get('중국', 0) / 1000000)
                hk = round(data.get('홍콩', 0) / 1000000)
                us = round(data.get('ST미국', 0) / 1000000)
                gita = round(data.get('기타', 0) / 1000000) if '기타' in data else 0
                output_lines.append(f"      '{period}': {{ 'OC(국내)': {oc}, '중국': {cn}, '홍콩': {hk}, 'ST미국': {us}, '기타': {gita} }},")
        output_lines.append("    },")
    
    # 파일 및 콘솔에 출력
    output = '\n'.join(output_lines)
    print(output)
    
    with open('entity_is_data_v2.txt', 'w', encoding='utf-8') as f:
        f.write(output)
    
    print("\n\n=== 검증: 기타손익 OC(국내) 2025_Year ===")
    if '기타손익' in all_results and '2025_Year' in all_results['기타손익']:
        print(f"원본(원): {all_results['기타손익']['2025_Year'].get('OC(국내)', 0):,.0f}")
        print(f"백만원: {round(all_results['기타손익']['2025_Year'].get('OC(국내)', 0) / 1000000)}")

if __name__ == '__main__':
    main()
