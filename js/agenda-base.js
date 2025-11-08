document.addEventListener("DOMContentLoaded", () => {
  const calendarEl = document.getElementById("calendar");

  // ✅ Cria o calendário
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: "pt-br",
    allDaySlot: false,
    nowIndicator: true,
    slotMinTime: "07:00:00",
    slotMaxTime: "22:00:00",
    height: "auto",
    selectable: true,
    editable: false,

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },

    // 🔹 Eventos de exemplo
    events: [
      {
        title: "Consulta com João",
        start: "2025-10-16T09:00:00",
        end: "2025-10-16T10:00:00",
        backgroundColor: "#27ae60",
      },
      {
        title: "Consulta com Maria",
        start: "2025-10-17T14:30:00",
        end: "2025-10-17T15:30:00",
        backgroundColor: "#e67e22",
      },
    ],

    // 🔸 Clicar em um horário livre
    dateClick: function (info) {
      const confirmacao = confirm(
        `Deseja cadastrar uma nova consulta em ${info.date.toLocaleString("pt-BR")}?`
      );
      if (confirmacao) {
        const titulo = prompt("Digite o nome do paciente / descrição da consulta:");
        if (!titulo) return alert("Consulta cancelada: nome não informado.");

        const novoEvento = {
          title: titulo,
          start: info.date,
          end: new Date(info.date.getTime() + 60 * 60 * 1000), // +1 hora
          backgroundColor: "#3498db",
        };

        calendar.addEvent(novoEvento);
        alert("✅ Consulta criada com sucesso!");
      }
    },

    // 🔸 Clicar em um evento existente
    eventClick: function (info) {
      const evt = info.event;
      alert(
        `📋 Detalhes da consulta:\n\nTítulo: ${evt.title}\nData: ${evt.start.toLocaleString()}`
      );
    },
  });

  // ✅ Renderiza o calendário
  calendar.render();

  // 🔸 Adicionar evento de teste manualmente
  document.getElementById("addEventBtn").addEventListener("click", () => {
    const newEvent = {
      title: "Nova Consulta (teste)",
      start: new Date().toISOString().split("T")[0] + "T13:00:00",
      end: new Date().toISOString().split("T")[0] + "T14:00:00",
      backgroundColor: "#2980b9",
    };
    calendar.addEvent(newEvent);
    alert("Evento de teste adicionado!");
  });
});
