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

// Helper pour récupérer la clé secrète depuis l'URL de la page ou les inputs
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

  // Vérification automatique à l'ouverture : si la clé est dans l'URL, on affiche directement l'éditeur
  const initialKey = getAdminKey();
  if (initialKey) {
    const loginArea = document.getElementById('loginArea');
    if (loginArea) loginArea.hidden = true;
    if (editor) editor.hidden = false;
    const poll = await fetchPoll(); 
    renderPoll(poll);
  }

  loginBtn.addEventListener('click', async ()=>{
    const user = userInput.value.trim() || 'admin';
    const pass = passInput.value.trim();
    if(!pass) return alert('Entrez le mot de passe');

    try {
      const resp = await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user, pass}), credentials: 'include'});
      await readJsonResponse(resp);
      
      // Redirige proprement en ajoutant la clé à l'URL pour sécuriser les requêtes suivantes
      window.location.href = window.location.pathname + '?key=' + encodeURIComponent(pass);
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
    const currentKey = getAdminKey();

    // On prépare l'URL avec la clé secrète pour contourner les bugs de session Vercel
    const queryParam = currentKey ? `?key=${encodeURIComponent(currentKey)}` : '';

    try {
      addBtn.disabled = true; // Évite les doubles clics accidentels pendant l'envoi
      addBtn.textContent = 'Envoi...';

      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const form = new FormData();
        form.append('image', fileInput.files[0]);
        form.append('name', opt);
        form.append('pollId', poll.id);

        const resp = await fetch(`/admin/addOptionWithImage${queryParam}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-admin-key': currentKey }, // Double sécurité
          body: form
        });
        const data = await readJsonResponse(resp);
        renderPoll(data.poll);
        newOpt.value = ''; fileInput.value = '';
      } else {
        const resp = await fetch(`/admin/addOption${queryParam}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-admin-key': currentKey
          },
          credentials: 'include',
          body: JSON.stringify({ pollId: poll.id, option: opt })
        });
        const data = await readJsonResponse(resp);
        renderPoll(data.poll);
        newOpt.value = '';
      }
      alert(`"${opt}" a été ajouté avec succès !`);
    } catch (err) {
      alert('Erreur: ' + err.message);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Ajouter l'option";
    }
  });

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

  logoutBtn.addEventListener('click', async ()=>{
    await fetch('/admin/logout',{method:'POST',credentials:'include'});
    // On vide l'URL et on réaffiche le login
    window.location.href = window.location.pathname;
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
      li.className