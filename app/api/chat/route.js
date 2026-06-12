import { isAuthed } from '../../../lib/auth';

export const maxDuration = 120; // Render 무료 슬립 콜드스타트(30-60초) + 생성 시간 대비

export async function POST(request) {
  if (!isAuthed(request)) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { messages, model } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages) || !messages.length) {
    return Response.json({ error: 'messages가 필요합니다.' }, { status: 400 });
  }

  const upstream = await fetch(`${process.env.GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.GATEWAY_API_KEY || '',
    },
    body: JSON.stringify({ model: model || 'auto', messages, stream: true }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return Response.json({ error: `게이트웨이 오류 (HTTP ${upstream.status})`, detail: text.slice(0, 300) }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
