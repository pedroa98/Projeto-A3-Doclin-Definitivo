document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureSession();
  if (!user) {
    alert('Você precisa estar logado.');
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const profId = params.get('id');
  const perfilEl = document.getElementById('perfilProfissional');
  const calendarEl = document.getElementById('calendar');
  const mensagemEl = document.getElementById('mensagem');

  if (!profId) {
    perfilEl.innerHTML = '<p>Nenhum profissional selecionado.</p>';
    return;
  }

  const modalMarcar = document.getElementById('modalMarcar');
  const textoData = document.getElementById('textoData');
  const confirmarMarcar = document.getElementById('confirmarMarcar');
  const cancelarMarcar = document.getElementById('cancelarMarcar');

  const modalCancelar = document.getElementById('modalCancelar');
  const textoCancelar = document.getElementById('textoCancelar');
  const confirmarCancelar = document.getElementById('confirmarCancelar');
  const fecharCancelar = document.getElementById('fecharCancelar');

  // 🔹 Modal de detalhes
  const modalDetalhes = document.createElement('div');
  modalDetalhes.id = "modalDetalhes";
  modalDetalhes.className = "modal";
  modalDetalhes.innerHTML = `
    <div class="modal-content">
      <h3>Detalhes da Consulta</h3>
      <p id="detalheNome"></p>
      <p id="detalheEspecialidade"></p>
      <button id="btnApagarConsulta" class="btn btn-green">🗑️ Apagar Consulta</button>
      <button id="fecharDetalhes" class="btn btn-blue">Fechar</button>
    </div>
  `;
  document.body.appendChild(modalDetalhes);

  const detalheNome = modalDetalhes.querySelector("#detalheNome");
  const detalheEsp = modalDetalhes.querySelector("#detalheEspecialidade");
  const fecharDetalhes = modalDetalhes.querySelector("#fecharDetalhes");
  const btnApagarConsulta = modalDetalhes.querySelector("#btnApagarConsulta");

  fecharDetalhes.addEventListener('click', () => modalDetalhes.style.display = "none");

  let selectedSlot = null;
  let selectedAppointment = null;
  let calendar = null;
  let prof = null;
  let clientProfile = null;
  let relation = null;
  let currentAppointments = [];
  // Horários e datas bloqueadas do profissional
  let workingHours = {};
  let blockedDates = [];

  // 🔔 Cria uma notificação destinada ao profissional (originada por um cliente)
  // Guarda o remetente em 'fromClient' para que o profissional saiba quem fez a ação,
  // mas não define o ponteiro 'client' como destinatário para evitar que a notificação
  // seja listada também no dashboard do cliente.
  async function criarNotificacaoParaProfissional(professional, clientProfile, mensagem, tipo) {
    try {
      const Notificacao = Parse.Object.extend('Notificacao');
      const notif = new Notificacao();
      notif.set('professional', professional); // destinatário
      // remetente
      try { notif.set('fromClient', clientProfile); } catch (e) { /* ignore */ }
      if (tipo) notif.set('type', tipo);
      notif.set('message', mensagem);
      notif.set('status', 'nova');
      await notif.save();
      console.log('Notificação criada para profissional:', mensagem);
    } catch (err) {
      console.error('Erro ao criar notificação para profissional:', err);
    }
  }

  // 🔹 Nome do cliente (para notificações)
  function nomeDoCliente() {
    try {
      return (
        clientProfile?.get?.('name') ||
        clientProfile?.name ||
        user?.get?.('name') ||
        'Cliente'
      );
    } catch {
      return 'Cliente';
    }
  }

  try {
    const Prof = Parse.Object.extend('ProfessionalProfile');
    const profQ = new Parse.Query(Prof);
    prof = await profQ.get(profId);

    // carregar horários bloqueados / working hours para validação
    try {
      workingHours = prof.get('workingHours') || {};
      blockedDates = prof.get('blockedDates') || [];
    } catch (e) { workingHours = {}; blockedDates = []; }

    function photoUrlFor(obj) {
      try {
        if (obj && typeof obj.get === 'function') {
          const pu = obj.get('photoUrl');
          if (pu) return pu;
          const pf = obj.get('photo');
          if (pf && typeof pf.url === 'function') return pf.url();
          if (pf && pf.url) return pf.url;
        }
        if (obj && obj.photoUrl) return obj.photoUrl;
        if (obj && obj.photo && obj.photo.url) return obj.photo.url;
      } catch (e) {}
      return null;
    }

    perfilEl.innerHTML = `
      <img src="${photoUrlFor(prof) || 'https://via.placeholder.com/150'}" alt="Foto">
      <h2>${prof.get('name')}</h2>
      <p>${prof.get('description') || ''}</p>
      <p><strong>Tipo:</strong> ${prof.get('type') || 'Não informado'}</p>
      <p><strong>Conselho:</strong> ${prof.get('councilNumber') || 'Não informado'}</p>
      <p>💰 ${prof.get('price') ? 'R$ ' + prof.get('price').toFixed(2) : 'Preço não informado'}</p>
  <p>📍 ${prof.get('address') || 'Endereço não informado'}</p>
  <p>📧 ${prof.get('contactEmail') ? `<a href="mailto:${prof.get('contactEmail')}">${prof.get('contactEmail')}</a>` : 'E-mail não informado'}</p>
  <p>📞 ${prof.get('phone') ? `<a href="tel:${prof.get('phone')}">${prof.get('phone')}</a>` : 'Telefone não informado'}</p>
      <p>📧 ${prof.get('contactEmail') || 'E-mail não informado'}</p>
      <p>📞 ${prof.get('phone') || 'Telefone não informado'}</p>
    `;

    const ClientProfile = Parse.Object.extend('ClientProfile');
    const clientQ = new Parse.Query(ClientProfile);
    clientQ.equalTo('user', user);
    clientProfile = await clientQ.first();

    if (clientProfile) {
      const Relation = Parse.Object.extend('ProfessionalClientRelation');
      const relQ = new Parse.Query(Relation);
      relQ.equalTo('professional', prof);
      relQ.equalTo('client', clientProfile);
      relation = await relQ.first();
    }

    const actions = document.createElement('div');
    actions.style.marginTop = '12px';

    // botão de exportar agenda (visível quando a agenda é exibida)
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-blue';
    exportBtn.id = 'btnExportPublic';
    exportBtn.textContent = '📤 Exportar Semana (PDF)';
    exportBtn.style.marginLeft = '8px';
    exportBtn.addEventListener('click', async () => {
      if (!calendar) return alert('Agenda ainda não carregada.');
      const eventos = calendar.getEvents();
      if (!eventos.length) return alert('Sem eventos para exportar.');
      try {
        const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
        if (!jsPDF) throw new Error('jsPDF não carregado');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const rows = eventos.map(e => [e.start.toLocaleDateString(), e.start.toLocaleTimeString() + ' - ' + (e.end ? e.end.toLocaleTimeString() : ''), e.title]);
        doc.text('Agenda - Profissional', 40, 50);
        doc.autoTable({ startY: 70, head: [['Data','Hora','Compromisso']], body: rows, styles: { fontSize: 10 }, headStyles: { fillColor: [44,62,80], textColor: 255 } });
        doc.save('agenda-semana.pdf');
      } catch (err) {
        console.error('Erro exportando PDF (public):', err);
        const blob = new Blob([eventos.map(e=>`${e.start.toLocaleString()} - ${e.title}`).join('\n')], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'agenda-semana.txt'; a.click();
      }
    });
    actions.appendChild(exportBtn);

    if (!clientProfile) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-blue';
      btn.textContent = 'Cadastrar Perfil';
      btn.addEventListener('click', () => window.location.href = 'editar-perfil-cliente.html');
      actions.appendChild(btn);
      perfilEl.appendChild(actions);
      mensagemEl.textContent = 'Você precisa criar seu perfil para solicitar vínculo ou agendar.';
    } else if (!relation) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-green';
      btn.textContent = 'Solicitar Vínculo';
      btn.addEventListener('click', async () => {
        const texto = prompt('Mensagem para o profissional (opcional):', 'Olá, gostaria de me vincular.');
        const Interesse = Parse.Object.extend('Interesse');
        const i = new Interesse();
          i.set('client', clientProfile);
          i.set('professional', prof);
          i.set('message', texto || '');
          await i.save();
          // criar notificação para o profissional
          try {
            await criarNotificacaoParaProfissional(prof, clientProfile, `Novo interesse: ${texto || ''}`, 'interesse');
          } catch (e) { console.warn('Falha ao notificar profissional sobre interesse:', e); }
          alert('Interesse enviado ao profissional.');
      });
      actions.appendChild(btn);
      perfilEl.appendChild(actions);
      mensagemEl.textContent = 'Você pode solicitar vínculo com este profissional.';
    } else {
      mensagemEl.textContent = '';
      perfilEl.appendChild(actions);

      if (window.FullCalendar) initCalendar();
      else {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js';
        s.onload = initCalendar;
        document.head.appendChild(s);
      }
    }

  } catch (err) {
    console.error(err);
    perfilEl.innerHTML = '<p>Erro ao carregar o profissional.</p>';
    return;
  }

  async function initCalendar() {
    currentAppointments = await carregarEventos();

    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'timeGridWeek',
      locale: 'pt-br',
      allDaySlot: false,
      selectable: true,
      selectMirror: true,
      height: 'auto',
      nowIndicator: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      validRange: { start: new Date() },
      selectAllow: (selectInfo) => {
        // Bloqueia horários passados, sobrepostos e fora do horário de trabalho / datas bloqueadas
        const nowOk = selectInfo.start >= new Date();
        const noOverlap = !currentAppointments.some(ev => (selectInfo.start < ev.end && selectInfo.end > ev.start));
        const notBlocked = !isDateBlocked(selectInfo.start, selectInfo.end);
        return nowOk && noOverlap && notBlocked;
      },
      select: onSelectSlot,
      eventClick: onEventClick,
      events: currentAppointments
    });

    calendar.render();
  }

  async function carregarEventos() {
    const Appointment = Parse.Object.extend('Appointment');
    const q = new Parse.Query(Appointment);
    q.equalTo('professional', prof);
    q.include('client');
    q.ascending('date');
    const results = await q.find();
    return results.map(a => {
      const cliente = a.get('client');
      const isMeu = cliente && cliente.id === clientProfile?.id;
      return {
        id: a.id,
        title: `Consulta - ${cliente ? (cliente.get ? cliente.get('name') : cliente.name) : 'Cliente'}`,
        start: a.get('date'),
        end: a.get('endDate') || new Date(new Date(a.get('date')).getTime() + 30 * 60000),
        backgroundColor: isMeu ? '#2ecc71' : '#3498db', // 🟩 verde se é do cliente, 🟦 azul se é de outro
        borderColor: isMeu ? '#27ae60' : '#2980b9',
        extendedProps: { appointmentObj: a }
      };
    });
  }

  // === Função auxiliar para checar se a data está bloqueada ou fora do horário de trabalho ===
  function isDateBlocked(start, end) {
    try {
      const yyyy = start.getFullYear();
      const mm = String(start.getMonth() + 1).padStart(2, '0');
      const dd = String(start.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      if (blockedDates.includes(key)) return true;

      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const day = dayNames[start.getDay()];
      const wh = workingHours[day];
      if (!wh) return true; // sem horário definido -> fora do expediente
      const startHM = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const endHM = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
      return !(startHM >= wh[0] && endHM <= wh[1]);
    } catch (e) {
      return false;
    }
  }

  function onSelectSlot(selectionInfo) {
    if (!relation) {
      alert('Você precisa estar vinculado a este profissional para agendar.');
      calendar.unselect();
      return;
    }

    const now = new Date();
    if (selectionInfo.start < now) {
      alert('Não é possível marcar consultas em horários passados.');
      calendar.unselect();
      return;
    }

    const pagas = relation.get('sessionsPaid') || 0;
    const usadas = relation.get('sessionsUsed') || 0;
    const disponiveis = pagas - usadas;
    if (disponiveis <= 0) {
      alert('Você não possui créditos disponíveis.');
      calendar.unselect();
      return;
    }

    selectedSlot = selectionInfo;
    const start = selectionInfo.start;
    const end = selectionInfo.end;
    textoData.textContent = `Deseja confirmar o agendamento para ${start.toLocaleString()} - ${end.toLocaleString()}?`;
    modalMarcar.style.display = 'flex';
  }

  confirmarMarcar.addEventListener('click', async () => {
    if (!selectedSlot) return;
    // checagem extra de segurança (não confiar apenas no selectAllow)
    if (isDateBlocked(selectedSlot.start, selectedSlot.end)) {
      alert('O horário selecionado está fora do horário de trabalho ou é uma data bloqueada.');
      modalMarcar.style.display = 'none';
      selectedSlot = null;
      return;
    }
    try {
      const Appointment = Parse.Object.extend('Appointment');
      const a = new Appointment();
      a.set('professional', prof);
      a.set('client', clientProfile);
      a.set('date', selectedSlot.start);
      a.set('endDate', selectedSlot.end);
      await a.save();

      const dataFmt = new Date(selectedSlot.start).toLocaleString('pt-BR');
      await criarNotificacaoParaProfissional(
        prof,
        clientProfile,
        `${nomeDoCliente()} marcou uma consulta para ${dataFmt}.`,
        'agendada'
      );

      relation.increment('sessionsUsed', 1);
      await relation.save();

      modalMarcar.style.display = 'none';
      selectedSlot = null;
      alert('Consulta agendada com sucesso!');
      location.reload();
    } catch (err) {
      console.error('Erro criando appointment', err);
      alert('Erro ao agendar. Tente novamente.');
    }
  });

  cancelarMarcar.addEventListener('click', () => {
    modalMarcar.style.display = 'none';
    selectedSlot = null;
  });

  function onEventClick(info) {
    selectedAppointment = info.event.extendedProps.appointmentObj;
    if (!selectedAppointment) return;

    detalheNome.textContent = `Profissional: ${prof.get('name')}`;
    detalheEsp.textContent = `Especialidade: ${prof.get('specialty') || 'Não informada'}`;
    modalDetalhes.style.display = 'flex';
  }

  btnApagarConsulta.addEventListener('click', async () => {
    if (!selectedAppointment) return;

    try {
      const appt = await new Parse.Query('Appointment').get(selectedAppointment.id);
      const clientObj = appt.get('client');

      if (!clientObj || clientObj.id !== clientProfile.id) {
        alert('Você não pode apagar consultas que não são suas.');
        return;
      }

      if (!confirm('Tem certeza que deseja apagar esta consulta?')) return;

      const apptDate = new Date(appt.get('date'));
      const now = new Date();
      const diffMs = apptDate - now;
      const hours = diffMs / (1000 * 60 * 60);

      if (hours >= 72) {
        relation.increment('sessionsUsed', -1);
        await relation.save();
      }

      await appt.destroy();

      const dataFmt = apptDate.toLocaleString('pt-BR');
      await criarNotificacaoParaProfissional(
        prof,
        clientProfile,
        `${nomeDoCliente()} cancelou a consulta agendada para ${dataFmt}.`,
        'cancelamento'
      );

      alert('Consulta apagada com sucesso.');
      location.reload();
    } catch (err) {
      console.error('Erro ao apagar consulta', err);
      alert('Erro ao apagar consulta.');
    }
  });
});