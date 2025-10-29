const noop = () => {};

const posthog = Object.assign(() => undefined, {
  init: noop,
  capture: noop,
  register: noop,
  opt_out_capturing: noop,
  flush: noop,
});

export default posthog;
