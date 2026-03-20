import { auth } from "@clerk/nextjs/server";
import ShopifyLaunchClient from "./shopify-launch-client";

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const HAS_CLERK = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

export default async function ShopifyLaunchPage({
  searchParams,
}: {
  searchParams?: Record<string, SearchParamValue>;
}): Promise<React.ReactElement> {
  const launch = firstValue(searchParams?.launch);
  const userId = HAS_CLERK ? (await auth()).userId : "dev-user";

  return (
    <ShopifyLaunchClient
      launch={launch}
      hasClerk={HAS_CLERK}
      isSignedIn={Boolean(userId)}
    />
  );
}
