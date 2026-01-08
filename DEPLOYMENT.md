# Citadel POW Backend - 배포 가이드

## 📋 배포 전 체크리스트

- [ ] Cloudflare 계정 생성 및 로그인
- [ ] Supabase 프로젝트 생성
- [ ] 데이터베이스 마이그레이션 완료
- [ ] 환경 변수 준비
- [ ] 도메인 설정 (선택사항)

## 🗄️ Supabase 설정

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 접속하여 새 프로젝트 생성
2. 프로젝트 이름과 비밀번호 설정
3. 리전 선택 (한국: Northeast Asia - Seoul 권장)

### 2. 데이터베이스 마이그레이션

1. Supabase 대시보드에서 SQL Editor로 이동
2. `supabase/migrations/001_initial_schema.sql` 파일 내용을 복사하여 실행
3. (선택) 테스트 데이터를 위해 `supabase/seed.sql` 실행

### 3. API 키 확인

Supabase 대시보드 → Settings → API에서 다음 정보 확인:
- Project URL (SUPABASE_URL)
- anon/public key (SUPABASE_ANON_KEY)

### 4. Row Level Security (RLS) 설정 (권장)

보안을 위해 RLS 정책을 설정:

```sql
-- 읽기 전용 공개 접근
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있음
CREATE POLICY "Public read access" ON users FOR SELECT USING (true);
CREATE POLICY "Public read access" ON rankings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON donations FOR SELECT USING (true);
CREATE POLICY "Public read access" ON discord_posts FOR SELECT USING (true);
CREATE POLICY "Public read access" ON post_reactions FOR SELECT USING (true);

-- 쓰기는 서비스 역할만 가능 (서버에서만 쓰기)
-- API에서 service_role 키를 사용하여 쓰기 작업 수행
```

## ☁️ Cloudflare Workers 배포

### 1. Wrangler CLI 설정

```bash
# Cloudflare 계정에 로그인
npx wrangler login

# 로그인 성공 확인
npx wrangler whoami
```

### 2. 환경 변수 설정

프로덕션 환경 변수 설정:

```bash
# Supabase URL 설정
npx wrangler secret put SUPABASE_URL
# 입력 프롬프트에서 Supabase Project URL 입력

# Supabase Anon Key 설정
npx wrangler secret put SUPABASE_ANON_KEY
# 입력 프롬프트에서 anon/public key 입력

# Discord Bot Token (선택사항)
npx wrangler secret put DISCORD_BOT_TOKEN

# Discord Webhook URL (선택사항)
npx wrangler secret put DISCORD_WEBHOOK_URL
```

### 3. 배포

```bash
# 프로덕션에 배포
npm run deploy

# 또는
npx wrangler deploy
```

배포가 완료되면 다음과 같은 URL을 받게 됩니다:
```
https://citadel-pow-backend.<your-subdomain>.workers.dev
```

### 4. 배포 확인

```bash
# Health check
curl https://citadel-pow-backend.<your-subdomain>.workers.dev/health

# API 루트 확인
curl https://citadel-pow-backend.<your-subdomain>.workers.dev/
```

## 🌐 커스텀 도메인 설정 (선택사항)

### 1. Cloudflare에 도메인 추가

1. Cloudflare 대시보드에서 도메인 추가
2. 네임서버 변경 (도메인 등록기관에서 설정)

### 2. Workers 라우트 설정

1. Cloudflare 대시보드 → Workers & Pages → citadel-pow-backend
2. Settings → Triggers → Custom Domains
3. Add Custom Domain 클릭
4. 원하는 서브도메인 입력 (예: api.citadel-pow.com)

### 3. wrangler.toml 업데이트

```toml
[env.production]
name = "citadel-pow-backend"
routes = [
  { pattern = "api.citadel-pow.com/*", zone_name = "citadel-pow.com" }
]
```

재배포:
```bash
npm run deploy
```

## 🔧 개발 환경 설정

### 로컬 개발

```bash
# .dev.vars 파일 생성
cp .dev.vars.example .dev.vars

# .dev.vars 파일 수정하여 Supabase 정보 입력
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your-anon-key

# 로컬 개발 서버 실행
npm run dev
```

로컬 서버: `http://localhost:8787`

## 📊 모니터링

### Cloudflare 대시보드

1. Workers & Pages → citadel-pow-backend
2. Metrics 탭에서 다음 확인:
   - 요청 수
   - 응답 시간
   - 에러율
   - CPU 시간

### Supabase 대시보드

1. Database → Query Performance
2. API → API Logs
3. Database → Database Health

## 🔄 업데이트 및 롤백

### 업데이트

```bash
# 코드 변경 후
git add .
git commit -m "Update API"
git push

# 재배포
npm run deploy
```

### 롤백

```bash
# 이전 버전으로 롤백
npx wrangler rollback

# 특정 버전으로 롤백
npx wrangler deployments list
npx wrangler rollback --deployment-id <deployment-id>
```

## 🐛 트러블슈팅

### 배포 실패

**문제**: `wrangler deploy` 실패

**해결**:
```bash
# 캐시 정리
rm -rf node_modules .wrangler
npm install

# 다시 배포
npm run deploy
```

### 환경 변수 오류

**문제**: `SUPABASE_URL is not defined`

**해결**:
```bash
# 환경 변수 다시 설정
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY

# 배포
npm run deploy
```

### CORS 오류

**문제**: 프론트엔드에서 CORS 에러

**해결**:
`src/middleware/cors.ts`에서 도메인 추가:
```typescript
origin: [
  'http://localhost:3000',
  'https://citadel-pow.com',
  'https://your-frontend-domain.com'  // 추가
],
```

### 데이터베이스 연결 오류

**문제**: Supabase 연결 실패

**해결**:
1. Supabase URL과 API 키 확인
2. Supabase 프로젝트가 활성화되어 있는지 확인
3. 네트워크 연결 확인

## 📈 성능 최적화

### 1. Caching 추가 (Cloudflare KV)

```bash
# KV namespace 생성
npx wrangler kv:namespace create "CACHE"
npx wrangler kv:namespace create "CACHE" --preview
```

`wrangler.toml`에 추가:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-id"
```

### 2. Rate Limiting

Cloudflare Rate Limiting 규칙 설정:
- API 엔드포인트별 요청 제한
- IP 기반 제한

### 3. 데이터베이스 인덱스

`001_initial_schema.sql`에 이미 주요 인덱스가 설정되어 있습니다.
추가 인덱스가 필요한 경우 Supabase SQL Editor에서 추가.

## 🔒 보안 체크리스트

- [ ] Row Level Security (RLS) 활성화
- [ ] API 키는 환경 변수로 관리
- [ ] CORS 도메인 제한 설정
- [ ] Rate Limiting 설정
- [ ] HTTPS만 허용
- [ ] 민감한 데이터 암호화
- [ ] 로그에 개인정보 기록 금지

## 📞 지원

문제가 발생하면 다음을 확인하세요:
- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [Supabase 문서](https://supabase.com/docs)
- [Hono 문서](https://hono.dev/)

---

배포가 완료되면 API 문서를 팀과 공유하세요!
