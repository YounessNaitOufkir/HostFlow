import { NextResponse } from 'next/server';
import { checkOutboundUrl } from '@/lib/ssrf';

/** A webhook receiver gets five seconds; the dispatcher is not a queue. */
const WEBHOOK_TIMEOUT_MS = 5000;
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

    // Dispatched together and each one bounded.
    //
    // These awaited in turn with no timeout, so a single endpoint that accepted
    // the connection and then never answered held this handler open until the
    // platform killed it - and every webhook queued behind it was never sent at
    // all. A slow endpoint now costs itself and nothing else.
    const results = await Promise.allSettled(
      webhooks.map(async (hook) => {
        // The endpoint is a URL somebody typed into a form and the server then
        // fetches, which is SSRF by construction: the same field that reaches
        // Slack also reaches the cloud metadata service or anything else on the
        // private network this runs inside. Refused before the request is made,
        // and refused by RESOLVED address, so a public name pointing at
        // 127.0.0.1 does not get through either.
        const verdict = await checkOutboundUrl(hook.endpoint_url);
        if (!verdict.ok) {
          throw new Error(`refused ${hook.endpoint_url}: ${verdict.reason}`);
        }

        // Extract chat_id from the endpoint_url if provided (e.g. ?chat_id=12345)
        let chatId = 'default';
        try {
          const url = new URL(hook.endpoint_url);
          if (url.searchParams.has('chat_id')) {
            chatId = url.searchParams.get('chat_id') as string;
          }
        } catch (e) {}

        const res = await fetch(hook.endpoint_url, {
          method: 'POST',
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            chat_id: chatId
          }),
        });

        // A refusal is a failure. The old count incremented on any response the
        // fetch did not throw on, so a wall of 500s reported as fully dispatched.
        if (!res.ok) {
          throw new Error(`${hook.endpoint_url} responded ${res.status}`);
        }
      })
    );

    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    for (const r of results) {
      if (r.status === 'rejected') console.error('Failed to dispatch webhook:', r.reason);
    }

    return NextResponse.json({
      success: true,
      dispatched: successCount,
      failed: results.length - successCount,
    });
  } catch (err: any) {
    console.error('Webhook Dispatch Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
