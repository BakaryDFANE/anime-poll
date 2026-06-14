import json
from pathlib import Path
p = Path('render-openapi.json')
if not p.exists():
    raise SystemExit('render-openapi.json not found')
with p.open('r', encoding='utf-8') as f:
    j = json.load(f)
for k in sorted(j['paths'].keys()):
    if 'account' in k or 'accounts' in k or 'owner' in k or 'workspace' in k or 'services' in k:
        print(k)
        if 'account' in k or 'accounts' in k or 'owner' in k or 'workspace' in k:
            print('  methods:', list(j['paths'][k].keys()))
            print('  summary:', {m:j['paths'][k][m].get('summary') for m in j['paths'][k]})
            print()
