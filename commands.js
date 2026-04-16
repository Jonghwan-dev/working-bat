// Code refactoring JHKim w/ Claude  2026-04-15

const db    = require('./db');
const store = require('./store');

const HELP = [
  '`/server status`          — 전체 서버 상태',
  '`/server who`             — 사용 중인 서버',
  '`/server free`            — 사용 가능한 서버',
  '`/server use <id> [메모]` — 사용 시작',
  '`/server done <id>`       — 사용 종료',
  '`/server log [id]`        — 사용 기록',
  '`/server db`              — DB 통계',
].join('\n');

async function getDisplayName(client, userId) {
  try {
    const { user } = await client.users.info({ user: userId });
    return user.profile.display_name || user.profile.real_name || user.name;
  } catch {
    return userId;
  }
}

async function handleCommand({ command, ack, respond, client }, refresh) {
  await ack();
  const [sub, sid, ...rest] = command.text.trim().split(/\s+/);
  const memo  = rest.join(' ');
  const uid   = command.user_id;
  const uname = await getDisplayName(client, uid);

  switch (sub) {
    case 'status': {
      const rows  = db.prepare('SELECT * FROM server_status ORDER BY group_name, server_id').all();
      const lines = rows.map(s => {
        const m     = store.metrics[s.server_id];
        const state = !m ? 'OFF' : s.in_use ? `사용중(${s.username})` : '사용가능';
        const gpu   = m?.gpus?.length ? ' ' + m.gpus.map((g, i) => `GPU${i}:${g.util}%`).join(' ') : '';
        return `\`${s.server_id}\` [${s.group_name}] ${state}  CPU:${m?.cpu ?? '--'}%  RAM:${m?.ram_pct ?? '--'}%${gpu}`;
      });
      return respond({ text: lines.join('\n') });
    }

    case 'use': {
      if (!sid) break;
      const s = db.prepare('SELECT * FROM server_status WHERE server_id=?').get(sid);
      if (!s)       return respond({ text: `없는 서버: ${sid}` });
      if (s.in_use) return respond({ text: `${sid} 는 *${s.username}* 님 사용 중` });
      db.prepare(`UPDATE server_status SET in_use=1,user_id=?,username=?,memo=?,started_at=strftime('%Y-%m-%d %H:%M:%S','now','+9 hours') WHERE server_id=?`)
        .run(uid, uname, memo, sid);
      db.prepare(`INSERT INTO usage_log (server_id,user_id,username,action,memo,ts) VALUES (?,?,?,'start',?,strftime('%Y-%m-%d %H:%M:%S','now','+9 hours'))`)
        .run(sid, uid, uname, memo);
      await refresh();
      return respond({ text: `${sid} 사용 시작${memo ? ` — ${memo}` : ''}` });
    }

    case 'done': {
      if (!sid) break;
      const s = db.prepare('SELECT * FROM server_status WHERE server_id=?').get(sid);
      if (!s) return respond({ text: `없는 서버: ${sid}` });
      db.prepare(`UPDATE server_status SET in_use=0,user_id=NULL,username=NULL,memo=NULL,started_at=NULL WHERE server_id=?`)
        .run(sid);
      db.prepare(`INSERT INTO usage_log (server_id,user_id,username,action,ts) VALUES (?,?,?,'end',strftime('%Y-%m-%d %H:%M:%S','now','+9 hours'))`)
        .run(sid, uid, uname);
      await refresh();
      return respond({ text: `${sid} 사용 완료` });
    }

    case 'log': {
      const rows = sid
        ? db.prepare(`SELECT * FROM usage_log WHERE server_id=? ORDER BY ts DESC LIMIT 30`).all(sid)
        : db.prepare(`SELECT * FROM usage_log ORDER BY ts DESC LIMIT 30`).all();
      if (!rows.length) return respond({ text: '기록 없음' });
      const groups = {};
      for (const l of rows) {
        const date = l.ts.slice(0, 10);
        (groups[date] = groups[date] || []).push(l);
      }
      const lines = [];
      for (const [date, logs] of Object.entries(groups)) {
        lines.push(`*${date}*`);
        logs.forEach(l => {
          const act = l.action === 'start' ? '➕' : '➖';
          lines.push(`  ${act} \`${l.server_id}\` ${l.username}${l.memo ? ` — ${l.memo}` : ''} _${l.ts.slice(11, 16)}_`);
        });
      }
      return respond({ text: lines.join('\n') });
    }

    case 'who': {
      const rows = db.prepare(`SELECT * FROM server_status WHERE in_use=1`).all();
      if (!rows.length) return respond({ text: '현재 사용 중인 서버 없음' });
      return respond({ text: rows.map(s =>
        `\`${s.server_id}\` *${s.username}*${s.memo ? ` — ${s.memo}` : ''} (${s.started_at} KST~)`
      ).join('\n') });
    }

    case 'free': {
      const rows      = db.prepare(`SELECT * FROM server_status WHERE in_use=0`).all();
      const available = rows.filter(s => store.metrics[s.server_id]);
      if (!available.length) return respond({ text: '사용 가능한 서버 없음' });
      return respond({ text: available.map(s => {
        const m = store.metrics[s.server_id];
        return `\`${s.server_id}\` CPU:${m.cpu}%  RAM:${m.ram_pct}%`;
      }).join('\n') });
    }

    case 'db': {
      const total  = db.prepare(`SELECT COUNT(*) as c FROM usage_log`).get().c;
      const today  = db.prepare(`SELECT COUNT(*) as c FROM usage_log WHERE date(ts)=date(strftime('%Y-%m-%d','now','+9 hours'))`).get().c;
      const oldest = db.prepare(`SELECT MIN(ts) as t FROM usage_log`).get().t;
      return respond({ text: `DB 로그: 총 ${total}건 (오늘 ${today}건)\n가장 오래된 기록: ${oldest ?? '없음'}\n자동 삭제: 30일 이상` });
    }
  }

  respond({ text: HELP });
}

module.exports = { handleCommand, getDisplayName };
