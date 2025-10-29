import { convex } from "./client.js";
import { startPoll, stopPoll } from "./poll.js";

function cleanArgs(args) {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined && value !== null)
  );
}

export function createStreamsAPI({ defaultPollInterval = 3500 } = {}) {
  const api = {
    async listSessions({ status, exclude, viewerKey, limit = 20 } = {}) {
      const params = cleanArgs({ status, exclude, viewerKey, limit });
      const result = await convex.query("streamSessions:list", params);
      return result ?? [];
    },

    async getSession(id) {
      if (!id) return null;
      return convex.query("streamSessions:get", { id });
    },

    async createSession(payload) {
      const body = cleanArgs({
        viewerKey: String(payload.viewerKey ?? payload.viewer_key ?? ""),
        status: String(payload.status ?? "draft"),
        currentStep: payload.currentStep ?? payload.current_step,
        stepIndex: payload.stepIndex ?? payload.step_index,
        stepHistory: payload.stepHistory ?? payload.step_history,
        params: payload.params,
        allowRepeatIps: payload.allowRepeatIps ?? payload.allow_repeat_ips
      });
      return convex.mutation("streamSessions:create", body);
    },

    async updateSession(id, patch) {
      const body = cleanArgs({
        id,
        viewerKey: patch.viewerKey ?? patch.viewer_key,
        status: patch.status,
        currentStep: patch.currentStep ?? patch.current_step,
        stepIndex: patch.stepIndex ?? patch.step_index,
        stepHistory: patch.stepHistory ?? patch.step_history,
        params: patch.params,
        allowRepeatIps: patch.allowRepeatIps ?? patch.allow_repeat_ips
      });
      return convex.mutation("streamSessions:update", body);
    },

    async listParticipants({ sessionId, viewerSession, limit = 200 } = {}) {
      const params = cleanArgs({
        session: sessionId,
        viewerSession,
        limit
      });
      const result = await convex.query("streamParticipants:list", params);
      return result ?? [];
    },

    async createParticipant(payload) {
      const body = cleanArgs({
        sessionId: payload.sessionId ?? payload.session,
        viewerSession: payload.viewerSession ?? payload.viewer_session,
        displayName: String(payload.displayName ?? payload.display_name ?? "Viewer"),
        status: String(payload.status ?? "pending"),
        fingerprint: payload.fingerprint
      });
      return convex.mutation("streamParticipants:create", body);
    },

    async updateParticipant(id, patch) {
      const body = cleanArgs({
        id,
        displayName: patch.displayName ?? patch.display_name,
        status: patch.status,
        fingerprint: patch.fingerprint,
        viewerSession: patch.viewerSession ?? patch.viewer_session
      });
      return convex.mutation("streamParticipants:update", body);
    },

    async getParticipant(id) {
      if (!id) return null;
      return convex.query("streamParticipants:get", { id });
    },

    async listVotes({ sessionId, stepId, limit = 200 } = {}) {
      const params = cleanArgs({
        session: sessionId,
        stepId,
        limit
      });
      const result = await convex.query("streamVotes:list", params);
      return result ?? [];
    },

    async createVote(payload) {
      const body = cleanArgs({
        sessionId: payload.sessionId ?? payload.session,
        stepId: String(payload.stepId ?? payload.step_id ?? ""),
        optionKey: String(payload.optionKey ?? payload.option_key ?? ""),
        optionMeta: payload.optionMeta ?? payload.option_meta,
        votedBy: payload.votedBy ?? payload.votedby
      });
      return convex.mutation("streamVotes:create", body);
    },

    subscribeSession(sessionId, callback, { intervalMs = defaultPollInterval } = {}) {
      if (!sessionId) return null;
      return startPoll(
        () => api.getSession(sessionId),
        callback,
        { intervalMs, keyPrefix: `session:${sessionId}` }
      );
    },

    subscribeVotes(sessionId, callback, { stepId, intervalMs = defaultPollInterval } = {}) {
      if (!sessionId) return null;
      return startPoll(
        () => api.listVotes({ sessionId, stepId }),
        callback,
        { intervalMs, keyPrefix: `votes:${sessionId}:${stepId ?? "*"}` }
      );
    },

    unsubscribe(handle) {
      stopPoll(handle);
    }
  };

  return api;
}

const streamsApi = createStreamsAPI();
export default streamsApi;
