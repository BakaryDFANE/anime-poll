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

// Récupère la clé secrète directement depuis la barre d'adresse (?key=...)
function getAdminKey() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('key') || "";
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

  // Création sondage
  const createPollArea = await $('#createPollArea');
  const optionArea = await $('#optionArea');
  const noPollState = await $('#noPollState');
  const createPollBtn = await $('#createPollBtn');
  const newPollId = await $('#newPollId');
  const newPollTitle = await $('#newPollTitle');


  // Si la clé de sécurité est déjà dans l'URL, on connecte directement l'admin
  const initialKey = getAdminKey();

  async function refreshUIFromPoll() {
    const poll = await fetchPoll();
    if (!poll) {
      if (noPollState) noPollState.hidden = false;
      if (createPollArea) createPollArea.style.display = 'block';
      if (optionArea) optionArea.style.display = 'none';
      // optionArea doit rester masquée tant qu'on n'a pas de sondage
      if (current) current.innerHTML = '';
      return;
    }

    if (noPollState) noPollState.hidden = true;
    if (createPollArea) createPollArea.style.display = 'none';
    if (optionArea) optionArea.style.display = 'block';
    renderPoll(poll);
  }

  if (initialKey) {
    const loginArea = document.getElementById('loginArea');
    if (loginArea) loginArea.hidden = true;
    if (editor) editor.hidden = false;
    await refreshUIFromPoll();
  }


  // Connexion manuelle via le formulaire
  loginBtn.addEventListener('click', async ()=>{
    const user = userInput.value.trim() || 'admin';
    const pass = passInput.value.trim();
    if(!pass) return alert('Entrez le mot de passe');

    try {
      const resp = await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user, pass}), credentials: 'include'});
      await readJsonResponse(resp);
      
      // On recharge la page en injectant la clé dans l'URL pour sécuriser les appels suivants
      window.location.href = window.location.pathname + '?key=' + encodeURIComponent(pass);
    } catch (err) {
      alert('Échec de connexion');
    }
  });

  // Création de sondage
  createPollBtn.addEventListener('click', async ()=>{
    const id = newPollId.value.trim();
    const title = newPollTitle.value.trim();
    if (!id) return alert('Entrez un id de sondage');
    if (!title) return alert('Entrez un titre de sondage');

    const currentKey = getAdminKey();
    const queryParam = currentKey ? `?key=${encodeURIComponent(currentKey)}` : '';

    try {
      createPollBtn.disabled = true;
      createPollBtn.textContent = 'Création...';

      const resp = await fetch(`/admin/addPoll${queryParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-admin-key': currentKey
        },
        credentials: 'include',
        body: JSON.stringify({ id, title, options: [] })
      });

      const data = await readJsonResponse(resp);
      alert('Sondage créé avec succès !');

      // Recharger UI: devrait passer en mode “optionArea”
      if (noPollState) noPollState.hidden = true;
      if (createPollArea) createPollArea.style.display = 'none';
      if (optionArea) optionArea.style.display = 'block';
      renderPoll(data.poll);

      newPollId.value = '';
      newPollTitle.value = '';
    } catch (err) {
      alert('Erreur: ' + err.message);
    } finally {
      createPollBtn.disabled = false;
      createPollBtn.textContent = 'Créer le sondage';
    }
  });


  // Ajout d'une option d'animé (avec ou sans URL d'image)
  addBtn.addEventListener('click', async ()=>{
    const opt = newOpt.value.trim();
    if(!opt) return alert('Entrez une option');
    const poll = await fetchPoll();
    if(!poll) {
      if (noPollState) noPollState.hidden = false;
      if (createPollArea) createPollArea.style.display = 'block';
      if (optionArea) optionArea.style.display = 'none';
      return alert('Aucun sondage disponible');
    }


    const imageUrlInput = document.getElementById('optionImage');
    const imageUrl = imageUrlInput ? imageUrlInput.value.trim() : "";
    const currentKey = getAdminKey();
    const queryParam = currentKey ? `?key=${encodeURIComponent(currentKey)}` : '';

    try {
      addBtn.disabled = true;
      addBtn.textContent = 'Envoi...';

      // Envoi de la requête JSON légère (parfaite pour Vercel et Redis)
      const resp = await fetch(`/admin/addOption${queryParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-admin-key': currentKey
        },
        credentials: 'include',
        body: JSON.stringify({ 
          pollId: poll.id, 
          option: opt,
          image: imageUrl // Le serveur reçoit directement la chaîne de caractères (le lien web)
        })
      });

      const data = await readJsonResponse(resp);
      renderPoll(data.poll);
      
      // Nettoyage des formulaires après succès
      newOpt.value = ''; 
      if (imageUrlInput) imageUrlInput.value = '';
      
      alert(`"${opt}" a été ajouté avec succès !`);
    } catch (err) {
      alert('Erreur: ' + err.message);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Ajouter l'option";
    }
  });

  // Réinitialisation globale du sondage
  resetBtn.addEventListener('click', async ()=>{
    if(!confirm('Réinitialiser tous les votes ?')) return;
    const currentKey = getAdminKey();
    const queryParam = currentKey ? `?key=${encodeURIComponent(currentKey)}` : '';

    try {
      const resp = await fetch(`/admin/resetVotes${queryParam}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-admin-key': currentKey }
      });
      await readJsonResponse(resp);
      alert('Votes réinitialisés');
      window.location.reload();
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  });

  // Déconnexion
  logoutBtn.addEventListener('click', async ()=>{
    await fetch('/admin/logout',{method:'POST',credentials:'include'});
    window.location.href = window.location.pathname;
  });

  // Rendu de l'interface admin avec styles d'images optimisés
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

      // Design des miniatures d'images pour qu'elles soient nettes, proportionnelles et lisibles
      if (typeof opt === 'object' && opt.image) {
        const img = document.createElement('img');
        img.src = opt.image;
        img.alt = name;
        img.style.width = '65px';
        img.style.height = '65px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';
        img.style.marginRight = '12px';
        img.style.verticalAlign = 'middle';
        li.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = name;
      li.appendChild(label);

      const rem = document.createElement('button'); rem.textContent = 'Supprimer'; rem.className='ghost';
      rem.addEventListener('click', async ()=>{
        if(!confirm('Supprimer "'+name+'" ?')) return;
        const currentKey = getAdminKey();
        const queryParam = currentKey ? `?key=${encodeURIComponent(currentKey)}` : '';

        try {
          const resp = await fetch(`/admin/removeOption${queryParam}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-admin-key': currentKey
            },
            credentials: 'include',
            body: JSON.stringify({ pollId: poll.id, option: name })
          });
          const data = await readJsonResponse(resp);
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
});