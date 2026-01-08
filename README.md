# Citadel POW Backend API

Citadel POW 사용자들의 순위, 기부금액, 디스코드 게시물 반응을 관리하는 백엔드 API

## 🚀 기술 스택

- **Cloudflare Workers** - 서버리스 백엔드 플랫폼
- **Supabase** - PostgreSQL 데이터베이스
- **Hono** - 경량 웹 프레임워크
- **TypeScript** - 타입 안전성
- **Zod** - 스키마 검증

## 📋 주요 기능

### 1. 공부 세션 관리 (Study Sessions)
- 공부 세션 기록 및 조회
- 일일/주간 공부 통계
- 자동 POW 점수 계산 및 업데이트
- 사용자별 공부 이력 추적

### 2. 순위 시스템 (Rankings)
- 주간별 POW 점수 순위 (공부 시간 기반)
- 사용자별 순위 이력 조회
- 실시간 리더보드

### 3. 기부 관리 (Donations)
- 기부금액 기록 및 조회
- 상위 기부자 랭킹
- 사용자별 기부 통계

### 4. 디스코드 통합 (Discord)
- 게시물 반응 추적
- 가장 많은 반응을 얻은 게시물 조회
- 사용자별 게시물 분석

## 🏗️ 프로젝트 구조

```
Citadel_POW_BackEND/
├── src/
│   ├── index.ts              # 메인 엔트리 포인트
│   ├── types.ts              # TypeScript 타입 정의
│   ├── supabase.ts           # Supabase 클라이언트
│   ├── middleware/
│   │   ├── cors.ts           # CORS 설정
│   │   └── logger.ts         # 로깅 미들웨어
│   └── routes/
│       ├── rankings.ts       # 순위 API
│       ├── donations.ts      # 기부 API
│       ├── discord.ts        # 디스코드 API
│       ├── users.ts          # 사용자 API
│       └── study-sessions.ts # 공부 세션 API
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   └── 002_add_study_sessions.sql
│   └── seed.sql
├── package.json
├── tsconfig.json
├── wrangler.toml
└── README.md
```

## 🛠️ 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.dev.vars` 파일을 생성하고 다음 내용을 추가:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

`.dev.vars.example` 파일을 참고하세요.

### 3. Supabase 데이터베이스 설정

Supabase 프로젝트에서 SQL 에디터를 열고 다음 파일들을 순서대로 실행:

1. `supabase/migrations/001_initial_schema.sql` - 테이블 및 뷰 생성
2. `supabase/seed.sql` - 테스트 데이터 삽입 (선택사항)

### 4. 로컬 개발 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:8787`에서 실행됩니다.

## 📡 API 엔드포인트

### Health Check
- `GET /health` - 서버 상태 확인

### Rankings (순위)
- `GET /api/rankings` - 전체 순위 조회
- `GET /api/rankings/current` - 현재 주차 순위
- `GET /api/rankings/user/:discordId` - 사용자별 순위 이력

**Query Parameters:**
- `week` - 주차 번호
- `year` - 연도
- `limit` - 결과 개수 (기본: 100)

### Donations (기부)
- `GET /api/donations/top` - 상위 기부자
- `GET /api/donations/recent` - 최근 기부 내역
- `GET /api/donations/stats` - 기부 통계
- `GET /api/donations/user/:discordId` - 사용자별 기부 내역
- `POST /api/donations` - 새 기부 기록

### Discord
- `GET /api/discord/top-posts` - 가장 많은 반응을 얻은 게시물
- `GET /api/discord/posts/recent` - 최근 게시물
- `GET /api/discord/posts/user/:discordId` - 사용자별 게시물
- `POST /api/discord/posts` - 새 게시물 등록
- `PATCH /api/discord/reactions` - 반응 수 업데이트

### Users (사용자)
- `GET /api/users/:discordId` - 사용자 정보
- `GET /api/users/:discordId/stats` - 사용자 통합 통계
- `POST /api/users` - 사용자 생성/업데이트

## 🚀 배포

### Cloudflare Workers에 배포

1. Cloudflare 계정 설정 및 로그인:
```bash
npx wrangler login
```

2. 환경 변수 설정:
```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
```

3. 배포:
```bash
npm run deploy
```

## 📊 데이터베이스 스키마

### 주요 테이블
- `users` - 사용자 정보
- `rankings` - POW 순위 기록
- `donations` - 기부금액 기록
- `discord_posts` - 디스코드 게시물
- `post_reactions` - 게시물 반응

### 주요 뷰
- `leaderboard` - 순위표
- `top_donors` - 상위 기부자
- `top_discord_posts` - 인기 게시물

상세한 스키마는 `supabase/migrations/001_initial_schema.sql` 참조

## 🔒 보안

- CORS 설정으로 허용된 도메인만 접근 가능
- Supabase Row Level Security (RLS) 활용 권장
- API 키는 환경 변수로 관리
- 입력 검증은 Zod 스키마 사용

## 📝 예제 요청

### 현재 주차 순위 조회
```bash
curl https://your-worker.workers.dev/api/rankings/current
```

### 상위 기부자 조회
```bash
curl https://your-worker.workers.dev/api/donations/top?limit=10
```

### 인기 게시물 조회
```bash
curl https://your-worker.workers.dev/api/discord/top-posts?limit=20
```

## 🤝 기여

이슈 및 풀 리퀘스트를 환영합니다!

## 📄 라이선스

MIT License
