const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Redis } = require('@upstash/redis');

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : false;
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const session = require('express-session');
const multer = require('multer');
const os = require('os');
const fs = require('fs');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ─── Redis helpers ────────────────────────────────────────────────────────────

const POLLS_KEY = 'polls';
const VOTES_KEY = 'votes';
const COMMENTS_KEY = 'comments';

async function redisGetJson(key, fallback) {
  const data = await redis.get(key);
  if (!data) return fallback;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function redisSetJson(key, value) {
  await redis.set(key, JSON.stringify(value));
}

function getPolls()       { return redisGetJson(POLLS_KEY, { polls: [] }); }
function savePolls(d)     { return redisSetJson(POLLS_KEY, d); }
function getVotes()       { return redisGetJson(VOTES_KEY, { votes: [] }); }
function saveVotes(d)     { return redisSetJson(VOTES_KEY, d); }
function getComments()    { return redisGetJson(COMMENTS_KEY, { comments: [] }); }
function saveComments(d)  { return redisSetJson(COMMENTS_KEY, d); }

// ─── Auto-seed polls from polls.json if Redis is empty ────────────────────────

async function seedPollsIfEmpty() {
  try {
    const data = await getPolls();
    if (data.polls && data.polls.length > 0) return;
    const seedPath = path.join(__dirname, 'polls.json');
    if (!fs.existsSync(seedPath)) return;
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    if (seed.polls && seed.polls.length > 0) {
      await savePolls(seed);
      console.log('Seeded ' + seed.polls[0].options.length + ' options from polls.json');
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
}

seedPollsIfEmpty();

// ─── Uploads ──────────────────────────────────────────────────────────────────

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

// ─── Session ──────────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));

// ─── Shared option helpers ────────────────────────────────────────────────────

function getOptionName(option) {
  return typeof option === 'string' ? option : option && option.name;
}
function hasOption(poll, optionName) {
  return poll.options.some(option => getOptionName(option) === optionName);
}

// ─── Route utilities ──────────────────────────────────────────────────────────

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const ADMIN_USER = process.env.ADMIN_USER || 'Bakary D Fane';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_KEY || '2008BFane';

function isAdminSession(req) { return req.session && req.session.isAdmin; }
function checkAdmin(req) {
  const key = req.query.key || req.headers['x-admin-key'] || '';
  return isAdminSession(req) || key === ADMIN_PASS;
}

function requireAdmin(req, res, next) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

async function withPoll(req, res, next) {
  const { pollId } = req.body;
  if (!pollId) return res.status(400).json({ error: 'pollId required' });
  const data = await getPolls();
  const poll = data.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  req.pollsData = data;
  req.poll = poll;
  next();
}

// ─── Public routes ────────────────────────────────────────────────────────────

app.get('/polls', asyncHandler(async (req, res) => {
  const data = await getPolls();
  res.json(data);
}));

const REACTION_SCORES = { dislike: -1, like: 1, love: 2 };
const VALID_REACTIONS = Object.keys(REACTION_SCORES);

app.get('/results', asyncHandler(async (req, res) => {
  const [pollsData, votesData] = await Promise.all([getPolls(), getVotes()]);
  const results = pollsData.polls.map(poll => {
    const options = poll.options.map(opt => {
      const name = getOptionName(opt);
      const reactions = { dislike: 0, like: 0, love: 0 };
      votesData.votes
        .filter(v => v.pollId === poll.id && v.option === name)
        .forEach(v => {
          if (reactions.hasOwnProperty(v.reaction)) reactions[v.reaction]++;
        });
      const score = VALID_REACTIONS.reduce((s, r) => s + reactions[r] * REACTION_SCORES[r], 0);
      return { name, reactions, score };
    });
    options.sort((a, b) => b.score - a.score);
    return { pollId: poll.id, title: poll.title, options };
  });
  res.json({ results });
}));

app.post('/vote', asyncHandler(async (req, res) => {
  const { pollId, option, reaction } = req.body;
  if (!pollId || !option || !reaction) return res.status(400).json({ error: 'pollId, option, and reaction required' });
  if (!VALID_REACTIONS.includes(reaction)) return res.status(400).json({ error: 'reaction must be dislike, like, or love' });
  const pollsData = await getPolls();
  const poll = pollsData.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (!hasOption(poll, option)) return res.status(400).json({ error: 'Invalid option' });
  const votesObj = await getVotes();
  votesObj.votes.push({ pollId, option, reaction, ts: Date.now() });
  await saveVotes(votesObj);
  res.json({ success: true });
}));

// ─── Comments ─────────────────────────────────────────────────────────────────

app.get('/comments', asyncHandler(async (req, res) => {
  const pollId = req.query.pollId;
  const data = await getComments();
  const list = pollId
    ? data.comments.filter(c => c.pollId === pollId)
    : data.comments;
  res.json({ comments: list });
}));

app.post('/comments', asyncHandler(async (req, res) => {
  const { pollId, author, text } = req.body;
  if (!pollId || !text) return res.status(400).json({ error: 'pollId and text required' });
  if (text.length > 500) return res.status(400).json({ error: 'comment too long (max 500 chars)' });
  const pollsData = await getPolls();
  const poll = pollsData.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  const data = await getComments();
  const comment = {
    id: Date.now() + '-' + Math.round(Math.random() * 1E9),
    pollId,
    author: (author || 'Anonyme').slice(0, 50),
    text: text.slice(0, 500),
    ts: Date.now()
  };
  data.comments.push(comment);
  await saveComments(data);
  res.json({ success: true, comment });
}));

// ─── Admin ────────────────────────────────────────────────────────────────────

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

app.post('/admin/addPoll', requireAdmin, asyncHandler(async (req, res) => {
  const { id, title, options } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id and title required' });
  const data = await getPolls();
  if (data.polls.find(p => p.id === id)) {
    return res.status(400).json({ error: 'poll with this id already exists' });
  }
  const newPoll = { id, title, options: options || [] };
  data.polls.push(newPoll);
  await savePolls(data);
  res.json({ success: true, poll: newPoll });
}));

app.post('/admin/deletePoll', requireAdmin, asyncHandler(async (req, res) => {
  const { pollId } = req.body;
  if (!pollId) return res.status(400).json({ error: 'pollId required' });
  const data = await getPolls();
  data.polls = data.polls.filter(p => p.id !== pollId);
  await savePolls(data);
  res.json({ success: true });
}));

app.post('/admin/addOption', requireAdmin, asyncHandler(async (req, res) => {
  await withPoll(req, res, async () => {
    const { option } = req.body;
    if (!option) return res.status(400).json({ error: 'pollId and option required' });
    if (!hasOption(req.poll, option)) {
      req.poll.options.push(option);
      await savePolls(req.pollsData);
    }
    res.json({ success: true, poll: req.poll });
  });
}));

app.post('/admin/addOptionWithImage', requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
  await withPoll(req, res, async () => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'pollId and name required' });
    let imagePath = null;
    if (req.file) imagePath = '/uploads/' + req.file.filename;
    const optionObj = { name, image: imagePath };
    if (!hasOption(req.poll, name)) {
      req.poll.options.push(optionObj);
      await savePolls(req.pollsData);
    }
    res.json({ success: true, poll: req.poll });
  });
}));

app.post('/admin/editOption', requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
  const { pollId, oldName, newName } = req.body;
  if (!pollId || !oldName) return res.status(400).json({ error: 'pollId and oldName required' });
  const data = await getPolls();
  const poll = data.polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  const idx = poll.options.findIndex(o => getOptionName(o) === oldName);
  if (idx === -1) return res.status(404).json({ error: 'option not found' });
  const current = poll.options[idx];
  const name = (newName && newName.trim()) || getOptionName(current);
  let image = typeof current === 'object' ? current.image : null;
  if (req.file) image = '/uploads/' + req.file.filename;
  poll.options[idx] = { name, image };
  await savePolls(data);
  res.json({ success: true, poll });
}));

app.post('/admin/removeOption', requireAdmin, asyncHandler(async (req, res) => {
  await withPoll(req, res, async () => {
    const { option } = req.body;
    if (!option) return res.status(400).json({ error: 'pollId and option required' });
    req.poll.options = req.poll.options.filter(o => getOptionName(o) !== option);
    await savePolls(req.pollsData);
    res.json({ success: true, poll: req.poll });
  });
}));

app.post('/admin/resetVotes', requireAdmin, asyncHandler(async (req, res) => {
  await saveVotes({ votes: [] });
  res.json({ success: true });
}));

app.post('/admin/reseedPolls', requireAdmin, asyncHandler(async (req, res) => {
  const seedPath = path.join(__dirname, 'polls.json');
  if (!fs.existsSync(seedPath)) return res.status(404).json({ error: 'polls.json not found' });
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  await savePolls(seed);
  await saveVotes({ votes: [] });
  res.json({ success: true, count: seed.polls[0] ? seed.polls[0].options.length : 0 });
}));

app.post('/admin/deleteComment', requireAdmin, asyncHandler(async (req, res) => {
  const { commentId } = req.body;
  if (!commentId) return res.status(400).json({ error: 'commentId required' });
  const data = await getComments();
  data.comments = data.comments.filter(c => c.id !== commentId);
  await saveComments(data);
  res.json({ success: true });
}));

app.post('/admin/resetComments', requireAdmin, asyncHandler(async (req, res) => {
  await saveComments({ comments: [] });
  res.json({ success: true });
}));

// ─── Error handler ────────────────────────────────────────────────────────────

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
