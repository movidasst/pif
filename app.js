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
  detail: null,
  analytics: null
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
  if (name === 'analitica') {
    renderAnalyticsGate();
    if (state.session) loadAnalytics();
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
  renderAnalyticsGate();
}

function renderCasesGate() {
  const logged = Boolean(state.session);
  $('#cases-gate').hidden = logged;
  $('#cases-area').hidden = !logged;
}

function renderAnalyticsGate() {
  const logged = Boolean(state.session);
  const gate = $('#analytics-gate');
  const area = $('#analytics-area');
  if (!gate || !area) return;
  gate.hidden = logged;
  area.hidden = !logged;
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
$('#analytics-login')?.addEventListener('click', showLogin);

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

$('#demo-case-button').addEventListener('click', createDemoCase);

async function createDemoCase() {
  if (!state.session) return showLogin();

  const existing = state.cases.find(c => c.codigo_interno === 'DEMO-EI3646-HERRAMIENTA');
  if (existing) {
    await openCase(existing.id);
    toast('El caso DEMO ya existe. Lo abrí para continuar la prueba.');
    return;
  }

  const button = $('#demo-case-button');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Creando DEMO…';

  let demoCaseId = null;

  try {
    const createdCase = await supabase.from('pif_casos').insert({
      tipo: 'aprendizaje',
      titulo: 'DEMO · Herramienta que cae desde altura',
      codigo_interno: 'DEMO-EI3646-HERRAMIENTA',
      empresa: 'Caso de aprendizaje EI 3646',
      centro_trabajo: 'Escenario de práctica',
      area: 'Mantenimiento',
      actividad: 'Trabajo en altura / mantenimiento',
      tipo_evento: 'Caída de objeto',
      consecuencia: 'Caso de aprendizaje, sin consecuencia real',
      gravedad: 'Simulación',
      descripcion: 'Caso de aprendizaje basado en el ejemplo utilizado por EI 3646 para mostrar la relación entre barrera, acción observada y factores que influyen en el desempeño. No corresponde a un accidente real.',
      estado: 'en_analisis'
    }).select('*').single();

    if (createdCase.error) throw createdCase.error;
    demoCaseId = createdCase.data.id;

    const finding = await supabase.from('pif_hallazgos').insert({
      caso_id: demoCaseId,
      tipo: 'accion',
      descripcion_observable: 'Durante el trabajo en altura, la herramienta fue guardada en el bolsillo trasero en lugar de mantenerse asegurada dentro de la bolsa de herramientas cerrada.',
      notas: 'En este ejercicio la acción se registra de forma observable, sin etiquetarla como acto inseguro, negligencia o causa raíz.',
      orden: 1
    }).select('*').single();
    if (finding.error) throw finding.error;

    const barrier = await supabase.from('pif_barreras').insert({
      hallazgo_id: finding.data.id,
      relacion: 'si',
      tipo: 'Protección física',
      descripcion: 'Mantener la herramienta asegurada dentro de una bolsa de herramientas cerrada durante el trabajo en altura.',
      estado: 'no_utilizada'
    });
    if (barrier.error) throw barrier.error;

    const evidence = await supabase.from('pif_evidencias').insert([
      {
        caso_id: demoCaseId,
        hallazgo_id: finding.data.id,
        tipo: 'Entrevista',
        titulo: 'Evidencia DEMO · Tiempo disponible',
        aporte: 'Para fines del ejercicio se considera confirmado que guardar la herramienta en el bolsillo era percibido como más rápido que abrir y cerrar repetidamente la bolsa de herramientas.',
        fuente_texto: 'Caso de aprendizaje basado en el ejemplo de EI 3646',
        proveedor_archivo: 'sin_archivo',
        estado_archivo: 'sin_archivo'
      },
      {
        caso_id: demoCaseId,
        hallazgo_id: finding.data.id,
        tipo: 'Documento',
        titulo: 'Evidencia DEMO · Mensajes del liderazgo',
        aporte: 'Para fines del ejercicio se considera documentado que existían mensajes de liderazgo que enfatizaban completar el proyecto dentro del tiempo previsto.',
        fuente_texto: 'Caso de aprendizaje basado en el ejemplo de EI 3646',
        proveedor_archivo: 'sin_archivo',
        estado_archivo: 'sin_archivo'
      }
    ]).select('*');
    if (evidence.error) throw evidence.error;

    const timeEvidence = evidence.data.find(e => e.titulo.includes('Tiempo disponible'));
    const leadershipEvidence = evidence.data.find(e => e.titulo.includes('Mensajes del liderazgo'));

    const timeFactor = await supabase.from('pif_hallazgo_factores').insert({
      hallazgo_id: finding.data.id,
      pif_codigo: 'T.2',
      subfactor_codigo: 'T.2.1',
      respaldo: 'confirmado',
      justificacion: 'La investigación del caso de aprendizaje vincula directamente la acción observada con la percepción de disponer de poco tiempo para completar la tarea.',
      confirmado_at: new Date().toISOString()
    }).select('*').single();
    if (timeFactor.error) throw timeFactor.error;

    const leadershipFactor = await supabase.from('pif_hallazgo_factores').insert({
      hallazgo_id: finding.data.id,
      pif_codigo: 'O.3',
      subfactor_codigo: 'O.3.2',
      respaldo: 'confirmado',
      justificacion: 'El caso de aprendizaje incluye mensajes del liderazgo relacionados con completar el proyecto dentro del plazo, vinculados explícitamente con el contexto de la acción.',
      confirmado_at: new Date().toISOString()
    }).select('*').single();
    if (leadershipFactor.error) throw leadershipFactor.error;

    const links = await supabase.from('pif_factor_evidencias').insert([
      { factor_id: timeFactor.data.id, evidencia_id: timeEvidence.id },
      { factor_id: leadershipFactor.data.id, evidencia_id: leadershipEvidence.id }
    ]);
    if (links.error) throw links.error;

    const interventions = await supabase.from('pif_intervenciones').insert([
      {
        caso_id: demoCaseId,
        hallazgo_id: finding.data.id,
        pif_codigo: 'T.2',
        titulo: 'Revisar planificación y tiempo disponible',
        descripcion: 'Verificar que la planificación de tareas en altura contemple tiempo suficiente para utilizar de forma consistente el sistema previsto de aseguramiento de herramientas.',
        nivel: 'tarea',
        responsable: 'Responsable del ejercicio',
        indicador: 'Tareas críticas revisadas con tiempo operativo suficiente',
        estado: 'pendiente'
      },
      {
        caso_id: demoCaseId,
        hallazgo_id: finding.data.id,
        pif_codigo: 'O.3',
        titulo: 'Revisar mensajes operacionales del liderazgo',
        descripcion: 'Asegurar que las comunicaciones sobre plazos no generen señales contradictorias con el uso de barreras y controles de seguridad.',
        nivel: 'organizacional',
        responsable: 'Responsable del ejercicio',
        indicador: 'Mensajes operacionales revisados y alineados con controles críticos',
        estado: 'pendiente'
      }
    ]);
    if (interventions.error) throw interventions.error;

    await loadCases();
    await openCase(demoCaseId);
    toast('Caso DEMO creado. Ya tiene hallazgo, barrera, evidencias, PIF e intervenciones. Solo falta probar un archivo real.');
  } catch (error) {
    console.error(error);
    if (demoCaseId) {
      await supabase.from('pif_casos').delete().eq('id', demoCaseId);
    }
    toast(error.message || 'No fue posible crear el caso DEMO.');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}


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

  let barreras = [], evidencias = [], factores = [], factorEvidencias = [], intervenciones = [];
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
  const intRes = await supabase.from('pif_intervenciones').select('*').eq('caso_id', caseId).order('created_at');
  if (!intRes.error) intervenciones = intRes.data || [];
  state.detail = { hallazgos, barreras, evidencias, factores, factorEvidencias, intervenciones };
  renderCaseWorkspace();
  $('#case-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function getCaseQuality(detail) {
  const hallazgos = detail?.hallazgos || [];
  const barreras = detail?.barreras || [];
  const evidencias = detail?.evidencias || [];
  const factores = detail?.factores || [];
  const relaciones = detail?.factorEvidencias || [];

  const hallazgosSinBarrera = hallazgos.filter(h => !barreras.some(b => b.hallazgo_id === h.id)).length;
  const hipotesis = factores.filter(f => f.respaldo === 'hipotesis').length;
  const parciales = factores.filter(f => f.respaldo === 'parcial').length;
  const confirmadosSinEvidencia = factores.filter(f =>
    f.respaldo === 'confirmado' && !relaciones.some(r => r.factor_id === f.id)
  ).length;
  const evidenciasSinVincular = evidencias.filter(e =>
    !relaciones.some(r => r.evidencia_id === e.id)
  ).length;

  const critical = confirmadosSinEvidencia;
  const review = hallazgosSinBarrera + hipotesis + parciales + evidenciasSinVincular;

  return {
    hallazgosSinBarrera,
    hipotesis,
    parciales,
    confirmadosSinEvidencia,
    evidenciasSinVincular,
    critical,
    review,
    ready: critical === 0 && hallazgos.length > 0 && factores.length > 0
  };
}

function renderQualityPanel(detail) {
  const q = getCaseQuality(detail);
  const tone = q.critical ? 'danger' : q.review ? 'warning' : 'ok';
  const title = q.critical ? 'Hay aspectos críticos por corregir' : q.review ? 'Aspectos que conviene revisar' : 'Análisis consistente';

  return `
    <section class="quality-panel ${tone}">
      <div class="quality-head">
        <div>
          <span class="eyebrow">Control de calidad</span>
          <h3>${title}</h3>
        </div>
        <span class="quality-score">${q.critical ? 'Corregir' : q.review ? 'Revisar' : 'Listo'}</span>
      </div>
      <div class="quality-grid">
        <div><strong>${q.confirmadosSinEvidencia}</strong><span>PIF confirmados sin evidencia</span></div>
        <div><strong>${q.hallazgosSinBarrera}</strong><span>hallazgos sin barrera registrada</span></div>
        <div><strong>${q.hipotesis + q.parciales}</strong><span>hipótesis o respaldos parciales</span></div>
        <div><strong>${q.evidenciasSinVincular}</strong><span>evidencias aún no vinculadas a PIF</span></div>
      </div>
      <p>Este panel revisa coherencia documental. No determina si la investigación es correcta ni sustituye el juicio profesional.</p>
    </section>
  `;
}

function renderCaseSummary(detail) {
  const confirmed = detail.factores.filter(f => f.respaldo === 'confirmado').length;
  const partial = detail.factores.filter(f => f.respaldo === 'parcial').length;
  const hypotheses = detail.factores.filter(f => f.respaldo === 'hipotesis').length;
  return `
    <div class="case-kpis">
      <div><strong>${detail.hallazgos.length}</strong><span>hallazgos</span></div>
      <div><strong>${detail.evidencias.length}</strong><span>evidencias</span></div>
      <div><strong>${confirmed}</strong><span>PIF confirmados</span></div>
      <div><strong>${partial}</strong><span>respaldo parcial</span></div>
      <div><strong>${hypotheses}</strong><span>hipótesis</span></div>
      <div><strong>${detail.intervenciones?.length || 0}</strong><span>intervenciones</span></div>
    </div>
  `;
}

function renderInterventions(detail) {
  const items = detail.intervenciones || [];
  return `
    <section class="interventions-panel">
      <div class="subsection-title">
        <strong>Intervenciones</strong>
        <span class="help">Acciones derivadas del análisis, no de una selección automática.</span>
      </div>
      <div class="mini-list">
        ${items.length ? items.map(i => `
          <div class="mini-item">
            <strong>${esc(i.titulo)}</strong>
            <br>${esc(i.descripcion || '')}
            <div class="pills">
              ${i.pif_codigo ? `<span class="pill teal">${esc(i.pif_codigo)}</span>` : ''}
              <span class="pill">${esc(i.estado.replace('_',' '))}</span>
              ${i.responsable ? `<span class="pill">${esc(i.responsable)}</span>` : ''}
            </div>
          </div>
        `).join('') : '<div class="empty-state small">Aún no hay intervenciones registradas.</div>'}
      </div>
    </section>
  `;
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
          ${c.codigo_interno === 'DEMO-EI3646-HERRAMIENTA' ? '<button class="btn demo" type="button" id="demo-upload">📎 Probar archivo</button>' : ''}
          <button class="btn secondary" type="button" id="generate-report">📄 Informe PDF</button>
          ${c.estado !== 'cerrado' ? '<button class="btn secondary" type="button" id="close-case">Cerrar análisis</button>' : ''}
        </div>
      </div>

      ${renderCaseSummary(d)}
      ${renderQualityPanel(d)}

      <div class="hallazgo-list">
        ${d.hallazgos.length ? d.hallazgos.map(renderFinding).join('') : '<div class="empty-state small">Aún no hay hallazgos. Registra primero una acción, decisión o condición observable identificada durante la investigación.</div>'}
      </div>

      ${renderInterventions(d)}
    </section>
  `;

  $('#add-finding')?.addEventListener('click', showAddFinding);
  $('#generate-report')?.addEventListener('click', openCaseReport);
  $('#demo-upload')?.addEventListener('click', () => {
    const firstFinding = state.detail?.hallazgos?.[0];
    if (!firstFinding) return toast('El caso DEMO no tiene hallazgo disponible.');
    showAddEvidence(firstFinding.id);
    $('#evidence-type').value = 'Fotografía';
    $('#evidence-title').value = 'Archivo de prueba de Google Drive';
    $('#evidence-contribution').value = 'Archivo utilizado únicamente para comprobar la carga de evidencias de PIF-SST hacia Google Drive.';
    $('#evidence-source').value = 'Prueba de funcionamiento PIF-SST';
    toast('Solo selecciona un archivo menor de 5 MB y pulsa Guardar evidencia.');
  });
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



function reportDate(value) {
  if (!value) return 'No indicada';
  try {
    return new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date(value + (String(value).length === 10 ? 'T12:00:00' : '')));
  } catch {
    return String(value);
  }
}

function reportAnalystName() {
  const meta = state.session?.user?.user_metadata || {};
  const memberName = [state.member?.nombres, state.member?.apellidos].filter(Boolean).join(' ').trim();
  const authName = [meta.nombres, meta.apellidos].filter(Boolean).join(' ').trim();
  return memberName || authName || 'Integrante de La Movida de SST+';
}

function reportStateLabel(value) {
  const labels = {
    borrador: 'Borrador',
    en_analisis: 'En análisis',
    revision: 'En revisión',
    cerrado: 'Cerrado'
  };
  return labels[value] || value || 'Sin estado';
}

function reportSupportLabel(value) {
  const labels = {
    confirmado: 'Confirmado',
    parcial: 'Respaldo parcial',
    hipotesis: 'Hipótesis'
  };
  return labels[value] || value || '';
}

function buildCaseReportHTML() {
  const c = state.currentCase;
  const d = state.detail;
  if (!c || !d) return '';

  const q = getCaseQuality(d);
  const generatedAt = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const factorName = code => state.factors.find(f => f.codigo === code)?.nombre_es || code;
  const subfactorName = code => state.subfactors.find(s => s.codigo === code)?.nombre_es || code;

  const hallazgosHtml = d.hallazgos.map((h, idx) => {
    const barriers = d.barreras.filter(b => b.hallazgo_id === h.id);
    const evidences = d.evidencias.filter(e => e.hallazgo_id === h.id);
    const factors = d.factores.filter(f => f.hallazgo_id === h.id);

    return `
      <section class="report-section finding">
        <div class="section-kicker">Hallazgo ${idx + 1} · ${esc(h.tipo)}</div>
        <h3>${esc(h.descripcion_observable)}</h3>
        ${h.notas ? `<p class="muted">${esc(h.notas)}</p>` : ''}

        <div class="report-columns">
          <div>
            <h4>Barrera o control</h4>
            ${barriers.length ? barriers.map(b => `
              <div class="report-box">
                <strong>${esc(b.tipo || 'Barrera')}</strong>
                <span>Estado: ${esc(b.estado || b.relacion || 'No indicado')}</span>
                ${b.descripcion ? `<p>${esc(b.descripcion)}</p>` : ''}
              </div>
            `).join('') : '<p class="muted">No se registró una barrera o control para este hallazgo.</p>'}
          </div>

          <div>
            <h4>Evidencias</h4>
            ${evidences.length ? evidences.map(e => `
              <div class="report-box">
                <strong>${esc(e.titulo || e.tipo)}</strong>
                <span>${esc(e.tipo)} · ${esc(e.estado_archivo || 'sin archivo')}</span>
                <p>${esc(e.aporte)}</p>
                ${e.fuente_texto ? `<small>Fuente: ${esc(e.fuente_texto)}</small>` : ''}
                ${e.drive_url ? `<small>Archivo: ${esc(e.drive_file_name || 'Google Drive')}</small>` : ''}
              </div>
            `).join('') : '<p class="muted">No se registraron evidencias para este hallazgo.</p>'}
          </div>
        </div>

        <h4>PIF asociados</h4>
        ${factors.length ? factors.map(f => {
          const linkedEvidenceIds = d.factorEvidencias.filter(r => r.factor_id === f.id).map(r => r.evidencia_id);
          const linkedEvidence = evidences.filter(e => linkedEvidenceIds.includes(e.id));
          return `
            <div class="pif-report-card">
              <div class="pif-report-head">
                <strong>${esc(f.pif_codigo)} · ${esc(factorName(f.pif_codigo))}</strong>
                <span class="support ${esc(f.respaldo)}">${esc(reportSupportLabel(f.respaldo))}</span>
              </div>
              ${f.subfactor_codigo ? `<div class="subfactor">${esc(f.subfactor_codigo)} · ${esc(subfactorName(f.subfactor_codigo))}</div>` : ''}
              ${f.justificacion ? `<p><strong>Justificación:</strong> ${esc(f.justificacion)}</p>` : ''}
              <p><strong>Evidencia vinculada:</strong> ${linkedEvidence.length ? linkedEvidence.map(e => esc(e.titulo || e.tipo)).join(', ') : 'Ninguna'}</p>
            </div>
          `;
        }).join('') : '<p class="muted">No se asociaron PIF a este hallazgo.</p>'}
      </section>
    `;
  }).join('');

  const interventionsHtml = (d.intervenciones || []).length
    ? d.intervenciones.map(i => `
        <div class="report-box">
          <strong>${esc(i.titulo)}</strong>
          ${i.pif_codigo ? `<span>PIF relacionado: ${esc(i.pif_codigo)} · ${esc(factorName(i.pif_codigo))}</span>` : ''}
          ${i.descripcion ? `<p>${esc(i.descripcion)}</p>` : ''}
          <small>Estado: ${esc((i.estado || '').replace('_',' '))}${i.responsable ? ' · Responsable: ' + esc(i.responsable) : ''}${i.indicador ? ' · Indicador: ' + esc(i.indicador) : ''}</small>
        </div>
      `).join('')
    : '<p class="muted">No se registraron intervenciones.</p>';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.codigo_pif)} · Informe PIF-SST</title>
<style>
  :root{--teal:#007b85;--navy:#00205b;--green:#70ad47;--yellow:#ffb600;--text:#334155;--muted:#64748b;--line:#dbe4ee;--bg:#f8fafc}
  *{box-sizing:border-box}
  body{margin:0;background:#eef3f6;color:var(--text);font-family:Arial,Helvetica,sans-serif}
  .toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:center;gap:10px;padding:12px;background:#172033}
  .toolbar button{border:0;border-radius:9px;padding:10px 16px;font-weight:700;cursor:pointer}
  .toolbar .primary{background:var(--teal);color:white}
  .toolbar .secondary{background:white;color:var(--navy)}
  .page{width:min(210mm,calc(100% - 24px));min-height:297mm;margin:22px auto;background:white;padding:18mm 16mm;box-shadow:0 18px 55px rgba(15,23,42,.14)}
  .report-header{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:3px solid var(--teal)}
  .identity{display:flex;gap:12px;align-items:center}
  .mark{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:var(--teal);color:white;font-weight:900;font-size:18px}
  .identity h1{margin:0;color:var(--navy);font-size:25px}
  .identity p{margin:3px 0 0;color:var(--muted);font-size:12px}
  .report-status{text-align:right}
  .report-status strong{display:block;color:var(--navy)}
  .report-status span{display:inline-block;margin-top:6px;padding:5px 8px;border-radius:999px;background:#edf3f6;font-size:10px;font-weight:700;text-transform:uppercase}
  .draft-note{margin:16px 0;padding:10px 12px;border-left:4px solid var(--yellow);background:#fff9e6;font-size:11px;line-height:1.45}
  .title-block{padding:24px 0 18px}
  .title-block .code{color:var(--teal);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .title-block h2{margin:5px 0 8px;color:var(--navy);font-size:24px}
  .title-block p{margin:0;line-height:1.55;font-size:12px}
  .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 20px}
  .meta{padding:9px;border:1px solid var(--line);border-radius:8px}
  .meta span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;font-weight:700}
  .meta strong{display:block;margin-top:3px;color:var(--navy);font-size:11px}
  .summary-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:16px 0}
  .summary-grid div{padding:9px;border-radius:8px;background:var(--bg);text-align:center}
  .summary-grid strong{display:block;color:var(--teal);font-size:17px}
  .summary-grid span{font-size:8px;color:var(--muted)}
  .quality{margin:17px 0;padding:12px;border:1px solid var(--line);border-left:5px solid ${q.critical ? '#b42318' : q.review ? 'var(--yellow)' : 'var(--green)'};border-radius:8px}
  .quality h3{margin:0 0 8px;color:var(--navy);font-size:13px}
  .quality-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .quality-grid div{padding:7px;background:var(--bg);border-radius:6px}
  .quality-grid strong{display:block;color:var(--navy);font-size:14px}
  .quality-grid span{font-size:8px;color:var(--muted)}
  .report-section{padding:17px 0;border-top:1px solid var(--line);break-inside:avoid}
  .section-kicker{color:var(--teal);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
  .report-section h3{margin:5px 0 8px;color:var(--navy);font-size:15px}
  .report-section h4{margin:14px 0 7px;color:var(--navy);font-size:11px}
  .report-section p{font-size:10px;line-height:1.5}
  .muted{color:var(--muted)}
  .report-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .report-box,.pif-report-card{margin:6px 0;padding:9px;border:1px solid var(--line);border-radius:7px;break-inside:avoid}
  .report-box strong,.report-box span,.report-box small{display:block}
  .report-box strong{color:var(--navy);font-size:10px}
  .report-box span{margin-top:2px;color:var(--muted);font-size:8px}
  .report-box p{margin:5px 0}
  .report-box small{color:var(--muted);font-size:8px;line-height:1.4}
  .pif-report-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
  .pif-report-head strong{color:var(--navy);font-size:10px}
  .support{padding:3px 6px;border-radius:999px;background:#edf3f6;font-size:8px;font-weight:700}
  .support.confirmado{background:#edf7e8;color:#527f36}
  .support.parcial{background:#fff5d9;color:#745800}
  .support.hipotesis{background:#edf3f6;color:#5e6d7b}
  .subfactor{margin-top:5px;color:var(--teal);font-size:9px;font-weight:700}
  .report-footer{margin-top:24px;padding-top:12px;border-top:2px solid var(--navy);font-size:8px;color:var(--muted);line-height:1.5}
  .report-footer strong{color:var(--navy)}
  .source{margin-top:9px;padding:8px;background:var(--bg);border-radius:6px}
  @page{size:A4;margin:10mm}
  @media print{
    body{background:white}
    .toolbar{display:none}
    .page{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
    a{color:inherit;text-decoration:none}
  }
  @media(max-width:700px){
    .page{padding:20px}
    .report-header,.report-columns{grid-template-columns:1fr;display:grid}
    .report-status{text-align:left}
    .meta-grid{grid-template-columns:1fr 1fr}
    .summary-grid{grid-template-columns:repeat(3,1fr)}
    .quality-grid{grid-template-columns:1fr 1fr}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">Imprimir / Guardar como PDF</button>
    <button class="secondary" onclick="window.close()">Cerrar informe</button>
  </div>

  <main class="page">
    <header class="report-header">
      <div class="identity">
        <div class="mark">PIF</div>
        <div>
          <h1>PIF-SST</h1>
          <p>Análisis de factores que influyen en el desempeño</p>
          <p><strong>La Movida de SST+</strong> · De la Reacción a la Prevención</p>
        </div>
      </div>
      <div class="report-status">
        <strong>Informe de análisis</strong>
        <span>${esc(reportStateLabel(c.estado))}</span>
      </div>
    </header>

    ${c.estado !== 'cerrado' ? '<div class="draft-note"><strong>Informe en borrador.</strong> El análisis todavía no ha sido cerrado en PIF-SST y puede cambiar.</div>' : ''}

    <section class="title-block">
      <div class="code">${esc(c.codigo_pif)}</div>
      <h2>${esc(c.titulo)}</h2>
      <p>${esc(c.descripcion || 'Sin descripción registrada.')}</p>
    </section>

    <section class="meta-grid">
      <div class="meta"><span>Tipo de caso</span><strong>${esc(c.tipo)}</strong></div>
      <div class="meta"><span>Fecha del evento</span><strong>${esc(reportDate(c.fecha_evento))}</strong></div>
      <div class="meta"><span>Analista</span><strong>${esc(reportAnalystName())}</strong></div>
      <div class="meta"><span>Empresa</span><strong>${esc(c.empresa || 'No indicada')}</strong></div>
      <div class="meta"><span>Área</span><strong>${esc(c.area || 'No indicada')}</strong></div>
      <div class="meta"><span>Actividad</span><strong>${esc(c.actividad || 'No indicada')}</strong></div>
      <div class="meta"><span>Centro de trabajo</span><strong>${esc(c.centro_trabajo || 'No indicado')}</strong></div>
      <div class="meta"><span>Tipo de evento</span><strong>${esc(c.tipo_evento || 'No indicado')}</strong></div>
      <div class="meta"><span>Gravedad</span><strong>${esc(c.gravedad || 'No indicada')}</strong></div>
    </section>

    <section class="summary-grid">
      <div><strong>${d.hallazgos.length}</strong><span>Hallazgos</span></div>
      <div><strong>${d.evidencias.length}</strong><span>Evidencias</span></div>
      <div><strong>${d.factores.filter(f => f.respaldo === 'confirmado').length}</strong><span>PIF confirmados</span></div>
      <div><strong>${d.factores.filter(f => f.respaldo === 'parcial').length}</strong><span>Parciales</span></div>
      <div><strong>${d.factores.filter(f => f.respaldo === 'hipotesis').length}</strong><span>Hipótesis</span></div>
      <div><strong>${d.intervenciones?.length || 0}</strong><span>Intervenciones</span></div>
    </section>

    <section class="quality">
      <h3>Control de calidad documental</h3>
      <div class="quality-grid">
        <div><strong>${q.confirmadosSinEvidencia}</strong><span>PIF confirmados sin evidencia</span></div>
        <div><strong>${q.hallazgosSinBarrera}</strong><span>Hallazgos sin barrera</span></div>
        <div><strong>${q.hipotesis + q.parciales}</strong><span>Hipótesis o parciales</span></div>
        <div><strong>${q.evidenciasSinVincular}</strong><span>Evidencias sin vincular</span></div>
      </div>
    </section>

    ${hallazgosHtml}

    <section class="report-section">
      <div class="section-kicker">Acciones posteriores</div>
      <h3>Intervenciones registradas</h3>
      ${interventionsHtml}
    </section>

    <footer class="report-footer">
      <strong>PIF-SST · La Movida de SST+</strong><br>
      www.movidasst.com · De la Reacción a la Prevención<br>
      Informe generado: ${esc(generatedAt)}
      <div class="source">
        <strong>Referencia técnica:</strong> Energy Institute. EI 3646. <em>Research report: A proposed human factors performance influencing factors (PIFs) taxonomy.</em> First edition, August 2026. London.<br>
        PIF-SST utiliza esta taxonomía como estructura para clasificar y analizar hallazgos. La aplicación no sustituye una metodología de investigación de incidentes ni el juicio profesional.
      </div>
    </footer>
  </main>
</body>
</html>`;
}

function openCaseReport() {
  const html = buildCaseReportHTML();
  if (!html) return toast('No hay información suficiente para generar el informe.');
  const reportWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!reportWindow) return toast('El navegador bloqueó la ventana del informe. Habilita ventanas emergentes para PIF-SST.');
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
}

async function loadAnalytics() {
  if (!state.session) return;
  $('#analytics-status').textContent = 'Calculando…';

  const casesRes = await supabase.from('pif_casos').select('*').neq('tipo', 'aprendizaje').order('created_at');
  if (casesRes.error) {
    console.error(casesRes.error);
    $('#analytics-status').textContent = 'No fue posible cargar';
    return toast('No fue posible cargar la analítica.');
  }

  const cases = casesRes.data || [];
  const caseIds = cases.map(c => c.id);
  if (!caseIds.length) {
    state.analytics = { cases: [], findings: [], factors: [], barriers: [] };
    renderAnalytics();
    return;
  }

  const findingsRes = await supabase.from('pif_hallazgos').select('*').in('caso_id', caseIds);
  if (findingsRes.error) return toast('No fue posible cargar hallazgos para analítica.');
  const findings = findingsRes.data || [];
  const findingIds = findings.map(f => f.id);

  let factors = [], barriers = [];
  if (findingIds.length) {
    const [fRes, bRes] = await Promise.all([
      supabase.from('pif_hallazgo_factores').select('*').in('hallazgo_id', findingIds),
      supabase.from('pif_barreras').select('*').in('hallazgo_id', findingIds)
    ]);
    if (fRes.error || bRes.error) return toast('No fue posible completar la analítica.');
    factors = fRes.data || [];
    barriers = bRes.data || [];
  }

  state.analytics = { cases, findings, factors, barriers };
  renderAnalytics();
}

function countBy(items, keyFn) {
  const map = new Map();
  items.forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a,b) => b[1] - a[1]);
}

function renderBars(target, rows, labelFn) {
  const el = $(target);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state small">Aún no hay datos suficientes.</div>';
    return;
  }
  const max = Math.max(...rows.map(r => r[1]), 1);
  el.innerHTML = rows.map(([key, value]) => `
    <div class="bar-row">
      <div class="bar-label"><span>${esc(labelFn(key))}</span><strong>${value}</strong></div>
      <div class="bar-track"><span style="width:${Math.max(8,(value/max)*100)}%"></span></div>
    </div>
  `).join('');
}

function renderAnalytics() {
  const a = state.analytics || { cases: [], findings: [], factors: [], barriers: [] };
  const confirmed = a.factors.filter(f => f.respaldo === 'confirmado');
  const realCases = a.cases.length;
  const closed = a.cases.filter(c => c.estado === 'cerrado').length;
  const uniquePif = new Set(confirmed.map(f => f.pif_codigo)).size;

  $('#analytics-summary').innerHTML = `
    <div class="analytics-kpi"><strong>${realCases}</strong><span>casos reales/anonimizados</span></div>
    <div class="analytics-kpi"><strong>${a.findings.length}</strong><span>hallazgos</span></div>
    <div class="analytics-kpi"><strong>${confirmed.length}</strong><span>codificaciones confirmadas</span></div>
    <div class="analytics-kpi"><strong>${uniquePif}</strong><span>PIF distintos</span></div>
    <div class="analytics-kpi"><strong>${closed}</strong><span>casos cerrados</span></div>
  `;

  const topPif = countBy(confirmed, f => f.pif_codigo).slice(0, 10);
  renderBars('#analytics-top-pif', topPif, code => {
    const def = state.factors.find(f => f.codigo === code);
    return `${code} · ${def?.nombre_es || code}`;
  });

  const cats = countBy(confirmed, f => {
    const def = state.factors.find(x => x.codigo === f.pif_codigo);
    return def?.categoria_codigo || null;
  });
  renderBars('#analytics-categories', cats, code => {
    const cat = state.categories.find(c => c.codigo === code);
    return cat?.nombre_es || code;
  });

  const barrierRows = countBy(a.barriers, b => b.estado || b.relacion).slice(0, 10);
  const barrierLabels = {
    funciono:'Funcionó',
    parcial:'Funcionó parcialmente',
    degradada:'Degradada',
    no_disponible:'No disponible',
    no_utilizada:'No utilizada',
    desconocido:'Desconocido',
    no_aplica:'No aplica',
    si:'Sí',
    no:'No',
    no_determinado:'No determinado'
  };
  renderBars('#analytics-barriers', barrierRows, key => barrierLabels[key] || key);

  const byFinding = new Map();
  confirmed.forEach(f => {
    if (!byFinding.has(f.hallazgo_id)) byFinding.set(f.hallazgo_id, []);
    byFinding.get(f.hallazgo_id).push(f.pif_codigo);
  });
  const combos = new Map();
  for (const codes of byFinding.values()) {
    const unique = [...new Set(codes)].sort();
    for (let i=0;i<unique.length;i++) {
      for (let j=i+1;j<unique.length;j++) {
        const key = unique[i] + ' + ' + unique[j];
        combos.set(key, (combos.get(key) || 0) + 1);
      }
    }
  }
  const comboRows = [...combos.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  $('#analytics-combinations').innerHTML = comboRows.length
    ? comboRows.map(([combo,count]) => `<div class="mini-item"><strong>${esc(combo)}</strong><br>${count} hallazgo(s) con ambos PIF confirmados.</div>`).join('')
    : '<div class="empty-state small">Se necesitan hallazgos con más de un PIF confirmado para mostrar combinaciones.</div>';

  $('#analytics-status').textContent = realCases
    ? `${realCases} caso(s) incluidos · casos de aprendizaje excluidos`
    : 'Sin casos reales para analizar';
}

async function closeCase() {
  const q = getCaseQuality(state.detail);
  if (q.confirmadosSinEvidencia > 0) {
    return toast('No puedes cerrar: hay PIF confirmados sin evidencia vinculada.');
  }
  const reviewText = q.review
    ? ` Hay ${q.review} aspecto(s) pendiente(s) de revisión. Puedes cerrar, pero quedarán registrados en el control de calidad.`
    : '';
  if (!confirm('¿Cerrar este análisis? Podrás consultarlo, pero quedará marcado como cerrado.' + reviewText)) return;
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
  if (['inicio','taxonomia','casos','analitica'].includes(target)) showView(target);
  try {
    await loadTaxonomy();
  } catch (error) {
    console.error(error);
    $('#taxonomy-status').textContent = 'No fue posible cargar la taxonomía';
    $('#taxonomy-grid').innerHTML = '<div class="empty-state">No se pudo consultar la taxonomía en este momento.</div>';
  }
  await initAuth();
  if (state.session && target === 'casos') await loadCases();
  if (state.session && target === 'analitica') await loadAnalytics();
}
init();
