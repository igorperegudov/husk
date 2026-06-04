import { runProcess } from './executor';
import type { LlmSpec, SkillTool } from './types';

/** Thrown when an LLM skill cannot run (missing key, API error, round limit). */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

type ProviderKind = 'anthropic' | 'openai';

interface ProviderInfo {
  kind: ProviderKind;
  envVar: string;
  defaultModel: string;
  url: string;
}

/**
 * Built-in providers. `anthropic` speaks the Messages API; the rest speak the
 * OpenAI chat-completions API (same shape, different base URL and model).
 */
const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: {
    kind: 'anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-4-5-20251001',
    url: 'https://api.anthropic.com/v1/messages',
  },
  openai: {
    kind: 'openai',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    url: 'https://api.openai.com/v1/chat/completions',
  },
  xai: {
    kind: 'openai',
    envVar: 'XAI_API_KEY',
    defaultModel: 'grok-3',
    url: 'https://api.x.ai/v1/chat/completions',
  },
  google: {
    kind: 'openai',
    envVar: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
  deepseek: {
    kind: 'openai',
    envVar: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    url: 'https://api.deepseek.com/chat/completions',
  },
};

/** Provider env vars hidden from tool subprocesses so scripts can't read keys. */
const SECRET_ENV_VARS = Object.values(PROVIDERS).map((p) => p.envVar);

interface ResolvedLlm {
  kind: ProviderKind;
  url: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

/** Resolve provider config and API key, or throw {@link LlmError}. */
export function resolveLlm(spec: LlmSpec, env: NodeJS.ProcessEnv): ResolvedLlm {
  const provider = PROVIDERS[spec.provider];
  if (!provider) {
    throw new LlmError(
      `unknown LLM provider "${spec.provider}" (known: ${Object.keys(PROVIDERS).join(', ')})`,
    );
  }
  const apiKey = env[provider.envVar];
  if (!apiKey) {
    throw new LlmError(`${provider.envVar} is not set (required for this skill's mode: llm)`);
  }
  return {
    kind: provider.kind,
    url: provider.url,
    apiKey,
    model: spec.model ?? provider.defaultModel,
    maxTokens: spec.maxTokens,
  };
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type Completion =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; calls: ToolCall[]; assistantMessage: unknown };

interface ToolResult {
  callId: string;
  content: string;
}

const RETRYABLE = new Set([429, 500, 502, 503, 529]);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new LlmError('aborted'));
      },
      { once: true },
    );
  });
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await delay(250 * attempt, signal);
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (res.ok) {
      return res.json();
    }
    const text = await res.text().catch(() => '');
    lastError = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    if (!RETRYABLE.has(res.status)) {
      break;
    }
  }
  throw new LlmError(`LLM request failed - ${lastError}`);
}

// --- Anthropic (Messages API) ---------------------------------------------

function anthropicTools(tools: SkillTool[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        tool.parameters.map((p) => [p.name, { type: 'string', description: p.description }]),
      ),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
    },
  }));
}

async function anthropicComplete(
  cfg: ResolvedLlm,
  system: string,
  messages: unknown[],
  tools: SkillTool[],
  signal?: AbortSignal,
): Promise<Completion> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system,
    messages,
  };
  if (tools.length > 0) {
    body.tools = anthropicTools(tools);
  }
  const data = (await postJson(
    cfg.url,
    { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body,
    signal,
  )) as {
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  };

  const content = data.content ?? [];
  const toolUses = content.filter((b) => b.type === 'tool_use');
  if (toolUses.length > 0) {
    return {
      type: 'tool_use',
      calls: toolUses.map((b) => ({
        id: b.id ?? '',
        name: b.name ?? '',
        arguments: (b.input as Record<string, unknown>) ?? {},
      })),
      assistantMessage: { role: 'assistant', content },
    };
  }
  const text = content.find((b) => b.type === 'text')?.text ?? '';
  return { type: 'text', text };
}

function anthropicToolResults(results: ToolResult[]): unknown[] {
  return [
    {
      role: 'user',
      content: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.callId,
        content: r.content,
      })),
    },
  ];
}

// --- OpenAI-compatible (chat completions) ----------------------------------

function openaiTools(tools: SkillTool[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          tool.parameters.map((p) => [p.name, { type: 'string', description: p.description }]),
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  }));
}

async function openaiComplete(
  cfg: ResolvedLlm,
  system: string,
  messages: unknown[],
  tools: SkillTool[],
  signal?: AbortSignal,
): Promise<Completion> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
  };
  if (tools.length > 0) {
    body.tools = openaiTools(tools);
    body.tool_choice = 'auto';
  }
  const data = (await postJson(
    cfg.url,
    { authorization: `Bearer ${cfg.apiKey}` },
    body,
    signal,
  )) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };

  const message = data.choices?.[0]?.message;
  const toolCalls = message?.tool_calls ?? [];
  if (toolCalls.length > 0) {
    return {
      type: 'tool_use',
      calls: toolCalls.map((c) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }
        return { id: c.id, name: c.function.name, arguments: args };
      }),
      assistantMessage: message,
    };
  }
  return { type: 'text', text: message?.content ?? '' };
}

function openaiToolResults(results: ToolResult[]): unknown[] {
  return results.map((r) => ({ role: 'tool', tool_call_id: r.callId, content: r.content }));
}

// --- Tool execution --------------------------------------------------------

function scopedToolEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of SECRET_ENV_VARS) {
    delete env[key];
  }
  return env;
}

/**
 * Map an LLM tool call to a command argv. The first `required` parameter is a
 * positional argument; the rest are `--name value`. No value may begin with `-`
 * (so an LLM-supplied argument can never be parsed as a flag). Mirrors elisym.
 */
export function buildToolArgs(
  tool: SkillTool,
  args: Record<string, unknown>,
): { cmd: string; argv: string[] } | { error: string } {
  const command = [...tool.command];
  const cmd = command.shift();
  if (!cmd) {
    return { error: `tool "${tool.name}" has an empty command` };
  }
  const argv = command;
  for (let index = 0; index < tool.parameters.length; index++) {
    const param = tool.parameters[index];
    const value = args[param.name];
    if (value === undefined) {
      continue;
    }
    const stringValue = String(value);
    if (stringValue.startsWith('-')) {
      return { error: `tool "${tool.name}" argument "${param.name}" must not begin with "-"` };
    }
    if (param.required && index === 0) {
      argv.push(stringValue);
    } else {
      argv.push(`--${param.name}`, stringValue);
    }
  }
  return { cmd, argv };
}

async function runTool(
  tool: SkillTool,
  call: ToolCall,
  skillDir: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const built = buildToolArgs(tool, call.arguments);
  if ('error' in built) {
    return `Error: ${built.error}`;
  }
  const result = await runProcess(built.cmd, built.argv, {
    cwd: skillDir,
    signal,
    timeoutMs,
    env: scopedToolEnv(),
  });
  if (result.spawnError) {
    return `Error: ${result.spawnError.message}`;
  }
  if (result.code === 0) {
    return result.stdout.trim();
  }
  return `Error (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`;
}

export interface RunLlmOptions {
  spec: LlmSpec;
  /** System prompt (the SKILL.md body). */
  systemPrompt: string;
  /** The user's request text. */
  userInput: string;
  /** Skill directory - the cwd for tool scripts. */
  skillDir: string;
  /** Per-tool execution timeout. */
  toolTimeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run a `mode: llm` skill: the model answers using the system prompt and may
 * call the declared tools in a loop until it produces a final text answer.
 */
export async function runLlm(options: RunLlmOptions): Promise<string> {
  const cfg = resolveLlm(options.spec, options.env ?? process.env);
  const { tools } = options.spec;
  const complete = cfg.kind === 'anthropic' ? anthropicComplete : openaiComplete;
  const formatResults = cfg.kind === 'anthropic' ? anthropicToolResults : openaiToolResults;

  const messages: unknown[] = [{ role: 'user', content: options.userInput }];

  if (tools.length === 0) {
    const result = await complete(cfg, options.systemPrompt, messages, [], options.signal);
    return result.type === 'text' ? result.text : '';
  }

  for (let round = 0; round < options.spec.maxToolRounds; round++) {
    if (options.signal?.aborted) {
      throw new LlmError('aborted');
    }
    const result = await complete(cfg, options.systemPrompt, messages, tools, options.signal);
    if (result.type === 'text') {
      return result.text;
    }
    messages.push(result.assistantMessage);

    const toolResults: ToolResult[] = [];
    for (const call of result.calls) {
      const tool = tools.find((t) => t.name === call.name);
      const content = tool
        ? await runTool(tool, call, options.skillDir, options.toolTimeoutMs, options.signal)
        : `Error: unknown tool "${call.name}"`;
      toolResults.push({ callId: call.id, content });
    }
    messages.push(...formatResults(toolResults));
  }

  throw new LlmError(`max tool rounds (${options.spec.maxToolRounds}) exceeded`);
}
