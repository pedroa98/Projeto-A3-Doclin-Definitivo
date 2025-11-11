document.addEventListener("DOMContentLoaded", async () => {
  console.log("📅 Iniciando agenda do estabelecimento...");

  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  // === PERFIL DO ESTABELECIMENTO ===
  const q = new Parse.Query("EstablishmentProfile");
  q.equalTo("user", user);
  const estObj = await q.first();

  if (!estObj) {
    alert("Configure seu perfil de estabelecimento antes de acessar a agenda.");
    return;
  }

  let workingHours = estObj.get("workingHours") || {};
  let blockedDate = estObj.get("blockedDate") || [];
  console.log("⏰ Horários carregados:", workingHours);
  console.log("🚫 Datas bloqueadas:", blockedDate);

  const calendarEl = document.getElementById("calendar");
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

  const calendar = await inicializarAgenda(calendarEl, {
    loadEvents: carregarConsultas,
    blockedDates: blockedDate,
    workingHours: workingHours && workingHours.daysOfWeek ? { daysOfWeek: workingHours.daysOfWeek, startTime: workingHours.startTime, endTime: workingHours.endTime } : workingHours,
    selectable: true,
    onEventClick(info) {
      selectedEvent = info.event;
      // open standardized details modal; fallback to existing delete modal trigger
      if (window.showConsultaModal) {
        window.showConsultaModal(info.event);
      } else {
        document.getElementById("textoExcluir").textContent = `Excluir "${info.event.title}" em ${info.event.start.toLocaleString()}?`;
        document.getElementById("modalDel").style.display = "flex";
      }
    }
  });

  // listen to delete requests from details modal
  document.addEventListener('agenda:request-delete', (e) => {
    const ev = e.detail && e.detail.eventObj;
    if (!ev) return;
    selectedEvent = { id: ev.id };
    document.getElementById('textoExcluir').textContent = `Excluir evento ${ev.id}?`;
    document.getElementById('modalDel').style.display = 'flex';
  });

  // === CARREGAR CONSULTAS ===
  async function carregarConsultas() {
    const Appointment = Parse.Object.extend("Appointment");
    const query = new Parse.Query(Appointment);
    query.equalTo("establishment", estObj);
    query.include("client");
    const results = await query.find();

    return results.map((c) => {
      const start = c.get("date");
      const end =
        c.get("endDate") || new Date(new Date(start).getTime() + 60 * 60 * 1000);
      return {
        id: c.id,
        title: "Consulta - " + (c.get("client")?.get("name") || "Cliente"),
        start,
        end,
        backgroundColor: "#3498db",
      };
    });
  }

  // === ADICIONAR CONSULTA ===
  document.getElementById("btnAdd").addEventListener("click", async () => {
    const select = document.getElementById("clienteSelect");
    select.innerHTML = "";
    const Relation = Parse.Object.extend("EstablishmentClientRelation");
    const rQ = new Parse.Query(Relation);
    rQ.equalTo("establishment", estObj);
    rQ.include("client");
    const rels = await rQ.find();
    if (!rels.length) return alert("Nenhum cliente vinculado.");

    rels.forEach((r) => {
      const c = r.get("client");
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.get("name");
      select.appendChild(opt);
    });

    document.getElementById("modalAdd").style.display = "flex";
  });

  // === SALVAR CONSULTA ===
  document.getElementById("salvarConsulta").addEventListener("click", async () => {
    const btn = document.getElementById("salvarConsulta");
    btn.disabled = true;
    
    const clienteId = document.getElementById("clienteSelect").value;
    const dataStr = document.getElementById("dataConsulta").value;
    if (!clienteId || !dataStr) {
      btn.disabled = false;
      return alert("Preencha todos os campos.");
    }

    const start = new Date(dataStr);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const dataIso = start.toISOString().split("T")[0];
    const diaSemana = start.getDay();
    const horaInicio = start.toTimeString().slice(0, 5);

    if (start < new Date()) {
      btn.disabled = false;
      return alert("Não é possível agendar no passado.");
    }
    if (blockedDate.some((b) => b.date === dataIso)) {
      btn.disabled = false;
      return alert("Essa data está bloqueada.");
    }

    const dentroDoExpediente =
      workingHours &&
      workingHours.daysOfWeek?.includes(diaSemana) &&
      horaInicio >= workingHours.startTime &&
      horaInicio < workingHours.endTime;
    if (!dentroDoExpediente) {
      btn.disabled = false;
      return alert("Fora do horário de trabalho do estabelecimento.");
    }

    const conflito = calendar.getEvents().some(
      (ev) => start < ev.end && end > ev.start
    );
    if (conflito) {
      btn.disabled = false;
      return alert("Horário já ocupado.");
    }

    try {
      const Cliente = Parse.Object.extend("ClientProfile");
      const cli = await new Parse.Query(Cliente).get(clienteId);
      const Appointment = Parse.Object.extend("Appointment");
      const ap = new Appointment();
      ap.set("establishment", estObj);
      ap.set("client", cli);
      ap.set("date", start);
      ap.set("endDate", end);
      ap.set("status", "agendada");
      ap.set("createdBy", "establishment");
      await ap.save(null, { sessionToken: user.getSessionToken() });

      calendar.addEvent({
        title: "Consulta - " + cli.get("name"),
        start,
        end,
        backgroundColor: "#2ecc71",
      });

      document.getElementById("modalAdd").style.display = "none";
      btn.disabled = false;
      alert("Consulta adicionada!");
    } catch (err) {
      console.error("Erro ao salvar consulta:", err);
      btn.disabled = false;
      alert("Erro ao salvar consulta.");
    }
  });

  // === EXCLUIR CONSULTA (corrigido com sessionToken + fallback) ===
  document.getElementById("confirmarDel").addEventListener("click", async () => {
    const btn = document.getElementById("confirmarDel");
    btn.disabled = true;
    
    try {
      const Appointment = Parse.Object.extend("Appointment");
      const q = new Parse.Query(Appointment);
      const ap = await q.get(selectedEvent.id);

      await ap.destroy({ sessionToken: user.getSessionToken() }); // ✅ autenticação garantida

      // Remoção segura do evento na UI (quando selectedEvent pode ser apenas {id})
      try {
        let evObj = selectedEvent;
        if (!evObj || typeof evObj.remove !== 'function') {
          evObj = calendar.getEventById(selectedEvent && selectedEvent.id);
        }
        if (evObj && typeof evObj.remove === 'function') evObj.remove();
      } catch (uiErr) { console.warn('Falha ao remover evento da UI:', uiErr); }
      
      document.getElementById("modalDel").style.display = "none";
      btn.disabled = false;
      alert("Consulta removida com sucesso!");
    } catch (err) {
      console.error("❌ Erro ao excluir consulta:", err);

      try {
        const cfg = window.PARSE_CONFIG;
        if (cfg && cfg.serverURL) {
          const res = await fetch(`${cfg.serverURL}/classes/Appointment/${selectedEvent.id}`, {
            method: "DELETE",
            headers: {
              "X-Parse-Application-Id": cfg.appId,
              "X-Parse-JavaScript-Key": cfg.jsKey,
              "X-Parse-Session-Token": user.getSessionToken(),
            },
          });
          if (res.ok) {
            try {
              let evObj = selectedEvent;
              if (!evObj || typeof evObj.remove !== 'function') {
                evObj = calendar.getEventById(selectedEvent && selectedEvent.id);
              }
              if (evObj && typeof evObj.remove === 'function') evObj.remove();
            } catch (uiErr) { console.warn('Falha ao remover evento da UI (REST):', uiErr); }
            document.getElementById("modalDel").style.display = "none";
            btn.disabled = false;
            alert("Consulta removida via fallback REST!");
          } else {
            const errData = await res.json();
            btn.disabled = false;
            alert(`Erro ao apagar (REST): ${errData.error || res.statusText}`);
          }
        }
      } catch (restErr) {
        console.error("Erro REST:", restErr);
        btn.disabled = false;
        alert("Erro ao excluir consulta no servidor.");
      }
    }
  });

  // === DEFINIR HORÁRIOS ===
  document.getElementById("btnSchedule").addEventListener("click", () => {
    document.getElementById("modalSchedule").style.display = "flex";
  });

  document
    .getElementById("cancelarSchedule")
    .addEventListener("click", () =>
      (document.getElementById("modalSchedule").style.display = "none")
    );

  document
    .getElementById("formSchedule")
    .addEventListener("submit", async (e) => {
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      e.preventDefault();

      const dias = Array.from(
        document.querySelectorAll("#dias-semana input:checked")
      ).map((i) => parseInt(i.value));

      const startTime = document.getElementById("inicioHorario").value;
      const endTime = document.getElementById("fimHorario").value;

      if (!dias.length) {
        btn.disabled = false;
        return alert("Selecione ao menos um dia.");
      }
      if (!startTime || !endTime) {
        btn.disabled = false;
        return alert("Informe os horários.");
      }
      if (endTime <= startTime) {
        btn.disabled = false;
        return alert("O horário final deve ser maior que o inicial.");
      }

      try {
        const novoHorario = { daysOfWeek: dias, startTime, endTime };
        estObj.set("workingHours", novoHorario);
        await estObj.save(null, { sessionToken: user.getSessionToken() });

        workingHours = novoHorario;
        calendar.setOption("businessHours", [
          { daysOfWeek: dias, startTime, endTime },
        ]);

        console.log("✅ Horários de trabalho salvos:", workingHours);
        document.getElementById("modalSchedule").style.display = "none";
        btn.disabled = false;
        alert("Horários de trabalho atualizados!");
      } catch (err) {
        console.error("Erro ao salvar horários:", err);
        btn.disabled = false;
        alert("Erro ao salvar horários no servidor.");
      }
    });

  // === BLOQUEAR DATA ===
  document.getElementById("btnBlock").addEventListener("click", () => {
    document.getElementById("modalBlock").style.display = "flex";
  });

  document
    .getElementById("cancelarBloqueio")
    .addEventListener("click", () =>
      (document.getElementById("modalBlock").style.display = "none")
    );

  document.getElementById("salvarBloqueio").addEventListener("click", async () => {
    const btn = document.getElementById("salvarBloqueio");
    btn.disabled = true;
    
    const data = document.getElementById("dataBloqueio").value;
    const motivo = document.getElementById("motivoBloqueio").value.trim();
    if (!data) {
      btn.disabled = false;
      return alert("Selecione uma data.");
    }

    try {
      if (blockedDate.some((b) => b.date === data)) {
        btn.disabled = false;
        return alert("Essa data já está bloqueada.");
      }

      blockedDate.push({ date: data, reason: motivo || "Bloqueio manual" });
      estObj.set("blockedDate", blockedDate);
      await estObj.save(null, { sessionToken: user.getSessionToken() });

      console.log("✅ Bloqueios salvos:", blockedDate);
      document.getElementById("modalBlock").style.display = "none";
      btn.disabled = false;
      alert("Data bloqueada com sucesso!");
      calendar.refetchEvents();
      calendar.render();
    } catch (err) {
      console.error("Erro ao salvar bloqueio:", err);
      btn.disabled = false;
      alert("Erro ao salvar bloqueio no servidor.");
    }
  });

  // === EXPORTAR PDF ===
  document.getElementById("btnExport").addEventListener("click", async () => {
    const btn = document.getElementById("btnExport");
    btn.disabled = true;
    
    const eventos = calendar.getEvents();
    if (!eventos.length) {
      btn.disabled = false;
      return alert("Sem eventos para exportar.");
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const rows = eventos.map((e) => [
        e.start.toLocaleDateString(),
        `${e.start.toLocaleTimeString()} - ${
          e.end ? e.end.toLocaleTimeString() : ""
        }`,
        e.title,
      ]);
      doc.text("Agenda - Estabelecimento", 40, 50);
      doc.autoTable({
        startY: 70,
        head: [["Data", "Horário", "Consulta"]],
        body: rows,
      });
      doc.save("agenda-semana.pdf");
      btn.disabled = false;
    } catch (err) {
      console.error("Erro ao exportar PDF:", err);
      btn.disabled = false;
      alert("Erro ao gerar o PDF.");
    }
  });

  // === FECHAR MODAIS ===
  document
    .querySelectorAll(".btn-close, #cancelarAdd, #cancelarDel")
    .forEach((b) =>
      b.addEventListener("click", () => {
        document.getElementById("modalAdd").style.display = "none";
        document.getElementById("modalDel").style.display = "none";
      })
    );
});
