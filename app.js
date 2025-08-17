/* app.js — Course front-end logic */

/****************************************************
 * CONFIG
 ****************************************************/
const CONFIG = window.APP_CONFIG;
if (!CONFIG || !CONFIG.SCRIPT_ENDPOINT) {
  alert("Missing APP_CONFIG in index.html!");
}

/****************************************************
 * HELPERS
 ****************************************************/
async function fetchQuiz(topics) {
  const url = new URL(CONFIG.SCRIPT_ENDPOINT);
  url.searchParams.set("action", "quiz");
  url.searchParams.set("secret", CONFIG.SHARED_SECRET);
  url.searchParams.set("topics", topics);

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error("Network error");
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.questions;
}

async function submitQuiz(payload) {
  const url = new URL(CONFIG.SCRIPT_ENDPOINT);
  url.searchParams.set("action", "submit");
  url.searchParams.set("secret", CONFIG.SHARED_SECRET);

  const resp = await fetch(url.toString(), {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {"Content-Type":"application/json"}
  });
  if (!resp.ok) throw new Error("Network error");
  return await resp.json();
}

/****************************************************
 * UI RENDERING
 ****************************************************/
function renderQuiz(questions, lessonName, studentName) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const form = document.createElement("form");
  form.className = "quiz-form";

  questions.forEach((q, idx) => {
    const block = document.createElement("div");
    block.className = "question-block";

    const qText = document.createElement("p");
    qText.textContent = `${idx+1}. ${q.text}`;
    block.appendChild(qText);

    // figure (if present)
    if (q.figure && q.figure.url) {
      const img = document.createElement("img");
      img.src = q.figure.url;   // main URL
      img.alt = "Figure " + q.figure.number;
      img.style.maxWidth = (q.figure.width || 400) + "px";
      img.style.display = "block";
      img.style.margin = "8px 0";
      block.appendChild(img);
    }

    q.choices.forEach((choice, ci) => {
      const label = document.createElement("label");
      label.style.display = "block";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.value = ["A","B","C","D"][ci];
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + choice));
      block.appendChild(label);
    });

    form.appendChild(block);
  });

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.textContent = "Submit Quiz";
  form.appendChild(submitBtn);

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const answers = {};
    let score = 0;
    questions.forEach(q => {
      const selected = form.querySelector(`input[name="${q.id}"]:checked`);
      const ans = selected ? selected.value : "";
      answers[q.id] = ans;
      if (ans === q.correct) score++;
    });

    const result = {
      student: studentName,
      lesson: lessonName,
      score,
      total: questions.length,
      answers
    };

    try {
      await submitQuiz(result);
      app.innerHTML = `<h2>Score: ${score}/${questions.length}</h2>`;
    } catch(err) {
      app.innerHTML = `<p>Error submitting: ${err.message}</p>`;
    }
  };

  app.appendChild(form);
}

/****************************************************
 * DEMO TRIGGER
 ****************************************************/
// Example: specific quiz mix
async function startDemoQuiz() {
  try {
    const qs = await fetchQuiz(
      "G1.PGENINST-K:4," +
      "G5.PWTBAL-K:4," +
      "G6.PACPERFP-K:3," +
      "K2.PLTQALREG-K:6," +
      "K1.PFPREP-K:3"
    );
    renderQuiz(qs, "Lesson Demo", "Student Demo");
  } catch(err) {
    document.getElementById("app").innerHTML =
      `<p>Quiz error<br>${err.message}</p>`;
  }
}

// Auto-run demo when landing on #server-quiz
window.addEventListener("hashchange", () => {
  if (location.hash === "#server-quiz") {
    startDemoQuiz();
  }
});
if (location.hash === "#server-quiz") startDemoQuiz();
