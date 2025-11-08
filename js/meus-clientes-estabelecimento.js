document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureSession('estabelecimento');
  if (!user) return;

  const lista = document.getElementById('listaClientes');
  const msg = document.getElementById('mensagem');
  const notificationsList = document.getElementById('notifications-list');
  const noNotifications = document.getElementById('no-notifications');
  const refreshNotifications = document.getElementById('refresh-notifications');
  const markAllRead = document.getElementById('mark-all-read');
  const removeRead = document.getElementById('remove-read');

  if (refreshNotifications) refreshNotifications.addEventListener('click', () => loadNotifications());
  if (markAllRead) markAllRead.addEventListener('click', () => markAllNotifications());
  if (removeRead) removeRead.addEventListener('click', () => removeReadNotifications());

  try {
    const EstablishmentProfile = Parse.Object.extend('EstablishmentProfile');
    const q = new Parse.Query(EstablishmentProfile);
    q.equalTo('user', user);
    const est = await q.first();
    if (!est) { msg.textContent = 'Perfil de estabelecimento não encontrado.'; return; }

    const Relation = Parse.Object.extend('EstablishmentClientRelation');
    const rQ = new Parse.Query(Relation);
    rQ.equalTo('establishment', est);
    rQ.equalTo('status', 'ativo');
    rQ.include('client');
    const rels = await rQ.find();

    if (!rels.length) { lista.innerHTML = '<p>Nenhum cliente vinculado.</p>'; return; }

  // Carrega notificações do estabelecimento (inicial)
  await loadNotifications();

    lista.innerHTML = '';

    function photoUrlFor(obj){ try { if (obj && typeof obj.get==='function') { const pf = obj.get('photo'); if (pf && typeof pf.url === 'function') return pf.url(); if (obj.get('photoUrl')) return obj.get('photoUrl'); } if (obj && obj.photo && obj.photo.url) return obj.photo.url; } catch(e){} return 'https://via.placeholder.com/100'; }

    for (const rel of rels) {
      const client = rel.get('client');
      const nome = client?.get('name') || 'Cliente';
  const telefone = client?.get('phone') || 'Não informado';
  const email = client?.get('contactEmail') || client?.get('email') || 'E-mail não informado';
      const foto = photoUrlFor(client);
      const card = document.createElement('div');
      card.className = 'cliente-card';
      card.innerHTML = `
        <img src="${foto}" alt="${nome}">
        <h3>${nome}</h3>
  <p>📞 ${telefone && telefone !== 'Não informado' ? `<a href="tel:${telefone}">${telefone}</a>` : telefone}</p>
  <p>📧 ${email && email !== 'E-mail não informado' ? `<a href="mailto:${email}">${email}</a>` : email}</p>
        <button class="btn btn-green btn-promo">📢 Enviar Promoção</button>
        <button class="btn btn-red btn-encerrar">Encerrar Vínculo</button>
      `;

      card.querySelector('.btn-promo').addEventListener('click', async ()=>{
        const texto = prompt('Mensagem promocional para este cliente:');
        if (!texto) return;
        await enviarNotificacao(client, est, texto, 'promoção');
        alert('Promoção enviada.');
      });

      card.querySelector('.btn-encerrar').addEventListener('click', async ()=>{
        if (!confirm(`Encerrar vínculo com ${nome}?`)) return;
        await enviarNotificacao(client, est, 'O estabelecimento encerrou o vínculo.', 'encerramento');
        await rel.destroy();
        alert('Vínculo encerrado.');
        location.reload();
      });

      lista.appendChild(card);
    }

  } catch (err) {
    console.error(err);
    msg.textContent = 'Erro ao carregar clientes.';
  }

  async function loadNotifications(){
    try {
      if (!notificationsList || !noNotifications) return;
      notificationsList.innerHTML = '';
      const Notificacao = Parse.Object.extend('Notificacao');
      const nq = new Parse.Query(Notificacao);
      nq.equalTo('establishment', est);
      nq.equalTo('status', 'nova');
      nq.descending('createdAt');
      nq.include('client');
      const notas = await nq.find();
      if (!notas || notas.length === 0) { noNotifications.style.display = ''; return; }
      noNotifications.style.display = 'none';
      notas.forEach(n => {
        const li = document.createElement('li');
        const client = n.get('client');
        const nome = client ? (client.get ? client.get('name') : client.name) : 'Cliente';
        li.innerHTML = `<div class="notif-item"><div class="notif-body"><strong>${nome}</strong>: ${n.get('message') || n.get('type') || ''}</div><div class="notif-actions"><button data-id="${n.id}" class="mark-read">Marcar lida</button><button data-id="${n.id}" class="remove-notif">Remover</button></div></div>`;
        notificationsList.appendChild(li);
      });
      notificationsList.querySelectorAll('.mark-read').forEach(b=> b.addEventListener('click', async (ev)=>{ const id = ev.target.getAttribute('data-id'); await markNotificationRead(id); await loadNotifications(); }));
      notificationsList.querySelectorAll('.remove-notif').forEach(b=> b.addEventListener('click', async (ev)=>{ const id = ev.target.getAttribute('data-id'); try { const Notificacao = Parse.Object.extend('Notificacao'); const o = new Notificacao(); o.id = id; await o.destroy(); } catch(e){ try{ const cfg = window.PARSE_CONFIG; await fetch(`${cfg.serverURL}/classes/Notificacao/${id}`,{ method:'DELETE', headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken } }); } catch(err){ console.error(err); } } await loadNotifications(); }));
    } catch (e) { console.error('Erro carregando notificações (est):', e); }
  }

  async function markNotificationRead(id){
    try { const Notificacao = Parse.Object.extend('Notificacao'); const o = new Notificacao(); o.id = id; o.set('status','lida'); await o.save(); } catch (e) { console.error(e); }
  }

  async function markAllNotifications(){
    try { const Notificacao = Parse.Object.extend('Notificacao'); const q = new Parse.Query(Notificacao); q.equalTo('establishment', est); q.equalTo('status','nova'); const notas = await q.find(); for (const n of notas){ n.set('status','lida'); await n.save(); } await loadNotifications(); } catch(e){ console.error(e); }
  }

  async function removeReadNotifications(){
    try {
      const Notificacao = Parse.Object.extend('Notificacao');
      const q = new Parse.Query(Notificacao);
      q.equalTo('establishment', est);
      q.equalTo('status','lida');
      const notas = await q.find();
      for (const n of notas) { await n.destroy(); }
      await loadNotifications();
    } catch (e) { console.error('Erro removendo lidas (meus-clientes-est):', e); }
  }

  async function enviarNotificacao(cliente, estabelecimento, texto, tipo){
    const Notificacao = Parse.Object.extend('Notificacao');
    const n = new Notificacao();
    // destinatário: cliente
    n.set('client', cliente);
    // remetente informativo: estabelecimento
    try { n.set('fromEstablishment', estabelecimento); } catch(e){}
    if (tipo) n.set('type', tipo);
    n.set('message', texto);
    n.set('status', 'nova');
    await n.save();
  }
});