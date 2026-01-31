# extract_entity_is_data.py
# 2024_IS.csv / 2025_IS.csv + 손익계산서_맵핑표.csv 기반으로
# 법인별 손익(entityData용) JSON(C:\temp\fnf25\entity_is_data.json)을 생성합니다.

import os
import json
import math
from typing import Dict, Any, List

import pandas as pd


# ============================================
# 설정
# ============================================

# CSV, 맵핑 파일이 있는 폴더
DATA_DIR = r"C:\Users\AC1160\OneDrive - F&F\바탕 화면\finance_dashboard\fnf25"

IS_CSV_FILES = {
    2024: "2024_IS.csv",
    2025: "2025_IS.csv",
}

MAPPING_CSV = os.path.join(DATA_DIR, "손익계산서_맵핑표.csv")

# 결과 출력 경로
OUTPUT_JSON = r"C:\temp\fnf25\entity_is_data.json"


# ============================================
# 유틸
# ============================================

def norm(s: Any) -> str:
    return str(s).replace(" ", "").replace("\u3000", "")


def to_million(v: float) -> int:
    """원 단위를 백만원 단위 정수로 변환"""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    try:
        return int(round(float(str(v).replace(",", "").replace("(", "-").replace(")", "")) / 1_000_000))
    except Exception:
        return 0


# ============================================
# 맵핑 로드 (판관비 세부계정용)
# ============================================

def load_mapping(mapping_path: str) -> Dict[str, str]:
    df = pd.read_csv(mapping_path, encoding="utf-8")
    col_src = df.columns[0]
    col_grp = df.columns[1]

    mapping_raw: Dict[str, str] = {}
    for _, row in df.iterrows():
        src = str(row[col_src]).strip()
        grp = str(row[col_grp]).strip()
        if not src or src == "nan" or src == "과  목":
            continue
        if not grp or grp == "nan":
            continue

        src_norm = src.replace(" ", "")
        grp_norm = grp.replace(" ", "")

        # 합계행은 제외 (법인세/당기순이익은 여기서 쓰지 않음)
        if src_norm == grp_norm:
            continue

        mapping_raw[src] = grp

    mapping_norm: Dict[str, str] = {}
    for src, grp in mapping_raw.items():
        mapping_norm[norm(src)] = grp.strip()
    return mapping_norm


# (판관비 세부 맵핑 → 대시보드 계정명)
GROUP_TO_ACCOUNT = {
    "(1)인건비": "인건비",
    "(2)광고선전비": "광고선전비",
    "(3)수수료": "수수료",
    "(4)감가상각비": "감가상각비",
    "(5)기타": "기타판관비",
}

TOP_LEVEL_LABELS = {
    "Ⅰ.매출액": "매출액",
    "Ⅱ.매출원가": "매출원가",
    "Ⅲ.매출총이익": "매출총이익",
    "Ⅴ.영업이익": "영업이익",
    "Ⅹ.당기순이익": "당기순이익",
}


TARGET_ACCOUNTS = [
    "매출액",
    "매출원가",
    "매출총이익",
    "인건비",
    "광고선전비",
    "수수료",
    "감가상각비",
    "기타판관비",
    "영업이익",
    "당기순이익",
]


# ============================================
# CSV 헤더 분석 (분기 블록 + 법인 컬럼 인덱스)
# ============================================

def find_quarter_blocks_and_entity_cols(df: pd.DataFrame, year: int):
    """
    df: header=None 로 읽은 CSV
    year: 2024 / 2025

    반환:
      blocks: [ { "cum_idx": ..., "q_idx": ...,
                  "col_OC": ..., "col_shanghai": ..., "col_hk": ...,
                  "col_vn": ..., "col_big": ..., "col_ent": ..., "col_stip": ..., "col_sto": ... } ]
      (1Q,2Q,3Q,4Q 순)
    """
    header_row = df.iloc[1, :]  # 2번째 행
    cum_label = f"{year}년 누적"
    q_label = f"{year}년 당분기"

    cum_indices: List[int] = []
    for j, val in enumerate(header_row):
        if str(val).strip() == cum_label:
            cum_indices.append(j)

    if not cum_indices:
        raise ValueError(f"'{cum_label}' 컬럼을 찾지 못했습니다.")

    cum_indices.sort()

    blocks = []

    for idx in cum_indices:
        # 당분기 인덱스 찾기
        q_idx = None
        for offset in range(1, 5):
            j2 = idx + offset
            if j2 < len(header_row) and str(header_row.iloc[j2]).strip() == q_label:
                q_idx = j2
                break
        if q_idx is None:
            q_idx = idx + 2  # fallback

        # 이 블록의 시작을 추정: "과  목" 이 나오는 위치
        block_start = None
        for j in range(idx, -1, -1):
            if str(header_row.iloc[j]).strip() == "과목" or str(header_row.iloc[j]).strip() == "과  목":
                block_start = j
                break
        if block_start is None:
            block_start = 0

        # ★ 수정: 열 구조는 다음과 같음
        # 과  목,별도재무제표,IFRS(F&F),IFRS(Shanghai),IFRS(HK),IFRS(베트남),IFRS(빅텐츠),IFRS(엔터), STIP , STO , Dr , Cr ,IFRS(단순합계),Dr,Cr,202X년 누적,...
        col_OC = block_start + 1         # 별도재무제표 (F&F 국내)
        col_FF_ifrs = block_start + 2    # F&F IFRS (사용 안 함)
        col_sh = block_start + 3         # F&F Shanghai IFRS
        col_hk = block_start + 4         # FnF HONGKONG IFRS
        col_vn = block_start + 5         # F&F 베트남 IFRS
        col_big = block_start + 6        # 빅텐츠 IFRS
        col_ent = block_start + 7        # 엔터테인머트 IFRS
        col_stip = block_start + 8       # STIP
        col_sto = block_start + 9        # STO

        blocks.append({
            "cum_idx": idx,
            "q_idx": q_idx,
            "col_OC": col_OC,              # ★ 수정: 별도재무제표
            "col_shanghai": col_sh,
            "col_hk": col_hk,
            "col_vn": col_vn,
            "col_big": col_big,
            "col_ent": col_ent,
            "col_stip": col_stip,
            "col_sto": col_sto,
        })

    return blocks

# ============================================
# 한 연도 CSV → 계정별/법인별 누적 값 추출
# ============================================

def extract_year_entity_cumulative(year: int, mapping_norm: Dict[str, str]) -> Dict[str, Dict[int, Dict[str, Dict[str, float]]]]:
    """
    반환 구조:
      out[account][quarter][entity_bucket] = 누적 금액(원 단위, float)
      - account ∈ TARGET_ACCOUNTS
      - quarter ∈ {1,2,3,4}
      - entity_bucket ∈ {"OC(국내)","China","홍콩","Sergio","기타"}
    """
    csv_name = IS_CSV_FILES[year]
    csv_path = os.path.join(DATA_DIR, csv_name)
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"{csv_path} 파일을 찾을 수 없습니다.")

    df = pd.read_csv(csv_path, header=None, encoding="utf-8")
    blocks = find_quarter_blocks_and_entity_cols(df, year)

    # 계정명 → row index
    label_to_row: Dict[str, int] = {}
    for i in range(2, df.shape[0]):  # 3행부터 계정행
        label = str(df.iat[i, 0]).strip()
        if not label or label == "nan":
            continue
        label_to_row[norm(label)] = i

    # 결과 구조 초기화
    out: Dict[str, Dict[int, Dict[str, Dict[str, float]]]] = {
        acc: {q: {"OC(국내)": 0.0, "China": 0.0, "홍콩": 0.0, "Sergio": 0.0, "기타": 0.0} for q in range(1, 5)}
        for acc in TARGET_ACCOUNTS
    }

    # 1) 상위 계정(매출액/매출원가/매출총이익/영업이익/당기순이익): TOP_LEVEL_LABELS 직접 사용
    for src_label, acc_name in TOP_LEVEL_LABELS.items():
        row_idx = label_to_row.get(norm(src_label))
        if row_idx is None:
            continue

        for q_idx, blk in enumerate(blocks, start=1):
            def val(col):
                v = df.iat[row_idx, col]
                if isinstance(v, str):
                    v = v.replace(",", "").replace("(", "-").replace(")", "")
                try:
                    return float(v)
                except Exception:
                    return 0.0

            v_OC = val(blk["col_OC"])        # ★ 수정: 별도재무제표
            v_sh = val(blk["col_shanghai"])
            v_hk = val(blk["col_hk"])
            v_vn = val(blk["col_vn"])
            v_big = val(blk["col_big"])
            v_ent = val(blk["col_ent"])
            v_stip = val(blk["col_stip"])
            v_sto = val(blk["col_sto"])
            v_sergio = v_stip + v_sto
            v_etc = v_vn + v_big + v_ent

            bucket = out[acc_name][q_idx]
            bucket["OC(국내)"] += v_OC      # ★ 수정: col_OC 사용
            bucket["China"] += v_sh
            bucket["홍콩"] += v_hk
            bucket["Sergio"] += v_sergio
            bucket["기타"] += v_etc

    # 2) 판관비 세부 계정(인건비/광고/수수료/감가상각/기타판관비): 맵핑 사용
    for i in range(2, df.shape[0]):
        raw_label = str(df.iat[i, 0]).strip()
        if not raw_label or raw_label == "nan":
            continue
        key = mapping_norm.get(norm(raw_label))
        if not key:
            continue

        group = key
        acc_name = GROUP_TO_ACCOUNT.get(group)
        if not acc_name:
            continue  # 우리가 원하는 판관비 계정이 아님

        for q_idx, blk in enumerate(blocks, start=1):
            def val(col):
                v = df.iat[i, col]  # ★ 수정: row_idx → i
                if isinstance(v, str):
                    v = v.replace(",", "").replace("(", "-").replace(")", "")
                try:
                    return float(v)
                except Exception:
                    return 0.0

            v_OC = val(blk["col_OC"])        # ★ 수정: 별도재무제표
            v_sh = val(blk["col_shanghai"])
            v_hk = val(blk["col_hk"])
            v_vn = val(blk["col_vn"])
            v_big = val(blk["col_big"])
            v_ent = val(blk["col_ent"])
            v_stip = val(blk["col_stip"])
            v_sto = val(blk["col_sto"])
            v_sergio = v_stip + v_sto
            v_etc = v_vn + v_big + v_ent

            bucket = out[acc_name][q_idx]
            bucket["OC(국내)"] += v_OC      # ★ 수정: col_OC 사용
            bucket["China"] += v_sh
            bucket["홍콩"] += v_hk
            bucket["Sergio"] += v_sergio
            bucket["기타"] += v_etc

    return out


# ============================================
# 누적 → 분기 변환 + JS용 구조로 정리
# ============================================

def build_period_entity_data(year: int, cum_by_quarter: Dict[str, Dict[int, Dict[str, Dict[str, float]]]]):
    """
    cum_by_quarter[account][quarter][bucket] = 누적(원)
    반환:
      result[account][periodKey][bucket] = 백만원 단위 정수
    """
    result: Dict[str, Dict[str, Dict[str, int]]] = {acc: {} for acc in TARGET_ACCOUNTS}

    for acc in TARGET_ACCOUNTS:
        prev_cum = {b: 0.0 for b in ["OC(국내)", "China", "홍콩", "Sergio", "기타"]}
        for q in (1, 2, 3, 4):
            curr_cum = cum_by_quarter[acc][q]

            # 분기 값 = 이번누적 - 이전누적
            quarter_vals: Dict[str, int] = {}
            for b in prev_cum.keys():
                diff = curr_cum[b] - prev_cum[b]
                quarter_vals[b] = to_million(diff)

            # 누적 값
            cum_vals: Dict[str, int] = {b: to_million(curr_cum[b]) for b in curr_cum.keys()}

            q_key = f"{year}_{q}Q"
            if q == 4:
                cum_key = f"{year}_Year"
            else:
                cum_key = f"{year}_{q}Q_Year"

            result[acc][q_key] = quarter_vals
            result[acc][cum_key] = cum_vals

            prev_cum = curr_cum

    return result


# ============================================
# 메인
# ============================================

def main():
    mapping_norm = load_mapping(MAPPING_CSV)

    # account → periodKey → bucket → 값(백만원)
    final: Dict[str, Dict[str, Dict[str, int]]] = {acc: {} for acc in TARGET_ACCOUNTS}

    for year in (2024, 2025):
        cum = extract_year_entity_cumulative(year, mapping_norm)
        period_data = build_period_entity_data(year, cum)
        for acc in TARGET_ACCOUNTS:
            final[acc].update(period_data[acc])

    # 출력 폴더 생성
    out_dir = os.path.dirname(OUTPUT_JSON)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    print("✅ entity별 손익 JSON 생성 완료")
    print(f" - 파일: {OUTPUT_JSON}")
    print(" - 구조: entity_is_data[계정][기간키][OC(국내)/China/홍콩/Sergio/기타] = 금액(백만원)")


if __name__ == "__main__":
    main()
