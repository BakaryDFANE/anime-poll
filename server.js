const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : false;
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware for admin auth
const session = require('express-session');
const multer = require('multer');
const os = require('os');

// ensure uploads folder exists; on production serverless use system tmp
const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.NODE_ENV === 'production'
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, 'public', 'uploads'));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  }
});
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

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

function getOptionName(option) {
  return typeof option === 'string' ? option : option && option.name;
}

function hasOption(poll, optionName) {
  return poll.options.some(option => getOptionName(option) === optionName);
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
    poll.options.forEach(opt => {
      const name = getOptionName(opt);
      if (name) counts[name] = 0;
    });
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
  if (!hasOption(poll, option)) return res.status(400).json({ error: 'Invalid option' });

  const votesObj = safeReadJSON(VOTES_FILE, { votes: [] });
  votesObj.votes.push({ pollId, option, ts: Date.now() });
  safeWriteJSON(VOTES_FILE, votesObj);

  res.json({ success: true });
});

// --- Admin authentication and endpoints ---
const ADMIN_USER = process.env.ADMIN_USER || 'Bakary D Fane';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_KEY || '2008BFane';

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
  if (!hasOption(poll, option)) {
    poll.options.push(option);
    safeWriteJSON(POLLS_FILE, data);
  }
  res.json({ success: true, poll });
});

// add option with image upload
app.post('/admin/addOptionWithImage', upload.single('image'), (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId, name } = req.body;
  if (!pollId || !name) return res.status(400).json({ error: 'pollId and name required' });
  const data = safeReadJSON(POLLS_FILE, { polls: [] });
  const poll = data.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  let imagePath = null;
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }
  const optionObj = { name, image: imagePath };
  if (!hasOption(poll, name)) {
    poll.options.push(optionObj);
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
  poll.options = poll.options.filter(o => getOptionName(o) !== option);
  safeWriteJSON(POLLS_FILE, data);
  res.json({ success: true, poll });
});

app.post('/admin/resetVotes', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  safeWriteJSON(VOTES_FILE, { votes: [] });
  res.json({ success: true });
});

// Error handler to avoid unhandled exceptions crashing the runtime
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal server error' });
});

// For Vercel: export the app directly.
// Vercel's @vercel/node runtime detects Express apps and wraps them automatically.
// For local/Render: listen on port if not in Vercel environment.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => console.log(`Server started on http://${HOST}:${PORT}`));
}

// Export for Vercel
module.exports = app;
