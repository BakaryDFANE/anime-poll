async function $(sel){return document.querySelector(sel)}

async function loadPoll(){
  const area = await $('#pollArea');
  const loading = document.getElementById('loading');
  try{
    const resp = await fetch('/polls');
    const data = await resp.json();
    const poll = data.polls && data.polls[0];
    if(!poll) { area.innerHTML = '<p>Aucun sondage disponible.</p>'; return; }

    loading.hidden = true;
    area.innerHTML = '';
    const card = document.createElement('div'); card.className='poll-card';
    const title = document.createElement('h2'); title.textContent = poll.title; card.appendChild(title);

    const form = document.createElement('form'); form.id='voteForm';
    poll.options.forEach((opt, idx) => {
      const row = document.createElement('label'); row.className='option';
      const input = document.createElement('input'); input.type='radio'; input.name='choice';
      const optionName = (typeof opt === 'string') ? opt : opt.name;
      input.value = optionName; if(idx===0) input.checked=true;
      const txt = document.createElement('span'); txt.textContent = optionName;
      if (typeof opt === 'object' && opt.image) {
        const img = document.createElement('img'); img.src = opt.image; img.alt = optionName; img.style.height='48px'; img.style.marginRight='10px'; img.style.borderRadius='6px';
        row.appendChild(img);
      }
      row.appendChild(input); row.appendChild(txt);
      form.appendChild(row);
    });

    const btn = document.createElement('button'); btn.type='submit'; btn.className='primary'; btn.textContent='Voter';
    form.appendChild(btn);

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const formData = new FormData(form);
      const option = formData.get('choice');
      await fetch('/vote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pollId:poll.id, option})});
      showResults();
    });

    card.appendChild(form);
    area.appendChild(card);
  }catch(err){ area.innerHTML='<p>Erreur lors du chargement.</p>'; console.error(err); }
}

async function showResults(){
  const resArea = await $('#resultsArea');
  const resultsDiv = await $('#results');
  try{
    const resp = await fetch('/results');
    const data = await resp.json();
    const res = data.results && data.results[0];
    if(!res){ resultsDiv.innerHTML='<p>Aucun résultat.</p>'; return; }
    resultsDiv.innerHTML='';
    const total = Object.values(res.counts).reduce((a,b)=>a+b,0) || 0;
    Object.entries(res.counts).forEach(([opt,count])=>{
      const row = document.createElement('div');
      const label = document.createElement('div'); label.textContent = `${opt} — ${count} vote(s)`;
      const bar = document.createElement('div'); bar.className='results-bar';
      const fill = document.createElement('div'); fill.className='results-fill';
      const pct = total? Math.round((count/total)*100):0;
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      row.appendChild(label); row.appendChild(bar);
      resultsDiv.appendChild(row);
    });
    resArea.hidden = false;
    document.getElementById('newVote').addEventListener('click', ()=>{ resArea.hidden = true; loadPoll(); document.getElementById('pollArea').scrollIntoView({behavior:'smooth'}); });
  }catch(err){ console.error(err); }
}

// split title letters for animation
(function(){const title = document.getElementById('siteTitle'); const text = title.textContent.trim(); title.innerHTML = ''; text.split('').forEach(ch=>{ const sp = document.createElement('span'); sp.textContent = ch; title.appendChild(sp); });})();

window.addEventListener('load', ()=>{ loadPoll(); });
