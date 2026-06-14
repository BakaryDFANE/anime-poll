const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : false;
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(bodyParser.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const session = require('express-session');
const multer = require('multer');
const os = require('os');
const fs = require('fs');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const POLLS_KEY = 'polls';
const VOTES_KEY = 'votes';

async function getPolls() {
  const data = await redis.get(POLLS_KEY);
  if (!data) return { polls: [] };
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function savePolls(data) {
  await redis.set(POLLS_KEY, JSON.stringify(data));
}

async function getVotes() {
  const data = await redis.get(VOTES_KEY);
  if (!data) return { votes: [] };
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function saveVotes(data) {
  await redis.set(VOTES_KEY, JSON.stringify(data));
}

const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.NODE_ENV === 'production'
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, 'public', 'uploads'));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + unique + ext);
  }
});
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype) || !ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      return cb(new Error('Only JPEG, PNG, GIF, and WebP image uploads are allowed'));
    }
    cb(null, true);
  }
});

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: SESSION_SECRET environment variable is required in production');
  process.exit(1);
}
const sessionSecret = SESSION_SECRET || 'dev-only-insecure-secret-' + crypto.randomBytes(16).toString('hex');
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));

function getOptionName(option) {
  return typeof option === 'string' ? option : option && option.name;
}
function hasOption(poll, optionName) {
  return poll.options.some(option => getOptionName(option) === optionName);
}

// ─── Public routes ────────────────────────────────────────────────────────────

app.get('/polls', async (req, res) => {
  try {
    const data = await getPolls();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'failed to read polls' });
  }
});

app.get('/results', async (req, res) => {
  try {
    const [pollsData, votesData] = await Promise.all([getPolls(), getVotes()]);
    const results = pollsData.polls.map(poll => {
      const counts = {};
      poll.options.forEach(opt => {
        const name = getOptionName(opt);
        if (name) counts[name] = 0;
      });
      votesData.votes.filter(v => v.pollId === poll.id).forEach(v => {
        if (counts.hasOwnProperty(v.option)) counts[v.option]++;
      });
      return { pollId: poll.id, title: poll.title, counts };
    });
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'failed to read results' });
  }
});

const voteRateLimit = new Map();
const VOTE_WINDOW_MS = 60 * 1000;
const MAX_VOTES_PER_WINDOW = 5;

app.post('/vote', async (req, res) => {
  const { pollId, option } = req.body;
  if (!pollId || !option) return res.status(400).json({ error: 'pollId and option required' });
  if (typeof pollId !== 'string' || typeof option !== 'string') {
    return res.status(400).json({ error: 'pollId and option must be strings' });
  }
  if (pollId.length > 100 || option.length > 200) {
    return res.status(400).json({ error: 'input too long' });
  }

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = voteRateLimit.get(ip) || { count: 0, windowStart: now };
  if (now - record.windowStart > VOTE_WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  if (record.count >= MAX_VOTES_PER_WINDOW) {
    return res.status(429).json({ error: 'too many votes, please wait' });
  }

  try {
    const pollsData = await getPolls();
    const poll = pollsData.polls.find(p => p.id === pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (!hasOption(poll, option)) return res.status(400).json({ error: 'Invalid option' });
    const votesObj = await getVotes();
    votesObj.votes.push({ pollId, option, ts: Date.now() });
    await saveVotes(votesObj);
    record.count++;
    voteRateLimit.set(ip, record);
    res.json({ success: true });
  } catch (e) {
    console.error('Vote error:', e);
    res.status(500).json({ error: 'failed to save vote' });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
if (process.env.NODE_ENV === 'production' && (!ADMIN_USER || !ADMIN_PASS)) {
  console.error('FATAL: ADMIN_USER and ADMIN_PASS environment variables are required in production');
  process.exit(1);
}

function isAdminSession(req) { return req.session && req.session.isAdmin; }
function checkAdmin(req) {
  return isAdminSession(req);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

app.post('/admin/login', (req, res) => {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(503).json({ error: 'admin credentials not configured' });
  }

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };

  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    record.count = 0;
    record.firstAttempt = now;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({ error: 'too many login attempts, try again later' });
  }

  const { user, pass } = req.body || {};
  const userValid = timingSafeEqual(String(user || ''), ADMIN_USER);
  const passValid = timingSafeEqual(String(pass || ''), ADMIN_PASS);

  if (userValid && passValid) {
    loginAttempts.delete(ip);
    req.session.isAdmin = true;
    return res.json({ success: true });
  }

  record.count++;
  loginAttempts.set(ip, record);
  res.status(401).json({ error: 'invalid credentials' });
});

app.post('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

// ── Nouvelle route : créer un sondage complet ──
app.post('/admin/addPoll', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { id, title, options } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id and title required' });
  if (typeof id !== 'string' || typeof title !== 'string') {
    return res.status(400).json({ error: 'id and title must be strings' });
  }
  if (id.length > 100 || title.length > 300) {
    return res.status(400).json({ error: 'id or title too long' });
  }
  if (options && !Array.isArray(options)) {
    return res.status(400).json({ error: 'options must be an array' });
  }
  try {
    const data = await getPolls();
    if (data.polls.find(p => p.id === id)) {
      return res.status(400).json({ error: 'poll with this id already exists' });
    }
    const newPoll = { id, title, options: options || [] };
    data.polls.push(newPoll);
    await savePolls(data);
    res.json({ success: true, poll: newPoll });
  } catch (e) {
    res.status(500).json({ error: 'failed to create poll' });
  }
});

// ── Nouvelle route : supprimer un sondage ──
app.post('/admin/deletePoll', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId } = req.body;
  if (!pollId) return res.status(400).json({ error: 'pollId required' });
  try {
    const data = await getPolls();
    data.polls = data.polls.filter(p => p.id !== pollId);
    await savePolls(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to delete poll' });
  }
});

app.post('/admin/addOption', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId, option } = req.body;
  if (!pollId || !option) return res.status(400).json({ error: 'pollId and option required' });
  try {
    const data = await getPolls();
    const poll = data.polls.find(p => p.id === pollId);
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    if (!hasOption(poll, option)) {
      poll.options.push(option);
      await savePolls(data);
    }
    res.json({ success: true, poll });
  } catch (e) {
    res.status(500).json({ error: 'failed to add option' });
  }
});

app.post('/admin/addOptionWithImage', upload.single('image'), async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId, name } = req.body;
  if (!pollId || !name) return res.status(400).json({ error: 'pollId and name required' });
  try {
    const data = await getPolls();
    const poll = data.polls.find(p => p.id === pollId);
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    let imagePath = null;
    if (req.file) imagePath = '/uploads/' + req.file.filename;
    const optionObj = { name, image: imagePath };
    if (!hasOption(poll, name)) {
      poll.options.push(optionObj);
      await savePolls(data);
    }
    res.json({ success: true, poll });
  } catch (e) {
    res.status(500).json({ error: 'failed to add option with image' });
  }
});

app.post('/admin/removeOption', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { pollId, option } = req.body;
  if (!pollId || !option) return res.status(400).json({ error: 'pollId and option required' });
  try {
    const data = await getPolls();
    const poll = data.polls.find(p => p.id === pollId);
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    poll.options = poll.options.filter(o => getOptionName(o) !== option);
    await savePolls(data);
    res.json({ success: true, poll });
  } catch (e) {
    res.status(500).json({ error: 'failed to remove option' });
  }
});

app.post('/admin/resetVotes', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    await saveVotes({ votes: [] });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to reset votes' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal server error' });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => console.log(`Server started on http://${HOST}:${PORT}`));
}

module.exports = app;
