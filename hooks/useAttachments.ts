import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  ATTACHMENTS_BUCKET,
  attachmentPathFor,
  storedAttachmentUrl,
} from "@/lib/attachments";

// Links last an hour; they are re-signed well before that while still on screen.
const SIGNED_FOR_SECONDS = 60 * 60;

/**
 * Signed, short-lived URLs for private attachment paths, keyed by path.
 * A path this user may not read (another board's file) is simply absent.
 */
export function useSignedAttachmentUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort();
  const { data } = useQuery({
    queryKey: ["attachment-urls", sorted],
    enabled: sorted.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(sorted, SIGNED_FOR_SECONDS);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
      }
      return out;
    },
  });
  return data ?? {};
}

export interface UploadedAttachment {
  path: string;
  /** What gets saved. */
  storedUrl: string;
  /** What can be shown right now. */
  signedUrl: string | null;
}

/** Uploads one file to its board's folder. Throws on failure. */
export async function uploadAttachment(file: File, boardId: string): Promise<UploadedAttachment> {
  const path = attachmentPathFor(boardId, file.name);
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  const { data } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, SIGNED_FOR_SECONDS);
  return { path, storedUrl: storedAttachmentUrl(path), signedUrl: data?.signedUrl ?? null };
}
