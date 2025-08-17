// ===== Simple SPA router =====
const app = document.getElementById('app');

function render(route) {
  const base = (route || '').split('?')[0].replace('#','') || 'home';
  const params = new URLSearchParams((route || '').split('?')[1] || '');
  if (base === 'lesson') return renderLessonFromURL(params);
  if (base === 'server-quiz') return renderServerQuizFromURL(params);
  return renderHome();
}
window.addEventListener('hashchange', () => render(location.hash));
window.addEventListener('load', () => render(location.hash));

// ===== Views =====
function renderHome() {
  app.innerHTML = `
    <div class="card">
      <h2>Welcome</h2>
      <p>Use <strong>Lesson</strong> to embed a Google Slides deck. Use <strong>Quiz</strong> links/QRs to launch topic-mix quizzes.</p>
      <h3>Examples</h3>
      <ul>
        <li>Lesson: <code>#lesson?title=Regs&src=EMBED_URL_HERE</code></li>
        <li>Quiz: <code>#server-quiz?lesson=KB01&pass=80&topics=G1.PGENINST-K:4</code></li>
      </ul>
      <p><small>Tip: iPad works fine. Internal links/animations in a deck work; links to other decks open a new tab.</small></p>
    </div>
  `;
}

function renderLessonFromURL(params) {
  const title = params.get('title') || 'Lesson';
  const src = params.get('src') || ''; // Published-to-web Slides iframe src
  app.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="card">
        ${src ? `<iframe style="width:100%;height:520px" frameborder="0" allowfullscreen src="${src}"></iframe>`
              : `<p><em>No slide src provided. Publish your deck to the web → Embed, then paste the iframe src as the "src" param.</em></p>`}
      </div>
    </div>
  `;
}

async function renderServerQuizFromURL(params) {
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const secret   = (window.APP_CONFIG || {}).SHARED_SECRET;

  if (!endpoint || !secret) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p><strong>Backend not configured.</strong><br>Fill SCRIPT_ENDPOINT and SHARED_SECRET in index.html.</p></div>`;
    return;
  }

  const lesson      = params.get('lesson') || '';
  const passPercent = Number(params.get('pass') || 80);
  const topicsSpec  = params.get('topics') || ''; // e.g., G1.PGENINST-K:4
  const cap         = Number(params.get('cap') || 0);

  const url = `${endpoint}?action=questions_buckets&lesson=${encodeURIComponent(lesson)}&topics=${encodeURIComponent(topicsSpec)}&cap=${cap}`;

  // --- Improved fetch with diagnostics ---
  const resp = await fetch(url).catch(() => null);
  if (!resp) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p>Network error: could not reach server.</p></div>`;
    return;
  }
  let boot;
  try {
    boot = await resp.json();
  } catch {
    const text = await resp.text().catch(()=>'(no body)');
    app.innerHTML = `<div class="card"><h3>Quiz error</h3>
      <p>Server returned non-JSON (often means login/permissions). First 200 chars:</p>
      <pre>${escapeHtml(text.slice(0,200))}</pre></div>`;
    return;
  }
  if (!boot.ok) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p>${escapeHtml(boot.error || 'Server error')}</p></div>`;
    return;
  }
  // --------------------------------------

  const { quizId, questions } = boot;

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

  // Build questions UI
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

  // Submit → grade on server → show result
  document.getElementById('q_submit').onclick = async () => {
    const name  = document.getElementById('q_name').value.trim();
    const email = document.getElementById('q_email').value.trim();

    const answers = selections.map((ci, i) => ({ id: questions[i].id, choiceIndex: ci }));

    const gradedResp = await fetch(`${endpoint}?action=grade`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        secret, quizId, name, email,
        passPercent,
        topicsSpec,
        requestedCount: questions.length,
        answers
      })
    }).catch(() => null);

    if (!gradedResp) {
      showResult(`Network error while grading.`);
      return;
    }
    let graded;
    try {
      graded = await gradedResp.json();
    } catch {
      const text = await gradedResp.text().catch(()=>'(no body)');
      showResult(`Non-JSON response during grading. First 200 chars: ${escapeHtml(text.slice(0,200))}`);
      return;
    }
    if (!graded.ok) {
      showResult(escapeHtml(graded.error || 'Server grading error.'));
      return;
    }

    showResult(`Score: <strong>${graded.score}%</strong> (${graded.total} questions)<br>
      Status: ${graded.passed ? '✅ PASS' : '❌ RETRY'}<br>
      Attempt code: <code>${graded.attemptCode}</code>
      ${lesson === 'FINAL' && graded.passed
        ? `<hr><p>If you believe you meet eligibility, click to request instructor endorsement review.</p>
           <button class="btn" id="endorseBtn">Request Endorsement Check</button>`
        : ''}`);

    // Optional endorsement flow for FINAL
    const endorseBtn = document.getElementById('endorseBtn');
    if (endorseBtn) {
      endorseBtn.onclick = async () => {
        const resResp = await fetch(`${endpoint}?action=finalize`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ secret, studentName: name, studentEmail: email })
        }).catch(()=>null);
        if (!resResp) { alert('Network error during finalize.'); return; }
        let res;
        try { res = await resResp.json(); }
        catch {
          const text = await resResp.text().catch(()=>'(no body)');
          alert('Finalize returned non-JSON: ' + text.slice(0,200));
          return;
        }
        alert(res.ok && res.eligible
          ? 'Eligibility confirmed. An endorsement draft was emailed to the instructor.'
          : (res.reason || 'Not eligible yet.'));
      };
    }
  };

  function showResult(html) {
    const box = document.getElementById('q_result');
    box.style.display = 'block';
    box.innerHTML = `<h3>Result</h3><p>${html}</p>`;
  }
}

// ===== Utils =====
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
