import json
from render_helpers import load_openapi

j = load_openapi()
serv = j['paths']['/services']['post']
body = serv['requestBody']['content']['application/json']['schema']
print(json.dumps({
    'summary': serv.get('summary'),
    'description': serv.get('description'),
    'properties': list(body.get('properties', {}).keys()),
    'required': body.get('required', []),
    'schema': body,
}, indent=2))
