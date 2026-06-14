async function $(s){return document.querySelector(s)}

function optionName(opt) {
  return typeof opt === 'string' ? opt : opt && opt.name;
}

async function fetchPoll(){
  const res = await fetch('/polls');
  const data = await res.json();
  return data.polls && data.polls[0];
}

async function readJsonResponse(resp) {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Erreur inconnue');
  return data;
}

window.addEventListener('load', async ()=>{
  const userInput = await $('#adminUser');
  const passInput = await $('#adminPass');
  const loginBtn = await $('#loginBtn');
  const editor = await $('#pollEditor');
  const current = await $('#currentPoll');
  const addBtn = await $('#addOption');
  const newOpt = await $('#newOption');
  const resetBtn = await $('#resetVotes');
  const logoutBtn = await $('#logoutBtn');

  loginBtn.addEventListener('click', async ()=>{
    const user = userInput.value.trim() || 'admin';
    const pass = passInput.value.trim();
    if(!pass) return alert('Entrez le mot de passe');

    try {
      const resp = await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user, pass}), credentials: 'include'});
      await readJsonResponse(resp);
      editor.hidden = false; document.getElementById('loginArea').hidden = true;
      const poll = await fetchPoll(); renderPoll(poll);
    } catch (err) {
      alert('Échec de connexion');
    }
  });

  addBtn.addEventListener('click', async ()=>{
    const opt = newOpt.value.trim();
    if(!opt) return alert('Entrez une option');
    const poll = await fetchPoll();
    if(!poll) return alert('Aucun sondage disponible');

    const fileInput = document.getElementById('optionImage');
    try {
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const form = new FormData();
        form.append('image', fileInput.files[0]);
        form.append('name', opt);
        form.append('pollId', poll.id);
        const resp = await fetch('/admin/addOptionWithImage',{method:'POST',credentials:'include',body:form});
        const data = await readJsonResponse(resp);
        renderPoll(data.poll);
        newOpt.value = ''; fileInput.value = '';
      } else {
        const resp = await fetch('/admin/addOption',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({pollId:poll.id, option:opt})});
        const data = await readJsonResponse(resp);
        renderPoll(data.poll);
        newOpt.value = '';
      }
    } catch (err) {
      alert('Erreur: '+err.message);
    }
  });

  resetBtn.addEventListener('click', async ()=>{
    if(!confirm('Réinitialiser tous les votes ?')) return;
    try {
      const resp = await fetch('/admin/resetVotes',{method:'POST',credentials:'include'});
      await readJsonResponse(resp);
      alert('Votes réinitialisés');
    } catch (err) {
      alert('Erreur: '+err.message);
    }
  });

  logoutBtn.addEventListener('click', async ()=>{
    await fetch('/admin/logout',{method:'POST',credentials:'include'});
    editor.hidden = true; document.getElementById('loginArea').hidden = false;
  });

  function renderPoll(poll){
    if(!poll) { current.innerHTML = '<p>Aucun sondage.</p>'; return; }
    current.innerHTML = '';
    const title = document.createElement('h3'); title.textContent = poll.title; current.appendChild(title);
    const list = document.createElement('ul');
    poll.options.forEach(opt=>{
      const name = optionName(opt);
      if (!name) return;

      const li = document.createElement('li');
      li.className = 'admin-option';

      if (typeof opt === 'object' && opt.image) {
        const img = document.createElement('img');
        img.src = opt.image;
        img.alt = name;
        li.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = name;
      li.appendChild(label);

      const rem = document.createElement('button'); rem.textContent = 'Supprimer'; rem.className='ghost';
      rem.addEventListener('click', async ()=>{
        if(!confirm('Supprimer "'+name+'" ?')) return;
        try {
          const resp = await fetch('/admin/removeOption',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({pollId:poll.id, option:name})});
          const data = await readJsonResponse(resp);
          renderPoll(data.poll);
        } catch (err) {
          alert('Erreur: '+err.message);
        }
      });
      li.appendChild(rem);
      list.appendChild(li);
    });
    current.appendChild(list);
  }
});
