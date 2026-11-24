import React, { useState } from 'react';
import {
  Key,
  ExternalLink,
  Zap,
  Check,
  Copy,
  Search,
  Filter,
  ArrowUpDown,
  Shield,
  Sparkles,
  Server,
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface BenchmarkModel {
  name: string;
  creator: string;
  intelligence_index: number;
  cost_per_task: number;
  time_per_task_min: number;
  ttft_sec: number;
  error_rate_pct: number;
  context_window: string;
  license: 'Open' | 'Proprietary';
  free_tier: boolean;
  provider_id: string;
}

const BENCHMARK_MODELS: BenchmarkModel[] = [
  { name: 'Claude Fable 5.2 (max)', creator: 'Anthropic', intelligence_index: 65, cost_per_task: 0.015, time_per_task_min: 0.45, ttft_sec: 0.85, error_rate_pct: 1.2, context_window: '1M', license: 'Proprietary', free_tier: false, provider_id: 'anthropic' },
  { name: 'GPT-6.2 Astra (max)', creator: 'OpenAI', intelligence_index: 62, cost_per_task: 0.012, time_per_task_min: 0.50, ttft_sec: 0.90, error_rate_pct: 1.5, context_window: '1M', license: 'Proprietary', free_tier: false, provider_id: 'openai' },
  { name: 'Gemini 4 Neon', creator: 'Google', intelligence_index: 61, cost_per_task: 0.005, time_per_task_min: 0.38, ttft_sec: 0.65, error_rate_pct: 1.8, context_window: '1M', license: 'Proprietary', free_tier: true, provider_id: 'gemini' },
  { name: 'Claude Opus 5.5', creator: 'Anthropic', intelligence_index: 60, cost_per_task: 0.018, time_per_task_min: 0.55, ttft_sec: 1.10, error_rate_pct: 1.4, context_window: '524k', license: 'Proprietary', free_tier: false, provider_id: 'anthropic' },
  { name: 'Claude Sonnet 5.5', creator: 'Anthropic', intelligence_index: 58, cost_per_task: 0.008, time_per_task_min: 0.40, ttft_sec: 0.75, error_rate_pct: 1.6, context_window: '524k', license: 'Proprietary', free_tier: false, provider_id: 'anthropic' },
  { name: 'Grok 4.7', creator: 'xAI', intelligence_index: 55, cost_per_task: 0.007, time_per_task_min: 0.42, ttft_sec: 0.80, error_rate_pct: 2.1, context_window: '524k', license: 'Proprietary', free_tier: true, provider_id: 'grok' },
  { name: 'DeepSeek V4.1 Flash', creator: 'DeepSeek', intelligence_index: 52, cost_per_task: 0.001, time_per_task_min: 0.25, ttft_sec: 0.45, error_rate_pct: 2.4, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'deepseek' },
  { name: 'Hermes 4 405B', creator: 'NousResearch', intelligence_index: 48, cost_per_task: 0.000, time_per_task_min: 0.95, ttft_sec: 1.80, error_rate_pct: 2.5, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'together' },
  { name: 'Kimi K3.1 Pro', creator: 'Moonshot', intelligence_index: 46, cost_per_task: 0.003, time_per_task_min: 0.48, ttft_sec: 0.95, error_rate_pct: 2.8, context_window: '262k', license: 'Proprietary', free_tier: true, provider_id: 'kimi' },
  { name: 'gpt-oss-120b', creator: 'OpenAI', intelligence_index: 45, cost_per_task: 0.000, time_per_task_min: 0.65, ttft_sec: 1.20, error_rate_pct: 2.9, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'huggingface' },
  { name: 'Qwen4 Max', creator: 'Alibaba', intelligence_index: 43, cost_per_task: 0.004, time_per_task_min: 0.44, ttft_sec: 0.88, error_rate_pct: 3.1, context_window: '262k', license: 'Open', free_tier: true, provider_id: 'alibaba' },
  { name: 'GLM-5.3', creator: 'Zhipu AI', intelligence_index: 42, cost_per_task: 0.003, time_per_task_min: 0.46, ttft_sec: 0.92, error_rate_pct: 3.2, context_window: '262k', license: 'Open', free_tier: true, provider_id: 'zai' },
  { name: 'Mercury 2.5', creator: 'Inception Labs', intelligence_index: 40, cost_per_task: 0.004, time_per_task_min: 0.15, ttft_sec: 2.09, error_rate_pct: 3.3, context_window: '64k', license: 'Proprietary', free_tier: false, provider_id: 'inception' },
  { name: 'Qwen3 Omni 30B A3B', creator: 'Alibaba', intelligence_index: 39, cost_per_task: 0.000, time_per_task_min: 0.30, ttft_sec: 0.55, error_rate_pct: 3.4, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'kaggle_custom' },
  { name: 'Qwen3.8 27B', creator: 'Alibaba', intelligence_index: 38, cost_per_task: 0.000, time_per_task_min: 0.35, ttft_sec: 0.60, error_rate_pct: 3.5, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'openrouter' },
  { name: 'Gemma 4 31B', creator: 'Google', intelligence_index: 37, cost_per_task: 0.000, time_per_task_min: 0.34, ttft_sec: 0.58, error_rate_pct: 3.6, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'groq' },
  { name: 'Nemotron 3.5 Super VL', creator: 'NVIDIA', intelligence_index: 37, cost_per_task: 0.000, time_per_task_min: 0.32, ttft_sec: 0.52, error_rate_pct: 3.7, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'nvidia_nim' },
  { name: 'Gemma 4 26B A4B', creator: 'Google', intelligence_index: 36, cost_per_task: 0.000, time_per_task_min: 0.22, ttft_sec: 0.40, error_rate_pct: 3.8, context_window: '131k', license: 'Open', free_tier: true, provider_id: 'groq' },
  { name: 'Sarvam 105B', creator: 'Sarvam AI', intelligence_index: 35, cost_per_task: 0.002, time_per_task_min: 0.52, ttft_sec: 0.98, error_rate_pct: 3.9, context_window: '64k', license: 'Open', free_tier: true, provider_id: 'sarvam' },
  { name: 'Phi-4 Multimodal', creator: 'Microsoft', intelligence_index: 34, cost_per_task: 0.000, time_per_task_min: 0.20, ttft_sec: 0.35, error_rate_pct: 4.0, context_window: '32k', license: 'Open', free_tier: true, provider_id: 'azure' },
  { name: 'Ministral 3 14B', creator: 'Mistral AI', intelligence_index: 32, cost_per_task: 0.000, time_per_task_min: 0.18, ttft_sec: 0.30, error_rate_pct: 4.2, context_window: '32k', license: 'Open', free_tier: true, provider_id: 'mistral' },
  { name: 'LFM3-1.7B', creator: 'Liquid AI', intelligence_index: 28, cost_per_task: 0.000, time_per_task_min: 0.12, ttft_sec: 0.20, error_rate_pct: 5.1, context_window: '32k', license: 'Open', free_tier: true, provider_id: 'liquid_ai' },
];

interface ProviderCardInfo {
  id: string;
  name: string;
  category: 'Frontier Direct' | 'Ultra-Fast LPU' | 'Open-Weight Cloud' | 'Enterprise Cloud' | 'Sovereign Compute';
  base_url: string;
  default_model: string;
  console_url: string;
  free_tier_badge: string;
  step_guide: string;
}

const PROVIDERS_LIST: ProviderCardInfo[] = [
  // Frontier Direct
  { id: 'anthropic', name: 'Anthropic', category: 'Frontier Direct', base_url: 'https://api.anthropic.com', default_model: 'claude-3-7-sonnet-20250219', console_url: 'https://console.anthropic.com/settings/keys', free_tier_badge: '$5 Free Credit', step_guide: '1. Sign up on Anthropic Console. 2. Navigate to API Keys. 3. Generate key and paste into Nexus DPAPI vault.' },
  { id: 'openai', name: 'OpenAI', category: 'Frontier Direct', base_url: 'https://api.openai.com/v1', default_model: 'gpt-4o', console_url: 'https://platform.openai.com/api-keys', free_tier_badge: '$5 Free Credit', step_guide: '1. Log into OpenAI Platform. 2. Create standard secret key. 3. Connect via 1-click Nexus protocol.' },
  { id: 'gemini', name: 'Google AI Studio', category: 'Frontier Direct', base_url: 'https://generativelanguage.googleapis.com', default_model: 'gemini-2.5-flash', console_url: 'https://aistudio.google.com/app/apikey', free_tier_badge: '100% Free: 15 RPM / 1M TPM', step_guide: '1. Open Google AI Studio. 2. Click "Get API Key". 3. Copy key to enjoy zero-cost Gemini 2.5 Flash.' },
  { id: 'grok', name: 'xAI / Grok', category: 'Frontier Direct', base_url: 'https://api.x.ai/v1', default_model: 'grok-2-latest', console_url: 'https://console.x.ai/', free_tier_badge: '$25 Monthly Free Credit', step_guide: '1. Log into xAI Console. 2. Generate API key from dashboard. 3. Connect to Nexus.' },
  { id: 'deepseek', name: 'DeepSeek', category: 'Frontier Direct', base_url: 'https://api.deepseek.com/v1', default_model: 'deepseek-chat', console_url: 'https://platform.deepseek.com/api_keys', free_tier_badge: '5M Free Tokens', step_guide: '1. Sign in to DeepSeek Platform. 2. Create API key. 3. Ultra-low cost coding and reasoning.' },
  { id: 'kimi', name: 'Kimi (Moonshot)', category: 'Frontier Direct', base_url: 'https://api.moonshot.cn/v1', default_model: 'moonshot-v1-auto', console_url: 'https://platform.moonshot.cn/console/api-keys', free_tier_badge: '15 RMB Trial Credit', step_guide: '1. Register on Moonshot Platform. 2. Generate API Token. 3. Enjoy long-context reasoning.' },
  { id: 'alibaba', name: 'Alibaba Cloud (Qwen)', category: 'Frontier Direct', base_url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', default_model: 'qwen-plus', console_url: 'https://bailian.console.alibabacloud.com/', free_tier_badge: '1M Free Tokens / Model', step_guide: '1. Access Alibaba Bailian Model Studio. 2. Create API key in compatible mode. 3. Connect to Nexus.' },
  { id: 'zai', name: 'Z.ai (GLM)', category: 'Frontier Direct', base_url: 'https://open.bigmodel.cn/api/paas/v4', default_model: 'glm-4-plus', console_url: 'https://open.bigmodel.cn/usercenter/apikeys', free_tier_badge: '25M Free Tokens', step_guide: '1. Open Zhipu BigModel console. 2. Generate API key. 3. Access GLM-5.3 and GLM-4.' },
  { id: 'meta', name: 'Meta AI API', category: 'Frontier Direct', base_url: 'https://api.llama.com/compat/v1', default_model: 'llama-3.3-70b-instruct', console_url: 'https://llama.meta.com/', free_tier_badge: 'Free Developer Access', step_guide: '1. Register for Meta Llama API. 2. Obtain developer endpoint key. 3. Route via Nexus.' },
  { id: 'mistral', name: 'Mistral AI', category: 'Frontier Direct', base_url: 'https://api.mistral.ai/v1', default_model: 'mistral-large-latest', console_url: 'https://console.mistral.ai/api-keys/', free_tier_badge: 'Free Experimentation Tier', step_guide: '1. Log into Mistral La Plateforme. 2. Create an API key. 3. Access Mistral Large & Ministral.' },
  { id: 'minimax', name: 'MiniMax', category: 'Frontier Direct', base_url: 'https://api.minimaxi.chat/v1', default_model: 'MiniMax-Text-01', console_url: 'https://platform.minimaxi.com/', free_tier_badge: 'Free Dev Quota', step_guide: '1. Open MiniMax Open Platform. 2. Generate secret key. 3. High-speed conversational inference.' },
  { id: 'cohere', name: 'Cohere', category: 'Frontier Direct', base_url: 'https://api.cohere.ai/compatibility/v1', default_model: 'command-r-plus', console_url: 'https://dashboard.cohere.com/api-keys', free_tier_badge: 'Free Trial (1,000 req/mo)', step_guide: '1. Sign up on Cohere Dashboard. 2. Copy trial API key. 3. Command R+ ready.' },
  { id: 'perplexity', name: 'Perplexity AI', category: 'Frontier Direct', base_url: 'https://api.perplexity.ai', default_model: 'sonar-pro', console_url: 'https://www.perplexity.ai/settings/api', free_tier_badge: '$5 Pro Monthly Credit', step_guide: '1. Navigate to Perplexity Settings -> API. 2. Generate API key. 3. Live search grounding enabled.' },
  { id: 'tencent', name: 'Tencent Cloud (Hunyuan)', category: 'Frontier Direct', base_url: 'https://api.hunyuan.cloud.tencent.com/v1', default_model: 'hunyuan-standard', console_url: 'https://console.cloud.tencent.com/hunyuan/api-key', free_tier_badge: '100k Free Tokens', step_guide: '1. Open Tencent Cloud Hunyuan Console. 2. Create SecretId and SecretKey. 3. Connect.' },
  { id: 'xiaomi', name: 'Xiaomi MiMo', category: 'Frontier Direct', base_url: 'https://api.xiaomimimo.com/v1', default_model: 'mimo-v2.6-pro', console_url: 'https://mimo.xiaomi.com/', free_tier_badge: 'Free Dev Tier', step_guide: '1. Register at Xiaomi MiMo platform. 2. Copy access token. 3. Route low-latency tasks.' },
  { id: 'stepfun', name: 'StepFun', category: 'Frontier Direct', base_url: 'https://api.stepfun.com/v1', default_model: 'step-1-8k', console_url: 'https://platform.stepfun.com/', free_tier_badge: 'Free Trial Balance', step_guide: '1. Open StepFun Open Platform. 2. Create API key. 3. Connect.' },
  { id: 'thinking_machines', name: 'Thinking Machines', category: 'Frontier Direct', base_url: 'https://api.thinkingmachines.ai/v1', default_model: 'inkling-2-small', console_url: 'https://thinkingmachines.ai/', free_tier_badge: 'Free Research Tier', step_guide: '1. Log in to Thinking Machines. 2. Generate API key. 3. Connect in Nexus.' },
  { id: 'upstage', name: 'Upstage (Solar)', category: 'Frontier Direct', base_url: 'https://api.upstage.ai/v1', default_model: 'solar-pro', console_url: 'https://console.upstage.ai/api-keys', free_tier_badge: '$10 Free Credit', step_guide: '1. Sign up on Upstage Console. 2. Create key for Solar Pro. 3. Fast reasoning.' },
  { id: 'liquid_ai', name: 'Liquid AI', category: 'Frontier Direct', base_url: 'https://api.liquid.ai/v1', default_model: 'lfm-3-1.7b', console_url: 'https://labs.liquid.ai/', free_tier_badge: 'Free Playground Tier', step_guide: '1. Log into Liquid AI Labs. 2. Copy token. 3. Run LFM non-transformer models.' },
  { id: 'sarvam', name: 'Sarvam AI (India)', category: 'Frontier Direct', base_url: 'https://api.sarvam.ai/v1', default_model: 'sarvam-2b', console_url: 'https://dashboard.sarvam.ai/', free_tier_badge: '₹500 Free Credit', step_guide: '1. Sign in to Sarvam AI dashboard. 2. Create subscription key. 3. Optimized for Indian languages.' },
  { id: 'reka', name: 'Reka AI', category: 'Frontier Direct', base_url: 'https://api.reka.ai/v1', default_model: 'reka-flash', console_url: 'https://platform.reka.ai/', free_tier_badge: 'Free Developer Trial', step_guide: '1. Open Reka platform. 2. Create API key. 3. Multimodal flash inference.' },
  { id: 'inception', name: 'Inception Labs', category: 'Frontier Direct', base_url: 'https://api.inceptionlabs.ai/v1', default_model: 'mercury-2.5', console_url: 'https://inceptionlabs.ai/', free_tier_badge: 'Diffusion LLM Beta', step_guide: '1. Open Inception Labs. 2. Copy API token for Mercury 2.5 diffusion LLM.' },
  { id: 'inclusion_ai', name: 'InclusionAI', category: 'Frontier Direct', base_url: 'https://api.inclusion.ai/v1', default_model: 'ling-3.1-flash', console_url: 'https://inclusion.ai/', free_tier_badge: 'Free Trial', step_guide: '1. Register at InclusionAI. 2. Generate key. 3. Connect to Nexus.' },
  { id: 'agnes_ai', name: 'Agnes AI', category: 'Frontier Direct', base_url: 'https://api.agnes.ai/v1', default_model: 'agnes-2.5-pro-theta', console_url: 'https://agnes.ai/', free_tier_badge: 'Custom Frontier', step_guide: '1. Set up Agnes custom endpoint. 2. Provide custom OpenAI base URL and key.' },
  { id: 'apodex', name: 'Apodex AI', category: 'Frontier Direct', base_url: 'https://api.apodex.ai/v1', default_model: 'apodex-1.1', console_url: 'https://apodex.ai/', free_tier_badge: 'Custom Endpoint', step_guide: '1. Open Apodex dashboard. 2. Create API key. 3. Connect.' },
  { id: 'celeris', name: 'Celeris', category: 'Frontier Direct', base_url: 'https://api.celeris.ai/v1', default_model: 'celeris-1', console_url: 'https://celeris.ai/', free_tier_badge: 'Ultra Low Latency Beta', step_guide: '1. Obtain early access key. 2. Connect via Nexus.' },

  // Ultra-Fast LPU
  { id: 'groq', name: 'Groq (LPU)', category: 'Ultra-Fast LPU', base_url: 'https://api.groq.com/openai/v1', default_model: 'llama-3.3-70b-versatile', console_url: 'https://console.groq.com/keys', free_tier_badge: '100% Free: 30 RPM / 14.4k RPD', step_guide: '1. Sign up on Groq Cloud. 2. Click "Create API Key". 3. Enjoy 750+ tokens/sec at zero cost.' },
  { id: 'cerebras', name: 'Cerebras (CS-3)', category: 'Ultra-Fast LPU', base_url: 'https://api.cerebras.ai/v1', default_model: 'llama3.3-70b', console_url: 'https://cloud.cerebras.ai/', free_tier_badge: '100% Free: 1M Tokens/Day', step_guide: '1. Register at Cerebras Cloud. 2. Generate key for Wafer-Scale CS-3. 3. Up to 2,000 tokens/sec.' },
  { id: 'sambanova', name: 'SambaNova (SN40L)', category: 'Ultra-Fast LPU', base_url: 'https://api.sambanova.ai/v1', default_model: 'Meta-Llama-3.3-70B-Instruct', console_url: 'https://cloud.sambanova.ai/', free_tier_badge: '100% Free: Unlimited Dev', step_guide: '1. Open SambaNova Cloud. 2. Generate free developer key. 3. Reconfigurable Dataflow Unit speed.' },

  // Open-Weight Cloud
  { id: 'openrouter', name: 'OpenRouter (:free)', category: 'Open-Weight Cloud', base_url: 'https://openrouter.ai/api/v1', default_model: 'deepseek/deepseek-chat:free', console_url: 'https://openrouter.ai/keys', free_tier_badge: '100% Free: 20+ Free Models', step_guide: '1. Sign in to OpenRouter. 2. Create API key. 3. Automatically uses the :free pool without card.' },
  { id: 'huggingface', name: 'Hugging Face Inference', category: 'Open-Weight Cloud', base_url: 'https://router.huggingface.co/v1', default_model: 'meta-llama/Llama-3.3-70B-Instruct', console_url: 'https://huggingface.co/settings/tokens', free_tier_badge: 'Free Serverless API', step_guide: '1. Open Hugging Face Settings -> Access Tokens. 2. Create read token. 3. Connect to free router.' },
  { id: 'cloudflare_ai', name: 'Cloudflare Workers AI', category: 'Open-Weight Cloud', base_url: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', default_model: '@cf/meta/llama-3.3-70b-instruct', console_url: 'https://dash.cloudflare.com/', free_tier_badge: '100% Free: 10,000 Neurons/Day', step_guide: '1. Open Cloudflare Dashboard. 2. Copy Account ID & API Token. 3. Run serverless edge models.' },
  { id: 'nvidia_nim', name: 'NVIDIA NIM', category: 'Open-Weight Cloud', base_url: 'https://integrate.api.nvidia.com/v1', default_model: 'meta/llama-3.3-70b-instruct', console_url: 'https://build.nvidia.com/', free_tier_badge: '1,000 Free Credits', step_guide: '1. Sign in to NVIDIA build. 2. Generate API key. 3. Run enterprise GPU-optimized models.' },
  { id: 'together', name: 'Together AI', category: 'Open-Weight Cloud', base_url: 'https://api.together.xyz/v1', default_model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', console_url: 'https://api.together.ai/settings/api-keys', free_tier_badge: '$5 Free Credit', step_guide: '1. Log into Together AI. 2. Create API key. 3. Connect.' },
  { id: 'fireworks', name: 'Fireworks AI', category: 'Open-Weight Cloud', base_url: 'https://api.fireworks.ai/inference/v1', default_model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', console_url: 'https://fireworks.ai/api-keys', free_tier_badge: '$1 Free Credit', step_guide: '1. Open Fireworks AI console. 2. Generate API key. 3. High-throughput inference.' },
  { id: 'deepinfra', name: 'DeepInfra', category: 'Open-Weight Cloud', base_url: 'https://api.deepinfra.com/v1/openai', default_model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', console_url: 'https://deepinfra.com/dash/api_keys', free_tier_badge: '$1.80 Free Credit', step_guide: '1. Log into DeepInfra dashboard. 2. Copy API token. 3. Connect.' },
  { id: 'nebius', name: 'Nebius AI Studio', category: 'Open-Weight Cloud', base_url: 'https://api.studio.nebius.ai/v1', default_model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', console_url: 'https://studio.nebius.ai/', free_tier_badge: '$5 Free Trial', step_guide: '1. Sign up on Nebius Studio. 2. Create key. 3. High-performance GPU cloud.' },
  { id: 'baseten', name: 'Baseten', category: 'Open-Weight Cloud', base_url: 'https://bridge.baseten.co/v1', default_model: 'deepseek-chat', console_url: 'https://app.baseten.co/settings/api_keys', free_tier_badge: '$30 Free Credit', step_guide: '1. Open Baseten Settings -> API Keys. 2. Create key. 3. Connect.' },
  { id: 'novita', name: 'Novita AI', category: 'Open-Weight Cloud', base_url: 'https://api.novita.ai/v3/openai', default_model: 'meta-llama/llama-3.3-70b-instruct', console_url: 'https://novita.ai/settings/key-management', free_tier_badge: 'Free Dev Trial', step_guide: '1. Sign up on Novita AI. 2. Generate key in Key Management. 3. Connect.' },
  { id: 'siliconflow', name: 'SiliconFlow', category: 'Open-Weight Cloud', base_url: 'https://api.siliconflow.cn/v1', default_model: 'Qwen/Qwen2.5-72B-Instruct', console_url: 'https://cloud.siliconflow.cn/account/ak', free_tier_badge: 'Free Qwen/GLM Tier', step_guide: '1. Register on SiliconFlow. 2. Create API token. 3. Free open weights.' },
  { id: 'parasail', name: 'Parasail', category: 'Open-Weight Cloud', base_url: 'https://api.parasail.io/v1', default_model: 'llama-3.3-70b', console_url: 'https://parasail.io/', free_tier_badge: 'Low Latency Cloud', step_guide: '1. Access Parasail dashboard. 2. Create key. 3. Connect.' },
  { id: 'coreweave', name: 'CoreWeave', category: 'Open-Weight Cloud', base_url: 'https://api.coreweave.com/v1', default_model: 'meta-llama/Llama-3.3-70B-Instruct', console_url: 'https://cloud.coreweave.com/', free_tier_badge: 'Enterprise Cloud', step_guide: '1. Open CoreWeave cloud. 2. Copy API token. 3. Connect.' },
  { id: 'modal', name: 'Modal Labs', category: 'Open-Weight Cloud', base_url: 'https://api.modal.com/v1', default_model: 'llama-3.3-70b', console_url: 'https://modal.com/settings', free_tier_badge: '$30 Monthly Free', step_guide: '1. Create Modal account. 2. Create token. 3. Serverless GPU endpoints.' },
  { id: 'crusoe', name: 'Crusoe Cloud', category: 'Open-Weight Cloud', base_url: 'https://api.crusoecloud.com/v1', default_model: 'meta-llama/Llama-3.3-70B-Instruct', console_url: 'https://console.crusoecloud.com/', free_tier_badge: 'Clean Energy Cloud', step_guide: '1. Log into Crusoe console. 2. Create API key. 3. Connect.' },
  { id: 'digitalocean', name: 'DigitalOcean GenAI', category: 'Open-Weight Cloud', base_url: 'https://api.digitalocean.com/v1/genai', default_model: 'llama-3.3-70b', console_url: 'https://cloud.digitalocean.com/account/api/tokens', free_tier_badge: '$200 New User Credit', step_guide: '1. Open DigitalOcean API tokens. 2. Generate token. 3. Connect.' },
  { id: 'scaleway', name: 'Scaleway Generative', category: 'Open-Weight Cloud', base_url: 'https://api.scaleway.ai/v1', default_model: 'llama-3.3-70b-instruct', console_url: 'https://console.scaleway.com/iam/api-keys', free_tier_badge: 'Free Dev Tier', step_guide: '1. Sign up on Scaleway. 2. Generate IAM API key. 3. Connect.' },
  { id: 'friendliai', name: 'FriendliAI', category: 'Open-Weight Cloud', base_url: 'https://inference.friendli.ai/v1', default_model: 'meta-llama-3.3-70b-instruct', console_url: 'https://suite.friendli.ai/', free_tier_badge: '$5 Free Credit', step_guide: '1. Open Friendli Suite. 2. Generate personal access token. 3. Connect.' },
  { id: 'makora', name: 'Makora AI', category: 'Open-Weight Cloud', base_url: 'https://api.makora.ai/v1', default_model: 'qwen-2.5-72b', console_url: 'https://makora.ai/', free_tier_badge: 'Fast Inference', step_guide: '1. Register at Makora. 2. Copy API token. 3. Connect.' },
  { id: 'inco', name: 'Inco Network', category: 'Open-Weight Cloud', base_url: 'https://api.inco.org/v1', default_model: 'inco-llama-70b', console_url: 'https://inco.org/', free_tier_badge: 'Confidential AI', step_guide: '1. Access Inco network. 2. Copy token. 3. Connect.' },
  { id: 'wafer', name: 'Wafer AI', category: 'Open-Weight Cloud', base_url: 'https://api.wafer.ai/v1', default_model: 'wafer-70b', console_url: 'https://wafer.ai/', free_tier_badge: 'Mesh Compute', step_guide: '1. Sign up at Wafer AI. 2. Copy access key. 3. Connect.' },
  { id: 'lithos_ai', name: 'Lithos AI', category: 'Open-Weight Cloud', base_url: 'https://api.lithos.ai/v1', default_model: 'lithos-70b', console_url: 'https://lithos.ai/', free_tier_badge: 'Open Weight Edge', step_guide: '1. Create Lithos API key. 2. Connect.' },
  { id: 'primalabs', name: 'PrimaLabs', category: 'Open-Weight Cloud', base_url: 'https://api.primalabs.ai/v1', default_model: 'prima-3.3-70b', console_url: 'https://primalabs.ai/', free_tier_badge: 'Scalable Model API', step_guide: '1. Register at PrimaLabs. 2. Copy key. 3. Connect.' },
  { id: 'gmi', name: 'GMI Cloud', category: 'Open-Weight Cloud', base_url: 'https://api.gmicloud.ai/v1', default_model: 'llama-3.3-70b', console_url: 'https://gmicloud.ai/', free_tier_badge: 'GPU Infrastructure', step_guide: '1. Open GMI Cloud console. 2. Generate key. 3. Connect.' },
  { id: 'bitdeer_ai', name: 'Bitdeer AI', category: 'Open-Weight Cloud', base_url: 'https://api.bitdeer.ai/v1', default_model: 'llama-3.3-70b', console_url: 'https://bitdeer.ai/', free_tier_badge: 'High Throughput', step_guide: '1. Register on Bitdeer AI. 2. Create API key. 3. Connect.' },
  { id: 'modular', name: 'Modular (MAX)', category: 'Open-Weight Cloud', base_url: 'https://api.modular.com/v1', default_model: 'llama-3.3-70b', console_url: 'https://modular.com/', free_tier_badge: 'MAX Engine Speed', step_guide: '1. Open Modular platform. 2. Generate MAX token. 3. Ultra fast Mojo tokens.' },
  { id: 'supernova', name: 'Supernova AI', category: 'Open-Weight Cloud', base_url: 'https://api.supernova.ai/v1', default_model: 'supernova-70b', console_url: 'https://supernova.ai/', free_tier_badge: 'Decentralized', step_guide: '1. Open Supernova. 2. Copy key. 3. Connect.' },
  { id: 'multiverse', name: 'Multiverse AI', category: 'Open-Weight Cloud', base_url: 'https://api.multiverse.ai/v1', default_model: 'multiverse-70b', console_url: 'https://multiverse.ai/', free_tier_badge: 'Distributed Mesh', step_guide: '1. Register on Multiverse. 2. Generate token. 3. Connect.' },
  { id: 'zyphra', name: 'Zyphra', category: 'Open-Weight Cloud', base_url: 'https://api.zyphra.com/v1', default_model: 'zyphra-z1', console_url: 'https://zyphra.com/', free_tier_badge: 'Sub-quadratic RNN', step_guide: '1. Open Zyphra console. 2. Copy API token for Z1.' },

  // Enterprise Cloud
  { id: 'bedrock', name: 'Amazon Bedrock', category: 'Enterprise Cloud', base_url: 'https://bedrock-runtime.us-east-1.amazonaws.com', default_model: 'anthropic.claude-3-5-sonnet-20241022-v2:0', console_url: 'https://console.aws.amazon.com/bedrock', free_tier_badge: 'AWS Free Tier', step_guide: '1. Open AWS Console -> Bedrock. 2. Enable model access. 3. Store AWS Key + Secret in DPAPI.' },
  { id: 'azure', name: 'Microsoft Azure AI', category: 'Enterprise Cloud', base_url: 'https://your-resource.openai.azure.com/openai/deployments', default_model: 'gpt-4o', console_url: 'https://portal.azure.com/', free_tier_badge: '$200 Azure Credit', step_guide: '1. Create Azure OpenAI resource. 2. Deploy target model. 3. Copy endpoint and key.' },
  { id: 'vertex', name: 'Google Vertex AI', category: 'Enterprise Cloud', base_url: 'https://us-central1-aiplatform.googleapis.com', default_model: 'gemini-1.5-pro', console_url: 'https://console.cloud.google.com/vertex-ai', free_tier_badge: '$300 GCP Credit', step_guide: '1. Enable Vertex AI API on GCP. 2. Create service account. 3. Connect via Nexus.' },
  { id: 'databricks', name: 'Databricks Serving', category: 'Enterprise Cloud', base_url: 'https://your-workspace.cloud.databricks.com/serving-endpoints', default_model: 'databricks-meta-llama-3-3-70b-instruct', console_url: 'https://databricks.com/', free_tier_badge: '14-Day Free Trial', step_guide: '1. Open Databricks Workspace -> Model Serving. 2. Create endpoint. 3. Store PAT in vault.' },

  // Sovereign Compute
  { id: 'kaggle_custom', name: 'Kaggle Dedicated GPU Node', category: 'Sovereign Compute', base_url: 'https://<tunnel>.trycloudflare.com/v1', default_model: 'qwen3.8:27b', console_url: 'https://kaggle.com/', free_tier_badge: '100% Free: 30 hrs/wk 2x T4', step_guide: '1. Click "Configure on Kaggle" in Compute Hub. 2. Run generated cell. 3. Auto-registers tunnel in Nexus.' },
  { id: 'hf_space', name: 'Hugging Face Space Node', category: 'Sovereign Compute', base_url: 'https://<user>-<space>.hf.space/v1', default_model: 'llama-3.2-3b', console_url: 'https://huggingface.co/spaces', free_tier_badge: '100% Free: 24/7 Always-On', step_guide: '1. Click "Build Space" in Compute Hub. 2. Deploy app.py + requirements.txt. 3. Connect to Nexus.' },
  { id: 'ollama_local', name: 'Local Ollama Daemon', category: 'Sovereign Compute', base_url: 'http://127.0.0.1:11434/v1', default_model: 'qwen2.5-coder:7b', console_url: 'http://127.0.0.1:11434', free_tier_badge: '100% Offline Air-Gapped', step_guide: '1. Run "ollama serve" locally. 2. Pull qwen2.5-coder:7b. 3. Zero network egress required.' },
  { id: 'puter_js', name: 'Puter.js Browser Fallback', category: 'Sovereign Compute', base_url: 'https://api.puter.com/drivers/chat/completion', default_model: 'claude-3-5-sonnet', console_url: 'https://puter.com', free_tier_badge: '100% Free: Zero-Key', step_guide: '1. Built-in zero-key browser fallback. 2. Automatically proxies Claude 3.5 Sonnet / GPT-4o through Puter client SDK. 3. Zero configuration.' },
  { id: 'gemini_web_bridge', name: 'Gemini Web Passive Bridge', category: 'Sovereign Compute', base_url: 'http://127.0.0.1:47631/v1', default_model: 'gemini-web-multimodal', console_url: 'https://gemini.google.com', free_tier_badge: '100% Free: Passive Session', step_guide: '1. Run apps/browser_bridge/ via stealth CDP. 2. Ingests authenticated browser cookies into loopback OpenAI-compatible endpoint. 3. Zero API key billing.' },
  { id: 'llama_cpp_local', name: 'Native llama.cpp AVX2 Runner', category: 'Sovereign Compute', base_url: 'http://127.0.0.1:8080/v1', default_model: 'Qwythos-9B-Q4_K_M.gguf', console_url: 'https://github.com/ggerganov/llama.cpp', free_tier_badge: '100% Offline: AVX2 CPU', step_guide: '1. Runs Qwythos-9B or OLMoE-7B locally using AVX2 instructions without discrete GPU. 2. 100% private, air-gapped, zero-network.' },
];

export const GuidesPage: React.FC = () => {
  const [benchmarkFilter, setBenchmarkFilter] = useState<'all' | 'open' | 'proprietary' | 'free'>('all');
  const [sortField, setSortField] = useState<keyof BenchmarkModel>('intelligence_index');
  const [sortAsc, setSortAsc] = useState(false);

  const [providerCategory, setProviderCategory] = useState<string>('all');
  const [providerSearch, setProviderSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sorting
  const sortedBenchmarks = [...BENCHMARK_MODELS].filter((m) => {
    if (benchmarkFilter === 'open' && m.license !== 'Open') return false;
    if (benchmarkFilter === 'proprietary' && m.license !== 'Proprietary') return false;
    if (benchmarkFilter === 'free' && !m.free_tier) return false;
    return true;
  }).sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  const handleSort = (field: keyof BenchmarkModel) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filteredProviders = PROVIDERS_LIST.filter((p) => {
    if (providerCategory !== 'all' && p.category !== providerCategory) return false;
    if (providerSearch.trim()) {
      const q = providerSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.default_model.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-20 px-4 max-w-7xl mx-auto space-y-16 font-sans text-slate-100">
      {/* Page Title */}
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Universal 45+ BYOK Provider & Benchmark Hub</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight font-space text-white">
          Artificial Analysis Leaderboard & BYOK Explorer
        </h1>
        <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-400">
          Rank every frontier model and open-weight checkpoint by Intelligence Index, latency, and cost. Bring your own keys with zero card and 100% Windows DPAPI data sovereignty.
        </p>
      </div>

      {/* SECTION 1: INTERACTIVE BENCHMARK TABLE */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-space text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <span>Artificial Analysis Benchmark Explorer</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Live intelligence index, task cost, throughput TTFT, and error rates.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            {[
              { id: 'all', label: 'All' },
              { id: 'free', label: '100% Free Tier' },
              { id: 'open', label: 'Open Weights' },
              { id: 'proprietary', label: 'Proprietary' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setBenchmarkFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg transition ${
                  benchmarkFilter === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Model & Creator</th>
                <th
                  onClick={() => handleSort('intelligence_index')}
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>IQ Index</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cost_per_task')}
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Cost / Task ($)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('time_per_task_min')}
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Time (min)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ttft_sec')}
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>TTFT (s)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('error_rate_pct')}
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Error %</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Context</th>
                <th className="py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedBenchmarks.map((m) => (
                <tr key={m.name} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4">
                    <div className="font-bold text-white text-[13px]">{m.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {m.creator} • {m.license}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                          style={{ width: `${(m.intelligence_index / 70) * 100}%` }}
                        />
                      </div>
                      <span className="font-bold text-cyan-300">{m.intelligence_index}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {m.cost_per_task === 0 ? (
                      <span className="text-emerald-400 font-bold">$0.00 (Free)</span>
                    ) : (
                      `$${m.cost_per_task.toFixed(3)}`
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-300">{m.time_per_task_min}m</td>
                  <td className="py-3 px-4 text-emerald-300">{m.ttft_sec}s</td>
                  <td className="py-3 px-4 text-slate-300">{m.error_rate_pct}%</td>
                  <td className="py-3 px-4 text-slate-400">{m.context_window}</td>
                  <td className="py-3 px-4">
                    <a
                      href={`nexus://add-provider?id=${m.provider_id}&model=${encodeURIComponent(m.name)}`}
                      className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Connect</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 1.5: ZERO-KEY & LOCAL LLAMA.CPP QUICKSTART */}
      <section className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-slate-900/90 via-black to-slate-900/90 border border-cyan-500/30 backdrop-blur-xl space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[11px]">
              <Cpu className="w-3.5 h-3.5" />
              <span>Zero-Key & Offline Tiers</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-space text-white">
              Zero-Key Cloud & Local llama.cpp Quickstart
            </h2>
            <p className="text-xs text-slate-400 font-sans">
              No API keys, credit cards, or cloud accounts needed. Run frontier intelligence instantly via Puter.js browser proxy, Gemini Web CDP bridge, or local CPU AVX2 GGUF models.
            </p>
          </div>
          <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-semibold">
            100% Sovereign & Free
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Puter.js */}
          <div className="p-5 rounded-xl bg-slate-950/70 border border-cyan-500/20 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-space font-bold text-sm text-cyan-300">Puter.js Browser Fallback</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Zero-Key</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                Seamless client-side proxy using Puter.js. Access Claude 3.5 Sonnet, GPT-4o, and DeepSeek with zero registration or API keys.
              </p>
              <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] text-slate-400 space-y-1">
                <div><span className="text-slate-500">Target:</span> claude-3-5-sonnet</div>
                <div><span className="text-slate-500">Latency:</span> ~120 ms (Zero-Key)</div>
              </div>
            </div>
            <button
              onClick={() => handleCopy('nexus://add-provider?id=puter_js&model=claude-3-5-sonnet', 'puter_js_link')}
              className="w-full py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedId === 'puter_js_link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Zap className="w-3.5 h-3.5" />}
              <span>{copiedId === 'puter_js_link' ? 'Copied Deep Link!' : 'Enable Puter.js Tier'}</span>
            </button>
          </div>

          {/* Card 2: Gemini Web Bridge */}
          <div className="p-5 rounded-xl bg-slate-950/70 border border-emerald-500/20 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-space font-bold text-sm text-emerald-300">Gemini Web Passive Bridge</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Stealth CDP</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                Connects through <code className="text-emerald-400">apps/browser_bridge/</code> to route requests through existing Gemini Web session cookies without developer billing.
              </p>
              <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] text-slate-400 space-y-1">
                <div><span className="text-slate-500">Target:</span> gemini-2.5-flash / Pro</div>
                <div><span className="text-slate-500">Port:</span> 127.0.0.1:47631 (Loopback)</div>
              </div>
            </div>
            <button
              onClick={() => handleCopy('python nexus.py --bridge-web', 'gemini_bridge_cmd')}
              className="w-full py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedId === 'gemini_bridge_cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'gemini_bridge_cmd' ? 'Copied Launch Script!' : 'Copy Bridge Command'}</span>
            </button>
          </div>

          {/* Card 3: llama.cpp AVX2 */}
          <div className="p-5 rounded-xl bg-slate-950/70 border border-purple-500/20 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-space font-bold text-sm text-purple-300">Native llama.cpp AVX2</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">100% Offline</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                Run <code className="text-purple-300">Qwythos-9B</code> or <code className="text-purple-300">OLMoE-7B</code> on standard AVX2 CPU cores. Fully air-gapped, 0 MB VRAM requirement, zero cloud egress.
              </p>
              <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] text-slate-400 space-y-1">
                <div><span className="text-slate-500">Models:</span> Qwythos-9B / OLMoE-7B</div>
                <div><span className="text-slate-500">CPU Speed:</span> 12-25 tok/sec (AVX2)</div>
              </div>
            </div>
            <button
              onClick={() => handleCopy('llama-server -m ~/.nexus-agent/models/qwythos-9b-q4.gguf --port 8080', 'llama_cpp_cmd')}
              className="w-full py-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedId === 'llama_cpp_cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'llama_cpp_cmd' ? 'Copied Server CLI!' : 'Copy Local Runner'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2: 45+ PROVIDER SETUP CARDS */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-space text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-400" />
              <span>45+ Provider Configuration & Key Guides</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Step-by-step key generation instructions and 1-click deep-link connection.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search provider, URL, or model..."
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
          {[
            { id: 'all', label: 'All Providers' },
            { id: 'Frontier Direct', label: 'Frontier Direct' },
            { id: 'Ultra-Fast LPU', label: 'Ultra-Fast LPU' },
            { id: 'Open-Weight Cloud', label: 'Open-Weight Cloud' },
            { id: 'Enterprise Cloud', label: 'Enterprise Cloud' },
            { id: 'Sovereign Compute', label: 'Sovereign' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setProviderCategory(c.id)}
              className={`px-3 py-1 rounded-lg transition ${
                providerCategory === c.id
                  ? 'bg-slate-800 text-white font-bold border border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Provider Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProviders.map((p) => {
            const deepLink = `nexus://add-provider?id=${p.id}&model=${encodeURIComponent(p.default_model)}&base_url=${encodeURIComponent(p.base_url)}`;
            return (
              <div
                key={p.id}
                className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between gap-4 shadow-lg backdrop-blur-xl"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-white">{p.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400">{p.category}</span>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-semibold">
                      {p.free_tier_badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{p.step_guide}</p>

                  <div className="space-y-1.5 p-2.5 rounded-xl bg-black/50 border border-white/5 text-[11px] font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Base URL:</span>
                      <button
                        onClick={() => handleCopy(p.base_url, `${p.id}-url`)}
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        {copiedId === `${p.id}-url` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>Copy</span>
                      </button>
                    </div>
                    <div className="truncate text-slate-300">{p.base_url}</div>

                    <div className="pt-1 text-slate-400">
                      <span>Model:</span> <span className="text-slate-200">{p.default_model}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                  <a
                    href={p.console_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <span>Get API Key</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <a
                    href={deepLink}
                    className="flex-1 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 font-bold flex items-center justify-center gap-1 transition"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Connect</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default GuidesPage;
