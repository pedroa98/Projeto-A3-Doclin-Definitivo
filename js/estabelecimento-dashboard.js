document.addEventListener("DOMContentLoaded", async () => {
  const currentUser = await ensureSession("estabelecimento");
  if (!currentUser) return;

    const calendarEl = document.getElementById("calendar"); 
    // Se o elemento #calendar não existir (remoção da agenda da área principal), pulamos a inicialização do FullCalendar.
    if (calendarEl) {
      if (!window.FullCalendar) {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/main.min.js";
        s.onload = () => renderCalendar();
        document.head.appendChild(s);
      } else {
        renderCalendar();
      }
    } else {
      console.debug('estabelecimento-dashboard: #calendar ausente — não inicializando agenda.');
    }

    // Carrega notificações inicialmente
    carregarNotificacoes(currentUser).catch(err => console.warn('Erro carregando notificações:', err));

  async function renderCalendar() {
    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "timeGridWeek",
      locale: "pt-br",
      allDaySlot: false,
      height: "auto",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay"
      },
      events: async (info, successCallback, failureCallback) => {
        try {
          const eventos = await carregarConsultas(currentUser);
          successCallback(eventos);
        } catch (err) {
          console.error('Erro ao carregar eventos:', err);
          failureCallback(err);
        }
      }
    });

    calendar.render();
  }

  // Logout
  const logoutBtn = document.querySelector(".logout");
  if (logoutBtn) logoutBtn.addEventListener("click", doLogout);
  
  // Notifications controls
  const refreshBtn = document.getElementById('refresh-notifications');
  const markAllBtn = document.getElementById('mark-all-read');
  const removeReadBtn = document.getElementById('remove-read');
  if (refreshBtn) refreshBtn.addEventListener('click', () => carregarNotificacoes(currentUser));
  if (markAllBtn) markAllBtn.addEventListener('click', () => marcarTodasLidas(currentUser));
  if (removeReadBtn) removeReadBtn.addEventListener('click', () => removerLidas(currentUser));
});

// Carrega consultas do estabelecimento
async function carregarConsultas(currentUser) {
  const EstablishmentProfile = Parse.Object.extend('EstablishmentProfile');
  const estQuery = new Parse.Query(EstablishmentProfile);
  estQuery.equalTo('user', currentUser);
  const estObj = await estQuery.first();
  if (!estObj) {
    console.warn('EstablishmentProfile não encontrado para o usuário', currentUser.id);
    return [];
  }

  const Appointment = Parse.Object.extend('Appointment');
  const q = new Parse.Query(Appointment);
  q.equalTo('establishment', estObj);
  q.include('client');

  const results = await q.find();
  return results.map((consulta) => {
    const cliente = consulta.get('client');
    const nomeCliente = cliente ? (cliente.get ? cliente.get('name') : cliente.name) : 'Cliente';
    const dataInicio = consulta.get('date');
    const dataFim = consulta.get('endDate') || new Date(new Date(dataInicio).getTime() + 30*60000);

    return {
      title: `Consulta - ${nomeCliente}`,
      start: dataInicio,
      end: dataFim,
      backgroundColor: '#3498db',
      borderColor: '#2980b9'
    };
  });
}

// --- Notificações ---
async function carregarNotificacoes(currentUser) {
  const listEl = document.getElementById('notifications-list');
  const noEl = document.getElementById('no-notifications');
  const badgeEl = document.getElementById('notif-badge');
  if (!listEl || !noEl) return;
  listEl.innerHTML = '';

  const EstablishmentProfile = Parse.Object.extend('EstablishmentProfile');
  const estQ = new Parse.Query(EstablishmentProfile);
  estQ.equalTo('user', currentUser);
  const estObj = await estQ.first();
  if (!estObj) {
    noEl.textContent = 'Nenhuma notificação (perfil estabelecimento não encontrado)';
    noEl.style.display = '';
    return;
  }

  const Notificacao = Parse.Object.extend('Notificacao');
  const nq = new Parse.Query(Notificacao);
  nq.equalTo('establishment', estObj);
  nq.equalTo('status', 'nova');
  nq.descending('createdAt');
  nq.include('client');
  const notas = await nq.find();

  if (!notas || notas.length === 0) {
    noEl.style.display = '';
    if (badgeEl) badgeEl.textContent = '0';
    return;
  }
  noEl.style.display = 'none';
  if (badgeEl) badgeEl.textContent = String(notas.length);

  notas.forEach(n => {
    const li = document.createElement('li');
    const client = n.get('client');
    const nome = client ? (client.get ? client.get('name') : client.name) : 'Cliente';
    const msg = n.get('message') || n.get('type') || 'Notificação';
    li.innerHTML = `<div class="notif-item"><div class="notif-body"><strong>${nome}</strong>: ${msg}</div><div class="notif-actions"><button data-id="${n.id}" class="mark-read">Marcar lida</button><button data-id="${n.id}" class="remove-notif">Remover</button></div></div>`;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.mark-read').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.target.getAttribute('data-id');
      await marcarNotificacaoLida(id);
      carregarNotificacoes(currentUser);
    });
  });
  listEl.querySelectorAll('.remove-notif').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.target.getAttribute('data-id');
      try {
        const Notificacao = Parse.Object.extend('Notificacao');
        const obj = new Notificacao(); obj.id = id; await obj.destroy();
      } catch (e) {
        try { const cfg = window.PARSE_CONFIG; await fetch(`${cfg.serverURL}/classes/Notificacao/${id}`, { method: 'DELETE', headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': currentUser.__sessionToken } }); } catch (err) { console.error(err); }
      }
      carregarNotificacoes(currentUser);
    });
  });

  async function removerLidas(currentUser) {
    try {
      const EstablishmentProfile = Parse.Object.extend('EstablishmentProfile');
      const estQ = new Parse.Query(EstablishmentProfile);
      estQ.equalTo('user', currentUser);
      const estObj = await estQ.first();
      if (!estObj) return;
      const Notificacao = Parse.Object.extend('Notificacao');
      const nq = new Parse.Query(Notificacao);
      nq.equalTo('establishment', estObj);
      nq.equalTo('status', 'lida');
      const notas = await nq.find();
      for (const n of notas) await n.destroy();
      carregarNotificacoes(currentUser);
    } catch (e) { console.error('Erro ao remover lidas (est):', e); }
  }
}

async function marcarNotificacaoLida(id) {
  try {
    const Notificacao = Parse.Object.extend('Notificacao');
    const obj = new Notificacao();
    obj.id = id;
    obj.set('status', 'lida');
    await obj.save(null, { useMasterKey: false });
  } catch (err) {
    console.error('Erro marcando notificação como lida', err);
  }
}

async function marcarTodasLidas(currentUser) {
  try {
    const EstablishmentProfile = Parse.Object.extend('EstablishmentProfile');
    const estQ = new Parse.Query(EstablishmentProfile);
    estQ.equalTo('user', currentUser);
    const estObj = await estQ.first();
    if (!estObj) return;

    const Notificacao = Parse.Object.extend('Notificacao');
    const nq = new Parse.Query(Notificacao);
    nq.equalTo('establishment', estObj);
    nq.equalTo('status', 'nova');
    const notas = await nq.find();
    for (const n of notas) {
      n.set('status', 'lida');
      await n.save();
    }
    carregarNotificacoes(currentUser);
  } catch (err) {
    console.error('Erro marcando todas como lidas', err);
  }
}
