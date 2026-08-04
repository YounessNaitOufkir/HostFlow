import { supabase } from "./supabase";
import { ImportConfig } from "@/components/ImportModal";

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

    // 1. If target is new_board, create the board and columns first
    if (config.target === "new_board") {
      targetBoardId = crypto.randomUUID();
      
      // Guess column types and create columns
      const newCols = config.headers
        .filter(header => header.toLowerCase() !== "item name" && header.toLowerCase() !== "group")
        .map((header) => {
          // simple inference
          let type = "text";
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes("date")) type = "date";
          else if (lowerHeader.includes("status")) type = "status";
          else if (lowerHeader.includes("priority")) type = "priority";
          else if (lowerHeader.includes("person") || lowerHeader.includes("owner") || lowerHeader.includes("assignee")) type = "people";

          return {
            id: crypto.randomUUID(),
            title: header,
            type: type,
            width: 140,
            settings: {}
          };
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
      const { error: grpErr } = await supabase.from("groups").insert({
        id: defaultGroupId,
        board_id: targetBoardId,
        title: "Imported Group",
        color: "#579bfc",
        position: 0
      });
      if (grpErr) throw grpErr;


    } else {
      // If existing board, we need its first group to fallback to
      const { data: grps } = await supabase.from("groups").select("id").eq("board_id", targetBoardId).order("position").limit(1);
      if (grps && grps.length > 0) {
        defaultGroupId = grps[0].id;
      }
    }

    if (!targetBoardId) throw new Error("No target board determined.");

    // 2. We may need to dynamically create groups if the CSV has a "Group" column
    const createdGroups = new Map<string, string>(); // name -> id
    
    // 3. Map Data to Items
    const itemsToInsert = [];
    
    for (const row of config.data) {
      // Find "Item Name" or just use the first column
      const nameKey = config.headers.find(h => h.toLowerCase() === "item name") || config.headers[0];
      const name = row[nameKey] || "Untitled Item";

      let itemGroupId = defaultGroupId;
      
      // Handle Grouping
      const groupKey = config.headers.find(h => h.toLowerCase() === "group");
      if (groupKey && row[groupKey]) {
        const groupName = row[groupKey];
        if (createdGroups.has(groupName)) {
          itemGroupId = createdGroups.get(groupName)!;
        } else {
          // If we are in existing_board, we might want to lookup existing groups first, but for simplicity we just create it if we haven't mapped it.
          // Let's check if it exists in DB (optimally we'd pre-fetch all groups for the board)
          const newGrpId = crypto.randomUUID();
          await supabase.from("groups").insert({
            id: newGrpId,
            board_id: targetBoardId,
            title: groupName,
            color: "#" + Math.floor(Math.random()*16777215).toString(16),
            position: createdGroups.size + 1
          });
          createdGroups.set(groupName, newGrpId);
          itemGroupId = newGrpId;
        }
      }

      // Map column values
      const columnValues: Record<string, any> = {};
      
      for (const header of config.headers) {
        if (header === nameKey || header === groupKey) continue;
        
        // Find matching column in targetColumns
        const col = targetColumns.find(c => c.title.toLowerCase() === header.toLowerCase());
        if (col && row[header]) {
          columnValues[col.id] = row[header];
        }
      }

      itemsToInsert.push({
        id: crypto.randomUUID(),
        board_id: targetBoardId,
        group_id: itemGroupId,
        name: name,
        column_values: columnValues,
        position: itemsToInsert.length
      });
    }

    // 4. Batch Insert Items
    const CHUNK_SIZE = 500;
    for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
      const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);
      const { error: insertItemsErr } = await supabase.from("items").insert(chunk);
      if (insertItemsErr) throw insertItemsErr;
    }

    return targetBoardId;
  } catch (error) {
    console.error("Import failed:", error);
    throw error;
  }
}
