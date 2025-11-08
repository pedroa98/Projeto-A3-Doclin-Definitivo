document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  if (user.get("role") !== "profissional") {
    alert("Acesso negado.");
    window.location.href = "login.html";
    return;
  }

  const lista = document.getElementById("listaClientes");
  const mensagem = document.getElementById("mensagem");
  const btnPromoAll = document.getElementById("promoAll");

  let clientesAtivos = [];

  try {
    mensagem.textContent = "Carregando seus clientes...";

    const profQuery = new Parse.Query("ProfessionalProfile");
    profQuery.equalTo("user", user);
    const prof = await profQuery.first();
    if (!prof) {
      mensagem.textContent = "Você ainda não configurou seu perfil profissional.";
      return;
    }

    const Relation = Parse.Object.extend("ProfessionalClientRelation");
    const query = new Parse.Query(Relation);
    query.equalTo("professional", prof);
    query.equalTo("status", "ativo");
    query.include("client");
    const relations = await query.find();

    if (relations.length === 0) {
      mensagem.textContent = "Você ainda não possui clientes.";
      return;
    }

    clientesAtivos = relations.map(r => r.get("client"));
    mensagem.textContent = "";
    lista.innerHTML = "";

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
      return "https://via.placeholder.com/100";
    }

    relations.forEach(rel => {
      const client = rel.get("client");
      const nome = client?.get("name") || "Cliente";
  const telefone = client?.get("phone") || "Não informado";
  const email = client?.get("contactEmail") || client?.get("email") || "E-mail não informado";
      const idade = calcIdade(client?.get("birthDate"));
      const foto = photoUrlFor(client);
      const pagas = rel.get("sessionsPaid") || 0;
      const usadas = rel.get("sessionsUsed") || 0;
      const disponiveis = pagas - usadas;

      const card = document.createElement("div");
      card.className = "cliente-card";
      card.innerHTML = `
        <img src="${foto}" alt="${nome}">
        <h3>${nome}</h3>
  <p>📞 ${telefone && telefone !== 'Não informado' ? `<a href="tel:${telefone}">${telefone}</a>` : telefone}</p>
  <p>📧 ${email && email !== 'E-mail não informado' ? `<a href="mailto:${email}">${email}</a>` : email}</p>
        <p>🎂 ${idade ? idade + " anos" : "Idade não informada"}</p>
        <p>💰 Sessões: ${usadas}/${pagas} (${disponiveis} disponíveis)</p>
        <button class="btn btn-green btn-add">Adicionar Crédito</button>
        <button class="btn btn-blue btn-promo">📢 Notificação Promocional</button>
        <button class="btn btn-red btn-encerrar">Encerrar</button>
      `;

      // adicionar créditos
      card.querySelector(".btn-add").addEventListener("click", async () => {
        const add = parseInt(prompt("Quantas novas sessões deseja adicionar?"), 10);
        if (!isNaN(add) && add > 0) {
          rel.increment("sessionsPaid", add);
          await rel.save();
          alert(`+${add} sessões adicionadas!`);
          location.reload();
        }
      });

      // enviar notificação promocional
      card.querySelector(".btn-promo").addEventListener("click", async () => {
        const texto = prompt("Digite a mensagem da promoção para este cliente:");
        if (!texto) return;
        await enviarNotificacao(client, prof, texto, "promoção");
        alert("Notificação de promoção enviada!");
      });

      // encerrar vínculo
      card.querySelector(".btn-encerrar").addEventListener("click", async () => {
        if (!confirm(`Encerrar vínculo com ${nome}?`)) return;
        await enviarNotificacao(client, prof, "O profissional encerrou seu vínculo.", "encerramento");
        await rel.destroy(); // apaga relação
        alert("Vínculo encerrado e notificação enviada!");
        location.reload();
      });

      lista.appendChild(card);
    });

    // botão de promoção em massa
    btnPromoAll.addEventListener("click", async () => {
      if (!clientesAtivos.length) return alert("Nenhum cliente ativo.");
      const texto = prompt("Digite a mensagem da promoção para todos os clientes:");
      if (!texto) return;

      for (const cliente of clientesAtivos) {
        await enviarNotificacao(cliente, prof, texto, "promoção");
      }
      alert("Promoção enviada para todos os clientes!");
    });

  } catch (err) {
    console.error(err);
    mensagem.textContent = "Erro ao carregar lista de clientes.";
  }

  function calcIdade(data) {
    if (!data) return null;
    const hoje = new Date();
    const nasc = new Date(data);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
  }
});

async function enviarNotificacao(cliente, prof, texto, tipo) {
  const Notificacao = Parse.Object.extend("Notificacao");
  const n = new Notificacao();
  // destinatário: cliente
  n.set("client", cliente);
  // remetente profissional (informativo)
  try { n.set('fromProfessional', prof); } catch(e){}
  if (tipo) n.set("type", tipo);
  n.set("message", texto);
  n.set("status", "nova");
  await n.save();
}
