import catGenerator from '../core/catGeneratorV2.js';
import {
    ensureSpriteDataLoaded,
    getDefaultStreamParams,
    createStreamSteps,
    cloneParams,
    getStepById
} from './cat-builder-stream-steps.js';
import streamsApi from '../convex/streams-api.js';
import mapperApi from '../convex/mapper-api.js';

class CatStreamViewer {
    constructor() {
        this.canvas = document.getElementById('viewerCanvas');
        this.ctx = this.canvas?.getContext('2d');
        this.toast = document.getElementById('viewerToast');
        this.stepTitle = document.getElementById('viewerStepTitle');
        this.stepDescription = document.getElementById('viewerStepDescription');
        this.sessionStatus = document.getElementById('viewerSessionStatus');
        this.alertBox = document.getElementById('viewerAlert');
        this.optionGrid = document.getElementById('optionGrid');
        this.scoreTable = document.getElementById('viewerScoreTable');
        this.scoreTooltip = document.getElementById('scoreTooltip');
        this.scoreTooltipCanvas = document.getElementById('scoreTooltipCanvas');
        this.scoreTooltipCtx = this.scoreTooltipCanvas?.getContext('2d') || null;
        this.timelineContainer = document.getElementById('viewerTimeline');
        this.nameModal = document.getElementById('viewerNameModal');
        this.nameForm = document.getElementById('viewerNameForm');
        this.nameInput = document.getElementById('viewerNameInput');
        this.nameError = document.getElementById('viewerNameError');
        this.nameSubmitBtn = this.nameForm?.querySelector("button[type='submit']") || null;

        const params = new URLSearchParams(window.location.search);
        this.viewerKey = params.get('viewer');
        this.viewerSessionId = null;

        this.streamApi = null;
        this.mapperApi = null;
        this.sessionSubscription = null;
        this.voteSubscription = null;
        this.steps = [];
        this.session = null;
        this.currentStep = null;
        this.state = {
            params: getDefaultStreamParams(),
            localVotes: new Map()
        };
        this.renderToken = 0;
        this.votePollTimer = null;
        this.sessionPollTimer = null;
        this.currentVotes = new Map();
        this.realtimeAttached = false;
        this.fingerprint = this.getOrCreateFingerprint();
        this.activeTieFilter = null;
        this.enableRealtime = true;
        this.realtimeRetryTimer = null;
        this.alertTimeout = null;
        this.toastTimeout = null;
        this.participantId = null;
        this.participantStatus = 'pending';
        this.participantName = null;
        this.participantStatusTimer = null;
        this.ensureParticipantPromise = null;
        this.votingDisabled = false;
        this.votingDisabledReason = '';
        this.debugEnabled = true;
        try {
            window?.localStorage?.setItem('catStreamDebug', 'on');
        } catch (_) {
            /* ignore storage issues */
        }
        this.dynamicSignature = this.getDynamicSignature(this.state.params);

        this.nameForm?.addEventListener('submit', event => this.handleNameSubmit(event));
        this.scoreTable?.addEventListener('mousemove', event => this.handleScoreHover(event));
        this.scoreTable?.addEventListener('mouseleave', () => this.hideScoreTooltip());

        this.init(params.get('viewerSession'));

        window.addEventListener('beforeunload', () => {
            this.cleanupRealtime();
            this.clearPolling();
        });
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
            /* ignore */
        }
        return true;
    }

    debugLog(...args) {
        if (!this.debugEnabled) return;
        console.log('[StreamViewer]', ...args);
    }

    getDynamicSignature(params) {
        const source = params || {};
        const tortie = Number.isFinite(source?._tortieLayers) ? source._tortieLayers : 0;
        const acc = Number.isFinite(source?._accessorySlots) ? source._accessorySlots : 0;
        const scar = Number.isFinite(source?._scarSlots) ? source._scarSlots : 0;
        return `${tortie}|${acc}|${scar}`;
    }

    getOrCreateFingerprint() {
        try {
            const baseStorage = window.localStorage || window.sessionStorage;
            const tabStorage = window.sessionStorage || window.localStorage;
            const baseKey = 'stream-viewer-fingerprint';
            let value = baseStorage?.getItem(baseKey) || null;
            if (!value) {
                value = typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
                baseStorage?.setItem(baseKey, value);
            }

            const tabKey = 'stream-viewer-tab-id';
            let tabValue = tabStorage?.getItem(tabKey) || null;
            if (!tabValue) {
                tabValue = `${value}-${Math.random().toString(36).slice(2, 10)}`;
                tabStorage?.setItem(tabKey, tabValue);
            }
            return tabValue;
        } catch (error) {
            console.warn('Unable to persist viewer fingerprint, using ephemeral value.', error);
            return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        }
    }

    getOrCreateViewerSessionId(initial) {
        try {
            const storage = window.sessionStorage || window.localStorage;
            if (initial) {
                storage?.setItem('stream-viewer-session', initial);
                return initial;
            }
            let existing = storage?.getItem('stream-viewer-session');
            if (!existing) {
                existing = typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
                storage?.setItem('stream-viewer-session', existing);
            }
            return existing;
        } catch (error) {
            console.warn('Unable to persist viewer session id, using ephemeral value.', error);
            return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        }
    }

    ensureViewerSessionInUrl(viewerSessionId) {
        if (typeof window === 'undefined' || !viewerSessionId) return;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('viewerSession', viewerSessionId);
            window.history.replaceState({}, '', url);
        } catch (error) {
            console.warn('Unable to persist viewer session id in url', error);
        }
    }

    ensureViewerKeyInUrl(viewerKey) {
        if (typeof window === 'undefined' || !viewerKey) return;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('viewer', viewerKey);
            window.history.replaceState({}, '', url);
        } catch (error) {
            console.warn('Unable to persist viewer key in url', error);
        }
    }

    normaliseDisplayName(value) {
        return (value || '')
            .toString()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
    }

    buildViewerSessionIdFromName(displayName) {
        const base = displayName.toLowerCase();
        let hash = 0;
        for (let i = 0; i < base.length; i += 1) {
            hash = (hash << 5) - hash + base.charCodeAt(i);
            hash |= 0;
        }
        const token = (hash >>> 0).toString(16).padStart(8, '0');
        return `name-${token}`;
    }

    persistViewerSessionId(viewerSessionId) {
        try {
            const storage = window.sessionStorage || window.localStorage;
            if (viewerSessionId) {
                storage?.setItem('stream-viewer-session', viewerSessionId);
                this.ensureViewerSessionInUrl(viewerSessionId);
            }
        } catch (error) {
            console.warn('Unable to persist viewer session id', error);
        }
    }

    showNameModal() {
        if (!this.nameModal) return;
        this.nameModal.hidden = false;
        this.nameModal.setAttribute('aria-hidden', 'false');
        window.requestAnimationFrame(() => {
            this.nameInput?.focus?.();
        });
    }

    hideNameModal() {
        if (!this.nameModal) return;
        this.nameModal.hidden = true;
        this.nameModal.setAttribute('aria-hidden', 'true');
    }

    setNameError(message) {
        if (!this.nameError) return;
        this.nameError.textContent = message || '';
    }

    promptForParticipantName() {
        if (this.nameInput && this.participantName) {
            this.nameInput.value = this.participantName;
        }
        this.setNameError('');
        this.showNameModal();
    }

    handleNameSubmit(event) {
        event?.preventDefault?.();
        if (!this.nameInput) return;
        const raw = this.nameInput.value || '';
        const trimmed = this.normaliseDisplayName(raw);
        if (!trimmed) {
            this.setNameError('Enter a display name to join the stream.');
            this.nameInput.focus();
            return;
        }
        this.registerParticipant(trimmed);
    }

    setVotingAvailability(enabled, reason = '') {
        this.votingDisabled = !enabled;
        this.votingDisabledReason = this.votingDisabled ? (reason || '') : '';
        this.updateOptionButtons();
    }

    async registerParticipant(displayName) {
        if (!this.streamApi || !this.session) return;
        const name = this.normaliseDisplayName(displayName);
        if (!name) {
            this.setNameError('Name must contain at least one character.');
            return;
        }

        const nextSessionId = this.buildViewerSessionIdFromName(name);
        const switchingName = !this.viewerSessionId || this.viewerSessionId !== nextSessionId;
        if (switchingName) {
            this.participantId = null;
            this.participantStatus = 'pending';
            this.state.localVotes.clear();
            this.currentVotes.clear();
            this.updateOptionButtons();
            this.renderScoreboard();
        }
        this.viewerSessionId = nextSessionId;
        this.persistViewerSessionId(nextSessionId);

        this.setNameError('');
        if (this.nameSubmitBtn) {
            this.nameSubmitBtn.disabled = true;
        }

        try {
            let record = null;
            if (this.participantId && !switchingName) {
                record = await this.streamApi.updateParticipant(this.participantId, {
                    display_name: name,
                    status: 'active',
                    fingerprint: this.fingerprint
                });
            } else {
                record = await this.streamApi.createParticipant({
                    session: this.session.id,
                    viewer_session: this.viewerSessionId,
                    display_name: name,
                    status: 'active',
                    fingerprint: this.fingerprint
                });
            }

            if (record) {
                this.applyParticipantRecord(record, { silent: false });
                this.hideNameModal();
                this.startParticipantStatusPolling();
                this.showToast('Checked in! Ready to vote.');
            }
        } catch (error) {
            console.error('Failed to register participant', error);
            const payload = error?.payload || {};
            const rawMessage = String(payload.error || error?.message || '').toLowerCase();
            const specific = payload.display_name || payload.viewer_session || payload.status;
            let friendly = specific || 'Unable to join right now.';
            if (rawMessage.includes('sign ups')) {
                friendly = 'Sign ups are disabled by the streamer right now.';
                this.hideNameModal();
                this.setVotingAvailability(false, friendly);
            } else if (rawMessage.includes('already checked in') || rawMessage.includes('already joined')) {
                friendly = 'That name is already checked in for this stream.';
            }
            this.setNameError(friendly);
        } finally {
            if (this.nameSubmitBtn) {
                this.nameSubmitBtn.disabled = false;
            }
        }
    }

    async findParticipantRecord() {
        if (!this.streamApi || !this.session || !this.viewerSessionId) return null;
        try {
            const items = await this.streamApi.listParticipants({
                sessionId: this.session.id,
                viewerSession: this.viewerSessionId,
                limit: 1
            });
            return Array.isArray(items) ? items[0] || null : null;
        } catch (error) {
            console.warn('Unable to look up participant', error);
            return null;
        }
    }

    async ensureParticipantRegistration({ fromStatusPoll = false } = {}) {
        if (!this.streamApi || !this.session || !this.viewerSessionId) return null;
        if (this.ensureParticipantPromise) {
            return this.ensureParticipantPromise;
        }

        const work = (async () => {
            let record = null;

            if (this.participantId) {
                try {
                    record = await this.streamApi.getParticipant(this.participantId);
                    if (record?.session !== this.session.id) {
                        record = null;
                        this.participantId = null;
                        this.participantStatus = 'pending';
                        this.participantName = null;
                    }
                } catch (_) {
                    record = null;
                    this.participantId = null;
                    this.participantStatus = 'pending';
                    this.participantName = null;
                }
            }

            if (!record) {
                record = await this.findParticipantRecord();
            }

            if (record) {
                this.applyParticipantRecord(record, { silent: fromStatusPoll });
                this.startParticipantStatusPolling();
                return record;
            }

            this.participantId = null;
            this.participantStatus = 'pending';
            this.participantName = null;

            const signupsOpen = (this.session.params?._signupsOpen !== false);
            if (!signupsOpen) {
                this.hideNameModal();
                this.setNameError('');
                this.setVotingAvailability(false, 'Sign ups are disabled. Wait for the streamer to reopen them.');
                return null;
            }

            this.setVotingAvailability(false, 'Enter your name to join the vote.');
            if (!fromStatusPoll) {
                this.promptForParticipantName();
            }
            return null;
        })();

        this.ensureParticipantPromise = work;
        try {
            return await work;
        } finally {
            if (this.ensureParticipantPromise === work) {
                this.ensureParticipantPromise = null;
            }
        }
    }

    applyParticipantRecord(record, { silent = false } = {}) {
        if (!record) return;
        const previousStatus = this.participantStatus;
        this.participantId = record.id;
        this.participantName = record.display_name || '';
        const status = (record.status || 'active').toLowerCase();
        this.participantStatus = status;
        if (record.viewer_session) {
            this.viewerSessionId = record.viewer_session;
            this.persistViewerSessionId(this.viewerSessionId);
        }

        if (status === 'active') {
            this.setVotingAvailability(true);
            this.hideNameModal();
            if (!silent && previousStatus === 'kicked') {
                this.showToast('You were allowed back in.');
            }
        } else if (status === 'kicked') {
            this.setVotingAvailability(false, 'You have been removed from this stream.');
            if (!silent && previousStatus !== 'kicked') {
                this.showToast('You were removed by the streamer.');
            }
        } else {
            this.setVotingAvailability(false, 'Waiting for the streamer to allow you in.');
        }

        if (this.nameInput && this.participantName && !this.nameInput.value) {
            this.nameInput.value = this.participantName;
        }

        this.updateOptionButtons();

        if ((this.session?.status || '').toLowerCase() === 'live') {
            this.startParticipantStatusPolling();
        }
    }

    startParticipantStatusPolling() {
        if (this.participantStatusTimer) {
            clearInterval(this.participantStatusTimer);
        }
        if (!this.session || (this.session.status || '').toLowerCase() !== 'live') {
            return;
        }
        this.participantStatusTimer = setInterval(() => {
            this.refreshParticipantStatus({ silent: true });
        }, 12000);
    }

    stopParticipantStatusPolling() {
        if (this.participantStatusTimer) {
            clearInterval(this.participantStatusTimer);
            this.participantStatusTimer = null;
        }
    }

    async refreshParticipantStatus({ silent = false } = {}) {
        try {
            await this.ensureParticipantRegistration({ fromStatusPoll: true });
        } catch (error) {
            if (!silent) {
                console.warn('Failed to refresh participant status', error);
            }
        }
    }

    getCurrentVotingState() {
        const status = (this.session?.status || 'draft').toLowerCase();
        if (status !== 'live') {
            if (status === 'completed') {
                return { code: 'finished', reason: 'Voting has finished for this stream.' };
            }
            return { code: 'not_live', reason: 'Waiting for the streamer to go live.' };
        }
        if ((this.session?.params?._votesOpen ?? false) !== true) {
            return { code: 'votes_closed', reason: 'Voting is closed. Wait for the streamer to open voting.' };
        }
        if (this.participantStatus === 'kicked') {
            return { code: 'kicked', reason: 'You have been removed from this stream.' };
        }
        if (!this.participantId) {
            return { code: 'needs_name', reason: 'Enter your name to join the vote.' };
        }
        if (this.participantStatus !== 'active') {
            return { code: 'pending', reason: 'Waiting for the streamer to allow you in.' };
        }
        if (this.votingDisabled && this.votingDisabledReason) {
            return { code: 'override', reason: this.votingDisabledReason };
        }
        return { code: 'ready', reason: '' };
    }

    updateOptionButtons() {
        if (!this.optionGrid) return;
        const state = this.getCurrentVotingState();
        const currentStepId = this.session?.current_step || null;
        const votedKey = currentStepId ? this.state.localVotes.get(currentStepId) : null;
        for (const button of this.optionGrid.querySelectorAll('.vote-option-card')) {
            const subtitle = button.querySelector('.vote-option-subtitle');
            const optionDisabled = button.dataset.disabled === 'true';
            const disable = optionDisabled || state.code !== 'ready' || Boolean(votedKey);
            button.disabled = disable;
            button.classList.toggle('disabled', disable);
            button.classList.toggle('disabled-option', optionDisabled);
            if (!subtitle) continue;
            if (optionDisabled) {
                subtitle.textContent = 'Disabled by streamer';
            } else if (state.code !== 'ready') {
                subtitle.textContent = state.reason || 'Voting unavailable';
            } else if (votedKey) {
                const key = button.dataset.key;
                subtitle.textContent = key === votedKey ? 'Vote recorded' : 'Vote already recorded in this tab';
            } else {
                subtitle.textContent = 'Click to vote';
            }
        }
    }

    async init(initialViewerSession) {
        if (!this.viewerKey) {
            this.setAlert('Missing viewer key. Ask the streamer for a fresh link.');
            return;
        }

        try {
            this.debugLog('Initialising viewer', {
                viewerKey: this.viewerKey,
                initialViewerSession
            });
            const spritePromise = ensureSpriteDataLoaded();
            this.streamApi = streamsApi;
            this.mapperApi = mapperApi;
            this.steps = createStreamSteps({ params: this.state.params });
            this.viewerSessionId = this.getOrCreateViewerSessionId(initialViewerSession);
            this.ensureViewerSessionInUrl(this.viewerSessionId);

            let session = null;
            if (this.viewerKey) {
                session = await this.loadSessionByKey(this.viewerKey);
            }
            if (session?.viewer_key) {
                this.viewerKey = session.viewer_key;
                this.ensureViewerKeyInUrl(this.viewerKey);
            }

            if (!session) {
                this.setAlert('Stream not found. Double-check the link.');
                return;
            }

            const realtimePromise = this.enableRealtime
                ? this.setupRealtime(session.id)
                : Promise.resolve();

            await spritePromise;
            this.applySessionUpdate(session, { initial: true });
            await this.ensureParticipantRegistration();

            if (this.enableRealtime) {
                try {
                    await realtimePromise;
                } catch (error) {
                    console.warn('Initial realtime attach failed:', error);
                    this.debugLog('Initial realtime attach failed', { error: error?.message });
                }
            }

            this.startPolling();
            this.debugLog('Viewer initialised', {
                sessionId: this.session?.id || null,
                currentStep: this.session?.current_step || this.currentStep?.id || null
            });
        } catch (error) {
            console.error('Failed to initialise viewer', error);
            this.setAlert('Unable to connect to the stream right now.');
        }
    }

    async loadSessionByKey(key) {
        if (!this.streamApi) return null;
        try {
            const sessions = await this.streamApi.listSessions({ viewerKey: key, limit: 5 });
            return Array.isArray(sessions) ? sessions[0] || null : null;
        } catch (error) {
            console.error('Failed to load session by key', error);
            return null;
        }
    }

    startPolling({ immediate = true } = {}) {
        this.clearPolling();
        if (immediate) {
            this.refreshVotes();
        }
        const sessionInterval = this.realtimeAttached ? 8000 : 4000;
        const voteInterval = this.realtimeAttached ? 4500 : 3000;
        this.debugLog('Starting polling', { sessionInterval, voteInterval, realtime: this.realtimeAttached });
        this.sessionPollTimer = setInterval(() => this.pollSession(), sessionInterval);
        this.votePollTimer = setInterval(() => this.refreshVotes(), voteInterval);
    }

    clearPolling() {
        if (this.sessionPollTimer) {
            clearInterval(this.sessionPollTimer);
            this.sessionPollTimer = null;
            this.debugLog('Stopped session polling');
        }
        if (this.votePollTimer) {
            clearInterval(this.votePollTimer);
            this.votePollTimer = null;
            this.debugLog('Stopped vote polling');
        }
        this.stopParticipantStatusPolling();
    }



    cleanupRealtime() {
        if (!this.streamApi) return;
        if (this.sessionSubscription) {
            this.streamApi.unsubscribe(this.sessionSubscription);
            this.sessionSubscription = null;
        }
        if (this.voteSubscription) {
            this.streamApi.unsubscribe(this.voteSubscription);
            this.voteSubscription = null;
        }
        this.realtimeAttached = false;
        if (this.realtimeRetryTimer) {
            clearTimeout(this.realtimeRetryTimer);
            this.realtimeRetryTimer = null;
        }
        this.debugLog('Realtime cleaned up');
    }

    async setupRealtime(sessionId) {
        if (!this.streamApi || !sessionId) return;
        try {
            this.cleanupRealtime();
            this.sessionSubscription = this.streamApi.subscribeSession(sessionId, record => {
                if (!record) return;
                this.debugLog('Realtime session event', {
                    step: record.current_step,
                    votesOpen: record.params?._votesOpen
                });
                this.applySessionUpdate(record, { initial: false, fromRealtime: true });
            }, { intervalMs: 1500 });

            this.voteSubscription = this.streamApi.subscribeVotes(sessionId, () => {
                this.refreshVotes();
            }, { intervalMs: 2000 });

            this.realtimeAttached = true;
            this.startPolling({ immediate: false });
            if (this.realtimeRetryTimer) {
                clearTimeout(this.realtimeRetryTime

    scheduleRealtimeRetry(sessionId, delay = 4000) {
        if (!this.enableRealtime || !sessionId) return;
        if (this.realtimeRetryTimer) {
            clearTimeout(this.realtimeRetryTimer);
        }
        this.debugLog('Scheduling realtime retry', { sessionId, delay });
        this.realtimeRetryTimer = setTimeout(() => {
            this.setupRealtime(sessionId).catch(err => {
                console.warn('Realtime retry failed:', err);
                this.debugLog('Realtime retry failed', { sessionId, error: err?.message });
            });
        }, delay);
    }

    async pollSession() {
        if (!this.streamApi || !this.session) return;
        try {
            const record = await this.streamApi.getSession(this.session.id);
            if (record) {
                this.applySessionUpdate(record, { initial: false });
            }
        } catch (error) {
            console.error('Failed to refresh session', error);
            this.debugLog('Session poll failed', { error: error?.message });
        }
    }

    applySessionUpdate(sessionRecord, { initial }) {
        const previousStepId = this.session?.current_step;
        const previousSessionId = this.session?.id;
        const previousDisabled = JSON.stringify(this.session?.params?._disabledOptions || {});
        const prevSignature = this.getDynamicSignature(this.state?.params);
        const sessionChanged = previousSessionId && previousSessionId !== sessionRecord?.id;
        this.session = sessionRecord;
        this.state.params = sessionRecord?.params ? JSON.parse(JSON.stringify(sessionRecord.params)) : this.state.params;
        const stepId = sessionRecord?.current_step;
        this.realignDynamicStepState(stepId);
        this.steps = createStreamSteps({ params: this.state.params });
        const newSignature = this.getDynamicSignature(this.state.params);
        const dynamicChanged = prevSignature !== newSignature;
        this.dynamicSignature = newSignature;
        this.debugLog('Session update applied', {
            initial,
            sessionId: sessionRecord?.id,
            previousStep: previousStepId,
            nextStep: stepId,
            status: sessionRecord?.status,
            dynamicChanged,
            signature: newSignature
        });
        this.renderPreview();
        this.renderTimeline();
        this.updateStatusText();

        if (sessionRecord?.status !== 'live') {
            const message = sessionRecord?.status === 'completed'
                ? 'The stream has finished. Thanks for voting!'
                : 'Waiting for the streamer to go live…';
            this.setAlert(message, sessionRecord?.status === 'completed');
            this.stopParticipantStatusPolling();
        } else {
            this.clearAlert();
        }

        if (sessionChanged) {
            this.participantId = null;
            this.participantName = null;
            this.participantStatus = 'pending';
            this.state.localVotes.clear();
            this.debugLog('Session changed, clearing participant state');
        }

        if (!stepId || stepId === 'complete') {
            this.currentStep = null;
            this.renderOptions([]);
            this.renderScoreboard();
            this.debugLog('Session ended or awaiting next step');
            return;
        }

        this.currentStep = getStepById(this.steps, stepId);
        const tieFilter = this.getTieFilter();
        const previousFilter = this.activeTieFilter ? [...this.activeTieFilter] : null;
        const filterChanged = JSON.stringify(tieFilter || []) !== JSON.stringify(previousFilter || []);
        const disabledChanged = previousDisabled !== JSON.stringify(sessionRecord?.params?._disabledOptions || {});
        this.activeTieFilter = tieFilter;
        if (filterChanged) {
            this.state.localVotes.clear();
        }

        this.renderStepHeader();

        const stepChanged = previousStepId !== stepId || initial;
        if (stepChanged || filterChanged || disabledChanged || dynamicChanged) {
            if ((stepChanged || dynamicChanged) && previousStepId) {
                this.state.localVotes.delete(previousStepId);
            }
            const optionsList = this.currentStep?.getOptions({ params: this.state.params }) || [];
            this.debugLog('Render options', { step: stepId, optionKeys: optionsList.map(opt => opt.key) });
            this.renderOptions(optionsList);
            if (stepChanged || dynamicChanged) {
                this.currentVotes.clear();
            }
            this.renderScoreboard();
        }

        if (sessionChanged) {
            this.state.localVotes.clear();
            this.setupRealtime(sessionRecord.id);
        }

        this.updateOptionButtons();
        this.ensureParticipantRegistration().catch(error => {
            console.warn('Participant sync failed during session update', error);
            this.debugLog('Participant sync error', { error: error?.message });
        });
    }

    renderStepHeader() {
        if (!this.stepTitle || !this.stepDescription) return;
        if (!this.currentStep) {
            this.stepTitle.textContent = 'No active step';
            this.stepDescription.textContent = 'Waiting for the streamer to advance.';
            return;
        }
        this.stepTitle.textContent = this.currentStep.title;
        const tieFilter = this.activeTieFilter;
        if (tieFilter && tieFilter.length) {
            const labels = this.currentStep
                .getOptions({ params: this.state.params })
                .filter(option => tieFilter.includes(option.key))
                .map(option => option.label)
                .join(', ');
            this.stepDescription.textContent = labels
                ? `Tie-break vote: ${labels}`
                : 'Tie-break vote: choose from the highlighted options.';
        } else {
            this.stepDescription.textContent = this.currentStep.description;
        }
    }

    getTieFilter() {
        const filter = this.session?.params?._tieFilter;
        return Array.isArray(filter) ? [...filter] : null;
    }

    realignDynamicStepState(stepId) {
        if (!stepId || !this.state?.params) {
            return;
        }
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

        this.debugLog('Dynamic state realigned', {
            stepId,
            tortieLayers: params._tortieLayers,
            accessories: params._accessorySlots,
            scars: params._scarSlots
        });
    }

    getDisabledOptions(stepId = this.currentStep?.id) {
        const map = this.session?.params?._disabledOptions || {};
        const list = stepId ? map[stepId] : undefined;
        return Array.isArray(list) ? list : [];
    }

    renderOptions(options) {
        if (!this.optionGrid) return;
        this.optionGrid.innerHTML = '';

        if (!this.session) {
            this.optionGrid.innerHTML = '<p class="viewer-status">Waiting for the streamer…</p>';
            return;
        }

        if (!this.currentStep) {
            this.optionGrid.innerHTML = '<p class="viewer-status">Waiting for the next step…</p>';
            return;
        }

        if (!options.length) {
            this.optionGrid.innerHTML = '<p class="viewer-status">No options available right now.</p>';
            return;
        }

        this.debugLog('Render options', {
            step: this.currentStep?.id,
            title: this.currentStep?.title,
            state: this.getCurrentVotingState(),
            optionKeys: options.map(option => option.key)
        });

        const state = this.getCurrentVotingState();
        if (state.code !== 'ready') {
            const notice = document.createElement('p');
            notice.className = 'viewer-status';
            if (state.code === 'kicked' || state.code === 'finished') {
                notice.classList.add('error');
            } else if (state.code === 'needs_name' || state.code === 'pending' || state.code === 'override' || state.code === 'votes_closed') {
                notice.classList.add('warning');
            }
            notice.textContent = state.reason || 'Voting is currently unavailable.';
            this.optionGrid.appendChild(notice);
            if (state.code === 'not_live' || state.code === 'finished') {
                return;
            }
        }

        let workingOptions = options;
        const tieFilter = this.activeTieFilter;
        if (tieFilter && tieFilter.length) {
            const notice = document.createElement('p');
            notice.className = 'viewer-status';
            notice.classList.add('warning');
            notice.textContent = 'Tie-break vote in progress. Please choose one of the highlighted options.';
            this.optionGrid.appendChild(notice);
            workingOptions = options.filter(option => tieFilter.includes(option.key));
            if (!workingOptions.length) {
                const empty = document.createElement('p');
                empty.className = 'viewer-status';
                empty.textContent = 'Waiting for new tie-break options…';
                this.optionGrid.appendChild(empty);
                return;
            }
        }

        const disabledSet = new Set(this.getDisabledOptions());

        for (const option of workingOptions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vote-option-card';
            button.dataset.key = option.key;
            const isDisabled = disabledSet.has(option.key);
            button.dataset.disabled = isDisabled ? 'true' : 'false';
            if (isDisabled) {
                button.classList.add('disabled-option');
            }

            const canvas = document.createElement('canvas');
            canvas.width = 180;
            canvas.height = 180;
            button.appendChild(canvas);

            const title = document.createElement('div');
            title.className = 'vote-option-title';
            title.textContent = option.label;
            button.appendChild(title);

            const subtitle = document.createElement('div');
            subtitle.className = 'vote-option-subtitle';
            subtitle.textContent = isDisabled ? 'Disabled by streamer' : 'Click to vote';
            button.appendChild(subtitle);

            const scorePill = document.createElement('span');
            scorePill.className = 'score-pill';
            const existingVotes = this.currentVotes.get(option.key) || 0;
            scorePill.textContent = `${existingVotes} vote${existingVotes === 1 ? '' : 's'}`;
            button.appendChild(scorePill);

            if (tieFilter && tieFilter.length) {
                button.classList.add('tie-option');
            }

            if (isDisabled) {
                button.disabled = true;
            }

            button.addEventListener('click', () => {
                if (button.disabled) return;
                this.submitVote(option, button);
            });

            this.optionGrid.appendChild(button);
            this.renderOptionPreview(canvas, option);
        }

        this.updateOptionButtons();
    }

    async renderOptionPreview(canvas, option) {
        if (!canvas || !this.currentStep) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const clone = cloneParams(this.state.params);
        try {
            option.mutate?.(clone, { params: clone });
            const result = await catGenerator.generateCat(clone);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Failed to render option preview', error);
        }
    }

    async submitVote(option, button) {
        if (!this.streamApi || !this.session || !this.currentStep) return;
        const state = this.getCurrentVotingState();
        if (state.code !== 'ready') {
            if (state.code === 'needs_name') {
                this.promptForParticipantName();
            }
            this.setAlert(state.reason || 'Voting is unavailable right now.', true);
            this.updateOptionButtons();
            return;
        }

        if (!this.participantId) {
            this.promptForParticipantName();
            this.setAlert('Enter your name to join the vote.', true);
            this.updateOptionButtons();
            return;
        }

        const stepId = this.currentStep?.id || this.session?.current_step;
        let keepDisabled = true;
        try {
            if (button) {
                button.disabled = true;
                button.classList.add('disabled');
            }

            await this.streamApi.createVote({
                session: this.session.id,
                step_id: stepId,
                option_key: option.key,
                option_meta: {
                    label: option.label,
                    step: this.currentStep.title,
                    fingerprint: this.fingerprint,
                    viewerSession: this.viewerSessionId,
                    participantId: this.participantId,
                    participantName: this.participantName || '',
                    tieIteration: this.session?.params?._tieIteration || ''
                    fingerprint: this.fingerprint,
                    viewerSession: this.viewerSessionId,
                    participantId: this.participantId,
                    participantName: this.participantName || '',
                    tieIteration: this.session?.params?._tieIteration || ''
                },
                votedby: this.participantId || null
            });
            if (stepId) {
                this.state.localVotes.set(stepId, option.key);
            }
            this.showToast('Vote submitted!');
            await this.refreshVotes();
            this.debugLog('Viewer vote submitted', {
                sessionId: this.session.id,
                step: stepId,
                option: option.key,
                participantId: this.participantId
            });
        } catch (error) {
            console.error('Vote failed', error);
            if (error?.response) {
                console.error('Vote failed raw response:', error.response);
            }
            const response = error?.response || {};
            const rawMessage = (response.message || error?.message || '').toLowerCase();
            const data = response.data || {};
            const duplicateMessage = data.votedby?.message || data.option_key?.message || '';
            let friendly = 'Vote could not be recorded. The streamer may have moved on.';

            keepDisabled = false;

            if (rawMessage.includes('already voted') || duplicateMessage) {
                friendly = 'You already voted in this round.';
                if (stepId) {
                    this.state.localVotes.set(stepId, option.key);
                }
                keepDisabled = true;
            } else if (rawMessage.includes('check in')) {
                friendly = 'Check in with your viewer name before voting.';
                this.promptForParticipantName();
            } else if (rawMessage.includes('removed') || rawMessage.includes('kicked')) {
                friendly = 'You were removed by the streamer.';
                this.participantStatus = 'kicked';
                this.setVotingAvailability(false, friendly);
                keepDisabled = true;
            } else if (rawMessage.includes('sign ups')) {
                friendly = 'Sign ups are disabled right now.';
                this.setVotingAvailability(false, friendly);
            } else if (rawMessage.includes('session not found') || rawMessage.includes('session ended')) {
                friendly = 'This session ended or no longer exists.';
            } else if (rawMessage.includes('moved to a different step')) {
                friendly = 'Voting already advanced to the next step.';
            }

            this.setAlert(friendly, true);
            this.debugLog('Viewer vote error', {
                sessionId: this.session?.id,
                step: stepId,
                option: option?.key,
                error: error?.message,
                friendly
            });
        } finally {
            if (button && !keepDisabled) {
                button.disabled = false;
                button.classList.remove('disabled');
            }
            this.updateOptionButtons();
        }
    }

    async refreshVotes() {
        if (!this.streamApi || !this.session || !this.currentStep) return;
        this.debugLog('Refreshing votes', {
            sessionId: this.session.id,
            step: this.session.current_step
        });
        try {
            const counts = await this.fetchVoteCounts(this.session.id, this.session.current_step);
            this.currentVotes = counts;
            this.renderScoreboard();
            this.updateOptionScores();
            this.updateOptionButtons();
            this.debugLog('Votes refreshed', {
                total: Array.from(this.currentVotes.values()).reduce((sum, value) => sum + value, 0),
                optionCount: this.currentVotes.size
            });
        } catch (error) {
            console.error('Failed to refresh votes', error);
            this.debugLog('Refresh votes failed', { error: error?.message });
        }
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

    renderScoreboard() {
        if (!this.scoreTable) return;
        const status = this.session?.status || 'draft';
        if (!this.session || status !== 'live') {
            const message = status === 'completed'
                ? 'Voting closed. Thanks for taking part.'
                : 'Votes will appear once the streamer goes live.';
            this.scoreTable.innerHTML = `<tr><td colspan="2">${message}</td></tr>`;
            return;
        }
        if (!this.currentStep) {
            this.scoreTable.innerHTML = '<tr><td colspan="2">Waiting for the next step…</td></tr>';
            return;
        }

        let options = this.currentStep.getOptions({ params: this.state.params }) || [];
        const disabledSet = new Set(this.getDisabledOptions());
        const tieFilter = this.activeTieFilter;
        if (tieFilter && tieFilter.length) {
            options = options.filter(option => tieFilter.includes(option.key));
        }
        if (!options.length) {
            this.scoreTable.innerHTML = '<tr><td colspan="2">No options available.</td></tr>';
            return;
        }

        const rows = options
            .map(option => {
                const count = this.currentVotes.get(option.key) || 0;
                if (!count || disabledSet.has(option.key)) {
                    return '';
                }
                const isTie = tieFilter && tieFilter.includes(option.key);
                const className = isTie ? ' class="tie-option"' : '';
                return `<tr${className} data-option-key="${option.key}"><td>${option.label}</td><td>${count}</td></tr>`;
            })
            .filter(Boolean)
            .join('');
        this.scoreTable.innerHTML = rows || '<tr><td colspan="2">No votes yet.</td></tr>';
    }

    updateOptionScores() {
        if (!this.optionGrid) return;
        for (const button of this.optionGrid.querySelectorAll('.vote-option-card')) {
            const key = button.dataset.key;
            const pill = button.querySelector('.score-pill');
            const count = key ? (this.currentVotes.get(key) || 0) : 0;
            if (pill) {
                pill.textContent = `${count} vote${count === 1 ? '' : 's'}`;
            }
        }
    }

    handleScoreHover(event) {
        if (!this.scoreTooltip || !this.scoreTooltipCanvas || !this.scoreTooltipCtx) return;
        const row = event.target.closest('tr[data-option-key]');
        if (!row) {
            this.hideScoreTooltip();
            return;
        }
        const optionKey = row.dataset.optionKey;
        if (!optionKey || !this.currentStep) {
            this.hideScoreTooltip();
            return;
        }

        const option = this.currentStep
            .getOptions({ params: this.state.params })
            .find(item => item.key === optionKey);
        if (!option) {
            this.hideScoreTooltip();
            return;
        }

        this.renderTooltipPreview(option).then(success => {
            if (!success) {
                this.hideScoreTooltip();
                return;
            }
            const tooltip = this.scoreTooltip;
            tooltip.style.display = 'block';
            tooltip.hidden = false;

            const rect = tooltip.getBoundingClientRect();
            const offset = 16;
            let x = event.clientX + offset;
            let y = event.clientY + offset;

            const maxX = window.innerWidth - rect.width - 8;
            const maxY = window.innerHeight - rect.height - 8;
            x = Math.min(x, maxX);
            y = Math.min(y, maxY);

            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        }).catch(() => {
            this.hideScoreTooltip();
        });
    }

    hideScoreTooltip() {
        if (!this.scoreTooltip) return;
        this.scoreTooltip.style.display = 'none';
        this.scoreTooltip.hidden = true;
    }

    async renderTooltipPreview(option) {
        if (!this.scoreTooltipCtx || !this.scoreTooltipCanvas || !option || !this.currentStep) {
            return false;
        }
        const ctx = this.scoreTooltipCtx;
        const canvas = this.scoreTooltipCanvas;
        try {
            const clone = cloneParams(this.state.params);
            option.mutate?.(clone, { params: clone });
            const result = await catGenerator.generateCat(clone);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
            return true;
        } catch (error) {
            console.error('Failed to render score tooltip preview', error);
            return false;
        }
    }

    renderTimeline() {
        if (!this.timelineContainer) return;
        const history = Array.isArray(this.session?.step_history) ? this.session.step_history : [];
        if (!history.length) {
            this.timelineContainer.innerHTML = '<p class="viewer-status">No steps locked yet.</p>';
            return;
        }

        const items = history.map(entry => `
            <div class="stream-timeline-item">
                <h4>${entry.title || entry.step_id}</h4>
                <p>${entry.label || 'No selection'} · Votes: ${entry.votes ?? 0}</p>
            </div>
        `).join('');
        this.timelineContainer.innerHTML = items;
    }

    async renderPreview() {
        if (!this.canvas || !this.ctx) return;
        const token = ++this.renderToken;
        const clone = cloneParams(this.state.params);
        try {
            const result = await catGenerator.generateCat(clone);
            if (token !== this.renderToken) return;
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(result.canvas, 0, 0, this.canvas.width, this.canvas.height);
        } catch (error) {
            console.error('Failed to render viewer preview', error);
        }
    }

    updateStatusText() {
        if (!this.sessionStatus) return;
        const status = (this.session?.status || 'unknown').toUpperCase();
        let extras = '';
        if (status === 'LIVE') {
            const signupsOpen = this.session?.params?._signupsOpen !== false;
            const votesOpen = (this.session?.params?._votesOpen ?? false) === true;
            extras = ` · Sign ups ${signupsOpen ? 'open' : 'paused'} · Votes ${votesOpen ? 'open' : 'closed'}`;
        }
        this.sessionStatus.innerHTML = `Status: <strong>${status}</strong>${extras}`;
    }

    setAlert(message, sticky = false) {
        if (!this.alertBox) return;
        this.alertBox.textContent = message;
        this.alertBox.hidden = false;
        if (!sticky) {
            clearTimeout(this.alertTimeout);
            this.alertTimeout = setTimeout(() => this.clearAlert(), 4000);
        }
    }

    clearAlert() {
        if (!this.alertBox) return;
        this.alertBox.hidden = true;
        this.alertBox.textContent = '';
    }

    showToast(message) {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.classList.add('visible');
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => this.clearToast(), 2000);
    }

    clearToast() {
        if (!this.toast) return;
        this.toast.classList.remove('visible');
    }
}

export default new CatStreamViewer();
