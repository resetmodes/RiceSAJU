# 밥사주

사주 × 날씨 × 그날 기분으로 정하는 삼성역 점심. 팀원 각자 폰에서 기분만 찍으면 "오늘의 점심 부적" 1장이 나온다. 맨 아래엔 사주 재물운으로 **오늘 밥살 사람** 지목.

## 구성

```
api/team.js        팀 상태 API (Vercel Function, Upstash Redis)
public/index.html  화면 전부 (빌드 없음)
public/bab.png     마스코트 밥이
lib/saju.js        만세력 계산 (의존성 0)
lib/engine.js      추천·재물운 점수식
lib/places.js      맛집 데이터 ← 리스트 수정은 여기
test/              npm test (9케이스)
e2e.local.mjs      npm run dev — 로컬에서 가짜 Redis로 전체 실행
```

## 배포 (한 번만, 10분)

1. **Upstash Redis 만들기** — upstash.com 가입 → Create Database → Region 아무거나(도쿄 추천) → 만들어지면 **REST API** 탭에서 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN` 두 값을 복사해둔다.
2. **Vercel 연결** — vercel.com → Add New → Project → 이 GitHub 리포 선택 → Framework는 Other 그대로 → Deploy 누르기 전에 **Environment Variables**에 아래 3개 입력:
   - `UPSTASH_REDIS_REST_URL` = 1에서 복사한 값
   - `UPSTASH_REDIS_REST_TOKEN` = 1에서 복사한 값
   - `OPENWEATHER_KEY` = openweathermap.org 가입 → API keys 탭의 기본 키 (안 넣으면 날씨 없이 동작)
3. Deploy → 나온 주소 뒤에 팀 코드를 붙여 팀 단톡에 공유: `https://<프로젝트>.vercel.app/#media-team`
   - 팀 코드는 아무 영문·숫자·하이픈 조합. 이 코드가 곧 우리 팀 방이다.

## 쓰는 법

1. 처음 한 번: 링크 열고 이름 + 생년월일(시는 알면) 입력 — "사주 맡기기"
2. 매일 점심 전: 기분 스티커 하나 탭
3. 아무나 "부적 뽑기" — 그때까지 입력한 사람들 합산으로 부적이 나온다. 같은 날은 몇 번 눌러도 같은 결과(조작 시비 방지).

## 맛집 리스트 바꾸기

`lib/places.js`의 배열을 수정하면 끝. 태깅 기준은 파일 상단 주석 참고. 지금은 개발용 샘플 3곳만 들어 있다.

## 로컬 확인

```
npm test       # 만세력·엔진 테스트
npm run dev    # http://127.0.0.1:3456/#media-team (가짜 Redis, 설정 불필요)
```
