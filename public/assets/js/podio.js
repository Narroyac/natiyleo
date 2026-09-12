// Pasaporte de Boda — Nati & Leo — Podio en vivo (proyección, solo lectura)

import { supabase } from "./supabase-client.js";

const ADMIN_EMAIL = "narroyac@gmail.com";

const els = {
  loginScreen: document.getElementById("login-screen"),
  loginForm: document.getElementById("login-form"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  shell: document.getElementById("podio-shell"),
  timerLabel: document.getElementById("podio-timer-label"),
  timerDisplay: document.getElementById("podio-timer"),
  podium: document.getElementById("podio-podium"),
  ranking: document.getElementById("podio-ranking"),
};

let db = { guests: [], submissions: [], totalChallenges: 11, appConfig: null };
let timerInterval = null;

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.classList.remove("show");
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: els.loginPassword.value,
  });
  if (error) {
    els.loginError.classList.add("show");
    return;
  }
  await boot();
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadAll() {
  const [{ data: guests }, { data: submissions }, { data: challenges }, { data: config }] = await Promise.all([
    supabase.from("guests").select("id, first_name, invitation_label, table_number, completed_at"),
    supabase.from("submissions").select("guest_id, created_at"),
    supabase.from("challenges").select("id"),
    supabase.from("app_config").select("*").single(),
  ]);
  db.guests = guests || [];
  db.submissions = submissions || [];
  db.totalChallenges = (challenges || []).length || 11;
  db.appConfig = config;
}

// ---------------------------------------------------------------------------
// Cronómetro (misma lógica de pausa/extensión que el panel admin)
// ---------------------------------------------------------------------------

function computeDeadline() {
  const c = db.appConfig;
  if (!c?.challenge_started_at) return null;
  const start = new Date(c.challenge_started_at).getTime();
  const durationMs = (c.challenge_duration_minutes || 0) * 60000;
  const extraMs = (c.challenge_extra_seconds || 0) * 1000;
  return start + durationMs + extraMs;
}

function isTimeUp() {
  const deadline = computeDeadline();
  if (deadline === null) return false;
  const now = db.appConfig.challenge_paused_at ? new Date(db.appConfig.challenge_paused_at).getTime() : Date.now();
  return now >= deadline;
}

function renderTimer() {
  const c = db.appConfig;
  if (timerInterval) clearInterval(timerInterval);
  els.timerLabel.classList.remove("paused", "finished");

  if (!c?.challenge_started_at) {
    els.timerLabel.textContent = "Sin iniciar";
    els.timerDisplay.textContent = "--:--:--";
    return;
  }
  if (c.challenge_paused_at) {
    els.timerLabel.textContent = "Pausado";
    els.timerLabel.classList.add("paused");
  } else {
    els.timerLabel.textContent = "Reto en curso";
  }

  function tick() {
    const deadline = computeDeadline();
    const now = c.challenge_paused_at ? new Date(c.challenge_paused_at).getTime() : Date.now();
    const remaining = Math.max(0, deadline - now);
    const h = String(Math.floor(remaining / 3600000)).padStart(2, "0");
    const m = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
    els.timerDisplay.textContent = `${h}:${m}:${s}`;
    if (remaining <= 0 && !c.challenge_paused_at) {
      els.timerLabel.textContent = "Tiempo terminado";
      els.timerLabel.classList.add("finished");
      clearInterval(timerInterval);
    }
  }
  tick();
  if (!c.challenge_paused_at) timerInterval = setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// Podio (top 3) + ranking general
// ---------------------------------------------------------------------------

function displayName(g) {
  return g.first_name || g.invitation_label || "—";
}

/**
 * Ranking unificado en vivo: ordena por (1) # de estampillas conseguidas —
 * más estampillas siempre gana — y (2) velocidad como desempate — entre
 * quienes tienen el mismo # de estampillas, gana quien las consiguió más
 * rápido (timestamp de su última estampilla más temprano). Como el
 * cronómetro del reto es el mismo para todos, comparar esos timestamps
 * directamente ya equivale a comparar su ritmo/velocidad.
 * Se recalcula en cada cambio en vivo (Realtime), así que el podio se mueve
 * solo según van consiguiendo estampillas, no solo cuando alguien termina.
 */
function buildRanking() {
  const total = db.totalChallenges;
  const winnersCount = db.appConfig?.prize_winners_count ?? 3;
  const deadline = computeDeadline();

  const rows = db.guests.map((g) => {
    const subs = db.submissions.filter((s) => s.guest_id === g.id);
    const count = subs.length;
    const lastStampAt = subs.length ? Math.max(...subs.map((s) => new Date(s.created_at).getTime())) : null;
    return { g, count, lastStampAt };
  });

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count; // más estampillas primero
    if (a.lastStampAt === null && b.lastStampAt === null) return displayName(a.g).localeCompare(displayName(b.g));
    if (a.lastStampAt === null) return 1;
    if (b.lastStampAt === null) return -1;
    return a.lastStampAt - b.lastStampAt; // más veloz (llegó antes a ese # de estampillas) primero
  });

  let winnerRank = 0;
  return rows.map((row) => {
    const isComplete = row.count >= total;
    let isOfficialWinner = false;
    if (isComplete && row.g.completed_at) {
      winnerRank++;
      isOfficialWinner = winnerRank <= winnersCount && (deadline === null || new Date(row.g.completed_at).getTime() <= deadline);
    }
    return { ...row, isComplete, isOfficialWinner };
  });
}

function renderPodium() {
  const total = db.totalChallenges;
  const contenders = buildRanking()
    .filter((r) => r.count > 0)
    .slice(0, 3);

  if (contenders.length === 0) {
    els.podium.innerHTML = `<div class="podio-empty-msg">Todavía nadie ha conseguido una estampilla.<br />En cuanto empiecen, aquí aparecen los que van liderando — en vivo.</div>`;
    return;
  }

  const medal = ["🥇", "🥈", "🥉"];
  els.podium.innerHTML = contenders
    .map(({ g, count, isComplete, isOfficialWinner }, i) => {
      const rank = i + 1;
      const cardClass = isOfficialWinner ? "is-official" : "is-live";
      const medalContent = isOfficialWinner ? medal[i] || rank : `#${rank}`;
      let statusHtml;
      if (isOfficialWinner) {
        const time = new Date(g.completed_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        statusHtml = `<div class="pedestal-time">${time}</div>`;
      } else if (isComplete) {
        statusHtml = `<div class="pedestal-time">Completó su pasaporte</div>`;
      } else {
        statusHtml = `<div class="pedestal-live"><span class="live-dot"></span>${count}/${total} estampillas</div>`;
      }
      const baseLabel = isOfficialWinner ? `#${rank} · Ganador` : `#${rank}`;
      return `
      <div class="pedestal-card rank-${rank} ${cardClass}">
        <div class="pedestal-medal">${medalContent}</div>
        <div class="pedestal-name">${escapeHtml(displayName(g))}</div>
        <div class="pedestal-table">${g.table_number ? `Mesa ${g.table_number}` : ""}</div>
        ${statusHtml}
        <div class="pedestal-base">${baseLabel}</div>
      </div>
    `;
    })
    .join("");
}

function renderRanking() {
  const total = db.totalChallenges;
  const rows = buildRanking();

  els.ranking.innerHTML = rows
    .map(({ g, count, isComplete, isOfficialWinner }) => {
      const pct = Math.round((Math.min(count, total) / total) * 100);
      const posLabel = isOfficialWinner ? "🏅" : isComplete ? "✓" : "";
      return `
      <div class="ranking-row ${isComplete ? "is-complete" : ""} ${isOfficialWinner ? "is-winner" : ""}">
        <div class="r-pos">${posLabel}</div>
        <div>
          <div class="r-name">${escapeHtml(displayName(g))}</div>
          <div class="r-table">${g.table_number ? `Mesa ${g.table_number}` : ""}</div>
        </div>
        <div class="r-progress-track"><div class="r-progress-fill" style="width:${pct}%"></div></div>
        <div class="r-count">${count}/${total}</div>
      </div>
    `;
    })
    .join("");
}

function renderAll() {
  renderTimer();
  renderPodium();
  renderRanking();
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

function subscribeRealtime() {
  supabase
    .channel("podio-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, async () => {
      await loadAll();
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, async () => {
      await loadAll();
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "app_config" }, async () => {
      await loadAll();
      renderAll();
    })
    .subscribe();
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
  await loadAll();
  els.loginScreen.style.display = "none";
  els.shell.classList.add("show");
  renderAll();
  subscribeRealtime();
}

(async function init() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    await boot();
  }
})();
