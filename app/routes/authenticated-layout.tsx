import { useState } from "react";
import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/authenticated-layout";
import { AppPageHeader } from "~/components/app-page-header";
import { AppSidebar } from "~/components/app-sidebar";
import { ScrollMainOnNavigate } from "~/components/scroll-main-on-navigate";
import type { PageHeaderState } from "~/hooks/use-app-shell";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user };
}

export default function AuthenticatedLayout() {
  const { user } = useLoaderData<typeof loader>();
  const [pageHeader, setPageHeader] = useState<PageHeaderState | null>(null);

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar user={user} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {pageHeader ? (
          <AppPageHeader
            title={pageHeader.title}
            description={pageHeader.description}
            actions={pageHeader.actions}
            maxWidth={pageHeader.maxWidth}
          />
        ) : null}
        <ScrollMainOnNavigate>
          <Outlet context={{ user, setPageHeader }} />
        </ScrollMainOnNavigate>
      </div>
    </div>
  );
}
