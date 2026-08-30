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
2. **카카오 REST 키 받기** (선택이지만 강력 추천) — developers.kakao.com 로그인 → 내 애플리케이션 → 애플리케이션 추가하기(이름 아무거나) → 만들어진 앱 클릭 → **앱 키** 탭의 `REST API 키` 복사. 별도 신청·심사·결제 없이 바로 쓸 수 있고, 로컬 API는 하루 10만 건까지 무료다.
3. **Vercel 연결** — vercel.com → Add New → Project → 이 GitHub 리포 선택 → Framework는 Other 그대로 → Deploy 누르기 전에 **Environment Variables**에 아래 입력:
   - `UPSTASH_REDIS_REST_URL` = 1에서 복사한 값
   - `UPSTASH_REDIS_REST_TOKEN` = 1에서 복사한 값
   - `KAKAO_REST_KEY` = 2에서 복사한 REST API 키 (안 넣으면 아래 수기 목록으로만 동작)
   - `OPENWEATHER_KEY` = openweathermap.org 가입 → API keys 탭의 기본 키 (안 넣으면 날씨 없이 동작)
4. Deploy → 나온 주소 뒤에 팀 코드를 붙여 팀 단톡에 공유: `https://<프로젝트>.vercel.app/#media-team`
   - 팀 코드는 아무 영문·숫자·하이픈 조합. 이 코드가 곧 우리 팀 방이다.

## 쓰는 법

1. 처음 한 번: 링크 열고 이름 + 생년월일(시는 알면) 입력 — "사주 맡기기"
2. 매일 점심 전: 기분 스티커 하나 탭
3. 아무나 "부적 뽑기" — 그때까지 입력한 사람들 합산으로 부적이 나온다. 같은 날은 몇 번 눌러도 같은 결과(조작 시비 방지).

## 식당 목록은 어디서 오나

`KAKAO_REST_KEY`가 있으면 **카카오 로컬 API**로 본사 반경 700m(도보 10분권) 음식점을 거리순으로 최대 45곳 긁어온다. 하루 한 번만 호출하고 Redis에 캐시한다.

- **폐업·신규가 자동 반영된다** — 카카오에서 사라진 곳은 다음 날 목록에서 빠진다.
- **도보 시간이 실측이다** — 카카오가 준 직선거리를 분당 67m(4km/h)로 나눈 값. 수기 추정치보다 정확하다.
- **오행·기분 태그는 카테고리에서 자동 부여** — "음식점 > 한식 > 국밥"이면 해장·든든 결에 토·수 오행으로 붙는다. 규칙은 `lib/kakao.js`의 `RULES` 배열에 있고, 안 맞는 게 있으면 거기서 고치면 된다.
- **수기 메모는 살아남는다** — 아래 목록과 이름이 겹치면 카카오 좌표·링크를 쓰되 사람이 쓴 메모·가격대는 그대로 유지한다. 반경 밖 단골집도 목록에 남는다.
- 술집·카페·제과는 자동으로 걸러낸다.

키가 없거나 카카오 호출이 실패하면 아무 말 없이 아래 수기 목록으로 폴백한다.

## 맛집 리스트 바꾸기

`lib/places.js`의 배열을 수정하면 끝. 태깅 기준은 파일 상단 주석 참고. 지금은 개발용 샘플 3곳만 들어 있다.

## 로컬 확인

```
npm test       # 만세력·엔진 테스트
npm run dev    # http://127.0.0.1:3456/#media-team (가짜 Redis, 설정 불필요)
```
