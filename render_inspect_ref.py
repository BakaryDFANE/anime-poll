import json
from pathlib import Path
p = Path('render-openapi.json')
if not p.exists():
    raise SystemExit('render-openapi.json not found')
with p.open('r', encoding='utf-8') as f:
    j = json.load(f)
serv = j['paths']['/services']['post']
body = serv['requestBody']['content']['application/json']['schema']
ref = body.get('$ref')
print('ref:', ref)
if ref:
    key = ref.split('/')[-1]
    schema = j['components']['schemas'][key]
    print('schema properties:', list(schema.get('properties', {}).keys()))
    print('schema required:', schema.get('required', []))
    print(json.dumps(schema, indent=2))
