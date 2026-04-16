# Working Bat

Server usage management bot for Slack.

**[English](#english) · [Korean](#korean-ver)**

---

## English

- [Overview](#overview)
- [Requirements](#requirements)
- [1. Create Slack App](#1-create-slack-app)
- [2. Bot Server Setup](#2-bot-server-setup)
- [3. Agent Setup (per server)](#3-agent-setup-per-server)
- [4. Run](#4-run)
- [Commands](#commands)

---

### Overview

- Slack Home tab shows real-time CPU / RAM / GPU status of all servers
- Reserve and release servers via buttons or slash commands
- Usage history logged with timestamps (KST)

---

### Requirements

- Node.js 18+
- Python 3.8+
- PM2 (`npm install -g pm2`)
- `better-sqlite3` build tools (`apt install python3 make g++`)

---

### 1. Create Slack App

**1-1. Create app**

Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**

---

**1-2. Enable Socket Mode**

`Settings` → `Socket Mode` → Enable → Generate App-Level Token  
Scope: `connections:write`  
**Save token** → this is `SLACK_APP_TOKEN` (`xapp-...`)

---

**1-3. Add OAuth Scopes**

`Features` → `OAuth & Permissions` → `Bot Token Scopes`


| Scope               | Purpose                 |
| ------------------- | ----------------------- |
| `chat:write`        | Send ephemeral messages |
| `users:info`        | Get display names       |
| `app_mentions:read` | -                       |


---

**1-4. Enable App Home**

`Features` → `App Home`  
→ **Home Tab** ✅  
→ **Allow users to send Slash commands and messages from the messages tab** ✅

---

**1-5. Enable Event Subscriptions**

`Features` → `Event Subscriptions` → Enable  
`Subscribe to bot events` → Add: `app_home_opened`

---

**1-6. Add Slash Command**

`Features` → `Slash Commands` → **Create New Command**


| Field       | Value                                                        |
| ----------- | ------------------------------------------------------------ |
| Command     | `/server`                                                    |
| Request URL | `https://placeholder.example.com` (Socket Mode — URL unused) |
| Description | Server management                                            |


---

**1-7. Install to Workspace**

`Settings` → `Install App` → **Install to Workspace**  
After install, copy **Bot User OAuth Token** → this is `SLACK_BOT_TOKEN` (`xoxb-...`)

---

**1-8. Collect Tokens**


| Variable               | Location                                     |
| ---------------------- | -------------------------------------------- |
| `SLACK_BOT_TOKEN`      | `OAuth & Permissions` → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | `Basic Information` → App Credentials        |
| `SLACK_APP_TOKEN`      | `Basic Information` → App-Level Tokens       |


---

### 2. Bot Server Setup

```bash
git clone https://github.com/<your-org>/working-bat.git
cd working-bat
npm install

cp .env.example .env
vi .env   # fill in all 4 tokens + set METRICS_SECRET to any random string
```

`.env`

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
METRICS_SECRET=your-random-secret
PORT=3000
```

Register servers in `db.js` if needed (default: server1–6 internal, koran1/hanshin1 external):

```javascript
db.exec(`
  INSERT OR IGNORE INTO server_status (server_id, group_name) VALUES
    ('server1','internal'), ...
    ('koran1','external'), ('hanshin1','external');
`);
```

---

### 3. Agent Setup (per server)

Copy agent files to each server, then:

```bash
cd /path/to/agent

cp agent.config.example agent.config
vi agent.config
```

`agent.config`

```ini
[agent]
server_id = server1           # unique ID matching db.js
url       = http://<bot-server-ip>:3000/metrics
token     = your-random-secret  # same as METRICS_SECRET in .env
interval  = 10                # seconds between reports
```

**Run as systemd service:**

```bash
cp agent.service.example /etc/systemd/system/server-agent.service
vi /etc/systemd/system/server-agent.service   # set User and WorkingDirectory

sudo systemctl daemon-reload
sudo systemctl enable --now server-agent
sudo systemctl status server-agent
```

`agent.service.example` key fields:

```ini
User=your-user
WorkingDirectory=/path/to/agent
ExecStart=/usr/bin/python3 /path/to/agent/agent.py
```

---

### 4. Run

**Start:**

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-start on reboot
```

**Restart after update:**

```bash
git pull
pm2 restart working-bat
```

**Check logs:**

```bash
pm2 logs working-bat --lines 30
```

---

### Commands


| Command                   | Description              |
| ------------------------- | ------------------------ |
| `/server status`          | All servers with metrics |
| `/server who`             | Currently in-use servers |
| `/server free`            | Available servers        |
| `/server use <id> [memo]` | Reserve a server         |
| `/server done <id>`       | Release a server         |
| `/server log [id]`        | Usage history            |
| `/server db`              | DB stats                 |


---

---

## Korean ver.

- [개요](#개요)
- [사전 준비](#사전-준비)
- [1. Slack 앱 생성](#1-slack-앱-생성)
- [2. 봇 서버 설정](#2-봇-서버-설정)
- [3. 에이전트 설정 (서버별)](#3-에이전트-설정-서버별)
- [4. 실행](#4-실행)
- [명령어](#명령어)

---

### 개요

- Slack Home 탭에서 전체 서버 CPU / RAM / GPU 실시간 확인
- 버튼 또는 슬래시 명령어로 서버 예약 및 반납
- 사용 기록 KST 타임스탬프로 자동 저장

---

### 사전 준비

- Node.js 18+
- Python 3.8+
- PM2 (`npm install -g pm2`)
- `better-sqlite3` 빌드 도구 (`apt install python3 make g++`)

---

### 1. Slack 앱 생성

**1-1. 앱 생성**

[api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**

---

**1-2. Socket Mode 활성화**

`Settings` → `Socket Mode` → 활성화 → App-Level Token 생성  
Scope: `connections:write`  
**토큰 저장** → `SLACK_APP_TOKEN` (`xapp-...`)

---

**1-3. OAuth 스코프 추가**

`Features` → `OAuth & Permissions` → `Bot Token Scopes`


| Scope               | 용도        |
| ------------------- | --------- |
| `chat:write`        | 메시지 전송    |
| `users:info`        | 사용자 이름 조회 |
| `app_mentions:read` | -         |


---

**1-4. App Home 활성화**

`Features` → `App Home`  
→ **Home Tab** ✅  
→ **Allow users to send Slash commands and messages from the messages tab** ✅

---

**1-5. Event Subscriptions 활성화**

`Features` → `Event Subscriptions` → 활성화  
`Subscribe to bot events` → 추가: `app_home_opened`

---

**1-6. 슬래시 명령어 추가**

`Features` → `Slash Commands` → **Create New Command**


| 항목          | 값                                                         |
| ----------- | --------------------------------------------------------- |
| Command     | `/server`                                                 |
| Request URL | `https://placeholder.example.com` (Socket Mode — URL 미사용) |
| Description | 서버 관리                                                     |


---

**1-7. 워크스페이스 설치**

`Settings` → `Install App` → **Install to Workspace**  
설치 후 **Bot User OAuth Token** 복사 → `SLACK_BOT_TOKEN` (`xoxb-...`)

---

**1-8. 토큰 정리**


| 환경변수                   | 위치                                           |
| ---------------------- | -------------------------------------------- |
| `SLACK_BOT_TOKEN`      | `OAuth & Permissions` → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | `Basic Information` → App Credentials        |
| `SLACK_APP_TOKEN`      | `Basic Information` → App-Level Tokens       |


---

### 2. 봇 서버 설정

```bash
git clone https://github.com/<your-org>/working-bat.git
cd working-bat
npm install

cp .env.example .env
vi .env   # 토큰 4개 + METRICS_SECRET 임의 문자열 입력
```

`.env`

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
METRICS_SECRET=랜덤-시크릿-문자열
PORT=3000
```

서버 목록 수정이 필요하면 `db.js`의 INSERT 구문 편집 (기본값: server1–6 내부, koran1/hanshin1 외부):

```javascript
db.exec(`
  INSERT OR IGNORE INTO server_status (server_id, group_name) VALUES
    ('server1','internal'), ...
    ('koran1','external'), ('hanshin1','external');
`);
```

---

### 3. 에이전트 설정 (서버별)

각 서버에 agent 폴더를 복사한 후:

```bash
cd /경로/to/agent

cp agent.config.example agent.config
vi agent.config
```

`agent.config`

```ini
[agent]
server_id = server1           # db.js에 등록된 서버 ID
url       = http://<봇서버IP>:3000/metrics
token     = 랜덤-시크릿-문자열  # .env의 METRICS_SECRET과 동일
interval  = 10                # 메트릭 전송 주기 (초)
```

**systemd 서비스로 등록:**

```bash
cp agent.service.example /etc/systemd/system/server-agent.service
vi /etc/systemd/system/server-agent.service   # User, WorkingDirectory 수정

sudo systemctl daemon-reload
sudo systemctl enable --now server-agent
sudo systemctl status server-agent
```

`agent.service.example` 수정 항목:

```ini
User=실제유저명
WorkingDirectory=/실제/경로/agent
ExecStart=/usr/bin/python3 /실제/경로/agent/agent.py
```

---

### 4. 실행

**시작:**

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 재부팅 후 자동 시작
```

**업데이트 후 재시작:**

```bash
git pull
pm2 restart working-bat
```

**로그 확인:**

```bash
pm2 logs working-bat --lines 30
```

---

### 명령어


| 명령어                     | 설명             |
| ----------------------- | -------------- |
| `/server status`        | 전체 서버 상태 + 메트릭 |
| `/server who`           | 현재 사용 중인 서버    |
| `/server free`          | 사용 가능한 서버      |
| `/server use <id> [메모]` | 서버 사용 시작       |
| `/server done <id>`     | 서버 사용 종료       |
| `/server log [id]`      | 사용 기록 조회       |
| `/server db`            | DB 통계          |


