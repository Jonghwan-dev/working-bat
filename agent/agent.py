# Code refactoring JHKim w/ Claude  2026-04-15

import os, time, psutil, requests, subprocess, logging, configparser
from logging.handlers import RotatingFileHandler
from pathlib import Path

# fix: force KST for log timestamps when systemd TZ is not set  2026-04-15 JHKim
os.environ.setdefault('TZ', 'Asia/Seoul')
time.tzset()

# agent.config 파일에서 설정 로드
config = configparser.ConfigParser()
config.read(Path(__file__).parent / 'agent.config')
cfg = config['agent']

SERVER_ID = cfg['server_id']
URL       = cfg['url']
TOKEN     = cfg['token']
INTERVAL  = int(cfg.get('interval', '10'))

log = logging.getLogger()
log.setLevel(logging.INFO)
h = RotatingFileHandler('agent.log', maxBytes=5*1024*1024, backupCount=2)
h.setFormatter(logging.Formatter('%(asctime)s %(message)s', '%H:%M:%S'))
log.addHandler(h)

def gpu():
    try:
        out = subprocess.run(
            ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5
        ).stdout.strip()
        result = []
        for i, line in enumerate(out.split('\n')):
            if not line.strip(): continue
            v = [x.strip() for x in line.split(',')]
            result.append({ "id": i, "util": int(v[0]), "mem_used": int(v[1]), "mem_total": int(v[2]), "temp": int(v[3]) })
        return result
    except:
        return []

def collect():
    r = psutil.virtual_memory()
    d = psutil.disk_usage('/')
    return {
        "server_id":  SERVER_ID,
        "cpu":        psutil.cpu_percent(interval=1),
        "ram_used":   round(r.used  / 1024**3, 1),
        "ram_total":  round(r.total / 1024**3, 1),
        "ram_pct":    round(r.percent, 1),
        "disk_used":  round(d.used  / 1024**3, 1),
        "disk_total": round(d.total / 1024**3, 1),
        "disk_pct":   round(d.percent, 1),
        "gpus":       gpu()
    }

while True:
    try:
        data = collect()
        r = requests.post(URL, json=data, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=5)
        log.info(f"{SERVER_ID} {r.status_code} CPU:{data['cpu']}% RAM:{data['ram_pct']}%")
    except Exception as e:
        log.warning(f"{SERVER_ID} ERR {e}")
    time.sleep(INTERVAL)
