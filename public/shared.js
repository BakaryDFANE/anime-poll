/** Shared utilities used by both app.js and admin.js */

function $(sel) { return document.querySelector(sel); }

function optionName(opt) {
  return typeof opt === 'string' ? opt : opt && opt.name;
}

function optionInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

async function readJsonResponse(resp) {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Erreur inconnue');
  return data;
}

async function fetchPolls() {
  const resp = await fetch('/polls');
  const data = await resp.json();
  return data.polls || [];
}
