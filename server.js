const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware for admin auth
const session = require('express-session');
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change';
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false } }));

const POLLS_FILE = path.join(__dirname, 'polls.json');
const VOTES_FILE = path.join(__dirname, 'votes.json');

function safeReadJSON(filePath, defaultValue) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

function safeWriteJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

// Ensure data files exist
if (!fs.existsSync(POLLS_FILE)) {
  safeWriteJSON(POLLS_FILE, { polls: [] });
}
if (!fs.existsSync(VOTES_FILE)) {
  safeWriteJSON(VOTES_FILE, { votes: [] });
}

app.get('/polls', (req, res) => {
  const data = safeReadJSON(POLLS_FILE, { polls: [] });
  res.json(data);
});

app.get('/results', (req, res) => {
  const polls = safeReadJSON(POLLS_FILE, { polls: [] }).polls;
  const votes = safeReadJSON(VOTES_FILE, { votes: [] }).votes;

  const results = polls.map(poll => {
    const counts = {};
    poll.options.forEach(opt => counts[opt] = 0);
    votes.filter(v => v.pollId === poll.id).forEach(v => {
      if (counts.hasOwnProperty(v.option)) counts[v.option]++;
    });
    return { pollId: poll.id, title: poll.title, counts };
  });

  res.json({ results });
});

app.post('/vote', (req, res) => {
  const { pollId, option } = req.body;
  if (!pollId || !option) return res.status(400).json({ error: 'pollId and option required' });

  const polls = safeReadJSON(POLLS_FILE, { polls: [] }).polls;
  const poll = polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (!poll.options.includes(option)) return res.status(400).json({ error: 'Invalid option' });

  const votesObj = safeReadJSON(VOTES_FILE, { votes: [] });
  votesObj.votes.push({ pollId, option, ts: Date.now() });
  safeWriteJSON(VOTES_FILE, votesObj);

  res.json({ success: true });
});

// --- Admin authentication and endpoints ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_KEY || 'change-me-please';

function isAdminSession(req) {
  return req.session && req.session.isAdmin;
}

function checkAdmin(req) {
  // allow either logged-in session or key via header/query
  const key = req.query.key || req.headers['x-admin-key'] || '';
  return isAdminSession(req) || key === ADMIN_PASS;
}

app.post('/admin/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'invalid credentials' });
});

app.post('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

app.post('/admin/addOption', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId, option } = req.body;
  if (!pollId || !option) return res.status(400).json({ error: 'pollId and option required' });
  const data = safeReadJSON(POLLS_FILE, { polls: [] });
  const poll = data.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  if (!poll.options.includes(option)) {
    poll.options.push(option);
    safeWriteJSON(POLLS_FILE, data);
  }
  res.json({ success: true, poll });
});

app.post('/admin/removeOption', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId, option } = req.body;
  if (!pollId || !option) return res.status(400).json({ error: 'pollId and option required' });
  const data = safeReadJSON(POLLS_FILE, { polls: [] });
  const poll = data.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  poll.options = poll.options.filter(o => o !== option);
  safeWriteJSON(POLLS_FILE, data);
  res.json({ success: true, poll });
});

app.post('/admin/resetVotes', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  safeWriteJSON(VOTES_FILE, { votes: [] });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
