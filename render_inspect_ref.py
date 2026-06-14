import json
from render_helpers import load_openapi

j = load_openapi()
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
