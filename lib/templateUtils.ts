import { supabase } from "./supabase";
import { Board, Group, Column, Item, ItemLink, Automation } from "@/types";

/**
 * Duplicates an entire board, including groups, columns, items, item_links, and automations.
 * @param boardId The ID of the board to duplicate
 * @param targetWorkspaceId The ID of the workspace where the duplicated board should be placed
 * @param newName Optional new name for the board (e.g. "Board Name (Copy)")
 * @returns The newly created board object
 */
export async function duplicateBoard(boardId: string, targetWorkspaceId: string, newName?: string): Promise<Board | null> {
  try {
    // 1. Fetch Board
    const { data: originalBoard, error: boardError } = await supabase
      .from("boards")
      .select("*")
      .eq("id", boardId)
      .single();
    if (boardError) throw boardError;

    // 2. Fetch all dependent data
    const [
      { data: groups, error: groupsError },
      { data: items, error: itemsError },
      { data: automations, error: automationsError }
    ] = await Promise.all([
      supabase.from("groups").select("*").eq("board_id", boardId).order("position", { ascending: true }),
      supabase.from("items").select("*").eq("board_id", boardId),
      supabase.from("automations").select("*").eq("board_id", boardId)
    ]);

    if (groupsError) throw groupsError;
    if (itemsError) throw itemsError;
    if (automationsError) throw automationsError;

    const columns = originalBoard.columns || [];

    let itemLinks: any[] = [];
    if (items && items.length > 0) {
      // Chunking or just using .in() - to avoid URI Too Long we could chunk, but for templates it's usually fine
      const itemIds = items.map((i: any) => i.id);
      
      // Fetch links where source is in our items list
      const { data: links, error: linksError } = await supabase
        .from("item_links")
        .select("*")
        .in("source_item_id", itemIds);
        
      if (linksError) throw linksError;
      itemLinks = links || [];
    }

    // 3. Create new Board
    const newBoardName = newName || `${originalBoard.name} (Copy)`;
    const newBoardId = crypto.randomUUID();

    // 4. Create new Columns and build ID map
    const columnIdMap = new Map<string, string>(); // old -> new
    const newColumnsData = columns.map((col: Column) => {
      const newColId = crypto.randomUUID();
      columnIdMap.set(col.id, newColId);
      return {
        ...col,
        id: newColId,
        board_id: newBoardId,
      };
    });

    const { error: newBoardError } = await supabase.from("boards").insert({
      id: newBoardId,
      workspace_id: targetWorkspaceId,
      name: newBoardName,
      description: originalBoard.description,
      icon: originalBoard.icon,
      columns: newColumnsData
    });
    if (newBoardError) throw newBoardError;

    // 5. Create new Groups and build ID map
    const groupIdMap = new Map<string, string>(); // old -> new
    const newGroupsData = (groups || []).map((grp: Group) => {
      const newGrpId = crypto.randomUUID();
      groupIdMap.set(grp.id, newGrpId);
      const { created_at, updated_at, ...restGrp } = grp as any;
      return {
        ...restGrp,
        id: newGrpId,
        board_id: newBoardId,
      };
    });
    // A board can hold items while holding no group - an import that failed
    // part-way leaves exactly that. Without somewhere to put them, every item
    // below resolved to group_id undefined, the insert failed the NOT NULL, and
    // the duplicate came out as a board with no items at all. One fallback group
    // keeps the work.
    if (newGroupsData.length === 0 && (items || []).length > 0) {
      newGroupsData.push({
        id: crypto.randomUUID(),
        board_id: newBoardId,
        title: "Imported Group",
        color: "#579bfc",
        position: 0,
      });
    }

    if (newGroupsData.length > 0) {
      const { error: insertGroupsErr } = await supabase.from("groups").insert(newGroupsData);
      if (insertGroupsErr) throw insertGroupsErr;
    }

    // 6. Create new Items and map column_values keys
    const itemIdMap = new Map<string, string>(); // old -> new
    const newItemsData = (items || []).map((item: Item) => {
      const newItemId = crypto.randomUUID();
      itemIdMap.set(item.id, newItemId);
      
      const newGroupId = groupIdMap.get(item.group_id) || newGroupsData[0]?.id; // fallback to first group if somehow orphaned
      
      // Remap column_values
      const newColumnValues: Record<string, any> = {};
      if (item.column_values) {
        Object.keys(item.column_values).forEach((oldColId) => {
          const newColId = columnIdMap.get(oldColId);
          if (newColId) {
            newColumnValues[newColId] = item.column_values[oldColId];
          }
        });
      }

      const { created_at, updated_at, ...restItem } = item as any;
      return {
        ...restItem,
        id: newItemId,
        board_id: newBoardId,
        group_id: newGroupId,
        column_values: newColumnValues,
      };
    });

    // Batch insert items
    const CHUNK_SIZE = 500;
    for (let i = 0; i < newItemsData.length; i += CHUNK_SIZE) {
      const chunk = newItemsData.slice(i, i + CHUNK_SIZE);
      const { error: insertItemsErr } = await supabase.from("items").insert(chunk);
      if (insertItemsErr) throw insertItemsErr;
    }

    // 7. Duplicate Automations
    const newAutomationsData = (automations || []).map((auto: Automation) => {
      let newTriggerColId = auto.trigger_column_id;
      if (auto.trigger_column_id && columnIdMap.has(auto.trigger_column_id)) {
        newTriggerColId = columnIdMap.get(auto.trigger_column_id)!;
      }

      let newPayload = auto.action_payload ? { ...auto.action_payload } : {};
      if (newPayload.groupId && groupIdMap.has(newPayload.groupId)) {
        newPayload.groupId = groupIdMap.get(newPayload.groupId);
      }
      if (newPayload.columnId && columnIdMap.has(newPayload.columnId)) {
        newPayload.columnId = columnIdMap.get(newPayload.columnId);
      }

      return {
        board_id: newBoardId,
        trigger_column_id: newTriggerColId,
        trigger_value: auto.trigger_value,
        action_type: auto.action_type,
        action_target_id: auto.action_target_id,
        action_payload: newPayload
      };
    });
    if (newAutomationsData.length > 0) {
      const { error: insertAutoErr } = await supabase.from("automations").insert(newAutomationsData);
      if (insertAutoErr) throw insertAutoErr;
    }

    // 8. Duplicate Item Links (Dependencies)
    const newLinksData = (itemLinks || []).filter((link: ItemLink) => 
      itemIdMap.has(link.source_item_id) && itemIdMap.has(link.target_item_id)
    ).map((link: ItemLink) => {
      return {
        id: crypto.randomUUID(),
        source_item_id: itemIdMap.get(link.source_item_id)!,
        target_item_id: itemIdMap.get(link.target_item_id)!,
        link_type: link.link_type
      };
    });
    if (newLinksData.length > 0) {
      const { error: insertLinksErr } = await supabase.from("item_links").insert(newLinksData);
      if (insertLinksErr) throw insertLinksErr;
    }

    // 9. Fetch and return the newly created board
    const { data: newBoard } = await supabase.from("boards").select("*").eq("id", newBoardId).single();
    return newBoard as Board;
  } catch (error: any) {
    console.error("Error duplicating board detailed:", JSON.stringify(error, null, 2), error.message);
    throw new Error(error.message || JSON.stringify(error));
  }
}

/**
 * Duplicates a workspace and all of its boards.
 * @param workspaceId The ID of the workspace to duplicate
 * @param newName Optional new name for the workspace
 */
export async function duplicateWorkspace(workspaceId: string, newName?: string) {
  try {
    const { data: originalWorkspace, error: wsError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();
    if (wsError) throw wsError;

    const newWorkspaceId = crypto.randomUUID();
    const newWorkspaceName = newName || `${originalWorkspace.name} (Copy)`;

    const { error: newWsError } = await supabase.from("workspaces").insert({
      id: newWorkspaceId,
      name: newWorkspaceName,
      icon: originalWorkspace.icon,
      is_private: originalWorkspace.is_private,
    });
    if (newWsError) throw newWsError;

    const { data: boards } = await supabase.from("boards").select("id").eq("workspace_id", workspaceId);
    
    if (boards && boards.length > 0) {
      for (const board of boards) {
        await duplicateBoard(board.id, newWorkspaceId, undefined);
      }
    }

    const { data: newWorkspace } = await supabase.from("workspaces").select("*").eq("id", newWorkspaceId).single();
    return newWorkspace;
  } catch (error: any) {
    console.error("Error duplicating workspace:", error);
    throw new Error(error.message || JSON.stringify(error));
  }
}
