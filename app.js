const app = document.getElementById('app');

/* ------------ Router ------------- */
function render(route) {
  const base = route.split('?')[0].replace('#','') || 'home';
  const params = new URLSearchParams(route.split('?')[1] || '');
  if (base === 'lesson') return renderLessonFromURL(params);
  if (base === 'server-quiz') return renderServerQuizFromURL(params);
  return renderHome();
}
window.addEventListener('hashchange', () => render(location.hash));
window.addEventListener('load', () => render(location.hash));

/* ------------ Views ------------- */
function renderHome() {
  app.innerHTML = `
    <div class="card">
      <h2>Welcome</h2>
      <p>Use <strong>Lesson</strong> to embed a Google Slides deck. Use <strong>Quiz</strong> links/QRs to launch topic-mix quizzes.</p>
      <h3>Examples</h3>
      <ul>
        <li>Lesson embed: <code>#lesson?title=Regs&src=EMBED_URL_HERE</code></li>
        <li>Quiz launch: <code>#server-quiz?lesson=KB01&pass=80&topics=G1.PGENINST-K:4</code></li>
      </ul>
      <p>Tip on iPad: internal links/animations inside a deck work in the embed. Links to another deck open a new tab (that’s expected).</p>
    </div>
  `;
}

function renderLessonFromURL(params) {
  const title = params.get('title') || 'Lesson';
  const src = params.get('src') || ''; // paste your published-to-web Slides embed URL
  app.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <p>Embedded Slides (publish your deck to the web → Embed, then paste the iframe src here as the "src" param).</p>
      <div class="card">
        ${src ? `<iframe style="width:100%;height:520px" frameborder="0" allowfullscreen src="${src}"></iframe>` :
                 `<p><em>No slide src provided.</em></p>`}
      </div>
    </div>
  `;
}

async function renderServerQuizFromURL(params) {
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const secret = (window.APP_CONFIG || {}).SHARED_SECRET;
  if (!endpoint || !secret) {
    app.innerHTML = `<div class="card"><p><strong>Backend not configured.</strong><br>Fill SCRIPT_ENDPOINT and SHARED_SECRET in index.html.</p></div>`;
    return;
  }

  const lesson = params.get('lesson') || '';
  const passPercent = Number(params.get('pass') || 80);
  const topicsSpec = params.get('topics') || ''; // e.g., G1.PGENINST-K:4
  const cap = Number(params.get('cap') || 0);

  // fetch random questions from server
  const url = `${endpoint}?action=questions_buckets&lesson=${encodeURIComponent(lesson)}&topics=${encodeURIComponent(topicsSpec)}&cap=${cap}`;
  const boot = await fetch(url).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (!boot.ok) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p>${escapeHtml(boot.error || 'Could not load questions.')}</p></div>`;
    return;
  }
  const { quizId, questions } = boot;

  // render form
  app.innerHTML = `
    <div class="card">
      <h2>Quiz</h2>
      <p><strong>Lesson:</strong> ${escapeHtml(lesson || '(unspecified)')} • <strong>Passing:</strong> ${passPercent}%</p>
      <div class="card">
        <label>Name<br><input id="q_name" type="text" placeholder="Your name"/></label><br><br>
        <label>Email<br><input id="q_email" type="email" placeholder="you@example.com"/></label>
      </div>
      <div id="q_list"></div>
      <div style="margin-top:1rem">
        <button class="btn" id="q_submit">Submit</button>
      </div>
      <div id="q_result" class="card" style="display:none"></div>
    </div>
  `;

  // build question UI
  const container = document.getElementById('q_list');
  const selections = new Array(questions.length).fill(null);
  questions.forEach((qq, idx) => {
    const div = document.createElement('div');
    div.className = 'question';
    div.innerHTML = `
      <div><strong>Q${idx+1}.</strong> ${escapeHtml(qq.q)}</div>
      <div class="choices">
        ${qq.choices.map((c,i)=>`
          <label><input type="radio" name="q${idx}" value="${i}"> ${escapeHtml(c)}</label>
        `).join('')}
      </div>
    `;
    div.querySelectorAll('input[type=radio]').forEach(r=>{
      r.onchange = ()=> selections[idx] = Number(r.value);
    });
    container.appendChild(div);
  });

  // submit → grade on server → show result
  document.getElementById('q_submit').onclick = async () => {
    const name = document.getElementById('q_name').value.trim();
    const email = document.getElementById('q_email').value.trim();
    const answers = selections.map((ci, i) => ({ id: questions[i].id, choiceIndex: ci }));

    const graded = await fetch(`${endpoint}?action=grade`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        secret, quizId, name, email,
        passPercent,
        topicsSpec,
        requestedCount: questions.length,
        answers
      })
    }).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));

    const box = document.getElementById('q_result');
    box.style.display = 'block';
    if (!graded.ok) {
      box.innerHTML = `<h3>Could not grade</h3><p>${escapeHtml(graded.error || '')}</p>`;
      return;
    }
    box.innerHTML = `
      <h3>Result</h3>
      <p>Score: <strong>${graded.score}%</strong> (${graded.total} questions)</p>
      <p>Status: ${graded.passed ? '✅ PASS' : '❌ RETRY'}</p>
      <p>Attempt code: <code>${graded.attemptCode}</code></p>
      ${lesson === 'FINAL' && graded.passed ? `
        <hr><p>If you believe you meet eligibility, click to request instructor endorsement review.</p>
        <button class="btn" id="endorseBtn">Request Endorsement Check</button>
      ` : ``}
    `;
    const endorseBtn = document.getElementById('endorseBtn');
    if (endorseBtn) {
      endorseBtn.onclick = async () => {
        const res = await fetch(`${endpoint}?action=finalize`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ secret, studentName: name, studentEmail: email })
        }).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
        alert(res.ok && res.eligible
          ? 'Eligibility confirmed. An endorsement draft was emailed to the instructor.'
          : (res.reason || 'Not eligible yet.')
        );
      };
    }
  };
}

/* ------------ Utils ------------- */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
