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

    // Fetch user's webhooks
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('target_url')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
    }

    if (!webhooks || webhooks.length === 0) {
      return NextResponse.json({ success: true, dispatched: 0 });
    }

    // Format message for Telegram bot
    const message = `[HostFlow Update] ${payload.event}\nTask: ${payload.task.title}`;

    // Dispatch to all webhooks
    let successCount = 0;
    for (const hook of webhooks) {
      try {
        await fetch(hook.target_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            // The bot expects a chat_id. Let's let the bot handle broadcasting to all its users
            // if chat_id is missing, but for now we can just provide a dummy or empty.
            chat_id: 'default'
          }),
        });
        successCount++;
      } catch (err) {
        console.error('Failed to dispatch webhook to', hook.target_url, err);
      }
    }

    return NextResponse.json({ success: true, dispatched: successCount });
  } catch (err: any) {
    console.error('Webhook Dispatch Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
