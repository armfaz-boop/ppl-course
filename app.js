// app.js
const endpoint = "https://script.google.com/macros/s/AKfycbzO6zqZbwHTDG4FtnpWLYzhUQF7Lg_kvPMgs3q6a3o_NJaZ5GglDLlJhW7uf9IOVEveRw/exec";
const secret   = "ppl_9x7d3-MySecret-2025";

async function fetchQuiz(lesson, topicsSpec, passPercent) {
  try {
    // ask for password (from teacher’s Config!E2)
    const pwd = prompt("Enter class password:");
    if (pwd === null) {
      alert("Quiz cancelled.");
      return null;
    }

    const url = new URL(endpoint);
    url.searchParams.set("action", "quiz");
    url.searchParams.set("secret", secret);
    url.searchParams.set("lesson", lesson);
    url.searchParams.set("topics", topicsSpec);
    url.searchParams.set("pass", passPercent || 80);
    url.searchParams.set("code", pwd); // NEW: pass class password

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error) {
      if (data.error === "locked") {
        alert("Wrong class password. Try again.");
        return null;
      }
      throw new Error(data.error);
    }

    return data.questions;
  } catch (err) {
    alert("Error fetching quiz: " + err.message);
    return null;
  }
}

async function submitQuiz(lesson, studentName, studentEmail, answers, score, total, passPercent) {
  try {
    const payload = {
      lesson,
      student: studentName,
      email: studentEmail,
      answers,
      score,
      total,
      passPercent
    };

    const url = new URL(endpoint);
    url.searchParams.set("action", "submit");
    url.searchParams.set("secret", secret);

    const res = await fetch(url.toString(), {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    return data;
  } catch (err) {
    alert("Network error while submitting results: " + err.message);
    return null;
  }
}

// Example render function (simplified)
function renderQuiz(questions) {
  const container = document.getElementById("quiz");
  container.innerHTML = "";
  questions.forEach((q, i) => {
    const div = document.createElement("div");
    div.className = "question";
    div.innerHTML = `
      <p><b>Q${i+1}.</b> ${q.text}</p>
      ${q.figure ? `<img src="${q.figure.url}" width="${q.figure.width}">` : ""}
      ${q.choices.map((c, idx) =>
        `<label><input type="radio" name="q${i}" value="${String.fromCharCode(65+idx)}"> ${c}</label><br>`
      ).join("")}
    `;
    container.appendChild(div);
  });
}
