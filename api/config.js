// Public configuration only. Never put secrets in this response.
const { send } = require("./_lib");
const make = ({ env }) => (req, res) => {
  const ai = env.AI_PROVIDER && ({ anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY })[env.AI_PROVIDER];
  send(res, 200, {
    supabaseUrl: env.SUPABASE_URL || "", supabaseAnonKey: env.SUPABASE_ANON_KEY || "",
    ai: !!ai, aiProvider: ai ? env.AI_PROVIDER : "", vapidPublicKey: env.VAPID_PUBLIC_KEY || "",
    push: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.SUPABASE_SERVICE_KEY),
  });
};
module.exports = make({ env: process.env }); module.exports.make = make;
