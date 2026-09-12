// Pasaporte de Boda — Nati & Leo — Álbum resumen (vista de recuento, sin descarga)
// Público como la galería, pero organizado por reto y sin acciones (solo lectura).

import { supabase } from "./supabase-client.js";

const els = {
  loading: document.getElementById("album-loading"),
  empty: document.getElementById("album-empty"),
  sections: document.getElementById("album-sections"),
};

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

async function load() {
  const [{ data: challenges, error: challengesError }, { data: photos, error: photosError }, { data: reactionRows }] =
    await Promise.all([
      supabase.from("challenges").select("*").order("sort_order"),
      supabase.rpc("get_public_gallery"),
      supabase.rpc("get_gallery_reactions"),
    ]);

  els.loading.style.display = "none";

  if (challengesError || photosError) {
    els.empty.style.display = "block";
    els.empty.querySelector("p").textContent = "No se pudo cargar el álbum. Intenta de nuevo en un momento.";
    return;
  }

  const items = photos || [];
  if (items.length === 0) {
    els.empty.style.display = "block";
    return;
  }

  const reactionsBySubmission = new Map();
  for (const row of reactionRows || []) {
    let entry = reactionsBySubmission.get(row.submission_id);
    if (!entry) {
      entry = {};
      reactionsBySubmission.set(row.submission_id, entry);
    }
    entry[row.emoji] = Number(row.reaction_count);
  }

  const commentsBySubmission = new Map();
  await Promise.all(
    items.map(async (p) => {
      const { data } = await supabase.rpc("get_comments", { p_submission_id: p.submission_id });
      commentsBySubmission.set(p.submission_id, data || []);
    })
  );

  const byChallenge = new Map();
  for (const p of items) {
    if (!byChallenge.has(p.challenge_title)) byChallenge.set(p.challenge_title, []);
    byChallenge.get(p.challenge_title).push(p);
  }

  const orderedTitles = [
    ...(challenges || []).map((c) => c.title).filter((t) => byChallenge.has(t)),
    ...[...byChallenge.keys()].filter((t) => !(challenges || []).some((c) => c.title === t)),
  ];

  els.sections.innerHTML = orderedTitles
    .map((title) => {
      const photosForChallenge = byChallenge.get(title);
      const cards = photosForChallenge
        .map((p) => {
          const isVideo = p.media_type === "video";
          const media = isVideo
            ? `<video src="${escapeHtml(p.photo_url)}" controls playsinline preload="metadata"></video>
               <div class="album-video-badge">▶ ${formatDuration(p.duration_seconds)}</div>`
            : `<img src="${escapeHtml(p.photo_url)}" alt="Foto de ${escapeHtml(p.guest_first_name)}" loading="lazy" />`;

          const reactions = reactionsBySubmission.get(p.submission_id);
          const reactionsHtml = reactions
            ? `<div class="album-reactions">${Object.entries(reactions)
                .map(([emoji, count]) => `<span>${emoji} ${count}</span>`)
                .join("")}</div>`
            : "";

          const comments = commentsBySubmission.get(p.submission_id) || [];
          const commentsHtml = comments.length
            ? `<div class="album-comments">${comments
                .map((c) => `<div class="album-comment"><strong>${escapeHtml(c.guest_first_name)}:</strong> ${escapeHtml(c.text)}</div>`)
                .join("")}</div>`
            : "";

          return `
          <figure class="album-card">
            <div class="album-media">${media}</div>
            <figcaption>
              <div class="album-guest">${escapeHtml(p.guest_first_name)}</div>
              ${reactionsHtml}
              ${commentsHtml}
            </figcaption>
          </figure>`;
        })
        .join("");

      return `
      <section class="album-section">
        <h2 class="album-section-title">${escapeHtml(title)}</h2>
        <div class="album-grid">${cards}</div>
      </section>`;
    })
    .join("");
}

load();
