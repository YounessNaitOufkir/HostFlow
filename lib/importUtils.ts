import { supabase } from "./supabase";
import { statusSemanticOf } from "@/lib/statusSemantics";
import { ImportConfig, ImportUpdate } from "@/components/ImportModal";

/**
 * Normalizes a spreadsheet cell into a "YYYY-MM-DD" calendar date.
 * Values already in that shape are passed through untouched. Anything else is
 * read via its LOCAL calendar parts — using toISOString() here would shift the
 * date back a day for every timezone east of UTC.
 */
function toCalendarDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Monday exports status and priority values with their emoji baked in, e.g.
 * "Critical ⚠️" rather than "Critical". Left alone, that string does not match
 * the seeded "Critical" label, so the importer creates a SECOND option and gives
 * it the next colour from the palette — the stray green "Critical" you get after
 * an import. It also means the cell value never matches any label, so the chip
 * falls back to a default colour.
 *
 * Stripping is safe here: the UI renders its own ⚠️ badge for Critical, so the
 * emoji is presentation, not data.
 *
 * Explicit ranges rather than \p{Extended_Pictographic} because tsconfig targets
 * ES2017, where Unicode property escapes are not available.
 */
const EMOJI_PATTERN = new RegExp(
  // variation selectors, ZWJ, keycap, arrows/symbols (covers U+26A0 warning),
  // then the surrogate pair range that carries U+1F300 and above
  "[\\uFE0E\\uFE0F\\u200D\\u20E3\\u2190-\\u2BFF]|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]",
  "g"
);

export function cleanLabelValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(EMOJI_PATTERN, "").replace(/\s+/g, " ").trim();
}

/**
 * Inserts updates parsed from Monday's "updates" sheet, attaching each to the
 * item it belongs to and rebuilding reply threading via Monday's post IDs.
 *
 * Updates whose item is not part of this import are skipped. Authors are matched
 * against profiles by display name; anything unmatched falls back to the
 * importing user for `author_id` (the column is NOT NULL and references
 * auth.users) while keeping Monday's original name for display.
 */
async function importUpdates(
  updates: ImportUpdate[],
  mondayIdMap: Map<string, string>,
  userMap: Record<string, string>
) {
  const { data: auth } = await supabase.auth.getUser();
  const fallbackAuthorId = auth?.user?.id;
  // Without a signed-in user there is no valid author_id to satisfy the FK
  if (!fallbackAuthorId) return;

  const normalizeName = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ");

  const buildRow = (u: ImportUpdate, itemId: string, parentId: string | null) => ({
    id: crypto.randomUUID(),
    item_id: itemId,
    // body is NOT NULL, but Monday exports attachment-only updates with no text
    body: u.body.trim() || `(attachment-only update${u.assetIds ? ` — Monday asset ID ${u.assetIds}` : ""}; the file itself is not included in Monday's export)`,
    author_id: userMap[normalizeName(u.author)] || fallbackAuthorId,
    author_name: u.author || "Unknown",
    created_at: u.createdAt || new Date().toISOString(),
    parent_id: parentId,
  });

  // Top-level updates first, so replies have a parent to point at
  const topLevel = updates.filter(u => !u.parentPostId);
  const replies = updates.filter(u => u.parentPostId);

  const postIdToUpdateId = new Map<string, string>();
  const topRows = [];
  for (const u of topLevel) {
    const itemId = mondayIdMap.get(u.mondayItemId);
    if (!itemId) continue;
    const row = buildRow(u, itemId, null);
    if (u.postId) postIdToUpdateId.set(u.postId, row.id);
    topRows.push(row);
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < topRows.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from("updates").insert(topRows.slice(i, i + CHUNK_SIZE));
    if (error) throw error;
  }

  // Replies whose parent was not imported are kept as top-level rather than dropped
  const replyRows = [];
  for (const u of replies) {
    const itemId = mondayIdMap.get(u.mondayItemId);
    if (!itemId) continue;
    replyRows.push(buildRow(u, itemId, postIdToUpdateId.get(u.parentPostId) || null));
  }
  for (let i = 0; i < replyRows.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from("updates").insert(replyRows.slice(i, i + CHUNK_SIZE));
    if (error) throw error;
  }
}

/**
 * Handles importing CSV data into Supabase.
 * @param config The import configuration containing raw parsed CSV data.
 * @param workspaceId The current active workspace ID (if creating a new board).
 * @param activeBoardId The current active board ID (if importing to existing board).
 * @param activeBoardColumns The columns of the current board (for mapping).
 */
export async function executeImport(
  config: ImportConfig, 
  workspaceId: string, 
  activeBoardId?: string | null,
  activeBoardColumns?: any[]
) {
  try {
    let targetBoardId = activeBoardId;
    let targetColumns = activeBoardColumns || [];
    let defaultGroupId = "";
    // Whether THIS run created the default group. On an existing board,
    // defaultGroupId is the board's own first group, which the cleanup at the
    // end must never delete - see the guard there.
    let defaultGroupCreatedHere = false;

    // Pre-fetch people for mapping the assignee column.
    //
    // This must read user_directory, not profiles: profiles is restricted to
    // your own row (plus the platform owner), so an ordinary import would match
    // only the importing user and silently leave every other assignee blank.
    // The same map decides update authorship.
    const { data: profiles } = await supabase.from("user_directory").select("id, full_name");
    const userMap: Record<string, string> = {};
    if (profiles) {
      profiles.forEach(p => {
        if (p.full_name) {
          const normalized = p.full_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ");
          userMap[normalized] = p.id;
        }
      });
    }

    // Identify the Name column early so we don't duplicate it as a custom column
    const nameKey = config.headers.find(h => {
      const l = h.toLowerCase();
      return l === "name" || l === "item name" || l === "task";
    }) || config.headers[0];

    // 1. If target is new_board, create the board and columns first
    // 1. If target is new_board, create the board and columns first
    const hasTimelineStart = config.headers.some(h => {
      const lower = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return lower.includes("start") && (lower.includes("timeline") || lower.includes("duree"));
    });
    const hasTimelineEnd = config.headers.some(h => {
      const lower = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return lower.includes("end") && (lower.includes("timeline") || lower.includes("duree"));
    });
    const hasPairedTimeline = hasTimelineStart && hasTimelineEnd;
    
    const LABEL_COLORS = [
      "bg-[#00c875]", 
      "bg-[#fdab3d]", 
      "bg-[#e2445c]", 
      "bg-[#0086c0]", 
      "bg-[#a25ddc]", 
      "bg-[#ff642e]", 
      "bg-[#037f4c]", 
      "bg-[#CAB641]"
    ];

    const STANDARD_COLORS: Record<string, string> = {
      "done": "bg-[#00c875]",
      "fait": "bg-[#00c875]",
      "terminé": "bg-[#00c875]",
      "working on it": "bg-[#fdab3d]",
      "en cours": "bg-[#fdab3d]",
      "stuck": "bg-[#e2445c]",
      "bloqué": "bg-[#e2445c]",
      "critical": "bg-gray-900",
      "critique": "bg-gray-900",
      "urgent": "bg-gray-900",
      "high": "bg-[#e2445c]",
      "haute": "bg-[#e2445c]",
      "élevée": "bg-[#e2445c]",
      "medium": "bg-[#a25ddc]",
      "moyenne": "bg-[#a25ddc]",
      "low": "bg-[#579bfc]",
      "basse": "bg-[#579bfc]",
      "not started": "bg-[#c4c4c4]"
    };

    if (config.target === "new_board") {
      targetBoardId = crypto.randomUUID();
      
      // Guess column types and create columns
      const newCols = config.headers
        .flatMap((header) => {
          const l = header.toLowerCase();
          if (l === nameKey.toLowerCase()) return [];
          if (l === "group") return [];
          if (l === "sous-éléments" || l === "sous-elements") return [];
          if (l === "item id (auto generated)" || l === "item id") return [];
          
          if (hasPairedTimeline) {
            const normalized = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isStart = normalized.includes("start") && (normalized.includes("timeline") || normalized.includes("duree"));
            const isEnd = normalized.includes("end") && (normalized.includes("timeline") || normalized.includes("duree"));
            
            if (isEnd) return [];
            if (isStart) {
              return [{
                id: crypto.randomUUID(),
                title: "Timeline",
                type: "timeline",
                width: 140,
                settings: {}
              }];
            }
          }

          // Normalize string (remove accents) for easier checking
          const normalizedHeader = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          let type = "text";
          if (normalizedHeader.includes("date") || normalizedHeader.includes("timeline") || normalizedHeader.includes("duree")) type = "date";
          else if (normalizedHeader.includes("status") || normalizedHeader.includes("statut") || normalizedHeader.includes("etat")) type = "status";
          else if (normalizedHeader.includes("priority") || normalizedHeader.includes("priorite")) type = "priority";
          else if (normalizedHeader.includes("tag") || normalizedHeader.includes("etiquette")) type = "tags";
          else if (normalizedHeader.includes("depend") || normalizedHeader.includes("lie a")) type = "dependency";
          else if (normalizedHeader.includes("person") || normalizedHeader.includes("owner") || normalizedHeader.includes("assignee") || normalizedHeader.includes("responsable") || normalizedHeader.includes("attribue")) type = "people";

          let settings: any = {};
          
          if (type === "status" || type === "priority") {
            const uniqueValues = new Set<string>();
            const isFrench = normalizedHeader.includes("statut") || normalizedHeader.includes("etat") || normalizedHeader.includes("priorite");
            
            if (type === "status") {
              if (isFrench) {
                uniqueValues.add("Fait");
                uniqueValues.add("En cours");
                uniqueValues.add("Bloqué");
              } else {
                uniqueValues.add("Done");
                uniqueValues.add("Working on it");
                uniqueValues.add("Stuck");
              }
            } else if (type === "priority") {
              if (isFrench) {
                uniqueValues.add("Critique");
                uniqueValues.add("Élevée");
                uniqueValues.add("Moyenne");
                uniqueValues.add("Basse");
              } else {
                uniqueValues.add("Critical");
                uniqueValues.add("High");
                uniqueValues.add("Medium");
                uniqueValues.add("Low");
              }
            }

            for (const row of config.data) {
              const val = row[header];
              if (val && typeof val === "string" && val.trim() !== "") {
                // Strip the emoji Monday bakes into the value, otherwise
                // "Critical ⚠️" reads as a different label from "Critical"
                const trimmed = cleanLabelValue(val);
                if (!trimmed) continue;
                // Avoid duplicating if case differs slightly from default
                const existing = Array.from(uniqueValues).find(v => v.toLowerCase() === trimmed.toLowerCase());
                if (!existing) uniqueValues.add(trimmed);
              }
            }

            const labels: { label: string, color: string }[] = [];
            let colorIndex = 0;
            uniqueValues.forEach((val) => {
              const lowerVal = cleanLabelValue(val).toLowerCase();
              const mappedColor = STANDARD_COLORS[lowerVal] || LABEL_COLORS[colorIndex % LABEL_COLORS.length];
              labels.push({ label: val, color: mappedColor });
              if (!STANDARD_COLORS[lowerVal]) {
                colorIndex++;
              }
            });
            if (type === "status") {
              labels.push({ label: "Overdue", color: "bg-gradient-to-r from-red-600 to-rose-600" });
            } else {
              labels.push({ label: "Empty", color: "bg-[#c4c4c4]" });
            }

            // Guard against duplicate labels (e.g. mixed-language data colliding
            // with the seeded defaults) — keep the first occurrence so seeded
            // options keep their intended color.
            const seenLabels = new Set<string>();
            const dedupedLabels = labels.filter((l) => {
              const key = cleanLabelValue(l.label).toLowerCase();
              if (seenLabels.has(key)) return false;
              seenLabels.add(key);
              return true;
            });

            // Record what each label MEANS at import time, while the guess is
            // as good as it will ever be. Everything downstream - the overdue
            // rule, the digest, the dashboard - then reads a declared value
            // instead of pattern-matching the words on every evaluation. A
            // label the guess cannot place is left undeclared rather than
            // forced into a bucket.
            const withSemantics = dedupedLabels.map((l) => {
              const semantic = statusSemanticOf(cleanLabelValue(l.label));
              return semantic ? { ...l, semantic } : l;
            });

            if (type === "status") settings = { statusLabels: withSemantics };
            else if (type === "priority") settings = { priorityLabels: dedupedLabels };
          }

          return [{
            id: crypto.randomUUID(),
            title: header,
            type: type,
            width: 140,
            settings: settings
          }];
        });
        


      targetColumns = newCols;

      // Create board
      const { error: boardErr } = await supabase.from("boards").insert({
        id: targetBoardId,
        workspace_id: workspaceId,
        name: config.newBoardName || "Imported Board",
        columns: targetColumns
      });
      if (boardErr) throw boardErr;

      // Create a default group
      defaultGroupId = crypto.randomUUID();
      defaultGroupCreatedHere = true;
      const { error: grpErr } = await supabase.from("groups").insert({
        id: defaultGroupId,
        board_id: targetBoardId,
        title: "Imported Group",
        color: "#579bfc",
        position: 0
      });
      if (grpErr) throw grpErr;

    }

    if (!targetBoardId) throw new Error("No target board determined.");

    // 2. We may need to dynamically create groups if the CSV has a "Group" column
    const createdGroups = new Map<string, string>(); // name -> id
    
    if (config.target === "existing_board") {
      // Pre-fetch all groups to reuse them
      const { data: grps, error: fetchErr } = await supabase.from("groups").select("id, title").eq("board_id", targetBoardId).order("position");
      if (fetchErr) throw fetchErr;
      
      if (grps && grps.length > 0) {
        grps.forEach(g => {
          if (g.title) createdGroups.set(g.title, g.id);
        });
        defaultGroupId = grps[0].id;
      } else {
        // Board is entirely empty! Create a fallback group
        defaultGroupId = crypto.randomUUID();
        defaultGroupCreatedHere = true;
        const { error: newGrpErr } = await supabase.from("groups").insert({
          id: defaultGroupId,
          board_id: targetBoardId,
          title: "Imported Group",
          color: "#579bfc",
          position: 0
        });
        if (newGrpErr) throw newGrpErr;
        createdGroups.set("Imported Group", defaultGroupId);
      }
    }
    
    // 3. Map Data to Items
    const itemsToInsert = [];

    // Monday's own item ID is not imported as a column, but it is the key the
    // updates sheet references, so keep it around to attach updates later.
    const mondayIdKey = config.headers.find(h => {
      const l = h.toLowerCase();
      return l === "item id (auto generated)" || l === "item id";
    });

    for (const row of config.data) {
      // Find "Item Name" or just use the first column
      const name = row[nameKey] || "Untitled Item";

      let itemGroupId = defaultGroupId;
      
      // Handle Grouping
      const groupKey = config.headers.find(h => h.toLowerCase() === "group");
      if (groupKey && row[groupKey]) {
        const groupName = row[groupKey];
        if (createdGroups.has(groupName)) {
          itemGroupId = createdGroups.get(groupName)!;
        } else {
          const newGrpId = crypto.randomUUID();
          // Checked: if this insert fails silently, every item in this group is
          // written with a group_id that does not exist, and the board renders
          // with orphaned rows that belong to no group.
          const { error: groupErr } = await supabase.from("groups").insert({
            id: newGrpId,
            board_id: targetBoardId,
            title: groupName,
            // Padded: toString(16) drops leading zeros, so roughly one colour in
            // sixteen came out as "#abc12" or shorter, which is not a colour at
            // all and rendered the group with none.
            color: "#" + Math.floor(Math.random() * 16777216).toString(16).padStart(6, "0"),
            position: createdGroups.size + 1
          });
          if (groupErr) throw groupErr;
          createdGroups.set(groupName, newGrpId);
          itemGroupId = newGrpId;
        }
      }

      // Map column values
      const columnValues: Record<string, any> = {};
      
      if (hasPairedTimeline) {
        const startHeader = config.headers.find(h => {
          const lower = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return lower.includes("start") && (lower.includes("timeline") || lower.includes("duree"));
        });
        const endHeader = config.headers.find(h => {
          const lower = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return lower.includes("end") && (lower.includes("timeline") || lower.includes("duree"));
        });
        const timelineCol = targetColumns.find(c => c.title === "Timeline" && c.type === "timeline");
        
        if (startHeader && endHeader && timelineCol) {
          const startVal = row[startHeader];
          const endVal = row[endHeader];
          if (startVal || endVal) {
            columnValues[timelineCol.id] = {
              start: toCalendarDate(startVal),
              end: toCalendarDate(endVal)
            };
          }
        }
      }
      
      // Handle mappings for complex types
      const rowDependencies: { colId: string, rawText: string }[] = [];

      for (const header of config.headers) {
        if (header === nameKey || header === groupKey) continue;
        if (hasPairedTimeline) {
          const lower = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if ((lower.includes("start") || lower.includes("end")) && (lower.includes("timeline") || lower.includes("duree"))) continue;
        }
        
        // Find matching column in targetColumns
        const col = targetColumns.find(c => c.title.toLowerCase() === header.toLowerCase());
        const rawValue = row[header];
        
        if (col && rawValue && typeof rawValue === "string") {
          const valStr = rawValue.trim();
          if (!valStr) continue;

          if (col.type === "tags") {
            columnValues[col.id] = valStr.split(",").map(s => s.trim()).filter(Boolean);
          } else if (col.type === "people") {
            const names = valStr.split(",").map(s => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "));
            const matchedIds = names.map(n => userMap[n]).filter(Boolean);
            if (matchedIds.length > 0) {
              columnValues[col.id] = matchedIds;
            }
          } else if (col.type === "dependency") {
            rowDependencies.push({ colId: col.id, rawText: valStr });
            // We temporarily don't put anything in columnValues; we resolve in pass 2
          } else if (col.type === "status" || col.type === "priority") {
            // Must match the label list, which is stored without the emoji
            columnValues[col.id] = cleanLabelValue(valStr);
          } else {
            columnValues[col.id] = rawValue;
          }
        } else if (col && rawValue) {
          columnValues[col.id] = rawValue;
        }
      }

      const mondayId = mondayIdKey && row[mondayIdKey] ? String(row[mondayIdKey]).trim() : "";

      itemsToInsert.push({
        id: crypto.randomUUID(),
        board_id: targetBoardId,
        group_id: itemGroupId,
        name: name,
        column_values: columnValues,
        position: itemsToInsert.length,
        _rawDeps: rowDependencies, // temporary field for pass 2
        _mondayId: mondayId // temporary field for update matching
      });
    }

    // Pass 2: Resolve dependencies
    const itemMap = new Map<string, string>(); // lowercase name -> id
    const mondayIdMap = new Map<string, string>(); // Monday item id -> new item id
    itemsToInsert.forEach(item => {
      itemMap.set(item.name.toLowerCase().trim(), item.id);
      const mid = (item as any)._mondayId;
      if (mid) mondayIdMap.set(mid, item.id);
      delete (item as any)._mondayId;
    });

    const linksToInsert = [];
    
    for (const item of itemsToInsert) {
      const rawDeps = (item as any)._rawDeps;
      delete (item as any)._rawDeps; // clean up

      if (rawDeps && rawDeps.length > 0) {
        for (const dep of rawDeps) {
          const targetNames = dep.rawText.split(",").map((s: string) => s.trim().toLowerCase());
          const targetIds = targetNames.map((n: string) => itemMap.get(n)).filter(Boolean) as string[];
          
          if (targetIds.length > 0) {
            item.column_values[dep.colId] = targetIds;
            
            for (const targetId of targetIds) {
              linksToInsert.push({
                source_item_id: targetId,
                target_item_id: item.id,
                link_type: "dependency"
              });
            }
          }
        }
      }
    }

    // 4. Batch Insert Items
    const CHUNK_SIZE = 500;
    for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
      const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);
      const { error: insertItemsErr } = await supabase.from("items").insert(chunk);
      if (insertItemsErr) throw insertItemsErr;
    }

    // 4.5 Batch Insert Links
    if (linksToInsert.length > 0) {
      for (let i = 0; i < linksToInsert.length; i += CHUNK_SIZE) {
        const chunk = linksToInsert.slice(i, i + CHUNK_SIZE);
        const { error: insertLinksErr } = await supabase.from("item_links").insert(chunk);
        if (insertLinksErr) throw insertLinksErr;
      }
    }

    // 4.6 Import item updates from Monday's "updates" sheet
    if (config.updates && config.updates.length > 0) {
      await importUpdates(config.updates, mondayIdMap, userMap);
    }

    // 5. Cleanup empty default group
    //
    // Only ever a group this run created. On an existing board defaultGroupId is
    // the board's own first group (grps[0]), and a CSV carrying a "Group" column
    // routes every row to a named group - so this condition was true on an
    // ordinary import and deleted a group the user already had, taking its
    // items with it.
    if (defaultGroupId && defaultGroupCreatedHere) {
      const hasItemsInDefaultGroup = itemsToInsert.some(item => item.group_id === defaultGroupId);
      if (!hasItemsInDefaultGroup) {
        await supabase.from("groups").delete().eq("id", defaultGroupId);
      }
    }

    return targetBoardId;
  } catch (error) {
    console.error("Import failed:", error);
    throw error;
  }
}
