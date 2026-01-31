# extract_is_data.py
# 2024/2025 손익계산서 정산표(Excel) + 손익계산서_맵핑표.csv 기반으로
# 대시보드용 incomeStatementData 구조(분기 + 누적, 백만원 단위)를 생성하는 스크립트입니다.

import os
import json
import math
from typing import Dict, Any

import pandas as pd

# ============================================
# 설정: 파일 경로
# ============================================

# 1) 손익계산서 엑셀 파일이 있는 폴더 (필요시 수정)
DATA_DIR = r"C:\temp\fnf25"

# 2) 엑셀 파일 이름 (DATA_DIR 아래에 있다고 가정)
IS_FILES = {
    2024: "2024 정산표(IS).xlsx",
    2025: "2025 정산표(IS).xlsx",
}

# 3) 맵핑 파일 (이 스크립트와 같은 폴더에 있다고 가정)
MAPPING_CSV = "손익계산서_맵핑표.csv"

# 4) 출력 JSON 파일
OUTPUT_JSON = "is_data.json"


# ============================================
# 유틸 함수
# ============================================

def norm(s: Any) -> str:
    """공백 제거 + 문자열 변환"""
    return str(s).replace(" ", "").replace("\u3000", "")


def to_million(v: float) -> int:
    """원 단위 숫자를 백만원 단위 정수로 변환"""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    try:
        return int(round(float(v) / 1_000_000))
    except Exception:
        return 0


# ============================================
# 1. 맵핑표 로드
# ============================================

def load_mapping(mapping_path: str):
    """
    손익계산서_맵핑표.csv 를 읽어
    - src_label: 정산표 계정명
    - group: 맵핑 분류 (예: Ⅰ.매출액, (1)인건비, (3)수수료, (1)외환손익 등)
    으로 딕셔너리 반환
    """
    df = pd.read_csv(mapping_path, encoding="utf-8")
    # 첫 행: "연결 I/S 정산표,대시보드분류"
    col_src = df.columns[0]
    col_grp = df.columns[1]

    mapping = {}
    for _, row in df.iterrows():
        src = str(row[col_src]).strip()
        grp = str(row[col_grp]).strip()
        if not src or src == "nan" or src == "과  목":
            continue
        if not grp or grp == "nan":
            continue
        mapping[src] = grp
    return mapping


# 대시보드 최종 계정명 매핑
GROUP_TO_ACCOUNT = {
    "Ⅰ.매출액": "매출액",
    "Ⅱ.매출원가": "매출원가",
    "Ⅲ.매출총이익": "매출총이익",
    "Ⅳ.판매비와관리비": "판매비와관리비",

    "(1)인건비": "인건비",
    "(2)광고선전비": "광고선전비",
    "(3)수수료": "수수료",
    "(4)감가상각비": "감가상각비",
    "(5)기타": "기타판관비",
    "(6)기부금": "기부금",
    "(7)기타손익": "기타손익",

    "Ⅴ.영업이익": "영업이익",
    "Ⅵ.영업외손익": "영업외손익",

    "(1)외환손익": "외환손익",
    "(2)선물환손익": "선물환손익",
    "(3)금융상품손익": "금융상품손익",
    "(4)이자손익": "이자손익",
    "(5)배당수익": "배당수익",

    "VII. 지분법손익": "지분법손익",
    "VII.지분법손익": "지분법손익",

    "VIII. 법인세비용차감전순이익": "법인세비용차감전순이익",
    "Ⅷ.법인세용차감전순이익": "법인세비용차감전순이익",  # 오타 대비

    "Ⅸ.법인세비용": "법인세비용",
    "Ⅹ.당기순이익": "당기순이익",
}


# ============================================
# 2. 엑셀 시트에서 '연결IS'(누적) 컬럼 찾기
# ============================================

def find_consolidated_col(df: pd.DataFrame) -> int:
    """
    시트 내에서 '연결IS' 가 포함된 컬럼 인덱스를 찾는다.
    (윗부분 5~6행 정도를 이어붙여 검색)
    """
    rows_to_scan = min(8, df.shape[0])
    for j in range(df.shape[1]):
        head = "".join(str(df.iat[r, j]) for r in range(rows_to_scan))
        if "연결IS" in head or "연결 IS" in head:
            return j
    # 못 찾으면 마지막 쪽에 있을 가능성이 높으므로 fallback
    return df.shape[1] - 1


# ============================================
# 3. 연도별 누적 데이터 추출
# ============================================

def extract_year_cumulative(year: int, mapping: Dict[str, str]) -> Dict[int, Dict[str, float]]:
    """
    year (2024/2025)에 대해
    - 각 분기(1~4)의 누적 연결금액(원 단위)을
      { quarter: { account: value } } 형태로 반환
    """
    filename = IS_FILES[year]
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path} 파일을 찾을 수 없습니다.")

    # 분기별 시트명: '1Q IS', '2Q IS', ...
    quarters = [1, 2, 3, 4]
    result: Dict[int, Dict[str, float]] = {}

    for q in quarters:
        sheet_name = f"{q}Q IS"
        df = pd.read_excel(path, sheet_name=sheet_name, header=None)
        df = df.fillna("")

        col_conn = find_consolidated_col(df)

        # 첫 컬럼(계정명) 기준으로 row index 맵 구성
        label_to_row: Dict[str, int] = {}
        for i in range(df.shape[0]):
            label = str(df.iat[i, 0]).strip()
            if not label:
                continue
            key = norm(label)
            if key not in label_to_row:
                label_to_row[key] = i

        quarter_data: Dict[str, float] = {}

        # 맵핑표를 순회하면서 각 계정 -> 최종 대시보드 계정으로 합산
        for src_label, group in mapping.items():
            group = group.strip()
            target = GROUP_TO_ACCOUNT.get(group)
            if not target:
                continue  # 대시보드 대상이 아닌 맵핑은 무시

            row_idx = label_to_row.get(norm(src_label))
            if row_idx is None:
                continue

            v = df.iat[row_idx, col_conn]
            # 숫자 클리닝
            if isinstance(v, str):
                v = v.replace(",", "").replace("(", "-").replace(")", "")
            try:
                num = float(v)
            except Exception:
                num = 0.0

            quarter_data[target] = quarter_data.get(target, 0.0) + num

        result[q] = quarter_data

    return result


# ============================================
# 4. 누적 → 분기값 변환 및 출력 구조 생성
# ============================================

def build_period_data(year: int, cum_by_quarter: Dict[int, Dict[str, float]]) -> Dict[str, Dict[str, int]]:
    """
    누적 데이터를 이용해
    - 분기(period: 'YYYY_1Q' 등)
    - 누적(period: 'YYYY_1Q_Year', ..., 'YYYY_Year')
    키로 구성된 백만원 단위 딕셔너리를 생성
    """
    periods: Dict[str, Dict[str, int]] = {}

    all_accounts = set()
    for q_data in cum_by_quarter.values():
        all_accounts.update(q_data.keys())

    prev_cum: Dict[str, float] = {acc: 0.0 for acc in all_accounts}

    for q in (1, 2, 3, 4):
        cum = cum_by_quarter.get(q, {})
        # 누적값(원 단위)
        curr_cum = {acc: cum.get(acc, 0.0) for acc in all_accounts}

        # 분기값 = 이번누적 - 직전누적
        q_vals: Dict[str, int] = {}
        for acc in all_accounts:
            diff = curr_cum[acc] - prev_cum.get(acc, 0.0)
            q_vals[acc] = to_million(diff)

        # 누적값(백만원)
        cum_vals: Dict[str, int] = {acc: to_million(curr_cum[acc]) for acc in all_accounts}

        # 키 이름 구성
        quarter_key = f"{year}_{q}Q"
        if q == 4:
            cum_key = f"{year}_Year"
        else:
            cum_key = f"{year}_{q}Q_Year"

        periods[quarter_key] = q_vals
        periods[cum_key] = cum_vals

        prev_cum = curr_cum

    return periods


# ============================================
# 메인 실행
# ============================================

def main():
    # 1) 맵핑 로드
    mapping = load_mapping(MAPPING_CSV)

    output: Dict[str, Dict[str, int]] = {}

    # 2) 연도별 추출
    for year in (2024, 2025):
        cum = extract_year_cumulative(year, mapping)
        periods = build_period_data(year, cum)
        output.update(periods)

    # 3) JSON 저장
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[OK] Complete: {os.path.abspath(OUTPUT_JSON)}")
    print("Key examples:")
    print(" - 2024_1Q, 2024_1Q_Year, 2024_2Q, ..., 2024_Year")
    print(" - 2025_1Q, 2025_1Q_Year, ..., 2025_Year")
    print("Unit: Million KRW (integer)")


if __name__ == "__main__":
    main()