// Thin client for the es-view JSON API. Kept framework-agnostic so the coming
// explorer components and any future selection/context calls share one place.

export async function fetchModel() {
  const res = await fetch('/api/model');
  if (!res.ok) throw new Error(`/api/model responded ${res.status}`);
  return res.json(); // { model, meta: { source, sourcePath, repoRoot, warnings } }
}
