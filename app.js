/***********************
 * Simple SPA & helpers
 ***********************/
const app = document.getElementById('app');

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]
  ));
}
function idxToLetter(i){ return ['A','B','C','D'][Number(i)] || ''; }

function getAuth(){
  const token = localStorage.getItem('authToken') || '';
  const user  = JSON.parse(localStorage.getItem('authUser') || 'null');
  return { token, user };
}
function setAuth(token, user){
  if (token) localStorage.setItem('authToken', token); else localStorage.removeItem('authToken');
  if (user)  localStorage.setItem('authUser', JSON.stringify(user)); else localStorage.removeItem('authUser');
}
function isLoggedIn(){ return !!(getAuth().token); }
function hasRole(role){
  const u = getAuth().user;
  const roles = (u && u.roles) || [];
  return roles.includes(role);
}
function requireLogin(routeAfter=''){
  if (!isLoggedIn()) {
    location.hash = '#login';
    return false;
  }
  return true;
}
function navRender(){
  const { user } = getAuth();
  const right = user
    ? `<span>${escapeHtml(user.name || user.email || '')}</span> <button class="btn" id="btn_logout">Logout</button>`
    : `<a href="#login">Login</a>`;
  document.getElementById('nav-right').innerHTML = right;
  const lo = document.getElementById('btn_logout');
  if (lo) lo.onclick = () => { setAuth('', null); location.hash = '#login'; };
}

/***********************
 * API helpers
 ***********************/
function endpointURL(action){
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set('action', action);
  return url;
}
async function apiLogin(user, pass){
  const url = endpointURL('login');
  url.searchParams.set('user', user);
  url.searchParams.set('pass', pass);
  const resp = await fetch(url.toString());
  const out = await resp.json();
  if (out.error) throw new Error(out.error);
  return out; // { token, user }
}
async function apiAssignments(){
  const { token } = getAuth();
  const url = endpointURL('assignments');
  url.searchParams.set('token', token);
  const resp = await fetch(url.toString());
  const out = await resp.json();
  if (out.error) throw new Error(out.error);
  return out.assignments || [];
}
async function apiProgress(){
  const { token } = getAuth();
  const url = endpointURL('progress');
  url.searchParams.set('token', token);
  const resp = await fetch(url.toString());
  const out = await resp.json();
  if (out.error) throw new Error(out.error);
  return out;
}
async function fetchStudents(){
  const { token } = getAuth();
  const url = endpointURL('students');
  url.searchParams.set('token', token);
  const resp = await fetch(url.toString());
  const out = await resp.json();
  if (out.error) throw new Error(out.error);
  return out.students || [];
}
async function fetchLessonMeta(lesson){
  const { token } = getAuth();
  const url = endpointURL('lesson_meta');
  url.searchParams.set('token', token);
  url.searchParams.set('lesson', lesson);
  const resp = await fetch(url.toString());
  const out = await resp.json();
  if (out.error) throw new Error(out.error);
  return out; // { lesson, items }
}

/***********************
 * Quiz helpers (server-backed)
 ***********************/
async function fetchQuizFromServer(topicsSpec) {
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const secret   = (window.APP_CONFIG || {}).SHARED_SECRET;
  const url = new URL(endpoint);
  url.searchParams.set('action', 'quiz');
  url.searchParams.set('secret', secret);
  url.searchParams.set('topics', topicsSpec);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Quiz HTTP ${resp.status}`);
  const data = await resp.json().catch(async ()=>({ error: await resp.text() }));
  if (data.error) throw new Error(data.error);
  return data.questions || [];
}
async function submitQuizResults({ lesson, score, total, answers, passPercent }) {
  const { user } = getAuth();
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const secret   = (window.APP_CONFIG || {}).SHARED_SECRET;
  const url = new URL(endpoint);
  url.searchParams.set('action', 'submit');  // matches doPost
  url.searchParams.set('secret', secret);
  const resp = await fetch(url.toString(), {
    method: 'POST',
    body: JSON.stringify({
      student: user?.name || user?.email || '',
      email:   user?.email || '',
      lesson, score, total, answers, passPercent
    })
  });
  const out = await resp.json().catch(async ()=>({ error: await resp.text() }));
  if (out.error) throw new Error(out.error);
  return out;
}

/***********************
 * Lesson submit
 ***********************/
async function submitLessonGrade(payload){
  const { token } = getAuth();
  const endpoint = (window.APP_CONFIG || {}).SCRIPT_ENDPOINT;
  const secret   = (window.APP_CONFIG || {}).SHARED_SECRET;
  const url = new URL(endpoint);
  url.searchParams.set('action', 'lesson_submit');
  url.searchParams.set('token', token);
  url.searchParams.set('secret', secret);
  const resp = await fetch(url.toString(), {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const out = await resp.json().catch(async ()=>({ error: await resp.text() }));
  if (out.error) throw new Error(out.error);
  return out;
}

/***********************
 * ROUTER
 ***********************/
function render(route){
  const hash = (route || '').replace(/^#/, '');
  const [base, qs] = hash.split('?');
  const params = new URLSearchParams(qs || '');
  switch ((base || 'home').toLowerCase()){
    case 'login':        return renderLogin();
    case 'assignments':  return renderAssignments();
    case 'progress':     return renderProgress();
    case 'server-quiz':  return renderServerQuizFromURL(params);
    case 'grade':        return renderGradeFormFromURL(params);
    default:             return renderHome();
  }
}
window.addEventListener('hashchange', () => { navRender(); render(location.hash); });
window.addEventListener('load',       () => { navRender(); render(location.hash); });

/***********************
 * VIEWS
 ***********************/
function renderHome(){
  app.innerHTML = `
    <div class="card">
      <h2>Welcome</h2>
      <p>Use <strong>Assignments</strong> to access quizzes or lesson grade forms (instructors).</p>
      <p>Use <strong>Progress</strong> to view your status and time totals (students) or search a student (instructors).</p>
    </div>
  `;
}

function renderLogin(){
  app.innerHTML = `
    <div class="card" style="max-width:420px">
      <h2>Login</h2>
      <label>Email<br><input id="lg_user" type="email" placeholder="you@example.com"/></label><br><br>
      <label>Password<br><input id="lg_pass" type="password" placeholder="••••••••"/></label><br><br>
      <button class="btn" id="lg_go">Login</button>
      <div id="lg_msg" style="margin-top:.75rem;color:#a33"></div>
    </div>
  `;
  document.getElementById('lg_go').onclick = async () => {
    const u = document.getElementById('lg_user').value.trim();
    const p = document.getElementById('lg_pass').value;
    const msg = document.getElementById('lg_msg');
    msg.textContent = '';
    try {
      const out = await apiLogin(u, p);
      setAuth(out.token, out.user);
      navRender();
      location.hash = '#assignments';
    } catch (err){
      msg.textContent = 'Error: ' + (err.message || String(err));
    }
  };
}

async function renderAssignments(){
  if (!requireLogin('#assignments')) return;
  app.innerHTML = `<div class="card"><h2>Assignments</h2><p>Loading…</p></div>`;
  try {
    const assignments = await apiAssignments();
    if (!assignments.length){
      app.innerHTML = `<div class="card"><h2>Assignments</h2><p>No active assignments.</p></div>`;
      return;
    }
    const { user } = getAuth();
    const isInstructor = (user?.roles || []).includes('instructor');

    app.innerHTML = `
      <div class="card"><h2>Assignments</h2></div>
      <div class="cards">
        ${assignments.map(a=>{
          if (a.kind === 'quiz'){
            const qs = `#server-quiz?lesson=${encodeURIComponent(a.Lesson)}&pass=${encodeURIComponent(a.PassPercent||70)}&topics=${encodeURIComponent(a.Topics||'')}`;
            return `
              <div class="card">
                <h3>${escapeHtml(a.Title || a.Lesson)} <small>(${escapeHtml(a.Lesson)})</small></h3>
                <p><em>Quiz</em>${a.DurationMin?`, ~${a.DurationMin} min`:''}</p>
                <button class="btn" onclick="location.hash='${qs}'">Take quiz</button>
              </div>
            `;
          }
          if (a.kind === 'lesson' && isInstructor){
            const go = `#grade?lesson=${encodeURIComponent(a.Lesson)}`;
            const slides = a.TemplateID ? `<a class="btn" href="${escapeHtml(a.TemplateID)}" target="_blank" rel="noopener">Open slides</a>` : '';
            return `
              <div class="card">
                <h3>${escapeHtml(a.Title || a.Lesson)} <small>(${escapeHtml(a.Lesson)})</small></h3>
                <p><em>Lesson</em> • Type: ${escapeHtml(a.Type||'')}</p>
                <div style="display:flex;gap:.5rem;flex-wrap:wrap">
                  <button class="btn" onclick="location.hash='${go}'">Open grade</button>
                  ${slides}
                </div>
              </div>
            `;
          }
          return '';
        }).join('')}
      </div>
    `;
  } catch (err){
    app.innerHTML = `<div class="card"><h2>Assignments</h2><p style="color:#a33">Error: ${escapeHtml(err.message||String(err))}</p></div>`;
  }
}

async function renderProgress(){
  if (!requireLogin('#progress')) return;
  const { user } = getAuth();
  app.innerHTML = `<div class="card"><h2>Progress</h2><p>Loading…</p></div>`;
  try {
    const data = await apiProgress();
    // Simple totals from lesson rows:
    const times = { ground:0, dualDay:0, dualNight:0, soloDay:0, soloNight:0, instrument:0, simInstrument:0, xcDay:0, xcNight:0, nightTotal:0, landings:0 };
    (data.lessons || []).forEach(r=>{
      const num = v => Number(v||0) || 0;
      times.ground       += num(r.Ground);
      times.dualDay      += num(r.DualDay);
      times.dualNight    += num(r.DualNight);
      times.soloDay      += num(r.SoloDay);
      times.soloNight    += num(r.SoloNight);
      times.instrument   += num(r.Instrument);
      times.simInstrument+= num(r.SimInstrument);
      times.xcDay        += num(r.XCDay);
      times.xcNight      += num(r.XCNight);
      times.nightTotal   += num(r.NightTotal);
      times.landings     += num(r.Landings);
    });

    const quizList = (data.quizzes||[]).map(q => `<li>${escapeHtml(q.Lesson)} — ${q.Percentage||0}% (${q.Score}/${q.Total})</li>`).join('') || '<li>None</li>';
    const lessonList = (data.lessons||[]).map(r => `<li>${escapeHtml(r.Date||'')} — ${escapeHtml(r.Lesson)} (${escapeHtml(r.Overall||'')})</li>`).join('') || '<li>None</li>';

    app.innerHTML = `
      <div class="card">
        <h2>Progress — ${escapeHtml(user?.name || user?.email || '')}</h2>
        <div class="card">
          <h3>Time Totals</h3>
          <ul>
            <li>Ground: ${times.ground.toFixed(1)} h</li>
            <li>Dual Day: ${times.dualDay.toFixed(1)} h • Dual Night: ${times.dualNight.toFixed(1)} h</li>
            <li>Solo Day: ${times.soloDay.toFixed(1)} h • Solo Night: ${times.soloNight.toFixed(1)} h</li>
            <li>Instrument: ${times.instrument.toFixed(1)} h • Sim Instr: ${times.simInstrument.toFixed(1)} h</li>
            <li>XC Day: ${times.xcDay.toFixed(1)} h • XC Night: ${times.xcNight.toFixed(1)} h</li>
            <li>Night Total: ${times.nightTotal.toFixed(1)} h</li>
            <li>Landings: ${times.landings}</li>
          </ul>
        </div>
        <div class="card">
          <h3>Quizzes</h3>
          <ul>${quizList}</ul>
        </div>
        <div class="card">
          <h3>Lessons</h3>
          <ul>${lessonList}</ul>
        </div>
      </div>
    `;
  } catch (err){
    app.innerHTML = `<div class="card"><h2>Progress</h2><p style="color:#a33">Error: ${escapeHtml(err.message||String(err))}</p></div>`;
  }
}

async function renderServerQuizFromURL(params){
  if (!requireLogin('#assignments')) return;
  const lesson      = params.get('lesson') || '';
  const passPercent = Number(params.get('pass') || 70);
  const topicsSpec  = params.get('topics') || '';
  app.innerHTML = `<div class="card"><h2>${escapeHtml(lesson)}</h2><p>Loading quiz…</p></div>`;

  let questions;
  try {
    questions = await fetchQuizFromServer(topicsSpec);
  } catch (err) {
    app.innerHTML = `<div class="card"><h3>Quiz error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`;
    return;
  }

  const norm = questions.map(q => ({
    id: q.id,
    text: q.q || q.text || '',
    choices: q.choices || [],
    correct: (q.correct || '').toString().toUpperCase(),
    explanation: q.explanation || '',
    figure: q.figure || null
  }));

  app.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(lesson)}</h2>
      <p><strong>Passing:</strong> ${passPercent}%</p>
      <div id="q_list"></div>
      <div style="margin-top:1rem"><button class="btn" id="q_submit">Submit</button></div>
      <div id="q_result" class="card" style="display:none"></div>
    </div>
  `;

  const qList = document.getElementById('q_list');
  const selections = new Array(norm.length).fill(null);
  norm.forEach((q, idx) => {
    const node = renderQuizQuestion(q, idx);
    node.querySelectorAll('input[type=radio]').forEach(r => (r.onchange = () => selections[idx] = Number(r.value)));
    qList.appendChild(node);
  });

  document.getElementById('q_submit').onclick = async () => {
    // lock
    const btn = document.getElementById('q_submit'); btn.disabled = true; btn.style.display = 'none';
    document.querySelectorAll('#q_list input[type=radio]').forEach(el => el.disabled = true);

    // grade
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
        lesson,
        score: correctCount,
        total: norm.length,
        answers: answersObj,
        passPercent
      });
      const box = document.getElementById('q_result');
      box.style.display = 'block';
      box.innerHTML = `Score: <strong>${scorePct}%</strong> (${correctCount} / ${norm.length})<br>Status: ${passed ? '✅ PASS' : '❌ FAIL'}`;
    } catch (err) {
      const box = document.getElementById('q_result');
      box.style.display = 'block';
      box.innerHTML = `Submit error: ${escapeHtml(err.message || String(err))}`;
    }
  };
}

function renderQuizQuestion(q, idx){
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
    label.innerHTML = `<input type="radio" name="q${idx}" value="${i}" /> ${escapeHtml(String(choice))}`;
    choicesWrap.appendChild(label);
  });
  container.appendChild(choicesWrap);
  return container;
}

/***********************
 * Grade form (standardized)
 ***********************/
async function renderGradeFormFromURL(params){
  if (!requireLogin('#assignments')) return;
  const lesson = params.get('lesson') || '';
  app.innerHTML = `<div class="card"><h2>Grade ${escapeHtml(lesson)}</h2><p>Loading…</p></div>`;
  try {
    const [students, meta] = await Promise.all([fetchStudents(), fetchLessonMeta(lesson)]);
    const items = (meta.items || []).map(x => ({ code: x.ItemCode, label: x.Description }));
    const isFlight = (String(meta.lesson.Type||'').toUpperCase()==='FL' || String(meta.lesson.Type||'').toUpperCase()==='FLE');

    app.innerHTML = `
      <div class="card">
        <h2>${escapeHtml(meta.lesson.Title || lesson)} <small>(${escapeHtml(lesson)})</small></h2>

        <div class="card">
          <label>Student (type email)<br>
            <input id="g_student" type="text" list="studentList" placeholder="student email"/>
            <datalist id="studentList">
              ${(students||[]).map(s => `<option value="${escapeHtml(s.email)}">${escapeHtml(s.name)} (${escapeHtml(s.classId||'')})</option>`).join('')}
            </datalist>
          </label>
          <label style="display:block;margin-top:.5rem">Date<br><input id="g_date" type="date"/></label>
          <label style="display:block;margin-top:.5rem">Aircraft Type ${isFlight?'<span style="color:#a33">*</span>':''}<br><input id="g_acft" type="text"/></label>
          <label style="display:block;margin-top:.5rem">Tail # ${isFlight?'<span style="color:#a33">*</span>':''}<br><input id="g_tail" type="text"/></label>
          <label style="display:block;margin-top:.5rem">Landings<br><input id="g_landings" type="number" min="0" value="0"/></label>
        </div>

        <div class="card">
          <h3>Time</h3>
          <div class="grid2">
            <label>Ground <input id="t_ground" type="number" step="0.1" min="0" value="0"/></label>
            <label>Dual Day <input id="t_dualDay" type="number" step="0.1" min="0" value="0"/></label>
            <label>Dual Night <input id="t_dualNight" type="number" step="0.1" min="0" value="0"/></label>
            <label>Solo Day <input id="t_soloDay" type="number" step="0.1" min="0" value="0"/></label>
            <label>Solo Night <input id="t_soloNight" type="number" step="0.1" min="0" value="0"/></label>
            <label>Instrument <input id="t_instrument" type="number" step="0.1" min="0" value="0"/></label>
            <label>Sim Instrument <input id="t_simInstrument" type="number" step="0.1" min="0" value="0"/></label>
            <label>XC Day <input id="t_xcDay" type="number" step="0.1" min="0" value="0"/></label>
            <label>XC Night <input id="t_xcNight" type="number" step="0.1" min="0" value="0"/></label>
            <label>Night Total <input id="t_nightTotal" type="number" step="0.1" min="0" value="0"/></label>
          </div>
        </div>

        <div class="card">
          <h3>Line Items</h3>
          ${items.map((it,i)=>`
            <div class="question">
              <div><strong>${i+1}.</strong> ${escapeHtml(it.label)} <small style="color:#777">[${escapeHtml(it.code)}]</small></div>
              <div style="display:flex;gap:1rem;align-items:center;margin:.25rem 0 .5rem">
                <label><input type="radio" name="li${i}" value="S"> S</label>
                <label><input type="radio" name="li${i}" value="I"> I</label>
                <label><input type="radio" name="li${i}" value="U"> U</label>
                <input type="text" id="c${i}" placeholder="comment (required if U)" style="flex:1"/>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <label>Lesson Comment (optional)<br><textarea id="g_comment" rows="3"></textarea></label>
        </div>

        <div class="card">
          <label>Overall Grade
            <select id="g_overall">
              <option value="S">S (Satisfactory)</option>
              <option value="I">I (Incomplete — saves as draft)</option>
              <option value="U">U (Unsatisfactory)</option>
            </select>
          </label>
          <div style="margin-top:.5rem;color:#a55">
            • Exams require all S.<br>
            • S with up to 2 U will mark those items for carry-forward.<br>
            • U requires a line-item comment.
          </div>
          <div style="margin-top:1rem">
            <button class="btn" id="btn_submit">Submit</button>
          </div>
          <div id="g_result" class="card" style="display:none"></div>
        </div>
      </div>
    `;

    // default date=today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    document.getElementById('g_date').value = `${yyyy}-${mm}-${dd}`;

    document.getElementById('btn_submit').onclick = async () => {
      try {
        const studentEmail = (document.getElementById('g_student').value || '').trim();
        const st = students.find(s => s.email.toLowerCase() === studentEmail.toLowerCase());
        if (!studentEmail || !st) throw new Error('Select a valid student email (use suggestions).');

        const overall = document.getElementById('g_overall').value;
        const payload = {
          studentEmail,
          studentName: st.name || '',
          lesson,
          overall,
          dateISO: (document.getElementById('g_date').value || '').trim(),
          aircraftType: (document.getElementById('g_acft').value || '').trim(),
          tail: (document.getElementById('g_tail').value || '').trim(),
          landings: Number(document.getElementById('g_landings').value || 0),
          lessonComment: (document.getElementById('g_comment').value || '').trim(),
          times: {
            ground:       Number(document.getElementById('t_ground').value || 0),
            dualDay:      Number(document.getElementById('t_dualDay').value || 0),
            dualNight:    Number(document.getElementById('t_dualNight').value || 0),
            soloDay:      Number(document.getElementById('t_soloDay').value || 0),
            soloNight:    Number(document.getElementById('t_soloNight').value || 0),
            instrument:   Number(document.getElementById('t_instrument').value || 0),
            simInstrument:Number(document.getElementById('t_simInstrument').value || 0),
            xcDay:        Number(document.getElementById('t_xcDay').value || 0),
            xcNight:      Number(document.getElementById('t_xcNight').value || 0),
            nightTotal:   Number(document.getElementById('t_nightTotal').value || 0),
          },
          items: items.map((it,i) => ({
            code: it.code,
            grade: (document.querySelector(`input[name="li${i}"]:checked`) || {}).value || '',
            comment: (document.getElementById(`c${i}`).value || '').trim()
          }))
        };

        // client check for U comments
        for (const it of payload.items) {
          if (it.grade === 'U' && !it.comment) throw new Error(`Line item ${it.code}: U requires a comment`);
        }

        const out = await submitLessonGrade(payload);
        const box = document.getElementById('g_result');
        box.style.display = 'block';
        box.innerHTML = `<strong>Saved.</strong> Draft: ${out.draft ? 'Yes' : 'No'}${out.carryForward?.length ? `<br/>Carry-forward: ${out.carryForward.join(', ')}` : ''}`;
      } catch (err) {
        const box = document.getElementById('g_result');
        box.style.display = 'block';
        box.innerHTML = `<span style="color:#a33">Error: ${escapeHtml(err.message || String(err))}</span>`;
      }
    };

  } catch (err){
    app.innerHTML = `<div class="card"><h3>Error</h3><p>${escapeHtml(err.message||String(err))}</p></div>`;
  }
}
