document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession("estabelecimento");
  if (!user) return;

  const lista = document.getElementById("listaClientes");
  const msg = document.getElementById("mensagem");
  const btnPromocao = document.getElementById("btnPromocao");

  let est = null;

  try {
    // Busca o perfil do estabelecimento logado
    const EstablishmentProfile = Parse.Object.extend("EstablishmentProfile");
    const q = new Parse.Query(EstablishmentProfile);
    q.equalTo("user", user);
    est = await q.first();

    if (!est) {
      msg.textContent = "Perfil de estabelecimento não encontrado.";
      return;
    }

    // Busca clientes vinculados
    const Relation = Parse.Object.extend("EstablishmentClientRelation");
    const rQ = new Parse.Query(Relation);
    rQ.equalTo("establishment", est);
    rQ.equalTo("status", "ativo");
    rQ.include("client");
    const rels = await rQ.find();

    if (!rels.length) {
      lista.innerHTML = "<p>Nenhum cliente vinculado.</p>";
      return;
    }

    lista.innerHTML = "";

    const photoUrlFor = (obj) => {
      try {
        if (obj && typeof obj.get === "function") {
          const pf = obj.get("photo");
          if (pf && typeof pf.url === "function") return pf.url();
          if (obj.get("photoUrl")) return obj.get("photoUrl");
        }
        if (obj && obj.photo && obj.photo.url) return obj.photo.url;
      } catch (e) {}
      return "https://via.placeholder.com/150";
    };

    for (const rel of rels) {
      const client = rel.get("client");
      const nome = client?.get("name") || "Cliente";
      const telefone = client?.get("phone") || "Não informado";
      const email =
        client?.get("contactEmail") ||
        client?.get("email") ||
        "E-mail não informado";
      const foto = photoUrlFor(client);

      const card = document.createElement("div");
      card.className = "cliente-card";
      card.innerHTML = `
        <img src="${foto}" alt="${nome}">
        <h3>${nome}</h3>
        <p>📞 ${
          telefone && telefone !== "Não informado"
            ? `<a href="tel:${telefone}">${telefone}</a>`
            : telefone
        }</p>
        <p>📧 ${
          email && email !== "E-mail não informado"
            ? `<a href="mailto:${email}">${email}</a>`
            : email
        }</p>
        <button class="btn btn-green btn-promo">📢 Enviar Promoção</button>
        <button class="btn btn-danger btn-encerrar">Encerrar Vínculo</button>
      `;

      // Enviar promoção individual
      card.querySelector(".btn-promo").addEventListener("click", async () => {
        const texto = prompt(`Mensagem promocional para ${nome}:`);
        if (!texto) return;
        await enviarNotificacao(client, est, texto, "promoção");
        alert("Promoção enviada com sucesso ✅");
      });

      // Encerrar vínculo
      card.querySelector(".btn-encerrar").addEventListener("click", async () => {
        if (!confirm(`Encerrar vínculo com ${nome}?`)) return;
        await enviarNotificacao(
          client,
          est,
          "O estabelecimento encerrou o vínculo.",
          "encerramento"
        );
        await rel.destroy();
        alert("Vínculo encerrado.");
        location.reload();
      });

      lista.appendChild(card);
    }

    // Botão de promoção em massa
    if (btnPromocao) {
      btnPromocao.addEventListener("click", async () => {
        const texto = prompt(
          "Digite a mensagem da promoção que será enviada a todos os clientes:"
        );
        if (!texto) return;
        for (const rel of rels) {
          const client = rel.get("client");
          await enviarNotificacao(client, est, texto, "promoção");
        }
        alert("Promoção enviada para todos os clientes ✅");
      });
    }
  } catch (err) {
    console.error(err);
    msg.textContent = "Erro ao carregar clientes.";
  }

  // ==== ENVIO DE NOTIFICAÇÃO (cliente) ====
  async function enviarNotificacao(cliente, estabelecimento, texto, tipo) {
    const Notificacao = Parse.Object.extend("Notificacao");
    const n = new Notificacao();
    n.set("client", cliente);
    n.set("fromEstablishment", estabelecimento);
    n.set("message", texto);
    if (tipo) n.set("type", tipo);
    n.set("status", "nova");
    await n.save();
  }
});