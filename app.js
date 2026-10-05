import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CONFIG = {
  supabaseUrl: 'https://lfdmbkzghnwvsapxypvt.supabase.co',
  supabasePublishableKey: 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1',
  evidenceWebAppUrl: 'https://script.google.com/macros/s/AKfycbxVEm4ArOJGR1aOizW71f1CDWro2cIlJ7J4Ossn0NrBbjeXJLpi9tBdMJ8KnFDrQzEr/exec'
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey);

const state = {
  categories: [],
  factors: [],
  subfactors: [],
  activeCategory: 'all',
  query: ''
};

const els = {
  categoryFilters: document.querySelector('#category-filters'),
  taxonomyGrid: document.querySelector('#taxonomy-grid'),
  search: document.querySelector('#search-input'),
  empty: document.querySelector('#empty-state'),
  sourceStatus: document.querySelector('#source-status'),
  categoriesCount: document.querySelector('#count-categories'),
  factorsCount: document.querySelector('#count-factors'),
  subfactorsCount: document.querySelector('#count-subfactors')
};

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

async function loadTaxonomy() {
  els.sourceStatus.textContent = 'Cargando datos…';

  const [categoriesRes, factorsRes, subfactorsRes] = await Promise.all([
    supabase
      .from('pif_categorias')
      .select('codigo,nombre_es,nombre_en,descripcion_es,orden')
      .eq('activo', true)
      .order('orden'),
    supabase
      .from('pif_taxonomia')
      .select('codigo,categoria_codigo,nombre_es,nombre_en,definicion_es,orientacion_es,orden,pagina_fuente')
      .eq('activo', true)
      .order('categoria_codigo')
      .order('orden'),
    supabase
      .from('pif_subfactores')
      .select('codigo,pif_codigo,nombre_es,nombre_en,descripcion_es,orden')
      .eq('activo', true)
      .order('pif_codigo')
      .order('orden')
  ]);

  const firstError = categoriesRes.error || factorsRes.error || subfactorsRes.error;
  if (firstError) throw firstError;

  state.categories = categoriesRes.data || [];
  state.factors = factorsRes.data || [];
  state.subfactors = subfactorsRes.data || [];

  els.categoriesCount.textContent = state.categories.length;
  els.factorsCount.textContent = state.factors.length;
  els.subfactorsCount.textContent = state.subfactors.length;
  els.sourceStatus.textContent = 'Datos cargados desde PIF-SST';

  renderCategoryFilters();
  renderTaxonomy();
}

function renderCategoryFilters() {
  const chips = [
    { codigo: 'all', nombre_es: 'Todos' },
    ...state.categories
  ];

  els.categoryFilters.innerHTML = chips.map(cat => {
    const count = cat.codigo === 'all'
      ? state.factors.length
      : state.factors.filter(f => f.categoria_codigo === cat.codigo).length;

    return `<button type="button" class="filter-chip ${state.activeCategory === cat.codigo ? 'active' : ''}" data-category="${esc(cat.codigo)}">${esc(cat.nombre_es)} · ${count}</button>`;
  }).join('');

  els.categoryFilters.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeCategory = button.dataset.category;
      renderCategoryFilters();
      renderTaxonomy();
    });
  });
}

function factorMatches(factor) {
  if (state.activeCategory !== 'all' && factor.categoria_codigo !== state.activeCategory) {
    return false;
  }

  const q = normalize(state.query.trim());
  if (!q) return true;

  const subs = state.subfactors.filter(s => s.pif_codigo === factor.codigo);
  const haystack = normalize([
    factor.codigo,
    factor.nombre_es,
    factor.nombre_en,
    factor.definicion_es,
    factor.orientacion_es,
    ...subs.flatMap(s => [s.codigo, s.nombre_es, s.nombre_en, s.descripcion_es])
  ].filter(Boolean).join(' '));

  return haystack.includes(q);
}

function renderTaxonomy() {
  const visible = state.factors.filter(factorMatches);
  els.empty.hidden = visible.length > 0;

  els.taxonomyGrid.innerHTML = visible.map(factor => {
    const category = state.categories.find(c => c.codigo === factor.categoria_codigo);
    const subs = state.subfactors.filter(s => s.pif_codigo === factor.codigo);

    return `
      <details class="factor-card">
        <summary>
          <div class="factor-heading">
            <div class="code">${esc(factor.codigo)}</div>
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
            <ul>
              ${subs.map(s => `<li><strong>${esc(s.codigo)} · ${esc(s.nombre_es)}</strong>${s.descripcion_es ? `: ${esc(s.descripcion_es)}` : ''}</li>`).join('')}
            </ul>
          ` : '<p>No tiene subfactores específicos registrados.</p>'}
        </div>
      </details>
    `;
  }).join('');
}

els.search.addEventListener('input', event => {
  state.query = event.target.value;
  renderTaxonomy();
});

loadTaxonomy().catch(error => {
  console.error(error);
  els.sourceStatus.textContent = 'No fue posible cargar la taxonomía';
  els.taxonomyGrid.innerHTML = '<div class="empty-state">No se pudo consultar PIF-SST en este momento. Revisa la conexión con Supabase.</div>';
});
