from render_helpers import load_openapi

j = load_openapi()
for k in sorted(j['paths'].keys()):
    if 'account' in k or 'accounts' in k or 'owner' in k or 'workspace' in k or 'services' in k:
        print(k)
        if 'account' in k or 'accounts' in k or 'owner' in k or 'workspace' in k:
            print('  methods:', list(j['paths'][k].keys()))
            print('  summary:', {m:j['paths'][k][m].get('summary') for m in j['paths'][k]})
            print()
