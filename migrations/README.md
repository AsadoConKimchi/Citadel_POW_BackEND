# Citadel POW 데이터베이스 마이그레이션

## 📋 마이그레이션 목록

### 001_extend_database_schema.sql
**목적**: POW 세션 및 기부 데이터 완전성 확보

**변경사항**:
- `study_sessions` 테이블 확장
  - `donation_mode` (POW 분야) - 필수
  - `goal_minutes` (목표시간) - 필수
  - `achievement_rate` (달성률) - 필수
  - `donation_id` (기부 연결) - 선택
  - `plan_text` - nullable에서 필수로 변경

- `donations` 테이블 확장
  - POW 정보 스냅샷: `plan_text`, `goal_minutes`, `achievement_rate`, `photo_url`
  - 누적 정보 스냅샷: `accumulated_sats`, `total_accumulated_sats`, `total_donated_sats`
  - `donation_mode`, `donation_scope` - nullable에서 필수로 변경

---

## 🚀 실행 방법

### 방법 1: Supabase Dashboard (추천)

1. [Supabase Dashboard](https://app.supabase.com/) 로그인
2. Citadel POW 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. **New Query** 버튼 클릭
5. `001_extend_database_schema.sql` 파일 내용을 복사하여 붙여넣기
6. **Run** 버튼 클릭 (또는 `Cmd/Ctrl + Enter`)
7. 성공 메시지 확인

### 방법 2: Supabase CLI

```bash
# Supabase CLI 설치 (이미 설치된 경우 스킵)
npm install -g supabase

# 프로젝트 디렉토리로 이동
cd /Users/jinito/Citadel_POW_BackEND

# Supabase 로그인
supabase login

# 마이그레이션 실행
supabase db push

# 또는 직접 SQL 실행
supabase db execute --file migrations/001_extend_database_schema.sql
```

### 방법 3: psql (PostgreSQL 클라이언트)

```bash
# Supabase 연결 정보 사용
psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres" \
  -f migrations/001_extend_database_schema.sql
```

---

## ⚠️ 롤백 (되돌리기)

만약 마이그레이션 후 문제가 발생하면:

```bash
# Supabase Dashboard에서
# migrations/001_extend_database_schema_rollback.sql 실행

# 또는 CLI로
supabase db execute --file migrations/001_extend_database_schema_rollback.sql
```

**주의**: 롤백 시 새로 추가된 컬럼의 데이터가 모두 삭제됩니다!

---

## ✅ 마이그레이션 확인

마이그레이션 성공 여부 확인:

```sql
-- study_sessions 테이블 구조 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'study_sessions'
ORDER BY ordinal_position;

-- donations 테이블 구조 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'donations'
ORDER BY ordinal_position;

-- 제약조건 확인
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name IN ('study_sessions', 'donations')
ORDER BY table_name, constraint_type;
```

---

## 📊 예상 결과

### study_sessions 테이블

| 컬럼명 | 타입 | Nullable | 기본값 |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| donation_mode | varchar(50) | NO | 'pow-writing' |
| plan_text | text | NO | '' |
| start_time | timestamptz | NO | - |
| end_time | timestamptz | NO | - |
| duration_minutes | integer | NO | - |
| goal_minutes | integer | NO | 0 |
| achievement_rate | numeric(5,2) | NO | 0 |
| photo_url | text | YES | - |
| donation_id | uuid | YES | - |
| created_at | timestamptz | NO | now() |

### donations 테이블

| 컬럼명 | 타입 | Nullable | 기본값 |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| amount | integer | NO | - |
| currency | varchar(10) | NO | 'SAT' |
| donation_mode | varchar(50) | NO | - |
| donation_scope | varchar(20) | NO | - |
| note | text | YES | - |
| plan_text | text | YES | - |
| duration_minutes | integer | YES | - |
| duration_seconds | integer | YES | - |
| goal_minutes | integer | YES | - |
| achievement_rate | numeric(5,2) | YES | - |
| photo_url | text | YES | - |
| accumulated_sats | integer | YES | - |
| total_accumulated_sats | integer | YES | - |
| total_donated_sats | integer | YES | - |
| transaction_id | varchar(255) | YES | - |
| status | varchar(20) | NO | 'pending' |
| date | date | NO | - |
| session_id | varchar(255) | YES | - |
| message | text | YES | - |
| created_at | timestamptz | NO | now() |

---

## 🔍 트러블슈팅

### 문제: "column already exists" 에러

**원인**: 이미 컬럼이 존재합니다.

**해결**: SQL에 `IF NOT EXISTS`가 포함되어 있으므로 무시하고 계속 진행하면 됩니다.

### 문제: NOT NULL 제약조건 위반

**원인**: 기존 데이터에 NULL 값이 있습니다.

**해결**: 마이그레이션 스크립트가 자동으로 기본값을 설정하므로 문제없습니다. 만약 에러가 발생하면:

```sql
-- 수동으로 NULL 값 업데이트
UPDATE study_sessions SET donation_mode = 'pow-writing' WHERE donation_mode IS NULL;
UPDATE study_sessions SET plan_text = '' WHERE plan_text IS NULL;
UPDATE study_sessions SET goal_minutes = 0 WHERE goal_minutes IS NULL;
UPDATE study_sessions SET achievement_rate = 0 WHERE achievement_rate IS NULL;
```

### 문제: 외래 키 제약조건 에러

**원인**: donation_id에 존재하지 않는 ID가 있습니다.

**해결**: 외래 키 추가 전에 데이터 정리:

```sql
-- 존재하지 않는 donation_id를 NULL로 변경
UPDATE study_sessions
SET donation_id = NULL
WHERE donation_id IS NOT NULL
  AND donation_id NOT IN (SELECT id FROM donations);
```

---

## 📝 주의사항

1. **백업 필수**: 마이그레이션 전에 반드시 데이터베이스 백업을 생성하세요
2. **테스트 환경**: 가능하면 테스트 데이터베이스에서 먼저 실행하세요
3. **다운타임**: 마이그레이션 중 서비스 중단 시간이 발생할 수 있습니다
4. **모니터링**: 마이그레이션 후 애플리케이션 로그를 모니터링하세요

---

## 📞 문제 발생 시

1. Supabase Dashboard의 **Logs** 탭에서 에러 확인
2. 롤백 스크립트 실행
3. GitHub Issue 생성 또는 개발자에게 문의
