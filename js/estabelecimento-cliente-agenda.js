document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) { alert('Você precisa estar logado.'); window.location.href='login.html'; return; }

  const params = new URLSearchParams(window.location.search);
  const estId = params.get('id');
  const container = document.getElementById('perfilEstabelecimento');
  const msg = document.getElementById('mensagem');
  if (!estId) { container.innerHTML = '<p>Nenhum estabelecimento selecionado.</p>'; return; }
  try {
    const q = new Parse.Query('EstablishmentProfile');
    const est = await q.get(estId);
  if (!est) { container.innerHTML = '<p>Estabelecimento não encontrado.</p>'; return; }

    function photoUrlFor(obj){ try { if (obj && typeof obj.get==='function') { const pf = obj.get('photo'); if (pf && typeof pf.url === 'function') return pf.url(); if (obj.get('photoUrl')) return obj.get('photoUrl'); } if (obj && obj.photo && obj.photo.url) return obj.photo.url; } catch(e){} return null; }

    const clientQuery = new Parse.Query('ClientProfile'); clientQuery.equalTo('user', user); const clientProfile = await clientQuery.first();
    if (!clientProfile) {
      container.innerHTML = `
        <img src="${photoUrlFor(est) || 'https://via.placeholder.com/150'}" alt="Foto">
        <h2>${est.get('name')}</h2>
        <p>${est.get('description') || ''}</p>
        <p>📍 ${est.get('address') || 'Endereço não informado'}</p>
        <p>⚠️ Você precisa cadastrar seu perfil antes de se vincular a um estabelecimento.</p>
        <button class="btn" onclick="window.location.href='editar-perfil-cliente.html'">Cadastrar Perfil</button>
      `;
      return;
    }

    container.innerHTML = `
      <img src="${photoUrlFor(est) || 'https://via.placeholder.com/150'}" alt="Foto">
      <h2>${est.get('name')}</h2>
      <p>${est.get('description') || ''}</p>
      <p>💲 ${est.get('price') ? 'R$ ' + est.get('price').toFixed(2) : 'Preço não informado'}</p>
      <p>📍 ${est.get('address') || 'Endereço não informado'}</p>
  <p>📧 ${est.get('contactEmail') ? `<a href="mailto:${est.get('contactEmail')}">${est.get('contactEmail')}</a>` : 'E-mail não informado'}</p>
  <p>📞 ${est.get('phone') ? `<a href="tel:${est.get('phone')}">${est.get('phone')}</a>` : 'Telefone não informado'}</p>
    `;

    // check existing relation between client and establishment (use EstablishmentClientRelation)
    const Relation = Parse.Object.extend('EstablishmentClientRelation');
    const relQ = new Parse.Query(Relation);
    relQ.equalTo('establishment', est);
    relQ.equalTo('client', clientProfile);
    const relation = await relQ.first();
    if (relation) {
      container.innerHTML += `<button class="btn btn-green" onclick="window.location.href='estabelecimento-agenda.html?id=${est.id}'">Ver Agenda</button>`;
    } else {
      container.innerHTML += `
        <textarea id="mensagemInteresse" placeholder="Envie uma mensagem para o estabelecimento"></textarea>
        <button class="btn" id="btnInteresse">Solicitar Vínculo</button>
      `;
      document.getElementById('btnInteresse').addEventListener('click', async ()=>{
        const texto = document.getElementById('mensagemInteresse').value.trim();
        if (!texto) return alert('Digite uma mensagem antes de enviar.');
        const Interesse = Parse.Object.extend('Interesse');
        const i = new Interesse();
        i.set('client', clientProfile);
        i.set('establishment', est);
        i.set('message', texto);
        await i.save();
        msg.textContent = 'Mensagem enviada! Aguarde o retorno do estabelecimento.';
        msg.style.color = 'green';
      });
    }
  } catch (err) { console.error(err); msg.textContent = 'Erro ao carregar o estabelecimento.'; msg.style.color='red'; }

});
