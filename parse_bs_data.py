# -*- coding: utf-8 -*-
"""
재무상태표 데이터 파싱 스크립트
맵핑표를 기준으로 BS CSV 데이터를 요약하고 법인별 상세 데이터를 JSON으로 출력합니다.
"""

import csv
import json
import re
from collections import defaultdict

# 맵핑 정의 (성격별 분류)
ACCOUNT_MAPPING = {
    # 자산 - 유동자산
    '현금및현금성자산': '현금성자산',
    '기타유동금융자산': '금융자산',
    '통화선도': '금융자산',
    '(유동)당기손익-공정가치측정금융자산': '금융자산',
    '매출채권': '매출채권',
    '매출채권대손충당금': '매출채권',
    '미수금': '기타자산',
    '미수금대손충당금': '기타자산',
    '유동성보증금': '기타자산',
    '현재가치할인차금(유동)': '기타자산',
    '유동리스채권(순투자)': '기타자산',
    '단기대여금': '대여금',
    '단기대여금대손충당금': '대여금',
    '미수수익': '기타자산',
    '미수수익대손충당금': '기타자산',
    '선급부가세': '기타자산',
    '선급금': '기타자산',
    '선급금대손충당금': '기타자산',
    '선급비용': '기타자산',
    '미완성프로그램': '기타자산',
    '완성프로그램': '기타자산',
    '완성프로그램-대손충당금': '기타자산',
    '출연료선급금': '기타자산',
    '출연료선급금-대손충당금': '기타자산',
    # 재고자산
    '상품': '재고자산',
    '상품평가손실충당금': '재고자산',
    '제품': '재고자산',
    '제품평가손실충당금': '재고자산',
    '재공품': '재고자산',
    '재공품평가손실충당금': '재고자산',
    '원재료': '재고자산',
    '원재료평가손실충당금': '재고자산',
    '저장품': '재고자산',
    '부재료': '재고자산',
    '미착품': '재고자산',
    '미완성프로그램_재고': '재고자산',
    '완성프로그램_재고': '재고자산',
    '(3)반품회수자산': '기타자산',
    '(4)당기법인세자산': '기타자산',
    '파생상품자산': '금융자산',
    '매각예정비유동자산': '기타자산',
    # 비유동자산 - 투자자산
    '장기금융상품': '금융자산',
    '장기대여금': '대여금',
    '장기대여금대손충당금': '대여금',
    '당기손익-공정가치측정금융자산': '금융자산',
    '기타포괄손익-공정가치측정금융자산': '금융자산',
    '상각후원가 금융자산': '금융자산',
    '관계기업및종속기업투자': '투자자산',
    '영업지원보증금대손충당금': '기타자산',
    # 유형자산
    '토지': '유,무형자산',
    '건물': '유,무형자산',
    '건물감가상각누계액': '유,무형자산',
    '건물부속설비': '유,무형자산',
    '건물부속설비감가상각누계액': '유,무형자산',
    '구축물': '유,무형자산',
    '구축물감가상각누계액': '유,무형자산',
    '기계장치': '유,무형자산',
    '기계감가상각누계액': '유,무형자산',
    '차량운반구': '유,무형자산',
    '차량감가상각누계액': '유,무형자산',
    '임차시설물': '유,무형자산',
    '임차시설물감가상각누계액': '유,무형자산',
    '금형': '유,무형자산',
    '금형감가상각누계액': '유,무형자산',
    '공기구비품': '유,무형자산',
    '공기구비품감가상각누계액': '유,무형자산',
    '건설중인자산(유형)': '유,무형자산',
    # 투자부동산
    '토지(투자부동산)': '유,무형자산',
    '건물(투자부동산)': '유,무형자산',
    '건물감가상각누계액(투자부동산)': '유,무형자산',
    '건물부속설비(투자부동산)': '유,무형자산',
    '건물부속설비감가상각누계액(투자부동산)': '유,무형자산',
    # 무형자산
    '라이선스': '유,무형자산',
    '브랜드': '유,무형자산',
    '소프트웨어': '유,무형자산',
    '기타의무형자산': '유,무형자산',
    '건설중인자산(무형)': '유,무형자산',
    '상표권': '유,무형자산',
    '회원권': '유,무형자산',
    '암호화자산': '유,무형자산',
    '영업권': '유,무형자산',
    # 사용권자산
    '사용권자산': '사용권자산',
    '사용권자산 감가상각누계액': '사용권자산',
    # 기타비유동자산
    '보증금': '기타자산',
    '현재가치할인차금(임차보증금)': '기타자산',
    '장기매출채권': '매출채권',
    '장기미수금': '기타자산',
    '장기선급금': '기타자산',
    '장기선급금-대손충당금': '기타자산',
    '리스채권(순투자)': '기타자산',
    '장기선급비용': '기타자산',
    '확정급여자산': '기타자산',
    '이연법인세자산(비유동)': '기타자산',
    # 부채 - 유동부채
    '매입채무': '매입채무',
    '미지급금': '미지급금',
    '유동성장기예수보증금': '보증금',
    '현재가치할인차금(유동임차)': '보증금',
    '금융보증부채(유동)': '기타부채',
    '단기차입금': '차입금',
    '예수금': '기타부채',
    '미지급비용': '기타부채',
    '선수금': '기타부채',
    '선수수익': '기타부채',
    '유동충당부채': '기타부채',
    '기타금융부채': '금융부채',
    '통화선도부채': '금융부채',
    '미지급법인세': '기타부채',
    '유동성복구충당부채': '기타부채',
    '부가세예수금': '기타부채',
    '임대보증금': '보증금',
    '유동리스부채': '리스부채',
    '매각예정비유동부채': '기타부채',
    # 비유동부채
    '장기차입금': '차입금',
    '장기미지급금': '미지급금',
    '장기성예수보증금': '보증금',
    '현재가치할인차금': '보증금',
    '리스부채': '리스부채',
    '복구충당부채': '기타부채',
    '금융보증부채': '기타부채',
    '소송충당부채': '기타부채',
    '기타충당부채': '기타부채',
    '금융부채(비지배지분)': '금융부채',
    '퇴직급여충당부채': '기타부채',
    '퇴직연금운용자산': '기타부채',
    '국민연금전환금': '기타부채',
    '이연법인세부채': '기타부채',
    # 자본
    '보통주자본금': '자본',
    '주식발행초과금': '자본',
    '기타자본잉여금': '자본',
    '자기주식': '자본',
    '주식선택권': '자본',
    '지분법자본변동': '자본',
    '부의지분법자본변동': '자본',
    'FVOCI평가이익': '자본',
    '매도가능증권평가손실': '자본',
    '자산재평가이익': '자본',
    '해외사업환산손익': '자본',
    '법정적립금': '자본',
    '임의적립금': '자본',
    '미처분이익잉여금': '자본',
}

# 법인명 매핑 (CSV 헤더 -> 표시명)
ENTITY_MAP = {
    'F&F': 'F&F',
    'F&F ': 'F&F',
    ' F&F ': 'F&F',
    'F&F Shanghai': '중국',
    'F&F Shanghai ': '중국',
    ' F&F Shanghai ': '중국',
    'FnF HONGKONG': '홍콩',
    'FnF HONGKONG ': '홍콩',
    ' FnF HONGKONG ': '홍콩',
    'F&F 베트남': '베트남',
    'F&F 베트남 ': '베트남',
    ' F&F 베트남 ': '베트남',
    '빅텐츠': '빅텐츠',
    '빅텐츠 ': '빅텐츠',
    ' 빅텐츠 ': '빅텐츠',
    '엔터테인먼트': '엔터테인먼트',
    '엔터테인먼트 ': '엔터테인먼트',
    ' 엔터테인먼트 ': '엔터테인먼트',
    '세르지오': 'ST(미국)',
    '세르지오 ': 'ST(미국)',
    ' 세르지오 ': 'ST(미국)',
}

# 요약 과목 순서 (자산)
ASSET_CATEGORIES = ['현금성자산', '금융자산', '매출채권', '대여금', '재고자산', '투자자산', '유,무형자산', '사용권자산', '기타자산']
# 요약 과목 순서 (부채)
LIABILITY_CATEGORIES = ['매입채무', '미지급금', '보증금', '차입금', '리스부채', '금융부채', '기타부채']
# 요약 과목 순서 (자본)
EQUITY_CATEGORIES = ['자본']

def parse_number(value):
    """숫자 문자열을 정수로 변환"""
    if not value or value.strip() == '':
        return 0
    # 쉼표 제거하고 숫자로 변환
    clean = value.replace(',', '').replace('"', '').strip()
    if clean == '':
        return 0
    try:
        return int(float(clean))
    except ValueError:
        return 0

def read_csv_with_encoding(filepath):
    """여러 인코딩을 시도하여 CSV 파일 읽기"""
    encodings = ['cp949', 'euc-kr', 'utf-8', 'utf-8-sig']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                content = f.read()
                return content, enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError(f"Cannot read file {filepath} with any encoding")

def parse_bs_csv(filepath, year):
    """BS CSV 파일 파싱
    
    CSV 구조:
    헤더: 분기명, F&F, F&F Shanghai, FnF HONGKONG, F&F 베트남, 빅텐츠, 엔터테인먼트, 세르지오, 단순합계, 연결분개 DR, 연결분개 CR, [Dr, Cr,] 연결값, 전년비교값, [다음분기명], ...
    
    2024 BS: 컬럼 순서 - 분기명(0), 법인들(1-7), 단순합계(8), 연결분개DR(9), 연결분개CR(10), 연결값(11), 전년비교(12), ...
    2025 BS: 컬럼 순서 - 분기명(0), 법인들(1-7), 단순합계(8), 연결분개DR(9), 연결분개CR(10), Dr(11), Cr(12), 연결값(13), 전년비교(14), ...
    """
    content, encoding = read_csv_with_encoding(filepath)
    lines = content.strip().split('\n')
    
    # 헤더 파싱
    header_line = lines[0]
    reader = csv.reader([header_line])
    headers = next(reader)
    
    # 각 분기 시작 위치 찾기
    quarter_starts = []
    for idx, header in enumerate(headers):
        header_clean = header.strip()
        if re.match(r'\d{2}\.\d[Q|q]', header_clean):
            quarter_starts.append((idx, header_clean))
    
    # 분기별 컬럼 범위 계산
    quarters_info = []
    for i, (start_idx, q_name) in enumerate(quarter_starts):
        if i + 1 < len(quarter_starts):
            end_idx = quarter_starts[i + 1][0] - 1
        else:
            end_idx = len(headers) - 1
        
        # 분기 이름 정규화 (25.1Q -> 2025_1Q)
        match = re.match(r'(\d{2})\.(\d)[Q|q]', q_name)
        if match:
            year_short = match.group(1)
            quarter_num = match.group(2)
            period_key = f"20{year_short}_{quarter_num}Q"
            
            # 법인별 컬럼은 분기명 다음 7개
            entity_indices = {
                'F&F': start_idx + 1,
                'F&F Shanghai': start_idx + 2,
                'FnF HONGKONG': start_idx + 3,
                'F&F 베트남': start_idx + 4,
                '빅텐츠': start_idx + 5,
                '엔터테인먼트': start_idx + 6,
                '세르지오': start_idx + 7,
            }
            
            # 연결값 컬럼 찾기 (날짜 형식)
            consolidated_idx = None
            for j in range(start_idx + 8, end_idx + 1):
                if j < len(headers):
                    h = headers[j].strip()
                    if re.match(r'\d{4}년\s*\d{1,2}월\s*\d{1,2}일', h):
                        consolidated_idx = j
                        break
            
            quarters_info.append({
                'period_key': period_key,
                'start_idx': start_idx,
                'end_idx': end_idx,
                'entity_indices': entity_indices,
                'consolidated_idx': consolidated_idx
            })
    
    # 데이터 행 파싱
    data = {}
    
    for line in lines[1:]:
        reader = csv.reader([line])
        try:
            row = next(reader)
        except:
            continue
        
        if not row or len(row) == 0:
            continue
        
        # 각 분기별로 첫 번째 컬럼에서 계정명 추출
        for q_info in quarters_info:
            account_col_idx = q_info['start_idx']
            if account_col_idx >= len(row):
                continue
            
            account_name = row[account_col_idx].strip()
            if not account_name:
                continue
            
            # 합계/총계 행 스킵
            skip_accounts = ['Ⅰ.유동자산', 'Ⅱ.비유동자산', '자산총계', '부채', 'Ⅰ.유동부채', 'Ⅱ.비유동부채', '부채총계', 
                           '자본', 'Ⅰ.자본금', 'Ⅱ.자본잉여금', 'Ⅲ.자본조정', 'Ⅲ.기타포괄손익누계액', 'Ⅳ.이익잉여금', 
                           'Ⅴ. 비지배지분', '자본총계', '부채 및 자본총계',
                           '(1)당좌자산', '(2)재고자산', '(1)투자자산', '(2)유형자산', '(3)투자부동산', 
                           '(4)무형자산', '(5)사용권자산', '(6)기타비유동자산', '(6)금융보증자산(유동)']
            
            if account_name in skip_accounts:
                continue
            
            # 맵핑된 성격별 분류 확인
            category = ACCOUNT_MAPPING.get(account_name)
            if not category:
                continue  # 맵핑 없으면 스킵
            
            if account_name not in data:
                data[account_name] = {'category': category, 'periods': {}}
            
            period_key = q_info['period_key']
            if period_key not in data[account_name]['periods']:
                data[account_name]['periods'][period_key] = {'entities': {}, 'consolidated': 0}
            
            # 법인별 값 파싱
            for entity, idx in q_info['entity_indices'].items():
                if idx < len(row):
                    value = parse_number(row[idx])
                    entity_display = ENTITY_MAP.get(entity, entity)
                    data[account_name]['periods'][period_key]['entities'][entity_display] = value
            
            # 연결 값 파싱
            if q_info['consolidated_idx'] and q_info['consolidated_idx'] < len(row):
                data[account_name]['periods'][period_key]['consolidated'] = parse_number(row[q_info['consolidated_idx']])
            
            break  # 첫 번째 분기에서만 계정명 확인하고, 같은 행에서 모든 분기 데이터 파싱
    
    # 모든 분기 데이터를 한 번에 파싱하도록 수정
    data = {}
    
    for line in lines[1:]:
        reader = csv.reader([line])
        try:
            row = next(reader)
        except:
            continue
        
        if not row or len(row) == 0:
            continue
        
        # 첫 번째 분기의 계정명 (모든 분기가 같은 계정)
        account_name = row[quarters_info[0]['start_idx']].strip() if quarters_info else ''
        if not account_name:
            continue
        
        # 합계/총계 행 스킵
        skip_accounts = ['Ⅰ.유동자산', 'Ⅱ.비유동자산', '자산총계', '부채', 'Ⅰ.유동부채', 'Ⅱ.비유동부채', '부채총계', 
                       '자본', 'Ⅰ.자본금', 'Ⅱ.자본잉여금', 'Ⅲ.자본조정', 'Ⅲ.기타포괄손익누계액', 'Ⅳ.이익잉여금', 
                       'Ⅴ. 비지배지분', '자본총계', '부채 및 자본총계',
                       '(1)당좌자산', '(2)재고자산', '(1)투자자산', '(2)유형자산', '(3)투자부동산', 
                       '(4)무형자산', '(5)사용권자산', '(6)기타비유동자산', '(6)금융보증자산(유동)']
        
        if account_name in skip_accounts:
            continue
        
        # 맵핑된 성격별 분류 확인
        category = ACCOUNT_MAPPING.get(account_name)
        if not category:
            continue  # 맵핑 없으면 스킵
        
        if account_name not in data:
            data[account_name] = {'category': category, 'periods': {}}
        
        # 모든 분기 데이터 파싱
        for q_info in quarters_info:
            period_key = q_info['period_key']
            if period_key not in data[account_name]['periods']:
                data[account_name]['periods'][period_key] = {'entities': {}, 'consolidated': 0}
            
            # 법인별 값 파싱
            for entity, idx in q_info['entity_indices'].items():
                if idx < len(row):
                    value = parse_number(row[idx])
                    entity_display = ENTITY_MAP.get(entity, entity)
                    data[account_name]['periods'][period_key]['entities'][entity_display] = value
            
            # 연결 값 파싱
            if q_info['consolidated_idx'] and q_info['consolidated_idx'] < len(row):
                data[account_name]['periods'][period_key]['consolidated'] = parse_number(row[q_info['consolidated_idx']])
    
    return data

def aggregate_by_category(data_2024, data_2025):
    """성격별 분류로 데이터 집계"""
    # 모든 기간 수집
    all_periods = set()
    for acc_data in data_2024.values():
        all_periods.update(acc_data['periods'].keys())
    for acc_data in data_2025.values():
        all_periods.update(acc_data['periods'].keys())
    
    # 법인 목록
    entities = ['F&F', '중국', '홍콩', '베트남', '빅텐츠', '엔터테인먼트', 'ST(미국)']
    
    # 집계 결과
    aggregated = {}
    
    # 모든 카테고리 초기화
    all_categories = ASSET_CATEGORIES + LIABILITY_CATEGORIES + EQUITY_CATEGORIES
    for cat in all_categories:
        aggregated[cat] = {}
        for period in sorted(all_periods):
            aggregated[cat][period] = {
                'consolidated': 0,
                'entities': {e: 0 for e in entities}
            }
    
    # 데이터 집계
    for data_source in [data_2024, data_2025]:
        for acc_name, acc_data in data_source.items():
            category = acc_data['category']
            if category not in aggregated:
                continue
            
            for period, period_data in acc_data['periods'].items():
                if period not in aggregated[category]:
                    aggregated[category][period] = {
                        'consolidated': 0,
                        'entities': {e: 0 for e in entities}
                    }
                
                aggregated[category][period]['consolidated'] += period_data.get('consolidated', 0)
                
                for entity, value in period_data.get('entities', {}).items():
                    if entity in aggregated[category][period]['entities']:
                        aggregated[category][period]['entities'][entity] += value
    
    return aggregated

def get_detailed_accounts(data_2024, data_2025):
    """상세 계정별 데이터 (증감 분석용)"""
    detailed = {}
    
    for data_source in [data_2024, data_2025]:
        for acc_name, acc_data in data_source.items():
            if acc_name not in detailed:
                detailed[acc_name] = {
                    'category': acc_data['category'],
                    'periods': {}
                }
            
            for period, period_data in acc_data['periods'].items():
                if period not in detailed[acc_name]['periods']:
                    detailed[acc_name]['periods'][period] = {
                        'consolidated': 0,
                        'entities': {}
                    }
                
                # 연결 값
                detailed[acc_name]['periods'][period]['consolidated'] = period_data.get('consolidated', 0)
                
                # 법인별 값
                for entity, value in period_data.get('entities', {}).items():
                    detailed[acc_name]['periods'][period]['entities'][entity] = value
    
    return detailed

def convert_to_millions(data):
    """원 단위를 백만원 단위로 변환"""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if key in ['consolidated'] or isinstance(value, (int, float)):
                result[key] = round(value / 1000000, 0) if isinstance(value, (int, float)) else value
            else:
                result[key] = convert_to_millions(value)
        return result
    elif isinstance(data, list):
        return [convert_to_millions(item) for item in data]
    elif isinstance(data, (int, float)):
        return round(data / 1000000, 0)
    else:
        return data

def main():
    # CSV 파일 경로
    bs_2024_path = '2024_BS.csv'
    bs_2025_path = '2025_BS.csv'
    
    print("2024 BS 파일 파싱 중...")
    data_2024 = parse_bs_csv(bs_2024_path, 2024)
    
    print("2025 BS 파일 파싱 중...")
    data_2025 = parse_bs_csv(bs_2025_path, 2025)
    
    print("성격별 분류로 집계 중...")
    aggregated = aggregate_by_category(data_2024, data_2025)
    
    print("상세 계정 데이터 수집 중...")
    detailed = get_detailed_accounts(data_2024, data_2025)
    
    # 백만원 단위로 변환
    aggregated_millions = convert_to_millions(aggregated)
    detailed_millions = convert_to_millions(detailed)
    
    # 결과 구조화
    result = {
        'bsSummaryData': aggregated_millions,
        'bsDetailData': detailed_millions
    }
    
    # JSON 파일로 저장
    output_path = 'bs_financial_data.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n데이터가 {output_path}에 저장되었습니다.")
    
    # 요약 출력
    print("\n=== 집계된 카테고리 ===")
    for cat in ASSET_CATEGORIES + LIABILITY_CATEGORIES + EQUITY_CATEGORIES:
        if cat in aggregated_millions:
            periods = list(aggregated_millions[cat].keys())
            if periods:
                latest = sorted(periods)[-1]
                print(f"  {cat}: {aggregated_millions[cat][latest]['consolidated']:,.0f} 백만원 ({latest})")

if __name__ == '__main__':
    main()
