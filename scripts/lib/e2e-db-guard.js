const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

const ISOLATED_TOKEN_REGEX = /(^|[-_.])(e2e|test|tests|testing|ci|sandbox|local|dev|preview|staging)($|[-_.])/i;
const PROTECTED_TOKEN_REGEX = /(^|[-_.])(prod|production|primary|shared|main|live)($|[-_.])/i;
const NON_ISOLATED_DEFAULT_DATABASES = new Set(["postgres", "neondb", "defaultdb"]);

const UNSAFE_OVERRIDE_ENV = "E2E_ALLOW_UNSAFE_DATABASE_WRITE";
const UNSAFE_OVERRIDE_VALUE =
  "I_UNDERSTAND_THIS_WILL_WRITE_TEST_DATA_TO_A_NON_ISOLATED_DATABASE";

function normalize(value) {
  return (value || "").trim().toLowerCase();
}

function parseTarget(name, rawUrl) {
  if (!rawUrl || !rawUrl.trim()) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      name,
      isSafe: false,
      reason: `${name} is not a valid URL.`,
      target: `${name}=<unparseable>`,
    };
  }

  const hostname = normalize(parsed.hostname);
  const dbName = normalize(decodeURIComponent(parsed.pathname.replace(/^\/+/, "")));

  const target = `${name}=host:${hostname || "<missing>"} db:${dbName || "<missing>"}`;
  const hostIsLocal =
    LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal");
  const hostLooksIsolated = ISOLATED_TOKEN_REGEX.test(hostname);
  const dbLooksIsolated = ISOLATED_TOKEN_REGEX.test(dbName);
  const hostLooksProtected = PROTECTED_TOKEN_REGEX.test(hostname);
  const dbLooksProtected = PROTECTED_TOKEN_REGEX.test(dbName);
  const dbIsDefaultShared = NON_ISOLATED_DEFAULT_DATABASES.has(dbName);

  if (hostLooksProtected || dbLooksProtected) {
    return {
      name,
      isSafe: false,
      reason: `${target} looks production/shared.`,
      target,
    };
  }

  if (hostIsLocal) {
    return {
      name,
      isSafe: true,
      reason: `${target} is local.`,
      target,
    };
  }

  if (dbIsDefaultShared) {
    return {
      name,
      isSafe: false,
      reason: `${target} uses a default shared database name.`,
      target,
    };
  }

  if (hostLooksIsolated || dbLooksIsolated) {
    return {
      name,
      isSafe: true,
      reason: `${target} is explicitly marked as isolated/test.`,
      target,
    };
  }

  return {
    name,
    isSafe: false,
    reason: `${target} is not clearly local or isolated.`,
    target,
  };
}

function getDatabaseTargets() {
  return ["DATABASE_URL", "DIRECT_URL"]
    .map((name) => parseTarget(name, process.env[name] || ""))
    .filter(Boolean);
}

function assertSafeE2EDatabase(options = {}) {
  const scope = options.scope || "E2E seed/test flow";
  const override = process.env[UNSAFE_OVERRIDE_ENV];

  if (override === UNSAFE_OVERRIDE_VALUE) {
    console.warn(
      `[E2E DB GUARD] ${scope}: bypass enabled via ${UNSAFE_OVERRIDE_ENV}.`,
    );
    return;
  }

  const targets = getDatabaseTargets();
  if (targets.length === 0) {
    throw new Error(
      `[E2E DB GUARD] ${scope}: DATABASE_URL/DIRECT_URL not set. Refusing to run.`,
    );
  }

  const unsafe = targets.filter((target) => !target.isSafe);
  if (unsafe.length === 0) {
    return;
  }

  const details = targets
    .map((target) => `- ${target.reason}`)
    .join("\n");

  throw new Error(
    [
      `[E2E DB GUARD] ${scope}: refusing to run against non-isolated database targets.`,
      details,
      "",
      `Only local or clearly isolated/test database URLs are allowed by default.`,
      `If you intentionally need to run against a non-isolated database, set:`,
      `${UNSAFE_OVERRIDE_ENV}=${UNSAFE_OVERRIDE_VALUE}`,
    ].join("\n"),
  );
}

module.exports = {
  assertSafeE2EDatabase,
  UNSAFE_OVERRIDE_ENV,
  UNSAFE_OVERRIDE_VALUE,
};
