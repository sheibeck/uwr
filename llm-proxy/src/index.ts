import { Hono } from 'hono';
import { cors } from 'hono/cors';
import OpenAI from 'openai';

type Bindings = {
  OPENAI_API_KEY: string;
  PROXY_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Auth middleware
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${c.env.PROXY_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// Health check
app.get('/', (c) => c.json({ status: 'ok' }));

// LLM endpoint
app.post('/api/llm', async (c) => {
  const body = await c.req.json<{
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    response_format?: { type: string; json_schema?: any };
  }>();

  const { model, systemPrompt, userPrompt, response_format } = body;

  if (!model || !systemPrompt || !userPrompt) {
    return c.json({ ok: false, error: 'Missing required fields: model, systemPrompt, userPrompt' }, 400);
  }

  const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });

  try {
    const createParams: any = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (response_format) {
      createParams.response_format = response_format;
    }
    const completion = await openai.chat.completions.create(createParams);

    const text = completion.choices?.[0]?.message?.content ?? '';
    const usage = completion.usage;

    return c.json({
      ok: true,
      text,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    });
  } catch (err: any) {
    console.error('OpenAI API error:', err?.message ?? err);
    return c.json({
      ok: false,
      error: err?.message ?? 'OpenAI API call failed',
    }, 502);
  }
});

export default app;
