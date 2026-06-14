"""Shared helpers for Render OpenAPI inspection scripts."""
import json
from pathlib import Path

OPENAPI_FILE = Path('render-openapi.json')


def load_openapi():
    if not OPENAPI_FILE.exists():
        raise SystemExit('render-openapi.json not found')
    return json.loads(OPENAPI_FILE.read_text(encoding='utf-8'))
