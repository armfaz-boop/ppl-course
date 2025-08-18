// ===== app.js (no hardcoded endpoint; reads from window.APP_CONFIG) =====

// Sanity: expose config and log the endpoint on load
window.APP_CONFIG = window.APP_CONFIG || {};
const ENDPOINT = window.APP_CONFIG.SCRIPT_ENDPOINT || '';
const SECRET   = window.APP_CONFIG.SHARED_SECRET   || '';
if (!ENDPOINT || !SECRET) {
  console.warn('APP_CONFIG missing ENDPOINT or SECRET. Check index.html APP_CONFIG block.');
}
window.addEventListener('load', () => {
  console.log('Using SCRIPT_ENDPOINT:', ENDPOINT);
});

// Simple SPA router
const app = document.getElementById('app');
function render(route) {
  const hash = (route || '').replace(/^#/, '');
  const [base, qs] = hash.split('?');
  const params = new URLSearchParams(qs || '');
  switch ((base || 'home').toLowerCase()) {
    case 'server-quiz':  return renderServerQuizFromURL(params);
    case 'lesson':       return renderLessonFromURL(params);
    default:             return renderHome();
  }
}
window.addEventListener('hashchange', () => render(location.hash));
window.addEventListener('load', () => render(location.hash));

// Views
function renderHome() {
  app.innerHTML = `
    <div class="card">
      <h2>Welcome</h2>
      <p>Use <strong>Lesson</strong> to embed a Google Slides deck and <strong>Quiz</strong> URLs to launch topic-mix quizzes.</p>
      <h3>Examples</h3>
      <ul>
        <li>Lesson: <code>#lesson?title=Regs&src=PASTE_SLIDES_EMBED_SRC</code></li>
        <li>Quiz (single): <code>#server-quiz?lesson=KB01&pass=80&topics=G1.PGENINST-K:4</code></li>
        <li>Quiz (multi): <code>#server-quiz?lesson=KB02&pass=80&topics=G1.PGENINST-K:4,Airspace:3,Weather:6</code></li>
      </ul>
    </div>
  `;
}
function renderLessonFromURL(params) {
  const title = params.get('title') || 'Lesson';
  const src   = params.get('src') || '';
  app.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="card">
        ${
          src
          ? `<iframe style="width:100%;height:520px" frameborder="0" allowfullscreen src="${src}"></iframe>`
          : `<p><em>No slide src provided. Publish your deck to the web → Embed, then paste the iframe <code>src</code> as the "src" param.</em></p>`
        }
      </div>
    </div>
  `;
}

// ---------- Server helpers ----------
async function fetchQuizFromServer(topicsSpec, code) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('action', 'quiz');
  url.searchParams.set('secret', SECRET);
  url.searchParams.set('topics', topicsSpec);
  if (code) url.searchParams.set('code', code);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Quiz HTTP ${resp.status}`);
  const data = await resp.json().catch(async ()=>({ error: await resp.text() }));
  if (data.error) throw new Error(data.error);
  return data.questions || [];
}
async function submitQuizResults({ student, email, lesson, score, total, answers, passPercent }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('action', 'submit');
  url.searchParams.set('secret', SECRET);
  const resp = await fetch(url.toString(), {
    method: 'POST',
    body: JSON.stringify({ student, email, lesson, score, total, answers, passPercent })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(()=>'(no body)');
    throw new Error(`Submit HTTP ${resp.status}: ${text.slice(0,200)}`);
  }
  const out = await resp.json().catch(async ()=>({ error: await resp.text() }));
  if (out.error) throw new Error(out.error);
  return out;
}

// ---------- Quiz view with password gate ----------
async function renderServerQuizFromURL(params) {
  const lesson      = params.get('lesson') || '';
  const passPercent = Number(params.get('pass') || 80);
  const topicsSpec  = params.get('topics') || '';
  const preCode     = params.get('code') || '';

  app.innerHTML = `
    <div class="card">
      <h2>Quiz Access</h2>
      <p>Enter the class password to unlock today’s quiz.</p>
      <div class="card" id="gate">
        <label>Password<br><input id="q_code" type="password" placeholder="Class password"/></label>
        <div style="margin-top:.75rem">
          <button class="btn" id="q_unlock">Unlock</button>
        </div>
        <div id="q_gate_msg" style="margin-top:.5rem;color:#b00;display:none"></div>
      </div>
      <div id="quiz_shell" style="display:none"></div>
    </div>
  `;

  const codeInput = document.getElementById('q_code');
  const gateMsg   = document.getElementById('q_gate_msg');
  const unlockBtn = document.getElementById('q_unlock');
  const shell     = document.getElementById('quiz_shell');
  if (preCode) codeInput.value = preCode;

  const loadQuiz = async (code) => {
    gateMsg.style.display = 'none';
    document.getElementById('gate').style.opacity = '0.6';
    unlockBtn.disabled = true;

    let questions;
    try {
      questions = await fetchQuizFromServer(topicsSpec, code);
    } catch (err) {
      const msg = (err && err.message || '').toLowerCase();
      if (msg.includes('locked') || msg.includes('bad_code')) {
        document.getElementById('gate').style.opacity = '1';
        unlockBtn.disabled = false;
        gateMsg.textContent = 'Incorrect password. Please try again.';
        gateMsg.style.display = 'block';
        return;
      }
      document.getElementById('gate').style.opacity = '1';
      unlockBtn.disabled = false;
      gateMsg.textContent = `Error: ${err && err.message ? err.message : String(err)}`;
      gateMsg.style.display = 'block';
      return;
    }

    // Hide gate, show quiz
    document.getElementById('gate').style.display = 'none';
    shell.style.display = 'block';

    const norm = questions.map(q => ({
      id: q.id,
      text: q.q || q.text || '',
      choices: q.choices || [],
      correct: (q.correct || '').toString().toUpperCase(),
      explanation: q.explanation || '',
      figure: q.figure || null
    }));

    shell.innerHTML = `
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

    const qList = document.getElementById('q_list');
    const selections = new Array(norm.length).fill(null);
    norm.forEach((q, idx) => {
      const node = renderQuizQuestion(q, idx);
      node.querySelectorAll('input[type=radio]').forEach(r => {
        r.onchange = () => selections[idx] = Number(r.value);
      });
      qList.appendChild(node);
    });

    document.getElementById('q_submit').onclick = async () => {
      const nameEl  = document.getElementById('q_name');
      const emailEl = document.getElementById('q_email');
      const name  = (nameEl?.value || '').trim();
      const email = (emailEl?.value || '').trim();

      const showResult = (html) => {
        const box = document.getElementById('q_result');
        box.style.display = 'block';
        box.innerHTML = `<h3>Result</h3><p>${html}</p>`;
      };

      const submitBtn = document.getElementById('q_submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.pointerEvents = 'none';
        submitBtn.style.opacity = '0.6';
        setTimeout(() => { submitBtn.style.display = 'none'; }, 50);
      }
      if (nameEl)  nameEl.disabled  = true;
      if (emailEl) emailEl.disabled = true;
      document.querySelectorAll('#q_list input[type=radio]').forEach(el => el.disabled = true);

      let correctCount = 0;
      const answersObj = {};
      norm.forEach((q, i) => {
        const choiceIdx = selections[i];
        const chosenLetter = idxToLetter(choiceIdx);
        answersObj[q.id] = chosenLetter || '';
        if ((chosenLetter || '') === q.correct) correctCount++;
      });

      const scorePct = Math.round((correctCount / norm.length) * 100);
      const passed   = scorePct >= passPercent;

      try {
        await submitQuizResults({
          student: name,
          email,
          lesson,
          score: correctCount,
          total: norm.length,
          answers: answersObj,
          passPercent
        });
        showResult(`Score: <strong>${scorePct}%</strong> (${correctCount} / ${norm.length})<br>Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      } catch (err) {
        showResult(`Submit error: ${escapeHtml(err.message || String(err))}`);
      }
    };
  };

  unlockBtn.onclick = () => loadQuiz(codeInput.value.trim());
  codeInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') unlockBtn.click();
  });

  // Auto-unlock if &code=... provided
  if (preCode) unlockBtn.click();
}

// Question renderer (with figure fallbacks)
function renderQuizQuestion(q, idx) {
  const container = document.createElement('div');
  container.className = 'question';

  const qText = document.createElement('div');
  qText.innerHTML = `<strong>Q${idx + 1}.</strong> ${escapeHtml(q.text)}`;
  container.appendChild(qText);

  const fig = q.figure || null;
  const sources = [];
  if (fig) {
    if (fig.url) sources.push(fig.url);
    if (fig.altUrl) sources.push(fig.altUrl);
    if (fig.thumb) sources.push(fig.thumb);
  }
  if (sources.length) {
    const figWrap = document.createElement('div');
    figWrap.className = 'quiz-figure';
    figWrap.style.margin = '.5rem 0 1rem';
    const img = document.createElement('img');
    img.alt = `Figure ${fig.number || ''}`;
    img.style.maxWidth = '100%';
    img.style.border = '1px solid #eee';
    img.style.borderRadius = '6px';
    img.style.height = 'auto';
    if (fig.width) img.style.width = `${fig.width}px`;
    let sidx = 0;
    img.src = sources[sidx];
    img.onerror = () => { sidx += 1; if (sidx < sources.length) img.src = sources[sidx]; };
    const cap = document.createElement('div');
    cap.className = 'figure-caption';
    cap.style.fontSize = '.85rem';
    cap.style.color = '#555';
    cap.textContent = `Figure ${fig.number || ''}`;
    figWrap.appendChild(img);
    figWrap.appendChild(cap);
    container.appendChild(figWrap);
  }

  const choicesWrap = document.createElement('div');
  choicesWrap.className = 'choices';
  choicesWrap.style.display = 'grid';
  choicesWrap.style.gap = '.5rem';
  (q.choices || []).forEach((choice, i) => {
    const label = document.createElement('label');
    label.className = 'quiz-choice';
    label.style.cursor = 'pointer';
    label.innerHTML = `
      <input type="radio" name="q${idx}" value="${i}" />
      ${escapeHtml(String(choice))}
    `;
    choicesWrap.appendChild(label);
  });
  container.appendChild(choicesWrap);
  return container;
}

// Utils
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]
  ));
}
function idxToLetter(i){ return ['A','B','C','D'][Number(i)] || ''; }
