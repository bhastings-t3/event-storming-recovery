// Shared "Copy for Claude" logic for the three copy sites (node detail, context menu,
// context bundle). A 404 or empty response must NOT be written to the clipboard as if it
// succeeded, so callers can surface a failed state instead of a false "Copied ✓".

// Fetch grounded markdown and write it to the clipboard. Returns true only when the
// response was ok (fetchMarkdown throws otherwise), the markdown is a non-empty string,
// and the clipboard write succeeded. Any failure — including a blocked clipboard —
// returns false so the caller shows an error state and never writes an empty clipboard.
export async function copyMarkdown(fetchMarkdown) {
  try {
    const r = await fetchMarkdown();
    const md = r && r.markdown;
    if (typeof md !== 'string' || md.length === 0) return false;
    await navigator.clipboard.writeText(md);
    return true;
  } catch {
    return false;
  }
}
