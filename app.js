// Code refactoring JHKim w/ Claude  2026-04-15

require('dotenv').config();
const { App }                        = require('@slack/bolt');
const express                        = require('express');
const db                             = require('./db');
const store                          = require('./store');
const { buildHome, buildLogModal }   = require('./homeView');
const { handleCommand, getDisplayName } = require('./commands');

const slack = new App({
  token:         process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode:    true,
  appToken:      process.env.SLACK_APP_TOKEN,
});

// 모든 등록 사용자의 Home 탭 갱신
async function refresh() {
  const users = db.prepare('SELECT DISTINCT user_id FROM usage_log').all();
  await Promise.allSettled(
    users.map(u => slack.client.views.publish({ user_id: u.user_id, view: buildHome(u.user_id) }))
  );
}

slack.event('app_home_opened', async ({ event, client }) => {
  await client.views.publish({ user_id: event.user, view: buildHome(event.user) });
});

// 사용 시작 버튼 — 메모 입력 모달 오픈
slack.action('start_use', async ({ action, body, client, ack }) => {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal', callback_id: 'memo_modal', private_metadata: action.value,
      title:  { type: 'plain_text', text: '사용 시작' },
      submit: { type: 'plain_text', text: '확인' },
      close:  { type: 'plain_text', text: '취소' },
      blocks: [{
        type: 'input', block_id: 'memo', optional: true,
        label:   { type: 'plain_text', text: '작업 메모' },
        element: { type: 'plain_text_input', action_id: 'val', multiline: true,
                   placeholder: { type: 'plain_text', text: '예: 모델 학습, 데이터 전처리...' } }
      }]
    }
  });
});

// 메모 모달 제출 → 서버 사용 시작 처리
slack.view('memo_modal', async ({ view, body, client, ack }) => {
  await ack();
  const sid   = view.private_metadata;
  const memo  = view.state.values.memo?.val?.value || '';
  const uid   = body.user.id;
  const uname = await getDisplayName(client, uid);

  db.prepare(`UPDATE server_status SET in_use=1,user_id=?,username=?,memo=?,started_at=strftime('%Y-%m-%d %H:%M:%S','now','+9 hours') WHERE server_id=?`)
    .run(uid, uname, memo, sid);
  db.prepare(`INSERT INTO usage_log (server_id,user_id,username,action,memo,ts) VALUES (?,?,?,'start',?,strftime('%Y-%m-%d %H:%M:%S','now','+9 hours'))`)
    .run(sid, uid, uname, memo);
  await refresh();
});

// 사용 종료 버튼
slack.action('end_use', async ({ action, body, client, ack }) => {
  await ack();
  const uid   = body.user.id;
  const uname = await getDisplayName(client, uid);

  db.prepare(`UPDATE server_status SET in_use=0,user_id=NULL,username=NULL,memo=NULL,started_at=NULL WHERE server_id=?`)
    .run(action.value);
  db.prepare(`INSERT INTO usage_log (server_id,user_id,username,action,ts) VALUES (?,?,?,'end',strftime('%Y-%m-%d %H:%M:%S','now','+9 hours'))`)
    .run(action.value, uid, uname);
  await refresh();
});

// 타인 사용 중 클릭 → 사용자 정보 에페메럴 알림
slack.action('occupied', async ({ action, body, client, ack }) => {
  await ack();
  const s = db.prepare('SELECT * FROM server_status WHERE server_id=?').get(action.value);
  await client.chat.postEphemeral({
    channel: body.user.id, user: body.user.id,
    text: `*${action.value}* 는 현재 *${s.username}* 님이 사용 중입니다.${s.memo ? ` (${s.memo})` : ''}`
  });
});

// 전체 기록 버튼 → 모달 오픈
slack.action('show_log_modal', async ({ body, client, ack }) => {
  await ack();
  await client.views.open({ trigger_id: body.trigger_id, view: buildLogModal() });
});

// /server 슬래시 명령어
slack.command('/server', (args) => handleCommand(args, refresh));

// HTTP 서버
const http = express();
http.use(express.json());

http.post('/metrics', (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.METRICS_SECRET}`)
    return res.status(401).json({ error: 'unauthorized' });
  const d = req.body;
  if (!d.server_id) return res.status(400).json({ error: 'missing server_id' });
  store.save(d.server_id, d);
  res.json({ ok: true });
});

http.get('/health', (_, res) =>
  res.json({ ok: true, servers: Object.keys(store.metrics), uptime: process.uptime() })
);

http.listen(process.env.PORT || 3000, '0.0.0.0', () =>
  console.log(`[HTTP] port ${process.env.PORT || 3000}`)
);

(async () => {
  await slack.start();
  console.log('[Slack] connected');
})();
