# AI News You Need — 1인 AI 뉴스/밈 미디어 자동화 파이프라인

AI 소식을 가장 빠르고 정확하게 전달하면서, 가끔 밈으로 웃겨주는 인스타그램·쓰레드 계정을
**1인 사업가 + 에이전트**로 운영하기 위한 엔드투엔드 파이프라인입니다. 사람이 하는 일은
**하루 1~2번, 이메일에 "승인"/"반려"라고 답장하기**뿐입니다. 나머지(소스 모니터링, 스코어링,
카피라이팅, 카드 이미지 제작, 발행, 성과 분석·피드백)는 전부 에이전트가 처리합니다.

레퍼런스: [@9gag](https://instagram.com/9gag) 의 스낵커블한 비주얼 포맷 + [@evolving.ai](https://instagram.com/evolving.ai) 의
신뢰할 수 있는 뉴스 톤. `config/brand.json` 에서 이 톤을 잠가둡니다.

## 아키텍처

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
│  소스 모니터링  │ → │  큐레이션·스코어링 │ → │   초안 작성    │ → │   비주얼 생성    │
│ RSS/HN/Reddit│   │ Claude(점수/카테고리)│   │Claude(카피/캡션)│   │Playwright 카드 PNG│
└─────────────┘   └──────────────┘   └──────────────┘   └───────┬───────┘
                                                                  ↓
┌───────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
│  분석·피드백    │ ← │     발행      │ ← │   사람 승인    │ ← │  승인 대기 큐    │
│ IG/Threads Insights│ │IG/Threads Graph API│ │  이메일 답장(승인/반려)│ │  (lowdb JSON)   │
└───────────────┘   └──────────────┘   └──────────────┘   └───────────────┘
```

| 단계 | 코드 | 비고 |
|---|---|---|
| 소스 모니터링 | `src/sources/*` | RSS(`rss-parser`), Hacker News(Algolia API), Reddit(공개 JSON), X(선택, 유료) |
| 큐레이션·스코어링 | `src/curation/*` | 최신성/신뢰도/화제성은 코드로 계산, 브랜드 적합도·참신성·카테고리는 Claude가 판정 |
| 초안 작성 | `src/content/*` | `config/brand.json` 에 고정된 브랜드 보이스로 Claude가 뉴스카드/밈카드 카피 생성 |
| 비주얼 생성 | `templates/*.html` + `src/visuals/render.ts` | Playwright로 HTML 템플릿을 1080×1350 PNG로 스크린샷 |
| 사람 승인 | `src/approval/emailBot.ts` | 하루 09:00/19:00 배치로 이메일 발송 + 답장("승인"/"반려"/"수정") 자동 처리 |
| 발행 | `src/publish/*` | IG Graph API + Threads API, 둘 다 "컨테이너 생성 → 퍼블리시" 2단계 |
| 분석·피드백 | `src/analytics/*` | Insights API로 참여율 수집 → 소스별 성과 배수를 스코어링에 반영 |

상태는 전부 `data/db.json` (lowdb, 단일 JSON 파일)에 저장됩니다. 이 규모(하루 3~5개 포스트)에서는
Postgres 같은 별도 DB가 필요 없습니다.

## 빠른 시작

```bash
npm install
cp .env.example .env   # 키 채우기 (아래 "필요한 계정/키" 참고)

# 1) API 키 없이 카드 렌더링 파이프라인만 먼저 검증
npm run test:render
# public/cards/ 에 PNG 3장이 생성됩니다 — 템플릿 디자인을 먼저 눈으로 확인하세요.

# 2) 빌드 후 4개 프로세스를 각자 터미널(또는 pm2/docker)로 실행
npm run build
node dist/pipeline/runScheduler.js   # 07/12/17시: 수집→스코어링→초안→렌더→승인큐
node dist/approval/emailBot.js       # 09/19시 배치 발송 + 5분마다 답장(승인/반려/수정) 확인
node dist/publish/publisher.js       # 10분마다 승인된 항목을 IG+Threads에 발행
node dist/analytics/insights.js      # 매일 23:30 참여율 수집 → 스코어링 피드백
node dist/server/index.js            # 카드 이미지 퍼블릭 호스팅 (IMAGE_HOST=local일 때)
```

또는 `docker compose up -d` 한 줄로 5개 서비스를 한 번에 띄울 수 있습니다
(`docker-compose.yml`). 가장 저렴한 VPS(DigitalOcean/Lightsail 4~6\$/월) 한 대면 충분합니다.

## 필요한 계정/키 (`.env`)

1. **Anthropic API 키** — 스코어링 + 카피라이팅에 사용. https://console.anthropic.com
2. **승인용 전용 Gmail 계정** — 새 Gmail 계정을 하나 만드세요 (예: `ai.pulse.review@gmail.com`).
   1) 그 계정에 로그인 → 구글 계정 설정 → 보안 → **2단계 인증** 켜기 (필수).
   2) 2단계 인증을 켠 뒤에만 나오는 **앱 비밀번호(App Password)** 메뉴에서 "메일" 앱용 비밀번호 생성
      → 16자리 문자열이 나오면 그게 `EMAIL_APP_PASSWORD` 입니다.
   3) 그 Gmail 주소가 `EMAIL_USER`, 카드를 실제로 받아볼 평소 쓰는 이메일 주소가 `EMAIL_TO` 입니다.
3. **Instagram (Meta Graph API)** — 비즈니스용 Facebook 페이지에 IG 비즈니스 계정 연결 →
   [Meta for Developers](https://developers.facebook.com) 앱 생성 → `instagram_content_publish` 권한 →
   장기 액세스 토큰 발급.
4. **Threads API (선택, 나중에 추가 가능)** — `THREADS_ACCESS_TOKEN`/`THREADS_USER_ID`를 비워두면
   `src/publish/publisher.ts`가 자동으로 감지해서 **인스타그램에만 발행**하고 넘어갑니다. 즉 Threads
   설정 없이 바로 런칭해도 됩니다 — 준비되면 두 값만 채워 넣으면 다음 발행부터 자동으로 켜집니다.
   나중에 설정할 때는: Meta 앱 대시보드 → Use cases → "Access the Threads API" 로 진행.
5. **이미지 퍼블릭 호스팅** — Graph API는 이미지가 인터넷에서 접근 가능한 URL이어야 합니다.
   - 가장 쉬운 방법: `IMAGE_HOST=cloudinary` + `CLOUDINARY_URL` (무료 티어로 충분).
   - 또는 `IMAGE_HOST=local` + `src/server/index.ts` 를 실제 도메인 뒤에 배포(`BASE_PUBLIC_URL`).

RSS 피드 URL(`config/sources.json`)은 각 매체가 수시로 바꾸므로, 배포 전에 실제로 접속해서
유효한지 한 번씩 확인하세요.

## 매일 운영 흐름 (사람이 하는 유일한 일)

1. 아침 09:00, 저녁 19:00에 `EMAIL_TO` 주소로 카드 이미지(첨부파일) + 캡션 미리보기 메일이 배치로 도착합니다.
   메일 제목은 `[검토 필요 · 뉴스] 헤드라인... (ID:...)` 형식입니다.
2. 그 메일에 **그대로 "답장(Reply)"** 해서 제목은 건드리지 말고 본문 첫 줄에:
   - **"승인"** → 발행 대기열로. 10분 내 IG+Threads 동시 발행.
   - **"반려"** → 폐기.
   - **"수정"** 이라고 적고 둘째 줄부터 새 인스타그램 캡션을 통째로 적으면 → 그 캡션으로 자동 승인.
3. 5분마다 답장을 자동으로 확인합니다. 하루 1~2번, 몇 분이면 끝. 나머지는 스케줄러가 알아서 돕니다.

## 콘텐츠 믹스 & 발행량

- `config/brand.json.content_mix` — 뉴스 70% : 밈 30% 기본값. 큐레이션 단계에서 Claude가
  각 아이템을 `news`/`meme` 로 분류하고, `src/pipeline/collectAndDraft.ts` 가 이 비율대로 선별합니다.
- 하루 3회 수집 실행(07/12/17시) × 회당 목표치의 1.5배 초안 작성 → 반려되어도 하루 3개+ 발행이
  유지되도록 여유를 둡니다. `DAILY_POST_TARGET` 로 조절.
- 점수 90점 이상 + 발행 3시간 이내 뉴스는 `breaking_card` 템플릿(빨간 리본)으로 자동 승격됩니다.

## 스코어링 로직 (`src/curation/score.ts`)

정량 요소(코드로 계산)와 정성 요소(Claude 판정)를 합산합니다.

- **최신성** (30%): 반감기 6시간 지수감쇠
- **소스 신뢰도** (20%): `config/sources.json` 에 소스별로 사전 설정
- **화제성** (25%): HN 포인트 / Reddit 업보트를 배치 내 최댓값 대비 정규화
- **브랜드 적합도** (15%, Claude): 이 계정에 어울리는 뉴스인가
- **참신성** (10%, Claude): "또 벤치마크 1등" 같은 뻔한 뉴스인지, 진짜 새로운 앵글인지

발행 후 참여율(`src/analytics/feedback.ts`)이 소스별 성과 배수(`sourcePerformance`)로 다시
최종 점수에 곱해집니다 — "우리 팔로워는 Anthropic 안전성 이슈는 좋아하는데 펀딩 뉴스는
무시한다" 같은 패턴을 몇 주 안에 스스로 학습합니다.

## 1M 팔로워를 향한 성장 플레이북

1. **일관성이 곧 알고리즘 신뢰다.** 하루 3개+ 고정 발행이 이 시스템의 핵심 이유입니다 —
   빠지지 않는 게 화제성 있는 단발 포스트보다 중요합니다.
2. **뉴스:밈 = 7:3 을 지키되, 밈이 항상 더 잘 퍼집니다.** Insights 피드백 루프가 밈 비율을
   너무 낮추지 않도록 `config/brand.json` 에서 하한선을 관리하세요.
3. **브레이킹 뉴스는 속도가 전부입니다.** 07/12/17시 3회 수집 주기 사이에 대형 발표(OpenAI
   DevDay급)가 터지면, `npm run dev:collect` 를 수동으로 한 번 더 돌려 검토 메일이 바로
   오게 하세요 — 승인 답장 한 번이면 10분 내 발행됩니다.
4. **쓰레드는 텍스트가 왕입니다.** `captionThreads` 를 IG 캡션의 축소판이 아니라 별도로
   짧고 대화체로 쓰도록 브랜드 보이스 프롬프트가 강제합니다 — 그대로 유지하세요.
5. **댓글창이 2차 콘텐츠입니다.** 초기엔 사업가 본인이 상위 댓글에 직접 답글을 달아
   "사람이 운영하는 계정" 신뢰를 쌓는 걸 권장합니다(이 저장소 범위 밖, 수동 운영).
6. **매주 `sourcePerformance` 를 한 번 훑어보세요.** (`data/db.json` 의 `sourcePerformance` 키)
   특정 소스가 꾸준히 0.6대 배수면 `config/sources.json` 에서 아예 빼는 것도 고려하세요.

## 예상 비용 (월, 대략)

- Anthropic API: 하루 20~30건 스코어링 + 3~5건 카피 생성 기준 월 \$20~40 내외 (Haiku로 스코어링,
  Sonnet으로 카피라이팅 분리하면 더 절감 가능 — `src/utils/claudeClient.ts` 의 `CLAUDE_MODEL` 조정)
- VPS(도커 5개 서비스): \$6~12
- Cloudinary 무료 티어: \$0 (이 볼륨에서 충분)
- Meta Graph API / Threads API: 무료

## 확장 아이디어 (구현되어 있지 않음, 다음 단계)

- X 소스 연동 활성화 (`config/sources.json.x.enabled`, 유료 API 필요)
- 스토리/릴스용 세로 9:16 템플릿 추가
- 반려 사유를 큐레이션 프롬프트에 few-shot 예시로 되먹임
- 대시보드(웹 UI)로 이메일 대신/함께 승인 — 지금은 이메일만으로 충분히 빠릅니다
