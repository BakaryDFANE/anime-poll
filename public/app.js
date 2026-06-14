/* global $, optionName, optionInitials, readJsonResponse, fetchPolls */

async function loadPoll(){
  const area = $('#pollArea');
  const loading = document.getElementById('loading');
  try{
    const polls = await fetchPolls();
    const poll = polls[0];
    if(!poll) { area.innerHTML = '<p class="empty-state">Aucun sondage disponible.</p>'; return; }

    if (loading) loading.hidden = true;
    area.innerHTML = '';
    const card = document.createElement('div'); card.className='poll-card';
    const meta = document.createElement('div'); meta.className='section-label'; meta.textContent='Choisis ton camp';
    const title = document.createElement('h2'); title.textContent = poll.title;
    card.appendChild(meta); card.appendChild(title);

    const form = document.createElement('form'); form.id='voteForm';
    form.className = 'option-grid';
    poll.options.forEach((opt, idx) => {
      const name = optionName(opt);
      if (!name) return;

      const row = document.createElement('label');
      row.className='option';
      row.dataset.index = String(idx + 1).padStart(2, '0');

      const input = document.createElement('input');
      input.type='radio';
      input.name='choice';
      input.value = name;
      if(idx===0) input.checked=true;

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

      const body = document.createElement('span');
      body.className = 'option-body';
      const tag = document.createElement('span');
      tag.className = 'option-tag';
      tag.textContent = `ENTRY ${String(idx + 1).padStart(2, '0')}`;
      const txt = document.createElement('span');
      txt.className = 'option-name';
      txt.textContent = name;
      body.appendChild(tag);
      body.appendChild(txt);

      row.appendChild(input);
      row.appendChild(art);
      row.appendChild(body);
      form.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.className = 'vote-actions';
    const btn = document.createElement('button');
    btn.type='submit';
    btn.className='primary';
    btn.textContent='Verrouiller le vote';
    actions.appendChild(btn);
    form.appendChild(actions);

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const formData = new FormData(form);
      const option = formData.get('choice');
      btn.disabled = true;
      btn.textContent = 'Transmission...';
      try {
        const resp = await fetch('/vote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pollId:poll.id, option})});
        await readJsonResponse(resp);
        showResults();
      } catch (err) {
        alert(err.message || "Impossible d'enregistrer le vote");
        btn.disabled = false;
        btn.textContent = 'Verrouiller le vote';
      }
    });

    card.appendChild(form);
    area.appendChild(card);
  }catch(err){
    const isLocalFile = window.location.protocol === 'file:';
    area.innerHTML = isLocalFile
      ? '<p class="empty-state">Lance le serveur avec npm.cmd start, puis ouvre http://localhost:3000.</p>'
      : '<p class="empty-state">Erreur lors du chargement.</p>';
    console.error(err);
  }
}

async function showResults(){
  const resArea = $('#resultsArea');
  const resultsDiv = $('#results');
  try{
    const resp = await fetch('/results');
    const data = await resp.json();
    const res = data.results && data.results[0];
    if(!res){ resultsDiv.innerHTML='<p class="empty-state">Aucun résultat.</p>'; return; }
    resultsDiv.innerHTML='';
    const total = Object.values(res.counts).reduce((a,b)=>a+b,0) || 0;
    Object.entries(res.counts).forEach(([opt,count], idx)=>{
      const pct = total? Math.round((count/total)*100):0;
      const row = document.createElement('div');
      row.className = 'result-row';
      row.dataset.rank = String(idx + 1).padStart(2, '0');

      const label = document.createElement('div');
      label.className = 'result-label';
      const name = document.createElement('span');
      name.textContent = opt;
      const value = document.createElement('strong');
      value.textContent = `${pct}% / ${count} vote(s)`;
      label.appendChild(name);
      label.appendChild(value);

      const bar = document.createElement('div');
      bar.className='results-bar';
      const fill = document.createElement('div');
      fill.className='results-fill';
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      resultsDiv.appendChild(row);
    });
    resArea.hidden = false;
    resArea.scrollIntoView({behavior:'smooth', block:'start'});
    document.getElementById('newVote').onclick = ()=>{ resArea.hidden = true; loadPoll(); document.getElementById('pollArea').scrollIntoView({behavior:'smooth'}); };
  }catch(err){ console.error(err); }
}

window.addEventListener('load', ()=>{ loadPoll(); });
