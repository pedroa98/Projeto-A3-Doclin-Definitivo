// Cloud Code for Back4App / Parse Server
// Defines createAppointment and cancelAppointment to validate scheduling server-side

Parse.Cloud.define('createAppointment', async (request) => {
  const { professionalId, clientId, startISO, endISO, decrementCredit = true, createdBy = 'client' } = request.params;
  if (!professionalId || !clientId || !startISO || !endISO) throw 'missing_params';

  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw 'invalid_dates';

  // Load professional profile
  const Prof = Parse.Object.extend('ProfessionalProfile');
  const prof = await (new Parse.Query(Prof)).get(professionalId, { useMasterKey: true });
  if (!prof) throw 'professional_not_found';

  // Check blockedDates
  const blockedDates = prof.get('blockedDates') || [];
  const yyyy = start.getFullYear();
  const mm = String(start.getMonth()+1).padStart(2,'0');
  const dd = String(start.getDate()).padStart(2,'0');
  const key = `${yyyy}-${mm}-${dd}`;
  if (blockedDates.includes(key)) throw 'date_blocked';

  // Check working hours
  const workingHours = prof.get('workingHours') || {};
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
  const day = dayNames[start.getDay()];
  const wh = workingHours[day];
  if (!wh) throw 'outside_working_hours';
  const pad = (d) => String(d).padStart(2,'0');
  const startHM = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endHM = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  if (!(startHM >= wh[0] && endHM <= wh[1])) throw 'outside_working_hours';

  // Check overlap
  const Appointment = Parse.Object.extend('Appointment');
  const oq = new Parse.Query(Appointment);
  oq.equalTo('professional', prof);
  oq.lessThan('date', end);
  oq.greaterThan('endDate', start);
  const overlap = await oq.first({ useMasterKey: true });
  if (overlap) throw 'overlap';

  // Check relation and credits
  const Relation = Parse.Object.extend('ProfessionalClientRelation');
  const rq = new Parse.Query(Relation);
  rq.equalTo('professional', prof);
  // relation.client is a pointer to ClientProfile; fetch by id
  rq.equalTo('client', { __type: 'Pointer', className: 'ClientProfile', objectId: clientId });
  const rel = await rq.first({ useMasterKey: true });
  if (!rel) throw 'relation_not_found';
  if (decrementCredit) {
    const pagas = rel.get('sessionsPaid') || 0;
    const usadas = rel.get('sessionsUsed') || 0;
    if ((pagas - usadas) <= 0) throw 'no_credits';
  }

  // Create appointment and update relation atomically
  const ap = new Appointment();
  ap.set('professional', prof);
  // set minimal pointer to ClientProfile for atomic save
  const Client = Parse.Object.extend('ClientProfile');
  const clientPtr = new Client(); clientPtr.id = clientId;
  ap.set('client', clientPtr);
  ap.set('date', start);
  ap.set('endDate', end);
  ap.set('status', 'agendada');
  ap.set('createdBy', createdBy || 'client');

  // Save appointment
  await ap.save(null, { useMasterKey: true });

  if (decrementCredit) {
    rel.increment('sessionsUsed', 1);
    await rel.save(null, { useMasterKey: true });
  }

  return { success: true, appointmentId: ap.id };
});

Parse.Cloud.define('cancelAppointment', async (request) => {
  const { appointmentId, refundWhen72h = true, forceRefund = false } = request.params;
  if (!appointmentId) throw 'missing_param_appointmentId';

  const Appointment = Parse.Object.extend('Appointment');
  const ap = await (new Parse.Query(Appointment)).get(appointmentId, { useMasterKey: true });
  if (!ap) throw 'appointment_not_found';

  const apptDate = new Date(ap.get('date'));
  const now = new Date();
  const hours = (apptDate - now) / (1000*60*60);

  let shouldRefund = false;
  if (forceRefund) shouldRefund = true;
  else if (refundWhen72h && hours >= 72) shouldRefund = true;

  if (shouldRefund) {
    const prof = ap.get('professional');
    const client = ap.get('client');
    if (prof && client) {
      const Relation = Parse.Object.extend('ProfessionalClientRelation');
      const rq = new Parse.Query(Relation);
      rq.equalTo('professional', prof);
      rq.equalTo('client', client);
      const rel = await rq.first({ useMasterKey: true });
      if (rel) {
        rel.increment('sessionsUsed', -1);
        await rel.save(null, { useMasterKey: true });
      }
    }
  }

  await ap.destroy({ useMasterKey: true });
  return { success: true };
});
