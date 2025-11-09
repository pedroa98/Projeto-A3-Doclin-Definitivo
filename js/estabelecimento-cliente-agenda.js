document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const estId = params.get("id");
  const container = document.getElementById("perfilEstabelecimento");
  const msg = document.getElementById("mensagem");
  const calendarEl = document.getElementById("calendar");

  // === Referências dos modais ===
  const modalMarcar = criarModal("modalMarcar");
  const modalCancelar = criarModal("modalCancelar");

  let clientProfile, est, selectedSlot;

  if (!estId) {
    container.innerHTML = "<p>Nenhum estabelecimento selecionado.</p>";
    return;
  }

  try {
    // === Carrega o estabelecimento ===
    const q = new Parse.Query("EstablishmentProfile");
    est = await q.get(estId);

    function photoUrlFor(obj) {
      try {
        if (obj && typeof obj.get === "function") {
          const pf = obj.get("photo");
          if (pf && typeof pf.url === "function") return pf.url();
          if (obj.get("photoUrl")) return obj.get("photoUrl");
        }
        if (obj && obj.photo && obj.photo.url) return obj.photo.url;
      } catch (e) {}
      return null;
    }

    // === Perfil do cliente ===
    const clientQuery = new Parse.Query("ClientProfile");
    clientQuery.equalTo("user", user);
    clientProfile = await clientQuery.first();
    if (!clientProfile) {
      container.innerHTML = `
        <img src="${photoUrlFor(est) || "https://via.placeholder.com/150"}" alt="Foto">
        <h2>${est.get("name")}</h2>
        <p>⚠️ Você precisa cadastrar seu perfil antes de se vincular a um estabelecimento.</p>
        <button class="btn btn-blue" onclick="window.location.href='editar-perfil-cliente.html'">Cadastrar Perfil</button>
      `;
      return;
    }

    // === Exibe informações básicas ===
    container.innerHTML = `
      <img src="${photoUrlFor(est) || "https://via.placeholder.com/150"}" alt="Foto">
      <h2>${est.get("name")}</h2>
      <p>${est.get("description") || ""}</p>
      <p>📍 ${est.get("address") || "Endereço não informado"}</p>
      <p>🕒 Horário: ${est.get("startHour") || 8}h às ${est.get("endHour") || 18}h</p>
    `;

    // === Verifica relação cliente–estabelecimento ===
    const Relation = Parse.Object.extend("EstablishmentClientRelation");
    const relQ = new Parse.Query(Relation);
    relQ.equalTo("establishment", est);
    relQ.equalTo("client", clientProfile);
    const relation = await relQ.first();

    if (relation) {
      await inicializarAgenda(est, clientProfile);
    } else {
      container.innerHTML += `
        <textarea id="mensagemInteresse" placeholder="Envie uma mensagem para o estabelecimento"></textarea>
        <button class="btn btn-blue" id="btnInteresse">Solicitar Vínculo</button>
      `;
      document.getElementById("btnInteresse").addEventListener("click", async () => {
        const texto = document.getElementById("mensagemInteresse").value.trim();
        if (!texto) return alert("Digite uma mensagem antes de enviar.");
        const Interesse = Parse.Object.extend("Interesse");
        const i = new Interesse();
        i.set("client", clientProfile);
        i.set("establishment", est);
        i.set("message", texto);
        await i.save();
        msg.textContent = "Mensagem enviada! Aguarde o retorno do estabelecimento.";
        msg.style.color = "green";
      });
    }
  } catch (err) {
    console.error(err);
    msg.textContent = "Erro ao carregar o estabelecimento.";
    msg.style.color = "red";
  }

  // === Função principal de agenda ===
  async function inicializarAgenda(estabelecimento, cliente) {
    calendarEl.innerHTML = "";

    const Appointment = Parse.Object.extend("Appointment");
    const query = new Parse.Query(Appointment);
    query.include("professional");
    query.include("client");
    query.limit(1000);

    const resultados = await query.find();

    const eventos = resultados.map((a) => {
      const cli = a.get("client");
      const nomeCli = cli ? cli.get("name") : "";
      const status = a.get("status");
      return {
        id: a.id,
        title:
          status === "livre"
            ? "Disponível"
            : nomeCli
            ? `Consulta: ${nomeCli}`
            : "Ocupado",
        start: a.get("date"),
        end: a.get("endDate"),
        color: status === "livre" ? "#3498db" : "#27ae60",
        extendedProps: { status, clienteId: cli ? cli.id : null },
      };
    });

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "timeGridWeek",
      locale: "pt-br",
      nowIndicator: true,
      height: "auto",
      selectable: true,
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      },
      events: eventos,

      dateClick: async (info) => {
        const date = new Date(info.date);
        const day = date.toLocaleString("en-us", { weekday: "short" }).toLowerCase();
        const startHour = est.get("startHour") || 8;
        const endHour = est.get("endHour") || 18;
        const workingDays = est.get("workingDays") || ["mon", "tue", "wed", "thu", "fri"];
        const hour = date.getHours();

        if (!workingDays.includes(day)) {
          alert("O estabelecimento não funciona neste dia.");
          return;
        }
        if (hour < startHour || hour >= endHour) {
          alert("Este horário está fora do expediente.");
          return;
        }

        const conflictQuery = new Parse.Query("Appointment");
        conflictQuery.greaterThanOrEqualTo("date", date);
        conflictQuery.lessThan("date", new Date(date.getTime() + 60 * 60 * 1000));
        conflictQuery.equalTo("status", "ocupado");
        const conflito = await conflictQuery.first();
        if (conflito) {
          alert("Já existe uma consulta marcada nesse horário.");
          return;
        }

        selectedSlot = date;
        document.getElementById("textoDataMarcar").textContent =
          date.toLocaleString("pt-BR");
        abrirModal(modalMarcar);
      },

      eventClick: (info) => {
        const ev = info.event.extendedProps;
        if (ev.clienteId === cliente.id) {
          document.getElementById("textoDataCancelar").textContent =
            new Date(info.event.start).toLocaleString("pt-BR");
          document
            .getElementById("confirmarCancelar")
            .setAttribute("data-id", info.event.id);
          abrirModal(modalCancelar);
        } else {
          alert("Você só pode cancelar suas próprias consultas.");
        }
      },
    });

    calendar.render();

    // === Confirma marcação ===
    document.getElementById("confirmarMarcar").onclick = async () => {
      try {
        const novo = new Parse.Object("Appointment");
        novo.set("client", cliente);
        novo.set("status", "ocupado");
        novo.set("date", selectedSlot);
        novo.set("endDate", new Date(selectedSlot.getTime() + 60 * 60 * 1000));
        await novo.save();
        fecharModal(modalMarcar);
        alert("Consulta marcada com sucesso!");
        inicializarAgenda(estabelecimento, cliente);
      } catch (e) {
        console.error(e);
        alert("Erro ao marcar consulta.");
      }
    };

    document.getElementById("cancelarMarcar").onclick = () =>
      fecharModal(modalMarcar);

    // === Confirma cancelamento ===
    document.getElementById("confirmarCancelar").onclick = async (e) => {
      const id = e.target.getAttribute("data-id");
      try {
        const ap = new Parse.Query("Appointment");
        const ag = await ap.get(id);
        await ag.destroy();
        fecharModal(modalCancelar);
        alert("Consulta cancelada.");
        inicializarAgenda(estabelecimento, cliente);
      } catch (error) {
        console.error(error);
        alert("Erro ao cancelar consulta.");
      }
    };
    document.getElementById("fecharCancelar").onclick = () =>
      fecharModal(modalCancelar);
  }

  // === Funções utilitárias para modais ===
  function criarModal(id) {
    const modal = document.createElement("div");
    modal.id = id;
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        ${
          id === "modalMarcar"
            ? `
          <h3>Confirmar Agendamento</h3>
          <p id="textoDataMarcar"></p>
          <button id="confirmarMarcar" class="btn btn-green">Confirmar</button>
          <button id="cancelarMarcar" class="btn btn-blue">Cancelar</button>
        `
            : `
          <h3>Cancelar Consulta</h3>
          <p id="textoDataCancelar"></p>
          <button id="confirmarCancelar" class="btn btn-green">Confirmar</button>
          <button id="fecharCancelar" class="btn btn-blue">Fechar</button>
        `
        }
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function abrirModal(modal) {
    modal.style.display = "flex";
  }

  function fecharModal(modal) {
    modal.style.display = "none";
  }
});
