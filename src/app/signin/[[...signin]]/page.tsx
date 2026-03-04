import { redirect } from "next/navigation";

interface SigninAliasPageProps {
  params: Promise<{
    signin?: string[];
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

export default async function SigninAliasPage({
  params,
  searchParams,
}: SigninAliasPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const signinPath = resolvedParams.signin?.length
    ? `/${resolvedParams.signin.join("/")}`
    : "";

  const queryString = toQueryString(resolvedSearchParams);
  const target = `/sign-in${signinPath}${queryString ? `?${queryString}` : ""}`;

  redirect(target);
}
