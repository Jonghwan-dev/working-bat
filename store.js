// Code refactoring JHKim w/ Claude  2026-04-15

const fs   = require('fs');
const FILE = './metrics_cache.json';

let metrics = {};
try { metrics = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}

function save(server_id, data) {
  metrics[server_id] = data;
  try { fs.writeFileSync(FILE, JSON.stringify(metrics)); } catch {}
}

module.exports = { metrics, save };
