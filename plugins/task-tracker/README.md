# task-tracker

Claude Code 사용량 추적 플러그인. 팀원의 토큰 사용량, 세션 시간, 프로젝트별 사용량을 Supabase에 기록합니다.

## Install

```bash
/plugin install task-tracker
```

## Setup

```bash
bash ~/.claude/plugins/task-tracker/scripts/setup.sh
```

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
