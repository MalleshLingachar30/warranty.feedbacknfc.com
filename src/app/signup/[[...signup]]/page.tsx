import { redirect } from "next/navigation";

interface SignupAliasPageProps {
  params: Promise<{
    signup?: string[];
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function toQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    }
  }

  return query.toString();
}

export default async function SignupAliasPage({
  params,
  searchParams,
}: SignupAliasPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const signupPath = resolvedParams.signup?.length
    ? `/${resolvedParams.signup.join("/")}`
    : "";

  const queryString = toQueryString(resolvedSearchParams);
  const target = `/sign-up${signupPath}${queryString ? `?${queryString}` : ""}`;

  redirect(target);
}
