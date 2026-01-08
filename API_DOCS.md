# Citadel POW Backend - API 문서

## Base URL

```
Production: https://citadel-pow-backend.workers.dev
Development: http://localhost:8787
```

## 인증

현재 버전은 공개 API입니다. 향후 인증이 필요한 경우 Bearer Token을 사용할 예정입니다.

```
Authorization: Bearer YOUR_API_KEY
```

## 응답 형식

모든 API는 JSON 형식으로 응답합니다.

### 성공 응답
```json
{
  "success": true,
  "data": [...],
  "count": 10
}
```

### 에러 응답
```json
{
  "error": "Error message",
  "details": []
}
```

---

## 📊 Rankings API

### 1. 전체 순위 조회

```http
GET /api/rankings
```

**Query Parameters:**
- `week` (optional) - 주차 번호
- `year` (optional) - 연도
- `limit` (optional, default: 100) - 결과 개수

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/rankings?week=52&year=2024&limit=50"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "discord_username": "user1",
      "discord_avatar": "https://cdn.discordapp.com/avatars/...",
      "pow_score": 1500,
      "rank": 1,
      "week_number": 52,
      "year": 2024,
      "updated_at": "2024-12-31T12:00:00Z"
    }
  ],
  "count": 50
}
```

### 2. 현재 주차 순위 조회

```http
GET /api/rankings/current
```

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/rankings/current"
```

**Example Response:**
```json
{
  "success": true,
  "week": 1,
  "year": 2025,
  "data": [...],
  "count": 100
}
```

### 3. 사용자별 순위 이력

```http
GET /api/rankings/user/:discordId
```

**Path Parameters:**
- `discordId` - Discord 사용자 ID

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/rankings/user/123456789"
```

---

## 💰 Donations API

### 1. 상위 기부자 조회

```http
GET /api/donations/top
```

**Query Parameters:**
- `limit` (optional, default: 50) - 결과 개수

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/donations/top?limit=10"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "discord_username": "generous_user",
      "discord_avatar": "https://cdn.discordapp.com/avatars/...",
      "total_donated": 500.00,
      "donation_count": 5,
      "last_donation_at": "2024-12-31T12:00:00Z"
    }
  ],
  "count": 10
}
```

### 2. 최근 기부 내역

```http
GET /api/donations/recent
```

**Query Parameters:**
- `limit` (optional, default: 20)

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/donations/recent"
```

### 3. 기부 통계

```http
GET /api/donations/stats
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "total_amount": 10000.00,
    "total_donations": 150,
    "average_donation": 66.67
  }
}
```

### 4. 사용자별 기부 내역

```http
GET /api/donations/user/:discordId
```

**Example Response:**
```json
{
  "success": true,
  "user": {
    "discord_id": "123456789",
    "total_donated": 200.00,
    "donation_count": 3,
    "donations": [...]
  }
}
```

### 5. 새 기부 기록

```http
POST /api/donations
```

**Request Body:**
```json
{
  "discord_id": "123456789",
  "amount": 50.00,
  "currency": "USD",
  "message": "Thanks for the great work!",
  "transaction_id": "txn_123abc"
}
```

**Example Request:**
```bash
curl -X POST "https://citadel-pow-backend.workers.dev/api/donations" \
  -H "Content-Type: application/json" \
  -d '{
    "discord_id": "123456789",
    "amount": 50.00,
    "currency": "USD",
    "message": "Keep up the good work!"
  }'
```

---

## 💬 Discord API

### 1. 가장 많은 반응을 얻은 게시물

```http
GET /api/discord/top-posts
```

**Query Parameters:**
- `limit` (optional, default: 20)

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/discord/top-posts?limit=10"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "content": "Amazing post content",
      "discord_message_id": "msg_123",
      "channel_id": "channel_456",
      "discord_username": "user1",
      "discord_avatar": "https://cdn.discordapp.com/avatars/...",
      "reaction_count": 45,
      "comment_count": 12,
      "total_engagement": 57,
      "created_at": "2024-12-31T12:00:00Z"
    }
  ],
  "count": 10
}
```

### 2. 최근 게시물

```http
GET /api/discord/posts/recent
```

**Query Parameters:**
- `limit` (optional, default: 50)

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/discord/posts/recent"
```

### 3. 사용자별 게시물

```http
GET /api/discord/posts/user/:discordId
```

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/discord/posts/user/123456789"
```

### 4. 새 게시물 등록

```http
POST /api/discord/posts
```

**Request Body:**
```json
{
  "discord_id": "123456789",
  "discord_message_id": "msg_987654321",
  "channel_id": "channel_123",
  "content": "This is a new post!"
}
```

**Example Request:**
```bash
curl -X POST "https://citadel-pow-backend.workers.dev/api/discord/posts" \
  -H "Content-Type: application/json" \
  -d '{
    "discord_id": "123456789",
    "discord_message_id": "msg_987654321",
    "channel_id": "channel_123",
    "content": "Check out this awesome post!"
  }'
```

### 5. 반응 수 업데이트

```http
PATCH /api/discord/reactions
```

**Request Body:**
```json
{
  "discord_message_id": "msg_987654321",
  "reaction_count": 25,
  "comment_count": 8
}
```

**Example Request:**
```bash
curl -X PATCH "https://citadel-pow-backend.workers.dev/api/discord/reactions" \
  -H "Content-Type: application/json" \
  -d '{
    "discord_message_id": "msg_987654321",
    "reaction_count": 30,
    "comment_count": 10
  }'
```

---

## 👤 Users API

### 1. 사용자 정보 조회

```http
GET /api/users/:discordId
```

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/users/123456789"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "discord_id": "123456789",
    "discord_username": "user1",
    "discord_avatar": "https://cdn.discordapp.com/avatars/...",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-12-31T12:00:00Z"
  }
}
```

### 2. 사용자 생성/업데이트

```http
POST /api/users
```

**Request Body:**
```json
{
  "discord_id": "123456789",
  "discord_username": "newuser",
  "discord_avatar": "https://cdn.discordapp.com/avatars/..."
}
```

### 3. 사용자 통합 통계

```http
GET /api/users/:discordId/stats
```

**Example Request:**
```bash
curl "https://citadel-pow-backend.workers.dev/api/users/123456789/stats"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "discord_username": "user1",
      "discord_avatar": "https://..."
    },
    "current_rank": 5,
    "current_score": 1200,
    "total_donated": 350.00,
    "donation_count": 7,
    "post_count": 25,
    "total_engagement": 450
  }
}
```

---

## 🏥 Health & Status

### Health Check

```http
GET /health
```

**Example Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-31T12:00:00Z"
}
```

### API Info

```http
GET /
```

**Example Response:**
```json
{
  "name": "Citadel POW Backend API",
  "version": "1.0.0",
  "status": "operational",
  "endpoints": {
    "rankings": "/api/rankings",
    "donations": "/api/donations",
    "discord": "/api/discord",
    "users": "/api/users"
  }
}
```

---

## 📌 HTTP Status Codes

- `200 OK` - 요청 성공
- `201 Created` - 리소스 생성 성공
- `400 Bad Request` - 잘못된 요청 (유효성 검증 실패)
- `404 Not Found` - 리소스를 찾을 수 없음
- `500 Internal Server Error` - 서버 오류

---

## 🔄 Rate Limiting

현재는 Rate Limiting이 설정되어 있지 않습니다. 향후 다음과 같이 적용될 예정:

- **일반 사용자**: 100 requests/minute
- **인증된 사용자**: 1000 requests/minute

---

## 💡 사용 팁

### 1. Pagination

대량의 데이터를 조회할 때는 `limit` 파라미터를 사용하세요:

```bash
# 페이지당 20개
curl "https://citadel-pow-backend.workers.dev/api/rankings?limit=20"
```

### 2. 필터링

주차와 연도로 특정 기간의 랭킹을 조회:

```bash
curl "https://citadel-pow-backend.workers.dev/api/rankings?week=52&year=2024"
```

### 3. 에러 처리

항상 `success` 필드를 확인하여 요청 성공 여부를 판단:

```javascript
const response = await fetch('/api/rankings');
const data = await response.json();

if (data.success) {
  // 성공 처리
  console.log(data.data);
} else {
  // 에러 처리
  console.error(data.error);
}
```

---

## 📮 프론트엔드 연동 예제

### JavaScript/TypeScript

```typescript
// 현재 랭킹 조회
async function getCurrentRankings() {
  const response = await fetch('https://citadel-pow-backend.workers.dev/api/rankings/current');
  const data = await response.json();
  return data.data;
}

// 상위 기부자 조회
async function getTopDonors(limit = 10) {
  const response = await fetch(`https://citadel-pow-backend.workers.dev/api/donations/top?limit=${limit}`);
  const data = await response.json();
  return data.data;
}

// 인기 게시물 조회
async function getTopPosts(limit = 20) {
  const response = await fetch(`https://citadel-pow-backend.workers.dev/api/discord/top-posts?limit=${limit}`);
  const data = await response.json();
  return data.data;
}
```

### React 예제

```tsx
import { useEffect, useState } from 'react';

function Leaderboard() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://citadel-pow-backend.workers.dev/api/rankings/current')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRankings(data.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Leaderboard</h1>
      {rankings.map((user, index) => (
        <div key={index}>
          #{user.rank} - {user.discord_username}: {user.pow_score} points
        </div>
      ))}
    </div>
  );
}
```

---

## 🐛 문제 신고

API 사용 중 문제가 발생하면 다음 정보와 함께 신고해주세요:

1. 요청 URL
2. 요청 메서드 (GET, POST, etc.)
3. 요청 본문 (해당되는 경우)
4. 응답 상태 코드
5. 에러 메시지

---

**Last Updated**: 2025-01-08
