/* calendar-utils.js
   Utilities to standardize FullCalendar configuration across agendas
   Exposes:
     - window.inicializarAgenda(calendarEl, config)
     - window.showConsultaModal(event)

   config: {
     loadEvents: async (fetchInfo) => [ ...events ], // async function or function returning Promise
     blockedDates: ['YYYY-MM-DD', ...],
     workingHours: { daysOfWeek: [...], startTime: '08:00', endTime: '18:00' } or other FullCalendar businessHours format,
     selectable: true/false,
     onEventClick: function(info) { ... }
   }
*/
(function(){
  // inject small helper CSS for non-business slots
  function ensureStyles(){
    if (document.getElementById('calendar-utils-styles')) return;
    const s = document.createElement('style');
    s.id = 'calendar-utils-styles';
    s.textContent = `
      /* shade slots outside business hours */
      .fc .fc-non-business { background: #f7f7f7 !important; }
      /* blocked full days */
      .fc-daygrid-day.blocked-date { background: #ffe6e6 !important; }
      .agenda-legend { display:flex; gap:12px; align-items:center; margin:8px 0 16px; font-family: Poppins, sans-serif; }
      .agenda-legend .item { display:flex; gap:8px; align-items:center; }
      .agenda-legend .swatch { width:14px; height:14px; border-radius:3px; display:inline-block; }
    `;
    document.head.appendChild(s);
  }

  function buildLegend(){
    const div = document.createElement('div');
    div.className = 'agenda-legend';
    div.innerHTML = `
      <div class="item"><span class="swatch" style="background:#3498db"></span><span>Consultas</span></div>
      <div class="item"><span class="swatch" style="background:#2ecc71"></span><span>Disponível</span></div>
      <div class="item"><span class="swatch" style="background:#ffe6e6"></span><span>Data Bloqueada</span></div>
    `;
    return div;
  }

  // show a reuseable modal with details for an appointment
  function ensureDetailsModal(){
    if (document.getElementById('modalDetalhesConsulta')) return;
    const html = `
      <div class="modal" id="modalDetalhesConsulta" style="display:none">
        <div class="modal-content">
          <h2>Detalhes da Consulta</h2>
          <p id="detalheData"></p>
          <p id="detalheProfEst"></p>
          <p id="detalheCliente"></p>
          <p id="detalheStatus"></p>
          <div style="margin-top:12px; text-align:center">
            <button id="detalheFechar" class="btn">Fechar</button>
            <button id="detalheExcluirBtn" class="btn-danger">Excluir</button>
          </div>
        </div>
      </div>
    `;
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    document.body.appendChild(tmp.firstElementChild);
    document.getElementById('detalheFechar').addEventListener('click', ()=> document.getElementById('modalDetalhesConsulta').style.display='none');
    // delete button dispatches a custom event listened by page scripts
    document.getElementById('detalheExcluirBtn').addEventListener('click', ()=>{
      const evJson = document.getElementById('modalDetalhesConsulta').dataset.eventId;
      document.getElementById('modalDetalhesConsulta').style.display='none';
      try{
        const obj = evJson ? JSON.parse(evJson) : null;
        document.dispatchEvent(new CustomEvent('agenda:request-delete',{ detail: { eventObj: obj } }));
      }catch(e){ document.dispatchEvent(new CustomEvent('agenda:request-delete',{ detail: { eventObj: evJson } })); }
    });
  }

  function fillDetailsModal(event){
    ensureDetailsModal();
    const modal = document.getElementById('modalDetalhesConsulta');
    const start = event.start; const end = event.end;
    document.getElementById('detalheData').textContent = `Data: ${start ? start.toLocaleString() : ''}${end ? ' - ' + end.toLocaleTimeString() : ''}`;
    const prof = event.extendedProps?.professionalName || event.extendedProps?.establishmentName || '';
    const client = event.extendedProps?.clientName || '';
    document.getElementById('detalheProfEst').textContent = prof ? `Prof./Estabelecimento: ${prof}` : '';
    document.getElementById('detalheCliente').textContent = client ? `Cliente: ${client}` : '';
    document.getElementById('detalheStatus').textContent = event.extendedProps?.status ? `Status: ${event.extendedProps.status}` : '';
    // store minimal info for deletion handlers (we cannot serialise full Event object reliably)
    try{ modal.dataset.eventId = JSON.stringify({ id: event.id }); } catch(e){ modal.dataset.eventId = event.id; }
    modal.style.display = 'flex';
  }

  // main initializer
  window.inicializarAgenda = async function(calendarEl, config){
    ensureStyles();
    ensureDetailsModal();

    const parent = calendarEl.parentElement || document.body;
    // insert legend if not exists
    if (!parent.querySelector('.agenda-legend')) {
      parent.insertBefore(buildLegend(), calendarEl);
    }

    const blockedDates = config.blockedDates || [];
    const workingHours = config.workingHours || null;

    const calendarOptions = {
      initialView: config.initialView || 'timeGridWeek',
      locale: config.locale || 'pt-br',
      height: config.height || 'auto',
      headerToolbar: config.headerToolbar || { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
      selectable: !!config.selectable,
      businessHours: workingHours ? (workingHours) : false,
      events: async function(fetchInfo, successCallback, failureCallback){
        try{
          const evs = await (typeof config.loadEvents === 'function' ? config.loadEvents(fetchInfo) : config.loadEvents);
          // normalize colors
          const normalized = (evs || []).map(ev => {
            const e = Object.assign({}, ev);
            if (!e.backgroundColor) {
              if (e.extendedProps && e.extendedProps.status === 'agendada') e.backgroundColor = '#3498db';
              else if (e.extendedProps && e.extendedProps.available) e.backgroundColor = '#2ecc71';
              else e.backgroundColor = '#3498db';
            }
            return e;
          });
          successCallback(normalized);
        }catch(err){ failureCallback(err); }
      },
      dayCellDidMount: function(info){
        const ds = info.date.toISOString().split('T')[0];
        if (blockedDates.includes(ds) || (blockedDates.some && blockedDates.some(b=> b.date===ds))) {
          info.el.classList.add('blocked-date');
        }
      },
      eventClick: function(info){
        if (typeof config.onEventClick === 'function') return config.onEventClick(info);
        fillDetailsModal(info.event);
      }
    };

    const calendar = new FullCalendar.Calendar(calendarEl, calendarOptions);
    calendar.render();

    // provide helper to show details from outside
    window.showConsultaModal = function(event){ fillDetailsModal(event); };

    return calendar;
  };

})();
