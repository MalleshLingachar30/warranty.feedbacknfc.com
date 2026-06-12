import "server-only";

const clerkApiBaseUrl = "https://api.clerk.com/v1";

function getClerkSecretKey(): string | null {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  return secretKey ? secretKey : null;
}

export async function ensureClerkUserBypassesClientTrust(
  clerkUserId: string,
): Promise<void> {
  const secretKey = getClerkSecretKey();

  if (!secretKey) {
    return;
  }

  const response = await fetch(`${clerkApiBaseUrl}/users/${clerkUserId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bypass_client_trust: true,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to update Clerk user ${clerkUserId}: ${response.status} ${body}`,
    );
  }
}
