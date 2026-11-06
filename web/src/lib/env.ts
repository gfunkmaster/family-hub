/** Miljövariabler som sidan behöver. Saknas något kastas ett fel med vad som ska sättas. */
function required(name: string, minLength = 1): string {
  const v = process.env[name];
  if (!v || v.length < minLength) throw new Error(`${name} saknas eller är för kort (minst ${minLength} tecken). Se web/.env.example.`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get familyPassword() { return required("FAMILY_PASSWORD", 8); },
  get sessionSecret() { return required("SESSION_SECRET", 32); },
  get agentToken() { return required("AGENT_TOKEN", 32); },
};
