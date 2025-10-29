const VALID_STATUSES = new Set(['active', 'kicked', 'pending']);

function sanitiseName(value) {
  const raw = (value || '').toString().trim();
  if (!raw) {
    return '';
  }
  return raw.slice(0, 40);
}

onRecordBeforeCreateRequest(async (e) => {
  const record = e.record;
  const sessionId = record.getString('session');
  const viewerSession = (record.getString('viewer_session') || '').trim();

  if (!sessionId || !viewerSession) {
    throw new Error('Session and viewer session are required.');
  }

  const dao = new Dao(e.app.db());
  const session = await dao.findRecordById('stream_sessions', sessionId);
  if (!session) {
    throw new Error('Session not found.');
  }

  if ((session.getString('status') || '').toLowerCase() !== 'live') {
    throw new Error('The streamer is not live yet. Try again once the session starts.');
  }

  let params = {};
  try {
    params = session.getJson('params') || {};
  } catch (_) {
    params = {};
  }

  if (params._signupsOpen === false) {
    throw new Error('Sign ups are disabled right now.');
  }

  const existing = await dao.findFirstRecordByFilter(
    'stream_participants',
    'session = {:session} && viewer_session = {:viewer}',
    {
      session: sessionId,
      viewer: viewerSession
    }
  );

  if (existing) {
    throw new Error('This viewer is already checked in.');
  }

  const displayName = sanitiseName(record.getString('display_name'));
  if (!displayName) {
    throw new Error('Display name is required.');
  }

  let fingerprint = (record.getString('fingerprint') || '').trim();
  if (!fingerprint) {
    try {
      fingerprint = utils.sha256(`${viewerSession}:${Date.now().toString(36)}`);
    } catch (_) {
      fingerprint = `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  record.setString('session', sessionId);
  record.setString('viewer_session', viewerSession);
  record.setString('display_name', displayName);
  record.setString('fingerprint', fingerprint.slice(0, 120));
  record.setString('status', 'active');
}, 'stream_participants');

onRecordBeforeUpdateRequest(async (e) => {
  const record = e.record;
  const dao = new Dao(e.app.db());
  const current = await dao.findRecordById('stream_participants', record.id);
  if (!current) {
    return;
  }

  record.setString('session', current.getString('session'));
  record.setString('viewer_session', current.getString('viewer_session'));

  const name = sanitiseName(record.getString('display_name')) || current.getString('display_name') || 'Viewer';
  record.setString('display_name', name);

  const incomingStatus = (record.getString('status') || current.getString('status') || 'active').toLowerCase();
  if (VALID_STATUSES.has(incomingStatus)) {
    record.setString('status', incomingStatus);
  } else {
    record.setString('status', current.getString('status') || 'active');
  }

  let fingerprint = (record.getString('fingerprint') || current.getString('fingerprint') || '').trim();
  if (fingerprint) {
    record.setString('fingerprint', fingerprint.slice(0, 120));
  }
}, 'stream_participants');
