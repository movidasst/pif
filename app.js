import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CONFIG = {
  supabaseUrl: 'https://lfdmbkzghnwvsapxypvt.supabase.co',
  supabasePublishableKey: 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1',
  evidenceWebAppUrl: 'https://script.google.com/macros/s/AKfycbxVEm4ArOJGR1aOizW71f1CDWro2cIlJ7J4Ossn0NrBbjeXJLpi9tBdMJ8KnFDrQzEr/exec',
  maxEvidenceBytes: 5 * 1024 * 1024
};

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey);

const state = {
  categories: [],
  factors: [],
  subfactors: [],
  taxonomyCategory: 'all',
  taxonomyQuery: '',
  session: null,
  member: null,
  cases: [],
  currentCase: null,
  detail: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}
function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function fmtDate(value) {
  if (!value) return 'Sin fecha';
  try { return new Date(value + (String(value).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es'); }
  catch { return value; }
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 3200);
}
function openModal(title, html, eyebrow = 'PIF-SST') {
  $('#modal-title').textContent = title;
  $('#modal-eyebrow').textContent = eyebrow;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modal-body').innerHTML = '';
}
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function showView(name) {
  $$('.app-view').forEach(view => view.classList.toggle('active', view.id === 'view-' + name));
  $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
  history.replaceState(null, '', '#' + name);
  if (name === 'casos') {
    if (state.session) loadCases();
    renderCasesGate();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-view]').forEach(el => el.addEventListener('click', e => {
  if (el.tagName === 'A') e.preventDefault();
  showView(el.dataset.view);
}));

async function loadTaxonomy() {
  const [categoriesRes, factorsRes, subfactorsRes] = await Promise.all([
    supabase.from('pif_categorias').select('codigo,nombre_es,nombre_en,descripcion_es,orden').eq('activo', true).order('orden'),
    supabase.from('pif_taxonomia').select('codigo,categoria_codigo,nombre_es,nombre_en,definicion_es,orientacion_es,orden,pagina_fuente').eq('activo', true).order('categoria_codigo').order('orden'),
    supabase.from('pif_subfactores').select('codigo,pif_codigo,nombre_es,nombre_en,descripcion_es,orden').eq('activo', true).order('pif_codigo').order('orden')
  ]);
  const error = categoriesRes.error || factorsRes.error || subfactorsRes.error;
  if (error) throw error;
  state.categories = categoriesRes.data || [];
  state.factors = factorsRes.data || [];
  state.subfactors = subfactorsRes.data || [];
  $('#home-categories').textContent = state.categories.length;
  $('#home-factors').textContent = state.factors.length;
  $('#home-subfactors').textContent = state.subfactors.length;
  $('#taxonomy-status').textContent = 'Datos cargados desde PIF-SST';
  renderCategoryFilters();
  renderTaxonomy();
}

function renderCategoryFilters() {
  const chips = [{ codigo: 'all', nombre_es: 'Todos' }, ...state.categories];
  $('#category-filters').innerHTML = chips.map(cat => {
    const count = cat.codigo === 'all' ? state.factors.length : state.factors.filter(f => f.categoria_codigo === cat.codigo).length;
    return `<button type="button" class="filter-chip ${state.taxonomyCategory === cat.codigo ? 'active' : ''}" data-cat="${esc(cat.codigo)}">${esc(cat.nombre_es)} · ${count}</button>`;
  }).join('');
  $$('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
    state.taxonomyCategory = btn.dataset.cat;
    renderCategoryFilters();
    renderTaxonomy();
  }));
}

function factorMatches(factor) {
  if (state.taxonomyCategory !== 'all' && factor.categoria_codigo !== state.taxonomyCategory) return false;
  const q = normalize(state.taxonomyQuery.trim());
  if (!q) return true;
  const subs = state.subfactors.filter(s => s.pif_codigo === factor.codigo);
  return normalize([
    factor.codigo, factor.nombre_es, factor.nombre_en, factor.definicion_es, factor.orientacion_es,
    ...subs.flatMap(s => [s.codigo, s.nombre_es, s.nombre_en, s.descripcion_es])
  ].filter(Boolean).join(' ')).includes(q);
}

function renderTaxonomy() {
  const visible = state.factors.filter(factorMatches);
  $('#taxonomy-empty').hidden = visible.length > 0;
  $('#taxonomy-grid').innerHTML = visible.map(factor => {
    const category = state.categories.find(c => c.codigo === factor.categoria_codigo);
    const subs = state.subfactors.filter(s => s.pif_codigo === factor.codigo);
    return `
      <details class="factor-card">
        <summary>
          <div class="factor-heading">
            <div class="factor-code">${esc(factor.codigo)}</div>
            <div>
              <div class="factor-name">${esc(factor.nombre_es)}</div>
              <div class="factor-en">${esc(factor.nombre_en)}</div>
            </div>
          </div>
          <p class="factor-definition">${esc(factor.definicion_es)}</p>
          <div class="category-label">${esc(category?.nombre_es || '')}</div>
        </summary>
        <div class="factor-detail">
          ${factor.orientacion_es ? `<p class="orientation"><strong>Orientación para el análisis:</strong> ${esc(factor.orientacion_es)}</p>` : ''}
          ${subs.length ? `
            <h4>Subfactores y ejemplos</h4>
            <ul>${subs.map(s => `<li><strong>${esc(s.codigo)} · ${esc(s.nombre_es)}</strong>${s.descripcion_es ? `: ${esc(s.descripcion_es)}` : ''}</li>`).join('')}</ul>
          ` : '<p>No tiene subfactores específicos registrados.</p>'}
        </div>
      </details>`;
  }).join('');
}
$('#taxonomy-search').addEventListener('input', e => {
  state.taxonomyQuery = e.target.value;
  renderTaxonomy();
});

function renderAccount() {
  const button = $('#account-button');
  if (state.session) {
    const meta = state.session.user?.user_metadata || {};
    const label = [meta.nombres, meta.apellidos].filter(Boolean).join(' ') || 'Mi cuenta';
    button.textContent = label.length > 20 ? label.slice(0, 18) + '…' : label;
  } else {
    button.textContent = 'Ingresar';
  }
  renderCasesGate();
}

function renderCasesGate() {
  const logged = Boolean(state.session);
  $('#cases-gate').hidden = logged;
  $('#cases-area').hidden = !logged;
}

function showLogin() {
  openModal('Ingresar a PIF-SST', `
    <p class="help">Usa el documento y el código de tu credencial de integrante de La Movida de SST+.</p>
    <div class="form-grid">
      <label class="field">
        <span>País (ISO2)</span>
        <input id="login-country" value="VE" maxlength="2" autocomplete="country">
      </label>
      <label class="field">
        <span>Documento o cédula</span>
        <input id="login-document" inputmode="numeric" autocomplete="username">
      </label>
      <label class="field wide">
        <span>Código de integrante</span>
        <input id="login-code" maxlength="8" autocomplete="current-password">
      </label>
    </div>
    <div class="actions">
      <button class="btn primary" id="login-submit" type="button">Ingresar</button>
      <a class="btn secondary" href="https://registro.movidasst.com" target="_blank" rel="noopener">Registrarme</a>
    </div>
  `, 'Acceso de integrante');
  $('#login-submit').addEventListener('click', login);
  $('#login-code').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
}

async function login() {
  const button = $('#login-submit');
  const pais_iso2 = ($('#login-country').value || 'VE').trim().toUpperCase();
  const documento = $('#login-document').value.trim();
  const codigo = $('#login-code').value.trim().toUpperCase();
  if (!documento || !codigo) return toast('Ingresa documento y código de integrante.');
  button.disabled = true;
  button.textContent = 'Verificando…';
  try {
    const { data, error } = await supabase.functions.invoke('crear-sesion-integrante', {
      body: { pais_iso2, documento, codigo }
    });
    if (error) throw error;
    if (!data?.ok || !data?.token_hash) throw new Error(data?.error || 'No fue posible crear la sesión.');
    const verified = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (verified.error) throw verified.error;
    state.session = verified.data.session;
    state.member = data.integrante || null;
    localStorage.setItem('pif_member', JSON.stringify(state.member));
    closeModal();
    renderAccount();
    await loadCases();
    toast('Acceso correcto.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No fue posible iniciar sesión.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Ingresar';
    }
  }
}

async function logout() {
  await supabase.auth.signOut();
  state.session = null;
  state.member = null;
  state.cases = [];
  state.currentCase = null;
  state.detail = null;
  localStorage.removeItem('pif_member');
  renderAccount();
  $('#cases-list').innerHTML = '';
  $('#case-workspace').innerHTML = '';
  closeModal();
  toast('Sesión cerrada.');
}

$('#account-button').addEventListener('click', () => {
  if (!state.session) return showLogin();
  const meta = state.session.user?.user_metadata || {};
  openModal('Mi cuenta', `
    <p><strong>${esc([meta.nombres, meta.apellidos].filter(Boolean).join(' ') || 'Integrante')}</strong></p>
    <p class="help">Tus casos PIF-SST están protegidos por tu sesión autenticada.</p>
    <button class="btn danger" type="button" id="logout-button">Cerrar sesión</button>
  `, 'PIF-SST');
  $('#logout-button').addEventListener('click', logout);
});
$('#gate-login').addEventListener('click', showLogin);

async function loadCases() {
  if (!state.session) return;
  const { data, error } = await supabase
    .from('pif_casos')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error(error);
    toast('No fue posible cargar tus casos.');
    return;
  }
  state.cases = data || [];
  renderCases();
}

function renderCases() {
  const counts = {
    total: state.cases.length,
    borrador: state.cases.filter(c => c.estado === 'borrador').length,
    analisis: state.cases.filter(c => c.estado === 'en_analisis' || c.estado === 'revision').length,
    cerrados: state.cases.filter(c => c.estado === 'cerrado').length
  };
  $('#cases-summary').innerHTML = `
    <div class="summary-item"><strong>${counts.total}</strong><span>casos</span></div>
    <div class="summary-item"><strong>${counts.borrador}</strong><span>borradores</span></div>
    <div class="summary-item"><strong>${counts.analisis}</strong><span>en análisis</span></div>
    <div class="summary-item"><strong>${counts.cerrados}</strong><span>cerrados</span></div>
  `;

  if (!state.cases.length) {
    $('#cases-list').innerHTML = '<div class="empty-state">Aún no tienes casos. Crea el primero cuando tengas una investigación o un caso de aprendizaje que quieras codificar.</div>';
    $('#case-workspace').innerHTML = '';
    return;
  }

  $('#cases-list').innerHTML = state.cases.map(c => `
    <article class="case-card">
      <div class="row">
        <div>
          <h3>${esc(c.codigo_pif)} · ${esc(c.titulo)}</h3>
          <p>${esc([c.empresa, c.area, c.actividad].filter(Boolean).join(' · ') || 'Sin contexto adicional')}</p>
          <div class="pills">
            <span class="pill teal">${esc(c.tipo)}</span>
            <span class="pill">${esc(c.estado.replace('_',' '))}</span>
            <span class="pill">${esc(fmtDate(c.fecha_evento))}</span>
          </div>
        </div>
        <button class="btn secondary" type="button" data-open-case="${c.id}">Abrir</button>
      </div>
    </article>
  `).join('');

  $$('[data-open-case]').forEach(btn => btn.addEventListener('click', () => openCase(btn.dataset.openCase)));
}

function showNewCase() {
  if (!state.session) return showLogin();
  openModal('Nuevo análisis', `
    <div class="form-grid">
      <label class="field">
        <span>Tipo de caso</span>
        <select id="case-type">
          <option value="real">Caso real</option>
          <option value="aprendizaje">Caso de aprendizaje</option>
          <option value="anonimizado">Caso anonimizado</option>
        </select>
      </label>
      <label class="field">
        <span>Fecha del evento</span>
        <input id="case-date" type="date">
      </label>
      <label class="field wide">
        <span>Nombre del caso</span>
        <input id="case-title" placeholder="Ej.: Caída de herramienta durante mantenimiento">
      </label>
      <label class="field">
        <span>Empresa</span>
        <input id="case-company">
      </label>
      <label class="field">
        <span>Centro de trabajo</span>
        <input id="case-site">
      </label>
      <label class="field">
        <span>Área</span>
        <input id="case-area">
      </label>
      <label class="field">
        <span>Actividad</span>
        <input id="case-activity">
      </label>
      <label class="field">
        <span>Tipo de evento</span>
        <input id="case-event-type">
      </label>
      <label class="field">
        <span>Gravedad</span>
        <input id="case-severity">
      </label>
      <label class="field wide">
        <span>Descripción breve</span>
        <textarea id="case-description" placeholder="Describe qué ocurrió sin asignar todavía causas o juicios sobre la conducta."></textarea>
      </label>
    </div>
    <div class="actions"><button class="btn primary" id="case-save" type="button">Crear caso</button></div>
  `, 'Análisis de caso');
  $('#case-save').addEventListener('click', createCase);
}
$('#new-case-button').addEventListener('click', showNewCase);

async function createCase() {
  const button = $('#case-save');
  const titulo = $('#case-title').value.trim();
  if (!titulo) return toast('Indica un nombre para el caso.');
  button.disabled = true;
  try {
    const payload = {
      tipo: $('#case-type').value,
      titulo,
      fecha_evento: $('#case-date').value || null,
      empresa: $('#case-company').value.trim() || null,
      centro_trabajo: $('#case-site').value.trim() || null,
      area: $('#case-area').value.trim() || null,
      actividad: $('#case-activity').value.trim() || null,
      tipo_evento: $('#case-event-type').value.trim() || null,
      gravedad: $('#case-severity').value.trim() || null,
      descripcion: $('#case-description').value.trim() || null
    };
    const { data, error } = await supabase.from('pif_casos').insert(payload).select('*').single();
    if (error) throw error;
    closeModal();
    await loadCases();
    await openCase(data.id);
    toast('Caso creado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No fue posible crear el caso.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function openCase(caseId) {
  const current = state.cases.find(c => c.id === caseId);
  if (!current) return;
  state.currentCase = current;
  const hallazgosRes = await supabase.from('pif_hallazgos').select('*').eq('caso_id', caseId).order('orden');
  if (hallazgosRes.error) return toast('No fue posible cargar los hallazgos.');
  const hallazgos = hallazgosRes.data || [];
  const ids = hallazgos.map(h => h.id);

  let barreras = [], evidencias = [], factores = [], factorEvidencias = [];
  if (ids.length) {
    const [bRes, eRes, fRes] = await Promise.all([
      supabase.from('pif_barreras').select('*').in('hallazgo_id', ids),
      supabase.from('pif_evidencias').select('*').in('hallazgo_id', ids).order('created_at'),
      supabase.from('pif_hallazgo_factores').select('*').in('hallazgo_id', ids).order('created_at')
    ]);
    if (bRes.error || eRes.error || fRes.error) return toast('No fue posible completar el detalle del caso.');
    barreras = bRes.data || [];
    evidencias = eRes.data || [];
    factores = fRes.data || [];
    const factorIds = factores.map(f => f.id);
    if (factorIds.length) {
      const rel = await supabase.from('pif_factor_evidencias').select('*').in('factor_id', factorIds);
      if (!rel.error) factorEvidencias = rel.data || [];
    }
  }
  state.detail = { hallazgos, barreras, evidencias, factores, factorEvidencias };
  renderCaseWorkspace();
  $('#case-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCaseWorkspace() {
  const c = state.currentCase;
  const d = state.detail;
  if (!c || !d) return;
  $('#case-workspace').innerHTML = `
    <section class="workspace-card">
      <div class="workspace-head">
        <div>
          <span class="eyebrow">${esc(c.codigo_pif)}</span>
          <h2>${esc(c.titulo)}</h2>
          <p>${esc(c.descripcion || 'Sin descripción.')}</p>
          <div class="workspace-meta">
            <span class="pill teal">${esc(c.tipo)}</span>
            <span class="pill">${esc(c.estado.replace('_',' '))}</span>
            ${c.empresa ? `<span class="pill">${esc(c.empresa)}</span>` : ''}
            ${c.area ? `<span class="pill">${esc(c.area)}</span>` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="btn teal" type="button" id="add-finding">+ Agregar hallazgo</button>
          ${c.estado !== 'cerrado' ? '<button class="btn secondary" type="button" id="close-case">Cerrar análisis</button>' : ''}
        </div>
      </div>

      <div class="hallazgo-list">
        ${d.hallazgos.length ? d.hallazgos.map(renderFinding).join('') : '<div class="empty-state small">Aún no hay hallazgos. Registra primero una acción, decisión o condición observable identificada durante la investigación.</div>'}
      </div>
    </section>
  `;

  $('#add-finding')?.addEventListener('click', showAddFinding);
  $('#close-case')?.addEventListener('click', closeCase);
  $$('[data-add-barrier]').forEach(btn => btn.addEventListener('click', () => showAddBarrier(btn.dataset.addBarrier)));
  $$('[data-add-evidence]').forEach(btn => btn.addEventListener('click', () => showAddEvidence(btn.dataset.addEvidence)));
  $$('[data-add-factor]').forEach(btn => btn.addEventListener('click', () => showAddFactor(btn.dataset.addFactor)));
}

function renderFinding(h, index) {
  const d = state.detail;
  const barriers = d.barreras.filter(b => b.hallazgo_id === h.id);
  const evidences = d.evidencias.filter(e => e.hallazgo_id === h.id);
  const factors = d.factores.filter(f => f.hallazgo_id === h.id);

  return `
    <article class="hallazgo">
      <div class="hallazgo-top">
        <div>
          <span class="eyebrow">Hallazgo ${index + 1} · ${esc(h.tipo)}</span>
          <h3>${esc(h.descripcion_observable)}</h3>
          ${h.notas ? `<p>${esc(h.notas)}</p>` : ''}
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">
          <strong>Barrera o control relacionado</strong>
          <button class="btn secondary" type="button" data-add-barrier="${h.id}">+ Barrera</button>
        </div>
        <div class="mini-list">
          ${barriers.length ? barriers.map(b => `<div class="mini-item"><strong>${esc(b.tipo || 'Barrera')}</strong> · ${esc(b.estado || b.relacion)}${b.descripcion ? `<br>${esc(b.descripcion)}` : ''}</div>`).join('') : '<div class="empty-state small">Sin barrera registrada.</div>'}
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">
          <strong>Evidencias</strong>
          <button class="btn secondary" type="button" data-add-evidence="${h.id}">+ Evidencia</button>
        </div>
        <div class="mini-list">
          ${evidences.length ? evidences.map(e => `
            <div class="mini-item">
              <strong>${esc(e.titulo || e.tipo)}</strong> · ${esc(e.estado_archivo)}
              <br>${esc(e.aporte)}
              ${e.drive_url ? `<br><a href="${esc(e.drive_url)}" target="_blank" rel="noopener">Abrir archivo en Drive</a>` : ''}
            </div>`).join('') : '<div class="empty-state small">Sin evidencias registradas.</div>'}
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">
          <strong>PIF asociados</strong>
          <button class="btn primary" type="button" data-add-factor="${h.id}">+ Asociar PIF</button>
        </div>
        <div class="mini-list">
          ${factors.length ? factors.map(f => {
            const def = state.factors.find(x => x.codigo === f.pif_codigo);
            const sub = state.subfactors.find(x => x.codigo === f.subfactor_codigo);
            const linkedCount = d.factorEvidencias.filter(x => x.factor_id === f.id).length;
            return `<div class="mini-item"><strong>${esc(f.pif_codigo)} · ${esc(def?.nombre_es || '')}</strong>${sub ? `<br>${esc(sub.codigo)} · ${esc(sub.nombre_es)}` : ''}<br><span class="pill ${f.respaldo === 'confirmado' ? 'green' : f.respaldo === 'parcial' ? 'yellow' : ''}">${esc(f.respaldo)}</span> · ${linkedCount} evidencia(s)${f.justificacion ? `<br>${esc(f.justificacion)}` : ''}</div>`;
          }).join('') : '<div class="empty-state small">Aún no se han asociado factores.</div>'}
        </div>
      </div>
    </article>
  `;
}

function showAddFinding() {
  openModal('Agregar hallazgo', `
    <div class="warning">Describe primero lo observado. Evita expresiones como “fue negligente”, “actuó inseguro” o “faltó cultura preventiva”.</div>
    <div class="form-grid" style="margin-top:12px">
      <label class="field">
        <span>Tipo</span>
        <select id="finding-type"><option value="accion">Acción</option><option value="decision">Decisión</option><option value="condicion">Condición</option></select>
      </label>
      <label class="field wide">
        <span>Descripción observable</span>
        <textarea id="finding-description" placeholder="Ej.: El operador abrió la válvula B en lugar de la válvula A."></textarea>
      </label>
      <label class="field wide">
        <span>Notas</span>
        <textarea id="finding-notes" placeholder="Información complementaria, sin asignar todavía causas."></textarea>
      </label>
    </div>
    <div class="actions"><button class="btn primary" id="finding-save" type="button">Guardar hallazgo</button></div>
  `, 'Hallazgo');
  $('#finding-save').addEventListener('click', saveFinding);
}

async function saveFinding() {
  const descripcion = $('#finding-description').value.trim();
  if (!descripcion) return toast('Describe el hallazgo.');
  const { error } = await supabase.from('pif_hallazgos').insert({
    caso_id: state.currentCase.id,
    tipo: $('#finding-type').value,
    descripcion_observable: descripcion,
    notas: $('#finding-notes').value.trim() || null,
    orden: state.detail.hallazgos.length + 1
  });
  if (error) return toast(error.message || 'No fue posible guardar el hallazgo.');
  if (state.currentCase.estado === 'borrador') {
    await supabase.from('pif_casos').update({ estado: 'en_analisis' }).eq('id', state.currentCase.id);
    state.currentCase.estado = 'en_analisis';
  }
  closeModal();
  await openCase(state.currentCase.id);
  await loadCases();
  toast('Hallazgo guardado.');
}

function showAddBarrier(hallazgoId) {
  openModal('Registrar barrera o control', `
    <div class="form-grid">
      <label class="field">
        <span>Relación con el hallazgo</span>
        <select id="barrier-relation"><option value="si">Sí existe una barrera relacionada</option><option value="no">No</option><option value="no_determinado">No se ha determinado</option></select>
      </label>
      <label class="field">
        <span>Tipo</span>
        <select id="barrier-type">
          <option>Protección física</option><option>Automatización</option><option>Bloqueo</option><option>Procedimiento</option><option>Permiso de trabajo</option><option>Supervisión</option><option>Verificación</option><option>EPP</option><option>Alarma</option><option>Otro</option>
        </select>
      </label>
      <label class="field">
        <span>Estado</span>
        <select id="barrier-status">
          <option value="funciono">Funcionó</option><option value="parcial">Funcionó parcialmente</option><option value="degradada">Degradada</option><option value="no_disponible">No disponible</option><option value="no_utilizada">No utilizada</option><option value="desconocido">Desconocido</option><option value="no_aplica">No aplica</option>
        </select>
      </label>
      <label class="field wide">
        <span>Descripción</span>
        <textarea id="barrier-description"></textarea>
      </label>
    </div>
    <div class="actions"><button class="btn primary" id="barrier-save" type="button">Guardar barrera</button></div>
  `, 'Barrera');
  $('#barrier-save').addEventListener('click', async () => {
    const { error } = await supabase.from('pif_barreras').insert({
      hallazgo_id: hallazgoId,
      relacion: $('#barrier-relation').value,
      tipo: $('#barrier-type').value || null,
      descripcion: $('#barrier-description').value.trim() || null,
      estado: $('#barrier-status').value || null
    });
    if (error) return toast(error.message || 'No fue posible guardar la barrera.');
    closeModal();
    await openCase(state.currentCase.id);
    toast('Barrera registrada.');
  });
}

function showAddEvidence(hallazgoId) {
  openModal('Agregar evidencia', `
    <div class="form-grid">
      <label class="field">
        <span>Tipo de evidencia</span>
        <select id="evidence-type">
          <option>Entrevista</option><option>Fotografía</option><option>Procedimiento</option><option>Permiso de trabajo</option><option>Evaluación de riesgos</option><option>Registro de mantenimiento</option><option>Medición ambiental</option><option>Registro de jornada</option><option>Capacitación</option><option>Observación</option><option>Documento</option><option>Otro</option>
        </select>
      </label>
      <label class="field">
        <span>Título</span>
        <input id="evidence-title" placeholder="Ej.: Entrevista al supervisor">
      </label>
      <label class="field wide">
        <span>¿Qué información aporta esta evidencia?</span>
        <textarea id="evidence-contribution" placeholder="Ej.: El supervisor indicó que el trabajo debía terminar antes del cambio de turno."></textarea>
      </label>
      <label class="field">
        <span>Fuente</span>
        <input id="evidence-source" placeholder="Persona, documento, sistema o registro">
      </label>
      <label class="field">
        <span>Archivo opcional</span>
        <input id="evidence-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx">
        <small class="help">Máximo 5 MB. El archivo se guarda en Google Drive; Supabase conserva el enlace y metadatos.</small>
      </label>
    </div>
    <div class="actions"><button class="btn primary" id="evidence-save" type="button">Guardar evidencia</button></div>
  `, 'Evidencia');
  $('#evidence-save').addEventListener('click', () => saveEvidence(hallazgoId));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

async function saveEvidence(hallazgoId) {
  const contribution = $('#evidence-contribution').value.trim();
  if (!contribution) return toast('Explica qué información aporta la evidencia.');
  const file = $('#evidence-file').files[0] || null;
  if (file) {
    if (file.size > CONFIG.maxEvidenceBytes) return toast('El archivo supera el máximo de 5 MB.');
    if (!ALLOWED_MIME_TYPES.includes(file.type)) return toast('Ese tipo de archivo no está permitido.');
  }

  const button = $('#evidence-save');
  button.disabled = true;
  button.textContent = file ? 'Cargando…' : 'Guardando…';

  let evidenceRow = null;
  try {
    const insertPayload = {
      caso_id: state.currentCase.id,
      hallazgo_id: hallazgoId,
      tipo: $('#evidence-type').value,
      titulo: $('#evidence-title').value.trim() || null,
      aporte: contribution,
      fuente_texto: $('#evidence-source').value.trim() || null,
      proveedor_archivo: file ? 'google_drive' : 'sin_archivo',
      estado_archivo: file ? 'pendiente' : 'sin_archivo',
      file_size_bytes: file?.size || null,
      mime_type: file?.type || null
    };
    const inserted = await supabase.from('pif_evidencias').insert(insertPayload).select('*').single();
    if (inserted.error) throw inserted.error;
    evidenceRow = inserted.data;

    if (file) {
      const dataUrl = await fileToDataUrl(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('La sesión expiró. Vuelve a ingresar.');

      const response = await fetch(CONFIG.evidenceWebAppUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          accion: 'subir_evidencia',
          accessToken,
          codigoCaso: state.currentCase.codigo_pif,
          fileName: file.name,
          mimeType: file.type,
          base64: dataUrl,
          descripcion: `Evidencia PIF-SST ${evidenceRow.id}. ${contribution}`
        })
      });

      const text = await response.text();
      let driveData;
      try { driveData = JSON.parse(text); }
      catch { throw new Error('Google Drive no devolvió una respuesta JSON válida.'); }

      if (!driveData?.ok || !driveData?.evidencia?.fileId) {
        throw new Error(driveData?.error || 'No fue posible cargar el archivo en Drive.');
      }

      const ev = driveData.evidencia;
      const updated = await supabase.from('pif_evidencias').update({
        drive_file_id: ev.fileId,
        drive_url: ev.url,
        drive_parent_folder_id: ev.parentFolderId,
        drive_file_name: ev.fileName,
        file_size_bytes: ev.sizeBytes,
        mime_type: ev.mimeType,
        estado_archivo: 'cargado'
      }).eq('id', evidenceRow.id);
      if (updated.error) throw updated.error;
    }

    closeModal();
    await openCase(state.currentCase.id);
    toast(file ? 'Evidencia guardada y archivo cargado en Drive.' : 'Evidencia guardada.');
  } catch (error) {
    console.error(error);
    if (evidenceRow?.id) {
      await supabase.from('pif_evidencias').update({ estado_archivo: 'error' }).eq('id', evidenceRow.id);
    }
    toast(error.message || 'No fue posible guardar la evidencia.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Guardar evidencia';
    }
  }
}

function showAddFactor(hallazgoId) {
  const evidences = state.detail.evidencias.filter(e => e.hallazgo_id === hallazgoId);
  openModal('Asociar un PIF', `
    <div class="warning">Selecciona un factor solo cuando el hallazgo lo respalde. Un PIF confirmado debe quedar vinculado al menos a una evidencia.</div>
    <div class="form-grid" style="margin-top:12px">
      <label class="field">
        <span>Categoría</span>
        <select id="factor-category">${state.categories.map(c => `<option value="${esc(c.codigo)}">${esc(c.codigo)} · ${esc(c.nombre_es)}</option>`).join('')}</select>
      </label>
      <label class="field">
        <span>PIF</span>
        <select id="factor-main"></select>
      </label>
      <label class="field wide">
        <span>Subfactor o ejemplo específico</span>
        <select id="factor-sub"></select>
      </label>
      <label class="field">
        <span>Nivel de respaldo</span>
        <select id="factor-support"><option value="hipotesis">Hipótesis</option><option value="parcial">Parcial</option><option value="confirmado">Confirmado</option></select>
      </label>
      <label class="field wide">
        <span>Justificación</span>
        <textarea id="factor-reason" placeholder="Explica por qué este factor influyó en la acción, decisión o condición analizada."></textarea>
      </label>
      <div class="field wide">
        <span>Evidencias que lo respaldan</span>
        <div id="factor-evidence-list" class="check-list">
          ${evidences.length ? evidences.map(e => `<label class="check-row"><input type="checkbox" value="${e.id}" data-factor-evidence><span><strong>${esc(e.titulo || e.tipo)}</strong><br>${esc(e.aporte)}</span></label>`).join('') : '<div class="help">Este hallazgo todavía no tiene evidencias registradas.</div>'}
        </div>
      </div>
    </div>
    <div class="actions"><button class="btn primary" id="factor-save" type="button">Asociar PIF</button></div>
  `, 'Clasificación PIF');

  const category = $('#factor-category');
  const main = $('#factor-main');
  const sub = $('#factor-sub');

  function fillMain() {
    const items = state.factors.filter(f => f.categoria_codigo === category.value);
    main.innerHTML = items.map(f => `<option value="${esc(f.codigo)}">${esc(f.codigo)} · ${esc(f.nombre_es)}</option>`).join('');
    fillSub();
  }
  function fillSub() {
    const items = state.subfactors.filter(s => s.pif_codigo === main.value);
    sub.innerHTML = '<option value="">Sin subfactor específico</option>' + items.map(s => `<option value="${esc(s.codigo)}">${esc(s.codigo)} · ${esc(s.nombre_es)}</option>`).join('');
  }
  category.addEventListener('change', fillMain);
  main.addEventListener('change', fillSub);
  fillMain();

  $('#factor-save').addEventListener('click', () => saveFactor(hallazgoId));
}

async function saveFactor(hallazgoId) {
  const support = $('#factor-support').value;
  const evidenceIds = $$('[data-factor-evidence]:checked').map(el => el.value);
  const reason = $('#factor-reason').value.trim();
  if (!reason) return toast('Escribe una justificación.');
  if (support === 'confirmado' && !evidenceIds.length) return toast('Un PIF confirmado debe quedar respaldado por al menos una evidencia.');

  const payload = {
    hallazgo_id: hallazgoId,
    pif_codigo: $('#factor-main').value,
    subfactor_codigo: $('#factor-sub').value || null,
    respaldo: support,
    justificacion: reason,
    confirmado_at: support === 'confirmado' ? new Date().toISOString() : null
  };

  const inserted = await supabase.from('pif_hallazgo_factores').insert(payload).select('*').single();
  if (inserted.error) {
    console.error(inserted.error);
    return toast(inserted.error.code === '23505' ? 'Ese PIF ya está asociado a este hallazgo.' : (inserted.error.message || 'No fue posible asociar el PIF.'));
  }

  if (evidenceIds.length) {
    const relations = evidenceIds.map(evidencia_id => ({ factor_id: inserted.data.id, evidencia_id }));
    const rel = await supabase.from('pif_factor_evidencias').insert(relations);
    if (rel.error) {
      console.error(rel.error);
      toast('El PIF fue guardado, pero hubo un problema al asociar una evidencia.');
    }
  }

  closeModal();
  await openCase(state.currentCase.id);
  toast('PIF asociado al hallazgo.');
}

async function closeCase() {
  if (!confirm('¿Cerrar este análisis? Podrás consultarlo, pero quedará marcado como cerrado.')) return;
  const { error } = await supabase.from('pif_casos').update({
    estado: 'cerrado',
    cerrado_at: new Date().toISOString()
  }).eq('id', state.currentCase.id);
  if (error) return toast(error.message || 'No fue posible cerrar el caso.');
  state.currentCase.estado = 'cerrado';
  await loadCases();
  await openCase(state.currentCase.id);
  toast('Análisis cerrado.');
}

async function initAuth() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session || null;
  try { state.member = JSON.parse(localStorage.getItem('pif_member') || 'null'); } catch {}
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    renderAccount();
  });
  renderAccount();
}

async function init() {
  const target = location.hash.replace('#','');
  if (['inicio','taxonomia','casos'].includes(target)) showView(target);
  try {
    await loadTaxonomy();
  } catch (error) {
    console.error(error);
    $('#taxonomy-status').textContent = 'No fue posible cargar la taxonomía';
    $('#taxonomy-grid').innerHTML = '<div class="empty-state">No se pudo consultar la taxonomía en este momento.</div>';
  }
  await initAuth();
  if (state.session && target === 'casos') await loadCases();
}
init();
