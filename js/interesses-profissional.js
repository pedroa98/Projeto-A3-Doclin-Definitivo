document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  const lista = document.getElementById("listaInteressados");
  const mensagem = document.getElementById("mensagem");

  try {
    const profQuery = new Parse.Query("ProfessionalProfile");
    profQuery.equalTo("user", user);
    const prof = await profQuery.first();
    if (!prof) {
      mensagem.textContent = "Configure seu perfil antes.";
      return;
    }

    mensagem.textContent = "Carregando interessados...";

    const Interesse = Parse.Object.extend("Interesse");
    const query = new Parse.Query(Interesse);
    query.equalTo("professional", prof);
    query.include("client");
    const interessados = await query.find();

    if (interessados.length === 0) {
      mensagem.textContent = "Nenhum cliente interessado no momento.";
      return;
    }

    mensagem.textContent = "";
    lista.innerHTML = "";

    interessados.forEach(item => {
      const client = item.get("client");
      const nome = client.get("name");
      const msg = item.get("message");
      const foto = client.get("photoUrl") || "https://via.placeholder.com/100";

      const card = document.createElement("div");
      card.className = "interessado-card";
      card.innerHTML = `
        <h3>${nome}</h3>
        <p>${msg}</p>
        <button class="btn btn-green btn-aceitar">Aceitar</button>
        <button class="btn btn-red btn-recusar">Recusar</button>
      `;

      card.querySelector(".btn-aceitar").addEventListener("click", async () => {
        try {
          const Relation = Parse.Object.extend("ProfessionalClientRelation");
          // checar duplicata
          const relQ = new Parse.Query(Relation);
          relQ.equalTo('professional', prof);
          relQ.equalTo('client', client);
          const existing = await relQ.first();
          if (!existing) {
            const rel = new Relation();
            rel.set("professional", prof);
            rel.set("client", client);
            rel.set("status", "ativo");
            rel.set("sessionsPaid", 0);
            rel.set("sessionsUsed", 0);
            await rel.save();
          } else {
            console.log('Relação ProfessionalClientRelation já existe — pulando criação');
          }

          // Create notification for the client so they see the acceptance in their dashboard
          try {
            const Notificacao = Parse.Object.extend("Notificacao");
            const notif = new Notificacao();
            // destinatário: cliente
            notif.set("client", client);
            // remetente profissional (contexto)
            try { notif.set('fromProfessional', prof); } catch(e){}
            notif.set("message", `Seu pedido foi aceito pelo profissional ${prof.get ? prof.get('name') : ''}`);
            notif.set("status", "nova");
            notif.set("type", "aceito");
            const saved = await notif.save();
            console.log('Notificacao criada id=', saved.id || saved.objectId);
          } catch (nErr) {
            console.error('Erro ao criar notificacao de aceite:', nErr);
          }

          // remove the interesse
          try {
            await item.destroy();
          } catch (dErr) {
            console.warn('Falha ao remover Interesse (aceitar):', dErr);
          }

          card.remove();
          alert(`Cliente ${nome} aceito com sucesso!`);
        } catch (e) {
          console.error('Erro no fluxo de aceitar cliente:', e);
          alert('Erro ao aceitar o cliente. Veja o console para mais detalhes.');
        }
      });

      card.querySelector(".btn-recusar").addEventListener("click", async () => {
        try {
          // notify client of refusal
          try {
            const Notificacao = Parse.Object.extend("Notificacao");
            const notif = new Notificacao();
            // destinatário: cliente
            notif.set("client", client);
            try { notif.set('fromProfessional', prof); } catch(e){}
            notif.set("message", `O profissional ${prof.get ? prof.get('name') : ''} não está disponível no momento.`);
            notif.set("status", "nova");
            notif.set("type", "recusado");
            const saved = await notif.save();
            console.log('Notificacao (recusa) criada id=', saved.id || saved.objectId);
          } catch (nErr) {
            console.error('Erro ao criar notificacao de recusa:', nErr);
          }

          try {
            await item.destroy();
          } catch (dErr) {
            console.warn('Falha ao remover Interesse (recusar):', dErr);
          }

          card.remove();
        } catch (e) {
          console.error('Erro ao recusar cliente:', e);
          alert('Erro ao recusar o cliente. Veja o console para mais detalhes.');
        }
      });

      lista.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    mensagem.textContent = "Erro ao carregar interessados.";
  }
});
