# Task Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code 사용량(토큰, 시간, 프로젝트)을 추적하는 플러그인 + 대시보드 구축

**Architecture:** Claude Code hook 시스템으로 세션/프롬프트 이벤트를 감지하고 Supabase에 전송. 팀원은 로컬 대시보드, 팀장은 Vercel 웹 대시보드에서 조회.

**Tech Stack:** Node.js (hook scripts), Next.js 15, Supabase (PostgreSQL + Auth + RLS), recharts, Tailwind CSS

---

## File Structure

```
plugins/task-tracker/
├── hooks/
│   └── hooks.json                  # hook 이벤트 정의
├── scripts/
│   ├── track-usage.sh              # hook 진입점 (shell → node)
│   ├── setup.sh                    # invite key 설정 CLI
│   └── lib/
│       ├── parser.js               # transcript JSONL 파싱, 토큰 합산
│       ├── sender.js               # Supabase REST API 전송
│       └── git-project.js          # git remote → 프로젝트명 추출
├── package.json
└── README.md

web/
├── app/
│   ├── layout.tsx                  # 루트 레이아웃
│   ├── page.tsx                    # 랜딩 (로그인 유도)
│   ├── login/
│   │   └── page.tsx                # GitHub OAuth 로그인
│   ├── dashboard/
│   │   └── page.tsx                # 개인 대시보드
│   ├── team/
│   │   ├── page.tsx                # 팀 전체 요약
│   │   ├── members/
│   │   │   └── page.tsx            # 팀원별 상세
│   │   └── settings/
│   │       └── page.tsx            # invite key 관리
│   └── api/
│       └── auth/
│           └── callback/
│               └── route.ts        # OAuth callback
├── lib/
│   ├── supabase-server.ts          # Supabase server client
│   ├── supabase-browser.ts         # Supabase browser client
│   └── types.ts                    # 공유 타입
├── components/
│   ├── usage-chart.tsx             # 일별 사용 추이 차트
│   ├── project-breakdown.tsx       # 프로젝트별 사용량 파이차트
│   ├── token-summary.tsx           # 토큰 요약 카드
│   ├── member-table.tsx            # 팀원 목록 테이블
│   └── date-range-picker.tsx       # 기간 선택
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts

supabase/
└── migrations/
    └── 001_initial_schema.sql      # teams, members, usage_events + RLS
```

---

### Task 1: Supabase DB 스키마 생성

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/001_initial_schema.sql

-- teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  created_at timestamptz default now()
);

-- members
create table members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invite_key text unique not null,
  name text not null,
  created_at timestamptz default now()
);

create index idx_members_invite_key on members(invite_key);
create index idx_members_team_id on members(team_id);

-- usage_events
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  invite_key text not null references members(invite_key) on delete cascade,
  session_id text not null,
  event_type text not null check (event_type in ('session_start', 'session_end', 'heartbeat')),
  project text not null default '기타',
  input_tokens int default 0,
  output_tokens int default 0,
  prompt_count int default 0,
  timestamp timestamptz not null,
  created_at timestamptz default now()
);

create index idx_usage_events_invite_key on usage_events(invite_key);
create index idx_usage_events_session_id on usage_events(session_id);
create index idx_usage_events_timestamp on usage_events(timestamp);

-- RLS
alter table teams enable row level security;
alter table members enable row level security;
alter table usage_events enable row level security;

-- teams: 팀장만 자기 팀 CRUD
create policy "teams_owner_all" on teams
  for all using (auth.uid() = owner_id);

-- members: 팀장이 자기 팀 멤버 관리
create policy "members_owner_all" on members
  for all using (
    team_id in (select id from teams where owner_id = auth.uid())
  );

-- members: 본인 invite_key로 조회
create policy "members_self_select" on members
  for select using (true);
  -- invite_key 기반 조회는 anon에서 함수로 처리

-- usage_events: INSERT는 invite_key가 유효하면 허용 (anon 사용자)
create policy "usage_events_insert" on usage_events
  for insert with check (
    invite_key in (select invite_key from members)
  );

-- usage_events: SELECT는 본인 invite_key 또는 팀장
create policy "usage_events_select" on usage_events
  for select using (
    invite_key in (
      select m.invite_key from members m
      join teams t on m.team_id = t.id
      where t.owner_id = auth.uid()
    )
    or true  -- anon은 invite_key를 직접 필터링해서 조회
  );
```

- [ ] **Step 2: Supabase MCP로 마이그레이션 실행**

Supabase MCP `apply_migration` 도구로 실행.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: add initial DB schema for task-tracker"
```

---

### Task 2: 플러그인 hooks.json 작성

**Files:**
- Create: `plugins/task-tracker/hooks/hooks.json`
- Create: `plugins/task-tracker/package.json`

- [ ] **Step 1: hooks.json 작성**

```json
{
  "description": "Track Claude Code usage (tokens, time, projects) and send to Supabase",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/track-usage.sh session_start",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/track-usage.sh stop",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/track-usage.sh heartbeat",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: package.json 작성**

```json
{
  "name": "task-tracker",
  "version": "1.0.0",
  "description": "Track Claude Code usage and send to Supabase",
  "private": true
}
```

- [ ] **Step 3: 커밋**

```bash
git add plugins/task-tracker/hooks/hooks.json plugins/task-tracker/package.json
git commit -m "feat: add task-tracker plugin hook definitions"
```

---

### Task 3: git-project.js — 프로젝트명 추출

**Files:**
- Create: `plugins/task-tracker/scripts/lib/git-project.js`

- [ ] **Step 1: 테스트용 스크립트 작성 후 수동 테스트**

```javascript
// plugins/task-tracker/scripts/lib/git-project.js
const { execSync } = require('child_process');

/**
 * cwd에서 git remote origin URL을 읽어 "owner/repo" 형태로 반환.
 * git repo가 아니거나 remote가 없으면 "기타" 반환.
 */
function getProjectName(cwd) {
  try {
    const url = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (sshMatch) return sshMatch[1];

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (httpsMatch) return httpsMatch[1];

    return url;
  } catch {
    return '기타';
  }
}

module.exports = { getProjectName };
```

- [ ] **Step 2: 수동 테스트**

```bash
cd /Users/dion/potenlab/projects/task_tracker
node -e "const {getProjectName} = require('./plugins/task-tracker/scripts/lib/git-project.js'); console.log(getProjectName('.'))"
# Expected: treesoop/claude-native-plugin

node -e "const {getProjectName} = require('./plugins/task-tracker/scripts/lib/git-project.js'); console.log(getProjectName('/tmp'))"
# Expected: 기타
```

- [ ] **Step 3: 커밋**

```bash
git add plugins/task-tracker/scripts/lib/git-project.js
git commit -m "feat: add git project name extractor"
```

---

### Task 4: parser.js — transcript 파싱

**Files:**
- Create: `plugins/task-tracker/scripts/lib/parser.js`

- [ ] **Step 1: parser 구현**

```javascript
// plugins/task-tracker/scripts/lib/parser.js
const fs = require('fs');
const readline = require('readline');

/**
 * transcript JSONL 파일에서 토큰 사용량과 프롬프트 수를 합산.
 * 각 줄은 JSON 객체. assistant 메시지에 usage 필드가 있음.
 */
async function parseTranscript(transcriptPath) {
  const result = {
    inputTokens: 0,
    outputTokens: 0,
    promptCount: 0,
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return result;
  }

  const fileStream = fs.createReadStream(transcriptPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);

      // 프롬프트 카운트: user 타입 메시지
      if (entry.type === 'user' && entry.message?.role === 'user') {
        result.promptCount++;
      }

      // 토큰 합산: assistant 메시지의 usage 필드
      const usage = entry.message?.usage;
      if (usage) {
        result.inputTokens += (usage.input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0)
          + (usage.cache_read_input_tokens || 0);
        result.outputTokens += (usage.output_tokens || 0);
      }
    } catch {
      // 파싱 실패한 줄은 무시
    }
  }

  return result;
}

module.exports = { parseTranscript };
```

- [ ] **Step 2: 실제 transcript로 수동 테스트**

```bash
node -e "
const {parseTranscript} = require('./plugins/task-tracker/scripts/lib/parser.js');
parseTranscript('$HOME/.claude/projects/-Users-dion-potenlab-projects-sfcseals/5042b377-c635-4af2-af15-f2d62f5d0748.jsonl')
  .then(r => console.log(JSON.stringify(r, null, 2)));
"
# Expected: { inputTokens: <number>, outputTokens: <number>, promptCount: <number> }
```

- [ ] **Step 3: 커밋**

```bash
git add plugins/task-tracker/scripts/lib/parser.js
git commit -m "feat: add transcript parser for token usage"
```

---

### Task 5: sender.js — Supabase 전송

**Files:**
- Create: `plugins/task-tracker/scripts/lib/sender.js`

- [ ] **Step 1: sender 구현**

```javascript
// plugins/task-tracker/scripts/lib/sender.js
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.env.HOME, '.task-tracker.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

/**
 * Supabase REST API로 usage_event INSERT.
 * anon key + RLS로 보호.
 */
async function sendEvent(event) {
  const config = loadConfig();
  if (!config || !config.invite_key) {
    return;
  }

  const { supabase_url, supabase_anon_key, invite_key } = config;

  const response = await fetch(`${supabase_url}/rest/v1/usage_events`, {
    method: 'POST',
    headers: {
      'apikey': supabase_anon_key,
      'Authorization': `Bearer ${supabase_anon_key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      invite_key,
      session_id: event.sessionId,
      event_type: event.eventType,
      project: event.project,
      input_tokens: event.inputTokens || 0,
      output_tokens: event.outputTokens || 0,
      prompt_count: event.promptCount || 0,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    fs.appendFileSync(
      path.join(process.env.HOME, '.task-tracker.log'),
      `[${new Date().toISOString()}] ERROR ${response.status}: ${errText}\n`
    );
  }
}

module.exports = { sendEvent, loadConfig };
```

- [ ] **Step 2: 커밋**

```bash
git add plugins/task-tracker/scripts/lib/sender.js
git commit -m "feat: add Supabase event sender"
```

---

### Task 6: track-usage.sh — hook 진입점

**Files:**
- Create: `plugins/task-tracker/scripts/track-usage.sh`

- [ ] **Step 1: shell 스크립트 작성**

```bash
#!/bin/bash
# task-tracker hook entry point
# Usage: track-usage.sh <event_type>
#   event_type: session_start | stop | heartbeat

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVENT_TYPE="$1"
INPUT=$(cat)

# heartbeat 쓰로틀: 5분 이내 재전송 방지
THROTTLE_FILE="$HOME/.task-tracker-last-heartbeat"
if [ "$EVENT_TYPE" = "heartbeat" ]; then
  if [ -f "$THROTTLE_FILE" ]; then
    LAST=$(cat "$THROTTLE_FILE")
    NOW=$(date +%s)
    DIFF=$((NOW - LAST))
    if [ "$DIFF" -lt 300 ]; then
      exit 0
    fi
  fi
  date +%s > "$THROTTLE_FILE"
fi

# Node.js로 위임
exec node "$SCRIPT_DIR/lib/main.js" "$EVENT_TYPE" <<< "$INPUT"
```

- [ ] **Step 2: main.js 작성 (Node.js 진입점)**

```javascript
// plugins/task-tracker/scripts/lib/main.js
const { parseTranscript } = require('./parser.js');
const { sendEvent } = require('./sender.js');
const { getProjectName } = require('./git-project.js');

async function main() {
  const eventType = process.argv[2]; // session_start | stop | heartbeat

  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const sessionId = hookData.session_id || 'unknown';
  const cwd = hookData.cwd || process.cwd();
  const transcriptPath = hookData.transcript_path || null;

  const project = getProjectName(cwd);

  let tokenData = { inputTokens: 0, outputTokens: 0, promptCount: 0 };

  // stop 이벤트: transcript 전체 파싱하여 최종 토큰 합산
  if (eventType === 'stop' && transcriptPath) {
    tokenData = await parseTranscript(transcriptPath);
  }

  // heartbeat: transcript 파싱하여 현재까지 토큰 합산
  if (eventType === 'heartbeat' && transcriptPath) {
    tokenData = await parseTranscript(transcriptPath);
  }

  const mappedEventType = eventType === 'stop' ? 'session_end' : 
                          eventType === 'session_start' ? 'session_start' : 
                          'heartbeat';

  await sendEvent({
    sessionId,
    eventType: mappedEventType,
    project,
    inputTokens: tokenData.inputTokens,
    outputTokens: tokenData.outputTokens,
    promptCount: tokenData.promptCount,
  });
}

main().catch(() => process.exit(0));
```

- [ ] **Step 3: chmod +x**

```bash
chmod +x plugins/task-tracker/scripts/track-usage.sh
```

- [ ] **Step 4: 커밋**

```bash
git add plugins/task-tracker/scripts/track-usage.sh plugins/task-tracker/scripts/lib/main.js
git commit -m "feat: add hook entry point and main orchestrator"
```

---

### Task 7: setup.sh — invite key 설정 CLI

**Files:**
- Create: `plugins/task-tracker/scripts/setup.sh`

- [ ] **Step 1: setup 스크립트 작성**

```bash
#!/bin/bash
# task-tracker setup: configure invite key
# Usage: bash plugins/task-tracker/scripts/setup.sh

CONFIG_FILE="$HOME/.task-tracker.json"

echo "=== Task Tracker Setup ==="
echo ""

read -p "Invite Key: " INVITE_KEY
read -p "Your Name: " USER_NAME
read -p "Supabase URL (e.g. https://xxx.supabase.co): " SUPABASE_URL
read -p "Supabase Anon Key: " SUPABASE_ANON_KEY

cat > "$CONFIG_FILE" << EOF
{
  "invite_key": "$INVITE_KEY",
  "name": "$USER_NAME",
  "supabase_url": "$SUPABASE_URL",
  "supabase_anon_key": "$SUPABASE_ANON_KEY"
}
EOF

echo ""
echo "Config saved to $CONFIG_FILE"
echo "Task tracker is now active for all Claude Code sessions."
```

- [ ] **Step 2: chmod +x 및 커밋**

```bash
chmod +x plugins/task-tracker/scripts/setup.sh
git add plugins/task-tracker/scripts/setup.sh
git commit -m "feat: add setup script for invite key configuration"
```

---

### Task 8: marketplace.json 업데이트 + README

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Create: `plugins/task-tracker/README.md`

- [ ] **Step 1: marketplace.json에 task-tracker 추가**

`.claude-plugin/marketplace.json`의 `plugins` 배열에 추가:

```json
{
  "name": "task-tracker",
  "description": "Track Claude Code usage (tokens, time, projects) per team member",
  "source": "./plugins/task-tracker",
  "category": "analytics",
  "tags": ["usage-tracking", "tokens", "team", "analytics", "supabase"]
}
```

- [ ] **Step 2: README 작성**

```markdown
# task-tracker

Claude Code 사용량 추적 플러그인. 팀원의 토큰 사용량, 세션 시간, 프로젝트별 사용량을 Supabase에 기록합니다.

## Install

\`\`\`bash
/plugin install task-tracker
\`\`\`

## Setup

\`\`\`bash
bash ~/.claude/plugins/task-tracker/scripts/setup.sh
\`\`\`

invite key, 이름, Supabase URL/Key를 입력하면 설정 완료.

## How It Works

Claude Code의 hook 시스템을 통해 세션 시작/종료, 프롬프트 전송 시 자동으로 사용량 데이터를 수집합니다.

| Hook | 수집 데이터 |
|------|------------|
| SessionStart | 세션 시작, 프로젝트명 |
| Stop | 세션 종료, 최종 토큰 합산 |
| UserPromptSubmit | heartbeat (5분 쓰로틀) |

## Data Collected

- 세션 ID, 시작/종료 시간
- input/output 토큰 수
- 프롬프트 횟수
- 프로젝트명 (git remote origin)

## Requirements

- Node.js 18+
- Supabase 프로젝트 (팀장이 설정)
- invite key (팀장으로부터 발급)
```

- [ ] **Step 3: 커밋**

```bash
git add .claude-plugin/marketplace.json plugins/task-tracker/README.md
git commit -m "feat: register task-tracker plugin in marketplace"
```

---

### Task 9: 통합 테스트 — 플러그인 동작 확인

- [ ] **Step 1: 설정 파일 생성 (테스트용)**

```bash
cat > ~/.task-tracker.json << 'EOF'
{
  "invite_key": "tk_test123",
  "name": "Test User",
  "supabase_url": "https://<PROJECT>.supabase.co",
  "supabase_anon_key": "<ANON_KEY>"
}
EOF
```

- [ ] **Step 2: 수동 hook 테스트 — session_start**

```bash
echo '{"session_id":"test-001","cwd":"/Users/dion/potenlab/projects/task_tracker","transcript_path":"","hook_event_name":"SessionStart"}' | bash plugins/task-tracker/scripts/track-usage.sh session_start
```

Supabase에서 확인: `select * from usage_events where session_id = 'test-001'`

- [ ] **Step 3: 수동 hook 테스트 — heartbeat**

```bash
rm -f ~/.task-tracker-last-heartbeat
echo '{"session_id":"test-001","cwd":"/Users/dion/potenlab/projects/task_tracker","transcript_path":"'$HOME'/.claude/projects/-Users-dion-potenlab-projects-sfcseals/5042b377-c635-4af2-af15-f2d62f5d0748.jsonl","hook_event_name":"UserPromptSubmit"}' | bash plugins/task-tracker/scripts/track-usage.sh heartbeat
```

Supabase에서 확인: heartbeat 이벤트가 토큰 데이터와 함께 저장되었는지 확인

- [ ] **Step 4: 쓰로틀 테스트 — 5분 이내 재전송 차단 확인**

```bash
# 바로 다시 실행 → 전송되지 않아야 함
echo '{"session_id":"test-001","cwd":".","transcript_path":"","hook_event_name":"UserPromptSubmit"}' | bash plugins/task-tracker/scripts/track-usage.sh heartbeat
# Supabase에 새 행이 추가되지 않아야 함
```

- [ ] **Step 5: 커밋 (테스트 통과 확인 후)**

```bash
git add -A
git commit -m "test: verify plugin integration with Supabase"
```

---

### Task 10: Next.js 웹앱 초기 설정

**Files:**
- Create: `web/` 디렉토리 (Next.js 프로젝트)

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/dion/potenlab/projects/task_tracker
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

- [ ] **Step 2: Supabase 의존성 추가**

```bash
cd web
npm install @supabase/supabase-js @supabase/ssr recharts
```

- [ ] **Step 3: 환경변수 파일 생성**

```bash
# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
```

- [ ] **Step 4: 커밋**

```bash
cd /Users/dion/potenlab/projects/task_tracker
git add web/
git commit -m "feat: scaffold Next.js web app for dashboard"
```

---

### Task 11: Supabase 클라이언트 설정

**Files:**
- Create: `web/lib/supabase-server.ts`
- Create: `web/lib/supabase-browser.ts`
- Create: `web/lib/types.ts`

- [ ] **Step 1: 타입 정의**

```typescript
// web/lib/types.ts
export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Member {
  id: string;
  team_id: string;
  invite_key: string;
  name: string;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  invite_key: string;
  session_id: string;
  event_type: 'session_start' | 'session_end' | 'heartbeat';
  project: string;
  input_tokens: number;
  output_tokens: number;
  prompt_count: number;
  timestamp: string;
  created_at: string;
}
```

- [ ] **Step 2: 브라우저 클라이언트**

```typescript
// web/lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: 서버 클라이언트**

```typescript
// web/lib/supabase-server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add web/lib/
git commit -m "feat: add Supabase client setup and types"
```

---

### Task 12: GitHub OAuth 로그인

**Files:**
- Create: `web/app/login/page.tsx`
- Create: `web/app/api/auth/callback/route.ts`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: 로그인 페이지**

```tsx
// web/app/login/page.tsx
'use client';

import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Task Tracker</h1>
        <p className="text-gray-600 mb-8">Claude Code 사용량 대시보드</p>
        <button
          onClick={handleLogin}
          className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-700"
        >
          GitHub로 로그인
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: OAuth callback route**

```typescript
// web/app/api/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL('/team', request.url));
}
```

- [ ] **Step 3: 커밋**

```bash
git add web/app/login/ web/app/api/auth/
git commit -m "feat: add GitHub OAuth login flow"
```

---

### Task 13: 개인 대시보드 (팀원용)

**Files:**
- Create: `web/app/dashboard/page.tsx`
- Create: `web/components/token-summary.tsx`
- Create: `web/components/usage-chart.tsx`
- Create: `web/components/project-breakdown.tsx`
- Create: `web/components/date-range-picker.tsx`

- [ ] **Step 1: date-range-picker 컴포넌트**

```tsx
// web/components/date-range-picker.tsx
'use client';

interface DateRangePickerProps {
  value: 'today' | 'week' | 'month';
  onChange: (value: 'today' | 'week' | 'month') => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const options = [
    { key: 'today' as const, label: '오늘' },
    { key: 'week' as const, label: '이번 주' },
    { key: 'month' as const, label: '이번 달' },
  ];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-4 py-2 rounded-lg text-sm ${
            value === opt.key
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: token-summary 컴포넌트**

```tsx
// web/components/token-summary.tsx
interface TokenSummaryProps {
  inputTokens: number;
  outputTokens: number;
  totalTime: string;
  promptCount: number;
}

export function TokenSummary({ inputTokens, outputTokens, totalTime, promptCount }: TokenSummaryProps) {
  const cards = [
    { label: '사용 시간', value: totalTime },
    { label: 'Input Tokens', value: inputTokens.toLocaleString() },
    { label: 'Output Tokens', value: outputTokens.toLocaleString() },
    { label: '프롬프트 수', value: promptCount.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500">{card.label}</p>
          <p className="text-2xl font-bold mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: usage-chart 컴포넌트**

```tsx
// web/components/usage-chart.tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface UsageChartProps {
  data: { date: string; inputTokens: number; outputTokens: number }[];
}

export function UsageChart({ data }: UsageChartProps) {
  return (
    <div className="bg-white rounded-xl p-4 border">
      <h3 className="text-sm font-medium text-gray-500 mb-4">일별 토큰 사용량</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="inputTokens" name="Input" fill="#6366f1" stackId="tokens" />
          <Bar dataKey="outputTokens" name="Output" fill="#a5b4fc" stackId="tokens" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: project-breakdown 컴포넌트**

```tsx
// web/components/project-breakdown.tsx
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ProjectBreakdownProps {
  data: { project: string; tokens: number }[];
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

export function ProjectBreakdown({ data }: ProjectBreakdownProps) {
  return (
    <div className="bg-white rounded-xl p-4 border">
      <h3 className="text-sm font-medium text-gray-500 mb-4">프로젝트별 사용량</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey="tokens" nameKey="project" cx="50%" cy="50%" outerRadius={100} label>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: 대시보드 페이지**

```tsx
// web/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { UsageEvent } from '@/lib/types';
import { TokenSummary } from '@/components/token-summary';
import { UsageChart } from '@/components/usage-chart';
import { ProjectBreakdown } from '@/components/project-breakdown';
import { DateRangePicker } from '@/components/date-range-picker';

function getDateRange(range: 'today' | 'week' | 'month'): string {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function calcTotalTime(events: UsageEvent[]): string {
  const sessions = new Map<string, { start?: string; end?: string }>();
  for (const e of events) {
    const s = sessions.get(e.session_id) || {};
    if (e.event_type === 'session_start') s.start = e.timestamp;
    if (e.event_type === 'session_end') s.end = e.timestamp;
    if (e.event_type === 'heartbeat') {
      if (!s.start) s.start = e.timestamp;
      s.end = e.timestamp;
    }
    sessions.set(e.session_id, s);
  }
  let totalMs = 0;
  for (const s of sessions.values()) {
    if (s.start && s.end) {
      totalMs += new Date(s.end).getTime() - new Date(s.start).getTime();
    }
  }
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const inviteKey = searchParams.get('key');
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const [events, setEvents] = useState<UsageEvent[]>([]);

  useEffect(() => {
    if (!inviteKey) return;
    const supabase = createClient();
    const from = getDateRange(range);
    supabase
      .from('usage_events')
      .select('*')
      .eq('invite_key', inviteKey)
      .gte('timestamp', from)
      .order('timestamp', { ascending: true })
      .then(({ data }) => setEvents(data || []));
  }, [inviteKey, range]);

  if (!inviteKey) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">invite key가 필요합니다. URL에 ?key=YOUR_KEY 를 추가하세요.</p>
      </div>
    );
  }

  // session_end 이벤트에서 최종 토큰 합산
  const endEvents = events.filter((e) => e.event_type === 'session_end');
  const inputTokens = endEvents.reduce((sum, e) => sum + e.input_tokens, 0);
  const outputTokens = endEvents.reduce((sum, e) => sum + e.output_tokens, 0);
  const promptCount = endEvents.reduce((sum, e) => sum + e.prompt_count, 0);

  // 일별 차트 데이터
  const dailyMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const e of endEvents) {
    const date = e.timestamp.slice(0, 10);
    const d = dailyMap.get(date) || { inputTokens: 0, outputTokens: 0 };
    d.inputTokens += e.input_tokens;
    d.outputTokens += e.output_tokens;
    dailyMap.set(date, d);
  }
  const chartData = Array.from(dailyMap.entries()).map(([date, d]) => ({ date, ...d }));

  // 프로젝트별 데이터
  const projectMap = new Map<string, number>();
  for (const e of endEvents) {
    projectMap.set(e.project, (projectMap.get(e.project) || 0) + e.input_tokens + e.output_tokens);
  }
  const projectData = Array.from(projectMap.entries()).map(([project, tokens]) => ({ project, tokens }));

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <TokenSummary
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        totalTime={calcTotalTime(events)}
        promptCount={promptCount}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UsageChart data={chartData} />
        <ProjectBreakdown data={projectData} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 커밋**

```bash
git add web/app/dashboard/ web/components/
git commit -m "feat: add personal dashboard with charts"
```

---

### Task 14: 팀장 대시보드 — 팀 관리 + invite key 발급

**Files:**
- Create: `web/app/team/page.tsx`
- Create: `web/app/team/settings/page.tsx`
- Create: `web/app/team/members/page.tsx`
- Create: `web/components/member-table.tsx`

- [ ] **Step 1: member-table 컴포넌트**

```tsx
// web/components/member-table.tsx
import { Member } from '@/lib/types';

interface MemberTableProps {
  members: (Member & { inputTokens: number; outputTokens: number; promptCount: number })[];
}

export function MemberTable({ members }: MemberTableProps) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">이름</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Input Tokens</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Output Tokens</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">프롬프트</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3 text-sm">{m.name}</td>
              <td className="px-4 py-3 text-sm text-right">{m.inputTokens.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right">{m.outputTokens.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right">{m.promptCount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 팀 설정 페이지 (invite key 관리)**

```tsx
// web/app/team/settings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Team, Member } from '@/lib/types';

function generateInviteKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'tk_';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export default function TeamSettingsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamName, setTeamName] = useState('');
  const [memberName, setMemberName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1);

    if (teams && teams.length > 0) {
      setTeam(teams[0]);
      const { data: mems } = await supabase
        .from('members')
        .select('*')
        .eq('team_id', teams[0].id);
      setMembers(mems || []);
    }
  }

  async function createTeam() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !teamName) return;
    await supabase.from('teams').insert({ name: teamName, owner_id: user.id });
    await loadData();
    setTeamName('');
  }

  async function addMember() {
    if (!team || !memberName) return;
    const inviteKey = generateInviteKey();
    await supabase.from('members').insert({
      team_id: team.id,
      invite_key: inviteKey,
      name: memberName,
    });
    await loadData();
    setMemberName('');
  }

  async function deleteMember(id: string) {
    await supabase.from('members').delete().eq('id', id);
    await loadData();
  }

  if (!team) {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">팀 생성</h1>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="팀 이름"
          className="border rounded-lg px-4 py-2 w-full mb-4"
        />
        <button onClick={createTeam} className="bg-gray-900 text-white px-6 py-2 rounded-lg w-full">
          생성
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{team.name} — 설정</h1>

      <div className="bg-white rounded-xl border p-4">
        <h2 className="font-medium mb-4">팀원 추가</h2>
        <div className="flex gap-2">
          <input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="팀원 이름"
            className="border rounded-lg px-4 py-2 flex-1"
          />
          <button onClick={addMember} className="bg-gray-900 text-white px-6 py-2 rounded-lg">
            추가
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">이름</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Invite Key</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-sm">{m.name}</td>
                <td className="px-4 py-3 text-sm font-mono text-xs">{m.invite_key}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <button
                    onClick={() => navigator.clipboard.writeText(m.invite_key)}
                    className="text-blue-600 hover:underline mr-3"
                  >
                    복사
                  </button>
                  <button
                    onClick={() => deleteMember(m.id)}
                    className="text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 팀 전체 요약 페이지**

```tsx
// web/app/team/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Member, UsageEvent } from '@/lib/types';
import { TokenSummary } from '@/components/token-summary';
import { UsageChart } from '@/components/usage-chart';
import { MemberTable } from '@/components/member-table';
import { DateRangePicker } from '@/components/date-range-picker';

function getDateRange(range: 'today' | 'week' | 'month'): string {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function TeamPage() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, [range]);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: teams } = await supabase.from('teams').select('*').eq('owner_id', user.id).limit(1);
    if (!teams || teams.length === 0) return;

    const { data: mems } = await supabase.from('members').select('*').eq('team_id', teams[0].id);
    setMembers(mems || []);

    if (mems && mems.length > 0) {
      const keys = mems.map((m) => m.invite_key);
      const from = getDateRange(range);
      const { data: evts } = await supabase
        .from('usage_events')
        .select('*')
        .in('invite_key', keys)
        .gte('timestamp', from)
        .order('timestamp', { ascending: true });
      setEvents(evts || []);
    }
  }

  const endEvents = events.filter((e) => e.event_type === 'session_end');
  const inputTokens = endEvents.reduce((sum, e) => sum + e.input_tokens, 0);
  const outputTokens = endEvents.reduce((sum, e) => sum + e.output_tokens, 0);
  const promptCount = endEvents.reduce((sum, e) => sum + e.prompt_count, 0);

  // 일별 차트
  const dailyMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const e of endEvents) {
    const date = e.timestamp.slice(0, 10);
    const d = dailyMap.get(date) || { inputTokens: 0, outputTokens: 0 };
    d.inputTokens += e.input_tokens;
    d.outputTokens += e.output_tokens;
    dailyMap.set(date, d);
  }
  const chartData = Array.from(dailyMap.entries()).map(([date, d]) => ({ date, ...d }));

  // 팀원별 합산
  const memberStats = members.map((m) => {
    const mEvents = endEvents.filter((e) => e.invite_key === m.invite_key);
    return {
      ...m,
      inputTokens: mEvents.reduce((sum, e) => sum + e.input_tokens, 0),
      outputTokens: mEvents.reduce((sum, e) => sum + e.output_tokens, 0),
      promptCount: mEvents.reduce((sum, e) => sum + e.prompt_count, 0),
    };
  });

  // 시간 계산
  const sessions = new Map<string, { start?: string; end?: string }>();
  for (const e of events) {
    const s = sessions.get(e.session_id) || {};
    if (e.event_type === 'session_start') s.start = e.timestamp;
    if (e.event_type === 'session_end') s.end = e.timestamp;
    if (e.event_type === 'heartbeat') {
      if (!s.start) s.start = e.timestamp;
      s.end = e.timestamp;
    }
    sessions.set(e.session_id, s);
  }
  let totalMs = 0;
  for (const s of sessions.values()) {
    if (s.start && s.end) totalMs += new Date(s.end).getTime() - new Date(s.start).getTime();
  }
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">팀 대시보드</h1>
        <div className="flex gap-4">
          <DateRangePicker value={range} onChange={setRange} />
          <a href="/team/settings" className="text-sm text-gray-500 hover:underline self-center">설정</a>
        </div>
      </div>
      <TokenSummary
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        totalTime={`${hours}h ${mins}m`}
        promptCount={promptCount}
      />
      <UsageChart data={chartData} />
      <div>
        <h2 className="text-lg font-medium mb-3">팀원별 사용량</h2>
        <MemberTable members={memberStats} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 팀원 상세 페이지**

```tsx
// web/app/team/members/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { UsageEvent } from '@/lib/types';
import { TokenSummary } from '@/components/token-summary';
import { UsageChart } from '@/components/usage-chart';
import { ProjectBreakdown } from '@/components/project-breakdown';
import { DateRangePicker } from '@/components/date-range-picker';

function getDateRange(range: 'today' | 'week' | 'month'): string {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function MemberDetailPage() {
  const searchParams = useSearchParams();
  const inviteKey = searchParams.get('key');
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [memberName, setMemberName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (!inviteKey) return;
    const from = getDateRange(range);

    supabase.from('members').select('name').eq('invite_key', inviteKey).single()
      .then(({ data }) => { if (data) setMemberName(data.name); });

    supabase
      .from('usage_events')
      .select('*')
      .eq('invite_key', inviteKey)
      .gte('timestamp', from)
      .order('timestamp', { ascending: true })
      .then(({ data }) => setEvents(data || []));
  }, [inviteKey, range]);

  if (!inviteKey) return null;

  const endEvents = events.filter((e) => e.event_type === 'session_end');
  const inputTokens = endEvents.reduce((sum, e) => sum + e.input_tokens, 0);
  const outputTokens = endEvents.reduce((sum, e) => sum + e.output_tokens, 0);
  const promptCount = endEvents.reduce((sum, e) => sum + e.prompt_count, 0);

  const dailyMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const e of endEvents) {
    const date = e.timestamp.slice(0, 10);
    const d = dailyMap.get(date) || { inputTokens: 0, outputTokens: 0 };
    d.inputTokens += e.input_tokens;
    d.outputTokens += e.output_tokens;
    dailyMap.set(date, d);
  }
  const chartData = Array.from(dailyMap.entries()).map(([date, d]) => ({ date, ...d }));

  const projectMap = new Map<string, number>();
  for (const e of endEvents) {
    projectMap.set(e.project, (projectMap.get(e.project) || 0) + e.input_tokens + e.output_tokens);
  }
  const projectData = Array.from(projectMap.entries()).map(([project, tokens]) => ({ project, tokens }));

  const sessions = new Map<string, { start?: string; end?: string }>();
  for (const e of events) {
    const s = sessions.get(e.session_id) || {};
    if (e.event_type === 'session_start') s.start = e.timestamp;
    if (e.event_type === 'session_end') s.end = e.timestamp;
    if (e.event_type === 'heartbeat') { if (!s.start) s.start = e.timestamp; s.end = e.timestamp; }
    sessions.set(e.session_id, s);
  }
  let totalMs = 0;
  for (const s of sessions.values()) {
    if (s.start && s.end) totalMs += new Date(s.end).getTime() - new Date(s.start).getTime();
  }
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <a href="/team" className="text-sm text-gray-500 hover:underline">← 팀 대시보드</a>
          <h1 className="text-2xl font-bold mt-1">{memberName}</h1>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <TokenSummary inputTokens={inputTokens} outputTokens={outputTokens} totalTime={`${hours}h ${mins}m`} promptCount={promptCount} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UsageChart data={chartData} />
        <ProjectBreakdown data={projectData} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 커밋**

```bash
git add web/app/team/ web/components/member-table.tsx
git commit -m "feat: add team dashboard with member management"
```

---

### Task 15: 랜딩 페이지 + 네비게이션

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: 랜딩 페이지**

```tsx
// web/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Task Tracker</h1>
        <p className="text-gray-600 mb-8">Claude Code 사용량 추적 대시보드</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-700"
          >
            팀장 로그인
          </Link>
          <Link
            href="/dashboard"
            className="border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
          >
            개인 대시보드
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 루트 레이아웃 정리**

`web/app/layout.tsx`에서 기본 Next.js 스타일 유지. body에 `bg-gray-50` 추가.

- [ ] **Step 3: 커밋**

```bash
git add web/app/page.tsx web/app/layout.tsx
git commit -m "feat: add landing page and layout"
```

---

### Task 16: Vercel 배포 설정

**Files:**
- Create: `web/vercel.json`

- [ ] **Step 1: vercel.json 작성**

```json
{
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

- [ ] **Step 2: Supabase에서 GitHub OAuth 설정**

Supabase Dashboard → Authentication → Providers → GitHub 활성화.
Redirect URL: `https://<VERCEL_DOMAIN>/api/auth/callback`

- [ ] **Step 3: Vercel 배포**

```bash
cd web
npx vercel --prod
```

환경변수 설정: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 4: 커밋**

```bash
git add web/vercel.json
git commit -m "feat: add Vercel deployment config"
```

---

### Task 17: 루트 README 업데이트

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README에 task-tracker 추가**

plugins 테이블에 task-tracker 행 추가:

```markdown
| [task-tracker](./plugins/task-tracker) | Track Claude Code usage (tokens, time, projects) per team | Team analytics |
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: add task-tracker to README"
```
