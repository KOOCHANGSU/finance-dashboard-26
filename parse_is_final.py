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

# 계정 분류 (수익은 양수, 비용은 음수로 처리)
ACCOUNT_CONFIG = {
    # (1)외환손익
    '외화환산이익': ('외환손익', 1),
    '외환차익': ('외환손익', 1),
    '외화환산손실': ('외환손익', -1),
    '외환차손': ('외환손익', -1),
    
    # (2)선물환손익
    '파생상품평가이익': ('선물환손익', 1),
    '파생상품거래이익': ('선물환손익', 1),
    '파생상품평가손실': ('선물환손익', -1),
    '파생상품거래손실': ('선물환손익', -1),
    
    # (3)금융상품손익
    '단기매매증권평가이익': ('금융상품손익', 1),
    '단기매매증권처분이익': ('금융상품손익', 1),
    '당기손익-공정가치측정금융자산 평가이익': ('금융상품손익', 1),
    '당기손익인식금융자산처분이익': ('금융상품손익', 1),
    '당기손익-공정가치측정금융자산 평가손실': ('금융상품손익', -1),
    '당기손익인식금융자산처분손실': ('금융상품손익', -1),
    
    # (4)이자손익
    '이자수익': ('이자손익', 1),
    '이자비용': ('이자손익', -1),
    
    # (5)배당수익
    '배당금수익': ('배당수익', 1),
    
    # (6)기부금
    '기부금': ('기부금', -1),
    
    # (7)기타손익 - 수익
    '수수료수익': ('기타손익', 1),
    '임대료수익': ('기타손익', 1),
    '대손충당금환입': ('기타손익', 1),
    '금융보증부채환입액': ('기타손익', 1),
    '잡이익': ('기타손익', 1),
    '투자부동산처분이익': ('기타손익', 1),
    '유형자산처분이익': ('기타손익', 1),
    '무형자산처분이익': ('기타손익', 1),
    '관계기업투자주식처분이익': ('기타손익', 1),
    '종속기업투자주식처분이익': ('기타손익', 1),
    
    # (7)기타손익 - 비용
    '기타의대손상각비': ('기타손익', -1),
    '금융보증비용': ('기타손익', -1),
    '기타의금융수수료': ('기타손익', -1),
    '무형자산폐기손실': ('기타손익', -1),
    '재고자산폐기손실': ('기타손익', -1),
    '유형자산처분손실': ('기타손익', -1),
    '유형자산폐기손실': ('기타손익', -1),
    '무형자산처분손실': ('기타손익', -1),
    '잡손실': ('기타손익', -1),
    '소송충당부채전입액': ('기타손익', -1),
    '종속기업처분손실': ('기타손익', -1),
    
    # 지분법손익
    '지분법이익': ('지분법손익', 1),
    '지분법손실': ('지분법손익', -1),
    
    # 법인세비용차감전순이익
    '법인세비용차감전순이익': ('법인세비용차감전순이익', 1),
    
    # 법인세비용
    '법인세비용': ('법인세비용', 1),  # 비용이지만 원본 그대로 표시
}

def process_csv(filepath, year):
    with open(filepath, 'r', encoding='cp949') as f:
        reader = csv.reader(f)
        rows = list(reader)
    
    # OC(국내), 중국, 홍콩, ST미국의 열 위치
    # 1Q: 열1, 2, 3, 7
    # 2Q: 열15, 16, 17, 21
    # 3Q: 열29, 30, 31, 35
    # 4Q: 열43, 44, 45, 49
    quarter_entity_cols = {
        '1Q': {'OC(국내)': 1, '중국': 2, '홍콩': 3, 'ST미국': 7},
        '2Q': {'OC(국내)': 15, '중국': 16, '홍콩': 17, 'ST미국': 21},
        '3Q': {'OC(국내)': 29, '중국': 30, '홍콩': 31, 'ST미국': 35},
        '4Q': {'OC(국내)': 43, '중국': 44, '홍콩': 45, 'ST미국': 49},
    }
    
    results = {}
    
    for row in rows:
        if len(row) < 50:
            continue
        account = row[0].strip()
        
        # 계정 매칭 (가장 긴 매칭 우선)
        matched = None
        for acc_name in sorted(ACCOUNT_CONFIG.keys(), key=len, reverse=True):
            if acc_name in account:
                matched = acc_name
                break
        
        if not matched:
            continue
        
        category, sign = ACCOUNT_CONFIG[matched]
        
        if category not in results:
            results[category] = {}
        
        for q, entity_cols in quarter_entity_cols.items():
            key = f'{year}_{q}'
            if key not in results[category]:
                results[category][key] = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0}
            
            for entity, col in entity_cols.items():
                if col < len(row):
                    val = parse_number(row[col]) * sign
                    results[category][key][entity] += val
    
    return results

def main():
    results_2024 = process_csv('public/2024 분기IS_법인별.csv', '2024')
    results_2025 = process_csv('public/2025_분기IS_법인별.csv', '2025')
    
    # 병합
    all_results = {}
    for source in [results_2024, results_2025]:
        for category, data in source.items():
            if category not in all_results:
                all_results[category] = {}
            all_results[category].update(data)
    
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
                            total += all_results[category][prev_key].get(entity, 0)
                    all_results[category][key_year][entity] = total
    
    # 영업외손익 합계 계산
    all_results['영업외손익'] = {}
    sub_categories = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익']
    for year in ['2024', '2025']:
        for q in ['1Q', '2Q', '3Q', '4Q']:
            key = f'{year}_{q}'
            all_results['영업외손익'][key] = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0}
            for cat in sub_categories:
                if cat in all_results and key in all_results[cat]:
                    for entity in ['OC(국내)', '중국', '홍콩', 'ST미국']:
                        all_results['영업외손익'][key][entity] += all_results[cat][key].get(entity, 0)
        
        # 연간 누적
        for q_idx, q in enumerate(['1Q', '2Q', '3Q', '4Q'], 1):
            key_year = f'{year}_{q}_Year' if q != '4Q' else f'{year}_Year'
            all_results['영업외손익'][key_year] = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0}
            for entity in ['OC(국내)', '중국', '홍콩', 'ST미국']:
                total = 0
                for prev_q in ['1Q', '2Q', '3Q', '4Q'][:q_idx]:
                    prev_key = f'{year}_{prev_q}'
                    total += all_results['영업외손익'][prev_key].get(entity, 0)
                all_results['영업외손익'][key_year][entity] = total
    
    # JavaScript 출력
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
    
    output = '\n'.join(output_lines)
    print(output)
    
    with open('entity_is_final.txt', 'w', encoding='utf-8') as f:
        f.write(output)
    
    # 검증
    print("\n\n=== 검증 ===")
    print(f"기타손익 OC(국내) 2025_Year: {round(all_results['기타손익']['2025_Year']['OC(국내)']/1000000)}백만원")
    print(f"영업외손익 OC(국내) 2025_Year: {round(all_results['영업외손익']['2025_Year']['OC(국내)']/1000000)}백만원")

if __name__ == '__main__':
    main()
