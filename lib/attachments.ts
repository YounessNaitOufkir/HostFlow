/**
 * Files attached to updates and to File columns.
 *
 * The `attachments` bucket is private: a file is readable by whoever can open
 * the board it was uploaded to (storage policy in
 * 20261002000002_attachments_board_access.sql), so contracts and invoices are
 * not reachable by anyone holding a link. New uploads therefore live under
 * `boards/<board id>/`, which is what the policy reads.
 *
 * What is SAVED (in an update's HTML, or a File column's value) is a stable
 * "public-style" URL that names the file's path. It does not load on its own -
 * the bucket is private - and is swapped for a short-lived signed URL whenever
 * it is shown (useSignedAttachmentUrls). Saving a signed URL instead would
 * break every attachment an hour later. Uploads made before this change were
 * saved in the same stable form, which is why they could be repaired in place.
 */

export const ATTACHMENTS_BUCKET = "attachments";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");

// Either form, from any origin: .../object/public/attachments/<path> or
// .../object/sign/attachments/<path>?token=...
//
// A fresh RegExp per use, never a shared /g one: a global regex carries its
// position (lastIndex) between calls, and reading one URL left it partway
// along, so the next scan of an update started late and skipped its first
// attachment - usually the picture.
const ATTACHMENT_URL_SOURCE =
  /(https?:\/\/[^\s"'<>]+?)\/storage\/v1\/object\/(?:public|sign)\/attachments\/([^\s"'<>?#]+)(?:\?[^\s"'<>#]*)?/.source;
const attachmentUrlRe = (flags = "g") => new RegExp(ATTACHMENT_URL_SOURCE, flags);

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;

/** A storage-safe file name: keeps it readable, drops what URLs would mangle. */
function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned.slice(-120) || "file";
}

/** Where a new upload for this board goes. */
export function attachmentPathFor(boardId: string, fileName: string, id: string = crypto.randomUUID()): string {
  return `boards/${boardId}/${id}-${safeFileName(fileName)}`;
}

/** The stable form that is saved. */
export function storedAttachmentUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${ATTACHMENTS_BUCKET}/${encoded}`;
}

/** The storage path a saved or signed attachment URL points at, or null. */
export function attachmentPathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = attachmentUrlRe("").exec(url.replace(/&amp;/g, "&"));
  if (!m) return null;
  try {
    return m[2].split("/").map(decodeURIComponent).join("/");
  } catch {
    return m[2];
  }
}

/** Every attachment path an update's HTML refers to. */
export function attachmentPathsIn(html: string | null | undefined): string[] {
  if (!html) return [];
  const out = new Set<string>();
  for (const m of html.replace(/&amp;/g, "&").matchAll(attachmentUrlRe())) {
    const path = attachmentPathOf(m[0]);
    if (path) out.add(path);
  }
  return [...out];
}

/** Rewrites signed (expiring) attachment URLs back to the stable form, for saving. */
export function toStoredAttachmentHtml(html: string): string {
  return html.replace(/&amp;/g, "&").replace(attachmentUrlRe(), (match) => {
    const path = attachmentPathOf(match);
    return path ? storedAttachmentUrl(path) : match;
  });
}

/** Swaps saved attachment URLs for signed ones, for showing. Unsigned ones are left as they are. */
export function withSignedAttachmentUrls(html: string, signed: Record<string, string>): string {
  return html.replace(/&amp;/g, "&").replace(attachmentUrlRe(), (match) => {
    const path = attachmentPathOf(match);
    return (path && signed[path]) || match;
  });
}

/** Whether an <img> source is this app's own storage (the only images updates may show). */
export function isOwnStorageUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  if (SUPABASE_URL) return src.startsWith(`${SUPABASE_URL}/storage/v1/object/`);
  return /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\//.test(src);
}

export function isImageAttachment(pathOrName: string): boolean {
  return IMAGE_EXT.test(pathOrName);
}

/** The name to show for a stored file: its path without folders or the upload prefix. */
export function attachmentDisplayName(path: string): string {
  const base = path.split("/").pop() ?? path;
  // New uploads: <uuid>-name. Older column uploads: <item uuid>-<timestamp>-name.
  return base
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(\d{10,}-)?/i, "")
    .replace(/^\d{10,}-/, "");
}
