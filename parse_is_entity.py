# -*- coding: utf-8 -*-
import csv
import re
import json

# 맵핑표 기반 계정 분류
# 영업외수익 / 영업외비용 세부 계정
ACCOUNT_MAPPING = {
    '이자수익': '이자손익',
    '이자비용': '이자손익',
    '외화환산이익': '외환손익',
    '외환차익': '외환손익',
    '외화환산손실': '외환손익',
    '외환차손': '외환손익',
    '배당금수익': '배당수익',
    '파생상품평가이익': '선물환손익',
    '파생상품거래이익': '선물환손익',
    '파생상품평가손실': '선물환손익',
    '파생상품거래손실': '선물환손익',
    '당기손익-공정가치측정금융자산 평가이익': '금융상품손익',
    '당기손익인식금융자산처분이익': '금융상품손익',
    '당기손익-공정가치측정금융자산 평가손실': '금융상품손익',
    '당기손익인식금융자산처분손실': '금융상품손익',
    '기부금': '기부금',
    '지분법이익': '지분법손익',
    '지분법손실': '지분법손익',
}

# 기타손익에 포함되는 계정들
GITA_ACCOUNTS = ['수수료수익', '임대료수익', '대손충당금환입', '무형자산손상차손환입', 
                 '투자부동산처분이익', '유형자산처분이익', '무형자산처분이익',
                 '금융보증부채환입액', '잡이익', '관계기업투자주식처분이익', '종속기업투자주식처분이익',
                 '기타의대손상각비', '금융보증비용', '기타의금융수수료', '무형자산폐기손실',
                 '무형자산손상차손', '재고자산폐기손실', '유형자산처분손실', '유형자산폐기손실',
                 '유형자산손상차손', '무형자산처분손실', '잡손실', '소송충당부채전입액', '종속기업처분손실',
                 '염가매수차익']

def parse_number(s):
    """문자열에서 숫자 추출 (괄호는 음수)"""
    if not s or s.strip() in ['', '-', '0']:
        return 0
    s = s.strip().replace(' ', '')
    # 괄호로 감싸진 숫자는 음수
    neg = False
    if s.startswith('(') and s.endswith(')'):
        neg = True
        s = s[1:-1]
    # 쉼표 제거
    s = s.replace(',', '')
    try:
        val = float(s)
        return -val if neg else val
    except:
        return 0

def process_csv(filepath, year):
    """CSV 파일을 읽어서 법인별 데이터 추출"""
    results = {}
    
    with open(filepath, 'r', encoding='cp949') as f:
        lines = f.readlines()
    
    # 헤더 파싱 - 첫 번째 줄
    header = lines[0].strip().split(',')
    
    # 분기별 시작 열 찾기
    quarter_cols = {}
    for i, h in enumerate(header):
        if h.strip().startswith(f'{year[-2:]}.1Q') or h.strip() == f'{year[-2:]}.1Q':
            quarter_cols['1Q'] = i
        elif h.strip().startswith(f'{year[-2:]}.2Q') or h.strip() == f'{year[-2:]}.2Q':
            quarter_cols['2Q'] = i
        elif h.strip().startswith(f'{year[-2:]}.3Q') or h.strip() == f'{year[-2:]}.3Q':
            quarter_cols['3Q'] = i
        elif h.strip().startswith(f'{year[-2:]}.4Q') or h.strip() == f'{year[-2:]}.4Q':
            quarter_cols['4Q'] = i
    
    print(f"Found quarters in {filepath}: {quarter_cols}")
    
    # 법인 열 오프셋 (각 분기 시작점 기준)
    # F&F, F&F Shanghai, FnF HONGKONG, F&F 베트남, 빈텐츠, 엔터테인먼트, 세르지오, 단순합계
    entity_offsets = {
        'OC(국내)': 1,  # F&F
        '중국': 2,      # F&F Shanghai
        '홍콩': 3,      # FnF HONGKONG
        'ST미국': 7,    # 세르지오
    }
    
    # 추출할 계정 목록
    target_accounts = {
        '이자수익': '영업외수익',
        '이자비용': '영업외비용',
        '외화환산이익': '영업외수익',
        '외환차익': '영업외수익',
        '외화환산손실': '영업외비용',
        '외환차손': '영업외비용',
        '배당금수익': '영업외수익',
        '파생상품평가이익': '영업외수익',
        '파생상품거래이익': '영업외수익',
        '파생상품평가손실': '영업외비용',
        '파생상품거래손실': '영업외비용',
        '당기손익-공정가치측정금융자산 평가이익': '영업외수익',
        '당기손익인식금융자산처분이익': '영업외수익',
        '당기손익-공정가치측정금융자산 평가손실': '영업외비용',
        '당기손익인식금융자산처분손실': '영업외비용',
        '기부금': '영업외비용',
        '지분법이익': '영업외수익',
        '지분법손실': '영업외비용',
        '수수료수익': '영업외수익',
        '잡이익': '영업외수익',
        '잡손실': '영업외비용',
        '유형자산처분손실': '영업외비용',
        '유형자산폐기손실': '영업외비용',
        '기타의대손상각비': '영업외비용',
        '대손충당금환입': '영업외수익',
    }
    
    # 결과를 분기별, 계정별로 저장
    for q in ['1Q', '2Q', '3Q', '4Q']:
        results[f'{year}_{q}'] = {}
    
    # CSV 파싱
    for line in lines[1:]:
        # CSV 파싱 (쉼표 포함 숫자 처리)
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
        
        # 계정명 추출 (첫 번째 열)
        account_name = parts[0].strip()
        
        # 대상 계정인지 확인
        if account_name not in target_accounts:
            continue
        
        # 각 분기별 법인 데이터 추출
        for q, start_col in quarter_cols.items():
            key = f'{year}_{q}'
            category = ACCOUNT_MAPPING.get(account_name, '기타손익')
            
            if category not in results[key]:
                results[key][category] = {'OC(국내)': 0, '중국': 0, '홍콩': 0, 'ST미국': 0, '기타': 0}
            
            # 수익/비용 구분
            is_expense = target_accounts[account_name] == '영업외비용'
            
            for entity, offset in entity_offsets.items():
                col_idx = start_col + offset
                if col_idx < len(parts):
                    val = parse_number(parts[col_idx])
                    # 비용은 음수로 처리 (손익에서 차감)
                    if is_expense:
                        val = -val
                    results[key][category][entity] += val
    
    return results

def main():
    # 2024년 데이터
    results_2024 = process_csv('public/2024 분기IS_법인별.csv', '2024')
    
    # 2025년 데이터  
    results_2025 = process_csv('public/2025_분기IS_법인별.csv', '2025')
    
    # 결과 병합
    all_results = {**results_2024, **results_2025}
    
    # 연간 누적 계산
    for year in ['2024', '2025']:
        for category in ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익']:
            # 1Q_Year = 1Q
            key_1q = f'{year}_1Q'
            key_1q_year = f'{year}_1Q_Year'
            if key_1q in all_results and category in all_results[key_1q]:
                if key_1q_year not in all_results:
                    all_results[key_1q_year] = {}
                all_results[key_1q_year][category] = all_results[key_1q][category].copy()
            
            # 2Q_Year = 1Q + 2Q
            key_2q = f'{year}_2Q'
            key_2q_year = f'{year}_2Q_Year'
            if key_2q in all_results and category in all_results.get(key_2q, {}):
                if key_2q_year not in all_results:
                    all_results[key_2q_year] = {}
                all_results[key_2q_year][category] = {}
                for entity in ['OC(국내)', '중국', '홍콩', 'ST미국', '기타']:
                    val1 = all_results.get(key_1q, {}).get(category, {}).get(entity, 0)
                    val2 = all_results.get(key_2q, {}).get(category, {}).get(entity, 0)
                    all_results[key_2q_year][category][entity] = val1 + val2
            
            # 3Q_Year = 1Q + 2Q + 3Q
            key_3q = f'{year}_3Q'
            key_3q_year = f'{year}_3Q_Year'
            if key_3q in all_results and category in all_results.get(key_3q, {}):
                if key_3q_year not in all_results:
                    all_results[key_3q_year] = {}
                all_results[key_3q_year][category] = {}
                for entity in ['OC(국내)', '중국', '홍콩', 'ST미국', '기타']:
                    val1 = all_results.get(key_1q, {}).get(category, {}).get(entity, 0)
                    val2 = all_results.get(key_2q, {}).get(category, {}).get(entity, 0)
                    val3 = all_results.get(key_3q, {}).get(category, {}).get(entity, 0)
                    all_results[key_3q_year][category][entity] = val1 + val2 + val3
            
            # Year = 4분기까지 누적
            key_4q = f'{year}_4Q'
            key_year = f'{year}_Year'
            if key_4q in all_results and category in all_results.get(key_4q, {}):
                if key_year not in all_results:
                    all_results[key_year] = {}
                all_results[key_year][category] = {}
                for entity in ['OC(국내)', '중국', '홍콩', 'ST미국', '기타']:
                    val1 = all_results.get(key_1q, {}).get(category, {}).get(entity, 0)
                    val2 = all_results.get(key_2q, {}).get(category, {}).get(entity, 0)
                    val3 = all_results.get(key_3q, {}).get(category, {}).get(entity, 0)
                    val4 = all_results.get(key_4q, {}).get(category, {}).get(entity, 0)
                    all_results[key_year][category][entity] = val1 + val2 + val3 + val4
    
    # JavaScript 형식으로 출력
    print("\n// 영업외손익 하위 계정 법인별 데이터 (단위: 백만원)")
    categories = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익']
    
    for category in categories:
        print(f"\n    '{category}': {{")
        periods = [
            '2024_1Q', '2024_1Q_Year', '2024_2Q', '2024_2Q_Year', 
            '2024_3Q', '2024_3Q_Year', '2024_4Q', '2024_Year',
            '2025_1Q', '2025_1Q_Year', '2025_2Q', '2025_2Q_Year',
            '2025_3Q', '2025_3Q_Year', '2025_4Q', '2025_Year'
        ]
        for period in periods:
            if period in all_results and category in all_results[period]:
                data = all_results[period][category]
                # 백만원 단위로 변환
                vals = {k: round(v / 1000000) for k, v in data.items()}
                print(f"      '{period}': {{ 'OC(국내)': {vals.get('OC(국내)', 0)}, '중국': {vals.get('중국', 0)}, '홍콩': {vals.get('홍콩', 0)}, 'ST미국': {vals.get('ST미국', 0)}, '기타': {vals.get('기타', 0)} }},")
        print("    },")

if __name__ == '__main__':
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
    
    # 파일로도 저장
    with open('entity_is_extra.txt', 'w', encoding='utf-8') as f:
        import sys
        old_stdout = sys.stdout
        sys.stdout = f
        main()
        sys.stdout = old_stdout
