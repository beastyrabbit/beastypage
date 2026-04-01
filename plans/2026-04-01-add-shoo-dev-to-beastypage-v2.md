# Integrating Shoo.dev Auth into BeastyPage

## Objective

Add **shoo.dev** (a minimal Google OAuth/PKCE auth broker) as the authentication provider for BeastyPage. Currently, BeastyPage has **zero authentication** -- no users table, no login, no identity system. Adding Shoo enables user accounts, which unlocks features like owned cat collections, saved settings per user, and protected admin routes.

---

## Current State

| Aspect | Status |
|--------|--------|
| **Auth provider** | None -- no auth of any kind |
| **Users table** | Does not exist in Convex schema |
| **Convex provider** | Plain `ConvexProvider` (not `ConvexProviderWithAuth`) at `frontend/components/providers.tsx:10` |
| **Auth config** | No `convex/auth.config.ts` exists |
| **Middleware** | None (`frontend/middleware.ts` does not exist) |
| **Login UI** | None |
| **Settings storage** | Currently uses anonymous slugs (e.g., `dash_settings`, `single_cat_settings` keyed by slug) |

**Shoo provides:**
- Google sign-in via OAuth + PKCE
- Domain-scoped pairwise subject IDs (`pairwise_sub`)
- ES256-signed `id_token` verifiable via JWKS
- `@shoojs/react` package with React hooks + Convex adapter
- Zero configuration -- no dashboard registration needed

---

## Implementation Plan

### Phase 1: Install Shoo Packages

- [ ] 1. **Install `@shoojs/react`** in `frontend/` via `bun add @shoojs/react`. This pulls in the React hooks and Convex adapter.

### Phase 2: Convex Auth Configuration

- [ ] 2. **Create `convex/auth.config.ts`** to register Shoo as a JWT provider. Per the Convex guidelines (`convex/_generated/ai/guidelines.md:143-155`), this file must exist for `ctx.auth.getUserIdentity()` to return non-null. The `domain` should be `https://shoo.dev` and `applicationID` should match the audience claim Shoo uses.

- [ ] 3. **Add a `users` table** to `frontend/convex/schema.ts`. At minimum: `tokenIdentifier` (string, indexed), `name` (optional string), `email` (optional string), `picture` (optional string), `createdAt` (number), `updatedAt` (number). Use `tokenIdentifier` as the canonical identity key per Convex guidelines (`convex/_generated/ai/guidelines.md:158`).

- [ ] 4. **Create `convex/users.ts`** with functions:
  - `store` (mutation) -- upsert a user record from `ctx.auth.getUserIdentity()`, called on first login
  - `current` (query) -- return the current user or null via `ctx.auth.getUserIdentity()`
  - Keep these as public functions since client needs to call them

### Phase 3: Frontend Provider Swap

- [ ] 5. **Replace `ConvexProvider` with `ConvexProviderWithAuth`** in `frontend/components/providers.tsx`. Use the `useAuth` hook from `@shoojs/react` which returns `{ isLoading, isAuthenticated, fetchAccessToken }`. This is required per Convex guidelines (`convex/_generated/ai/guidelines.md:160-174`) -- plain `ConvexProvider` does not send tokens with requests.

- [ ] 6. **Create a `useShooAuth` adapter hook** (if not provided directly by `@shoojs/react`) that wraps Shoo's auth state into the shape Convex expects: `{ isLoading: boolean, isAuthenticated: boolean, fetchAccessToken: () => Promise<string | null> }`.

### Phase 4: Login/Logout UI

- [ ] 7. **Add a login button** to the site header (`frontend/components/site-header.tsx`). When not authenticated, show a "Sign in" link pointing to `https://shoo.dev/authorize?redirect_uri=...`. When authenticated, show the user's avatar/name and a sign-out action.

- [ ] 8. **Handle the auth callback**. After Google sign-in via Shoo, the user is redirected back to BeastyPage with a code. The `@shoojs/react` SDK handles the token exchange client-side (PKCE flow). Verify whether a dedicated callback route is needed or if the SDK handles it transparently.

- [ ] 9. **Add a user menu component** (`frontend/components/user-menu.tsx`) that shows authenticated user info (name, avatar from Google profile), a link to user settings, and sign-out.

### Phase 5: Migrate Anonymous Data to User-Owned Data

- [ ] 10. **Decide on migration strategy for existing slug-based settings**. Currently `dash_settings`, `single_cat_settings`, `palette_generator_settings`, `pixelator_settings` all use anonymous slugs. Options:
  - Add an optional `userId` field to these tables (backward compatible)
  - Create parallel user-owned tables
  - Keep anonymous mode as default, allow "claiming" settings after login

- [ ] 11. **Add `userId` / `tokenIdentifier` fields** to relevant tables where user ownership makes sense: `cat_profile`, `adoption_batch`, `ancestry_tree`, `dash_settings`, `cat_shares`. Index by the user identifier for efficient lookups.

- [ ] 12. **Update Convex mutations** that create/update these records to optionally attach the authenticated user's identity when available, falling back to anonymous slug-based behavior for unauthenticated users.

### Phase 6: Protected Routes & Server-Side Verification

- [ ] 13. **Add auth guards to sensitive mutations**. For any mutation that should be user-only (e.g., deleting a cat profile, modifying owned settings), check `ctx.auth.getUserIdentity()` at the start and throw if null. Per Convex guidelines, never accept `userId` as an argument -- always derive from `ctx.auth`.

- [ ] 14. **Optionally add `middleware.ts`** for client-side route protection if certain pages should be login-only (e.g., a future "My Collection" page). Redirect unauthenticated users to a login page or show a sign-in prompt.

### Phase 7: Testing & Verification

- [ ] 15. **Test the full flow locally**: sign in via Shoo -> redirected to Google -> consent -> back to BeastyPage with identity. Verify `ctx.auth.getUserIdentity()` returns non-null in Convex functions.

- [ ] 16. **Test anonymous fallback**: unauthenticated users should still be able to use all existing features (generators, wheels, builders) without signing in. Auth should be additive, not blocking.

- [ ] 17. **Verify token verification**: Shoo signs tokens with ES256 and exposes JWKS at `https://shoo.dev/.well-known/jwks.json`. Confirm Convex can fetch and validate these tokens via the `auth.config.ts` domain setting.

### Phase 8: Deployment

- [ ] 18. **No infrastructure changes needed** -- Shoo is a third-party service. No new containers, no new K8s resources. The only deploy change is the updated frontend image with the auth code.

- [ ] 19. **Version bump** -- Adding auth is a major new feature. Per `CLAUDE.md:61`, new functionality on existing pages is a minor bump, but since this adds user identity across the entire app, a minor bump at minimum (e.g., `v1.X.0`). If a dedicated login/profile page is created, that's a major bump.

---

## Verification Criteria

- Users can sign in via Google through Shoo and see their identity in the BeastyPage header
- `ctx.auth.getUserIdentity()` returns a valid `UserIdentity` in Convex queries/mutations after sign-in
- Anonymous users can still use all existing features without signing in
- Authenticated users' creations (cats, settings, trees) are linked to their identity
- Sign-out clears the session and reverts to anonymous mode
- Token verification works against Shoo's JWKS endpoint

## Potential Risks and Mitigations

1. **Shoo is "super early WIP"** -- the service itself warns it's experimental
   Mitigation: Keep auth purely additive (all features work without login). If Shoo goes down, users just can't sign in -- nothing breaks.

2. **Breaking existing anonymous workflows**
   Mitigation: All current slug-based patterns continue working. Auth adds ownership on top, never replaces the anonymous path.

3. **Convex `auth.config.ts` misconfiguration**
   Mitigation: Test token verification in dev first. Shoo's docs include a [Convex integration guide](https://docs.shoo.dev/docs/convex) -- follow it exactly.

4. **CORS / redirect URI issues in dev**
   Mitigation: Shoo auto-derives `client_id` from redirect origin, so `http://frontend.localhost:1355` should work. Test early.

## Key Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `convex/auth.config.ts` | Create | Register Shoo as JWT provider |
| `convex/users.ts` | Create | User store/current query functions |
| `frontend/convex/schema.ts` | Modify | Add `users` table |
| `frontend/components/providers.tsx` | Modify | Swap to `ConvexProviderWithAuth` |
| `frontend/components/site-header.tsx` | Modify | Add login/user menu |
| `frontend/components/user-menu.tsx` | Create | Authenticated user dropdown |
| `frontend/package.json` | Modify | Add `@shoojs/react` dependency |
