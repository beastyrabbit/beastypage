// Minimal signed-out Clerk browser API. This fixture never authenticates.
window.Clerk = {
  loaded: true,
  isSatellite: false,
  client: { sessions: [], signIn: {}, signUp: {} },
  user: null,
  session: null,
  organization: null,
  load: async () => {},
  on(event, listener, options) {
    if (event === "status") listener("ready");
    return () => {};
  },
  off() {},
  addListener(listener) {
    listener({ client: this.client, user: null, session: null, organization: null });
    return () => {};
  },
  __internal_addListener() { return () => {}; },
  __internal_setErrorThrowerOptions() {},
  __internal_setClerkUiConstructor() {},
  __internal_setOptions() {},
  buildUrlWithAuth: (url) => url,
  buildSignInUrl: () => "/projects",
  buildSignUpUrl: () => "/projects",
  handleRedirectCallback: async () => {},
  openSignIn() {},
  signOut: async () => {},
};
