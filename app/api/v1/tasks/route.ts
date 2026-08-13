import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// POST /api/v1/tasks
// Creates a new task via API
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.split(' ')[1];

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

    // Default to the first available board if not specified (for simplified bots)
    let finalBoardId = board_id;
    if (!finalBoardId) {
      const { data: boards } = await supabaseAdmin.from('boards').select('id').limit(1);
      if (boards && boards.length > 0) {
        finalBoardId = boards[0].id;
      } else {
        return NextResponse.json({ error: 'No boards available to insert task into' }, { status: 400 });
      }
    }

    // Default to the first group in that board if not specified
    let finalGroupId = group_id;
    if (!finalGroupId) {
      const { data: groups } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('board_id', finalBoardId)
        .limit(1);
      
      if (groups && groups.length > 0) {
        finalGroupId = groups[0].id;
      } else {
        return NextResponse.json({ error: 'No groups available in the specified board' }, { status: 400 });
      }
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
