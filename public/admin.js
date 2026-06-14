async function $(s){return document.querySelector(s)}

async function fetchPoll(key){
  const res = await fetch('/polls');
  const data = await res.json();
  return data.polls && data.polls[0];
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
    const resp = await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user, pass}), credentials: 'include'});
    const data = await resp.json();
    if(data.success) {
      editor.hidden = false; document.getElementById('loginArea').hidden = true;
      const poll = await fetchPoll(); renderPoll(poll);
    } else {
      alert('Échec de connexion');
    }
  });

  addBtn.addEventListener('click', async ()=>{
    const opt = newOpt.value.trim();
    if(!opt) return alert('Entrez une option');
    const poll = await fetchPoll();
    const resp = await fetch('/admin/addOption',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({pollId:poll.id, option:opt})});
    const data = await resp.json();
    if(data.error) return alert('Erreur: '+data.error);
    renderPoll(data.poll);
    newOpt.value = '';
  });

  resetBtn.addEventListener('click', async ()=>{
    if(!confirm('Réinitialiser tous les votes ?')) return;
    const resp = await fetch('/admin/resetVotes',{method:'POST',credentials:'include'});
    const data = await resp.json();
    if(data.success) alert('Votes réinitialisés');
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
      const li = document.createElement('li');
      li.textContent = opt + ' ';
      const rem = document.createElement('button'); rem.textContent = 'Supprimer'; rem.className='ghost';
      rem.addEventListener('click', async ()=>{
        if(!confirm('Supprimer "'+opt+'" ?')) return;
        const k = keyInput.value.trim();
        const resp = await fetch('/admin/removeOption?key='+encodeURIComponent(k),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pollId:poll.id, option:opt})});
        const data = await resp.json();
        if(data.error) return alert('Erreur: '+data.error);
        renderPoll(data.poll);
      });
      li.appendChild(rem);
      list.appendChild(li);
    });
    current.appendChild(list);
  }
});