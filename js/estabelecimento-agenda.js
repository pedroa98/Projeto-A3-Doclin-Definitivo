document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) { alert('Você precisa estar logado.'); window.location.href='login.html'; return; }

  const calendarEl = document.getElementById('calendar');
  // Load this establishment profile linked to user
  const q = new Parse.Query('EstablishmentProfile'); q.equalTo('user', user); const estObj = await q.first();
  if (!estObj) { alert('Você precisa configurar seu perfil de estabelecimento antes de usar a agenda.'); return; }

  const calendar = new FullCalendar.Calendar(calendarEl, { initialView: 'timeGridWeek', locale:'pt-br', height:'auto', headerToolbar:{ left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,timeGridDay' }, events: await carregarConsultas(), eventClick(info){ selectedEvent = info.event; document.getElementById('textoExcluir').textContent = `Excluir "${info.event.title}" em ${info.event.start.toLocaleString()}?`; document.getElementById('modalDel').style.display='flex'; } });
  calendar.render();

  let selectedEvent = null;

  async function carregarConsultas(){
    const Appointment = Parse.Object.extend('Appointment');
    const query = new Parse.Query(Appointment); query.equalTo('establishment', estObj); query.include('client'); const results = await query.find();
    return results.map(c => { const start = c.get('date'); const end = c.get('endDate') || new Date(new Date(start).getTime() + 60*60*1000); return { id:c.id, title: 'Consulta - ' + (c.get('client')?.get('name') || 'Cliente'), start, end, backgroundColor:'#3498db' }; });
  }

  // Add simple add/delete flow similar to profissional-agenda
  document.getElementById('btnAdd').addEventListener('click', async ()=>{
    const select = document.getElementById('clienteSelect'); select.innerHTML = '';
    const Relation = Parse.Object.extend('EstablishmentClientRelation'); const rQ = new Parse.Query(Relation); rQ.equalTo('establishment', estObj); rQ.include('client'); const rels = await rQ.find();
    if (!rels.length) return alert('Nenhum cliente vinculado.');
    rels.forEach(r=>{ const c = r.get('client'); const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.get('name'); select.appendChild(opt); });
    document.getElementById('modalAdd').style.display='flex';
  });

  document.getElementById('salvarConsulta').addEventListener('click', async ()=>{
    const clienteId = document.getElementById('clienteSelect').value; const dataStr = document.getElementById('dataConsulta').value; if (!clienteId || !dataStr) return alert('Preencha todos os campos.');
    const Cliente = Parse.Object.extend('ClientProfile'); const cli = await new Parse.Query(Cliente).get(clienteId);
    const Appointment = Parse.Object.extend('Appointment'); const ap = new Appointment(); ap.set('establishment', estObj); ap.set('client', cli); const start = new Date(dataStr); const end = new Date(start.getTime()+30*60*1000); ap.set('date', start); ap.set('endDate', end); ap.set('status','agendada'); ap.set('createdBy','establishment'); await ap.save(); calendar.addEvent({ title: 'Consulta - '+cli.get('name'), start, end, backgroundColor:'#2ecc71' }); document.getElementById('modalAdd').style.display='none'; alert('Consulta adicionada!');
  });

  document.getElementById('confirmarDel').addEventListener('click', async ()=>{
    try { const Appointment = Parse.Object.extend('Appointment'); const q = new Parse.Query(Appointment); const ap = await q.get(selectedEvent.id); await ap.destroy(); selectedEvent.remove(); alert('Consulta removida!'); } catch(e){ console.error(e); alert('Erro ao excluir consulta.'); } document.getElementById('modalDel').style.display='none'; });

  // === Exportar PDF (estabelecimento) ===
  const exportBtn = document.getElementById('btnExport');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    const eventos = calendar.getEvents();
    if (!eventos.length) return alert('Sem eventos para exportar.');
    try {
      const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
      if (!jsPDF) throw new Error('jsPDF não carregado');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const rows = eventos.map(e => [e.start.toLocaleDateString(), e.start.toLocaleTimeString() + ' - ' + (e.end ? e.end.toLocaleTimeString() : ''), e.title]);
      doc.text('Agenda - Estabelecimento', 40, 50);
      doc.autoTable({ startY: 70, head: [['Data','Hora','Compromisso']], body: rows, styles: { fontSize: 10 }, headStyles: { fillColor: [44,62,80], textColor: 255 } });
      doc.save('agenda-semana-estabelecimento.pdf');
    } catch (err) {
      console.error('Erro exportando PDF (estabelecimento):', err);
      const blob = new Blob([eventos.map(e=>`${e.start.toLocaleString()} - ${e.title}`).join('\n')], { type: 'text/plain' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'agenda-semana.txt'; link.click();
    }
  });

  document.querySelectorAll('.btn-close, #cancelarAdd, #cancelarDel').forEach(b=> b.addEventListener('click', ()=>{ document.getElementById('modalAdd').style.display='none'; document.getElementById('modalDel').style.display='none'; }));

});
