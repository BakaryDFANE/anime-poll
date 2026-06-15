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

const POLLS_KEY = 'polls';

async function getPolls() {
  const data = await redis.get(POLLS_KEY);
  if (!data) return { polls: [] };
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function savePolls(data) {
  await redis.set(POLLS_KEY, JSON.stringify(data));
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
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));

function getOptionName(option) {
  return typeof option === 'string' ? option : option && option.name;
}
function hasOption(poll, optionName) {
  return poll.options.some(option => getOptionName(option) === optionName);
}

// Helper pour s'assurer qu'une option possède la bonne structure d'objet
function normalizeOptionStructure(opt) {
  const name = getOptionName(opt);
  const image = (typeof opt === 'object' && opt.image) ? opt.image : null;
  const votes = (typeof opt === 'object' && opt.votes) ? opt.votes : { like: 0, dislike: 0, love: 0 };
  const comments = (typeof opt === 'object' && opt.comments) ? opt.comments : [];
  return { name, image, votes, comments };
}

// ─── Public routes ────────────────────────────────────────────────────────────

app.get('/polls', async (req, res) => {
  try {
    const data = await getPolls();
    // Normalisation à la volée pour éviter les plantages si l'ancienne structure JSON persiste
    data.polls = data.polls.map(poll => {
      poll.options = poll.options.map(normalizeOptionStructure);
      return poll;
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'failed to read polls' });
  }
});

app.get('/results', async (req, res) => {
  try {
    const pollsData = await getPolls();
    const results = pollsData.polls.map(poll => {
      const counts = {};
      poll.options.forEach(opt => {
        const norm = normalizeOptionStructure(opt);
        counts[norm.name] = {
          like: norm.votes.like || 0,
          dislike: norm.votes.dislike || 0,
          love: norm.votes.love || 0
        };
      });
      return { pollId: poll.id, title: poll.title, counts };
    });
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'failed to read results' });
  }
});

app.post('/vote', async (req, res) => {
  const { pollId, option, voteType, cancel } = req.body;
  if (!pollId || !option || !voteType) {
    return res.status(400).json({ error: 'pollId, option and voteType required' });
  }
  if (!['like', 'dislike', 'love'].includes(voteType)) {
    return res.status(400).json({ error: 'invalid voteType value' });
  }

  try {
    const pollsData = await getPolls();
    const poll = pollsData.polls.find(p => p.id === pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    let found = false;
    poll.options = poll.options.map(opt => {
      const norm = normalizeOptionStructure(opt);
      if (norm.name === option) {
        if (cancel) {
          // Annuler le vote (décrémenter sans passer sous 0)
          norm.votes[voteType] = Math.max(0, (norm.votes[voteType] || 0) - 1);
        } else {
          norm.votes[voteType] = (norm.votes[voteType] || 0) + 1;
        }
        found = true;
      }
      return norm;
    });

    if (!found) return res.status(400).json({ error: 'Invalid option' });

    await savePolls(pollsData);
    res.json({ success: true });
  } catch (e) {
    console.error('Vote error:', e);
    res.status(500).json({ error: 'failed to save vote' });
  }
});

// ── Nouvelle route publique : Poster un commentaire ──
app.post("/comment", async (req, res) => {
  const { pollId, option, author, text, parentId } = req.body;
  if (!pollId || !option || !text) {
    return res.status(400).json({ error: "pollId, option and text are required" });
  }
  try {
    const pollsData = await getPolls();
    const poll = pollsData.polls.find(p => p.id === pollId);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    let found = false;
    poll.options = poll.options.map(opt => {
      const norm = normalizeOptionStructure(opt);
      if (norm.name === option) {
        const commentId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        norm.comments.push({
          id: commentId,
          author: author || "Anonyme",
          text: text,
          parentId: parentId || null,
          createdAt: new Date().toISOString()
        });
        found = true;
      }
      return norm;
    });
    if (!found) return res.status(400).json({ error: "Invalid option" });
    await savePolls(pollsData);
    res.json({ success: true });
  } catch (e) {
    console.error("Comment error:", e);
    res.status(500).json({ error: "failed to save comment" });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const ADMIN_USER = process.env.ADMIN_USER || 'Bakary D Fane';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_KEY || '2008BFane';

function isAdminSession(req) { return req.session && req.session.isAdmin; }
function checkAdmin(req) {
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

app.post('/admin/addPoll', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { id, title, options } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id and title required' });
  try {
    const data = await getPolls();
    if (data.polls.find(p => p.id === id)) {
      return res.status(400).json({ error: 'poll with this id already exists' });
    }
    const structuredOptions = (options || []).map(opt => normalizeOptionStructure(opt));
    const newPoll = { id, title, options: structuredOptions };
    data.polls.push(newPoll);
    await savePolls(data);
    res.json({ success: true, poll: newPoll });
  } catch (e) {
    res.status(500).json({ error: 'failed to create poll' });
  }
});

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
    if (!hasOption(poll, getOptionName(option))) {
      poll.options.push(normalizeOptionStructure(option));
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
    
    if (!hasOption(poll, name)) {
      const optionObj = normalizeOptionStructure({ name, image: imagePath });
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
    const data = await getPolls();
    data.polls = data.polls.map(poll => {
      poll.options = poll.options.map(opt => {
        const norm = normalizeOptionStructure(opt);
        norm.votes = { like: 0, dislike: 0, love: 0 };
        return norm;
      });
      return poll;
    });
    await savePolls(data);
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