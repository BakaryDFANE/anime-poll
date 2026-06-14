import json
from pathlib import Path
p = Path('render-openapi.json')
if not p.exists():
    raise SystemExit('render-openapi.json not found')
j = json.loads(p.read_text())
serv = j['paths']['/services']['post']
body = serv['requestBody']['content']['application/json']['schema']
print(json.dumps({
    'summary': serv.get('summary'),
    'description': serv.get('description'),
    'properties': list(body.get('properties', {}).keys()),
    'required': body.get('required', []),
    'schema': body,
}, indent=2))
