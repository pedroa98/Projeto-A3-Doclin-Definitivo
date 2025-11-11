document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureSession();
  if (!user) { alert('Você precisa estar logado.'); window.location.href = 'login.html'; return; }

  // get client profile
  const ClientProfile = Parse.Object.extend('ClientProfile');
  const q = new Parse.Query(ClientProfile);
  q.equalTo('user', user);
  const clientProfile = await q.first();
  if (!clientProfile) { alert('Você precisa completar seu perfil de cliente.'); window.location.href='editar-perfil-cliente.html'; return; }

  const calendarEl = document.getElementById('calendar');
  let selectedEvent = null;

  // ensure calendar-utils is loaded
  if (!window.inicializarAgenda) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/calendar-utils.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function carregarConsultas() {
    const Appointment = Parse.Object.extend('Appointment');
    const query = new Parse.Query(Appointment);
    query.equalTo('client', clientProfile);
    // bring pointers so we can show names in the modal and PDF
    query.include(['professional','establishment']);
    const results = await query.find();
    return results.map(a => {
      const prof = a.get('professional');
      const est = a.get('establishment');
      const profName = prof ? (typeof prof.get === 'function' ? prof.get('name') : prof.name) : null;
      const estName = est ? (typeof est.get === 'function' ? est.get('name') : est.name) : null;
      const title = profName ? `Consulta - ${profName}` : (estName ? `Consulta - ${estName}` : 'Consulta');
      const start = a.get('date');
      const end = a.get('endDate') || new Date(new Date(start).getTime() + 30*60*1000);
      return { id: a.id, title, start, end, backgroundColor: '#2ecc71', extendedProps: { appointmentObj: a, professionalName: profName, establishmentName: estName, status: a.get('status') } };
    });
  }

  const calendar = await inicializarAgenda(calendarEl, {
    loadEvents: carregarConsultas,
    selectable: false,
    onEventClick(info) { selectedEvent = info.event; if (window.showConsultaModal) window.showConsultaModal(info.event); else alert(`Detalhes:\n${info.event.title}\n${info.event.start.toLocaleString()}`); }
  });

  // Para a visão do cliente, escondemos o botão de excluir no modal de detalhes
  // (ele ainda existe no DOM, mas ficará oculto e inacessível)
  try {
    const btnExcluir = document.getElementById('detalheExcluirBtn');
    if (btnExcluir) btnExcluir.style.display = 'none';
  } catch (e) { /* ignore */ }

  // Export using AutoTable
  document.getElementById('btnExport').addEventListener('click', async () => {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    
    const eventos = calendar.getEvents();
    if (!eventos.length) {
      btn.disabled = false;
      return alert('Sem eventos para exportar.');
    }
    try {
      const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
      if (!jsPDF) throw new Error('jsPDF não carregado');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const rows = eventos.map(e => {
        const profEst = (e.extendedProps && (e.extendedProps.professionalName || e.extendedProps.establishmentName)) ? (e.extendedProps.professionalName || e.extendedProps.establishmentName) : '';
        return [e.start.toLocaleDateString(), e.start.toLocaleTimeString() + ' - ' + (e.end ? e.end.toLocaleTimeString() : ''), e.title, profEst];
      });
      doc.text('Minhas Consultas', 40, 50);
      doc.autoTable({ startY: 70, head: [['Data','Hora','Compromisso','Prof/Est']], body: rows, styles:{ fontSize:10 } });
      doc.save('agenda-cliente.pdf');
      btn.disabled = false;
    } catch (err) {
      console.error('Erro exportando PDF (cliente):', err);
      btn.disabled = false;
      const blob = new Blob([eventos.map(e=> `${e.start.toLocaleString()} - ${e.title}`).join('\n')], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'agenda-cliente.txt'; a.click();
    }
  });
});
