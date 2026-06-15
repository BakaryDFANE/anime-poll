async function $(sel){return document.querySelector(sel)}

function optionName(opt) {
  return typeof opt === 'string' ? opt : opt && opt.name;
}

function optionInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

// Calcule le score global basé sur les 3 types de votes
function calculateScore(counts) {
  const love = counts.love || 0;
  const like = counts.like || 0;
  const dislike = counts.dislike || 0;
  return (love * 2) + like - dislike;
}

async function loadPoll(){
  const area = await $('#pollArea');
  const loading = document.getElementById('loading');
  try{
    const resp = await fetch('/polls');
    const data = await resp.json();
    const poll = data.polls && data.polls[0];
    if(!poll) { area.innerHTML = '<p class="empty-state">Aucun sondage disponible.</p>'; return; }

    if (loading) loading.hidden = true;
    area.innerHTML = '';
    
    const card = document.createElement('div'); card.className='poll-card';
    const meta = document.createElement('div'); meta.className='section-label'; meta.textContent='Sondage interactif';
    const title = document.createElement('h2'); title.textContent = poll.title;
    card.appendChild(meta); card.appendChild(title);

    const animeGrid = document.createElement('div');
    animeGrid.className = 'option-grid';
    
    poll.options.forEach((opt, idx) => {
      const name = optionName(opt);
      if (!name) return;

      const row = document.createElement('div');
      row.className = 'option-block'; // Changé en div pour inclure formulaires et boutons
      row.style.border = "1px solid var(--line, #eee)";
      row.style.padding = "16px";
      row.style.borderRadius = "8px";
      row.style.marginBottom = "16px";
      row.style.background = "var(--panel, #fff)";

      // En-tête de l'animé (Image/Initiale + Nom)
      const headerDiv = document.createElement('div');
      headerDiv.className = 'anime-header';
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.gap = '12px';
      headerDiv.style.marginBottom = '12px';

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
      txt.style.fontWeight = 'bold';
      txt.textContent = name;

      headerDiv.appendChild(art);
      headerDiv.appendChild(txt);
      row.appendChild(headerDiv);

      // --- 1. SECTION VOTE (3 BOUTONS ÉMOJIS) ---
      const voteContainer = document.createElement('div');
      voteContainer.className = 'emoji-vote-container';
      voteContainer.style.display = 'flex';
      voteContainer.style.justifyContent = 'space-around';
      voteContainer.style.padding = '8px';
      voteContainer.style.background = 'var(--panel-2, #f9f9f9)';
      voteContainer.style.borderRadius = '6px';
      voteContainer.style.marginBottom = '16px';

      const emojis = [
        { type: 'dislike', icon: '👎', label: "J'aime pas" },
        { type: 'like', icon: '👍', label: "J'aime" },
        { type: 'love', icon: '❤️', label: "J'aime trop" }
      ];

      emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.background = 'none';
        btn.style.border = 'none';
        btn.style.fontSize = '24px';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'transform 0.1s';
        btn.title = emoji.label;
        btn.textContent = emoji.icon;
        
        btn.onmouseover = () => btn.style.transform = 'scale(1.2)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';

        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const voteResp = await fetch('/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pollId: poll.id, option: name, voteType: emoji.type })
          });
          if (!voteResp.ok) {
            alert("Erreur lors de l'enregistrement du vote");
            btn.disabled = false;
          } else {
            showResults();
          }
        });
        voteContainer.appendChild(btn);
      });
      row.appendChild(voteContainer);

      // --- 2. SECTION AFFICHAGE DES COMMENTAIRES ---
      const commentSection = document.createElement('div');
      commentSection.className = 'comment-section';
      commentSection.style.borderTop = '1px solid var(--line, #eee)';
      commentSection.style.paddingTop = '10px';

      const commTitle = document.createElement('h4');
      commTitle.textContent = 'Commentaires';
      commTitle.style.fontSize = '12px';
      commTitle.style.color = 'var(--ink, #666)';
      commTitle.style.marginBottom = '6px';
      commentSection.appendChild(commTitle);

      const commList = document.createElement('div');
      commList.style.maxHeight = '120px';
      commList.style.overflowY = 'auto';
      commList.style.fontSize = '13px';
      commList.style.marginBottom = '10px';

      if (opt.comments && opt.comments.length > 0) {
        opt.comments.forEach(c => {
          const cBox = document.createElement('div');
          cBox.style.padding = '4px 8px';
          cBox.style.background = 'var(--panel-2, #f5f5f5)';
          cBox.style.borderRadius = '4px';
          cBox.style.marginBottom = '4px';
          cBox.innerHTML = `<strong style="color:var(--primary, #4f46e5)">${c.author}</strong> : ${c.text}`;
          commList.appendChild(cBox);
        });
      } else {
        commList.innerHTML = '<p style="color:#aaa; font-style:italic;">Aucun commentaire.</p>';
      }
      commentSection.appendChild(commList);

      // --- 3. FORMULAIRE DE COMMENTAIRE (ANONYME OU PSEUDO) ---
      const commForm = document.createElement('form');
      commForm.style.display = 'flex';
      commForm.style.flexDirection = 'column';
      commForm.style.gap = '6px';

      // Options Anonyme / Pseudo
      const identityDiv = document.createElement('div');
      identityDiv.style.display = 'flex';
      identityDiv.style.gap = '10px';
      identityDiv.style.fontSize = '11px';

      const labelAnon = document.createElement('label');
      const radioAnon = document.createElement('input');
      radioAnon.type = 'radio';
      radioAnon.name = `identity-${idx}`;
      radioAnon.checked = true;
      labelAnon.appendChild(radioAnon);
      labelAnon.append(' Anonyme');

      const labelPseudo = document.createElement('label');
      const radioPseudo = document.createElement('input');
      radioPseudo.type = 'radio';
      radioPseudo.name = `identity-${idx}`;
      labelPseudo.appendChild(radioPseudo);
      labelPseudo.append(' Pseudo');

      identityDiv.appendChild(labelAnon);
      identityDiv.appendChild(labelPseudo);
      commForm.appendChild(identityDiv);

      // Champ de texte Pseudo (caché de base)
      const pseudoInput = document.createElement('input');
      pseudoInput.type = 'text';
      pseudoInput.placeholder = 'Ton pseudo...';
      pseudoInput.style.display = 'none';
      pseudoInput.style.padding = '4px';
      pseudoInput.style.fontSize = '12px';
      commForm.appendChild(pseudoInput);

      radioAnon.addEventListener('change', () => { pseudoInput.style.display = 'none'; });
      radioPseudo.addEventListener('change', () => { pseudoInput.style.display = 'block'; });

      // Champ texte du commentaire + Bouton envoyer
      const inputGroup = document.createElement('div');
      inputGroup.style.display = 'flex';
      inputGroup.style.gap = '6px';

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.placeholder = 'Ajouter un commentaire...';
      textInput.style.flex = '1';
      textInput.style.padding = '6px';
      textInput.style.fontSize = '13px';
      textInput.required = true;

      const sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.textContent = '➚';
      sendBtn.style.padding = '4px 10px';
      sendBtn.style.cursor = 'pointer';

      inputGroup.appendChild(textInput);
      inputGroup.appendChild(sendBtn);
      commForm.appendChild(inputGroup);

      // Événement d'envoi du commentaire
      commForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const author = radioAnon.checked ? 'Anonyme' : (pseudoInput.value.trim() || 'Anonyme');
        const text = textInput.value.trim();
        
        sendBtn.disabled = true;
        const commResp = await fetch('/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollId: poll.id, option: name, author, text })
        });

        if (commResp.ok) {
          textInput.value = '';
          pseudoInput.value = '';
          loadPoll(); // Recharge le sondage pour voir le commentaire en direct
        } else {
          alert("Impossible d'envoyer le commentaire");
          sendBtn.disabled = false;
        }
      });

      commentSection.appendChild(commForm);
      row.appendChild(commentSection);
      animeGrid.appendChild(row);
    });

    card.appendChild(animeGrid);
    area.appendChild(card);
    
    // Charger également les résultats en bas de page directement
    showResults();
  }catch(err){
    const isLocalFile = window.location.protocol === 'file:';
    area.innerHTML = isLocalFile
      ? '<p class="empty-state">Lance le serveur avec npm start, puis ouvre http://localhost:3000.</p>'
      : '<p class="empty-state">Erreur lors du chargement.</p>';
    console.error(err);
  }
}

async function showResults(){
  const resArea = await $('#resultsArea');
  const resultsDiv = await $('#results');
  try{
    const resp = await fetch('/results');
    const data = await resp.json();
    const res = data.results && data.results[0];
    if(!res){ resultsDiv.innerHTML='<p class="empty-state">Aucun résultat.</p>'; return; }
    resultsDiv.innerHTML='';
    
    // Convertir les résultats en tableau pour pouvoir les TRIER par score
    const sortedEntries = Object.entries(res.counts).sort((a, b) => {
      return calculateScore(b[1]) - calculateScore(a[1]);
    });

    sortedEntries.forEach(([opt, counts], idx)=>{
      const love = counts.love || 0;
      const like = counts.like || 0;
      const dislike = counts.dislike || 0;
      const totalScore = calculateScore(counts);

      const row = document.createElement('div');
      row.className = 'result-row';
      row.dataset.rank = String(idx + 1).padStart(2, '0');

      const label = document.createElement('div');
      label.className = 'result-label';
      label.style.display = 'flex';
      label.style.justifyContent = 'flex-between';
      
      const name = document.createElement('span');
      name.innerHTML = `<strong>#${idx + 1}</strong> ${opt}`;
      
      const value = document.createElement('strong');
      value.innerHTML = `<span title="J'aime trop">❤️${love}</span> <span title="J'aime">👍${like}</span> <span title="J'aime pas">👎${dislike}</span> — Score: ${totalScore} pts`;
      
      label.appendChild(name);
      label.appendChild(value);

      // Barre de progression visuelle basée sur le score absolu (positif) pour le design
      const bar = document.createElement('div');
      bar.className='results-bar';
      const fill = document.createElement('div');
      fill.className='results-fill';
      // Permet d'éviter les bugs d'affichage si le score est négatif
      fill.style.width = Math.max(0, Math.min(100, totalScore * 5)) + '%'; 
      
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      resultsDiv.appendChild(row);
    });
    
    resArea.hidden = false;
    document.getElementById('newVote').onclick = ()=>{ loadPoll(); document.getElementById('pollArea').scrollIntoView({behavior:'smooth'}); };
  }catch(err){ console.error(err); }
}

window.addEventListener('load', ()=>{ loadPoll(); });