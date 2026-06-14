/* global $, optionName, readJsonResponse, fetchPolls */

async function fetchPoll() {
  var polls = await fetchPolls();
  return polls[0];
}

window.addEventListener('load', async function () {
  var userInput = $('#adminUser');
  var passInput = $('#adminPass');
  var loginBtn = $('#loginBtn');
  var editor = $('#pollEditor');
  var current = $('#currentPoll');
  var addBtn = $('#addOption');
  var newOpt = $('#newOption');
  var resetBtn = $('#resetVotes');
  var resetCommentsBtn = $('#resetComments');
  var logoutBtn = $('#logoutBtn');

  loginBtn.addEventListener('click', async function () {
    var user = userInput.value.trim() || 'admin';
    var pass = passInput.value.trim();
    if (!pass) return alert('Entrez le mot de passe');

    try {
      var resp = await fetch('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: user, pass: pass }), credentials: 'include' });
      await readJsonResponse(resp);
      editor.hidden = false; document.getElementById('loginArea').hidden = true;
      var poll = await fetchPoll(); renderPoll(poll);
      loadAdminComments();
    } catch (err) {
      alert('Échec de connexion');
    }
  });

  addBtn.addEventListener('click', async function () {
    var opt = newOpt.value.trim();
    if (!opt) return alert('Entrez une option');
    var poll = await fetchPoll();
    if (!poll) return alert('Aucun sondage disponible');

    var fileInput = document.getElementById('optionImage');
    try {
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        var form = new FormData();
        form.append('image', fileInput.files[0]);
        form.append('name', opt);
        form.append('pollId', poll.id);
        var resp = await fetch('/admin/addOptionWithImage', { method: 'POST', credentials: 'include', body: form });
        var data = await readJsonResponse(resp);
        renderPoll(data.poll);
        newOpt.value = ''; fileInput.value = '';
      } else {
        var resp2 = await fetch('/admin/addOption', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ pollId: poll.id, option: opt }) });
        var data2 = await readJsonResponse(resp2);
        renderPoll(data2.poll);
        newOpt.value = '';
      }
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  });

  resetBtn.addEventListener('click', async function () {
    if (!confirm('Réinitialiser tous les votes ?')) return;
    try {
      var resp = await fetch('/admin/resetVotes', { method: 'POST', credentials: 'include' });
      await readJsonResponse(resp);
      alert('Votes réinitialisés');
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  });

  resetCommentsBtn.addEventListener('click', async function () {
    if (!confirm('Supprimer tous les commentaires ?')) return;
    try {
      var resp = await fetch('/admin/resetComments', { method: 'POST', credentials: 'include' });
      await readJsonResponse(resp);
      alert('Commentaires supprimés');
      loadAdminComments();
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  });

  logoutBtn.addEventListener('click', async function () {
    await fetch('/admin/logout', { method: 'POST', credentials: 'include' });
    editor.hidden = true; document.getElementById('loginArea').hidden = false;
  });

  function renderPoll(poll) {
    if (!poll) { current.innerHTML = '<p>Aucun sondage.</p>'; return; }
    current.innerHTML = '';
    var title = document.createElement('h3'); title.textContent = poll.title; current.appendChild(title);
    var list = document.createElement('ul');
    poll.options.forEach(function (opt) {
      var name = optionName(opt);
      if (!name) return;

      var li = document.createElement('li');
      li.className = 'admin-option';

      if (typeof opt === 'object' && opt.image) {
        var img = document.createElement('img');
        img.src = opt.image;
        img.alt = name;
        li.appendChild(img);
      }

      var label = document.createElement('span');
      label.textContent = name;
      li.appendChild(label);

      var rem = document.createElement('button'); rem.textContent = 'Supprimer'; rem.className = 'ghost';
      rem.addEventListener('click', async function () {
        if (!confirm('Supprimer "' + name + '" ?')) return;
        try {
          var resp = await fetch('/admin/removeOption', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ pollId: poll.id, option: name }) });
          var data = await readJsonResponse(resp);
          renderPoll(data.poll);
        } catch (err) {
          alert('Erreur: ' + err.message);
        }
      });
      li.appendChild(rem);
      list.appendChild(li);
    });
    current.appendChild(list);
  }

  async function loadAdminComments() {
    var container = $('#adminComments');
    try {
      var resp = await fetch('/comments', { credentials: 'include' });
      var data = await resp.json();
      container.innerHTML = '';
      if (!data.comments || data.comments.length === 0) {
        container.innerHTML = '<p>Aucun commentaire.</p>';
        return;
      }
      data.comments.slice().reverse().forEach(function (c) {
        var row = document.createElement('div');
        row.className = 'admin-comment';
        row.innerHTML =
          '<strong>' + escapeHtml(c.author) + '</strong> ' +
          '<small>' + new Date(c.ts).toLocaleString('fr-FR') + '</small>' +
          '<p>' + escapeHtml(c.text) + '</p>';
        var del = document.createElement('button');
        del.textContent = 'Supprimer';
        del.className = 'ghost';
        del.addEventListener('click', async function () {
          try {
            var resp2 = await fetch('/admin/deleteComment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ commentId: c.id }) });
            await readJsonResponse(resp2);
            loadAdminComments();
          } catch (err) {
            alert('Erreur: ' + err.message);
          }
        });
        row.appendChild(del);
        container.appendChild(row);
      });
    } catch (err) {
      console.error(err);
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
