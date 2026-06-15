// ══════════════════════════════════════════════
//  TRADUCTIONS
// ══════════════════════════════════════════════
const TRANSLATIONS = {
  fr: {
    siteTitle: "Sondage Animes",
    subtitle: "Vote anonymement pour ton animé préféré et regarde le classement s'allumer en direct.",
    loading: "Chargement du sondage...",
    pollLabel: "Sondage interactif",
    dislike: "J'aime pas",
    like: "J'aime",
    love: "J'adore",
    community: "Community",
    comments: "Commentaires",
    noComments: "Aucun commentaire.",
    addComment: "Ajouter un message...",
    anonymous: "Anonyme",
    pseudo: "Pseudo",
    resultsLabel: "Résultats",
    resultsTitle: "Classement actuel",
    voteConfirmed: "✅ Votre vote a été pris en compte.",
    newVote: "Voter à nouveau",
    back: "← Retour",
    communitySubtitle: "Discute avec la communauté à propos de cet animé",
    reply: "Répondre",
    cancelReply: "Annuler",
    noVote: "Aucun sondage disponible.",
    errorLoad: "Erreur lors du chargement.",
    errorVote: "Erreur lors du vote.",
    errorComment: "Impossible d'envoyer le message.",
    replyPlaceholder: "Écrire une réponse...",
    score: "Score",
  },
  en: {
    siteTitle: "Anime Poll",
    subtitle: "Vote anonymously for your favourite anime and watch the ranking light up live.",
    loading: "Loading poll...",
    pollLabel: "Interactive Poll",
    dislike: "Dislike",
    like: "Like",
    love: "Love",
    community: "Community",
    comments: "Comments",
    noComments: "No comments yet.",
    addComment: "Add a message...",
    anonymous: "Anonymous",
    pseudo: "Username",
    resultsLabel: "Results",
    resultsTitle: "Current Ranking",
    voteConfirmed: "✅ Your vote has been recorded.",
    newVote: "Vote again",
    back: "← Back",
    communitySubtitle: "Chat with the community about this anime",
    reply: "Reply",
    cancelReply: "Cancel",
    noVote: "No poll available.",
    errorLoad: "Error while loading.",
    errorVote: "Error recording vote.",
    errorComment: "Could not send message.",
    replyPlaceholder: "Write a reply...",
    score: "Score",
  },
  ar: {
    siteTitle: "استطلاع الأنمي",
    subtitle: "صوّت بشكل مجهول لأنيميك المفضل وشاهد الترتيب يضيء مباشرةً.",
    loading: "جارٍ تحميل الاستطلاع...",
    pollLabel: "استطلاع تفاعلي",
    dislike: "لا يعجبني",
    like: "يعجبني",
    love: "أحبه",
    community: "المجتمع",
    comments: "التعليقات",
    noComments: "لا توجد تعليقات بعد.",
    addComment: "أضف رسالة...",
    anonymous: "مجهول",
    pseudo: "اسم مستعار",
    resultsLabel: "النتائج",
    resultsTitle: "الترتيب الحالي",
    voteConfirmed: "✅ تم تسجيل تصويتك.",
    newVote: "التصويت مجدداً",
    back: "← رجوع",
    communitySubtitle: "تحدث مع المجتمع حول هذا الأنمي",
    reply: "رد",
    cancelReply: "إلغاء",
    noVote: "لا يوجد استطلاع.",
    errorLoad: "خطأ أثناء التحميل.",
    errorVote: "خطأ أثناء التصويت.",
    errorComment: "تعذّر إرسال الرسالة.",
    replyPlaceholder: "اكتب رداً...",
    score: "النقاط",
  }
};

let currentLang = 'fr';
let currentPoll = null;
let currentCommunityAnime = null;

// Votes locaux pour toggle (clé = `${pollId}:${optionName}`)
const localVotes = {};

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS['fr'][key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  if (currentLang === 'ar') {
    document.documentElement.setAttribute('dir', 'rtl');
  } else {
    document.documentElement.setAttribute('dir', 'ltr');
  }
}

// ══════════════════════════════════════════════
//  SÉLECTION LANGUE
// ══════════════════════════════════════════════
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    document.getElementById('langScreen').hidden = true;
    document.getElementById('mainApp').hidden = false;
    applyTranslations();
    loadPoll();
  });
});

// ══════════════════════════════════════════════
//  UTILITAIRES
// ══════════════════════════════════════════════
function optionName(opt) {
  return typeof opt === 'string' ? opt : opt && opt.name;
}
function optionInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function calculateScore(counts) {
  return (counts.love || 0) * 2 + (counts.like || 0) - (counts.dislike || 0);
}

// ══════════════════════════════════════════════
//  TRADUCTION VIA CLAUDE API
// ══════════════════════════════════════════════
async function translateText(text, targetLang) {
  if (targetLang === 'fr') return text; // pas besoin de traduire si français
  const langNames = { en: 'English', ar: 'Arabic' };
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Translate the following text to ${langNames[targetLang]}. Return ONLY the translated text, nothing else:\n\n${text}`
        }]
      })
    });
    if (!resp.ok) return text;
    const data = await resp.json();
    return data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : text;
  } catch {
    return text;
  }
}

async function translateComment(text) {
  return await translateText(text, currentLang);
}

// ══════════════════════════════════════════════
//  CHARGEMENT DU SONDAGE
// ══════════════════════════════════════════════
async function loadPoll() {
  const area = document.getElementById('pollArea');
  const loading = document.getElementById('loading');
  if (loading) { loading.hidden = false; loading.textContent = t('loading'); }

  try {
    const resp = await fetch('/polls');
    const data = await resp.json();
    const poll = data.polls && data.polls[0];
    currentPoll = poll;

    if (!poll) {
      area.innerHTML = `<p class="empty-state">${t('noVote')}</p>`;
      return;
    }
    if (loading) loading.hidden = true;
    area.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'poll-card';

    const meta = document.createElement('div');
    meta.className = 'section-label';
    meta.textContent = t('pollLabel');

    const title = document.createElement('h2');
    title.textContent = poll.title;

    card.appendChild(meta);
    card.appendChild(title);

    const animeGrid = document.createElement('div');
    animeGrid.className = 'option-grid';

    poll.options.forEach((opt) => {
      const name = optionName(opt);
      if (!name) return;

      const row = document.createElement('div');
      row.className = 'option-block';

      // ── En-tête animé
      const headerDiv = document.createElement('div');
      headerDiv.className = 'anime-header';

      const art = document.createElement('span');
      art.className = 'option-art';
      if (typeof opt === 'object' && opt.image) {
        const img = document.createElement('img');
        img.src = opt.image;
        img.alt = name;
        art.appendChild(img);
      } else {
        art.textContent = optionInitials(name);
      }

      const txt = document.createElement('span');
      txt.className = 'option-name';
      txt.textContent = name;

      headerDiv.appendChild(art);
      headerDiv.appendChild(txt);
      row.appendChild(headerDiv);

      // ── Boutons vote (toggle)
      const voteKey = `${poll.id}:${name}`;
      const voteContainer = document.createElement('div');
      voteContainer.className = 'emoji-vote-container';

      const emojis = [
        { type: 'dislike', icon: '👎', labelKey: 'dislike' },
        { type: 'like', icon: '👍', labelKey: 'like' },
        { type: 'love', icon: '❤️', labelKey: 'love' }
      ];

      const btns = {};
      emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vote-btn';
        btn.title = t(emoji.labelKey);
        btn.dataset.type = emoji.type;
        btn.innerHTML = `${emoji.icon}<span class="vote-label">${t(emoji.labelKey)}</span>`;

        // Marquer si déjà voté
        if (localVotes[voteKey] === emoji.type) {
          btn.classList.add('voted');
        }

        btn.addEventListener('click', async () => {
          const prevVote = localVotes[voteKey];

          if (prevVote === emoji.type) {
            // Annuler le vote
            await fetch('/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pollId: poll.id, option: name, voteType: emoji.type, cancel: true })
            });
            delete localVotes[voteKey];
            btn.classList.remove('voted');
          } else {
            // Annuler l'ancien vote si existant
            if (prevVote) {
              await fetch('/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pollId: poll.id, option: name, voteType: prevVote, cancel: true })
              });
              if (btns[prevVote]) btns[prevVote].classList.remove('voted');
            }
            // Nouveau vote
            const voteResp = await fetch('/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pollId: poll.id, option: name, voteType: emoji.type })
            });
            if (!voteResp.ok) { alert(t('errorVote')); return; }
            localVotes[voteKey] = emoji.type;
            btn.classList.add('voted');
            showResults();
          }
        });

        btns[emoji.type] = btn;
        voteContainer.appendChild(btn);
      });
      row.appendChild(voteContainer);

      // ── Bouton Community
      const commBtn = document.createElement('button');
      commBtn.className = 'community-btn';
      commBtn.textContent = `💬 ${name} ${t('community')}`;
      commBtn.addEventListener('click', () => openCommunity(poll, name));
      row.appendChild(commBtn);

      animeGrid.appendChild(row);
    });

    card.appendChild(animeGrid);
    area.appendChild(card);
    showResults();

  } catch (err) {
    area.innerHTML = `<p class="empty-state">${t('errorLoad')}</p>`;
    console.error(err);
  }
}

// ══════════════════════════════════════════════
//  RÉSULTATS
// ══════════════════════════════════════════════
async function showResults() {
  const resArea = document.getElementById('resultsArea');
  const resultsDiv = document.getElementById('results');
  try {
    const resp = await fetch('/results');
    const data = await resp.json();
    const res = data.results && data.results[0];
    if (!res) { resultsDiv.innerHTML = `<p class="empty-state">${t('noVote')}</p>`; return; }
    resultsDiv.innerHTML = '';

    const sorted = Object.entries(res.counts).sort((a, b) => calculateScore(b[1]) - calculateScore(a[1]));

    sorted.forEach(([opt, counts], idx) => {
      const love = counts.love || 0;
      const like = counts.like || 0;
      const dislike = counts.dislike || 0;
      const totalScore = calculateScore(counts);

      const row = document.createElement('div');
      row.className = 'result-row';
      row.dataset.rank = String(idx + 1).padStart(2, '0');

      const label = document.createElement('div');
      label.className = 'result-label';

      const name = document.createElement('span');
      name.innerHTML = `<strong>#${idx + 1}</strong> ${opt}`;

      const value = document.createElement('strong');
      value.innerHTML = `<span title="${t('love')}">❤️${love}</span> <span title="${t('like')}">👍${like}</span> <span title="${t('dislike')}">👎${dislike}</span> — ${t('score')}: ${totalScore} pts`;

      label.appendChild(name);
      label.appendChild(value);

      const bar = document.createElement('div');
      bar.className = 'results-bar';
      const fill = document.createElement('div');
      fill.className = 'results-fill';
      fill.style.width = Math.max(0, Math.min(100, totalScore * 5)) + '%';
      bar.appendChild(fill);

      row.appendChild(label);
      row.appendChild(bar);
      resultsDiv.appendChild(row);
    });

    // Texte "Vote pris en compte"
    const confirmed = resArea.querySelector('.vote-confirmed');
    if (confirmed) confirmed.textContent = t('voteConfirmed');

    const newVoteBtn = document.getElementById('newVote');
    newVoteBtn.textContent = t('newVote');
    newVoteBtn.onclick = () => {
      loadPoll();
      document.getElementById('pollArea').scrollIntoView({ behavior: 'smooth' });
    };

    resArea.hidden = false;
  } catch (err) { console.error(err); }
}

// ══════════════════════════════════════════════
//  PAGE COMMUNITY
// ══════════════════════════════════════════════
function openCommunity(poll, animeName) {
  currentCommunityAnime = { poll, animeName };
  document.getElementById('mainApp').hidden = true;
  const page = document.getElementById('communityPage');
  page.hidden = false;

  document.getElementById('communityTitle').textContent = `${animeName} ${t('community')}`;
  document.getElementById('communitySubtitle').textContent = t('communitySubtitle');
  document.getElementById('backBtn').textContent = t('back');

  // Mise à jour form
  const pseudoRadios = page.querySelectorAll('[name="comm-identity"]');
  const pseudoInput = document.getElementById('commPseudo');
  pseudoRadios.forEach(r => {
    r.addEventListener('change', () => {
      pseudoInput.style.display = r.value === 'pseudo' ? 'block' : 'none';
    });
  });

  // Labels radio
  page.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.getElementById('commText').placeholder = t('addComment');

  renderCommunityComments(poll, animeName);
}

async function renderCommunityComments(poll, animeName) {
  const container = document.getElementById('communityComments');
  container.innerHTML = '<p style="color:var(--muted)">Chargement...</p>';

  try {
    const resp = await fetch('/polls');
    const data = await resp.json();
    const freshPoll = data.polls && data.polls[0];
    const opt = freshPoll && freshPoll.options.find(o => optionName(o) === animeName);
    const comments = (opt && opt.comments) || [];

    container.innerHTML = '';

    if (comments.length === 0) {
      container.innerHTML = `<p class="no-comments">${t('noComments')}</p>`;
    } else {
      // Séparer commentaires principaux et réponses
      const topLevel = comments.filter(c => !c.parentId);
      const replies = comments.filter(c => c.parentId);

      for (const c of topLevel) {
        const box = await buildCommentBox(c, replies, freshPoll, animeName);
        container.appendChild(box);
      }
    }
  } catch (e) {
    container.innerHTML = `<p style="color:var(--muted)">${t('errorLoad')}</p>`;
  }
}

async function buildCommentBox(comment, allReplies, poll, animeName) {
  const box = document.createElement('div');
  box.className = 'comm-box';
  box.dataset.id = comment.id;

  // Traduire le texte si besoin
  const displayText = currentLang !== 'fr' ? await translateComment(comment.text) : comment.text;

  const top = document.createElement('div');
  top.className = 'comm-top';
  top.innerHTML = `
    <strong class="comm-author">${comment.author}</strong>
    <span class="comm-time">${new Date(comment.createdAt).toLocaleString()}</span>
  `;

  const body = document.createElement('p');
  body.className = 'comm-body';
  body.textContent = displayText;

  const actions = document.createElement('div');
  actions.className = 'comm-actions';
  const replyBtn = document.createElement('button');
  replyBtn.className = 'reply-btn';
  replyBtn.textContent = t('reply');
  actions.appendChild(replyBtn);

  box.appendChild(top);
  box.appendChild(body);
  box.appendChild(actions);

  // Réponses imbriquées
  const childReplies = allReplies.filter(r => r.parentId === comment.id);
  if (childReplies.length > 0) {
    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'comm-replies';
    for (const r of childReplies) {
      const rb = await buildReplyBox(r);
      repliesContainer.appendChild(rb);
    }
    box.appendChild(repliesContainer);
  }

  // Formulaire de réponse (caché par défaut)
  const replyForm = document.createElement('form');
  replyForm.className = 'reply-form';
  replyForm.style.display = 'none';
  replyForm.innerHTML = `
    <div class="identity-row">
      <label><input type="radio" name="reply-identity-${comment.id}" value="anon" checked> ${t('anonymous')}</label>
      <label><input type="radio" name="reply-identity-${comment.id}" value="pseudo"> ${t('pseudo')}</label>
      <input type="text" class="pseudo-input reply-pseudo" placeholder="..." style="display:none">
    </div>
    <div class="comm-input-row">
      <input type="text" class="comm-text reply-text" placeholder="${t('replyPlaceholder')}" required>
      <button type="submit" class="send-btn">➚</button>
      <button type="button" class="cancel-reply-btn">${t('cancelReply')}</button>
    </div>
  `;

  replyForm.querySelector(`.reply-pseudo`);
  replyForm.querySelectorAll(`[name="reply-identity-${comment.id}"]`).forEach(r => {
    r.addEventListener('change', () => {
      replyForm.querySelector('.reply-pseudo').style.display = r.value === 'pseudo' ? 'block' : 'none';
    });
  });

  replyBtn.addEventListener('click', () => {
    replyForm.style.display = replyForm.style.display === 'none' ? 'block' : 'none';
  });
  replyForm.querySelector('.cancel-reply-btn').addEventListener('click', () => {
    replyForm.style.display = 'none';
  });

  replyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isAnon = replyForm.querySelector(`[name="reply-identity-${comment.id}"]:checked`).value === 'anon';
    const author = isAnon ? t('anonymous') : (replyForm.querySelector('.reply-pseudo').value.trim() || t('anonymous'));
    const text = replyForm.querySelector('.reply-text').value.trim();
    if (!text) return;

    await fetch('/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId: poll.id, option: animeName, author, text, parentId: comment.id })
    });
    replyForm.style.display = 'none';
    replyForm.querySelector('.reply-text').value = '';
    renderCommunityComments(poll, animeName);
  });

  box.appendChild(replyForm);
  return box;
}

async function buildReplyBox(reply) {
  const box = document.createElement('div');
  box.className = 'comm-box reply-box';

  const displayText = currentLang !== 'fr' ? await translateComment(reply.text) : reply.text;

  box.innerHTML = `
    <div class="comm-top">
      <strong class="comm-author">${reply.author}</strong>
      <span class="comm-time">${new Date(reply.createdAt).toLocaleString()}</span>
    </div>
    <p class="comm-body">${displayText}</p>
  `;
  return box;
}

// ── Bouton retour Community
document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('communityPage').hidden = true;
  document.getElementById('mainApp').hidden = false;
  currentCommunityAnime = null;
});

// ── Formulaire Community principal
document.getElementById('communityForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentCommunityAnime) return;

  const { poll, animeName } = currentCommunityAnime;
  const identityVal = document.querySelector('[name="comm-identity"]:checked').value;
  const pseudoInput = document.getElementById('commPseudo');
  const author = identityVal === 'anon' ? t('anonymous') : (pseudoInput.value.trim() || t('anonymous'));
  const text = document.getElementById('commText').value.trim();
  if (!text) return;

  const resp = await fetch('/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pollId: poll.id, option: animeName, author, text })
  });

  if (resp.ok) {
    document.getElementById('commText').value = '';
    pseudoInput.value = '';
    renderCommunityComments(poll, animeName);
  } else {
    alert(t('errorComment'));
  }
});

window.addEventListener('load', () => {
  // L'app démarre sur l'écran de sélection de langue
  // loadPoll() est appelé après choix de la langue
});