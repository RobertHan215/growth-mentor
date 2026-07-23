/**
 * Shared model resolution utilities for API routes.
 *
 * Extracts the repeated parseModelString → resolveApiKey → resolveBaseUrl →
 * resolveProxy → getModel boilerplate into a single call.
 */

import type { NextRequest } from 'next/server';
import { getModel, parseModelString, type ModelWithInfo } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { getDefaultProviderConfig } from '@/lib/server/default-provider-config';

export interface ResolvedModel extends ModelWithInfo {
  /** Original model string (e.g. "openai/gpt-4o-mini") */
  modelString: string;
  /** Effective API key after server-side fallback resolution */
  apiKey: string;
}

/**
 * When FORCE_SERVER_CONFIG=true, the server-side configuration (.env / YAML)
 * always takes priority. Client-supplied apiKey and baseUrl are ignored entirely.
 * Useful for managed / shared deployments where the admin controls all keys.
 */
const FORCE_SERVER_CONFIG = process.env.FORCE_SERVER_CONFIG === 'true';

/**
 * Resolve a language model from explicit parameters.
 *
 * Use this when model config comes from the request body.
 */
export function resolveModel(params: {
  modelString?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  requiresApiKey?: boolean;
}): ResolvedModel {
  // Guard against empty/invalid model strings like ":" or "openai:"
  const rawModelString = params.modelString;
  const isValidModelString =
    rawModelString && rawModelString !== ':' && !rawModelString.endsWith(':');
  const modelString = isValidModelString
    ? rawModelString
    : process.env.DEFAULT_MODEL || 'qwen:qwen3.7-plus';
  const { providerId, modelId } = parseModelString(modelString);

  // In FORCE_SERVER_CONFIG mode, completely ignore what the client sends for
  // apiKey and baseUrl — always use the server-side configuration.
  const clientApiKey = FORCE_SERVER_CONFIG ? '' : params.apiKey || '';
  const clientBaseUrl = FORCE_SERVER_CONFIG ? undefined : params.baseUrl || undefined;

  if (clientBaseUrl && process.env.NODE_ENV === 'production') {
    const ssrfError = validateUrlForSSRF(clientBaseUrl);
    if (ssrfError) {
      throw new Error(ssrfError);
    }
  }

  // resolveApiKey falls back to server key when clientApiKey is empty.
  const apiKey = resolveApiKey(providerId, clientApiKey);
  const baseUrl = clientBaseUrl ? clientBaseUrl : resolveBaseUrl(providerId, params.baseUrl);
  const proxy = resolveProxy(providerId);
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey,
    baseUrl,
    proxy,
    providerType: params.providerType as 'openai' | 'anthropic' | 'google' | undefined,
    requiresApiKey: params.requiresApiKey,
  });

  return { model, modelInfo, modelString, apiKey };
}

/**
 * Async variant that can fall back to database-backed defaults from system_configs.
 *
 * Client config is only honored when useClientConfig is true. This keeps the
 * managed default path deterministic while still allowing an explicit frontend
 * override from Settings.
 */
export async function resolveModelWithDefaults(params: {
  modelString?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  requiresApiKey?: boolean;
  useClientConfig?: boolean;
  useModelString?: boolean;
}): Promise<ResolvedModel> {
  const defaults = await getDefaultProviderConfig();
  const allowClientConfig = params.useClientConfig === true && !FORCE_SERVER_CONFIG;
  const defaultModelString = defaults.llm
    ? `${defaults.llm.providerId}:${defaults.llm.modelId}`
    : undefined;

  const rawModelString =
    allowClientConfig || params.useModelString === true ? params.modelString : undefined;
  const isValidModelString =
    rawModelString && rawModelString !== ':' && !rawModelString.endsWith(':');
  const modelString = isValidModelString
    ? rawModelString
    : defaultModelString || process.env.DEFAULT_MODEL || 'qwen:qwen3.7-plus';
  const { providerId, modelId } = parseModelString(modelString);
  const dbDefault =
    defaults.llm?.providerId === providerId && defaults.llm?.modelId === modelId
      ? defaults.llm
      : undefined;

  const clientApiKey = allowClientConfig ? params.apiKey || '' : '';
  const clientBaseUrl = allowClientConfig ? params.baseUrl || undefined : undefined;

  if (clientBaseUrl && process.env.NODE_ENV === 'production') {
    const ssrfError = validateUrlForSSRF(clientBaseUrl);
    if (ssrfError) {
      throw new Error(ssrfError);
    }
  }

  // Guard misconfigured defaults: URL accidentally saved into apiKey field
  let dbApiKey = dbDefault?.apiKey || '';
  let dbBaseUrl = dbDefault?.baseUrl || undefined;
  if (dbApiKey && /^https?:\/\//i.test(dbApiKey)) {
    if (!dbBaseUrl) dbBaseUrl = dbApiKey;
    dbApiKey = '';
  }

  const apiKey = clientApiKey || dbApiKey || resolveApiKey(providerId);
  const baseUrl = clientBaseUrl || dbBaseUrl || resolveBaseUrl(providerId);
  const proxy = resolveProxy(providerId);
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey,
    baseUrl,
    proxy,
    providerType: (params.providerType || dbDefault?.providerType) as
      | 'openai'
      | 'anthropic'
      | 'google'
      | undefined,
    requiresApiKey: params.requiresApiKey ?? dbDefault?.requiresApiKey,
  });

  return { model, modelInfo, modelString, apiKey };
}

/**
 * Resolve the best model for a PURE TEXT task (no images sent to the model).
 *
 * Problem: Qwen3-VL-Thinking variants always output a long chain-of-thought
 * reasoning before the JSON answer, consuming the entire output token budget.
 * When there are no images to process, using a VL model gives zero benefit
 * while causing reliable JSON generation failures.
 *
 * Solution: When the user-selected model is a Thinking VL variant AND there
 * are no images to send, silently fall back to the DEFAULT_MODEL (which is
 * a normal text model like qwen3.7-plus that doesn't think endlessly).
 *
 * Vision tasks (outline extraction with PDF images) should still use
 * resolveModelFromHeaders directly to get the VL model.
 */
export async function resolveTextModel(req: NextRequest): Promise<ResolvedModel> {
  const primary = await resolveModelFromHeaders(req);
  // Detect thinking VL variants (e.g. Qwen3-VL-32B-Thinking)
  const isThinkingVL = /qwen.*vl.*thinking/i.test(primary.modelString);
  if (!isThinkingVL) return primary;

  // Fall back to the server-configured text model
  const fallbackModelString = process.env.DEFAULT_MODEL || 'qwen:qwen3.7-plus';
  const fallback = await resolveModelWithDefaults({
    modelString: fallbackModelString,
    useModelString: true,
  });
  return fallback;
}

/**
 * Resolve a language model from standard request headers.
 *
 * Reads: x-model, x-api-key, x-base-url, x-provider-type, x-requires-api-key
 */
export function shouldUseFrontendModelConfig(req: NextRequest): boolean {
  return req.headers.get('x-use-frontend-model-config') === 'true';
}

export function shouldUseFrontendModelConfigFromBody(body: {
  useFrontendModelConfig?: boolean;
}): boolean {
  return body.useFrontendModelConfig === true;
}

export function resolveModelFromHeaders(req: NextRequest): Promise<ResolvedModel> {
  return resolveModelWithDefaults({
    modelString: req.headers.get('x-model') || undefined,
    apiKey: req.headers.get('x-api-key') || undefined,
    baseUrl: req.headers.get('x-base-url') || undefined,
    providerType: req.headers.get('x-provider-type') || undefined,
    requiresApiKey: req.headers.get('x-requires-api-key') === 'true' ? true : undefined,
    useClientConfig: shouldUseFrontendModelConfig(req),
  });
}

export function resolveModelFromHeaderValues(
  headers: Headers | Record<string, string | undefined>,
): Promise<ResolvedModel> {
  const getHeader =
    headers instanceof Headers
      ? (name: string) => headers.get(name) || undefined
      : (name: string) => headers[name] || headers[name.toLowerCase()] || undefined;

  return resolveModelWithDefaults({
    modelString: getHeader('x-model'),
    apiKey: getHeader('x-api-key'),
    baseUrl: getHeader('x-base-url'),
    providerType: getHeader('x-provider-type'),
    requiresApiKey: getHeader('x-requires-api-key') === 'true' ? true : undefined,
    useClientConfig: getHeader('x-use-frontend-model-config') === 'true',
  });
}

/**
 * Qwen3-series "thinking" models (e.g. Qwen3-VL-32B-Thinking) may ignore the
 * `chat_template_kwargs.enable_thinking` body param depending on the vLLM
 * version or chat template. The officially supported way to suppress thinking
 * at the prompt level is to prepend `/no_think` to the system message.
 *
 * Call this on EVERY system prompt before passing it to callLLM / streamLLM
 * whenever the resolved model is a Qwen3 thinking variant. It is idempotent
 * (won't double-inject if `/no_think` is already present).
 */
export function suppressThinking(systemPrompt: string, modelString: string): string {
  // Match Qwen3 thinking model names: case-insensitive, covers
  //   Qwen3-VL-32B-Thinking, qwen3-32b-thinking, etc.
  const isThinkingVariant = /qwen3.*thinking/i.test(modelString);
  if (!isThinkingVariant) return systemPrompt;
  if (systemPrompt.startsWith('/no_think')) return systemPrompt; // idempotent
  return `/no_think\n${systemPrompt}`;
}

/**
 * Append `/no_think` to the user prompt as well.
 * Some Qwen3-VL deployments only honour the instruction when it appears in
 * the user turn rather than (or in addition to) the system prompt.
 * Safe to call for all models — is a no-op for non-thinking variants.
 */
export function suppressThinkingInUserPrompt(userPrompt: string, modelString: string): string {
  const isThinkingVariant = /qwen3.*thinking/i.test(modelString);
  if (!isThinkingVariant) return userPrompt;
  if (userPrompt.trimEnd().endsWith('/no_think')) return userPrompt; // idempotent
  return `${userPrompt}\n/no_think`;
}
