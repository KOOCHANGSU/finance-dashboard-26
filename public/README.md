# FY26 1Q FNF 외환손익 — 임베드 OUTPUT

> 외부 실적대시보드 담당자에게 전달하는 패키지. 검증 섹션은 자동 제외됨.

## 파일 구성

| 파일/폴더 | 용도 |
|:--|:--|
| `dashboard.html` | 임베드용 메인 HTML (단독 실행 가능) |
| `_next/` | 차트·스타일·런타임 정적 자원 (HTML과 함께 배포 필수) |
| `data.json` | 데이터 source (외부 시스템 자체 렌더링용) |

## 전달 방법 — 3가지 옵션

### 옵션 A: 폴더 통째 zip 전달 (가장 단순) ★권장
1. 본 폴더 통째로 zip 압축 (`embed_FY26_1Q.zip`)
2. 받는 쪽에서 임의 경로에 압축 해제
3. `dashboard.html` 더블클릭 또는 사내 정적 웹서버에 업로드
4. 외부 대시보드에 `<iframe src="dashboard.html" width="100%" height="2400">` 형태로 임베드

### 옵션 B: 사내 웹서버 호스팅 + iframe URL
1. 본 폴더를 사내 정적 호스팅(Vercel/Netlify/사내 NGINX/GitHub Pages 등)에 업로드
2. 외부 대시보드에서:
```html
<iframe
  src="https://internal-host/fnf-fx-26-1q/dashboard.html"
  width="100%" height="2400" style="border:0"
  title="FY26 1Q FNF 외환손익">
</iframe>
```
3. 분기 갱신 시 새 빌드만 덮어쓰면 자동 반영

### 옵션 C: 데이터(JSON)만 전달 + 외부 자체 시각화
- `data.json`만 전달
- 외부 시스템(React/Vue/Tableau 등)이 자체 컴포넌트로 렌더링
- 데이터 스키마 문서 별도 요청 가능

## 동작 확인

`dashboard.html`을 브라우저에서 직접 열어 다음 확인:
- 헤더 제목 "FY26 1Q FNF 외환손익"
- 4 KPI 카드 (순외환손익 +144.04억 등)
- 분기별 손익 추이 차트 + 일별 환율 라인 차트
- ① 거래손익 ② 평가손익 ③ YoY ④ 환율 4개 표
- 맨 하단에 "※ 참조 [실무 검증]" 토글이 **없어야 함** (임베드 모드에서 제외됨)

## 갱신 절차

새 분기 데이터 확정 후:
```bash
cd FX_Report
python scripts/prepare_dashboard_data.py    # 데이터 재집계
python scripts/build_embed.py               # 임베드 OUTPUT 재생성
```
→ `output/embed/` 갱신 → 다시 zip 또는 웹서버 덮어쓰기.

---
빌드 일시: 2026-04-29 14:05
