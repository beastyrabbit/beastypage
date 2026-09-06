import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
export const CONVEX_HTTP_URL = location.origin;
export const SignInButton = ({ children }: { children: ReactNode }) => children;
export const usePathname = () => "/streamer/host";
export const useRouter = () => ({ replace: () => {}, push: () => {} });

const artwork = {
  id: "fixture-art",
  artist_name: "Test artist",
  animal: "Cat",
  link: "https://artist.example",
  preview_img: new URL("/sprites/fademask.png", location.origin).href,
  full_img: new URL("/sprites/fademask.png", location.origin).href,
  blur_img: null,
  focusX: 50,
  focusY: 50,
  created: 1,
  updated: 1,
};
const viewer = {
  id: "fixture-user",
  username: "Test account",
  role: "user",
  created: 1,
};
export const useConvexAuth = () => ({
  isLoading: false,
  isAuthenticated:
    new URL(location.href).searchParams.get("view") === "profile",
});
export const useUser = () => ({
  user: { username: "Test account", imageUrl: null, update: async () => {} },
});
export const useClerk = () => ({
  openSignIn: () => {},
  signOut: async () => {},
});
const getToken = async () => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true, getToken });
export function useQuery(reference: Parameters<typeof getFunctionName>[0]) {
  switch (getFunctionName(reference)) {
    case "collection:list":
      return [artwork];
    case "users:viewer":
      return viewer;
    case "catdex:hasPending":
      return false;
    default:
      return [];
  }
}
export const useMutation = () => async () => ({ remaining: false });
export const usePaginatedQuery = () => ({
  results: [],
  status: "CanLoadMore",
  loadMore: () => {},
});
export class ConvexReactClient {}
