# 🚀 빠른 배포 가이드

## 1단계: Supabase 설정 (5분)

### Supabase 프로젝트 생성
1. https://supabase.com 접속 → 로그인
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - Name: `citadel-pow-backend`
   - Database Password: 안전한 비밀번호 생성
   - Region: `Northeast Asia (Seoul)` 선택
4. "Create new project" 클릭 (약 2분 소요)

### 데이터베이스 마이그레이션
1. Supabase 대시보드 → 왼쪽 메뉴 → **SQL Editor**
2. "New Query" 클릭
3. `supabase/migrations/001_initial_schema.sql` 파일 내용 복사 & 붙여넣기
4. **"Run"** 버튼 클릭
5. ✅ Success 확인

### API 키 확인
1. Supabase 대시보드 → **Settings** (톱니바퀴 아이콘)
2. **API** 메뉴 클릭
3. 다음 정보 복사해두기:
   - **Project URL** (예: `https://xxxxx.supabase.co`)
   - **anon public** key (긴 문자열)

---

## 2단계: Cloudflare Workers 배포 (3분)

### 터미널에서 실행

```bash
# 1. Cloudflare 로그인 (브라우저가 열림)
npx wrangler login
# → 브라우저에서 "Allow" 클릭

# 2. 로그인 확인
npx wrangler whoami
# → 이메일 주소가 보이면 성공

# 3. Supabase URL 환경 변수 설정
npx wrangler secret put SUPABASE_URL
# → 프롬프트가 나오면 위에서 복사한 Project URL 붙여넣기
# → Enter 누르기

# 4. Supabase API 키 환경 변수 설정
npx wrangler secret put SUPABASE_ANON_KEY
# → 프롬프트가 나오면 anon public key 붙여넣기
# → Enter 누르기

# 5. 배포!
npm run deploy
# → 배포 완료까지 약 30초

# 6. 배포된 URL 확인 (출력에서 찾기)
# 예: https://citadel-pow-backend.your-subdomain.workers.dev
```

---

## 3단계: API 테스트

배포가 완료되면 나오는 URL로 테스트:

```bash
# Health Check (URL을 본인 Worker URL로 변경)
curl https://citadel-pow-backend.your-subdomain.workers.dev/health

# API 정보
curl https://citadel-pow-backend.your-subdomain.workers.dev/

# 현재 랭킹 (데이터가 있으면 표시됨)
curl https://citadel-pow-backend.your-subdomain.workers.dev/api/rankings/current
```

---

## ✅ 완료!

이제 다음을 할 수 있습니다:

1. **프론트엔드에서 API 호출**
   ```javascript
   const API_URL = 'https://citadel-pow-backend.your-subdomain.workers.dev';

   fetch(`${API_URL}/api/rankings/current`)
     .then(res => res.json())
     .then(data => console.log(data));
   ```

2. **테스트 데이터 추가** (선택사항)
   - Supabase SQL Editor → `supabase/seed.sql` 실행

3. **API 문서 확인**
   - `API_DOCS.md` 파일 참고

---

## 🐛 문제 해결

### "wrangler: command not found"
```bash
npm install
```

### "Not logged in"
```bash
npx wrangler logout
npx wrangler login
```

### "Error: No project found"
```bash
# wrangler.toml 파일이 있는지 확인
ls -la wrangler.toml
```

### Supabase 연결 오류
- Supabase URL과 API 키를 다시 확인
- 환경 변수를 다시 설정:
  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_ANON_KEY
  npm run deploy
  ```

---

## 📞 다음 단계

- [ ] 커스텀 도메인 설정 (`DEPLOYMENT.md` 참고)
- [ ] Row Level Security 설정 (`DEPLOYMENT.md` 참고)
- [ ] Discord Bot 연동 (선택사항)
- [ ] 프론트엔드에서 API 연동

---

**소요 시간**: 총 10분
**비용**: 무료 (Cloudflare 10만 요청/일, Supabase 500MB/2GB 전송)
