/**
 * Cloudflare Pages Middleware: Nexus Companion
 * 1. Global CORS headers for preflight and standard API calls
 * 2. Developer Key Normalization (Groq, Gemini, Workers AI)
 * 3. Error boundary with accessible error messages
 */

export async function onRequest(context) {
  const { request } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Custom-Key, X-AI-Provider, X-Custom-Model",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Pass custom developer keys and headers to downstream functions
  context.data = context.data || {};
  context.data.customKey = request.headers.get("X-Custom-Key") || null;
  context.data.aiProvider = request.headers.get("X-AI-Provider") || "groq";
  context.data.customModel = request.headers.get("X-Custom-Model") || null;

  try {
    const response = await context.next();
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal Edge Server Error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
}
