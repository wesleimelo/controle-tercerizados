// Página da coordenação: painel, histórico, resumo do mês, motoristas e veículos.
(function () {
  'use strict';
  var RC = window.RC, h = RC.h, $ = RC.$, sb = RC.sb;
  var profile = null;
  var view = { tab: 'p' };
  var flt = { month: '', vehicle: 'all', driver: 'all' };
  var cache = { month: '', routes: [] };
  var vehicles = [], people = [];
  var pollT = null;
  var TABS = ['P', 'H', 'R', 'M', 'V'];

  /* ---------- entrada e navegação ---------- */
  function showLogin() {
    clearInterval(pollT);
    $('who').hidden = true; $('tabs').hidden = true; RC.banner('');
    RC.loginView($('view'), { role: 'coord', onDone: function (p) { profile = p; start(); } });
  }
  function start() {
    $('who').hidden = false; $('tabs').hidden = false;
    $('who').replaceChildren(h('div', { class: 'whoin' },
      h('div', { class: 'nm' }, h('span', { class: 'lbl' }, 'Coordenação'), h('strong', null, profile.full_name)),
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.signOut(); } }, 'Sair')
    ));
    flt = { month: RC.lastMonths(1)[0], vehicle: 'all', driver: 'all' };
    setTab('p');
    clearInterval(pollT);
    pollT = setInterval(function () { if (!document.hidden && profile && view.tab === 'p') renderPanel(); }, 30000);
  }
  function setTab(t) {
    view.tab = t;
    TABS.forEach(function (k) { $('tab' + k).setAttribute('aria-current', k.toLowerCase() === t ? 'page' : 'false'); });
    RC.banner('');
    ({ p: renderPanel, h: function () { return renderHistory(true); }, r: renderSummary, m: renderPeople, v: renderVehicles })[t]();
  }
  function loading() { $('view').replaceChildren(h('div', { class: 'empty' }, 'Carregando…')); }
  function fail(e) { if (/permission|JWT/i.test((e && e.message) || '')) { RC.signOut(); return; } $('view').replaceChildren(h('div', { class: 'empty' }, RC.errText(e))); }

  /* ---------- dados ---------- */
  async function loadRoutes(month) {
    var rg = RC.monthRange(month);
    var r = await sb.from('routes').select('*').gte('start_at', rg.start).lt('start_at', rg.end).order('start_at', { ascending: false }).limit(2000);
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function loadVehicles() {
    var r = await sb.from('vehicles').select('*').order('name');
    if (r.error) throw r.error;
    vehicles = r.data || [];
  }
  async function loadPeople() {
    var r = await sb.from('profiles').select('*').order('full_name');
    if (r.error) throw r.error;
    people = r.data || [];
  }
  async function manage(body) {
    var r = await sb.functions.invoke('manage-users', { body: body });
    if (r.error) {
      var msg = 'Não foi possível concluir. Tente de novo.';
      try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* mantém a mensagem padrão */ }
      throw new Error(msg);
    }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data;
  }
  function sum(rows) { return rows.reduce(function (a, x) { return a + (x.km_driven || 0); }, 0); }

  /* ---------- painel ---------- */
  async function renderPanel() {
    if (view.tab !== 'p') return;
    try {
      var results = await Promise.all([sb.rpc('vehicle_board'), loadRoutes(RC.lastMonths(1)[0])]);
      if (view.tab !== 'p') return;
      if (results[0].error) throw results[0].error;
      var board = results[0].data || [], rows = results[1];
      var today = new Date().toLocaleDateString('sv-SE', { timeZone: RC.TZ });
      var todayRows = rows.filter(function (x) { return new Date(x.start_at).toLocaleDateString('sv-SE', { timeZone: RC.TZ }) === today; });
      var running = board.filter(function (v) { return v.route_id; }).length;
      var grid = h('div', { class: 'board' });
      board.forEach(function (v) {
        var open = !!v.route_id;
        var meta = open ? 'Saiu ' + RC.fmtTime(v.start_at) + ' · ' + v.driver_name + ' · km ' + RC.fmtKm(v.start_km)
          : (v.last_km != null ? 'Último km: ' + RC.fmtKm(v.last_km) : 'Sem rotas registradas');
        grid.append(h('div', { class: 'vcard' },
          h('div', { class: 'row' }, RC.plate(v.plate), h('span', { class: 'pill ' + (open ? 'run' : 'free') }, open ? 'Em rota' : 'No CD')),
          h('div', { class: 'vname' }, v.name),
          h('div', { class: 'vmeta' }, meta),
          open ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(v.start_photo, 'Odômetro na saída · ' + v.plate); } }, 'Foto da saída') : null
        ));
      });
      $('view').replaceChildren(h('div', { class: 'list' },
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Em rota agora'), h('b', null, String(running))),
          h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Rotas hoje'), h('b', null, String(todayRows.length))),
          h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Km no mês'), h('b', null, RC.fmtKm(sum(rows))))
        ),
        board.length ? grid : h('div', { class: 'empty' }, 'Nenhum veículo ativo. Cadastre na aba Veículos.')
      ));
    } catch (e) { fail(e); }
  }

  /* ---------- histórico ---------- */
  function monthSelect(onChange) {
    var sel = h('select', { id: 'fMonth', class: 'input' });
    RC.lastMonths(12).forEach(function (k) { sel.append(h('option', { value: k }, RC.monthLabel(k))); });
    sel.value = flt.month;
    sel.addEventListener('change', function () { flt.month = sel.value; onChange(); });
    return RC.lbl('fMonth', 'Mês', sel);
  }
  async function renderHistory(reload) {
    if (view.tab !== 'h') return;
    try {
      if (reload || cache.month !== flt.month) { loading(); await loadVehicles(); cache = { month: flt.month, routes: await loadRoutes(flt.month) }; }
      if (view.tab !== 'h') return;
      var rows = cache.routes.filter(function (x) {
        return (flt.vehicle === 'all' || x.vehicle_id === flt.vehicle) && (flt.driver === 'all' || x.driver_id === flt.driver);
      });
      var vSel = h('select', { id: 'fVeh', class: 'input' }, h('option', { value: 'all' }, 'Todos'));
      vehicles.forEach(function (v) { vSel.append(h('option', { value: v.id }, v.name + ' · ' + v.plate)); });
      vSel.value = flt.vehicle;
      vSel.addEventListener('change', function () { flt.vehicle = vSel.value; renderHistory(false); });
      var names = {};
      cache.routes.forEach(function (x) { names[x.driver_id] = x.driver_name; });
      var dSel = h('select', { id: 'fDrv', class: 'input' }, h('option', { value: 'all' }, 'Todos'));
      Object.keys(names).sort(function (a, b) { return names[a].localeCompare(names[b], 'pt-BR'); }).forEach(function (id) { dSel.append(h('option', { value: id }, names[id])); });
      dSel.value = names[flt.driver] ? flt.driver : 'all';
      dSel.addEventListener('change', function () { flt.driver = dSel.value; renderHistory(false); });
      var tools = h('div', { class: 'tools' },
        monthSelect(function () { renderHistory(false); }),
        RC.lbl('fVeh', 'Veículo', vSel),
        RC.lbl('fDrv', 'Motorista', dSel)
      );
      var closed = rows.filter(function (x) { return x.status === 'closed'; });
      var wrap = h('div', { class: 'list' });
      wrap.append(h('div', { class: 'tot' }, h('span', { class: 'hint' }, closed.length + ' rotas finalizadas'), h('b', null, RC.fmtKm(sum(rows)) + ' km')));
      if (rows.length) {
        wrap.append(h('div', null, h('button', {
          class: 'btn ghost', type: 'button', onclick: function () {
            var out = [['Data', 'Placa', 'Veículo', 'Motorista', 'Saída', 'Chegada', 'Km inicial', 'Km final', 'Km rodado', 'Situação', 'Observações']];
            rows.slice().reverse().forEach(function (x) {
              out.push([RC.fmtFull(x.start_at), x.plate, x.vehicle_name, x.driver_name, RC.fmtTime(x.start_at), x.end_at ? RC.fmtTime(x.end_at) : '', x.start_km, x.end_km == null ? '' : x.end_km, x.km_driven == null ? '' : x.km_driven, x.status === 'open' ? 'Em rota' : 'Finalizada', x.notes || '']);
            });
            RC.saveCsv('rotas-cd-' + flt.month, out);
          }
        }, 'Baixar planilha (CSV)')));
      } else {
        wrap.append(h('div', { class: 'empty' }, 'Nenhuma rota neste filtro.'));
      }
      rows.forEach(function (x) { wrap.append(routeRow(x)); });
      $('view').replaceChildren(tools, wrap);
      $('view').style.display = 'flex'; $('view').style.flexDirection = 'column'; $('view').style.gap = '16px';
    } catch (e) { fail(e); }
  }
  function routeRow(x) {
    var open = x.status === 'open';
    var m = RC.msgBox();
    var sk = h('input', { id: 'sk_' + x.id, class: 'input', type: 'text', inputmode: 'numeric', value: String(x.start_km) });
    var ek = open ? null : h('input', { id: 'ek_' + x.id, class: 'input', type: 'text', inputmode: 'numeric', value: String(x.end_km) });
    var nt = h('input', { id: 'nt_' + x.id, class: 'input', type: 'text', maxlength: '200', value: x.notes || '' });
    var del = h('div');
    function showDel() { del.replaceChildren(h('button', { class: 'link', type: 'button', onclick: confirmDel }, 'Excluir esta rota')); }
    function confirmDel() {
      del.replaceChildren(h('div', { class: 'confirm' },
        h('div', null, 'Excluir esta rota e as fotos dela? Isso não pode ser desfeito.'),
        h('div', { class: 'acts' },
          h('button', {
            class: 'btn danger', type: 'button', onclick: async function () {
              var r = await sb.from('routes').delete().eq('id', x.id);
              if (r.error) { RC.toast(RC.errText(r.error)); return; }
              var paths = [x.start_photo, x.end_photo].filter(Boolean);
              if (paths.length) sb.storage.from(RC.cfg.BUCKET).remove(paths).catch(function () {});
              RC.toast('Rota excluída'); renderHistory(true);
            }
          }, 'Sim, excluir'),
          h('button', { class: 'btn ghost', type: 'button', onclick: showDel }, 'Voltar')
        )));
    }
    showDel();
    var details = h('details', { class: 'item' },
      h('summary', null, 'Corrigir km ou observação'),
      h('div', { class: 'body' },
        RC.lbl('sk_' + x.id, 'Km inicial', sk),
        ek ? RC.lbl('ek_' + x.id, 'Km final', ek) : null,
        RC.lbl('nt_' + x.id, 'Observações', nt),
        m,
        h('div', { class: 'acts' }, h('button', {
          class: 'btn small', type: 'button', onclick: async function () {
            var s = RC.parseKm(sk.value), e = ek ? RC.parseKm(ek.value) : null;
            if (s == null || (ek && e == null)) { RC.setMsg(m, 'Digite os km só com números.', 'err'); return; }
            if (ek && e < s) { RC.setMsg(m, 'O km final não pode ser menor que o inicial.', 'err'); return; }
            var upd = { start_km: s, notes: nt.value.trim() || null };
            if (ek) upd.end_km = e;
            var r = await sb.from('routes').update(upd).eq('id', x.id);
            if (r.error) { RC.setMsg(m, RC.errText(r.error), 'err'); return; }
            RC.toast('Rota corrigida'); renderHistory(true);
          }
        }, 'Salvar correção')),
        del
      )
    );
    return h('div', { class: 'rrow' },
      h('div', { class: 'row' }, h('div', { class: 'row start' }, RC.plate(x.plate), h('strong', null, x.vehicle_name)), h('span', { class: 'pill ' + (open ? 'run' : 'free') }, open ? 'Em rota' : 'Finalizada')),
      h('div', { class: 'hint' }, RC.fmtDay(x.start_at) + ' · ' + x.driver_name + ' · saída ' + RC.fmtTime(x.start_at) + (open ? '' : ' · chegada ' + RC.fmtTime(x.end_at))),
      h('div', { class: 'kms' }, h('span', null, RC.fmtKm(x.start_km)), open ? null : [h('span', null, '→'), h('span', null, RC.fmtKm(x.end_km)), h('span', { class: 'big' }, '= ' + RC.fmtKm(x.km_driven) + ' km')]),
      x.notes ? h('div', { class: 'hint' }, 'Obs.: ' + x.notes) : null,
      h('div', { class: 'photos' },
        x.start_photo ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(x.start_photo, 'Saída · ' + x.plate + ' · km ' + RC.fmtKm(x.start_km)); } }, 'Foto da saída') : null,
        x.end_photo ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(x.end_photo, 'Chegada · ' + x.plate + ' · km ' + RC.fmtKm(x.end_km)); } }, 'Foto da chegada') : null
      ),
      details
    );
  }

  /* ---------- resumo do mês ---------- */
  async function renderSummary() {
    if (view.tab !== 'r') return;
    try {
      loading();
      var rows = await loadRoutes(flt.month);
      if (view.tab !== 'r') return;
      var done = rows.filter(function (x) { return x.status === 'closed'; });
      var byV = {}, byD = {};
      done.forEach(function (x) {
        var a = byV[x.vehicle_id] || (byV[x.vehicle_id] = { plate: x.plate, name: x.vehicle_name, n: 0, km: 0 }); a.n++; a.km += x.km_driven;
        var b = byD[x.driver_id] || (byD[x.driver_id] = { name: x.driver_name, n: 0, km: 0 }); b.n++; b.km += x.km_driven;
      });
      function toList(o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.km - a.km; }); }
      var vRows = toList(byV), dRows = toList(byD), total = sum(done);
      var tools = h('div', { class: 'tools' }, monthSelect(renderSummary));
      if (done.length) {
        tools.append(h('button', {
          class: 'btn ghost', type: 'button', onclick: function () {
            var out = [['Mês', 'Placa', 'Veículo', 'Rotas', 'Km rodados']];
            vRows.forEach(function (x) { out.push([RC.monthLabel(flt.month), x.plate, x.name, x.n, x.km]); });
            out.push([RC.monthLabel(flt.month), 'TOTAL', '', done.length, total]);
            RC.saveCsv('resumo-' + flt.month, out);
          }
        }, 'Baixar resumo (CSV)'));
      }
      var wrap = h('div', { class: 'list' });
      wrap.append(h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Km rodados'), h('b', null, RC.fmtKm(total))),
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Rotas'), h('b', null, String(done.length))),
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Média por rota'), h('b', null, done.length ? RC.fmtKm(Math.round(total / done.length)) : '0'))
      ));
      if (!done.length) wrap.append(h('div', { class: 'empty' }, 'Nenhuma rota finalizada neste mês.'));
      function section(title, list, withPlate) {
        var max = list.reduce(function (a, x) { return Math.max(a, x.km); }, 1);
        wrap.append(h('h2', null, title));
        list.forEach(function (x) {
          var bar = h('div', { class: 'bar' }, h('i'));
          bar.firstChild.style.width = Math.max(2, Math.round(x.km / max * 100)) + '%';
          wrap.append(h('div', { class: 'srow' },
            h('div', { class: 'nm' }, withPlate ? RC.plate(x.plate) : null, h('strong', null, x.name)),
            h('div', { class: 'val' }, RC.fmtKm(x.km) + ' km · ' + x.n + (x.n === 1 ? ' rota' : ' rotas')),
            bar));
        });
      }
      if (done.length) { section('Por veículo', vRows, true); section('Por motorista', dRows, false); }
      $('view').replaceChildren(tools, wrap);
      $('view').style.display = 'flex'; $('view').style.flexDirection = 'column'; $('view').style.gap = '16px';
    } catch (e) { fail(e); }
  }

  /* ---------- motoristas ---------- */
  async function renderPeople() {
    if (view.tab !== 'm') return;
    try {
      loading(); await loadPeople();
      if (view.tab !== 'm') return;
      var wrap = h('div', { class: 'list' });
      wrap.append(h('h2', null, 'Novo motorista'));
      var fm = RC.msgBox();
      var fn = h('input', { id: 'newFull', class: 'input', type: 'text', maxlength: '60', placeholder: 'Ex.: João Pedro da Silva', autocomplete: 'off' });
      var fu = h('input', { id: 'newUser', class: 'input', type: 'text', maxlength: '30', placeholder: 'joao.pedro', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      var fp = h('input', { id: 'newPass', class: 'input', type: 'text', maxlength: '72', placeholder: 'Mínimo 6 caracteres', autocomplete: 'off' });
      var fb = h('button', { class: 'btn', type: 'submit' }, 'Cadastrar motorista');
      wrap.append(h('form', {
        class: 'card', onsubmit: async function (ev) {
          ev.preventDefault();
          fb.disabled = true; RC.setMsg(fm, 'Cadastrando…', 'warn');
          try {
            await manage({ action: 'create_driver', full_name: fn.value, username: fu.value, password: fp.value });
            RC.toast('Motorista cadastrado'); renderPeople();
          } catch (e) { fb.disabled = false; RC.setMsg(fm, RC.errText(e), 'err'); }
        }
      },
        h('div', { class: 'hint' }, 'O motorista entra com o usuário e a senha abaixo. Anote a senha para entregar a ele: ela não pode ser consultada depois, só redefinida.'),
        RC.lbl('newFull', 'Nome completo', fn),
        h('div', { class: 'two' }, RC.lbl('newUser', 'Usuário', fu), RC.lbl('newPass', 'Senha', fp)),
        fm, fb));
      wrap.append(h('h2', null, 'Acessos'));
      people.forEach(function (p) {
        var m = RC.msgBox();
        var np = h('input', { id: 'pw_' + p.id, class: 'input', type: 'text', maxlength: '72', placeholder: 'Nova senha (mínimo 6 caracteres)', autocomplete: 'off' });
        var me = p.id === profile.id;
        wrap.append(h('details', { class: 'item' },
          h('summary', null, h('span', null, p.full_name), h('span', { class: 'hint' }, '@' + p.username),
            p.role === 'coord' ? h('span', { class: 'pill free' }, 'Coordenação') : null,
            h('span', { class: 'pill ' + (p.active ? 'free' : 'off') }, p.active ? 'Ativo' : 'Inativo')),
          h('div', { class: 'body' },
            RC.lbl('pw_' + p.id, 'Redefinir senha', np), m,
            h('div', { class: 'acts' },
              h('button', {
                class: 'btn small', type: 'button', onclick: async function () {
                  try { await manage({ action: 'reset_password', user_id: p.id, password: np.value }); np.value = ''; RC.setMsg(m, 'Senha redefinida.', 'ok'); }
                  catch (e) { RC.setMsg(m, RC.errText(e), 'err'); }
                }
              }, 'Salvar nova senha'),
              me ? null : h('button', {
                class: 'btn ghost', type: 'button', onclick: async function () {
                  try { await manage({ action: 'set_active', user_id: p.id, active: !p.active }); RC.toast(p.active ? 'Acesso desativado' : 'Acesso reativado'); renderPeople(); }
                  catch (e) { RC.setMsg(m, RC.errText(e), 'err'); }
                }
              }, p.active ? 'Desativar acesso' : 'Reativar acesso')
            ))));
      });
      $('view').replaceChildren(wrap);
    } catch (e) { fail(e); }
  }

  /* ---------- veículos ---------- */
  async function renderVehicles() {
    if (view.tab !== 'v') return;
    try {
      loading(); await loadVehicles();
      if (view.tab !== 'v') return;
      var wrap = h('div', { class: 'list' });
      wrap.append(h('h2', null, 'Novo veículo'));
      var vm = RC.msgBox();
      var vp = h('input', { id: 'newPlate', class: 'input', type: 'text', maxlength: '7', placeholder: 'ABC1D23', autocapitalize: 'characters', autocomplete: 'off' });
      var vn = h('input', { id: 'newName', class: 'input', type: 'text', maxlength: '30', placeholder: 'Ex.: Van 1', autocomplete: 'off' });
      wrap.append(h('form', {
        class: 'card', onsubmit: async function (ev) {
          ev.preventDefault();
          var pl = RC.normPlate(vp.value), nm = vn.value.trim();
          if (pl.length < 3) { RC.setMsg(vm, 'Informe a placa (pelo menos 3 caracteres).', 'err'); return; }
          if (!nm) { RC.setMsg(vm, 'Informe o nome do veículo.', 'err'); return; }
          var r = await sb.from('vehicles').insert({ plate: pl, name: nm });
          if (r.error) { RC.setMsg(vm, /duplicate|unique/i.test(r.error.message) ? 'Essa placa já está cadastrada.' : RC.errText(r.error), 'err'); return; }
          RC.toast('Veículo cadastrado'); renderVehicles();
        }
      }, RC.lbl('newPlate', 'Placa', vp), RC.lbl('newName', 'Nome do veículo', vn), vm, h('button', { class: 'btn', type: 'submit' }, 'Cadastrar veículo')));
      wrap.append(h('h2', null, 'Veículos cadastrados'));
      vehicles.forEach(function (v) {
        var m = RC.msgBox();
        var ep = h('input', { id: 'ep_' + v.id, class: 'input', type: 'text', maxlength: '7', value: v.plate, autocapitalize: 'characters', autocomplete: 'off' });
        var en = h('input', { id: 'en_' + v.id, class: 'input', type: 'text', maxlength: '30', value: v.name, autocomplete: 'off' });
        wrap.append(h('details', { class: 'item' },
          h('summary', null, RC.plate(v.plate), h('span', null, v.name), h('span', { class: 'pill ' + (v.active ? 'free' : 'off') }, v.active ? 'Ativo' : 'Inativo')),
          h('div', { class: 'body' },
            RC.lbl('ep_' + v.id, 'Placa', ep), RC.lbl('en_' + v.id, 'Nome', en), m,
            h('div', { class: 'acts' },
              h('button', {
                class: 'btn small', type: 'button', onclick: async function () {
                  var pl = RC.normPlate(ep.value), nm = en.value.trim();
                  if (pl.length < 3 || !nm) { RC.setMsg(m, 'Informe a placa e o nome.', 'err'); return; }
                  var r = await sb.from('vehicles').update({ plate: pl, name: nm }).eq('id', v.id);
                  if (r.error) { RC.setMsg(m, /duplicate|unique/i.test(r.error.message) ? 'Essa placa já está cadastrada.' : RC.errText(r.error), 'err'); return; }
                  RC.toast('Veículo atualizado'); renderVehicles();
                }
              }, 'Salvar'),
              h('button', {
                class: 'btn ghost', type: 'button', onclick: async function () {
                  var r = await sb.from('vehicles').update({ active: !v.active }).eq('id', v.id);
                  if (r.error) { RC.setMsg(m, RC.errText(r.error), 'err'); return; }
                  RC.toast(v.active ? 'Veículo desativado' : 'Veículo reativado'); renderVehicles();
                }
              }, v.active ? 'Desativar' : 'Reativar')
            ))));
      });
      $('view').replaceChildren(wrap);
    } catch (e) { fail(e); }
  }

  /* ---------- começo ---------- */
  TABS.forEach(function (k) { $('tab' + k).addEventListener('click', function () { if (profile) setTab(k.toLowerCase()); }); });
  async function init() {
    if (!RC.configured) { RC.showConfigError($('view')); return; }
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && profile) { profile = null; showLogin(); } });
    var p = await RC.loadProfile();
    if (p && p.active && p.role === 'coord') { profile = p; start(); return; }
    if (p) await RC.signOut();
    showLogin();
  }
  init();
})();
