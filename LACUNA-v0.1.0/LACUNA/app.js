"use strict";

const API = "https://api.github.com";
const DEFAULT_REPOSITORY = "https://github.com/zerrfeit/Project-MOURNINGSTAR";
const CURRENT_YEAR = new Date().getFullYear();

const state = {
  repository: DEFAULT_REPOSITORY,
  analysis: null,
  view: "survey",
  loading: false,
  loadingText: "Awaiting repository",
  error: "",
  playbackIndex: 0,
  playbackTimer: null,
  playing: false,
  comparing: false,
  comparison: null,
  baseSha: "",
  headSha: "",
};

const app = document.querySelector("#app");
const homeButton = document.querySelector("#home-button");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstLine(message = "") {
  return message.split("\n")[0];
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function parseRepository(input) {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const githubMatch = trimmed.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  const match = githubMatch || shortMatch;
  if (!match) throw new Error("Enter a GitHub URL or an owner/repository name.");
  return { owner: match[1], repo: match[2] };
}

async function githubFetch(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository not found or not publicly accessible.");
    if (response.status === 409) throw new Error("This repository does not contain a surviving commit history yet.");
    if (response.status === 403) throw new Error("GitHub's public request limit was reached. Try again a little later.");
    throw new Error(`GitHub returned ${response.status}. The excavation could not continue.`);
  }
  return response.json();
}

function setLoadingText(text) {
  state.loadingText = text;
  const target = document.querySelector("#loading-text");
  if (target) target.textContent = text;
}

function buildEvents(commits, details) {
  const events = [];
  const chronological = [...commits].reverse();
  const earliest = chronological[0];

  if (earliest?.commit?.author) {
    events.push({
      type: "EARLIEST OBSERVED",
      title: "The surviving record begins",
      description: firstLine(earliest.commit.message),
      date: earliest.commit.author.date,
      sha: earliest.sha,
      tone: "bone",
    });
  }

  const expansion = [...details].sort((a, b) => b.stats.additions - a.stats.additions)[0];
  if (expansion?.commit?.author && expansion.stats.additions > 0) {
    events.push({
      type: "EXPANSION",
      title: `+${compactNumber(expansion.stats.additions)} lines entered the archive`,
      description: firstLine(expansion.commit.message),
      date: expansion.commit.author.date,
      sha: expansion.sha,
      tone: "blue",
    });
  }

  const extinction = [...details].sort((a, b) => b.stats.deletions - a.stats.deletions)[0];
  if (extinction?.commit?.author && extinction.stats.deletions > 0) {
    events.push({
      type: "EXTINCTION",
      title: `−${compactNumber(extinction.stats.deletions)} lines disappeared`,
      description: firstLine(extinction.commit.message),
      date: extinction.commit.author.date,
      sha: extinction.sha,
      tone: "red",
    });
  }

  let largestGap = { days: 0, after: null };
  for (let index = 1; index < chronological.length; index += 1) {
    const beforeDate = chronological[index - 1].commit.author?.date;
    const afterDate = chronological[index].commit.author?.date;
    if (!beforeDate || !afterDate) continue;
    const days = Math.round((new Date(afterDate) - new Date(beforeDate)) / 86_400_000);
    if (days > largestGap.days) largestGap = { days, after: chronological[index] };
  }
  if (largestGap.days >= 14 && largestGap.after?.commit?.author) {
    events.push({
      type: "DORMANCY",
      title: `${largestGap.days} days of silence`,
      description: `Development resumed with “${firstLine(largestGap.after.commit.message)}”.`,
      date: largestGap.after.commit.author.date,
      sha: largestGap.after.sha,
      tone: "amber",
    });
  }

  const removed = new Map();
  for (const detail of [...details].reverse()) {
    for (const file of detail.files || []) {
      if (file.status === "removed") removed.set(file.filename, detail);
      if (file.status === "added" && removed.has(file.filename) && detail.commit.author) {
        events.push({
          type: "RESURRECTION",
          title: `${file.filename.split("/").pop()} returned`,
          description: "A previously removed file re-entered the surviving record.",
          date: detail.commit.author.date,
          sha: detail.sha,
          tone: "amber",
        });
        removed.delete(file.filename);
      }
    }
  }

  return events
    .filter((event, index, all) => all.findIndex((candidate) => candidate.sha === event.sha && candidate.type === event.type) === index)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-8);
}

function renderLanding() {
  stopPlayback();
  app.innerHTML = `
    <section class="landing">
      <div class="landing-copy">
        <div class="eyebrow"><span>REPOSITORY ARCHAEOLOGY / 01</span><span class="signal">SYSTEM READY</span></div>
        <h1>Excavate what a repository <em>forgot.</em></h1>
        <p class="lede">LACUNA reconstructs the surviving history of a GitHub repository—revealing deleted files, structural ruptures, dormant eras, and the code that no longer exists.</p>
        <form class="excavate-form" id="excavate-form">
          <label for="repository">PUBLIC GITHUB REPOSITORY</label>
          <div class="input-row">
            <span class="input-prefix">⌕</span>
            <input id="repository" value="${escapeHtml(state.repository)}" placeholder="github.com/owner/repository" spellcheck="false" ${state.loading ? "disabled" : ""} />
            <button type="submit" ${state.loading ? "disabled" : ""}>${state.loading ? '<span class="spinner"></span>' : "BEGIN EXCAVATION"}</button>
          </div>
        </form>
        <div class="status-row">
          <span><b class="${state.loading ? "pulse" : ""}"></b> <span id="loading-text">${escapeHtml(state.loadingText)}</span></span>
          <span>READ-ONLY</span><span>NO CODE EXECUTED</span>
        </div>
        ${state.error ? `<div class="error-box"><span>EXCAVATION HALTED</span>${escapeHtml(state.error)}</div>` : ""}
      </div>

      <div class="landing-visual" aria-label="Repository stratigraphy illustration">
        <div class="visual-label top"><span>ARCHIVE DEPTH</span><span>000—100</span></div>
        <div class="core-sample">
          ${[
            ["01", "CURRENT TREE", "92%"], ["02", "REWRITE / 8C91D2A", "75%"],
            ["03", "DELETED ASSET", "VOID"], ["04", "INITIAL STRUCTURE", "41%"], ["05", "ORIGIN", "24%"],
          ].map((item, index) => `<div class="stratum s${index + 1}"><span>${item[0]}</span><b>${item[1]}</b><i>${item[2]}</i></div>`).join("")}
          <div class="probe-line"><span></span></div>
        </div>
        <div class="visual-label bottom"><span>SURVIVING RECORD</span><span>READ ONLY</span></div>
      </div>

      <div class="landing-foot">
        <div><b>01</b><span>Trace every surviving commit</span></div>
        <div><b>02</b><span>Recover deleted-file fossils</span></div>
        <div><b>03</b><span>Replay the project through time</span></div>
      </div>
    </section>`;

  document.querySelector("#excavate-form").addEventListener("submit", excavate);
  document.querySelector("#repository").addEventListener("input", (event) => { state.repository = event.target.value; });
}

async function excavate(event) {
  event.preventDefault();
  state.repository = document.querySelector("#repository").value;
  state.loading = true;
  state.loadingText = "Reading the surviving record";
  state.error = "";
  state.analysis = null;
  renderLanding();

  try {
    const parsed = parseRepository(state.repository);
    const owner = encodeURIComponent(parsed.owner);
    const repoName = encodeURIComponent(parsed.repo);
    const [repo, commits, languages, contributors, branches] = await Promise.all([
      githubFetch(`/repos/${owner}/${repoName}`),
      githubFetch(`/repos/${owner}/${repoName}/commits?per_page=100`),
      githubFetch(`/repos/${owner}/${repoName}/languages`),
      githubFetch(`/repos/${owner}/${repoName}/contributors?per_page=100&anon=1`),
      githubFetch(`/repos/${owner}/${repoName}/branches?per_page=100`),
    ]);

    setLoadingText("Excavating recent commit strata");
    const details = await Promise.all(
      commits.slice(0, 15).map((commit) => githubFetch(`/repos/${owner}/${repoName}/commits/${encodeURIComponent(commit.sha)}`)),
    );

    setLoadingText("Cataloguing recovered fossils");
    const fossils = details.flatMap((detail) => (detail.files || [])
      .filter((file) => file.status === "removed")
      .map((file) => ({
        ...file,
        sha: detail.sha,
        date: detail.commit.author?.date || repo.updated_at,
        message: firstLine(detail.commit.message),
      })));

    state.analysis = {
      owner: parsed.owner,
      repoName: parsed.repo,
      repo,
      commits,
      details,
      languages,
      contributors: contributors.filter((contributor) => contributor.login),
      branches,
      fossils,
      events: buildEvents(commits, details),
    };
    state.baseSha = commits.at(-1)?.sha || "";
    state.headSha = commits[0]?.sha || "";
    state.playbackIndex = 0;
    state.view = "survey";
    state.loadingText = "Excavation complete";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "The excavation failed unexpectedly.";
    state.loadingText = "Excavation interrupted";
  } finally {
    state.loading = false;
    state.analysis ? renderArchive() : renderLanding();
  }
}

function archiveHeader(analysis) {
  const repo = analysis.repo;
  return `
    <div class="repo-head">
      <div>
        <div class="eyebrow"><span>EXCAVATION / ${escapeHtml(repo.full_name.toUpperCase())}</span><span class="signal">ARCHIVE OPEN</span></div>
        <div class="repo-title-row"><h1>${escapeHtml(repo.name)}</h1><span class="access-pill">PUBLIC RECORD</span></div>
        <p>${escapeHtml(repo.description || "No surviving repository description.")}</p>
      </div>
      <div class="repo-actions">
        <button class="secondary-button" id="export-chronicle">↓ EXPORT CHRONICLE</button>
        <a class="primary-button" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">OPEN SOURCE ↗</a>
      </div>
    </div>
    <nav class="tabs" aria-label="Excavation views">
      ${[["survey", "SURVEY"], ["fossils", `FOSSILS ${analysis.fossils.length}`], ["playback", "PLAYBACK"], ["compare", "COMPARE"]]
        .map(([key, label]) => `<button data-view="${key}" class="${state.view === key ? "active" : ""}">${label}</button>`).join("")}
    </nav>
    ${state.error ? `<div class="error-box inline"><span>NOTICE</span>${escapeHtml(state.error)}</div>` : ""}`;
}

function renderArchive() {
  clearPlaybackTimer();
  const analysis = state.analysis;
  if (!analysis) return renderLanding();
  const renderers = { survey: surveyView, fossils: fossilsView, playback: playbackView, compare: compareView };
  app.innerHTML = `<section class="archive">${archiveHeader(analysis)}${renderers[state.view](analysis)}${archiveFooter()}</section>`;

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view !== "playback") state.playing = false;
    state.view = button.dataset.view;
    state.error = "";
    renderArchive();
  }));
  document.querySelector("#export-chronicle").addEventListener("click", downloadChronicle);
  attachViewEvents();
}

function archiveFooter() {
  return `<footer class="archive-footer"><span>LACUNA / READ-ONLY REPOSITORY ARCHAEOLOGY</span><span>A PRODUCT OF <b>MOURNINGSTAR</b></span></footer>`;
}

function surveyView(analysis) {
  const totalLanguageBytes = Object.values(analysis.languages).reduce((sum, value) => sum + value, 0);
  const eventRows = analysis.events.length ? analysis.events.map((event) => `
    <a class="event ${event.tone}" href="${escapeHtml(analysis.repo.html_url)}/commit/${encodeURIComponent(event.sha)}" target="_blank" rel="noreferrer">
      <div class="event-node"><i></i></div>
      <div class="event-date">${formatDate(event.date)}<small>${event.sha.slice(0, 7)}</small></div>
      <div class="event-copy"><span>${escapeHtml(event.type)}</span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.description)}</p></div><b>↗</b>
    </a>`).join("") : '<div class="empty-state">No major events detected in the inspected history.</div>';

  const languageRows = Object.entries(analysis.languages).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([language, bytes], index) => {
    const percentage = totalLanguageBytes ? (bytes / totalLanguageBytes) * 100 : 0;
    return `<div class="language"><div><span><i style="--index:${index}"></i>${escapeHtml(language)}</span><b>${percentage.toFixed(1)}%</b></div><div class="bar"><i style="width:${percentage}%;--index:${index}"></i></div></div>`;
  }).join("") || '<div class="empty-state small">No languages detected.</div>';

  const contributors = analysis.contributors.slice(0, 6).map((contributor) => `
    <a href="${escapeHtml(contributor.html_url)}" target="_blank" rel="noreferrer">
      <img src="${escapeHtml(contributor.avatar_url)}" alt="" loading="lazy" />
      <span>${escapeHtml(contributor.login)}<small>${contributor.contributions} commits</small></span><b>↗</b>
    </a>`).join("") || '<div class="empty-state small">No contributor record found.</div>';

  return `<div class="view survey-view">
    <section class="metrics">
      <div><span>COMMITS OBSERVED</span><strong>${analysis.commits.length}</strong><small>most recent record</small></div>
      <div><span>FOSSILS RECOVERED</span><strong>${analysis.fossils.length}</strong><small>from inspected strata</small></div>
      <div><span>CONTRIBUTORS</span><strong>${analysis.contributors.length}</strong><small>surviving authors</small></div>
      <div><span>BRANCHES</span><strong>${analysis.branches.length}</strong><small>${escapeHtml(analysis.repo.default_branch)} / default</small></div>
      <div><span>ARCHIVE AGE</span><strong>${Math.max(1, CURRENT_YEAR - new Date(analysis.repo.created_at).getFullYear())}Y</strong><small>since ${formatDate(analysis.repo.created_at)}</small></div>
    </section>
    <div class="dashboard-grid">
      <section class="panel event-panel"><div class="panel-head"><div><span>01 / HISTORICAL MARKERS</span><h2>Detected events</h2></div><b>${String(analysis.events.length).padStart(2, "0")}</b></div><div class="event-list">${eventRows}</div></section>
      <aside class="side-stack">
        <section class="panel"><div class="panel-head compact"><div><span>02 / COMPOSITION</span><h2>Languages</h2></div></div><div class="language-list">${languageRows}</div></section>
        <section class="panel"><div class="panel-head compact"><div><span>03 / CUSTODIANS</span><h2>Contributors</h2></div></div><div class="contributors">${contributors}</div></section>
      </aside>
    </div>
  </div>`;
}

function sectionIntro(kicker, title, description, count = "") {
  return `<div class="section-intro"><div><span>${kicker}</span><h2>${title}</h2><p>${description}</p></div>${count ? `<strong>${count}</strong>` : ""}</div>`;
}

function fossilsView(analysis) {
  const rows = analysis.fossils.map((fossil) => {
    const slash = fossil.filename.lastIndexOf("/");
    const name = slash >= 0 ? fossil.filename.slice(slash + 1) : fossil.filename;
    const path = slash >= 0 ? fossil.filename.slice(0, slash + 1) : "/";
    return `<a href="${escapeHtml(analysis.repo.html_url)}/commit/${encodeURIComponent(fossil.sha)}" target="_blank" rel="noreferrer" class="fossil-row">
      <span class="file-name"><i>×</i><b>${escapeHtml(name)}</b><small>${escapeHtml(path)}</small></span>
      <span>${escapeHtml(fossil.message)}<small>${fossil.sha.slice(0, 7)}</small></span><span class="loss">−${compactNumber(fossil.deletions)}</span><span>${formatDate(fossil.date)}</span><b>↗</b>
    </a>`;
  }).join("") || '<div class="empty-state large">No deleted files were discovered in the fifteen inspected commit strata.</div>';

  return `<div class="view">${sectionIntro("DELETED-FILE INDEX", "Recovered fossils", "Files removed within the most recently inspected commit strata. Their last surviving state remains accessible through Git history.", String(analysis.fossils.length).padStart(2, "0"))}
    <div class="fossil-table"><div class="table-head"><span>OBJECT</span><span>LAST EVENT</span><span>LOSS</span><span>REMOVED</span><span></span></div>${rows}</div>
  </div>`;
}

function playbackView(analysis) {
  const commits = [...analysis.commits].reverse();
  const current = commits[state.playbackIndex] || commits[0];
  const bars = Array.from({ length: 28 }).map((_, index) => {
    const seed = Number.parseInt(current.sha.slice(index % 12, (index % 12) + 2), 16);
    return `<i style="height:${18 + (seed % 78)}%;opacity:${0.25 + (seed % 60) / 100}"></i>`;
  }).join("");
  return `<div class="view playback-view">
    ${sectionIntro("CHRONOLOGICAL RECONSTRUCTION", "Repository playback", "Move through the observed record one commit at a time, from the earliest surviving sample to the present.", `${String(state.playbackIndex + 1).padStart(2, "0")}<small>/${commits.length}</small>`)}
    <section class="playback-stage">
      <div class="playback-meta"><span>${formatDate(current.commit.author?.date || analysis.repo.updated_at)}</span><span>${current.sha.slice(0, 7)}</span><span>${escapeHtml(current.author?.login || current.commit.author?.name || "Unknown author")}</span></div>
      <h3>${escapeHtml(firstLine(current.commit.message))}</h3><div class="playback-viz">${bars}</div>
      <div class="playback-controls"><button id="playback-prev" ${state.playbackIndex === 0 ? "disabled" : ""}>←</button><button class="play" id="playback-play">${state.playing ? "PAUSE" : "PLAY"}</button><input id="playback-range" aria-label="Playback position" type="range" min="0" max="${commits.length - 1}" value="${state.playbackIndex}" /><button id="playback-next" ${state.playbackIndex === commits.length - 1 ? "disabled" : ""}>→</button></div>
    </section>
  </div>`;
}

function compareView(analysis) {
  const options = analysis.commits.map((commit) => `<option value="${commit.sha}">${commit.sha.slice(0, 7)} — ${escapeHtml(firstLine(commit.commit.message).slice(0, 52))}</option>`).join("");
  const result = state.comparison;
  const resultMarkup = result ? `<div class="compare-results">
    <div class="compare-metrics"><div><span>STATUS</span><strong>${escapeHtml(result.status.toUpperCase())}</strong></div><div><span>COMMITS BETWEEN</span><strong>${result.total_commits}</strong></div><div><span>FILES ALTERED</span><strong>${result.files?.length || 0}</strong></div><div><span>LINEAGE</span><strong>+${result.ahead_by} / −${result.behind_by}</strong></div></div>
    <div class="difference-list">${(result.files || []).slice(0, 60).map((file) => `<div><span class="status ${file.status}">${file.status.slice(0, 1).toUpperCase()}</span><b>${escapeHtml(file.filename)}</b><span class="positive">+${file.additions}</span><span class="negative">−${file.deletions}</span></div>`).join("")}</div>
  </div>` : '<div class="compare-empty"><span>NO DIFFERENTIAL LOADED</span><p>Choose a base era and a head era to begin comparison.</p></div>';

  return `<div class="view compare-view">
    ${sectionIntro("ERA DIFFERENTIAL", "Compare two states", "Select two surviving commits and expose everything added, removed, or altered between them.")}
    <section class="compare-selector">
      <label><span>BASE ERA</span><select id="base-sha">${options}</select></label><div class="compare-arrow">→</div>
      <label><span>HEAD ERA</span><select id="head-sha">${options}</select></label>
      <button id="compare-button" ${state.comparing ? "disabled" : ""}>${state.comparing ? "COMPARING…" : "EXPOSE DIFFERENCE"}</button>
    </section>${resultMarkup}
  </div>`;
}

function attachViewEvents() {
  if (state.view === "playback") {
    const commits = [...state.analysis.commits].reverse();
    document.querySelector("#playback-prev").addEventListener("click", () => { state.playing = false; state.playbackIndex = Math.max(0, state.playbackIndex - 1); renderArchive(); });
    document.querySelector("#playback-next").addEventListener("click", () => { state.playing = false; state.playbackIndex = Math.min(commits.length - 1, state.playbackIndex + 1); renderArchive(); });
    document.querySelector("#playback-range").addEventListener("input", (event) => { state.playing = false; state.playbackIndex = Number(event.target.value); renderArchive(); });
    document.querySelector("#playback-play").addEventListener("click", togglePlayback);
    if (state.playing) schedulePlayback();
  }
  if (state.view === "compare") {
    const base = document.querySelector("#base-sha");
    const head = document.querySelector("#head-sha");
    base.value = state.baseSha;
    head.value = state.headSha;
    base.addEventListener("change", (event) => { state.baseSha = event.target.value; });
    head.addEventListener("change", (event) => { state.headSha = event.target.value; });
    document.querySelector("#compare-button").addEventListener("click", compareEras);
  }
}

function togglePlayback() {
  const total = state.analysis.commits.length;
  state.playing = !state.playing;
  if (state.playing && state.playbackIndex >= total - 1) state.playbackIndex = 0;
  renderArchive();
}

function schedulePlayback() {
  clearPlaybackTimer();
  state.playbackTimer = window.setTimeout(() => {
    if (!state.playing) return;
    const total = state.analysis.commits.length;
    if (state.playbackIndex >= total - 1) {
      state.playing = false;
    } else {
      state.playbackIndex += 1;
    }
    renderArchive();
  }, 700);
}

function clearPlaybackTimer() {
  if (state.playbackTimer) window.clearInterval(state.playbackTimer);
  state.playbackTimer = null;
}

function stopPlayback() {
  clearPlaybackTimer();
  state.playing = false;
}

async function compareEras() {
  if (!state.analysis || !state.baseSha || !state.headSha || state.baseSha === state.headSha) {
    state.error = "Choose two different eras to compare.";
    return renderArchive();
  }
  state.comparing = true;
  state.error = "";
  renderArchive();
  try {
    const owner = encodeURIComponent(state.analysis.owner);
    const repo = encodeURIComponent(state.analysis.repoName);
    state.comparison = await githubFetch(`/repos/${owner}/${repo}/compare/${encodeURIComponent(state.baseSha)}...${encodeURIComponent(state.headSha)}`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Those eras could not be compared.";
  } finally {
    state.comparing = false;
    renderArchive();
  }
}

function buildChronicle(analysis) {
  const { repo, commits, contributors, branches, fossils, events, languages } = analysis;
  return `# ${repo.name}: Repository Chronicle

> Generated by **LACUNA**, a product of **MOURNINGSTAR**.

## Survey

- Repository: [${repo.full_name}](${repo.html_url})
- Created: ${formatDate(repo.created_at)}
- Default branch: \`${repo.default_branch}\`
- Recent commits observed: ${commits.length}
- Contributors observed: ${contributors.length}
- Branches observed: ${branches.length}
- Primary languages: ${Object.keys(languages).join(", ") || "Not detected"}
- Deleted files recovered from inspected commits: ${fossils.length}

## Historical markers

${events.length ? events.map((event) => `### ${event.type} — ${event.title}\n\n${formatDate(event.date)} · \`${event.sha.slice(0, 7)}\`\n\n${event.description}`).join("\n\n") : "No major markers were detected in the inspected history."}

## Fossils

${fossils.length ? fossils.slice(0, 30).map((fossil) => `- \`${fossil.filename}\` — removed ${formatDate(fossil.date)} in \`${fossil.sha.slice(0, 7)}\``).join("\n") : "No deleted files were found in the inspected commits."}

---

LACUNA is a read-only repository archaeology system. A product of MOURNINGSTAR.
`;
}

function downloadChronicle() {
  if (!state.analysis) return;
  const blob = new Blob([buildChronicle(state.analysis)], { type: "text/markdown" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${state.analysis.repo.name.toLowerCase()}-chronicle.md`;
  anchor.click();
  URL.revokeObjectURL(href);
}

homeButton.addEventListener("click", () => {
  state.analysis = null;
  state.view = "survey";
  state.error = "";
  state.loadingText = "Awaiting repository";
  renderLanding();
});

renderLanding();
