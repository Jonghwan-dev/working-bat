// Code refactoring JHKim w/ Claude  2026-04-15

const db          = require('./db');
const { metrics } = require('./store');

const nowKST = () => new Date(Date.now() + 9 * 3600 * 1000);

// 0~100 값을 10칸 블록 막대로 변환
const bar = p => {
  const f = Math.round((Math.min(Math.max(p, 0), 100) / 100) * 10);
  return '█'.repeat(f) + '░'.repeat(10 - f);
};

const gpuVramPct = g => g.mem_total > 0 ? Math.round((g.mem_used / g.mem_total) * 100) : 0;

// fix: add status dot, external servers skip OFF state and offline count  2026-04-16 JHKim
function serverBlock(s, userId) {
  const m          = metrics[s.server_id];
  const on         = m != null;
  const isInternal = s.group_name === 'internal';

  // 내부: 🟢/🔴/⚫  외부: 🟢/🔴 (OFF 없음)
  const dot    = s.in_use ? '🔴' : (!isInternal || on) ? '🟢' : '⚫';
  const status = isInternal && !on ? 'OFF' : s.in_use ? '사용중' : '사용가능';
  const userInfo = s.in_use ? `  ${s.username}${s.memo ? ` — ${s.memo}` : ''}` : '';
  let text = `${dot} *${s.server_id}*  ${status}${userInfo}`;

  if (isInternal && on) {
    // fix: add bar to VRAM display  2026-04-16 JHKim
    const gpuLines = (m.gpus || []).map((g, i) => {
      const vp = gpuVramPct(g);
      return `GPU${i} ${bar(g.util)} ${g.util}%  VRAM ${bar(vp)} ${vp}% (${g.mem_used}/${g.mem_total}MB)  ${g.temp}C`;
    });
    text += '\n```' + [
      `CPU  ${bar(m.cpu ?? 0)} ${m.cpu ?? 0}%`,
      `RAM  ${bar(m.ram_pct ?? 0)} ${m.ram_used}/${m.ram_total}GB (${m.ram_pct ?? 0}%)`,
      ...gpuLines,
    ].join('\n') + '```';
  } else if (isInternal) {
    text += '\n_에이전트 미연결_';
  }

  // 내부는 on일 때만 버튼, 외부는 항상 버튼
  let btn = null;
  if (on || !isInternal) {
    if (s.in_use) {
      btn = s.user_id === userId
        ? { type: 'button', text: { type: 'plain_text', text: '종료' },   style: 'danger',  action_id: 'end_use',  value: s.server_id }
        : { type: 'button', text: { type: 'plain_text', text: '사용중' },                    action_id: 'occupied', value: s.server_id };
    } else {
      btn = { type: 'button', text: { type: 'plain_text', text: '사용' }, style: 'primary', action_id: 'start_use', value: s.server_id };
    }
  }

  const block = { type: 'section', text: { type: 'mrkdwn', text } };
  if (btn) block.accessory = btn;
  return block;
}

// Home 하단 최근 8개 기록 + 전체보기 버튼
function buildRecentLogBlocks() {
  const rows = db.prepare(`SELECT * FROM usage_log ORDER BY ts DESC LIMIT 8`).all();
  if (!rows.length) return [{ type: 'section', text: { type: 'mrkdwn', text: '_기록 없음_' } }];

  // fix: use ➕/➖ emoji (same size), format MM-DD HH:MM (no year)  2026-04-16 JHKim
  const lines = rows.map(l => {
    const act = l.action === 'start' ? '➕' : '➖';
    return `${act} \`${l.server_id}\` *${l.username}*${l.memo ? ` — ${l.memo}` : ''}  _${l.ts.slice(5, 16)}_`;
  });

  return [{
    type: 'section',
    text: { type: 'mrkdwn', text: lines.join('\n') },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: '전체 기록' },
      action_id: 'show_log_modal',
      value: 'all',
    }
  }];
}

// 전체 기록 모달 (날짜별 그룹, 최대 100건)
function buildLogModal() {
  const rows    = db.prepare(`SELECT * FROM usage_log ORDER BY ts DESC LIMIT 100`).all();
  const blocks  = [];

  if (!rows.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_기록 없음_' } });
  } else {
    const todayStr = nowKST().toISOString().slice(0, 10);
    const groups   = {};
    for (const l of rows) {
      const date = l.ts.slice(0, 10);
      (groups[date] = groups[date] || []).push(l);
    }
    for (const [date, logs] of Object.entries(groups)) {
      const label = date === todayStr ? '오늘' : date;
      const lines = logs.map(l => {
        const act = l.action === 'start' ? '➕' : '➖';
        return `${act} \`${l.server_id}\` *${l.username}*${l.memo ? ` — ${l.memo}` : ''}  _${l.ts.slice(11, 16)}_`;
      });
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${label}*\n${lines.join('\n')}` } });
      blocks.push({ type: 'divider' });
    }
  }

  return {
    type: 'modal',
    title: { type: 'plain_text', text: '사용 기록' },
    close: { type: 'plain_text', text: '닫기' },
    blocks,
  };
}

// Home 뷰 전체 빌드
function buildHome(userId) {
  const all      = db.prepare('SELECT * FROM server_status ORDER BY group_name, server_id').all();
  const internal = all.filter(s => s.group_name === 'internal');
  const external = all.filter(s => s.group_name === 'external');
  // fix: compute KST time directly to avoid Slack workspace timezone dependency  2026-04-16 JHKim
  const kstNow  = new Date(Date.now() + 9 * 3600 * 1000);
  const kstTime = kstNow.toISOString().slice(11, 16); // HH:MM

  const inUse     = all.filter(s => s.in_use).length;
  const available = all.filter(s => !s.in_use && (metrics[s.server_id] || s.group_name !== 'internal')).length;
  const offline   = internal.filter(s => !metrics[s.server_id]).length; // internal만 집계

  return {
    type: 'home',
    blocks: [
      { type: 'header',  text: { type: 'plain_text', text: 'Working Bat' } },
      { type: 'context', elements: [{ type: 'mrkdwn',
        text: `사용가능 ${available}대  사용중 ${inUse}대  오프라인 ${offline}대  |  ${kstTime} KST 업데이트`
      }]},
      { type: 'divider' },

      { type: 'section', text: { type: 'mrkdwn', text: '*내부 서버*' } },
      ...internal.map(s => serverBlock(s, userId)),

      { type: 'divider' },

      { type: 'section', text: { type: 'mrkdwn', text: '*외부 서버*' } },
      ...external.map(s => serverBlock(s, userId)),

      { type: 'divider' },

      { type: 'section', text: { type: 'mrkdwn', text: '*최근 사용 기록*' } },
      ...buildRecentLogBlocks(),
    ]
  };
}

module.exports = { buildHome, buildLogModal };
