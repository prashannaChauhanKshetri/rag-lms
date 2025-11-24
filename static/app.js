// static/app.js
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("file");
    const subject = document.getElementById("subject").value || "general";
    if (!fileInput.files.length) {
      alert("Select a PDF");
      return;
    }
    const f = fileInput.files[0];
    const fd = new FormData();
    fd.append("subject", subject);
    fd.append("file", f);
  
    const resDiv = document.getElementById("uploadResult");
    resDiv.textContent = "Uploading...";
    try {
      const resp = await fetch("/ingest", { method: "POST", body: fd });
      const data = await resp.json();
      resDiv.textContent = JSON.stringify(data);
    } catch (err) {
      resDiv.textContent = "Error: " + err;
    }
  });
  
  document.getElementById("ask").addEventListener("click", async () => {
    const subject = document.getElementById("qsubject").value || "general";
    const q = document.getElementById("question").value;
    if (!q) { alert("Type a question"); return; }
    const ansDiv = document.getElementById("answer");
    ansDiv.textContent = "Querying...";
    try {
      const params = new URLSearchParams();
      params.append("subject", subject);
      params.append("question", q);
      params.append("top_k", "4");
      const resp = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      const js = await resp.json();
      ansDiv.innerHTML = "<strong>Answer</strong><pre>" + js.answer + "</pre>";
      if (js.sources) {
        let s = "<div class='sources'><strong>Sources:</strong><ul>";
        js.sources.forEach(x => s += `<li>${x.source} (score: ${x.score.toFixed(3)})</li>`);
        s += "</ul></div>";
        ansDiv.innerHTML += s;
      }
    } catch (err) {
      ansDiv.textContent = "Error: " + err;
    }
  });
  