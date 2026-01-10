#!/bin/bash
# Citadel POW 데이터베이스 확인 스크립트

echo "📊 최근 Study Sessions 확인..."
curl -s "https://citadel-pow-backend.magadenuevo2025.workers.dev/api/study-sessions/recent?limit=5" | jq '.'

echo ""
echo "📊 최근 Donations 확인..."
curl -s "https://citadel-pow-backend.magadenuevo2025.workers.dev/api/donations/recent?limit=5" | jq '.'

echo ""
echo "📊 Donation 통계 확인..."
curl -s "https://citadel-pow-backend.magadenuevo2025.workers.dev/api/donations/stats" | jq '.'
