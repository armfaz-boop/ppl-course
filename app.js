let currentUser = null;
let currentQuiz = null;

// --- Helpers ---
function showPage(id) {
  document.querySelectorAll("section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

async function api(action, data={}) {
  data.action = action;
  data.secret = window.APP_CONFIG.SHARED_SECRET;
  const res = await fetch(window.APP_CONFIG.SCRIPT_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  });
  return res.json();
}

// --- Auth ---
async function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const status = document.getElementById("loginStatus");

  try {
    const resp = await api("login", { username, password });
    if (resp.success) {
      currentUser = resp.user;
      status.textContent = `Welcome, ${currentUser.name}`;
      showPage("assignmentsPage");
      loadAssignments();
    } else {
      status.textContent = resp.error || "Login failed.";
    }
  } catch (err) {
    status.textContent = "Error contacting server.";
  }
}

function logout() {
  currentUser = null;
  currentQuiz = null;
  document.getElementById("loginUsername").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginStatus").textContent = "";
  showPage("loginPage");
}

// --- Assignments ---
async function loadAssignments() {
  if (!currentUser) return;
  const list = document.getElementById("assignmentsList");
  list.innerHTML = "Loading...";

  try {
    const resp = await api("getAssignments", { user: currentUser.email });
    if (resp.error) {
      list.textContent = resp.error;
      return;
    }
    list.innerHTML = "";
    resp.assignments.forEach(assn => {
      const div = document.createElement("div");
      div.className = "assignment";
      div.innerHTML = `
        <b>${assn.lesson}</b> (Due: ${assn.due || "N/A"}) 
        <button onclick="startQuiz('${assn.lesson}')">Start</button>
      `;
      list.appendChild(div);
    });
  } catch {
    list.textContent = "Error loading assignments.";
  }
}

// --- Quiz ---
async function startQuiz(lesson) {
  try {
    const resp = await api("quiz", { lesson });
    if (resp.error) {
      alert(resp.error);
      return;
    }
    currentQuiz = { lesson, questions: resp.questions };
    document.getElementById("quizTitle").textContent = lesson;
    const form = document.getElementById("quizForm");
    form.innerHTML = "";
    resp.questions.forEach((q, i) => {
      const div = document.createElement("div");
      div.innerHTML = `
        <p>${i+1}. ${q.q}</p>
        ${q.options.map((opt, j) =>
          `<label><input type="radio" name="q${i}" value="${opt}"> ${opt}</label><br>`
        ).join("")}
      `;
      form.appendChild(div);
    });
    showPage("quizPage");
  } catch {
    alert("Error starting quiz.");
  }
}

async function submitQuiz() {
  if (!currentQuiz || !currentUser) return;
  const form = document.getElementById("quizForm");
  const answers = [];
  currentQuiz.questions.forEach((q, i) => {
    const selected = form.querySelector(`input[name="q${i}"]:checked`);
    answers.push(selected ? selected.value : "");
  });

  try {
    const resp = await api("submit", {
      user: currentUser.email,
      lesson: currentQuiz.lesson,
      answers
    });
    document.getElementById("quizStatus").textContent =
      `Score: ${resp.score}/${resp.total}`;
    showPage("assignmentsPage");
    loadAssignments();
  } catch {
    document.getElementById("quizStatus").textContent = "Error submitting quiz.";
  }
}
