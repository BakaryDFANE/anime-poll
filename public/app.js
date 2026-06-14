/* global $, optionName, optionInitials, readJsonResponse, fetchPolls */

var currentPollId = null;

var REACTIONS = [
  { key: 'dislike', label: "J'aime pas", icon: '👎' },
  { key: 'like',    label: "J'aime",     icon: '👍' },
  { key: 'love',    label: "J'aime trop",icon: '🔥' }
];

async function loadPoll() {
  var area = $('#pollArea');
  var loading = document.getElementById('loading');
  try {
    var polls = await fetchPolls();
    var poll = polls[0];
    if (!poll) { area.innerHTML = '<p class="empty-state">Aucun sondage disponible.</p>'; return; }
    currentPollId = poll.id;

    if (loading) loading.hidden = true;
    area.innerHTML = '';
    var card = document.createElement('div'); card.className = 'poll-card';
    var meta = document.createElement('div'); meta.className = 'section-label'; meta.textContent = 'Choisis ton camp';
    var title = document.createElement('h2'); title.textContent = poll.title;
    card.appendChild(meta); card.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'option-grid';

    poll.options.forEach(function (opt, idx) {
      var name = optionName(opt);
      if (!name) return;

      var row = document.createElement('div');
      row.className = 'option-card';
      row.dataset.index = String(idx + 1).padStart(2, '0');

      var artWrap = document.createElement('div');
      artWrap.className = 'option-art';
      if (typeof opt === 'object' && opt.image) {
        var img = document.createElement('img');
        img.src = opt.image; img.alt = name;
        artWrap.appendChild(img);
      } else {
        artWrap.textContent = optionInitials(name);
      }

      var body = document.createElement('div');
      body.className = 'option-body';
      var tag = document.createElement('span');
      tag.className = 'option-tag';
      tag.textContent = 'ENTRY ' + String(idx + 1).padStart(2, '0');
      var txt = document.createElement('span');
      txt.className = 'option-name';
      txt.textContent = name;
      body.appendChild(tag);
      body.appendChild(txt);

      var reactions = document.createElement('div');
      reactions.className = 'reaction-buttons';
      REACTIONS.forEach(function (r) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reaction-btn reaction-' + r.key;
        btn.dataset.option = name;
        btn.dataset.reaction = r.key;
        btn.innerHTML = '<span class="reaction-icon">' + r.icon + '</span><span class="reaction-label">' + r.label + '</span>';
        btn.addEventListener('click', function () { sendVote(poll.id, name, r.key, btn); });
        reactions.appendChild(btn);
      });

      var commentThread = document.createElement('div');
      commentThread.className = 'option-comments';
      commentThread.id = 'comments-' + slugify(name);

      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'comment-toggle';
      toggleBtn.innerHTML = '💬 <span class="comment-count" data-option="' + escapeAttr(name) + '">0</span> commentaires';
      toggleBtn.addEventListener('click', function () {
        var panel = commentThread.querySelector('.comment-panel');
        if (panel) {
          panel.hidden = !panel.hidden;
          if (!panel.hidden) loadOptionComments(poll.id, name, commentThread);
        }
      });
      commentThread.appendChild(toggleBtn);

      var panel = document.createElement('div');
      panel.className = 'comment-panel';
      panel.hidden = true;

      var commentList = document.createElement('div');
      commentList.className = 'comment-list';
      panel.appendChild(commentList);

      var formWrap = document.createElement('div');
      formWrap.className = 'comment-form-inline';
      formWrap.innerHTML =
        '<input type="text" class="comment-author-input" placeholder="Pseudo (optionnel)" maxlength="50">' +
        '<div class="comment-input-row">' +
          '<textarea class="comment-text-input" placeholder="Ton commentaire..." maxlength="500" rows="2"></textarea>' +
          '<button type="button" class="comment-send-btn">▶</button>' +
        '</div>';
      var sendBtn = formWrap.querySelector('.comment-send-btn');
      sendBtn.addEventListener('click', function () {
        var authorIn = formWrap.querySelector('.comment-author-input');
        var textIn = formWrap.querySelector('.comment-text-input');
        submitComment(poll.id, name, authorIn, textIn, commentThread);
      });
      panel.appendChild(formWrap);

      commentThread.appendChild(panel);

      row.appendChild(artWrap);
      row.appendChild(body);
      row.appendChild(reactions);
      row.appendChild(commentThread);
      grid.appendChild(row);
    });

    card.appendChild(grid);
    area.appendChild(card);

    showResults();
    loadAllCommentCounts();
  } catch (err) {
    var isLocalFile = window.location.protocol === 'file:';
    area.innerHTML = isLocalFile
      ? '<p class="empty-state">Lance le serveur avec npm.cmd start, puis ouvre http://localhost:3000.</p>'
      : '<p class="empty-state">Erreur lors du chargement.</p>';
    console.error(err);
  }
}

async function sendVote(pollId, option, reaction, btn) {
  var row = btn.closest('.reaction-buttons');
  var buttons = row.querySelectorAll('.reaction-btn');
  buttons.forEach(function (b) { b.disabled = true; });
  btn.classList.add('voted');

  try {
    var resp = await fetch('/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId: pollId, option: option, reaction: reaction })
    });
    await readJsonResponse(resp);
    showResults();
  } catch (err) {
    alert(err.message || "Impossible d'enregistrer le vote");
  }
  buttons.forEach(function (b) { b.disabled = false; });
}

async function showResults() {
  var resArea = $('#resultsArea');
  var resultsDiv = $('#results');
  try {
    var resp = await fetch('/results');
    var data = await resp.json();
    var res = data.results && data.results[0];
    if (!res || !res.options || res.options.length === 0) {
      resultsDiv.innerHTML = '<p class="empty-state">Aucun vote pour le moment.</p>';
      resArea.hidden = false;
      return;
    }
    resultsDiv.innerHTML = '';

    var maxScore = Math.max.apply(null, res.options.map(function (o) { return o.score; }));
    var minScore = Math.min.apply(null, res.options.map(function (o) { return o.score; }));
    var range = maxScore - minScore || 1;

    res.options.forEach(function (opt, idx) {
      var row = document.createElement('div');
      row.className = 'result-row';
      if (idx === 0) row.classList.add('result-first');
      if (idx === res.options.length - 1 && res.options.length > 1) row.classList.add('result-last');
      row.dataset.rank = String(idx + 1).padStart(2, '0');

      var label = document.createElement('div');
      label.className = 'result-label';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = opt.name;
      var scoreSpan = document.createElement('strong');
      scoreSpan.textContent = 'Score: ' + opt.score;
      label.appendChild(nameSpan);
      label.appendChild(scoreSpan);

      var reactions = document.createElement('div');
      reactions.className = 'result-reactions';
      reactions.innerHTML =
        '<span class="rcount rcount-dislike">👎 ' + opt.reactions.dislike + '</span>' +
        '<span class="rcount rcount-like">👍 ' + opt.reactions.like + '</span>' +
        '<span class="rcount rcount-love">🔥 ' + opt.reactions.love + '</span>';

      var bar = document.createElement('div');
      bar.className = 'results-bar';
      var fill = document.createElement('div');
      fill.className = 'results-fill';
      var pct = range > 0 ? Math.max(0, Math.round(((opt.score - minScore) / range) * 100)) : 100;
      fill.style.width = pct + '%';
      bar.appendChild(fill);

      row.appendChild(label);
      row.appendChild(reactions);
      row.appendChild(bar);
      resultsDiv.appendChild(row);
    });

    resArea.hidden = false;
  } catch (err) { console.error(err); }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadAllCommentCounts() {
  if (!currentPollId) return;
  try {
    var resp = await fetch('/comments?pollId=' + encodeURIComponent(currentPollId));
    var data = await resp.json();
    var counts = {};
    (data.comments || []).forEach(function (c) {
      var key = c.option || '_global';
      counts[key] = (counts[key] || 0) + 1;
    });
    document.querySelectorAll('.comment-count').forEach(function (el) {
      var opt = el.dataset.option;
      el.textContent = counts[opt] || 0;
    });
  } catch (err) { console.error(err); }
}

async function loadOptionComments(pollId, optionName, container) {
  var list = container.querySelector('.comment-list');
  if (!list) return;
  try {
    var resp = await fetch('/comments?pollId=' + encodeURIComponent(pollId) + '&option=' + encodeURIComponent(optionName));
    var data = await resp.json();
    list.innerHTML = '';
    if (!data.comments || data.comments.length === 0) {
      list.innerHTML = '<p class="empty-state comment-empty">Aucun commentaire. Sois le premier !</p>';
      return;
    }
    data.comments.slice().reverse().forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'comment-item';
      var initials = (c.author || 'A').slice(0, 2).toUpperCase();
      el.innerHTML =
        '<div class="comment-avatar">' + escapeHtml(initials) + '</div>' +
        '<div class="comment-content">' +
          '<div class="comment-meta">' +
            '<strong class="comment-author">' + escapeHtml(c.author) + '</strong>' +
            '<span class="comment-time">' + new Date(c.ts).toLocaleString('fr-FR') + '</span>' +
          '</div>' +
          '<p class="comment-text">' + escapeHtml(c.text) + '</p>' +
        '</div>';
      list.appendChild(el);
    });
  } catch (err) { console.error(err); }
}

async function submitComment(pollId, optionName, authorInput, textInput, container) {
  var text = textInput.value.trim();
  if (!text) return;
  var sendBtn = container.querySelector('.comment-send-btn');
  sendBtn.disabled = true;
  try {
    var resp = await fetch('/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId: pollId, option: optionName, author: authorInput.value.trim(), text: text })
    });
    await readJsonResponse(resp);
    textInput.value = '';
    loadOptionComments(pollId, optionName, container);
    loadAllCommentCounts();
  } catch (err) {
    alert(err.message || "Impossible d'envoyer le commentaire");
  }
  sendBtn.disabled = false;
}

window.addEventListener('load', function () {
  loadPoll();
});
