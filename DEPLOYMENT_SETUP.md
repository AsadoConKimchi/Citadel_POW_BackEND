# CI/CD 자동화 설정 가이드

## 🔐 GitHub Secrets 설정

PR이 머지되면 자동으로 배포되도록 GitHub Secrets를 설정해야 합니다.

### 백엔드 레포지토리 (Citadel_POW_BackEND) Secrets:

1. **GitHub 레포지토리** 이동:
   https://github.com/AsadoConKimchi/Citadel_POW_BackEND/settings/secrets/actions

2. **"New repository secret"** 클릭하여 아래 Secrets 추가:

#### Cloudflare 관련:
- `CLOUDFLARE_API_TOKEN`
  - 값: Cloudflare API 토큰
  - 생성 방법: https://dash.cloudflare.com/profile/api-tokens
  - "Edit Cloudflare Workers" 템플릿 사용

- `CLOUDFLARE_ACCOUNT_ID`
  - 값: Cloudflare 계정 ID
  - 확인 방법: Cloudflare 대시보드 우측에 표시됨

#### Supabase 관련:
- `SUPABASE_URL`
  - 값: `https://hilzugfdqwequnqhvdnm.supabase.co`

- `SUPABASE_ANON_KEY`
  - 값: Settings > API에서 복사한 anon public key
  - `eyJ`로 시작하는 긴 JWT 토큰

- `SUPABASE_ACCESS_TOKEN`
  - 값: Supabase Access Token
  - 생성 방법: https://supabase.com/dashboard/account/tokens

- `SUPABASE_DB_PASSWORD`
  - 값: Supabase 프로젝트 생성 시 설정한 데이터베이스 비밀번호

#### 환경 변수:
- `ENVIRONMENT`
  - 값: `production`

---

## 🚀 자동 배포 흐름

### 백엔드 (Cloudflare Workers):
```
PR 생성 → 테스트
PR 머지 to main → 자동 배포 to Cloudflare Workers
```

### 프론트엔드 (Railway):
```
PR 머지 to main → Railway가 자동 감지하여 배포
```

### 데이터베이스 (Supabase):
```
supabase/migrations/ 폴더 변경 시 → 자동 마이그레이션 실행
```

---

## 📋 배포 전 체크리스트

- [ ] Supabase 프로젝트 생성 완료
- [ ] Supabase SQL 마이그레이션 수동 실행 (최초 1회)
- [ ] Cloudflare Workers 계정 생성
- [ ] Cloudflare API 토큰 생성
- [ ] GitHub Secrets 모두 설정 완료
- [ ] Railway GitHub 앱 연결 (프론트엔드)
- [ ] `.dev.vars` 파일 로컬에만 존재 (Git에 커밋 안 됨)

---

## 🧪 로컬 테스트 방법

### 1. 백엔드 로컬 실행:
```bash
cd Citadel_POW_BackEND

# .dev.vars 파일에 Supabase 정보 입력 확인
cat .dev.vars

# 의존성 설치
npm install

# 로컬 개발 서버 실행 (포트 8787)
npm run dev
```

백엔드가 실행되면: http://localhost:8787

### 2. 프론트엔드 로컬 실행:
```bash
cd Citadel_POW

# 의존성 설치
npm install

# 로컬 서버 실행 (포트 3000)
npm start
```

프론트엔드 접속: http://localhost:3000

### 3. 연동 테스트:
1. 브라우저 개발자 도구 (F12) 열기
2. Console 탭에서 확인:
   ```
   🔗 Backend API URL: http://localhost:8787
   ```
3. Discord 로그인 시도
4. Console에서 메시지 확인:
   ```
   사용자 정보가 백엔드에 저장되었습니다.
   ```
5. 공부 타이머 실행 후 종료
6. Console에서 메시지 확인:
   ```
   공부 세션이 백엔드에 저장되었습니다.
   ```

---

## 🐛 문제 해결

### 백엔드 연결 실패 시:
```javascript
// 브라우저 Console에서 실행:
fetch('http://localhost:8787')
  .then(res => res.json())
  .then(data => console.log(data));

// 정상 응답:
// {
//   name: "Citadel POW Backend API",
//   version: "1.0.0",
//   status: "operational"
// }
```

### CORS 에러 발생 시:
- 백엔드의 CORS 미들웨어가 활성화되어 있는지 확인
- 프론트엔드가 `http://localhost:3000`에서 실행 중인지 확인

### Supabase 연결 실패 시:
- `.dev.vars` 파일의 `SUPABASE_URL`과 `SUPABASE_ANON_KEY` 확인
- Supabase 대시보드에서 프로젝트가 정상 작동 중인지 확인
