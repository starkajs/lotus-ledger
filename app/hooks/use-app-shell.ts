import { useOutletContext } from "react-router";
import type { AppPageHeaderProps } from "~/components/app-page-header";
import type { AuthUser } from "~/lib/session.server";

export type PageHeaderState = AppPageHeaderProps;

export type AuthenticatedOutletContext = {
  user: AuthUser;
  setPageHeader: (header: PageHeaderState | null) => void;
};

export function useAppShell() {
  return useOutletContext<AuthenticatedOutletContext>();
}

export function useAuthUser(): AuthUser {
  return useAppShell().user;
}
