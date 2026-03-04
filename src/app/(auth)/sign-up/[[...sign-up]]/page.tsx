import { redirect } from "next/navigation";

interface SignUpAliasPageProps {
  params: Promise<Record<string, string[] | undefined>>;
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

export default async function SignUpAliasPage({
  params,
  searchParams,
}: SignUpAliasPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const catchAllPath = Object.values(resolvedParams).find(Array.isArray);
  const signUpPath =
    catchAllPath && catchAllPath.length ? `/${catchAllPath.join("/")}` : "";

  const queryString = toQueryString(resolvedSearchParams);
  const target = `/sign-in${signUpPath}${queryString ? `?${queryString}` : ""}`;

  redirect(target);
}
