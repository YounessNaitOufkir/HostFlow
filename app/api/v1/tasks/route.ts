import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// POST /api/v1/tasks
// Creates a new task via API
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.split(' ')[1];
    const supabaseAdmin = getSupabaseAdmin();

    // Validate API Key
    const { data: keyData, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('user_id')
      .eq('key', apiKey)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
    }

    const body = await request.json();
    const { task_name, board_id, group_id } = body;

    if (!task_name) {
      return NextResponse.json({ error: 'task_name is required' }, { status: 400 });
    }

    // This client is service-role, so RLS will not scope anything for us. The key
    // identifies a user and the task must land somewhere that user can actually
    // reach — otherwise any valid key writes into any board, private ones included.
    const { data: reachableBoards, error: reachError } = await supabaseAdmin
      .rpc('boards_for_user', { u_id: keyData.user_id });

    if (reachError) {
      console.error('Error resolving reachable boards:', reachError);
      return NextResponse.json({ error: 'Failed to resolve boards' }, { status: 500 });
    }

    const allowedIds = new Set((reachableBoards ?? []).map((b: { id: string }) => b.id));

    if (allowedIds.size === 0) {
      return NextResponse.json({ error: 'No boards available to insert task into' }, { status: 400 });
    }

    let finalBoardId = board_id;
    if (finalBoardId) {
      if (!allowedIds.has(finalBoardId)) {
        return NextResponse.json({ error: 'Board not found' }, { status: 403 });
      }
    } else {
      // Default to the first reachable board (for simplified bots)
      finalBoardId = (reachableBoards as { id: string }[])[0].id;
    }

    // Default to the first group in that board if not specified
    let finalGroupId = group_id;
    const { data: groups } = await supabaseAdmin
      .from('groups')
      .select('id')
      .eq('board_id', finalBoardId);

    const groupIds = new Set((groups ?? []).map((g) => g.id));

    if (finalGroupId) {
      // A group from another board would smuggle the task out of the allowed board.
      if (!groupIds.has(finalGroupId)) {
        return NextResponse.json({ error: 'Group not found in the specified board' }, { status: 403 });
      }
    } else {
      if (!groups || groups.length === 0) {
        return NextResponse.json({ error: 'No groups available in the specified board' }, { status: 400 });
      }
      finalGroupId = groups[0].id;
    }

    // Insert task
    const { data: itemData, error: itemError } = await supabaseAdmin
      .from('items')
      .insert({
        title: task_name,
        board_id: finalBoardId,
        group_id: finalGroupId,
      })
      .select()
      .single();

    if (itemError) {
      console.error('Error inserting item:', itemError);
      return NextResponse.json({ error: 'Failed to insert task' }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: itemData }, { status: 200 });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
