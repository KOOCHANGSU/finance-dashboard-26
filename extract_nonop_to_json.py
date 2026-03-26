# -*- coding: utf-8 -*-
"""
연결 손익계산서 영업외손익 데이터 추출 스크립트
2024_IS.csv, 2025_IS.csv 파일에서 영업외손익 관련 계정을 추출하여
incomeStatementData 형식의 JSON으로 출력합니다.

사용법: python extract_nonop_to_json.py
출력: nonop_data.json
"""

import json
import os

def parse_num(s):
    """숫자 문자열을 파싱 (괄호는 음수, 콤마 제거)"""
    if not s or s.strip() == '' or s.strip() == '0':
        return 0
    s = s.replace(' ', '').replace(',', '')
    is_negative = '(' in s and ')' in s
    s = s.replace('(', '').replace(')', '')
    try:
        num = float(s)
    except:
        return 0
    return -num if is_negative else num

def to_millions(val):
    """원 단위를 백만원 단위로 변환 (반올림)"""
    return round(val / 1000000)

def parse_csv_line(line):
    """CSV 행을 파싱 (따옴표 내 콤마 처리)"""
    parts = []
    current = ''
    in_quote = False
    
    for char in line:
        if char == '"':
            in_quote = not in_quote
        elif char == ',' and not in_quote:
            parts.append(current.replace('"', '').strip())
            current = ''
        else:
            current += char
    parts.append(current.replace('"', '').strip())
    
    return parts

def read_csv_file(filename):
    """CSV 파일을 읽어서 행 리스트로 반환 (EUC-KR 인코딩)"""
    encodings = ['euc-kr', 'cp949', 'utf-8']
    for enc in encodings:
        try:
            with open(filename, 'r', encoding=enc) as f:
                return f.read().split('\n')
        except:
            continue
    raise Exception(f"Cannot read file: {filename}")

# 분기별 열 오프셋 (각 분기 17열씩)
# 각 분기: [분기명, 법인7개, 단순합계, 연결조정2개, 누적, 전분기누적, 당분기, 전년누적, 전년전분기, 전년당분기]
# 누적 = offset+11, 당분기 = offset+13
QUARTER_OFFSETS = {
    '1Q': 0,
    '2Q': 17,
    '3Q': 34,
    '4Q': 51
}

def extract_quarter_data(parts, quarter_offset):
    """분기 데이터 추출 (누적, 당분기)"""
    try:
        cumulative = to_millions(parse_num(parts[quarter_offset + 11]))
        quarterly = to_millions(parse_num(parts[quarter_offset + 13]))
    except IndexError:
        cumulative = 0
        quarterly = 0
    return {'cumulative': cumulative, 'quarterly': quarterly}

def process_is_file(filename):
    """손익계산서 CSV 파일에서 영업외손익 계정 추출"""
    lines = read_csv_file(filename)
    
    # 추출할 계정 목록
    non_op_accounts = [
        '이자수익', '이자비용',
        '외화환산이익', '외화환산손실', '외환차익', '외환차손',
        '배당금수익', '기부금',
        '지분법이익', '지분법손실',
        '파생상품평가이익', '파생상품평가손실', '파생상품거래이익', '파생상품거래손실',
        '잡이익', '잡손실',
        '당기손익-공정가치측정금융자산 평가이익', '당기손익인식금융자산처분이익',
        '당기손익-공정가치측정금융자산 평가손실', '당기손익인식금융자산처분손실',
        'Ⅵ.영업외수익', 'Ⅶ.영업외비용'
    ]
    
    results = {q: {} for q in ['1Q', '2Q', '3Q', '4Q']}
    
    for line in lines:
        parts = parse_csv_line(line)
        if len(parts) < 65:
            continue
            
        for acc in non_op_accounts:
            for q in ['1Q', '2Q', '3Q', '4Q']:
                offset = QUARTER_OFFSETS[q]
                if len(parts) > offset and parts[offset] == acc:
                    results[q][acc] = extract_quarter_data(parts, offset)
    
    return results

def calculate_non_op_items(data):
    """영업외손익 하위 계정 계산"""
    calculated = {}
    
    for q in ['1Q', '2Q', '3Q', '4Q']:
        calculated[q] = {'cumulative': {}, 'quarterly': {}}
        
        for period in ['cumulative', 'quarterly']:
            # 외환손익 = 외환차익 + 외화환산이익 - 외환차손 - 외화환산손실
            calculated[q][period]['외환손익'] = (
                data[q].get('외환차익', {}).get(period, 0) +
                data[q].get('외화환산이익', {}).get(period, 0) -
                data[q].get('외환차손', {}).get(period, 0) -
                data[q].get('외화환산손실', {}).get(period, 0)
            )
            
            # 선물환손익 = 파생상품평가이익 + 파생상품거래이익 - 파생상품평가손실 - 파생상품거래손실
            calculated[q][period]['선물환손익'] = (
                data[q].get('파생상품평가이익', {}).get(period, 0) +
                data[q].get('파생상품거래이익', {}).get(period, 0) -
                data[q].get('파생상품평가손실', {}).get(period, 0) -
                data[q].get('파생상품거래손실', {}).get(period, 0)
            )
            
            # 금융상품손익
            calculated[q][period]['금융상품손익'] = (
                data[q].get('당기손익-공정가치측정금융자산 평가이익', {}).get(period, 0) +
                data[q].get('당기손익인식금융자산처분이익', {}).get(period, 0) -
                data[q].get('당기손익-공정가치측정금융자산 평가손실', {}).get(period, 0) -
                data[q].get('당기손익인식금융자산처분손실', {}).get(period, 0)
            )
            
            # 이자손익 = 이자수익 - 이자비용
            calculated[q][period]['이자손익'] = (
                data[q].get('이자수익', {}).get(period, 0) -
                data[q].get('이자비용', {}).get(period, 0)
            )
            
            # 배당수익
            calculated[q][period]['배당수익'] = data[q].get('배당금수익', {}).get(period, 0)
            
            # 기부금 = -기부금(비용)
            calculated[q][period]['기부금'] = -data[q].get('기부금', {}).get(period, 0)
            
            # 기타손익 = 잡이익 - 잡손실
            calculated[q][period]['기타손익'] = (
                data[q].get('잡이익', {}).get(period, 0) -
                data[q].get('잡손실', {}).get(period, 0)
            )
            
            # 지분법손익 = 지분법이익 - 지분법손실
            calculated[q][period]['지분법손익'] = (
                data[q].get('지분법이익', {}).get(period, 0) -
                data[q].get('지분법손실', {}).get(period, 0)
            )
            
            # 영업외손익 = (영업외수익 - 영업외비용) - 지분법손익 (지분법손익은 별도 표시)
            total_nonop = (
                data[q].get('Ⅵ.영업외수익', {}).get(period, 0) -
                data[q].get('Ⅶ.영업외비용', {}).get(period, 0)
            )
            calculated[q][period]['영업외손익'] = total_nonop - calculated[q][period]['지분법손익']
    
    return calculated

def generate_income_statement_data(calc_2024, calc_2025):
    """incomeStatementData 형식으로 변환"""
    result = {}
    
    accounts = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익', '영업외손익']
    
    for year, calc in [('2024', calc_2024), ('2025', calc_2025)]:
        for q in ['1Q', '2Q', '3Q', '4Q']:
            # 분기 키
            q_key = f'{year}_{q}'
            result[q_key] = {}
            for acc in accounts:
                result[q_key][acc] = calc[q]['quarterly'][acc]
            
            # 누적 키 (연간용)
            year_key = f'{year}_{q}_Year'
            result[year_key] = {}
            for acc in accounts:
                result[year_key][acc] = calc[q]['cumulative'][acc]
        
        # 연간 합계 (4Q 누적과 동일)
        year_total_key = f'{year}_Year'
        result[year_total_key] = {}
        for acc in accounts:
            result[year_total_key][acc] = calc['4Q']['cumulative'][acc]
    
    return result

def main():
    # 파일 경로
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_2024 = os.path.join(script_dir, 'public', '2024_IS.csv')
    file_2025 = os.path.join(script_dir, 'public', '2025_IS.csv')
    
    print("=" * 60)
    print("연결 손익계산서 영업외손익 데이터 추출")
    print("=" * 60)
    
    # 2024년 데이터 처리
    print("\n[2024년 데이터 처리 중...]")
    data_2024 = process_is_file(file_2024)
    calc_2024 = calculate_non_op_items(data_2024)
    
    # 2025년 데이터 처리
    print("[2025년 데이터 처리 중...]")
    data_2025 = process_is_file(file_2025)
    calc_2025 = calculate_non_op_items(data_2025)
    
    # 결과 출력
    print("\n" + "=" * 80)
    print("2024년 연결 영업외손익 (백만원)")
    print("=" * 80)
    print(f"{'분기':<8} {'외환손익':>10} {'선물환':>10} {'금융상품':>10} {'이자':>10} {'배당':>8} {'기부금':>8} {'기타':>10} {'지분법':>10} {'합계':>10}")
    print("-" * 80)
    for q in ['1Q', '2Q', '3Q', '4Q']:
        d = calc_2024[q]['quarterly']
        print(f"{q} 분기  {d['외환손익']:>10,} {d['선물환손익']:>10,} {d['금융상품손익']:>10,} {d['이자손익']:>10,} {d['배당수익']:>8,} {d['기부금']:>8,} {d['기타손익']:>10,} {d['지분법손익']:>10,} {d['영업외손익']:>10,}")
    print("-" * 80)
    for q in ['1Q', '2Q', '3Q', '4Q']:
        d = calc_2024[q]['cumulative']
        print(f"{q} 누적  {d['외환손익']:>10,} {d['선물환손익']:>10,} {d['금융상품손익']:>10,} {d['이자손익']:>10,} {d['배당수익']:>8,} {d['기부금']:>8,} {d['기타손익']:>10,} {d['지분법손익']:>10,} {d['영업외손익']:>10,}")
    
    print("\n" + "=" * 80)
    print("2025년 연결 영업외손익 (백만원)")
    print("=" * 80)
    print(f"{'분기':<8} {'외환손익':>10} {'선물환':>10} {'금융상품':>10} {'이자':>10} {'배당':>8} {'기부금':>8} {'기타':>10} {'지분법':>10} {'합계':>10}")
    print("-" * 80)
    for q in ['1Q', '2Q', '3Q', '4Q']:
        d = calc_2025[q]['quarterly']
        print(f"{q} 분기  {d['외환손익']:>10,} {d['선물환손익']:>10,} {d['금융상품손익']:>10,} {d['이자손익']:>10,} {d['배당수익']:>8,} {d['기부금']:>8,} {d['기타손익']:>10,} {d['지분법손익']:>10,} {d['영업외손익']:>10,}")
    print("-" * 80)
    for q in ['1Q', '2Q', '3Q', '4Q']:
        d = calc_2025[q]['cumulative']
        print(f"{q} 누적  {d['외환손익']:>10,} {d['선물환손익']:>10,} {d['금융상품손익']:>10,} {d['이자손익']:>10,} {d['배당수익']:>8,} {d['기부금']:>8,} {d['기타손익']:>10,} {d['지분법손익']:>10,} {d['영업외손익']:>10,}")
    
    # JSON 생성
    income_statement_data = generate_income_statement_data(calc_2024, calc_2025)
    
    # JSON 파일 저장
    output_file = os.path.join(script_dir, 'nonop_data.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(income_statement_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n[완료] JSON 파일 저장: {output_file}")
    print("\n" + "=" * 60)
    print("incomeStatementData 업데이트용 코드 (복사해서 사용)")
    print("=" * 60)
    
    # JavaScript 코드 형태로 출력
    accounts = ['외환손익', '선물환손익', '금융상품손익', '이자손익', '배당수익', '기부금', '기타손익', '지분법손익', '영업외손익']
    
    print("\n// incomeStatementData 영업외손익 업데이트")
    for key, values in income_statement_data.items():
        print(f"// '{key}': {{ {', '.join([f'{acc}: {values[acc]}' for acc in accounts])} }}")

if __name__ == '__main__':
    main()
