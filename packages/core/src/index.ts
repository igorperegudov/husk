/**
 * `@elisymlabs/husk-core` - the HUSK kernel runtime.
 *
 * Load a folder of agent skills, invoke their kernels with a uniform I/O
 * contract, and serve them over HTTP with a Web-standard fetch handler.
 */

export type {
  HttpMethod,
  InvokeInput,
  InvokeOptions,
  InvokeResult,
  LlmSpec,
  OutputFile,
  ProxySpec,
  Skill,
  SkillInputKind,
  SkillManifest,
  SkillMode,
  SkillOutputKind,
  SkillTool,
  StreamEvent,
} from './types';

export {
  ManifestError,
  parseFrontmatter,
  parseManifest,
  toSlug,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_ROUNDS,
} from './manifest';
export { loadSkill, loadSkills, type LoadOptions, type LoadResult } from './loader';
export { invokeSkill, kernelErrorMessage } from './invoke';
export { runLlm, resolveLlm, buildToolArgs, LlmError, type RunLlmOptions } from './llm';
export { proxyRequest, ProxyError, type ProxyInit } from './proxy';
export {
  runProcess,
  DEFAULT_TIMEOUT_MS,
  MAX_PROCESS_OUTPUT,
  type RunOptions,
  type RunResult,
} from './executor';
export { mimeFromPath } from './mime';
export { generateOpenApi, type OpenApiDocument, type OpenApiOptions } from './openapi';
export {
  createFetchHandler,
  toCard,
  type FetchHandler,
  type HuskServerOptions,
  type SkillCard,
} from './server';
