import catGenerator from '../core/catGeneratorV2.js';
import { encodeCatShare } from '../core/catShare.js';
import { ensureSpriteDataLoaded, getDefaultStreamParams, createStreamSteps, cloneParams } from './cat-builder-stream-steps.js';
import streamsApi from '../convex/streams-api.js';
import mapperApi from '../convex/mapper-api.js';

class CatStreamHost {
    constructor() {
        this.canvas = document.getElementById('streamerCanvas');
        this.ctx = this.canvas?.getContext('2d');
        this.toast = document.getElementById('streamToast');
        this.statusBadge = document.getElementById('sessionStatus');
        this.stepStatus = document.getElementById('stepStatus');
        this.voteStepTitle = document.getElementById('voteStepTitle');
        this.voteStepDescription = document.getElementById('voteStepDescription');
        this.voteProgress = document.getElementById('voteProgress');
        this.voteGrid = document.getElementById('voteOptionGrid');
        this.sortVoteSelect = document.getElementById('sortVoteOptions');
        this.timelineContainer = document.getElementById('timelineContainer');
        this.viewerLinkRow = document.getElementById('viewerLinkRow');
        this.viewerLink = document.getElementById('viewerLink');
        this.copyViewerLinkBtn = document.getElementById('copyViewerLink');
        this.openViewerLinkBtn = document.getElementById('openViewerLink');
        if (this.openViewerLinkBtn) {
            this.openViewerLinkBtn.disabled = true;
        }
        this.signupStatusBadge = document.getElementById('signupStatus');
        this.sessionList = document.getElementById('sessionList');
        this.refreshSessionsBtn = document.getElementById('refreshSessions');
        this.participantList = document.getElementById('participantList');
        this.participantStatus = document.getElementById('participantStatus');
        this.refreshParticipantsBtn = document.getElementById('refreshParticipants');
        this.tieActions = document.getElementById('tieActions');
        this.tieMessage = document.getElementById('tieMessage');
        this.coinFlipBtn = document.getElementById('coinFlipTie');
        this.revoteTieBtn = document.getElementById('revoteTie');
        this.cancelTieBtn = document.getElementById('cancelTie');
        this.createBtn = document.getElementById('createSession');
        this.toggleSignupBtn = document.getElementById('toggleSignupGate');
        this.toggleVotesBtn = document.getElementById('toggleVotes');
        this.goNextStepBtn = document.getElementById('goNextStep');
        this.completeBtn = document.getElementById('completeSession');
        this.experimentModal = document.getElementById('experimentModal');
        this.experimentAcknowledgeBtn = document.getElementById('experimentAcknowledge');
        this.streamIntroModal = document.getElementById('streamIntroModal');
        this.streamIntroDismiss = document.getElementById('streamIntroDismiss');

        this.state = {
            params: getDefaultStreamParams(),
            history: [],
            locked: new Map()
        };
        this.steps = [];
        this.currentStepIndex = 0;
        this.session = null;
        this.currentVotes = new Map();
        this.votePollTimer = null;
        this.participantPollTimer = null;
        this.realtimeSessionId = null;
        this.realtimeAttached = false;
        this.realtimeRetryTimer = null;
        this.debugEnabled = true;
        try {
            window?.localStorage?.setItem('catStreamDebug', 'on');
        } catch (_) {
            /* ignore storage issues */
        }
        this.renderToken = 0;
        this.activeSessions = [];
        this.participants = [];
        this.activeParticipantCount = 0;
        this.currentTopTies = [];
        this.tieRevoteActive = false;
        this.autoClosedSignups = false;
        this.voteSortMode = 'order';
        this.previewOverride = null;

        this.streamApi = null;
        this.mapperApi = null;
        this.sessionSubscription = null;
        this.voteSubscription = null;

        this.init();
    }

    resolveDebugPreference() {
        try {
            if (typeof globalThis.catStreamDebug === 'boolean') {
                return globalThis.catStreamDebug;
            }
            const stored = window?.localStorage?.getItem('catStreamDebug');
            if (stored === 'off') return false;
            if (stored === 'on') return true;
        } catch (_) {
            /* ignore storage errors */
        }
        return true;
    }

    debugLog(...args) {
        if (!this.debugEnabled) return;
        console.log('[StreamHost]', ...args);
    }

    async init() {
        try {
            await ensureSpriteDataLoaded();
            this.steps = createStreamSteps(this.state);
            this.streamApi = streamsApi;
            this.mapperApi = mapperApi;
            this.debugLog('Initialising host UI');
            this.bindEvents();
            this.showExperimentModal();
            this.queueIntroModal();
            await this.renderPreview();
            this.updateStepUI();
            await this.resumeFromUrl();
            this.debugLog('Host initialised', {
                sessionId: this.session?.id || null,
                currentStep: this.session?.current_step || this.currentStep?.id || null
            });
        } catch (error) {
            console.error('Failed to initialise stream host', error);
            this.setStatusBadge('draft', 'Init failed');
            this.setStepStatus('Unable to load resources.');
        }
    }

    bindEvents() {
        this.createBtn?.addEventListener('click', () => this.createSession());
        this.toggleSignupBtn?.addEventListener('click', () => this.toggleSignupGate());
        this.toggleVotesBtn?.addEventListener('click', () => this.toggleVotes());
        this.goNextStepBtn?.addEventListener('click', () => this.handleNextStep());
        this.completeBtn?.addEventListener('click', () => this.finishSession());
        this.copyViewerLinkBtn?.addEventListener('click', () => this.copyViewerLink());
        this.openViewerLinkBtn?.addEventListener('click', () => this.openViewerLink());
        this.refreshSessionsBtn?.addEventListener('click', () => this.fetchActiveSessions());
        this.coinFlipBtn?.addEventListener('click', () => this.resolveTieByCoin());
        this.revoteTieBtn?.addEventListener('click', () => this.startTieRevote());
        this.cancelTieBtn?.addEventListener('click', () => this.clearTieRevote());
        this.experimentAcknowledgeBtn?.addEventListener('click', () => {
            this.hideExperimentModal();
            this.showIntroModal();
        });
        this.streamIntroDismiss?.addEventListener('click', () => this.hideIntroModal());
        this.refreshParticipantsBtn?.addEventListener('click', () => this.fetchParticipants());
        this.participantList?.addEventListener('click', event => this.onParticipantListClick(event));
        this.sortVoteSelect?.addEventListener('change', event => this.onVoteSortChange(event));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                this.hideExperimentModal();
                this.hideIntroModal();
            }
        });
    }

    showExperimentModal() {
        if (!this.experimentModal) return;
        this.experimentModal.hidden = false;
        this.experimentModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
            this.experimentAcknowledgeBtn?.focus?.();
        }, 0);
    }

    hideExperimentModal() {
        if (!this.experimentModal) return;
        if (document.activeElement === this.experimentAcknowledgeBtn) {
            this.experimentAcknowledgeBtn.blur();
        }
        if (this.experimentModal.contains(document.activeElement)) {
            document.activeElement?.blur?.();
        }
        this.experimentModal.hidden = true;
        this.experimentModal.setAttribute('aria-hidden', 'true');
    }

    queueIntroModal() {
        if (!this.streamIntroModal) return;
        if (!this.experimentModal && this.streamIntroModal.hidden) {
            this.showIntroModal();
        }
    }

    showIntroModal() {
        if (!this.streamIntroModal) return;
        this.streamIntroModal.hidden = false;
        this.streamIntroModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
            this.streamIntroDismiss?.focus?.();
        }, 0);
    }

    hideIntroModal() {
        if (!this.streamIntroModal) return;
        if (document.activeElement === this.streamIntroDismiss) {
            this.streamIntroDismiss.blur();
        }
        if (this.streamIntroModal.contains(document.activeElement)) {
            document.activeElement?.blur?.();
        }
        this.streamIntroModal.hidden = true;
        this.streamIntroModal.setAttribute('aria-hidden', 'true');
    }

    get currentStep() {
        return this.steps[this.currentStepIndex] || null;
    }

    async createSession() {
        if (!this.streamApi) return;
        try {
            this.hideIntroModal();
            this.resetState();
            const viewerKey = this.generateViewerKey();
            const record = await this.streamApi.createSession({
                viewer_key: viewerKey,
                status: 'live',
                current_step: this.currentStep?.id ?? 'colour',
                step_index: this.currentStepIndex,
                step_history: [],
                params: this.state.params,
                allow_repeat_ips: false
            });

            this.applySessionRecord(record, { reason: 'create' });
            this.setStepStatus('Share the link, then press Open Votes when you are ready.');
            this.startVotePolling();
            await this.fetchActiveSessions();
        } catch (error) {
            console.error('Failed to create session', error);
            this.setStepStatus('Unable to create session.');
        }
    }

    resetState() {
        this.state.params = getDefaultStreamParams();
        this.state.params._signupsOpen = true;
        this.state.history = [];
        this.state.locked = new Map();
        this.currentStepIndex = 0;
        this.currentVotes.clear();
        this.steps = createStreamSteps(this.state);
        this.session = null;
        if (this.viewerLinkRow) {
            this.viewerLinkRow.hidden = true;
        }
        if (this.viewerLink) {
            this.viewerLink.textContent = '';
        }
        if (this.openViewerLinkBtn) {
            this.openViewerLinkBtn.disabled = true;
        }
        this.previewOverride = null;
        if (this.signupStatusBadge) {
            this.signupStatusBadge.hidden = true;
        }
        if (this.toggleSignupBtn) {
            this.toggleSignupBtn.textContent = 'Close Sign Ups';
        }
        this.ensureSessionUrl(null);
        this.updateStepUI();
        this.renderPreview();
        this.renderTimeline();
        if (this.voteGrid) {
            this.voteGrid.innerHTML = '<div class="viewer-status">No options available.</div>';
        }
        if (this.tieActions) {
            this.tieActions.hidden = true;
        }
        this.stopVotePolling();
        if (this.participantPollTimer) {
            clearInterval(this.participantPollTimer);
            this.participantPollTimer = null;
        }
        this.detachRealtime();
        this.participants = [];
        this.activeParticipantCount = 0;
        this.autoClosedSignups = false;
        this.renderParticipantList([]);
        this.updateVoteProgress(0, 0);
        this.toggleButtons();
    }

    generateViewerKey() {
        if (typeof crypto?.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // Fallback for environments without randomUUID support
        return Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    ensureSessionUrl(sessionId) {
        if (typeof window === 'undefined') return;
        try {
            const url = new URL(window.location.href);
            if (sessionId) {
                url.searchParams.set('session', sessionId);
            } else {
                url.searchParams.delete('session');
            }
            window.history.replaceState({}, '', url);
        } catch (error) {
            console.warn('Failed to update session URL:', error);
        }
    }

    async resumeFromUrl() {
        if (!this.streamApi) return;
        try {
            const params = new URLSearchParams(window.location.search);
            const sessionId = params.get('session');
            if (!sessionId) {
                await this.fetchActiveSessions();
                return;
            }
            const record = await this.streamApi.getSession(sessionId);
            if (record) {
                this.applySessionRecord(record, { reason: 'url-resume' });
                this.startVotePolling();
                await this.fetchActiveSessions();
            } else {
                await this.fetchActiveSessions();
            }
        } catch (error) {
            console.warn('Unable to resume session from URL:', error);
            await this.fetchActiveSessions();
        }
    }

    async fetchActiveSessions() {
        if (!this.streamApi || !this.sessionList) return;
        try {
            const records = await this.streamApi.listSessions({ exclude: 'completed', limit: 20 });
            this.activeSessions = records || [];
            this.renderSessionList(this.activeSessions);
        } catch (error) {
            console.error('Failed to fetch active sessions', error);
            this.renderSessionList([]);
        }
    }

    renderSessionList(records) {
        if (!this.sessionList) return;
        this.sessionList.innerHTML = '';
        if (!records || !records.length) {
            const empty = document.createElement('li');
            empty.className = 'stream-session-empty';
            empty.textContent = 'No draft or live sessions.';
            this.sessionList.appendChild(empty);
            return;
        }

        for (const record of records) {
            const item = document.createElement('li');
            item.className = 'stream-session-item';

            const meta = document.createElement('div');
            meta.className = 'stream-session-meta';
            const title = document.createElement('strong');
            title.textContent = record.viewer_key ? `Viewer key: ${record.viewer_key}` : 'Session';
            const detail = document.createElement('span');
            const status = (record.status || 'draft').toUpperCase();
            const updated = record.updated ? new Date(record.updated).toLocaleTimeString() : '';
            detail.textContent = updated ? `${status} · ${updated}` : status;
            meta.append(title, detail);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'stream-btn';
            button.textContent = record.id === this.session?.id ? 'Active' : 'Resume';
            if (record.id === this.session?.id) {
                button.disabled = true;
            } else {
                button.addEventListener('click', () => this.resumeSession(record.id));
            }

            item.append(meta, button);
            this.sessionList.appendChild(item);
        }
    }

    async resumeSession(sessionId) {
        if (!this.streamApi || !sessionId) return;
        try {
            const record = await this.streamApi.getSession(sessionId);
            if (!record) return;
            this.applySessionRecord(record, { reason: 'manual-resume' });
            this.startVotePolling();
            this.refreshVotes();
            await this.fetchActiveSessions();
        } catch (error) {
            console.error('Failed to resume session:', error);
        }
    }

    applySessionRecord(record, { reason = 'resume' } = {}) {
        if (!record) return;
        this.session = record;
        this.state.params = record.params ? JSON.parse(JSON.stringify(record.params)) : getDefaultStreamParams();
        if (this.state.params._signupsOpen === undefined) {
            this.state.params._signupsOpen = true;
        }
        if (this.state.params._votesOpen === undefined) {
            this.state.params._votesOpen = false;
        }
        this.debugLog('Applying session record', {
            reason,
            sessionId: record.id,
            status: record.status,
            currentStep: record.current_step
        });
        const history = Array.isArray(record.step_history) ? JSON.parse(JSON.stringify(record.step_history)) : [];
        this.state.history = history;
        const randomKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2, 8));
        this.state.locked = new Map(history.map(entry => [(entry.step_id || entry.title || randomKey()), entry]));
        this.tieRevoteActive = Boolean(record.params && record.params._tieFilter);
        this.currentTopTies = [];
        this.autoClosedSignups = Array.isArray(history) && history.length > 0 && this.state.params._signupsOpen === false;

        const targetStepId = record.current_step || null;
        this.realignDynamicStepState(targetStepId);
        this.steps = createStreamSteps(this.state);

        const resolvedStepId = targetStepId || this.steps[0]?.id;
        const index = this.steps.findIndex(step => step.id === resolvedStepId);
        this.currentStepIndex = index >= 0 ? index : 0;
        if (!this.currentStep || this.previewOverride?.stepId !== this.currentStep.id) {
            this.previewOverride = null;
        }

        this.updateStepUI();
        this.renderTimeline();
        this.updateViewerLink();
        this.updateSignupStatusUI();
        this.toggleButtons();
        this.fetchParticipants(true);
        if ((record.status || '').toLowerCase() === 'live') {
            this.startParticipantPolling();
        } else if (this.participantPollTimer) {
            clearInterval(this.participantPollTimer);
            this.participantPollTimer = null;
        }
        this.ensureSessionUrl(record.id);
        this.currentVotes = new Map();
        this.renderVoteTable();
        this.renderPreview();
        this.updateVoteProgress(this.getTotalVotes(), this.getActiveParticipantCount());

        this.debugLog('Session state ready', {
            reason,
            currentStep: this.currentStep?.id,
            votesOpen: this.session?.params?._votesOpen,
            lockedCount: this.state.history?.length || 0
        });

        const status = (record.status || 'draft').toLowerCase();
        if (status === 'live') {
            this.setStatusBadge('live', 'Live now');
            this.setStepStatus('Viewers can vote. Lock in the leader when ready.');
        } else if (status === 'completed') {
            this.setStatusBadge('completed', 'Completed');
            this.setStepStatus('Session closed.');
        } else {
            this.setStatusBadge('draft', 'Draft session');
            this.setStepStatus('Share the link and go live when ready.');
        }

        if (record?.id && reason !== 'realtime') {
            this.attachRealtime(record.id).catch(error => {
                console.warn('Failed to attach realtime subscription:', error);
            });
        }
    }

    updateViewerLink() {
        if (!this.session || !this.viewerLinkRow) return;
        const url = new URL('./cat-builder-stream-viewer.html', window.location.href);
        url.searchParams.set('viewer', this.session.viewer_key);
        const linkText = url.toString();
        this.viewerLinkRow.hidden = false;
        this.viewerLink.textContent = linkText;
        if (this.openViewerLinkBtn) {
            this.openViewerLinkBtn.disabled = false;
        }
    }

    setStatusBadge(status, label) {
        if (!this.statusBadge) return;
        this.statusBadge.className = `stream-badge ${status}`;
        this.statusBadge.textContent = label;
    }

    setStepStatus(message) {
        if (this.stepStatus) {
            this.stepStatus.textContent = message;
        }
    }

    updateStepUI() {
        if (!this.currentStep) {
            this.voteStepTitle.textContent = 'No step active';
            this.voteStepDescription.textContent = 'Start a session to begin voting.';
            return;
        }
        this.voteStepTitle.textContent = this.currentStep.title;
        const tieFilter = this.session?.params?._tieFilter;
        if (Array.isArray(tieFilter) && tieFilter.length) {
            const labels = this.currentStep
                .getOptions(this.state)
                .filter(option => tieFilter.includes(option.key))
                .map(option => option.label)
                .join(', ');
            this.voteStepDescription.textContent = labels
                ? `Tie-break vote active for: ${labels}`
                : 'Tie-break vote active for the selected options.';
        } else {
            this.voteStepDescription.textContent = this.currentStep.description;
        }
    }

    toggleButtons() {
        const active = Boolean(this.session);
        const isLive = this.session?.status === 'live';
        const isCompleted = this.session?.status === 'completed';

        if (this.createBtn) {
            this.createBtn.disabled = false;
        }
        if (this.toggleVotesBtn) {
            this.toggleVotesBtn.disabled = !active || !isLive || !this.currentStep;
        }
        if (this.goNextStepBtn) {
            const finalReady = this.isFinalStepReady();
            if (finalReady) {
                this.goNextStepBtn.textContent = 'Open Final Viewer';
                this.goNextStepBtn.classList.add('primary');
                this.goNextStepBtn.disabled = !active;
            } else {
                this.goNextStepBtn.textContent = 'Next Step';
                this.goNextStepBtn.classList.remove('primary');
                const canAdvance = active && isLive && this.currentStep && !this.isVotesOpen();
                this.goNextStepBtn.disabled = !canAdvance;
            }
        }
        if (this.completeBtn) {
            this.completeBtn.disabled = !active || isCompleted;
        }
        this.updateVoteButtonLabel();
    }


    async finishSession() {
        if (!this.streamApi || !this.session) return;
        try {
            const updated = await this.streamApi.updateSession(this.session.id, {
                status: 'completed'
            });
            this.session = updated;
            this.updateSignupStatusUI();
            this.setStatusBadge('completed', 'Completed');
            this.setStepStatus('Session closed.');
            this.toggleButtons();
            await this.fetchActiveSessions();
        } catch (error) {
            console.error('Failed to finish session', error);
            this.setStepStatus('Unable to finish session.');
        }
    }

    startVotePolling(intervalMs = 3500) {
        this.stopVotePolling();
        if (!this.session || this.session.status === 'completed') return;
        this.debugLog('Starting vote polling', { intervalMs });
        this.refreshVotes();
        this.votePollTimer = setInterval(() => this.refreshVotes(), intervalMs);
    }

    stopVotePolling() {
        if (this.votePollTimer) {
            clearInterval(this.votePollTimer);
            this.votePollTimer = null;
            this.debugLog('Stopped vote polling');
        }
    }

    async refreshVotes() {
        if (!this.streamApi || !this.session || !this.currentStep) return;
        this.debugLog('Refreshing votes', {
            session: this.session.id,
            step: this.currentStep.id
        });
        try {
            const counts = await this.fetchVoteCounts(this.session.id, this.currentStep.id);
            this.currentVotes = counts;
            this.debugLog('Votes refreshed', {
                total: this.getTotalVotes(),
                uniqueOptions: this.currentVotes.size
            });
            this.renderVoteTable();
            this.renderPreview();
        } catch (error) {
            console.error('Failed to load votes', error);
        }
    }

    async attachRealtime(sessionId) {
        if (!this.streamApi || !sessionId) return;
        if (this.realtimeAttached && this.realtimeSessionId === sessionId) {
            return;
        }

        await this.detachRealtime();
        this.realtimeSessionId = sessionId;

        try {
            this.sessionSubscription = this.streamApi.subscribeSession(sessionId, record => {
                if (!record) return;
                this.debugLog('Realtime session event', {
                    step: record.current_step,
                    votesOpen: record.params?._votesOpen
                });
                this.applySessionRecord(record, { reason: 'realtime' });
                this.refreshVotes();
            }, { intervalMs: 1500 });

            this.voteSubscription = this.streamApi.subscribeVotes(sessionId, () => {
                this.refreshVotes();
            }, { intervalMs: 2000 });

            this.realtimeAttached = true;
            if (this.realtimeRetryTimer) {
                clearTimeout(this.realtimeRetryTimer);
                this.realtimeRetryTimer = null;
            }
            this.debugLog('Realtime attached', { session: sessionId });
            await this.refreshVotes();
            this.startVotePolling(1500);
        } catch (error) {
            console.warn('Streamer realtime subscription failed; falling back to polling.', error);
            this.realtimeAttached = false;
            this.debugLog('Realtime attach failed', { session: sessionId, error: error?.message });
            this.startVotePolling();
            this.scheduleRealtimeRetry(sessionId);
        }
    }

    async detachRealtime() {
        if (!this.streamApi) return;
        if (this.realtimeRetryTimer) {
            clearTimeout(this.realtimeRetryTimer);
            this.realtimeRetryTimer = null;
        }
        this.debugLog('Detaching realtime listeners');
        if (this.sessionSubscription) {
            this.streamApi.unsubscribe(this.sessionSubscription);
            this.sessionSubscription = null;
        }
        if (this.voteSubscription) {
            this.streamApi.unsubscribe(this.voteSubscription);
            this.voteSubscription = null;
        }
        this.realtimeAttached = false;
        this.realtimeSessionId = null;
    }

    scheduleRealtimeRetry(sessionId, delay = 4000) {
        if (!this.streamApi || !sessionId) return;
        if (this.realtimeRetryTimer) {
            clearTimeout(this.realtimeRetryTimer);
        }
        this.debugLog('Scheduling realtime retry', { session: sessionId, delay });
        this.realtimeRetryTimer = setTimeout(() => {
            this.attachRealtime(sessionId).catch(err => {
                console.warn('Streamer realtime retry failed:', err);
                this.debugLog('Realtime retry failed', { session: sessionId, error: err?.message });
            });
        }, delay);
    }

    async fetchVoteCounts(sessionId, stepId) {
        const tally = new Map();
        const votes = await this.streamApi.listVotes({ sessionId, stepId, limit: 500 });
        for (const item of votes) {
            const key = item.option_key;
            tally.set(key, (tally.get(key) || 0) + 1);
        }
        return tally;
    }

    onVoteSortChange(event) {
        const value = event?.target?.value || 'order';
        if (!['order', 'asc', 'desc'].includes(value)) {
            return;
        }
        this.voteSortMode = value;
        this.renderVoteTable();
    }

    getTotalVotes() {
        if (!this.currentVotes) return 0;
        let total = 0;
        for (const value of this.currentVotes.values()) {
            total += Number.isFinite(value) ? value : 0;
        }
        return total;
    }

    isVotesOpen() {
        return Boolean(this.session?.params?._votesOpen);
    }

    updateVoteButtonLabel() {
        if (!this.toggleVotesBtn) return;
        const open = this.isVotesOpen();
        const { option, votes } = this.pickLeadingOption() || {};
        this.currentLeader = option && votes > 0 ? option : null;
        this.toggleVotesBtn.textContent = open ? 'Close Votes' : 'Open Votes';
        if (!open && this.currentLeader) {
            this.toggleVotesBtn.title = `Current leader: ${this.currentLeader.label}`;
        } else {
            this.toggleVotesBtn.removeAttribute('title');
        }
        this.toggleVotesBtn.classList.toggle('primary', open);
    }

    async toggleVotes() {
        if (!this.session || !this.currentStep) return;
        const opening = !this.isVotesOpen();
        const params = this.session.params ? JSON.parse(JSON.stringify(this.session.params)) : {};
        params._votesOpen = opening;
        this.session.params = params;
        this.state.params = JSON.parse(JSON.stringify(params));
        this.debugLog(opening ? 'Opening votes' : 'Closing votes', {
            session: this.session?.id,
            step: this.currentStep?.id
        });
        if (opening) {
            this.previewOverride = null;
        }
        if (opening) {
            if (this.currentStep?.id && this.state.locked instanceof Map) {
                const stepId = this.currentStep.id;
                for (const [key, entry] of Array.from(this.state.locked.entries())) {
                    if (key === stepId || entry?.step_id === stepId) {
                        this.state.locked.delete(key);
                    }
                }
                this.state.locked = new Map(this.state.locked);
                this.state.history = Array.from(this.state.locked.values());
                if (Array.isArray(this.session.step_history)) {
                    this.session.step_history = this.state.history;
                }
            }
            this.currentTopTies = [];
            const patch = { params, step_history: this.state.history };
            await this.updateSessionRecord(patch);
            this.setStepStatus('Votes are open. Viewers can vote now.');
            this.updateVoteProgress(this.getTotalVotes(), this.getActiveParticipantCount());
            this.renderTimeline();
            this.renderVoteTable();
        } else {
            this.state.params._votesOpen = false;
            if (this.session?.params) {
                this.session.params._votesOpen = false;
            }
            await this.updateSessionRecord({ params });
            await this.refreshVotes();
            const { option, votes } = this.pickLeadingOption() || {};
            if (option && votes > 0) {
                const suffix = votes === 1 ? '' : 's';
                this.setStepStatus(`Votes closed. ${option.label} is leading with ${votes} vote${suffix}.`);
            } else {
                this.setStepStatus('Votes closed. No votes recorded yet.');
            }
        }
        this.updateVoteButtonLabel();
        this.toggleButtons();
    }

    async handleNextStep() {
        if (this.isFinalStepReady()) {
            await this.openFinalViewer();
            return;
        }
        if (!this.session || !this.currentStep) return;
        if (this.isVotesOpen()) {
            this.setStepStatus('Close votes before advancing to the next step.');
            return;
        }
        await this.applyLeader(true);
        this.updateVoteProgress(this.getTotalVotes(), this.getActiveParticipantCount());
    }

    async castVote(option) {
        if (!this.streamApi || !this.session || !this.currentStep) return;
        const votesWereClosed = !this.isVotesOpen();
        const stepId = this.currentStep?.id || this.session?.current_step;
        let streamerKey = option?.key || null;
        try {
            await this.streamApi.createVote({
                session: this.session.id,
                step_id: stepId,
                option_key: option.key,
                option_meta: {
                    label: option.label,
                    step: this.currentStep.title,
                    streamer: true
                }
            });
            this.showToast(votesWereClosed
                ? 'Streamer vote recorded (viewer voting is closed).'
                : 'Streamer vote recorded');
            this.debugLog('Streamer cast vote', {
                session: this.session?.id,
                step: stepId,
                option: option?.key,
                votesClosed: votesWereClosed
            });
            if (this.session?.params) {
                const dict = this.session.params._streamerVoteKeys || {};
                dict[stepId] = streamerKey;
                this.session.params._streamerVoteKeys = dict;
            }
            await this.refreshVotes();
        } catch (error) {
            console.error('Streamer vote failed', error);
            this.setStepStatus('Unable to record streamer vote.');
            this.debugLog('Streamer vote error', {
                session: this.session?.id,
                step: stepId,
                option: option?.key,
                error: error?.message
            });
        }
    }

    getDisabledOptions(stepId = this.currentStep?.id) {
        const map = this.session?.params?._disabledOptions || {};
        const list = stepId ? map[stepId] : undefined;
        return Array.isArray(list) ? list : [];
    }

    realignDynamicStepState(stepId) {
        if (!stepId || !this.state?.params) return;
        const params = this.state.params;

        const ensureTortieLayers = required => {
            const target = Number.isFinite(required) ? required : 0;
            if (target <= 0) return;
            params.isTortie = true;
            if (!Number.isFinite(params._tortieLayers) || params._tortieLayers < target) {
                params._tortieLayers = target;
            }
        };

        const ensureAccessorySlots = required => {
            const target = Number.isFinite(required) ? required : 0;
            if (target <= 0) return;
            if (!Number.isFinite(params._accessorySlots) || params._accessorySlots < target) {
                params._accessorySlots = target;
            }
        };

        const ensureScarSlots = required => {
            const target = Number.isFinite(required) ? required : 0;
            if (target <= 0) return;
            if (!Number.isFinite(params._scarSlots) || params._scarSlots < target) {
                params._scarSlots = target;
            }
        };

        const tortieLayerMatch = stepId.match(/^tortie_layer_(\d+)_(pattern|colour|mask)/i);
        if (tortieLayerMatch) {
            const layer = Number.parseInt(tortieLayerMatch[1], 10);
            if (!Number.isNaN(layer)) {
                ensureTortieLayers(layer);
            }
        } else {
            const tortieMoreMatch = stepId.match(/^tortie_add_layer_(\d+)/i);
            if (tortieMoreMatch) {
                const layer = Number.parseInt(tortieMoreMatch[1], 10);
                if (!Number.isNaN(layer)) {
                    ensureTortieLayers(Math.max(1, layer - 1));
                }
            }
        }

        const accessorySlotMatch = stepId.match(/^accessory_slot_(\d+)/i);
        if (accessorySlotMatch) {
            const slot = Number.parseInt(accessorySlotMatch[1], 10);
            if (!Number.isNaN(slot)) {
                ensureAccessorySlots(slot);
            }
        } else {
            const accessoryMoreMatch = stepId.match(/^accessory_more_(\d+)/i);
            if (accessoryMoreMatch) {
                const slot = Number.parseInt(accessoryMoreMatch[1], 10);
                if (!Number.isNaN(slot)) {
                    ensureAccessorySlots(Math.max(0, slot - 1));
                }
            }
        }

        const scarSlotMatch = stepId.match(/^scar_slot_(\d+)/i);
        if (scarSlotMatch) {
            const slot = Number.parseInt(scarSlotMatch[1], 10);
            if (!Number.isNaN(slot)) {
                ensureScarSlots(slot);
            }
        } else {
            const scarMoreMatch = stepId.match(/^scar_more_(\d+)/i);
            if (scarMoreMatch) {
                const slot = Number.parseInt(scarMoreMatch[1], 10);
                if (!Number.isNaN(slot)) {
                    ensureScarSlots(Math.max(0, slot - 1));
                }
            }
        }
    }

    async toggleOptionDisabled(option) {
        if (!this.session || !this.currentStep) return;
        const stepId = this.currentStep.id;
        const params = this.session.params ? JSON.parse(JSON.stringify(this.session.params)) : {};
        const map = params._disabledOptions ? JSON.parse(JSON.stringify(params._disabledOptions)) : {};
        const current = new Set(Array.isArray(map[stepId]) ? map[stepId] : []);
        let message;
        if (current.has(option.key)) {
            current.delete(option.key);
            message = 'Option enabled';
        } else {
            current.add(option.key);
            message = 'Option disabled';
        }
        if (current.size) {
            map[stepId] = Array.from(current);
        } else {
            delete map[stepId];
        }
        if (Object.keys(map).length) {
            params._disabledOptions = map;
        } else {
            delete params._disabledOptions;
        }
        this.session.params = params;
        this.state.params = JSON.parse(JSON.stringify(params));
        await this.updateSessionRecord({ params });
        this.renderVoteTable();
        this.showToast(message);
    }

    isStepLocked(stepId) {
        if (!stepId || !this.state || !this.state.locked) return false;
        const locked = this.state.locked;
        if (locked instanceof Map) {
            if (locked.has(stepId)) {
                return true;
            }
            return Array.from(locked.values()).some(entry => entry?.step_id === stepId);
        }
        if (Array.isArray(locked)) {
            return locked.some(entry => entry?.step_id === stepId);
        }
        return false;
    }

    isCurrentStepLocked() {
        return this.isStepLocked(this.currentStep?.id);
    }

    findLastLockedStepIndex() {
        if (!Array.isArray(this.steps) || !this.steps.length) {
            return -1;
        }
        for (let i = this.steps.length - 1; i >= 0; i -= 1) {
            const stepId = this.steps[i]?.id;
            if (stepId && this.isStepLocked(stepId)) {
                return i;
            }
        }
        return -1;
    }

    isFinalStepReady() {
        const status = (this.session?.status || '').toLowerCase();
        if (status === 'completed') {
            return true;
        }
        const stepId = this.currentStep?.id;
        if (!stepId) return false;
        if (stepId === 'pose' && this.isCurrentStepLocked()) {
            return true;
        }
        return false;
    }

    async openFinalViewer() {
        if (!this.session) return;
        try {
            const status = (this.session.status || '').toLowerCase();
            if (status !== 'completed') {
                await this.updateSessionRecord({
                    status: 'completed',
                    current_step: 'complete',
                    step_index: this.steps.length,
                    params: this.state.params
                });
            }
            const payload = this.buildSharePayload();
            const shareUrl = await this.createShareUrl(payload);
            if (!shareUrl) {
                throw new Error('Unable to generate final viewer link.');
            }
            window.open(shareUrl, '_blank', 'noopener');
            this.setStepStatus('Session completed. Final viewer opened in a new tab.');
            this.toggleButtons();
        } catch (error) {
            console.error('Failed to open final viewer', error);
            this.setStepStatus('Unable to open final viewer automatically.');
        }
    }

    sanitizeShareParams(source) {
        const params = cloneParams(source || {});
        const internalKeys = [
            '_signupsOpen',
            '_votesOpen',
            '_disabledOptions',
            '_tieFilter',
            '_tieIteration',
            '_streamerVoteKeys'
        ];
        for (const key of internalKeys) {
            if (key in params) {
                delete params[key];
            }
        }
        if (Array.isArray(params.tortie)) {
            params.tortie = params.tortie.map(layer => {
                if (!layer) return null;
                return {
                    pattern: layer.pattern,
                    colour: layer.colour,
                    mask: layer.mask
                };
            });
        }
        return params;
    }

    buildSharePayload() {
        const params = this.sanitizeShareParams(this.state?.params || {});
        const normalizeSlot = value => (value === undefined ? null : value);

        const accessorySlots = Array.isArray(params.accessories)
            ? params.accessories.map(normalizeSlot)
            : [];
        const scarSlots = Array.isArray(params.scars)
            ? params.scars.map(normalizeSlot)
            : [];
        const tortieSlots = Array.isArray(params.tortie)
            ? params.tortie.map(layer => (layer ? { ...layer } : null))
            : [];

        params.accessories = accessorySlots.slice();
        params.scars = scarSlots.slice();
        params.tortie = tortieSlots.map(layer => (layer ? { ...layer } : null));

        const counts = {
            accessories: Number.isFinite(params._accessorySlots) ? params._accessorySlots : accessorySlots.length,
            scars: Number.isFinite(params._scarSlots) ? params._scarSlots : scarSlots.length,
            tortie: Number.isFinite(params._tortieLayers) ? params._tortieLayers : tortieSlots.length
        };

        return {
            params,
            accessorySlots,
            scarSlots,
            tortieSlots,
            counts
        };
    }

    async createShareUrl(payload) {
        const viewerUrl = new URL('./single-cat-viewer.html', window.location.href);
        try {
            const mapperId = await this.persistCatShare(payload);
            if (mapperId) {
                viewerUrl.searchParams.set('id', mapperId);
                return viewerUrl.toString();
            }
        } catch (error) {
            console.warn('Failed to persist final cat payload:', error);
        }

        try {
            const encoded = encodeCatShare(payload);
            viewerUrl.searchParams.set('cat', encoded);
            return viewerUrl.toString();
        } catch (encodeError) {
            console.error('Failed to encode final cat payload:', encodeError);
            return null;
        }
    }

    async persistCatShare(payload) {
        if (!this.mapperApi) {
            throw new Error('Convex API unavailable');
        }
        const record = await this.mapperApi.create(payload);
        return record?.id || null;
    }

    getActiveParticipantCount() {
        const list = Array.isArray(this.participants) ? this.participants : [];
        let active = 0;
        for (const participant of list) {
            const status = (participant.status || 'active').toLowerCase();
            if (status === 'active') {
                active += 1;
            }
        }
        this.activeParticipantCount = active;
        return active;
    }

    updateVoteProgress(totalVotes = 0, activeCount = null) {
        if (!this.voteProgress) return;
        const status = (this.session?.status || '').toLowerCase();
        const votes = Number.isFinite(totalVotes) ? totalVotes : 0;
        const participants = activeCount ?? this.getActiveParticipantCount();
        const viewerVotes = this.getViewerVoteCount();
        this.voteProgress.classList.remove('warning', 'error', 'success');

        if (!this.session) {
            this.voteProgress.textContent = 'Waiting for a session to start.';
            return;
        }

        if (status !== 'live') {
            this.voteProgress.textContent = status === 'completed'
                ? 'Voting finished for this stream.'
                : 'Voting opens once the session is live.';
            if (status !== 'completed') {
                this.voteProgress.classList.add('warning');
            }
            return;
        }

        if (!this.isVotesOpen()) {
            this.voteProgress.textContent = 'Votes are closed for this step.';
            this.voteProgress.classList.add('warning');
            return;
        }

        if (!participants) {
            if (votes > 0) {
                this.voteProgress.textContent = `${votes} vote${votes === 1 ? '' : 's'} recorded.`;
            } else {
                this.voteProgress.textContent = 'Waiting for viewers to check in.';
            }
            this.voteProgress.classList.add('warning');
            return;
        }

        const cappedVotes = Math.min(viewerVotes, participants);
        const remaining = Math.max(participants - cappedVotes, 0);
        let message = `${cappedVotes} of ${participants} have voted`;
        if (remaining === 0 && participants > 0) {
            message += ' (all votes in)';
            this.voteProgress.classList.add('success');
        } else if (remaining === 1) {
            message += ' · waiting on 1 viewer';
        } else if (remaining > 1) {
            message += ` · waiting on ${remaining} viewers`;
        }
        this.voteProgress.textContent = message;
    }

    renderVoteTable() {
        if (!this.voteGrid) return;
        const activeCount = this.getActiveParticipantCount();
        if (!this.session || !this.currentStep) {
            this.voteGrid.innerHTML = '<div class="viewer-status">Waiting for the next step…</div>';
            this.renderTieState([]);
            this.updateVoteProgress(this.getTotalVotes(), activeCount);
            return;
        }

        this.debugLog('Render vote table', {
            step: this.currentStep?.id,
            title: this.currentStep?.title,
            options: (this.currentStep?.getOptions(this.state) || []).map(opt => opt.key)
        });

        let options = this.currentStep.getOptions(this.state) || [];
        const tieFilter = Array.isArray(this.session?.params?._tieFilter) ? this.session.params._tieFilter : null;
        const disabledSet = new Set(this.getDisabledOptions(this.currentStep?.id));

        if (!options.length) {
            this.voteGrid.innerHTML = '<div class="viewer-status">No options available.</div>';
            this.renderTieState([]);
            this.updateVoteProgress(this.getTotalVotes(), activeCount);
            return;
        }

        const votesOpen = this.isVotesOpen();

        let rows = [];
        for (const option of options) {
            const count = this.currentVotes.get(option.key) || 0;
            rows.push({ option, count });
        }

        const eligibleRows = rows.filter(row => !disabledSet.has(row.option.key));
        const tiePool = (tieFilter && tieFilter.length)
            ? eligibleRows.filter(row => tieFilter.includes(row.option.key))
            : eligibleRows;
        const maxVotes = tiePool.reduce((max, row) => Math.max(max, row.count), 0);
        const leaders = tiePool.filter(row => row.count === maxVotes && maxVotes > 0);
        this.currentTopTies = leaders.map(row => row.option);
        this.currentLeader = leaders.length === 1 ? leaders[0].option : null;

        if (tieFilter && tieFilter.length) {
            options = options.filter(option => tieFilter.includes(option.key));
        }

        if (this.voteSortMode && this.voteSortMode !== 'order') {
            rows = rows.sort((a, b) => {
                if (this.voteSortMode === 'desc') {
                    return b.count - a.count || a.option.label.localeCompare(b.option.label);
                }
                if (this.voteSortMode === 'asc') {
                    return a.count - b.count || a.option.label.localeCompare(b.option.label);
                }
                return 0;
            });
            const sortedKeys = rows.map(row => row.option.key);
            options = options.slice().sort((a, b) => sortedKeys.indexOf(a.key) - sortedKeys.indexOf(b.key));
        }

        this.voteGrid.innerHTML = '';

        if (!options.length) {
            this.voteGrid.innerHTML = '<div class="viewer-status">Waiting for tie-break selections…</div>';
            this.renderTieState(rows);
            const totalVotes = rows.reduce((sum, row) => sum + row.count, 0);
            this.updateVoteProgress(totalVotes, activeCount);
            return;
        }

        const leaderKey = this.currentLeader?.key || null;

        for (const option of options) {
            const count = this.currentVotes.get(option.key) || 0;
            const isTie = this.currentTopTies.some(tie => tie.key === option.key);
            const inFilter = tieFilter && tieFilter.includes(option.key);
            const isDisabled = disabledSet.has(option.key);
            const leading = Boolean(leaderKey && leaderKey === option.key);

            const card = document.createElement('div');
            card.className = 'vote-option-card';
            if (isTie || inFilter) {
                card.classList.add('tie-option');
            }
            if (isDisabled) {
                card.classList.add('disabled-option');
            }
            if (leading) {
                card.classList.add('leader-option');
            }
            if (this.previewOverride
                && this.previewOverride.stepId === this.currentStep?.id
                && this.previewOverride.optionKey === option.key) {
                card.classList.add('preview-option');
            }
            card.dataset.optionKey = option.key;
            card.title = isDisabled
                ? 'Disabled for voting'
                : votesOpen
                    ? 'Hover to cast a host vote or disable this option.'
                    : 'Click to preview this option or use the controls below.';

            const canvas = document.createElement('canvas');
            canvas.width = 140;
            canvas.height = 140;
            card.appendChild(canvas);
            this.renderOptionPreview(canvas, option);

            const title = document.createElement('div');
            title.className = 'vote-option-title';
            title.textContent = option.label;
            card.appendChild(title);

            const score = document.createElement('span');
            score.className = 'score-pill';
            score.textContent = `${count} vote${count === 1 ? '' : 's'}`;
            card.appendChild(score);

            const actions = document.createElement('div');
            actions.className = 'vote-card-actions';

            const voteBtn = document.createElement('button');
            voteBtn.type = 'button';
            voteBtn.className = 'vote-action vote-action--vote';
            voteBtn.textContent = 'Vote';
            voteBtn.disabled = isDisabled;
            voteBtn.title = isDisabled
                ? 'This option is disabled for viewers.'
                : votesOpen
                    ? 'Cast a host vote for this option.'
                    : 'Cast a host vote while viewer voting is closed.';
            voteBtn.addEventListener('click', event => {
                event.stopPropagation();
                this.castVote(option);
            });
            actions.appendChild(voteBtn);

            const disableBtn = document.createElement('button');
            disableBtn.type = 'button';
            disableBtn.className = `vote-action ${isDisabled ? 'vote-action--enable' : 'vote-action--disable'}`;
            disableBtn.textContent = isDisabled ? 'Enable' : 'Disable';
            disableBtn.title = isDisabled
                ? 'Allow this option to receive votes again.'
                : 'Prevent this option from receiving votes.';
            disableBtn.addEventListener('click', event => {
                event.stopPropagation();
                this.toggleOptionDisabled(option);
            });
            actions.appendChild(disableBtn);

            card.appendChild(actions);
            if (!votesOpen && !isDisabled) {
                card.classList.add('preview-clickable');
                card.addEventListener('click', () => {
                    if (this.isVotesOpen()) {
                        return;
                    }
                    this.setPreviewOverride(option);
                });
            }
            this.voteGrid.appendChild(card);
        }

        this.renderTieState(rows);
        const totalVotes = rows.reduce((sum, row) => sum + row.count, 0);
        this.updateVoteProgress(totalVotes, activeCount);
    }

    getViewerVoteCount() {
        if (!this.session?.id || !this.currentStep?.id) return 0;
        let viewerTotal = 0;
        if (!this.currentVotes?.size) return viewerTotal;
        const streamerOption = (this.session?.params?._streamerVoteKeys || {})[this.session.current_step];
        for (const [key, count] of this.currentVotes.entries()) {
            if (streamerOption && key === streamerOption) {
                viewerTotal += Math.max(0, count - 1);
            } else {
                viewerTotal += count;
            }
        }
        return Math.max(0, viewerTotal);
    }

    async renderOptionPreview(canvas, option) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        try {
            const params = cloneParams(this.state.params);
            option.mutate?.(params, this.state);
            const result = await catGenerator.generateCat(params);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Failed to render option preview', error);
        }
    }

    renderTieState(rows) {
        if (!this.tieActions) return;
        const ties = this.currentTopTies || [];
        const tieFilter = Array.isArray(this.session?.params?._tieFilter) ? this.session.params._tieFilter : null;

        const isTieFilterActive = tieFilter && tieFilter.length;
        if (!ties.length && !isTieFilterActive) {
            this.tieActions.hidden = true;
            this.coinFlipBtn?.setAttribute('disabled', 'disabled');
            this.revoteTieBtn?.setAttribute('disabled', 'disabled');
            this.cancelTieBtn?.setAttribute('disabled', 'disabled');
            return;
        }

        this.tieActions.hidden = false;

        if (isTieFilterActive) {
            const labels = tieFilter.map(key => {
                const row = rows.find(r => r.option.key === key);
                return row ? row.option.label : key;
            }).join(', ');
            this.tieMessage.textContent = `Tie-break vote active for: ${labels}`;
            this.coinFlipBtn?.setAttribute('disabled', 'disabled');
            this.revoteTieBtn?.removeAttribute('disabled');
            this.cancelTieBtn?.removeAttribute('disabled');
            return;
        }

        const labels = ties.map(t => t.label).join(', ');
        this.tieMessage.textContent = `Tie detected between: ${labels}`;
        this.coinFlipBtn?.removeAttribute('disabled');
        this.revoteTieBtn?.removeAttribute('disabled');
        this.cancelTieBtn?.setAttribute('disabled', 'disabled');
    }

    resolveTieByCoin() {
        const ties = this.currentTopTies || [];
        if (!ties.length) return;
        const choice = ties[Math.floor(Math.random() * ties.length)];
        // Temporarily bias the vote map so applyLeader picks the winner
        this.currentVotes = new Map([[choice.key, (this.currentVotes.get(choice.key) || 0) + 1]]);
        this.currentTopTies = [choice];
        this.applyLeader(false);
    }

    async startTieRevote() {
        const tieFilter = Array.isArray(this.session?.params?._tieFilter)
            ? [...this.session.params._tieFilter]
            : [];
        const ties = Array.isArray(this.currentTopTies) ? this.currentTopTies : [];
        const tieKeys = ties.length ? ties.map(t => t.key) : tieFilter;
        if (!tieKeys.length) return;
        const params = this.session.params ? JSON.parse(JSON.stringify(this.session.params)) : {};
        if (this.currentStep?.id && this.state.locked instanceof Map) {
            const stepId = this.currentStep.id;
            for (const [key, entry] of Array.from(this.state.locked.entries())) {
                if (key === stepId || entry?.step_id === stepId) {
                    this.state.locked.delete(key);
                }
            }
            this.state.locked = new Map(this.state.locked);
            this.state.history = Array.from(this.state.locked.values());
            if (Array.isArray(this.session.step_history)) {
                this.session.step_history = this.state.history;
            }
        }
        this.currentTopTies = [];
        params._tieFilter = tieKeys;
        params._votesOpen = true;
        params._tieIteration = (params._tieIteration || 0) + 1;
        const patch = { params, step_history: this.state.history };
        this.tieRevoteActive = true;
        this.session.params = params;
        this.state.params = JSON.parse(JSON.stringify(params));
        await this.updateSessionRecord(patch);
        this.setStepStatus('Tie-break vote in progress. Viewers can re-vote among the tied options.');
        this.showToast('Tie-break voting opened');
        this.refreshVotes();
        this.renderTimeline();
        this.updateVoteButtonLabel();
        this.toggleButtons();
    }

    async clearTieRevote() {
        if (!this.session) return;
        const params = this.session.params ? JSON.parse(JSON.stringify(this.session.params)) : {};
        if (!params._tieFilter && !params._tieIteration && !this.tieRevoteActive) return;
        delete params._tieFilter;
        const iteration = params._tieIteration || 0;
        if (iteration > 1) {
            params._tieIteration = iteration - 1;
        } else {
            delete params._tieIteration;
        }
        const patch = { params };
        this.tieRevoteActive = false;
        this.currentTopTies = [];
        this.session.params = params;
        this.state.params = JSON.parse(JSON.stringify(params));
        await this.updateSessionRecord(patch);
        this.setStepStatus('Tie-break mode cleared.');
        this.renderTieState([]);
        this.refreshVotes();
    }

    pickLeadingOption() {
        if (!this.currentStep) return null;
        const options = this.currentStep.getOptions(this.state) || [];
        if (!options.length) return null;
        let leader = options[0];
        let leaderVotes = this.currentVotes.get(leader.key) || 0;
        for (const option of options) {
            const votes = this.currentVotes.get(option.key) || 0;
            if (votes > leaderVotes) {
                leader = option;
                leaderVotes = votes;
            }
        }
        return { option: leader, votes: leaderVotes };
    }

    async applyLeader(advance) {
        if (!this.session || !this.currentStep) return;
        const { option, votes } = this.pickLeadingOption() || {};
        this.currentLeader = option && votes > 0 ? option : null;
        if (!option) {
            this.setStepStatus('No votes yet. Give viewers more time.');
            return;
        }
        this.previewOverride = null;

        const currentStep = this.currentStep;
        const currentStepId = currentStep?.id;
        this.currentStep.apply(option, this.state);
        this.steps = createStreamSteps(this.state);
        let refreshedIndex = -1;
        if (currentStepId) {
            refreshedIndex = this.steps.findIndex(step => step.id === currentStepId);
            if (refreshedIndex >= 0) {
                this.currentStepIndex = refreshedIndex;
            }
        }
        if (refreshedIndex < 0) {
            const fallbackIndex = this.findLastLockedStepIndex();
            if (fallbackIndex >= 0) {
                this.currentStepIndex = fallbackIndex;
            } else if (!Number.isInteger(this.currentStepIndex)) {
                this.currentStepIndex = -1;
            }
        }
        const summary = currentStep?.summarize(option) || option.label;
        const lockKey = currentStepId || option.key;
        this.state.locked.set(lockKey, {
            step_id: currentStepId || option.key,
            title: currentStep?.title || option.label,
            option_key: option.key,
            label: summary,
            votes
        });
        this.state.history = Array.from(this.state.locked.values());
        const paramsPatch = JSON.parse(JSON.stringify(this.state.params || {}));
        paramsPatch._votesOpen = false;
        if (paramsPatch._disabledOptions) {
            const stepId = currentStepId || option.key;
            if (stepId && paramsPatch._disabledOptions[stepId]) {
                delete paramsPatch._disabledOptions[stepId];
                if (!Object.keys(paramsPatch._disabledOptions).length) {
                    delete paramsPatch._disabledOptions;
                }
            }
        }
        if (paramsPatch._tieFilter) {
            delete paramsPatch._tieFilter;
        }
        if (paramsPatch._tieIteration) {
            delete paramsPatch._tieIteration;
        }
        const historyLength = Array.isArray(this.state.history) ? this.state.history.length : 0;
        let closedSignups = false;
        if (!this.autoClosedSignups && historyLength === 1 && paramsPatch._signupsOpen !== false) {
            paramsPatch._signupsOpen = false;
            this.autoClosedSignups = true;
            closedSignups = true;
        }
        const patch = {
            params: paramsPatch,
            step_history: this.state.history
        };
        this.state.params = paramsPatch;
        this.session.params = paramsPatch;
        this.tieRevoteActive = false;
        await this.updateSessionRecord(patch);
        await this.renderPreview();
        this.renderTimeline();
        const statusMessage = closedSignups
            ? `Locked in: ${summary}. Sign ups closed for new viewers.`
            : `Locked in: ${summary}.`;
        this.setStepStatus(statusMessage);
        if (closedSignups) {
            this.showToast('Sign ups closed automatically after the first step.');
        }

        if (advance) {
            await this.advanceStep();
        } else {
            this.toggleButtons();
            this.refreshVotes();
        }
    }

    async advanceStep() {
        if (!Array.isArray(this.steps) || !this.steps.length) {
            this.setStepStatus('No further steps available.');
            this.toggleButtons();
            return;
        }

        let nextIndex = (Number.isInteger(this.currentStepIndex) ? this.currentStepIndex : -1) + 1;
        while (nextIndex < this.steps.length) {
            const nextId = this.steps[nextIndex]?.id;
            if (!nextId || !this.isStepLocked(nextId)) {
                break;
            }
            nextIndex += 1;
        }

        if (nextIndex >= this.steps.length) {
            this.setStepStatus('All steps completed. Finish the session to wrap up.');
            await this.updateSessionRecord({
                current_step: 'complete',
                step_index: nextIndex
            });
            this.toggleButtons();
            return;
        }

        this.currentStepIndex = nextIndex;
        const nextStep = this.currentStep;
        this.previewOverride = null;
        this.updateStepUI();
        this.state.params._votesOpen = false;
        if (this.session?.params) {
            this.session.params._votesOpen = false;
        }
        await this.updateSessionRecord({
            current_step: nextStep.id,
            step_index: nextIndex,
            params: this.state.params
        });
        this.currentVotes.clear();
        this.renderVoteTable();
        this.setStepStatus('Get ready for the next step. Open votes when you are ready.');
        this.toggleButtons();
        this.refreshVotes();
    }

    async updateSessionRecord(patch) {
        if (!this.streamApi || !this.session) return;
        try {
            const updated = await this.streamApi.updateSession(this.session.id, patch);
            this.session = updated;
            if (Array.isArray(updated.step_history)) {
                this.state.history = JSON.parse(JSON.stringify(updated.step_history));
                const randomKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2, 8));
                this.state.locked = new Map(this.state.history.map(entry => [(entry.step_id || entry.title || randomKey()), entry]));
            }
            if (patch.params) {
                this.state.params = JSON.parse(JSON.stringify(updated.params || {}));
                this.steps = createStreamSteps(this.state);
                const currentId = this.session.current_step || this.steps[0]?.id;
                const index = this.steps.findIndex(step => step.id === currentId);
                if (index >= 0) {
                    this.currentStepIndex = index;
                }
                if (Array.isArray(this.state.history) && this.state.history.length) {
                    this.autoClosedSignups = this.state.params._signupsOpen === false;
                }
            }
            this.toggleButtons();
            this.updateSignupStatusUI();
            this.fetchParticipants(true);
            if ((this.session.status || '').toLowerCase() === 'live') {
                this.startParticipantPolling();
            } else if (this.participantPollTimer) {
                clearInterval(this.participantPollTimer);
                this.participantPollTimer = null;
            }
            this.updateVoteProgress(this.getTotalVotes(), this.getActiveParticipantCount());
        } catch (error) {
            console.error('Failed to update session', error);
        }
    }

    setPreviewOverride(option) {
        if (!this.currentStep || !option) return;
        if (this.previewOverride
            && this.previewOverride.stepId === this.currentStep.id
            && this.previewOverride.optionKey === option.key) {
            this.previewOverride = null;
        } else {
            this.previewOverride = {
                stepId: this.currentStep.id,
                optionKey: option.key,
                option
            };
        }
        this.renderPreview();
        this.renderVoteTable();
        if (!this.isVotesOpen()) {
            if (this.previewOverride) {
                this.setStepStatus(`Previewing: ${option.label} (not yet locked).`);
            } else {
                this.setStepStatus('Preview cleared. Showing current leader.');
            }
        }
    }

    buildPreviewParams() {
        const paramsClone = cloneParams(this.state.params);
        const previewState = {
            params: paramsClone,
            history: this.state.history,
            locked: new Map(this.state.locked)
        };

        const override = this.previewOverride;
        const currentStepId = this.currentStep?.id || this.session?.current_step || null;
        if (override && override.stepId === currentStepId && !this.isVotesOpen()) {
            try {
                this.currentStep?.apply?.(override.option, previewState);
                return previewState.params;
            } catch (error) {
                console.warn('Failed to apply preview override', error);
            }
        }

        if (this.session?.status === 'live' && this.currentStep) {
            try {
                const { option, votes } = this.pickLeadingOption() || {};
                this.currentLeader = option && votes > 0 ? option : null;
                const tieFilter = Array.isArray(this.session?.params?._tieFilter)
                    ? this.session.params._tieFilter
                    : null;
                const hasVotes = (votes ?? 0) > 0;
                const passesFilter = !tieFilter || !tieFilter.length || tieFilter.includes(option?.key);
                if (option && hasVotes && passesFilter) {
                    this.currentStep.apply(option, previewState);
                }
            } catch (error) {
                console.warn('Unable to project leading option for preview:', error);
            }
        }

        return previewState.params;
    }

    async renderPreview() {
        if (!this.canvas || !this.ctx) return;
        const token = ++this.renderToken;
        const previewParams = this.buildPreviewParams();
        try {
            const result = await catGenerator.generateCat(previewParams);
            if (this.renderToken !== token) return;
            this.adjustCanvasResolution(this.canvas, this.ctx);
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            const sourceWidth = result.canvas.width;
            const sourceHeight = result.canvas.height;
            const scale = Math.min(
                this.canvas.width / sourceWidth,
                this.canvas.height / sourceHeight
            );
            const fillFactor = 0.95;
            const destWidth = sourceWidth * scale * fillFactor;
            const destHeight = sourceHeight * scale * fillFactor;
            const offsetX = (this.canvas.width - destWidth) / 2;
            const offsetY = (this.canvas.height - destHeight) / 2;
            this.ctx.drawImage(
                result.canvas,
                0,
                0,
                sourceWidth,
                sourceHeight,
                offsetX,
                offsetY,
                destWidth,
                destHeight
            );
        } catch (error) {
            console.error('Failed to render preview', error);
        }
    }

    adjustCanvasResolution(canvas, ctx) {
        if (!canvas || !ctx) return;
        const ratio = window.devicePixelRatio || 1;
        const desiredWidth = Math.max(1, Math.floor(canvas.clientWidth * ratio));
        const desiredHeight = Math.max(1, Math.floor(canvas.clientHeight * ratio));
        if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
            canvas.width = desiredWidth;
            canvas.height = desiredHeight;
            ctx.setTransform?.(1, 0, 0, 1, 0, 0);
        }
    }

    renderTimeline() {
        if (!this.timelineContainer) return;
        if (!this.state.history.length) {
            this.timelineContainer.innerHTML = '<p class="viewer-status">No steps locked yet.</p>';
            return;
        }

        const items = this.state.history.map(entry => `
            <div class="stream-timeline-item">
                <h4>${entry.title}</h4>
                <p>${entry.label || 'No selection'} · Votes: ${entry.votes ?? 0}</p>
            </div>
        `).join('');
        this.timelineContainer.innerHTML = items;
    }

    async copyViewerLink() {
        const text = this.viewerLink?.textContent?.trim();
        if (!text) return;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const helper = document.createElement('textarea');
                helper.value = text;
                helper.setAttribute('readonly', '');
                helper.style.position = 'absolute';
                helper.style.opacity = '0';
                helper.style.pointerEvents = 'none';
                document.body.appendChild(helper);
                helper.select();
                document.execCommand('copy');
                document.body.removeChild(helper);
            }
            this.showToast('Viewer link copied!');
        } catch (error) {
            console.error('Failed to copy link', error);
            this.setStepStatus('Copy failed. Manually copy the link above.');
        }
    }

    openViewerLink() {
        const url = this.viewerLink?.textContent?.trim();
        if (!url) return;
        try {
            window.open(url, '_blank', 'noopener');
        } catch (error) {
            console.error('Failed to open link in new tab', error);
            this.setStepStatus('Unable to open viewer link automatically.');
        }
    }

    async toggleSignupGate() {
        if (!this.streamApi || !this.session) return;
        const params = this.session.params ? JSON.parse(JSON.stringify(this.session.params)) : {} ;
        const currentlyOpen = params._signupsOpen !== false;
        params._signupsOpen = !currentlyOpen;
        this.autoClosedSignups = params._signupsOpen === false;
        try {
            await this.updateSessionRecord({ params });
            this.showToast(params._signupsOpen ? 'Sign ups opened' : 'Sign ups closed');
            this.setStepStatus(params._signupsOpen ? 'New viewers can check in.' : 'Sign ups are paused.');
            this.fetchParticipants(true);
        } catch (error) {
            console.error('Failed to toggle sign ups', error);
            this.setStepStatus('Unable to update sign ups.');
        }
    }

    startParticipantPolling() {
        if (this.participantPollTimer) {
            clearInterval(this.participantPollTimer);
            this.participantPollTimer = null;
        }
        if (!this.session) return;
        this.participantPollTimer = setInterval(() => this.fetchParticipants(true), 12000);
    }

    onParticipantListClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        event.preventDefault();
        const id = button.dataset.id;
        const action = button.dataset.action;
        if (!id || !action) return;
        if (action === 'kick') {
            this.kickParticipant(id);
        } else if (action === 'allow') {
            this.reinstateParticipant(id);
        }
    }

    async fetchParticipants(silent = false) {
        if (!this.streamApi || !this.session) {
            this.participants = [];
            this.activeParticipantCount = 0;
            this.renderParticipantList([]);
            this.updateVoteProgress(this.getTotalVotes(), 0);
            return;
        }
        try {
            const participants = await this.streamApi.listParticipants({ sessionId: this.session.id });
            this.participants = participants || [];
            this.activeParticipantCount = this.getActiveParticipantCount();
            this.renderParticipantList(this.participants);
            this.updateVoteProgress(this.getTotalVotes(), this.activeParticipantCount);
        } catch (error) {
            if (!silent) {
                console.error('Failed to load participants', error);
            }
        }
    }

    renderParticipantList(list) {
        if (!this.participantList) return;
        const container = this.participantList;
        container.innerHTML = '';
        const participants = Array.isArray(list) ? list : [];
        this.activeParticipantCount = participants.filter(item => (item.status || 'active').toLowerCase() === 'active').length;
        if (this.participantStatus) {
            const signupsOpen = this.session?.params?._signupsOpen !== false;
            if (!this.session) {
                this.participantStatus.textContent = 'Start a session to allow viewers to check in.';
            } else if (!participants.length) {
                this.participantStatus.textContent = signupsOpen
                    ? 'No viewers have checked in yet.'
                    : 'Sign ups are paused. No viewers can join right now.';
            } else {
                const base = `${participants.length} viewer${participants.length === 1 ? '' : 's'} checked in.`;
                this.participantStatus.textContent = signupsOpen ? base : `${base} Sign ups are currently paused.`;
            }
        }
        if (!participants.length) {
            const empty = document.createElement('li');
            empty.className = 'stream-participant-empty';
            empty.textContent = 'No viewers yet.';
            container.appendChild(empty);
            return;
        }
        for (const participant of participants) {
            const status = (participant.status || 'active').toLowerCase();
            const item = document.createElement('li');
            item.className = `stream-participant-item ${status}`;
            const meta = document.createElement('div');
            meta.className = 'stream-participant-meta';
            const name = document.createElement('span');
            name.className = 'stream-participant-name';
            name.textContent = participant.display_name || 'Viewer';
            const statusLabel = document.createElement('span');
            statusLabel.className = 'stream-participant-status';
            statusLabel.textContent = status === 'active' ? 'Active' : 'Removed';
            meta.append(name, statusLabel);

            const actions = document.createElement('div');
            actions.className = 'stream-participant-actions';
            const btn = document.createElement('button');
            btn.className = 'stream-btn';
            btn.dataset.id = participant.id;
            if (status === 'active') {
                btn.dataset.action = 'kick';
                btn.textContent = 'Kick';
            } else {
                btn.dataset.action = 'allow';
                btn.textContent = 'Allow Back';
            }
            actions.appendChild(btn);

            item.append(meta, actions);
            container.appendChild(item);
        }
    }

    async kickParticipant(id) {
        if (!this.streamApi || !id) return;
        try {
            await this.streamApi.updateParticipant(id, { status: 'kicked' });
            this.showToast('Viewer removed');
            await this.fetchParticipants(true);
        } catch (error) {
            console.error('Failed to kick participant', error);
        }
    }

    async reinstateParticipant(id) {
        if (!this.streamApi || !id) return;
        try {
            await this.streamApi.updateParticipant(id, { status: 'active' });
            this.showToast('Viewer allowed back');
            await this.fetchParticipants(true);
        } catch (error) {
            console.error('Failed to reinstate participant', error);
        }
    }

    updateSignupStatusUI() {
        if (!this.signupStatusBadge) return;
        if (!this.session) {
            this.signupStatusBadge.hidden = true;
            if (this.toggleSignupBtn) {
                this.toggleSignupBtn.disabled = true;
                this.toggleSignupBtn.textContent = 'Close Sign Ups';
            }
            return;
        }

        const params = this.session.params || {};
        const signupsOpen = params._signupsOpen !== false;
        this.signupStatusBadge.hidden = false;
        this.signupStatusBadge.className = `stream-badge ${signupsOpen ? 'testing' : 'danger'}`;
        this.signupStatusBadge.textContent = signupsOpen ? 'Sign ups open' : 'Sign ups closed';
        if (this.toggleSignupBtn) {
            const disabled = this.session.status !== 'live';
            this.toggleSignupBtn.disabled = disabled;
            this.toggleSignupBtn.textContent = signupsOpen ? 'Close Sign Ups' : 'Open Sign Ups';
        }
    }

    showToast(message) {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.classList.add('visible');
        setTimeout(() => this.toast.classList.remove('visible'), 1800);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new CatStreamHost();
});
