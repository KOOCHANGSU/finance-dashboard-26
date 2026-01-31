# 대시보드 배포 가이드

## 1. 프로덕션 빌드

### 빌드 실행
```bash
npm run build
```

빌드가 완료되면 `dist` 폴더에 최적화된 파일들이 생성됩니다.

### 빌드 결과 확인
```bash
npm run preview
```

로컬에서 빌드된 결과물을 미리 볼 수 있습니다.

## 2. 배포 옵션

### 옵션 1: Netlify (추천 - 가장 간단)

1. **Netlify 계정 생성**: https://www.netlify.com
2. **배포 방법**:
   - 방법 A: 드래그 앤 드롭
     - `dist` 폴더를 Netlify 대시보드에 드래그 앤 드롭
   - 방법 B: GitHub 연동
     - GitHub에 프로젝트 푸시
     - Netlify에서 GitHub 저장소 연결
     - 빌드 설정:
       - Build command: `npm run build`
       - Publish directory: `dist`

3. **장점**:
   - 무료 플랜 제공
   - 자동 HTTPS
   - 커스텀 도메인 지원
   - 자동 배포 (GitHub 푸시 시)

### 옵션 2: Vercel

1. **Vercel 계정 생성**: https://vercel.com
2. **배포 방법**:
   ```bash
   npm i -g vercel
   vercel
   ```
   또는 GitHub 저장소를 연결하여 자동 배포

3. **장점**:
   - 무료 플랜 제공
   - 자동 HTTPS
   - 빠른 CDN
   - 자동 배포

### 옵션 3: GitHub Pages

1. **vite.config.js 수정**:
   ```javascript
   export default defineConfig({
     plugins: [react()],
     base: '/프로젝트명/', // GitHub 저장소 이름
     // ...
   })
   ```

2. **배포 스크립트 추가** (package.json):
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```

3. **gh-pages 설치**:
   ```bash
   npm install --save-dev gh-pages
   ```

4. **배포 실행**:
   ```bash
   npm run deploy
   ```

### 옵션 4: 일반 웹 호스팅 (FTP/SSH)

1. **빌드 실행**:
   ```bash
   npm run build
   ```

2. **dist 폴더 업로드**:
   - FTP 클라이언트 또는 SSH를 통해
   - `dist` 폴더의 모든 내용을 웹 서버의 루트 디렉토리에 업로드

3. **주의사항**:
   - 서버가 SPA(Single Page Application) 라우팅을 지원해야 함
   - Apache: `.htaccess` 파일 필요
   - Nginx: rewrite 규칙 설정 필요

### 옵션 5: AWS S3 + CloudFront

1. **S3 버킷 생성**
2. **빌드 파일 업로드**:
   ```bash
   npm run build
   aws s3 sync dist/ s3://버킷명 --delete
   ```
3. **CloudFront 배포** (선택사항 - CDN)

## 3. 환경 변수 설정 (필요한 경우)

`.env.production` 파일 생성:
```
VITE_API_URL=https://api.example.com
```

## 4. 빌드 최적화 확인

빌드 후 다음을 확인하세요:
- 파일 크기 최적화
- 코드 분할 (Code Splitting)
- 압축 (Gzip/Brotli)

## 5. 배포 후 체크리스트

- [ ] 모든 페이지가 정상 작동하는지 확인
- [ ] 엑셀 업로드/다운로드 기능 테스트
- [ ] 모바일 반응형 확인
- [ ] 브라우저 호환성 확인 (Chrome, Firefox, Safari, Edge)
- [ ] HTTPS 적용 확인
- [ ] 로딩 속도 확인

## 6. 문제 해결

### 라우팅 문제 (404 에러)
- SPA 라우팅을 지원하도록 서버 설정 필요
- Netlify/Vercel은 자동 지원
- Apache: `_redirects` 또는 `.htaccess` 파일 필요
- Nginx: try_files 설정 필요

### CORS 문제
- API 호출 시 CORS 설정 확인
- 프록시 설정 필요할 수 있음

### 빌드 오류
- Node.js 버전 확인 (권장: 18.x 이상)
- 의존성 재설치: `rm -rf node_modules && npm install`
