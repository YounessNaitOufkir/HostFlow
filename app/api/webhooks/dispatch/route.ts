import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();

    // Fetch global webhooks (board_id IS NULL)
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('endpoint_url')
      .is('board_id', null);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
    }

    if (!webhooks || webhooks.length === 0) {
      return NextResponse.json({ success: true, dispatched: 0 });
    }

    // Format message for Telegram bot
    const message = `[HostFlow Update] ${payload.event}\nTask: ${payload.task.name || payload.task.title || 'Unknown Task'}`;

    // Dispatch to all webhooks
    let successCount = 0;
    for (const hook of webhooks) {
      try {
        // Extract chat_id from the endpoint_url if provided (e.g. ?chat_id=12345)
        let chatId = 'default';
        try {
          const url = new URL(hook.endpoint_url);
          if (url.searchParams.has('chat_id')) {
            chatId = url.searchParams.get('chat_id') as string;
          }
        } catch (e) {}

        await fetch(hook.endpoint_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            chat_id: chatId
          }),
        });
        successCount++;
      } catch (err) {
        console.error('Failed to dispatch webhook to', hook.endpoint_url, err);
      }
    }

    return NextResponse.json({ success: true, dispatched: successCount });
  } catch (err: any) {
    console.error('Webhook Dispatch Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
