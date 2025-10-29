onRecordBeforeCreateRequest(async (e) => {
  const record = e.record;
  const sessionId = record.getString('session');
  const stepId = record.getString('step_id');

  if (!sessionId || !stepId) {
    throw new Error('Session and step are required.');
  }

  const dao = new Dao(e.app.db());
  const session = await dao.findRecordById('stream_sessions', sessionId);
  if (!session) {
    throw new Error('Session not found.');
  }

  if ((session.getString('status') || '').toLowerCase() !== 'live') {
    throw new Error('Voting is not open for this session.');
  }

  const currentStep = session.getString('current_step');
  if (currentStep && currentStep !== stepId) {
    throw new Error('Voting has moved to a different step.');
  }

  let optionMeta = {};
  try {
    optionMeta = record.getJson('option_meta') || {};
  } catch (_) {
    optionMeta = {};
  }

  let providedParticipantId = null;
  try {
    const votedBy = record.get('votedby');
    if (Array.isArray(votedBy) && votedBy.length) {
      providedParticipantId = String(votedBy[0]);
    } else if (typeof votedBy === 'string') {
      providedParticipantId = votedBy;
    }
  } catch (_) {
    providedParticipantId = null;
  }

  if (!providedParticipantId && optionMeta.participantId) {
    providedParticipantId = String(optionMeta.participantId);
  }

  let participant = null;
  if (providedParticipantId) {
    try {
      participant = await dao.findRecordById('stream_participants', providedParticipantId);
    } catch (_) {
      participant = null;
    }
  }

  if (!participant) {
    throw new Error('Unable to verify participant. Check in again.');
  }

  if (participant.getString('session') !== sessionId) {
    throw new Error('Participant does not belong to this session.');
  }

  const participantStatus = (participant.getString('status') || 'active').toLowerCase();
  if (participantStatus !== 'active') {
    if (participantStatus === 'kicked') {
      throw new Error('You have been removed from this stream.');
    }
    throw new Error('You are not allowed to vote right now.');
  }

  const duplicate = await dao.findFirstRecordByFilter(
    'stream_votes',
    'session = {:session} && step_id = {:step} && votedby = {:participant}',
    {
      session: sessionId,
      step: stepId,
      participant: participant.id
    }
  );

  if (duplicate) {
    throw new Error('You already voted in this round.');
  }

  optionMeta.participantId = participant.id;
  optionMeta.participantName = participant.getString('display_name') || '';

  record.setJson('option_meta', optionMeta);
  record.set('votedby', [participant.id]);
}, 'stream_votes');
