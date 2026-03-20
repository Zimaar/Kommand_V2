"use client";

import { UserButton, useUser } from "@clerk/nextjs";

const HAS_CLERK = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function SidebarAccountWithClerk(): React.ReactElement {
  const { user } = useUser();
  const displayName = user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "Account";

  return (
    <div className="flex items-center gap-2.5">
      <UserButton afterSignOutUrl="/" />
      <span className="text-sm text-gray-600 truncate">{displayName}</span>
    </div>
  );
}

function SidebarAccountDev(): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
        D
      </div>
      <span className="text-sm text-gray-600 truncate">Dev mode</span>
    </div>
  );
}

export default function SidebarAccount(): React.ReactElement {
  return HAS_CLERK ? <SidebarAccountWithClerk /> : <SidebarAccountDev />;
}
