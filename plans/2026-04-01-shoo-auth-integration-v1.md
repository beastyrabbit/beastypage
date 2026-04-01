# Shoo.dev Auth Integration for BeastyPage

## Objective

Add shoo.dev (Google OAuth via PKCE) as the authentication provider to BeastyPage. Auth should be fully wired into Convex so `ctx.auth.getUserIdentity()` works in backend functions, but **no existing feature should gate on auth**. The deliverables are:

1. A **Login / Sign out** button in the site header
2. A **User Profile** page where authenticated users can set their display name and toggle whether to show their profile picture
3. A Convex `users` table to persist user-specific data keyed by Shoo's stable `tokenIdentifier`
4. Everything else remains fully accessible to anonymous visitors

---

## Key Findings from Research

| Aspect | Current State | Source |
|---|---|---|
| Auth provider | None -- `ConvexProvider` (no auth) at `frontend/components/providers.tsx:10` | Research |
| Convex schema | 20 tables, no `users` table at `frontend/convex/schema.ts:1-326` | Research |
| Auth config | No `convex/auth.config.ts` exists | Research |
| Site header | `frontend/components/site-header.tsx:1-52` -- nav pills + Discord invite button, no auth UI | Research |
| Shoo + Convex guide | `@shoojs/react` ships `createShooConvexAuth()` returning `{ useAuth, signIn, signOut }` for `ConvexProviderWithAuth` | [docs.shoo.dev/docs/convex](https://docs.shoo.dev/docs/convex) |
| Shoo callback (Next.js) | Requires a `"use client"` page at the callback path that calls `useShooAuth()` | [docs.shoo.dev/docs/getting-started](https://docs.shoo.dev/docs/getting-started) |
| Convex auth guidelines | Must use `ctx.auth.getUserIdentity()` server-side; prefer `identity.tokenIdentifier` over `identity.subject`; never accept userId as a function argument | `convex/_generated/ai/guidelines.md:144-159` |
| PII opt-in | Shoo supports `requestPii: true` on `signIn()` to get `email`, `name`, `picture` via consent screen | [docs.shoo.dev/docs/api-reference/shoo-react](https://docs.shoo.dev/docs/api-reference/shoo-react) |
| UI patterns | Hand-rolled modals with `fixed inset-0 bg-black/60` + glass-card panels; Tailwind utility classes; `cn()` helper; `sonner` toasts | Research |

---

## Implementation Plan

### Phase 1: Install and Wire Shoo into Convex

- [ ] **1.1 Install `@shoojs/react`** in the `frontend/` workspace using `bun add @shoojs/react`. This is the only new dependency needed; it includes `@shoojs/auth` as a transitive dependency.

- [ ] **1.2 Create `frontend/convex/auth.config.ts`** -- this new file tells Convex how to verify Shoo JWTs. Without it, `ctx.auth.getUserIdentity()` always returns `null`. Use the `customJwt` provider type with `issuer: "https://shoo.dev"`, `jwks: "https://shoo.dev/.well-known/jwks.json"`, and `algorithm: "ES256"`. Rationale: Convex needs this file to know where to fetch the JWKS for token verification.

- [ ] **1.3 Create `frontend/lib/shooAuth.ts`** -- a single module-scope call to `createShooConvexAuth({ callbackPath: "/auth/callback" })` that exports `{ useAuth, signIn, signOut }`. This keeps the Shoo configuration centralized and importable from both the provider and UI components. The `callbackPath` should be `/auth/callback` to match the Next.js App Router page created in 1.5.

- [ ] **1.4 Update `frontend/components/providers.tsx`** -- switch from `ConvexProvider` to `ConvexProviderWithAuth` (imported from `convex/react`), passing the `useAuth` hook from `lib/shooAuth.ts`. The `client` prop stays the same singleton `ConvexReactClient`. This change is backward-compatible: unauthenticated users still get all data; the difference is that Convex now sends the JWT with requests when a user *is* logged in.

- [ ] **1.5 Create `frontend/app/auth/callback/page.tsx`** -- a minimal `"use client"` page that calls `useShooAuth()` from `@shoojs/react` and shows a "Signing in..." message. Next.js requires this page to exist so the OAuth redirect doesn't 404. After the hook processes the callback code, it stores the identity in localStorage and the `ConvexProviderWithAuth` picks it up automatically.

### Phase 2: Add Login Button to Site Header

- [ ] **2.1 Create `frontend/components/auth/UserAuthButton.tsx`** -- a `"use client"` component that:
  - Imports `signIn`, `signOut` from `@/lib/shooAuth`
  - Uses `useConvexAuth()` from `convex/react` to read `{ isLoading, isAuthenticated }`
  - When **not authenticated**: renders a "Sign in" button styled consistently with the existing nav-pill or DiscordInviteButton patterns (rounded, border, hover transition)
  - When **authenticated**: renders a small user avatar circle (or a generic `User` icon from lucide-react if no profile pic) that opens a dropdown/popover with "Profile" link and "Sign out" action. This can follow the existing hand-rolled modal pattern (but as a simple dropdown, not a full modal). The `signIn` call should use `{ requestPii: true }` to get name/picture from Google, since the user profile feature needs them.
  - When **loading**: renders a subtle skeleton/shimmer or `Loader2` spinner to avoid layout shift

- [ ] **2.2 Add `UserAuthButton` to `frontend/components/site-header.tsx`** -- place it after the nav and before (or instead of) the `DiscordInviteButton` on the right side of the header bar. If you want to keep the Discord button, place the auth button between the nav and Discord button.

### Phase 3: Convex Users Table and Backend Functions

- [ ] **3.1 Add `users` table to `frontend/convex/schema.ts`** -- define a new table with these fields:
  - `tokenIdentifier: v.string()` -- the canonical Convex identity key (e.g., `"https://shoo.dev|<subject>"`)
  - `displayName: v.optional(v.string())` -- user-chosen display name, initially populated from Google `name` claim
  - `showProfilePic: v.boolean()` -- whether to expose the profile picture, defaults to `true`
  - `profilePicUrl: v.optional(v.string())` -- the Google profile pic URL from the Shoo identity
  - `email: v.optional(v.string())` -- stored for future use, from the identity claims
  - `createdAt: v.number()`
  - `updatedAt: v.number()`
  
  Add an index: `.index("byTokenIdentifier", ["tokenIdentifier"])`. Rationale: `tokenIdentifier` is the recommended stable key per Convex guidelines (`convex/_generated/ai/guidelines.md:158`). The table is intentionally simple -- just what's needed for identity + profile preferences.

- [ ] **3.2 Create `frontend/convex/users.ts`** with these Convex functions:

  - **`viewer` (query)**: calls `ctx.auth.getUserIdentity()`, returns `null` if unauthenticated, otherwise looks up the user doc by `tokenIdentifier`. Returns the user document if found, or just the identity info if no doc exists yet. This is the primary hook for the frontend to know "who am I".

  - **`getOrCreateUser` (mutation)**: called once after login to ensure a user row exists. Gets identity via `ctx.auth.getUserIdentity()`, looks up by `tokenIdentifier`. If no doc exists, inserts one with `displayName` seeded from `identity.name`, `profilePicUrl` from `identity.pictureUrl`, `showProfilePic: true`. If the doc already exists, optionally update `profilePicUrl` and `email` from the latest identity (in case Google info changed). Returns the user doc. This should be an `internalMutation` or a regular `mutation` -- regular `mutation` is simpler since it derives identity server-side and never accepts a userId argument.

  - **`updateProfile` (mutation)**: takes `{ displayName: v.optional(v.string()), showProfilePic: v.optional(v.boolean()) }`. Gets identity, looks up user doc, patches the specified fields. Returns the updated doc. Validates that `displayName` is non-empty and reasonably short (e.g., max 50 chars).

### Phase 4: User Profile Page

- [ ] **4.1 Create `frontend/app/profile/page.tsx`** -- a `"use client"` page that:
  - Uses `useQuery(api.users.viewer)` to get the current user
  - If not authenticated, shows a prompt to sign in (with the sign-in button)
  - If authenticated, shows a simple profile form:
    - **Display Name**: text input, pre-filled from the current `displayName`
    - **Show Profile Picture**: a toggle/checkbox. When enabled, shows the Google profile pic preview. When disabled, hides it.
    - **Save** button that calls the `updateProfile` mutation
  - Uses the existing `PageHero` component for the page header
  - Uses sonner `toast.success()` on successful save
  - Follow the existing page styling patterns (glass-card panels, Tailwind utilities)

- [ ] **4.2 Trigger `getOrCreateUser` on login** -- in the `UserAuthButton` component (or in a small wrapper/effect component near the provider), call the `getOrCreateUser` mutation once when `isAuthenticated` transitions to `true`. This ensures the Convex user doc is created immediately after the first login. Use a `useEffect` + `useMutation` pattern.

- [ ] **4.3 Add "Profile" link to the user dropdown in `UserAuthButton`** -- when authenticated, the dropdown should include a `<Link href="/profile">Profile</Link>` option alongside "Sign out".

### Phase 5: Environment and Deployment

- [ ] **5.1 Update `README.md` environment table** to note that Shoo auth is zero-config (no env vars needed -- Shoo derives `client_id` from the redirect origin automatically). No new env vars are required.

- [ ] **5.2 Verify Docker/Kubernetes compatibility** -- Shoo's callback URL is origin-based, so the `NEXT_PUBLIC_CONVEX_URL` runtime override pattern (`frontend/components/runtime-env-script.tsx`) is unaffected. The `convex/auth.config.ts` is deployed with `bunx convex deploy` alongside other Convex functions. No additional secrets are needed.

---

## Verification Criteria

- Unauthenticated users can browse all existing pages without any change in behavior
- The site header shows a "Sign in" button when logged out
- Clicking "Sign in" redirects through Shoo's Google OAuth and returns to the app
- After login, the header shows the user's avatar/icon with a dropdown containing "Profile" and "Sign out"
- The `/profile` page displays the user's display name and profile picture toggle
- Changing display name and saving persists the change in Convex
- Toggling "Show Profile Picture" off hides the picture (for future use by other features)
- `ctx.auth.getUserIdentity()` returns a valid identity in any Convex function when the user is logged in
- The `users` table in Convex contains one row per unique authenticated user
- Signing out clears the local identity and the header reverts to showing "Sign in"
- The `/auth/callback` route loads correctly and processes the OAuth redirect without errors
- No existing functionality is broken -- all pages remain public and accessible

---

## Potential Risks and Mitigations

1. **Shoo is "super early WIP"**
   Mitigation: The scope is intentionally minimal (just identity + profile). If Shoo breaks or is abandoned, the only thing to swap out is `lib/shooAuth.ts`, the callback page, and `convex/auth.config.ts`. The `users` table and all Convex functions use standard `ctx.auth.getUserIdentity()` which works with any JWT provider.

2. **`ConvexProviderWithAuth` may affect existing unauthenticated queries**
   Mitigation: `ConvexProviderWithAuth` is a drop-in replacement for `ConvexProvider`. When no user is logged in, it behaves identically -- no token is sent. Existing queries that don't call `ctx.auth.getUserIdentity()` are completely unaffected.

3. **Next.js callback page may flash during OAuth redirect**
   Mitigation: The callback page is a minimal "Signing in..." text. The `useShooAuth` hook processes the code exchange quickly and redirects back. This is the documented Next.js pattern from Shoo's own docs.

4. **Google profile picture URL may expire or change**
   Mitigation: Store it as a URL string, not a downloaded image. Update it on each login via `getOrCreateUser`. For display, use `<img>` with a fallback to a generic icon if the URL fails.

5. **Pairwise subject means user IDs are origin-specific**
   Mitigation: This is actually a benefit for privacy. If the app ever needs cross-origin identity, that would require switching to a different auth provider -- but the user stated this is fine and expected.

---

## Alternative Approaches

1. **Use `useShooAuth()` directly instead of `createShooConvexAuth()`**: The hook works standalone for non-Convex use cases, but since BeastyPage uses Convex for everything, the Convex adapter is the right choice. It handles token delivery to Convex automatically.

2. **Store profile picture in Convex File Storage instead of URL**: Would provide more control but adds complexity (downloading, storing, serving). Since Google's profile pic URLs are stable and the feature is minimal, storing the URL is simpler and sufficient.

3. **Add auth to `middleware.ts` for route protection**: Not needed now since nothing is gated. If future features require protected routes, a Next.js middleware can check for the Shoo identity cookie/localStorage, but that's a future concern.

---

## Files to Create (New)

| File | Purpose |
|---|---|
| `frontend/convex/auth.config.ts` | Convex JWT provider config for Shoo |
| `frontend/lib/shooAuth.ts` | Centralized Shoo auth adapter (module-scope singleton) |
| `frontend/app/auth/callback/page.tsx` | OAuth callback handler page (Next.js requirement) |
| `frontend/components/auth/UserAuthButton.tsx` | Login/avatar button for the header |
| `frontend/convex/users.ts` | Convex queries + mutations for user management |
| `frontend/app/profile/page.tsx` | User profile settings page |

## Files to Modify (Existing)

| File | Change |
|---|---|
| `frontend/components/providers.tsx` | `ConvexProvider` -> `ConvexProviderWithAuth` + `useAuth` |
| `frontend/components/site-header.tsx` | Add `UserAuthButton` component |
| `frontend/convex/schema.ts` | Add `users` table definition |
| `frontend/package.json` | `@shoojs/react` added by `bun add` |
