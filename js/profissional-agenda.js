document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  const calendarEl = document.getElementById("calendar");
  let selectedEvent = null;

  // Buscar perfil profissional vinculado ao usuário
  const profQuery = new Parse.Query("ProfessionalProfile");
  profQuery.equalTo("user", user);
  const profObj = await profQuery.first();
  if (!profObj) {
    alert('Você precisa configurar seu perfil profissional antes de usar a agenda.');
    return;
  }

  // Inicializar calendário
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: "pt-br",
    allDaySlot: false,
    nowIndicator: true,
    selectable: false,
    editable: false,
    height: "auto",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    events: await carregarConsultas(),
    eventClick(info) {
      selectedEvent = info.event;
      document.getElementById("textoExcluir").textContent = `Excluir "${info.event.title}" em ${info.event.start.toLocaleString()}?`;
      document.getElementById("modalDel").style.display = "flex";
    },
  });

  calendar.render();

  // Horários e datas bloqueadas
  let workingHours = profObj.get('workingHours') || {};
  let blockedDates = profObj.get('blockedDates') || [];

  document.getElementById('btnSchedule').addEventListener('click', () => openScheduleModal());
  document.getElementById('btnBlocked').addEventListener('click', () => openBlockedModal());

  function openScheduleModal() {
    const days = ['mon','tue','wed','thu','fri','sat','sun'];
    const ids = ['monStart','monEnd','tueStart','tueEnd','wedStart','wedEnd','thuStart','thuEnd','friStart','friEnd','satStart','satEnd','sunStart','sunEnd'];
    days.forEach((d, i) => {
      const wh = workingHours[d] || ['', ''];
      document.getElementById(ids[i*2]).value = wh[0];
      document.getElementById(ids[i*2+1]).value = wh[1];
    });
    document.getElementById('modalSchedule').style.display = 'flex';
  }

  document.getElementById('cancelSchedule').addEventListener('click', () => {
    document.getElementById('modalSchedule').style.display = 'none';
  });

  document.getElementById('saveSchedule').addEventListener('click', async () => {
    const ids = ['monStart','monEnd','tueStart','tueEnd','wedStart','wedEnd','thuStart','thuEnd','friStart','friEnd','satStart','satEnd','sunStart','sunEnd'];
    const days = ['mon','tue','wed','thu','fri','sat','sun'];
    const newWH = {};
    for (let i=0;i<days.length;i++){
      const s = document.getElementById(ids[i*2]).value;
      const e = document.getElementById(ids[i*2+1]).value;
      if (s && e) newWH[days[i]] = [s,e];
    }
    workingHours = newWH;
    profObj.set('workingHours', workingHours);
    await profObj.save();
    document.getElementById('modalSchedule').style.display = 'none';
    alert('Horários salvos.');
  });

  function openBlockedModal(){
    const list = document.getElementById('blockedList');
    list.innerHTML = '';
    blockedDates.forEach(d => {
      const li = document.createElement('li');
      li.textContent = d + ' ';
      const btn = document.createElement('button'); 
      btn.textContent = 'Remover'; 
      btn.className='btn';
      btn.addEventListener('click', async () => {
        blockedDates = blockedDates.filter(x => x !== d);
        profObj.set('blockedDates', blockedDates);
        await profObj.save();
        openBlockedModal();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    document.getElementById('modalBlocked').style.display = 'flex';
  }

  document.getElementById('closeBlocked').addEventListener('click', () => {
    document.getElementById('modalBlocked').style.display = 'none';
  });

  document.getElementById('addBlocked').addEventListener('click', async () => {
    const v = document.getElementById('blockedDateInput').value;
    if (!v) return alert('Escolha uma data');
    if (!blockedDates.includes(v)) blockedDates.push(v);
    profObj.set('blockedDates', blockedDates);
    await profObj.save();
    openBlockedModal();
  });

  // === Função auxiliar ===
  function isDateBlocked(start,end){
    const yyyy = start.getFullYear();
    const mm = String(start.getMonth()+1).padStart(2,'0');
    const dd = String(start.getDate()).padStart(2,'0');
    const key = `${yyyy}-${mm}-${dd}`;
    if (blockedDates.includes(key)) return true;

    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const day = dayNames[start.getDay()];
    const wh = workingHours[day];
    if (!wh) return true;
    const startHM = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
    const endHM = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
    return !(startHM >= wh[0] && endHM <= wh[1]);
  }

  async function carregarConsultas() {
    const Appointment = Parse.Object.extend("Appointment");
    const query = new Parse.Query(Appointment);
    query.equalTo("professional", profObj);
    query.include("client");
    const results = await query.find();

    return results.map((c) => {
      const start = c.get("date");
      const endStored = c.get("endDate");
      const end = endStored ? endStored : new Date(new Date(start).getTime() + 60 * 60 * 1000);
      return {
        id: c.id,
        title: "Consulta - " + (c.get("client")?.get("name") || "Cliente"),
        start: start,
        end: end,
        backgroundColor: "#3498db",
      };
    });
  }

  // === Adicionar Consulta ===
  document.getElementById("btnAdd").addEventListener("click", async () => {
    const select = document.getElementById("clienteSelect");
    select.innerHTML = "";

    const Relation = Parse.Object.extend("ProfessionalClientRelation");
    const q1 = new Parse.Query(Relation);
    q1.equalTo("professional", profObj);
    q1.equalTo("status", "ativo");

    const q2 = new Parse.Query(Relation);
    q2.equalTo("professional", profObj);
    q2.greaterThan("sessionsPaid", 0);

    const qOr = Parse.Query.or(q1, q2);
    qOr.include("client");
    const relsRaw = await qOr.find();

    const rels = relsRaw.filter(r => {
      const status = r.get("status");
      if (status === "ativo") return true;
      const pagas = r.get("sessionsPaid") || 0;
      const usadas = r.get("sessionsUsed") || 0;
      return (pagas - usadas) > 0;
    });

    if (!rels.length) {
      alert("Você não possui clientes ativos ou com créditos disponíveis.");
      return;
    }

    rels.forEach((r) => {
      const c = r.get("client");
      const pagas = r.get("sessionsPaid") || 0;
      const usadas = r.get("sessionsUsed") || 0;
      const disponiveis = pagas - usadas;
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.get("name")} ${disponiveis > 0 ? `- ${disponiveis} créditos` : ''}`;
      select.appendChild(opt);
    });

    document.getElementById("modalAdd").style.display = "flex";
  });

  // === Salvar Consulta ===
  document.getElementById("salvarConsulta").addEventListener("click", async () => {
    const clienteId = document.getElementById("clienteSelect").value;
    const dataStr = document.getElementById("dataConsulta").value;
    const descontar = document.getElementById("descontarCredito").checked;

    if (!clienteId || !dataStr) return alert("Preencha todos os campos.");

    const start = new Date(dataStr);
    const now = new Date();
    if (start < now) return alert("Não é possível agendar consultas em horários passados.");

    const end = new Date(start.getTime() + 30 * 60 * 1000);

    // Verifica bloqueio e horário de trabalho
    if (isDateBlocked(start,end)) {
      return alert('O horário selecionado está fora do horário de trabalho ou é uma data bloqueada.');
    }

    // Verifica conflito de horários
    const Appointment = Parse.Object.extend("Appointment");
    const overlapQ = new Parse.Query(Appointment);
    overlapQ.equalTo("professional", profObj);
    overlapQ.lessThan("date", end);
    overlapQ.greaterThan("endDate", start);
    const overlap = await overlapQ.first();
    if (overlap) return alert('Já existe uma consulta neste horário.');

    // Criação do objeto
    const Cliente = Parse.Object.extend("ClientProfile");
    const cli = await new Parse.Query(Cliente).get(clienteId);

    const ap = new Appointment();
    ap.set("professional", profObj);
    ap.set("client", cli);
    ap.set("date", start);
    ap.set("endDate", end);
    ap.set("status", "agendada");
    ap.set("createdBy", "profissional");
    await ap.save();

    // Atualiza créditos
    if (descontar) {
      const Relation = Parse.Object.extend("ProfessionalClientRelation");
      const relQ = new Parse.Query(Relation);
      relQ.equalTo("professional", profObj);
      relQ.equalTo("client", cli);
      const rel = await relQ.first();
      if (rel) {
        rel.increment("sessionsUsed");
        await rel.save();
      }
    }

    // Notificação para o cliente
  await criarNotificacaoParaCliente(cli, "Uma nova consulta foi adicionada à sua agenda pelo profissional.");

    calendar.addEvent({
      title: "Consulta - " + cli.get("name"),
      start: start,
      end: end,
      backgroundColor: "#2ecc71",
    });

    document.getElementById("modalAdd").style.display = "none";
    alert("Consulta adicionada!");
  });

  // === Excluir Consulta ===
  document.getElementById("confirmarDel").addEventListener("click", async () => {
    const devolver = document.getElementById("devolverCredito").checked;

    try {
      const Appointment = Parse.Object.extend("Appointment");
      const q = new Parse.Query(Appointment);
      const ap = await q.get(selectedEvent.id);
      const cli = ap.get("client");

      if (devolver && cli) {
        const Relation = Parse.Object.extend("ProfessionalClientRelation");
        const r = new Parse.Query(Relation);
        r.equalTo("professional", profObj);
        r.equalTo("client", cli);
        const rel = await r.first();
        if (rel) {
          rel.increment("sessionsUsed", -1);
          await rel.save();
        }
      }

      await ap.destroy();
      selectedEvent.remove();

      // Notificação para o cliente
      if (cli) {
  await criarNotificacaoParaCliente(cli, "Uma consulta foi removida da sua agenda pelo profissional.");
      }

      alert("Consulta removida!");
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir consulta.");
    }

    document.getElementById("modalDel").style.display = "none";
  });

  // === Criar Notificação ===
  async function criarNotificacaoParaCliente(clienteObj, mensagem, tipo) {
    try {
      const Notificacao = Parse.Object.extend('Notificacao');
      const notif = new Notificacao();
      // destinatário: cliente
      notif.set('client', clienteObj);
      // remetente profissional (informativo)
      try { if (profObj) notif.set('fromProfessional', profObj); } catch(e){}
      if (tipo) notif.set('type', tipo);
      notif.set('message', mensagem);
      notif.set('status', 'nova');
      await notif.save();
    } catch (err) {
      console.error('Erro criando notificação (profissional-agenda):', err);
    }
  }

  // === Exportar PDF ===
  document.getElementById("btnExport").addEventListener("click", async () => {
    const eventos = calendar.getEvents();
    if (!eventos.length) return alert("Sem eventos para exportar.");

    const linhas = eventos.map(e =>
      `${e.start.toLocaleDateString()} ${e.start.toLocaleTimeString()} - ${e.title}`
    );

    // Carrega jsPDF dinamicamente se necessário e gera um PDF válido
    async function loadJsPDF() {
      if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = () => {
          try { resolve(window.jspdf.jsPDF); } catch (e) { reject(e); }
        };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    try {
      // use preloaded jsPDF and AutoTable when available
      const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
      if (!jsPDF) throw new Error('jsPDF não disponível');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;

      // build table body rows: [date, time range, title]
      const rows = eventos.map((e) => {
        const date = e.start.toLocaleDateString();
        const time = e.start.toLocaleTimeString() + ' - ' + (e.end ? e.end.toLocaleTimeString() : '');
        const title = e.title || '';
        return [date, time, title];
      });

      doc.setFontSize(16);
      doc.setTextColor(44,62,80);
      doc.text('Agenda - Semana', margin, 50);

      // AutoTable options
      doc.autoTable({
        startY: 70,
        head: [['Data', 'Hora', 'Compromisso']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [44,62,80], textColor: 255 },
        styles: { fontSize: 10, textColor: [33,33,33] },
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 120 }, 2: { cellWidth: 'auto' } },
        didDrawCell: function (data) {
          // optionally draw a small color marker on the left of each row using event color
          if (data.section === 'body' && data.column.index === 0) {
            try {
              const ev = calendar.getEvents()[data.row.index];
              const color = ev && ev.backgroundColor ? ev.backgroundColor : '#3498db';
              const rgb = /^#?([a-fA-F\d]{2})([a-fA-F\d]{2})([a-fA-F\d]{2})$/.exec(color);
              if (rgb) {
                const r = parseInt(rgb[1], 16), g = parseInt(rgb[2], 16), b = parseInt(rgb[3], 16);
                const x = data.cell.x - 6;
                const y = data.cell.y + (data.cell.height/2) - 4;
                doc.setFillColor(r,g,b);
                doc.rect(x, y, 8, 8, 'F');
              }
            } catch (e) { /* ignore */ }
          }
        }
      });

      doc.save('agenda-semana.pdf');
    } catch (err) {
      console.error('Erro gerando PDF com AutoTable, fallback para texto:', err);
      const texto = linhas.join('\n');
      const blob = new Blob([texto], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'agenda-semana.txt';
      link.click();
    }
  });

  // === Fechar Modais ===
  document.querySelectorAll(".btn-close, #cancelarAdd, #cancelarDel").forEach(b =>
    b.addEventListener("click", () => {
      document.getElementById("modalAdd").style.display = "none";
      document.getElementById("modalDel").style.display = "none";
    })
  );
});