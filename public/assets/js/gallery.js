// Pasaporte de Boda — Nati & Leo — Galería pública, feed vertical estilo Instagram
// (todos los invitados ven todas las publicaciones; reacciones y comentarios
// siempre visibles debajo de cada foto/video, sin pantalla completa).

import { supabase, getSavedCode } from "./supabase-client.js";

const REACTION_EMOJIS = ["❤️", "😂", "🥹", "🥳", "👏🏻"];

const els = {
  backLink: document.getElementById("back-link"),
  refreshBtn: document.getElementById("refresh-btn"),
  loading: document.getElementById("gallery-loading"),
  empty: document.getElementById("gallery-empty"),
  feed: document.getElementById("feed"),
  challengeChips: document.getElementById("challenge-chips"),
  mineToggle: document.getElementById("mine-toggle"),
  toast: document.getElementById("toast"),
};

let allPhotos = [];
let selectedChallenge = null; // null = "Todos"
let mineOnly = false;

// submission_id -> { counts: { emoji: n }, mine: emoji|null }
let reactionsState = new Map();
// submission_id -> n (conteo, para el rótulo antes de expandir)
let commentCounts = new Map();
// submission_id -> array de comentarios ya cargados
let commentsCache = new Map();
// submission_id -> true si el panel de comentarios está expandido
let expandedComments = new Set();

let videoObserver = null;

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatRelativeTime(iso) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "ahora";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} d`;
  return `hace ${Math.floor(day / 7)} sem`;
}

function getCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("c") || getSavedCode();
}

(function setBackLink() {
  const code = getCode();
  els.backLink.href = code ? `/pasaporte.html?c=${encodeURIComponent(code)}` : "/";
})();

// ---------------------------------------------------------------------------
// Carga y filtros
// ---------------------------------------------------------------------------

async function loadGallery({ silent = false } = {}) {
  if (!silent) {
    els.loading.style.display = "flex";
    els.empty.style.display = "none";
  }
  const [{ data, error }, { data: countRows }] = await Promise.all([
    supabase.rpc("get_public_gallery", { p_code: getCode() }),
    supabase.rpc("get_gallery_comment_counts"),
  ]);
  els.loading.style.display = "none";

  if (error) {
    els.empty.style.display = "block";
    els.empty.querySelector("p").textContent = "No se pudo cargar la galería. Intenta de nuevo en un momento.";
    return;
  }

  allPhotos = data || [];
  commentCounts = new Map((countRows || []).map((r) => [r.submission_id, Number(r.comment_count)]));
  renderFilters();
  renderFeed();
  await loadReactions();
}

function renderFilters() {
  const titles = [];
  for (const p of allPhotos) {
    if (!titles.includes(p.challenge_title)) titles.push(p.challenge_title);
  }
  if (selectedChallenge && !titles.includes(selectedChallenge)) selectedChallenge = null;

  const chips = [{ label: "Todos", value: null }, ...titles.map((t) => ({ label: t, value: t }))];
  els.challengeChips.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="chip${c.value === selectedChallenge ? " active" : ""}" data-value="${escapeHtml(c.value ?? "")}">${escapeHtml(c.label)}</button>`
    )
    .join("");
  els.challengeChips.querySelectorAll(".chip").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      selectedChallenge = chips[i].value;
      renderFilters();
      renderFeed();
    });
  });

  const hasCode = Boolean(getCode());
  els.mineToggle.style.display = hasCode ? "inline-block" : "none";
  els.mineToggle.classList.toggle("active", mineOnly);
}

els.mineToggle.addEventListener("click", () => {
  mineOnly = !mineOnly;
  renderFilters();
  renderFeed();
});

// ---------------------------------------------------------------------------
// Render del feed
// ---------------------------------------------------------------------------

function reactionPillsHtml(submissionId) {
  const entry = reactionsState.get(submissionId);
  const mine = entry?.mine || null;
  return REACTION_EMOJIS.map((emoji) => {
    const count = entry?.counts?.[emoji] || 0;
    const active = emoji === mine ? " active" : "";
    return `<button type="button" class="reaction-pill${active}" data-emoji="${emoji}">
      <span class="rp-emoji">${emoji}</span>${count > 0 ? `<span class="rp-count">${count}</span>` : ""}
    </button>`;
  }).join("");
}

function commentToggleLabel(submissionId) {
  const isOpen = expandedComments.has(submissionId);
  if (isOpen) return "Ocultar comentarios";
  const n = commentCounts.get(submissionId) || 0;
  return n > 0 ? `💬 Ver comentarios (${n})` : "💬 Comentar";
}

function postCardHtml(p) {
  const isVideo = p.media_type === "video";
  const media = isVideo
    ? `<video muted playsinline preload="none" data-src="${escapeHtml(p.photo_url)}"></video>
       <div class="feed-video-badge">▶ ${formatDuration(p.duration_seconds)}</div>
       <div class="feed-video-play" data-role="play-overlay"><span>▶</span></div>`
    : `<img src="${escapeHtml(p.photo_url)}" alt="Foto de ${escapeHtml(p.guest_first_name)}" loading="lazy" />`;

  const commentsOpen = expandedComments.has(p.submission_id);

  return `
  <article class="feed-post" data-submission-id="${escapeHtml(p.submission_id)}" data-media-type="${escapeHtml(p.media_type || "photo")}">
    <header class="feed-post-header">
      <div class="feed-post-name">${escapeHtml(p.guest_first_name)}</div>
      <div class="feed-post-meta">${escapeHtml(p.challenge_title)} · ${formatRelativeTime(p.created_at)}</div>
    </header>
    <div class="feed-post-media" data-role="media">${media}</div>
    <div class="feed-post-actions">
      <div class="reaction-bar" data-role="reactions">${reactionPillsHtml(p.submission_id)}</div>
      <button type="button" class="comment-toggle" data-role="comment-toggle">${commentToggleLabel(p.submission_id)}</button>
    </div>
    <div class="feed-post-comments" data-role="comments-panel" ${commentsOpen ? "" : "hidden"}>
      <div class="comments-list" data-role="comments-list"></div>
      <p class="comment-hint" data-role="comment-hint" hidden>Abre tu pasaporte para poder comentar.</p>
      <form class="comment-form" data-role="comment-form">
        <input type="text" maxlength="140" placeholder="Escribe un comentario…" autocomplete="off" data-role="comment-input" />
        <button type="submit" data-role="comment-submit">Enviar</button>
      </form>
    </div>
  </article>`;
}

function renderFeed() {
  const photos = allPhotos.filter((p) => {
    if (selectedChallenge && p.challenge_title !== selectedChallenge) return false;
    if (mineOnly && !p.is_mine) return false;
    return true;
  });

  if (allPhotos.length === 0) {
    els.feed.innerHTML = "";
    els.empty.style.display = "block";
    els.empty.querySelector("p").textContent = "Aún no hay fotos ni videos. ¡Sé el primero en completar un reto!";
    return;
  }
  if (photos.length === 0) {
    els.feed.innerHTML = "";
    els.empty.style.display = "block";
    els.empty.querySelector("p").textContent = mineOnly
      ? "Todavía no has subido fotos o videos con este filtro."
      : "No hay fotos ni videos para este reto todavía.";
    return;
  }
  els.empty.style.display = "none";

  els.feed.innerHTML = photos.map(postCardHtml).join("");

  setupLazyVideos();

  // los paneles de comentarios que ya estaban expandidos se vuelven a llenar
  // con lo que ya teníamos en caché (no se vuelve a pedir al servidor)
  expandedComments.forEach((submissionId) => {
    const cached = commentsCache.get(submissionId);
    if (cached) renderCommentsInto(submissionId, cached);
    updateCommentFormState(submissionId);
  });
}

function setupLazyVideos() {
  if (videoObserver) videoObserver.disconnect();
  videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const video = entry.target;
        if (video.dataset.src && !video.src) {
          video.preload = "metadata";
          video.src = video.dataset.src;
        }
      });
    },
    { rootMargin: "200px 0px" }
  );

  els.feed.querySelectorAll("video[data-src]").forEach((video) => {
    videoObserver.observe(video);
    video.addEventListener("play", () => {
      // solo un video sonando/reproduciendo a la vez, como en Instagram
      els.feed.querySelectorAll("video").forEach((v) => {
        if (v !== video && !v.paused) v.pause();
      });
      video.closest(".feed-post-media")?.querySelector('[data-role="play-overlay"]')?.classList.remove("show");
    });
    video.addEventListener("pause", () => {
      video.closest(".feed-post-media")?.querySelector('[data-role="play-overlay"]')?.classList.add("show");
    });
  });
}

// ---------------------------------------------------------------------------
// Reacciones
// ---------------------------------------------------------------------------

async function loadReactions() {
  const { data, error } = await supabase.rpc("get_gallery_reactions", { p_code: getCode() });
  if (error) return;

  const next = new Map();
  for (const row of data || []) {
    let entry = next.get(row.submission_id);
    if (!entry) {
      entry = { counts: {}, mine: null };
      next.set(row.submission_id, entry);
    }
    entry.counts[row.emoji] = Number(row.reaction_count);
    if (row.is_mine) entry.mine = row.emoji;
  }
  reactionsState = next;
  renderAllReactionBars();
}

function renderAllReactionBars() {
  els.feed.querySelectorAll(".feed-post").forEach((card) => {
    renderReactionBarFor(card.dataset.submissionId);
  });
}

function renderReactionBarFor(submissionId) {
  const card = els.feed.querySelector(`.feed-post[data-submission-id="${cssEscape(submissionId)}"]`);
  if (!card) return;
  const bar = card.querySelector('[data-role="reactions"]');
  if (bar) bar.innerHTML = reactionPillsHtml(submissionId);
}

function cssEscape(s) {
  return window.CSS?.escape ? CSS.escape(s) : s;
}

async function toggleReaction(submissionId, emoji) {
  const code = getCode();
  if (!code) {
    toast("Abre tu pasaporte primero para poder reaccionar.", true);
    return;
  }

  const entry = reactionsState.get(submissionId) || { counts: {}, mine: null };
  const wasMine = entry.mine === emoji;

  const prevSnapshot = { counts: { ...entry.counts }, mine: entry.mine };
  if (wasMine) {
    entry.counts[emoji] = Math.max(0, (entry.counts[emoji] || 1) - 1);
    entry.mine = null;
  } else {
    if (entry.mine) entry.counts[entry.mine] = Math.max(0, (entry.counts[entry.mine] || 1) - 1);
    entry.counts[emoji] = (entry.counts[emoji] || 0) + 1;
    entry.mine = emoji;
  }
  reactionsState.set(submissionId, entry);
  renderReactionBarFor(submissionId);

  const { error } = wasMine
    ? await supabase.rpc("remove_reaction", { p_code: code, p_submission_id: submissionId })
    : await supabase.rpc("add_reaction", { p_code: code, p_submission_id: submissionId, p_emoji: emoji });

  if (error) {
    reactionsState.set(submissionId, prevSnapshot);
    renderReactionBarFor(submissionId);
    toast("No se pudo guardar tu reacción. Intenta de nuevo.", true);
  }
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

function renderCommentsInto(submissionId, comments) {
  const card = els.feed.querySelector(`.feed-post[data-submission-id="${cssEscape(submissionId)}"]`);
  if (!card) return;
  const list = card.querySelector('[data-role="comments-list"]');
  if (!list) return;
  list.innerHTML = comments
    .map(
      (c) =>
        `<div class="comment-item"><span class="cm-name">${escapeHtml(c.guest_first_name)}</span>${escapeHtml(c.text)}</div>`
    )
    .join("");
}

async function loadComments(submissionId) {
  const card = els.feed.querySelector(`.feed-post[data-submission-id="${cssEscape(submissionId)}"]`);
  const list = card?.querySelector('[data-role="comments-list"]');
  if (list) list.innerHTML = `<div class="comments-loading"><div class="spinner"></div></div>`;

  const { data, error } = await supabase.rpc("get_comments", { p_submission_id: submissionId });
  if (error) {
    if (list) list.innerHTML = "";
    return;
  }
  commentsCache.set(submissionId, data || []);
  renderCommentsInto(submissionId, data || []);
}

function updateCommentFormState(submissionId) {
  const card = els.feed.querySelector(`.feed-post[data-submission-id="${cssEscape(submissionId)}"]`);
  if (!card) return;
  const form = card.querySelector('[data-role="comment-form"]');
  const hint = card.querySelector('[data-role="comment-hint"]');
  const hasCode = Boolean(getCode());
  form?.classList.toggle("is-disabled", !hasCode);
  if (hint) hint.hidden = hasCode;
}

async function toggleCommentsPanel(submissionId, card) {
  const panel = card.querySelector('[data-role="comments-panel"]');
  const toggleBtn = card.querySelector('[data-role="comment-toggle"]');
  if (!panel) return;

  const isHidden = panel.hasAttribute("hidden");
  if (isHidden) {
    panel.removeAttribute("hidden");
    expandedComments.add(submissionId);
    updateCommentFormState(submissionId);
    if (!commentsCache.has(submissionId)) await loadComments(submissionId);
  } else {
    panel.setAttribute("hidden", "");
    expandedComments.delete(submissionId);
  }
  if (toggleBtn) toggleBtn.textContent = commentToggleLabel(submissionId);
}

async function submitComment(submissionId, card, input) {
  const code = getCode();
  if (!code) {
    toast("Abre tu pasaporte primero para poder comentar.", true);
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  if (text.length > 140) {
    toast("Máximo 140 caracteres.", true);
    return;
  }

  const submitBtn = card.querySelector('[data-role="comment-submit"]');
  if (submitBtn) submitBtn.disabled = true;
  const { error } = await supabase.rpc("add_comment", { p_code: code, p_submission_id: submissionId, p_text: text });
  if (submitBtn) submitBtn.disabled = false;

  if (error) {
    toast("No se pudo enviar tu comentario. Intenta de nuevo.", true);
    return;
  }
  input.value = "";
  commentCounts.set(submissionId, (commentCounts.get(submissionId) || 0) + 1);
  await loadComments(submissionId);
  const toggleBtn = card.querySelector('[data-role="comment-toggle"]');
  if (toggleBtn) toggleBtn.textContent = commentToggleLabel(submissionId);
}

// ---------------------------------------------------------------------------
// Delegación de eventos del feed
// ---------------------------------------------------------------------------

els.feed.addEventListener("click", (e) => {
  const card = e.target.closest(".feed-post");
  if (!card) return;
  const submissionId = card.dataset.submissionId;

  const reactionBtn = e.target.closest(".reaction-pill");
  if (reactionBtn) {
    toggleReaction(submissionId, reactionBtn.dataset.emoji);
    return;
  }

  const commentToggle = e.target.closest('[data-role="comment-toggle"]');
  if (commentToggle) {
    toggleCommentsPanel(submissionId, card);
    return;
  }

  const media = e.target.closest('[data-role="media"]');
  if (media && card.dataset.mediaType === "video") {
    const video = media.querySelector("video");
    if (video) {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }
  }
});

els.feed.addEventListener("submit", (e) => {
  const form = e.target.closest('[data-role="comment-form"]');
  if (!form) return;
  e.preventDefault();
  const card = form.closest(".feed-post");
  const input = form.querySelector('[data-role="comment-input"]');
  submitComment(card.dataset.submissionId, card, input);
});

// ---------------------------------------------------------------------------
// Refresco y tiempo real
// ---------------------------------------------------------------------------

els.refreshBtn.addEventListener("click", async () => {
  els.refreshBtn.classList.add("spinning");
  await loadGallery();
  setTimeout(() => els.refreshBtn.classList.remove("spinning"), 700);
});

// Actualiza sola cuando alguien sube una foto nueva (Supabase Realtime).
supabase
  .channel("public-gallery")
  .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, () => {
    loadGallery({ silent: true });
  })
  .subscribe();

// Actualiza los conteos de reacciones en vivo cuando alguien reacciona.
supabase
  .channel("public-gallery-reactions")
  .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
    loadReactions();
  })
  .subscribe();

// Actualiza los comentarios en vivo si el panel de esa foto está abierto.
supabase
  .channel("public-gallery-comments")
  .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) => {
    const affected = payload.new?.submission_id || payload.old?.submission_id;
    if (!affected) return;
    supabase
      .rpc("get_gallery_comment_counts")
      .then(({ data }) => {
        commentCounts = new Map((data || []).map((r) => [r.submission_id, Number(r.comment_count)]));
        const card = els.feed.querySelector(`.feed-post[data-submission-id="${cssEscape(affected)}"]`);
        const toggleBtn = card?.querySelector('[data-role="comment-toggle"]');
        if (toggleBtn && !expandedComments.has(affected)) toggleBtn.textContent = commentToggleLabel(affected);
      });
    if (expandedComments.has(affected)) loadComments(affected);
  })
  .subscribe();

loadGallery();
