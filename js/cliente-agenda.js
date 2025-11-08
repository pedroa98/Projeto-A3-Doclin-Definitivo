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

  async function carregarConsultas() {
    const Appointment = Parse.Object.extend('Appointment');
    const query = new Parse.Query(Appointment);
    query.equalTo('client', clientProfile);
    query.include('professional');
    const results = await query.find();
    return results.map(a => {
      const prof = a.get('professional');
      const title = prof ? `Consulta - ${prof.get ? prof.get('name') : prof.name}` : 'Consulta';
      const start = a.get('date');
      const end = a.get('endDate') || new Date(new Date(start).getTime() + 30*60*1000);
      return { id: a.id, title, start, end, backgroundColor: '#2ecc71', extendedProps: { appointmentObj: a } };
    });
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek', locale: 'pt-br', allDaySlot: false, height: 'auto',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    events: await carregarConsultas(),
    eventClick(info) {
      const e = info.event;
      alert(`Detalhes:\n${e.title}\n${e.start.toLocaleString()}`);
    }
  });
  calendar.render();

  // Export using AutoTable
  document.getElementById('btnExport').addEventListener('click', async () => {
    const eventos = calendar.getEvents();
    if (!eventos.length) return alert('Sem eventos para exportar.');
    try {
      const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
      if (!jsPDF) throw new Error('jsPDF não carregado');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const rows = eventos.map(e => [e.start.toLocaleDateString(), e.start.toLocaleTimeString() + ' - ' + (e.end ? e.end.toLocaleTimeString() : ''), e.title]);
      doc.text('Minhas Consultas', 40, 50);
      doc.autoTable({ startY: 70, head: [['Data','Hora','Compromisso']], body: rows, styles:{ fontSize:10 } });
      doc.save('agenda-cliente.pdf');
    } catch (err) {
      console.error('Erro exportando PDF (cliente):', err);
      const blob = new Blob([eventos.map(e=> `${e.start.toLocaleString()} - ${e.title}`).join('\n')], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'agenda-cliente.txt'; a.click();
    }
  });
});
