document.addEventListener('DOMContentLoaded', async () => {
	const user = await ensureSession('estabelecimento');
	if (!user) return;

	const lista = document.getElementById('lista-interesses');
	const msg = document.getElementById('mensagem');
	const notificationsList = document.getElementById('notifications-list');
	const noNotifications = document.getElementById('no-notifications');
	const refreshNotifications = document.getElementById('refresh-notifications');
	const markAllRead = document.getElementById('mark-all-read');

	if (refreshNotifications) refreshNotifications.addEventListener('click', () => loadNotifications());
	if (markAllRead) markAllRead.addEventListener('click', () => markAllNotifications());

	try {
		const EstablishmentProfile = Parse.Object.extend('EstablishmentProfile');
		const estQ = new Parse.Query(EstablishmentProfile);
		estQ.equalTo('user', user);
		const est = await estQ.first();
		if (!est) { if (msg) msg.textContent = 'Perfil de estabelecimento não encontrado.'; return; }

		const Interesse = Parse.Object.extend('Interesse');
		const iq = new Parse.Query(Interesse);
		iq.equalTo('establishment', est);
		iq.descending('createdAt');
		iq.include('client');
		const interesses = await iq.find();

		if (!interesses || interesses.length === 0) { lista.innerHTML = '<li>Nenhuma solicitação.</li>'; return; }

		lista.innerHTML = '';

		// Carregar notificações inicialmente
		await loadNotifications();
		interesses.forEach(i => {
			const li = document.createElement('li');
			const client = i.get('client');
			const nome = client ? (client.get ? client.get('name') : client.name) : 'Cliente';
			li.innerHTML = `<strong>${nome}</strong> - ${i.get('message') || ''} <button data-id="${i.id}" class="btn-aceitar">Aceitar</button> <button data-id="${i.id}" class="btn-rejeitar">Rejeitar</button>`;
			lista.appendChild(li);
		});

		lista.querySelectorAll('.btn-aceitar').forEach(b => b.addEventListener('click', async (ev) => {
			const id = ev.target.getAttribute('data-id');
			try {
				await aceitarInteresse(id);
				alert('Interessado aceito e adicionado aos clientes do estabelecimento.');
				location.reload();
			} catch (err) {
				console.error('Erro ao aceitar interesse:', err);
				alert('Erro ao aceitar interesse. Veja o console.');
			}
		}));

		lista.querySelectorAll('.btn-rejeitar').forEach(b => b.addEventListener('click', async (ev) => {
			const id = ev.target.getAttribute('data-id');
			try {
				await rejeitarInteresse(id);
				alert('Solicitação rejeitada.');
				location.reload();
			} catch (err) {
				console.error('Erro ao rejeitar interesse:', err);
				alert('Erro ao rejeitar interesse. Veja o console.');
			}
		}));

	} catch (err) {
		console.error(err);
		if (msg) msg.textContent = 'Erro ao carregar interesses.';
	}

	async function aceitarInteresse(id) {
		const Interesse = Parse.Object.extend('Interesse');
		const i = await new Parse.Query(Interesse).get(id);
		if (!i) throw new Error('Interesse não encontrado');
		const Relation = Parse.Object.extend('EstablishmentClientRelation');
		// checar duplicata
		const relQ = new Parse.Query(Relation);
		relQ.equalTo('establishment', i.get('establishment'));
		relQ.equalTo('client', i.get('client'));
		const existingRel = await relQ.first();
		if (!existingRel) {
			const r = new Relation();
			r.set('establishment', i.get('establishment'));
			r.set('client', i.get('client'));
			r.set('status', 'ativo');
			await r.save();
		} else {
			console.log('Relação já existe — pulando criação');
		}
		// tentar notificar o cliente
		try {
			const Notificacao = Parse.Object.extend('Notificacao');
			const notif = new Notificacao();
			// destinatário: cliente
			notif.set("client", i.get('client'));
			try { notif.set('fromEstablishment', i.get('establishment')); } catch(e){}
			notif.set("type", "aceito");
			notif.set("message", "Seu pedido de vínculo com o estabelecimento foi aceito.");
			notif.set("status", "nova");
			await notif.save();
		} catch (e) { console.warn('Não foi possível criar notificação:', e); }
		await i.destroy();
	}

	async function rejeitarInteresse(id) {
		const Interesse = Parse.Object.extend('Interesse');
		const i = await new Parse.Query(Interesse).get(id);
		if (!i) throw new Error('Interesse não encontrado');
		// notificar rejeição
		try {
			const Notificacao = Parse.Object.extend('Notificacao');
			const notif = new Notificacao();
			// destinatário: cliente
			notif.set("client", i.get('client'));
			try { notif.set('fromEstablishment', i.get('establishment')); } catch(e){}
			notif.set("type", "rejeitado");
			notif.set("message", "Seu pedido de vínculo com o estabelecimento foi rejeitado.");
			notif.set("status", "nova");
			await notif.save();
		} catch (e) { console.warn('Não foi possível criar notificação:', e); }
		await i.destroy();
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
				li.innerHTML = `<strong>${nome}</strong>: ${n.get('message') || n.get('type') || ''} <button data-id="${n.id}" class="mark-read">Marcar lida</button>`;
				notificationsList.appendChild(li);
			});
			notificationsList.querySelectorAll('.mark-read').forEach(b=> b.addEventListener('click', async (ev)=>{ const id = ev.target.getAttribute('data-id'); await markNotificationRead(id); await loadNotifications(); }));
		} catch(e){ console.error('Erro carregando notificações (interesses):', e); }
	}

	async function markNotificationRead(id){ try { const Notificacao = Parse.Object.extend('Notificacao'); const o = new Notificacao(); o.id = id; o.set('status','lida'); await o.save(); } catch(e){ console.error(e); } }

	async function markAllNotifications(){ try { const Notificacao = Parse.Object.extend('Notificacao'); const q = new Parse.Query(Notificacao); q.equalTo('establishment', est); q.equalTo('status','nova'); const notas = await q.find(); for (const n of notas){ n.set('status','lida'); await n.save(); } await loadNotifications(); } catch(e){ console.error(e); } }

});
