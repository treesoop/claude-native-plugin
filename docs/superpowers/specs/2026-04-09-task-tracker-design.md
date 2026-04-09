# Task Tracker — Design Spec

Claude Code 사용량 추적 플러그인. 팀원의 Claude Code 사용 데이터를 수집하고 대시보드로 시각화.

**레포**: `treesoop/claude-native-plugin` 에 플러그인으로 추가

## 핵심 요구사항

1. 팀원: 본인 대시보드에서 사용 시간, 토큰, 프로젝트별 사용량 확인
2. 팀장: 팀원에게 invite key 발급, 팀 전체 사용량 대시보드 조회
3. 프로젝트 식별: git remote → repo 이름, git repo 없으면 "기타"
4. 전역 적용: 플러그인 설치 시 hook 자동 등록 → 모든 Claude Code 세션에서 동작

## 아키텍처

```
Claude Code ──hook──▶ task-tracker 스크립트 ──▶ Supabase REST API
                        (transcript 파싱)
                        (git remote 확인)

Supabase DB ◀── 팀원 로컬 대시보드 (localhost, invite_key로 조회)
            ◀── 팀장 웹 대시보드 (Vercel, GitHub OAuth)
```

### 컴포넌트

1. **플러그인 (hook + setup)** — `plugins/task-tracker/`에 위치, Claude Code 플러그인 시스템으로 설치
2. **Supabase DB** — 데이터 저장, RLS로 접근 제어
3. **Next.js 앱** — 팀장 웹 대시보드 + 팀원 로컬 대시보드 (동일 앱)

## 설치 및 설정

```bash
# 플러그인 설치
/plugin install task-tracker

# invite key 설정 (플러그인 설치 후 별도 실행)
task-tracker setup
# → invite key 입력 → ~/.task-tracker.json 생성
```

설정 파일 (`~/.task-tracker.json`):
```json
{
  "invite_key": "tk_abc123...",
  "name": "홍길동",
  "supabase_url": "https://xxx.supabase.co",
  "supabase_anon_key": "eyJ..."
}
```

## 데이터 모델

```sql
-- 팀
teams (
  id          uuid PK DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL,  -- Supabase Auth user id (팀장)
  created_at  timestamptz DEFAULT now()
)

-- 팀원
members (
  id          uuid PK DEFAULT gen_random_uuid(),
  team_id     uuid FK → teams NOT NULL,
  invite_key  text UNIQUE NOT NULL,  -- 팀장이 생성, 팀원에게 전달
  name        text NOT NULL,         -- 팀원 이름 (key 설정 시 입력)
  created_at  timestamptz DEFAULT now()
)

-- 사용 이벤트
usage_events (
  id              uuid PK DEFAULT gen_random_uuid(),
  invite_key      text FK → members.invite_key NOT NULL,
  session_id      text NOT NULL,
  event_type      text NOT NULL,  -- session_start, session_end, heartbeat
  project         text NOT NULL,  -- git remote repo 이름 or "기타"
  input_tokens    int DEFAULT 0,
  output_tokens   int DEFAULT 0,
  prompt_count    int DEFAULT 0,
  timestamp       timestamptz NOT NULL,
  created_at      timestamptz DEFAULT now()
)
```

## 플러그인 구조

```
plugins/task-tracker/
├── hooks/
│   └── hooks.json          # SessionStart, Stop, UserPromptSubmit hook 정의
├── scripts/
│   ├── track-usage.sh      # hook 진입점 (Node.js 호출)
│   ├── lib/
│   │   ├── parser.js       # transcript 파싱 (토큰 합산)
│   │   ├── sender.js       # Supabase REST API 전송
│   │   └── git-project.js  # git remote → 프로젝트명 추출
│   └── setup.js            # task-tracker setup CLI
├── package.json
└── README.md
```

### hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/track-usage.sh session_start"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/track-usage.sh stop"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/track-usage.sh heartbeat"
          }
        ]
      }
    ]
  }
}
```

### Hook 동작 흐름

1. Hook 실행 → stdin으로 hook input JSON 받음
2. `transcript_path`에서 transcript 읽어서 토큰 사용량 합산
3. `cwd`에서 `git remote get-url origin` 실행 → repo 이름 추출, 실패 시 "기타"
4. `~/.task-tracker.json`에서 invite_key + Supabase 설정 읽음
5. Supabase REST API로 POST
6. heartbeat는 5분 쓰로틀 (마지막 전송 시간을 로컬 파일에 기록)

## 대시보드

### 팀원 로컬 대시보드

`npx task-tracker-dashboard` → localhost에 Next.js 서버 실행, invite_key로 본인 데이터 조회

- 오늘/이번 주/이번 달 총 사용 시간
- 토큰 사용량 (input/output)
- 프로젝트별 사용량 비율
- 일별 사용 추이 차트

### 팀장 웹 대시보드 (Vercel)

GitHub OAuth 로그인 후:

- 팀원 로컬 대시보드의 모든 기능
- 팀 생성 / invite key 발급
- 팀원 목록 + 각 팀원의 사용량
- 팀 전체 요약 (총 토큰, 총 시간, 프로젝트별)
- 팀원 간 비교 뷰

### 웹 앱 구조

```
web/
├── app/
│   ├── page.tsx              # 랜딩
│   ├── dashboard/            # 개인 대시보드 (팀원 로컬 + 팀장 본인)
│   ├── team/                 # 팀장 대시보드
│   │   ├── page.tsx          # 팀 전체 요약
│   │   ├── members/          # 팀원별 상세
│   │   └── settings/         # 팀 설정, invite key 관리
│   └── api/                  # API routes
├── package.json
└── ...
```

## 보안

### RLS (Row Level Security)

- `usage_events` INSERT: invite_key가 members 테이블에 존재하는 경우만 허용
- `usage_events` SELECT: invite_key가 일치하거나, 팀장(owner_id)인 경우
- `members` SELECT: 본인 invite_key 또는 팀장
- `teams`: 팀장만 CRUD

### invite_key

- 형식: `tk_` + 랜덤 32자
- 팀장이 웹 대시보드에서 생성/폐기
- 유출 시 무효화 후 새 key 발급

### API 접근

- Hook 스크립트: Supabase anon key + invite_key (RLS가 보호)
- 팀장 대시보드: Supabase Auth (GitHub OAuth) + RLS

## 기술 스택

- **플러그인**: Node.js (shell script → Node.js 호출)
- **웹 앱**: Next.js 15 (App Router)
- **DB**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (GitHub OAuth, 팀장용)
- **차트**: recharts
- **스타일**: Tailwind CSS
- **배포**: Vercel (웹 대시보드)

## 레포 구조 (업데이트)

```
treesoop/claude-native-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json      # task-tracker 플러그인 추가
├── plugins/
│   ├── playwright-optimizer/  # 기존
│   └── task-tracker/          # 새로 추가
│       ├── hooks/
│       │   └── hooks.json
│       ├── scripts/
│       │   ├── track-usage.sh
│       │   ├── lib/
│       │   └── setup.js
│       ├── package.json
│       └── README.md
├── web/                       # 대시보드 웹앱 (별도 배포)
│   ├── app/
│   ├── package.json
│   └── ...
├── supabase/
│   └── migrations/
├── package.json
└── README.md
```

## 접근법

Hook에서 transcript를 파싱하고 Supabase REST API로 직접 전송. Claude Code 플러그인 시스템(`hooks.json`)으로 hook 등록을 자동화. 전송 실패 시 로컬 로그에 기록.
