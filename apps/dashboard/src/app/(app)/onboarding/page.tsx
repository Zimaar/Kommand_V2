import OnboardingClient from "./onboarding-client";

type SearchParamValue = string | string[] | undefined;

function getParam(value: SearchParamValue): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function OnboardingPage({
  searchParams,
}: {
  searchParams?: Record<string, SearchParamValue>;
}): React.ReactElement {
  const params = searchParams ?? {};

  return (
    <OnboardingClient
      connectedParam={getParam(params.connected)}
      errorParam={getParam(params.error)}
      shopParam={getParam(params.shop)}
      stepParam={getParam(params.step)}
    />
  );
}
