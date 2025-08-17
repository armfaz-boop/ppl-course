// ====================== Simple SPA Router ======================
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

// ====================== Views ======================
function renderHome() {
  app.innerHTML = `
    <div class="card">
      <h2>Welcome</h2>
      <p>Use <strong>Lesson</strong> to embed a Google Slides deck and <strong>Quiz</strong> URLs to launch topic-mix quizzes.</p>
      <h3>Examples</h3>
      <ul>
        <li>Lesson: <code>#lesson?title=Regs&src=PASTE_SLIDES_EMBED_SRC</code></li>
        <li>Quiz (single topic): <code>#server-quiz?lesson=KB01&pass=80&topics=G1.PGENINST-K:4</code></li>
        <li>Quiz (multi-topic): <code>#server-quiz?lesson=KB02&pass=80&topics=G1.PGENINST-K:4,Airspace:3,Weather:6</code></li>
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

async function renderServerQuizFromURL(params) {
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const secret   = (window.APP_CONFIG || {}).SHARED_SECRET;

  if (!endpoint || !secret) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p><strong>Backend not configured.</strong><br/>Fill SCRIPT_ENDPOINT and SHARED_SECRET in <code>index.html</code>.</p></div>`;
    return;
  }

  const lesson      = params.get('lesson') || '';
  const passPercent = Number(params.get('pass') || 80);
  const topicsSpec  = params.get('topics') || ''; // e.g., G1.PGENINST-K:4,Airspace:3

  // Build the quiz fetch URL for your current backend (expects action=quiz & secret)
  const url = new URL(endpoint);
  url.searchParams.set('action', 'quiz');
  url.searchParams.set('secret', secret);
  url.searchParams.set('topics', topicsSpec);

  app.innerHTML = `<div class="card">
    <p>Contacting server…</p>
    <p><small>URL: <code>${escapeHtml(url.toString())}</code></small></p>
  </div>`;

  const resp = await fetch(url.toString()).catch(() => null);
  if (!resp) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p>Network error: could not reach server.</p></div>`;
    return;
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    const text = await resp.text().catch(()=>'(no body)');
    app.innerHTML = `<div class="card"><h3>Quiz error</h3>
      <p>Server returned non-JSON (often a login/permissions page). First 200 chars:</p>
      <pre>${escapeHtml(text.slice(0,200))}</pre></div>`;
    return;
  }
  if (data.error) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p>${escapeHtml(data.error)}</p></div>`;
    return;
  }

  const questions = Array.isArray(data.questions) ? data.questions : [];
  // Normalize fields for rendering
  const norm = questions.map(q => ({
    id: q.id,
    q:  q.q || q.text || '',
    choices: q.choices || [],
    correct: q.correct, // letter A/B/C/D (grading done client-side for this backend)
    explanation: q.explanation || '',
    figure: q.figure || null
  }));

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
    const name  = document.getElementById('q_name').value.trim();
    const email = document.getElementById('q_email').value.trim();

    let correctCount = 0;
    const answersObj = {};
    norm.forEach((q, i) => {
      const choiceIdx = selections[i];
      const chosenLetter = idxToLetter(choiceIdx);
      answersObj[q.id] = chosenLetter || '';
      if ((chosenLetter || '') === String(q.correct || '').toUpperCase()) {
        correctCount++;
      }
    });

    const scorePct = Math.round((correctCount / norm.length) * 100);
    const passed = scorePct >= passPercent;

    // Submit log to backend: action=submit (matches your current Apps Script)
    const submitUrl = new URL(endpoint);
    submitUrl.searchParams.set('action', 'submit');
    submitUrl.searchParams.set('secret', secret);
    const payload = {
      student: name,
      lesson:  lesson,
      score:   correctCount,
      total:   norm.length,
      answers: answersObj
    };

    const res = await fetch(submitUrl.toString(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }).catch(()=>null);

    const showResult = (html) => {
      const box = document.getElementById('q_result');
      box.style.display = 'block';
      box.innerHTML = `<h3>Result</h3><p>${html}</p>`;
    };

    if (!res) {
      showResult('Network error while submitting results.');
      return;
    }
    let out;
    try { out = await res.json(); } catch {
      const text = await res.text().catch(()=>'(no body)');
      showResult(`Submit returned non-JSON: ${escapeHtml(text.slice(0,200))}`);
      return;
    }
    if (out.error) {
      showResult(`Server error: ${escapeHtml(out.error)}`);
      return;
    }

    showResult(`Score: <strong>${scorePct}%</strong> (${correctCount} / ${norm.length})<br>Status: ${passed ? '✅ PASS' : '❌ RETRY'}`);
  };
}

// ====================== Question Renderer (with figure fallbacks) ======================
function renderQuizQuestion(q, idx) {
  const container = document.createElement('div');
  container.className = 'question';

  const qText = document.createElement('div');
  qText.innerHTML = `<strong>Q${idx + 1}.</strong> ${escapeHtml(q.q)}`;
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
    img.onerror = () => {
      sidx += 1;
      if (sidx < sources.length) img.src = sources[sidx];
    };

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

// ====================== Utils ======================
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]
  ));
}
function idxToLetter(i){ return ['A','B','C','D'][Number(i)] || ''; }
