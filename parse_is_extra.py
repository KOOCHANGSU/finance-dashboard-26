# -*- coding: utf-8 -*-
import csv
import re

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

def extract_row_data(filepath, year, account_patterns):
    """특정 계정의 법인별 데이터 추출"""
    results = {}
    
    with open(filepath, 'r', encoding='cp949') as f:
        lines = f.readlines()
    
    # 분기별 시작 열
    quarter_cols = {'1Q': 0, '2Q': 14, '3Q': 28, '4Q': 42}
    
    # 법인 열 오프셋
    entity_offsets = {
        'OC(국내)': 1,
        '중국': 2,
        '홍콩': 3,
        'ST미국': 7,
    }
    
    for line in lines[1:]:
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
        
        for pattern, result_key in account_patterns.items():
            if pattern in account_name:
                if result_key not in results:
                    results[result_key] = {}
                
                for q, start_col in quarter_cols.items():
                    key = f'{year}_{q}'
                    if key not in results[result_key]:
                        results[result_key][key] = {}
                    
                    for entity, offset in entity_offsets.items():
                        col_idx = start_col + offset
                        if col_idx < len(parts):
                            val = parse_number(parts[col_idx])
                            results[result_key][key][entity] = round(val / 1000000)
                break
    
    return results

def main():
    accounts = {
        '지분법이익': '지분법손익_이익',
        '지분법손실': '지분법손익_손실',
        '법인세비용차감전순이익': '법인세비용차감전순이익',
        '법인세비용': '법인세비용',
    }
    
    results_2024 = extract_row_data('public/2024 분기IS_법인별.csv', '2024', accounts)
    results_2025 = extract_row_data('public/2025_분기IS_법인별.csv', '2025', accounts)
    
    # 지분법손익 합산 (이익 - 손실)
    all_results = {}
    
    # 지분법손익
    all_results['지분법손익'] = {}
    for year in ['2024', '2025']:
        source = results_2024 if year == '2024' else results_2025
        for q in ['1Q', '2Q', '3Q', '4Q']:
            key = f'{year}_{q}'
            profit = source.get('지분법손익_이익', {}).get(key, {})
            loss = source.get('지분법손익_손실', {}).get(key, {})
            all_results['지분법손익'][key] = {}
            for entity in ['OC(국내)', '중국', '홍콩', 'ST미국']:
                p = profit.get(entity, 0)
                l = loss.get(entity, 0)
                all_results['지분법손익'][key][entity] = p - l  # 이익 - 손실
            all_results['지분법손익'][key]['기타'] = 0
    
    # 법인세비용차감전순이익
    all_results['법인세비용차감전순이익'] = {}
    for year in ['2024', '2025']:
        source = results_2024 if year == '2024' else results_2025
        for q in ['1Q', '2Q', '3Q', '4Q']:
            key = f'{year}_{q}'
            data = source.get('법인세비용차감전순이익', {}).get(key, {})
            all_results['법인세비용차감전순이익'][key] = {**data, '기타': 0}
    
    # 법인세비용
    all_results['법인세비용'] = {}
    for year in ['2024', '2025']:
        source = results_2024 if year == '2024' else results_2025
        for q in ['1Q', '2Q', '3Q', '4Q']:
            key = f'{year}_{q}'
            data = source.get('법인세비용', {}).get(key, {})
            all_results['법인세비용'][key] = {**data, '기타': 0}
    
    # 연간 누적 계산
    for category in ['지분법손익', '법인세비용차감전순이익', '법인세비용']:
        for year in ['2024', '2025']:
            for q_idx, q in enumerate(['1Q', '2Q', '3Q', '4Q'], 1):
                key = f'{year}_{q}'
                key_year = f'{year}_{q}_Year' if q != '4Q' else f'{year}_Year'
                all_results[category][key_year] = {}
                
                for entity in ['OC(국내)', '중국', '홍콩', 'ST미국', '기타']:
                    total = 0
                    for prev_q in ['1Q', '2Q', '3Q', '4Q'][:q_idx]:
                        prev_key = f'{year}_{prev_q}'
                        total += all_results[category].get(prev_key, {}).get(entity, 0)
                    all_results[category][key_year][entity] = total
    
    # JavaScript 형식으로 출력
    for category in ['지분법손익', '법인세비용차감전순이익', '법인세비용']:
        print(f"\n    '{category}': {{")
        periods = [
            '2024_1Q', '2024_1Q_Year', '2024_2Q', '2024_2Q_Year', 
            '2024_3Q', '2024_3Q_Year', '2024_4Q', '2024_Year',
            '2025_1Q', '2025_1Q_Year', '2025_2Q', '2025_2Q_Year',
            '2025_3Q', '2025_3Q_Year', '2025_4Q', '2025_Year'
        ]
        for period in periods:
            if period in all_results[category]:
                data = all_results[category][period]
                print(f"      '{period}': {{ 'OC(국내)': {data.get('OC(국내)', 0)}, '중국': {data.get('중국', 0)}, '홍콩': {data.get('홍콩', 0)}, 'ST미국': {data.get('ST미국', 0)}, '기타': {data.get('기타', 0)} }},")
        print("    },")

if __name__ == '__main__':
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
