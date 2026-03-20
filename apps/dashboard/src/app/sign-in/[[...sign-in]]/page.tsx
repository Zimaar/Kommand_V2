import { SignIn } from "@clerk/nextjs";

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const HAS_CLERK = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

export default function SignInPage({
  searchParams,
}: {
  searchParams?: Record<string, SearchParamValue>;
}): React.ReactElement {
  const redirectUrl = firstValue(searchParams?.redirect_url) || "/overview";

  if (!HAS_CLERK) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7fb] px-4">
        <div className="max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-sm text-gray-600 shadow-sm">
          Clerk is not configured in this environment. Use the local dev onboarding flow instead.
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7fb] px-4">
      <SignIn forceRedirectUrl={redirectUrl} signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`} />
    </main>
  );
}
