'use strict';

function formatNumber(n) {
  return Number(n).toLocaleString('pt-BR');
}
function formatPct(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}
function formatSignedPct(n) {
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
}

function getQualityStatus(pctNonConforme) {
  const value = Number(pctNonConforme) || 0;
  if (value <= 3) return 'good';
  if (value <= 6) return 'warn';
  return 'bad';
}

function getYieldStatus(pctConforme) {
  const value = Number(pctConforme) || 0;
  if (value >= 97) return 'good';
  if (value >= 94) return 'warn';
  return 'bad';
}

function getStatusColor(status) {
  if (status === 'good') return '#27C77A';
  if (status === 'warn') return '#EF9F27';
  return '#e05252';
}

const MESES     = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/*  Chart.js — configuração global compartilhada por todos os gráficos da página  */
Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
Chart.defaults.color = '#6888a8';
Chart.defaults.interaction = { mode: 'nearest', intersect: false };
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#0d2040';
Chart.defaults.plugins.tooltip.titleColor = '#c8d8ea';
Chart.defaults.plugins.tooltip.bodyColor = '#27C77A';
Chart.defaults.plugins.tooltip.borderColor = '#1a3356';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.displayColors = false;
Chart.defaults.plugins.tooltip.titleFont = { family: "'Inter', system-ui, sans-serif", weight: '600', size: 12 };
Chart.defaults.plugins.tooltip.bodyFont = { family: "'Inter', system-ui, sans-serif", weight: '600', size: 13 };
Chart.defaults.plugins.tooltip.callbacks.label = (ctx) => {
  const v = ctx.parsed.y ?? ctx.parsed.x;
  return ' ' + formatPct(v);
};
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 4;
Chart.defaults.elements.line.borderWidth = 2;
Chart.defaults.elements.line.tension = .3;
Chart.defaults.datasets.bar.maxBarThickness = 32;
Chart.defaults.scale.grid.color = 'rgba(200,216,234,.08)';
Chart.defaults.scale.grid.tickColor = 'rgba(200,216,234,.08)';
Chart.defaults.scale.grid.borderDash = [3, 3];
Chart.defaults.scale.ticks.color = '#6888a8';
Chart.defaults.scale.ticks.font = { family: "'Inter', system-ui, sans-serif", weight: '500' };

const MODULES = [
  { id: 'quality', label: 'Qualidade', desc: 'Conformidade, perdas e desempenho por máquina.', status: 'active' },
  { id: 'efficiency', label: 'Eficiência', desc: 'Aproveitamento, paradas e produtividade.', status: 'active' },
  { id: 'performance', label: 'Performance', desc: 'Comparativo operacional entre Turno 1 e Turno 2.', status: 'active' },
  { id: 'previous-day', label: 'Dia anterior', desc: 'Consolidado operacional do último dia relevante do período.', status: 'active' },
  { id: 'production', label: 'Produção', desc: 'Volume, ritmo e capacidade produtiva.', status: 'soon' },
];

const state = { year: null, month: null, module: 'quality' };
let trendChart = null;
let machineChart = null;
let compositionChart = null;
let dailyChart = null;
let yieldChart = null;
let efficiencyTurnChart = null;
let efficiencyDowntimeChart = null;
let performanceDailyChart = null;
let performanceQualityChart = null;
let previousDayCompositionChart = null;
let previousDayMachineChart = null;
let previousDayReportData = null;

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch (e) { /* corpo não é JSON, mantém statusText */ }
    throw new Error(detail);
  }
  return res.json();
}

function populateSelectors() {
  const yearSel  = document.getElementById('sel-year');
  const monthSel = document.getElementById('sel-month');
  const now      = new Date();
  const curYear  = now.getFullYear();

  state.year  = curYear;
  state.month = now.getMonth() + 1;

  for (let y = curYear - 3; y <= curYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === curYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  MESES.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = idx + 1;
    opt.textContent = name;
    if (idx + 1 === state.month) opt.selected = true;
    monthSel.appendChild(opt);
  });

  yearSel.addEventListener('change', () => {
    state.year = Number(yearSel.value);
    loadAll();
  });
  monthSel.addEventListener('change', () => {
    state.month = Number(monthSel.value);
    loadAll();
  });
}

function renderModuleRail() {
  const rail = document.getElementById('module-rail');
  rail.innerHTML = MODULES.map((module) => `
    <button
      type="button"
      class="module-card ${state.module === module.id ? 'active' : ''} ${module.status === 'soon' ? 'soon' : ''}"
      data-module-id="${module.id}"
    >
      <div class="module-card-top">
        <div class="module-card-name">${module.status === 'soon' ? 'Novo módulo' : module.label}</div>
        <div class="module-card-badge">${module.status === 'active' ? 'ativo' : 'em breve'}</div>
      </div>
      <div class="module-card-desc">${module.status === 'soon' ? 'Espaço reservado para os próximos analíticos do dashboard.' : module.desc}</div>
    </button>
  `).join('');

  rail.querySelectorAll('[data-module-id]').forEach((button) => {
    button.addEventListener('click', () => setModule(button.dataset.moduleId));
  });
}

function syncModuleView() {
  const currentModule = MODULES.find((item) => item.id === state.module) || MODULES[0];
  document.getElementById('module-label').textContent = currentModule.label;

  const qualityView = document.getElementById('module-view-quality');
  const efficiencyView = document.getElementById('module-view-efficiency');
  const performanceView = document.getElementById('module-view-performance');
  const previousDayView = document.getElementById('module-view-previous-day');
  const placeholderView = document.getElementById('module-view-placeholder');

  if (state.module === 'quality') {
    qualityView.hidden = false;
    efficiencyView.hidden = true;
    performanceView.hidden = true;
    previousDayView.hidden = true;
    placeholderView.hidden = true;
    return;
  }

  if (state.module === 'efficiency') {
    qualityView.hidden = true;
    efficiencyView.hidden = false;
    performanceView.hidden = true;
    previousDayView.hidden = true;
    placeholderView.hidden = true;
    return;
  }

  if (state.module === 'performance') {
    qualityView.hidden = true;
    efficiencyView.hidden = true;
    performanceView.hidden = false;
    previousDayView.hidden = true;
    placeholderView.hidden = true;
    return;
  }

  if (state.module === 'previous-day') {
    qualityView.hidden = true;
    efficiencyView.hidden = true;
    performanceView.hidden = true;
    previousDayView.hidden = false;
    placeholderView.hidden = true;
    return;
  }

  qualityView.hidden = true;
  efficiencyView.hidden = true;
  performanceView.hidden = true;
  previousDayView.hidden = true;
  placeholderView.hidden = false;
  document.getElementById('module-empty-title').textContent = currentModule.label;
  document.getElementById('module-empty-text').textContent = `O módulo de ${currentModule.label.toLowerCase()} já está reservado e pronto para receber os próximos painéis analíticos.`;
}

function setModule(moduleId) {
  const moduleExists = MODULES.some((item) => item.id === moduleId);
  if (!moduleExists) return;
  state.module = moduleId;
  renderModuleRail();
  syncModuleView();
  loadAll();
}

function renderKPIs(current, comparison) {
  const kpiRow = document.getElementById('kpi-row');

  const delta = comparison.delta_pct_non_conforme;
  const deltaCls = delta > 0 ? 'kpi-delta-up' : delta < 0 ? 'kpi-delta-down' : 'kpi-delta-flat';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';

  const tiles = [
    { label: 'Produzido',         value: formatNumber(current.total_produced) },
    { label: 'Reparo',            value: formatNumber(current.total_repair),            sub: formatPct(current.pct_repair) },
    { label: 'Segunda Qualidade', value: formatNumber(current.total_second_quality),    sub: formatPct(current.pct_second_quality) },
    { label: 'Não Conforme',      value: formatNumber(current.total_non_conforme),      sub: formatPct(current.pct_non_conforme) },
  ];

  kpiRow.innerHTML = tiles.map(t => `
    <div class="kpi">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value">${t.value}</div>
      ${t.sub ? `<div class="kpi-sub">${t.sub} do total</div>` : ''}
    </div>
  `).join('') + `
    <div class="kpi">
      <div class="kpi-label">Δ vs mês anterior</div>
      <div class="kpi-value ${deltaCls}">${arrow} ${formatSignedPct(delta)}</div>
      <div class="kpi-sub">não conforme</div>
    </div>
  `;
}

async function loadKPIs() {
  const kpiRow = document.getElementById('kpi-row');
  kpiRow.innerHTML = '<div class="msg">Carregando indicadores...</div>';
  try {
    const [current, comparison] = await Promise.all([
      fetchJSON(`/analytics/qualidade?year=${state.year}&month=${state.month}`),
      fetchJSON(`/analytics/qualidade_comparativo?year=${state.year}&month=${state.month}`),
    ]);
    renderKPIs(current, comparison);
  } catch (err) {
    kpiRow.innerHTML = `<div class="msg msg-error">Não foi possível carregar os indicadores (${escapeHTML(err.message)}).</div>`;
  }
}

function renderKPIs(current, comparison) {
  const kpiRow = document.getElementById('kpi-row');
  const delta = comparison.delta_pct_non_conforme;
  const deltaCls = delta > 0 ? 'kpi-delta-up' : delta < 0 ? 'kpi-delta-down' : 'kpi-delta-flat';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const conformidade = current.total_produced > 0
    ? ((current.total_produced - current.total_non_conforme) / current.total_produced) * 100
    : 0;

  const tiles = [
    { label: 'Produzido', value: formatNumber(current.total_produced) },
    { label: 'Reparo', value: formatNumber(current.total_repair), sub: formatPct(current.pct_repair), status: 'warn', valueColor: '#ffd48a', borderColor: '#EF9F27' },
    { label: 'Segunda Qualidade', value: formatNumber(current.total_second_quality), sub: formatPct(current.pct_second_quality), status: 'bad', valueColor: '#ff9c9c', borderColor: '#e05252' },
    { label: 'Não Conforme', value: `${delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '— '}${formatNumber(current.total_non_conforme)}`, sub: formatPct(current.pct_non_conforme), status: delta < 0 ? 'good' : delta > 0 ? 'bad' : null, valueColor: delta < 0 ? '#8df0b2' : delta > 0 ? '#ff9c9c' : '#c8d8ea', borderColor: delta < 0 ? '#27C77A' : delta > 0 ? '#e05252' : '#6888a8' },
    { label: 'Conformidade', value: formatPct(conformidade), sub: 'aproveitamento geral', status: getYieldStatus(conformidade) },
  ];

  kpiRow.innerHTML = tiles.map((tile) => {
    const baseColor = tile.borderColor || getStatusColor(tile.status);
    const border = tile.status ? `${baseColor}55` : 'var(--border)';
    const glow = tile.status ? `${baseColor}14` : 'rgba(2, 8, 23, .18)';
    const valueColor = tile.valueColor || (tile.status
      ? (tile.status === 'good' ? '#8df0b2' : tile.status === 'warn' ? '#ffd48a' : '#ff9c9c')
      : '#ffffff');
    const suffix = tile.label === 'Produzido' || tile.label === 'Conformidade' ? '' : ' do total';

    return `
      <div class="kpi" style="border-color:${border}; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${glow};">
        <div class="kpi-label">${tile.label}</div>
        <div class="kpi-value" style="color:${valueColor};">${tile.value}</div>
        ${tile.sub ? `<div class="kpi-sub">${tile.sub}${suffix}</div>` : ''}
      </div>
    `;
  }).join('') + `
    <div class="kpi" style="border-color:${delta > 0 ? '#e05252' : delta < 0 ? '#27C77A' : 'var(--border)'}55;">
      <div class="kpi-label">Δ vs mês anterior</div>
      <div class="kpi-value ${deltaCls}">${arrow} ${formatSignedPct(delta)}</div>
      <div class="kpi-sub">não conforme</div>
    </div>
  `;
}

function renderKPIs(current, comparison) {
  const kpiRow = document.getElementById('kpi-row');
  const previous = comparison.previous;
  const deltaNonConforme = comparison.delta_pct_non_conforme;
  const conformidade = current.total_produced > 0
    ? ((current.total_produced - current.total_non_conforme) / current.total_produced) * 100
    : 0;
  const previousConformidade = previous.total_produced > 0
    ? ((previous.total_produced - previous.total_non_conforme) / previous.total_produced) * 100
    : 0;

  function buildTrend(delta, direction) {
    if (Math.abs(delta) < 0.005) {
      return {
        arrow: '—',
        status: 'warn',
        color: '#ffd48a',
        borderColor: '#EF9F27',
        deltaLabel: 'estavel vs mes anterior',
      };
    }

    const improved = direction === 'up_better' ? delta > 0 : delta < 0;
    return {
      arrow: delta > 0 ? '▲' : '▼',
      status: improved ? 'good' : 'bad',
      color: improved ? '#8df0b2' : '#ff9c9c',
      borderColor: improved ? '#27C77A' : '#e05252',
      deltaLabel: `${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${direction === 'up_better' ? '%' : ' p.p.'}`,
    };
  }

  const producedTrend = buildTrend(current.total_produced - previous.total_produced, 'up_better');
  const repairTrend = buildTrend(current.pct_repair - previous.pct_repair, 'down_better');
  const secondTrend = buildTrend(current.pct_second_quality - previous.pct_second_quality, 'down_better');
  const nonConformeTrend = buildTrend(deltaNonConforme, 'down_better');
  const conformidadeTrend = buildTrend(conformidade - previousConformidade, 'up_better');

  const tiles = [
    {
      label: 'Produzido',
      value: `${producedTrend.arrow} ${formatNumber(current.total_produced)}`,
      sub: producedTrend.deltaLabel,
      status: producedTrend.status,
      valueColor: producedTrend.color,
      borderColor: producedTrend.borderColor,
    },
    {
      label: 'Reparo',
      value: `${repairTrend.arrow} ${formatNumber(current.total_repair)}`,
      sub: `${formatPct(current.pct_repair)} · ${repairTrend.deltaLabel}`,
      status: repairTrend.status,
      valueColor: repairTrend.color,
      borderColor: repairTrend.borderColor,
    },
    {
      label: 'Segunda Qualidade',
      value: `${secondTrend.arrow} ${formatNumber(current.total_second_quality)}`,
      sub: `${formatPct(current.pct_second_quality)} · ${secondTrend.deltaLabel}`,
      status: secondTrend.status,
      valueColor: secondTrend.color,
      borderColor: secondTrend.borderColor,
    },
    {
      label: 'Não Conforme',
      value: `${nonConformeTrend.arrow} ${formatNumber(current.total_non_conforme)}`,
      sub: `${formatPct(current.pct_non_conforme)} · ${nonConformeTrend.deltaLabel}`,
      status: nonConformeTrend.status,
      valueColor: nonConformeTrend.color,
      borderColor: nonConformeTrend.borderColor,
    },
    {
      label: 'Conformidade',
      value: `${conformidadeTrend.arrow} ${formatPct(conformidade)}`,
      sub: conformidadeTrend.deltaLabel,
      status: conformidadeTrend.status,
      valueColor: conformidadeTrend.color,
      borderColor: conformidadeTrend.borderColor,
    },
  ];

  kpiRow.innerHTML = tiles.map((tile) => {
    const border = `${tile.borderColor}55`;
    const glow = `${tile.borderColor}14`;

    return `
      <div class="kpi" style="border-color:${border}; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${glow};">
        <div class="kpi-label">${tile.label}</div>
        <div class="kpi-value" style="color:${tile.valueColor};">${tile.value}</div>
        <div class="kpi-sub">${tile.sub}</div>
      </div>
    `;
  }).join('') + `
    <div class="kpi" style="border-color:${nonConformeTrend.borderColor}55;">
      <div class="kpi-label">Δ vs mês anterior</div>
      <div class="kpi-value" style="color:${nonConformeTrend.color};">${nonConformeTrend.arrow} ${formatSignedPct(deltaNonConforme)}</div>
      <div class="kpi-sub">não conforme</div>
    </div>
  `;
}

function renderKPIs(current, comparison) {
  const kpiRow = document.getElementById('kpi-row');
  const deltaNonConforme = comparison.delta_pct_non_conforme;
  const conformidade = current.total_produced > 0
    ? ((current.total_produced - current.total_non_conforme) / current.total_produced) * 100
    : 0;

  const deltaArrow = deltaNonConforme > 0 ? '▲' : deltaNonConforme < 0 ? '▼' : '—';
  const deltaColor = deltaNonConforme > 0 ? '#ff9c9c' : deltaNonConforme < 0 ? '#8df0b2' : '#ffd48a';
  const deltaBorder = deltaNonConforme > 0 ? '#e05252' : deltaNonConforme < 0 ? '#27C77A' : '#EF9F27';

  const repairStatus = current.pct_repair <= 1 ? 'warn' : 'bad';
  const secondStatus = current.pct_second_quality <= 1 ? 'warn' : 'bad';
  const nonConformeStatus = getQualityStatus(current.pct_non_conforme);
  const conformidadeStatus = getYieldStatus(conformidade);

  function statusColors(status) {
    if (status === 'good') return { color: '#8df0b2', border: '#27C77A' };
    if (status === 'warn') return { color: '#ffd48a', border: '#EF9F27' };
    return { color: '#ff9c9c', border: '#e05252' };
  }

  const producedColors = { color: '#8ab8ff', border: '#8ab8ff' };
  const repairColors = statusColors(repairStatus);
  const secondColors = statusColors(secondStatus);
  const nonConformeColors = statusColors(nonConformeStatus);
  const conformidadeColors = statusColors(conformidadeStatus);

  const tiles = [
    { label: 'Produzido', value: formatNumber(current.total_produced), sub: 'volume produzido no mês', color: producedColors.color, border: producedColors.border },
    { label: 'Reparo', value: formatNumber(current.total_repair), sub: `${formatPct(current.pct_repair)} do total`, color: repairColors.color, border: repairColors.border },
    { label: 'Segunda Qualidade', value: formatNumber(current.total_second_quality), sub: `${formatPct(current.pct_second_quality)} do total`, color: secondColors.color, border: secondColors.border },
    { label: 'Não Conforme', value: formatNumber(current.total_non_conforme), sub: `${formatPct(current.pct_non_conforme)} do total`, color: nonConformeColors.color, border: nonConformeColors.border },
    { label: 'Conformidade', value: formatPct(conformidade), sub: 'aproveitamento geral', color: conformidadeColors.color, border: conformidadeColors.border },
  ];

  kpiRow.innerHTML = tiles.map((tile) => `
    <div class="kpi" style="border-color:${tile.border}55; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${tile.border}14;">
      <div class="kpi-label">${tile.label}</div>
      <div class="kpi-value" style="color:${tile.color};">${tile.value}</div>
      <div class="kpi-sub">${tile.sub}</div>
    </div>
  `).join('') + `
    <div class="kpi" style="border-color:${deltaBorder}55; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${deltaBorder}14;">
      <div class="kpi-label">Δ vs mês anterior</div>
      <div class="kpi-value" style="color:${deltaColor};">${deltaArrow} ${formatSignedPct(deltaNonConforme)}</div>
      <div class="kpi-sub">não conforme</div>
    </div>
  `;
}

async function loadKPIs() {
  const kpiRow = document.getElementById('kpi-row');
  kpiRow.innerHTML = '<div class="msg">Carregando indicadores...</div>';
  try {
    const [current, comparison, trend] = await Promise.all([
      fetchJSON(`/analytics/qualidade?year=${state.year}&month=${state.month}`),
      fetchJSON(`/analytics/qualidade_comparativo?year=${state.year}&month=${state.month}`),
      fetchJSON(`/analytics/qualidade_evolucao?year=${state.year}&month=${state.month}`),
    ]);
    renderKPIs(current, comparison, trend);
  } catch (err) {
    kpiRow.innerHTML = `<div class="msg msg-error">Não foi possível carregar os indicadores (${escapeHTML(err.message)}).</div>`;
  }
}

function renderKPIs(current, comparison, trend) {
  const kpiRow = document.getElementById('kpi-row');
  const conformidade = current.total_produced > 0
    ? ((current.total_produced - current.total_non_conforme) / current.total_produced) * 100
    : 0;
  const months = (trend?.months || []).filter(item => item.total_produced > 0);
  const baselineMonths = months.length > 1 ? months.slice(0, -1) : months;

  function averageOf(selector) {
    if (!baselineMonths.length) return 0;
    return baselineMonths.reduce((sum, item) => sum + selector(item), 0) / baselineMonths.length;
  }

  function buildAverageTrend(currentValue, averageValue, direction, formatter, warnThresholdPct = 8) {
    const safeAverage = averageValue > 0 ? averageValue : Math.max(currentValue, 1);
    const deltaPct = ((currentValue - averageValue) / safeAverage) * 100;
    const absDeltaPct = Math.abs(deltaPct);

    if (absDeltaPct <= warnThresholdPct) {
      return {
        arrow: '—',
        color: '#ffd48a',
        border: '#EF9F27',
        sub: `na média mensal (${formatter(averageValue)})`,
      };
    }

    const improved = direction === 'up_better' ? currentValue > averageValue : currentValue < averageValue;
    return {
      arrow: currentValue > averageValue ? '▲' : '▼',
      color: improved ? '#8df0b2' : '#ff9c9c',
      border: improved ? '#27C77A' : '#e05252',
      sub: `${deltaPct > 0 ? '+' : ''}${deltaPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% vs média (${formatter(averageValue)})`,
    };
  }

  const avgProduced = averageOf(item => item.total_produced);
  const avgRepair = averageOf(item => item.total_repair);
  const avgSecond = averageOf(item => item.total_second_quality);
  const avgNonConforme = averageOf(item => item.total_non_conforme);
  const avgPctNonConforme = averageOf(item => item.pct_non_conforme);
  const avgConformidade = averageOf((item) => (
    item.total_produced > 0
      ? ((item.total_produced - item.total_non_conforme) / item.total_produced) * 100
      : 0
  ));

  const producedTrend = buildAverageTrend(current.total_produced, avgProduced, 'up_better', value => formatNumber(Math.round(value)), 6);
  const repairTrend = buildAverageTrend(current.total_repair, avgRepair, 'down_better', value => formatNumber(Math.round(value)), 10);
  const secondTrend = buildAverageTrend(current.total_second_quality, avgSecond, 'down_better', value => formatNumber(Math.round(value)), 10);
  const nonConformeTrend = buildAverageTrend(current.total_non_conforme, avgNonConforme, 'down_better', value => formatNumber(Math.round(value)), 10);
  const conformidadeTrend = buildAverageTrend(conformidade, avgConformidade, 'up_better', value => formatPct(value), 2);

  const tiles = [
    { label: 'Produzido', value: `${producedTrend.arrow} ${formatNumber(current.total_produced)}`, sub: producedTrend.sub, color: producedTrend.color, border: producedTrend.border },
    { label: 'Reparo', value: `${repairTrend.arrow} ${formatNumber(current.total_repair)}`, sub: `${formatPct(current.pct_repair)} · ${repairTrend.sub}`, color: repairTrend.color, border: repairTrend.border },
    { label: 'Segunda Qualidade', value: `${secondTrend.arrow} ${formatNumber(current.total_second_quality)}`, sub: `${formatPct(current.pct_second_quality)} · ${secondTrend.sub}`, color: secondTrend.color, border: secondTrend.border },
    { label: 'Não Conforme', value: `${nonConformeTrend.arrow} ${formatNumber(current.total_non_conforme)}`, sub: `${formatPct(current.pct_non_conforme)} · ${nonConformeTrend.sub}`, color: nonConformeTrend.color, border: nonConformeTrend.border },
    { label: 'Conformidade', value: `${conformidadeTrend.arrow} ${formatPct(conformidade)}`, sub: conformidadeTrend.sub, color: conformidadeTrend.color, border: conformidadeTrend.border },
  ];

  kpiRow.innerHTML = tiles.map((tile) => `
    <div class="kpi" style="border-color:${tile.border}55; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${tile.border}14;">
      <div class="kpi-label">${tile.label}</div>
      <div class="kpi-value" style="color:${tile.color};">${tile.value}</div>
      <div class="kpi-sub">${tile.sub}</div>
    </div>
  `).join('') + `
    <div class="kpi" style="border-color:${nonConformeTrend.border}55; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${nonConformeTrend.border}14;">
      <div class="kpi-label">Referência</div>
      <div class="kpi-value" style="color:${nonConformeTrend.color};">${formatPct(avgPctNonConforme)}</div>
      <div class="kpi-sub">média mensal de não conforme</div>
    </div>
  `;
}

function renderTrendChart(months) {
  const canvas = document.getElementById('chart-trend');
  const ctx = canvas.getContext('2d');
  const labels = months.map(m => `${MESES_ABR[m.month - 1]}/${String(m.year).slice(2)}`);
  const data   = months.map(m => m.pct_non_conforme);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 220);
  gradient.addColorStop(0, 'rgba(39,199,122,.35)');
  gradient.addColorStop(1, 'rgba(39,199,122,0)');

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '% Não Conforme',
        data,
        borderColor: '#27C77A',
        backgroundColor: gradient,
        fill: true,
        pointBackgroundColor: '#27C77A',
        pointHoverBackgroundColor: '#27C77A',
        pointHoverBorderColor: '#0d2040',
        pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatPct(v) },
        },
      },
    },
  });
}

function renderTrendHighlights(months) {
  const el = document.getElementById('trend-highlights');
  const totalProduced = months.reduce((sum, item) => sum + item.total_produced, 0);
  const totalNonConforme = months.reduce((sum, item) => sum + item.total_non_conforme, 0);
  const bestMonth = months.reduce((best, item) => {
    if (!best) return item;
    return item.total_produced > best.total_produced ? item : best;
  }, null);
  const avgConformidade = totalProduced > 0
    ? ((totalProduced - totalNonConforme) / totalProduced) * 100
    : 0;
  const conformidadeStatus = getYieldStatus(avgConformidade);
  const naoConformePct = totalProduced > 0 ? (totalNonConforme / totalProduced) * 100 : 0;
  const volumeStatus = bestMonth && bestMonth.total_produced > 0 ? 'good' : 'warn';

  el.innerHTML = `
    <div class="trend-chip ${volumeStatus}">
      <div class="trend-chip-label">Volume 6 meses</div>
      <div class="trend-chip-value">${formatNumber(totalProduced)}</div>
      <div class="trend-chip-sub">soma da producao registrada</div>
    </div>
    <div class="trend-chip ${volumeStatus}">
      <div class="trend-chip-label">Pico de producao</div>
      <div class="trend-chip-value">${bestMonth ? formatNumber(bestMonth.total_produced) : '0'}</div>
      <div class="trend-chip-sub">${bestMonth ? `${MESES[bestMonth.month - 1]} ${bestMonth.year}` : 'sem dados'}</div>
    </div>
    <div class="trend-chip ${conformidadeStatus}">
      <div class="trend-chip-label">Conformidade média</div>
      <div class="trend-chip-value">${formatPct(avgConformidade)}</div>
      <div class="trend-chip-sub">${formatPct(naoConformePct)} de não conforme no acumulado</div>
    </div>
  `;
}

function renderTrendChart(months) {
  const canvas = document.getElementById('chart-trend');
  const ctx = canvas.getContext('2d');
  const labels = months.map(m => `${MESES_ABR[m.month - 1]}/${String(m.year).slice(2)}`);
  const conforme = months.map(m => Math.max(m.total_produced - m.total_non_conforme, 0));
  const reparo = months.map(m => m.total_repair);
  const segundaQualidade = months.map(m => m.total_second_quality);
  const pctNaoConforme = months.map(m => m.pct_non_conforme);

  renderTrendHighlights(months);
  const avgPctNaoConforme = months.reduce((sum, item) => sum + item.pct_non_conforme, 0) / (months.length || 1);
  const qualityLineColor = getStatusColor(getQualityStatus(avgPctNaoConforme));

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Conforme',
          data: conforme,
          backgroundColor: 'rgba(39, 199, 122, 0.82)',
          borderRadius: 8,
          borderSkipped: false,
          stack: 'production',
        },
        {
          type: 'bar',
          label: 'Reparo',
          data: reparo,
          backgroundColor: 'rgba(239, 159, 39, 0.88)',
          borderRadius: 8,
          borderSkipped: false,
          stack: 'production',
        },
        {
          type: 'bar',
          label: 'Segunda Qualidade',
          data: segundaQualidade,
          backgroundColor: 'rgba(224, 82, 82, 0.82)',
          borderRadius: 8,
          borderSkipped: false,
          stack: 'production',
        },
        {
          type: 'line',
          label: '% Não Conforme',
          data: pctNaoConforme,
          yAxisID: 'y1',
          borderColor: qualityLineColor,
          backgroundColor: `${qualityLineColor}22`,
          fill: false,
          tension: .35,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBackgroundColor: qualityLineColor,
          pointBorderColor: '#0d2040',
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Volume produzido',
            color: '#6888a8',
          },
          ticks: { callback: v => formatNumber(v) },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: '% não conforme',
            color: '#6888a8',
          },
          ticks: { callback: v => formatPct(v) },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 14,
            color: '#c8d8ea',
            font: { family: "'Inter', system-ui, sans-serif", weight: '500', size: 11 },
          },
        },
        tooltip: {
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y;
              if (ctx.dataset.yAxisID === 'y1') {
                return ` ${ctx.dataset.label}: ${formatPct(value)}`;
              }
              return ` ${ctx.dataset.label}: ${formatNumber(value)}`;
            },
          },
        },
      },
    },
  });
}

async function loadTrend() {
  const msgEl = document.getElementById('trend-msg');
  msgEl.hidden = true;
  try {
    const data = await fetchJSON(`/analytics/qualidade_evolucao?year=${state.year}&month=${state.month}`);
    if (!data.months.length || data.months.every(m => m.total_produced === 0)) {
      if (trendChart) { trendChart.destroy(); trendChart = null; }
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Sem produção registrada no período.';
      return;
    }
    renderTrendChart(data.months);
  } catch (err) {
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar a evolução (${escapeHTML(err.message)}).`;
  }
}

async function loadTrend() {
  const msgEl = document.getElementById('trend-msg');
  const highlightsEl = document.getElementById('trend-highlights');
  msgEl.hidden = true;

  try {
    const data = await fetchJSON(`/analytics/qualidade_evolucao?year=${state.year}&month=${state.month}`);
    if (!data.months.length || data.months.every(m => m.total_produced === 0)) {
      if (trendChart) { trendChart.destroy(); trendChart = null; }
      highlightsEl.innerHTML = '';
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Sem produção registrada no período.';
      return;
    }

    renderTrendChart(data.months);
  } catch (err) {
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    highlightsEl.innerHTML = '';
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar a evolução (${escapeHTML(err.message)}).`;
  }
}

function renderMachineChart(machines) {
  const ctx = document.getElementById('chart-machine').getContext('2d');
  const labels = machines.map(m => m.label);
  const data   = machines.map(m => m.pct_non_conforme);
  const colors = machines.map((m, i) => i === 0 ? '#e05252' : '#6888a8');

  if (machineChart) machineChart.destroy();
  machineChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% Não Conforme',
        data,
        backgroundColor: colors,
        borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => formatPct(v) },
        },
        y: {
          ticks: { color: '#c8d8ea', font: { weight: '500' } },
          grid: { display: false },
        },
      },
    },
  });

  const worstEl = document.getElementById('machine-worst');
  if (machines.length && machines[0].total_produced > 0) {
    worstEl.hidden = false;
    worstEl.textContent = `Pior desempenho: ${machines[0].label} (${formatPct(machines[0].pct_non_conforme)})`;
  } else {
    worstEl.hidden = true;
  }
}

async function loadMachines() {
  const msgEl = document.getElementById('machine-msg');
  const worstEl = document.getElementById('machine-worst');
  msgEl.hidden = true;
  try {
    const data = await fetchJSON(`/analytics/qualidade_por_maquina?year=${state.year}&month=${state.month}`);
    if (!data.machines.length) {
      if (machineChart) { machineChart.destroy(); machineChart = null; }
      worstEl.hidden = true;
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Nenhuma máquina configurada.';
      return;
    }
    renderMachineChart(data.machines);
  } catch (err) {
    if (machineChart) { machineChart.destroy(); machineChart = null; }
    worstEl.hidden = true;
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar por máquina (${escapeHTML(err.message)}).`;
  }
}

function renderCompositionChart(current) {
  const ctx = document.getElementById('chart-composition').getContext('2d');
  const conforme = Math.max(current.total_produced - current.total_non_conforme, 0);

  if (compositionChart) compositionChart.destroy();
  compositionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Conforme', 'Reparo', 'Segunda Qualidade'],
      datasets: [{
        data: [conforme, current.total_repair, current.total_second_quality],
        backgroundColor: ['#27C77A', '#EF9F27', '#F0997B'],
        borderColor: '#0d2040',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10, padding: 12,
            font: { family: "'Inter', system-ui, sans-serif", weight: '500', size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (ctx.parsed / total) * 100 : 0;
              return ` ${ctx.label}: ${formatNumber(ctx.parsed)} (${formatPct(pct)})`;
            },
          },
        },
      },
    },
  });
}

async function loadComposition() {
  const msgEl = document.getElementById('composition-msg');
  msgEl.hidden = true;
  try {
    const data = await fetchJSON(`/analytics/qualidade?year=${state.year}&month=${state.month}`);
    if (!data.total_produced) {
      if (compositionChart) { compositionChart.destroy(); compositionChart = null; }
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Sem produção registrada no período.';
      return;
    }
    renderCompositionChart(data);
  } catch (err) {
    if (compositionChart) { compositionChart.destroy(); compositionChart = null; }
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar a composição (${escapeHTML(err.message)}).`;
  }
}

function renderMachineChart(machines) {
  const listEl = document.getElementById('machine-list-bottom');
  const ranked = [...machines]
    .filter(item => item.total_produced > 0)
    .sort((a, b) => b.pct_non_conforme - a.pct_non_conforme);

  listEl.innerHTML = ranked.map((item, index) => {
    const status = getQualityStatus(item.pct_non_conforme);
    const color = status === 'good' ? '#8df0b2' : status === 'warn' ? '#ffd48a' : '#ff9c9c';
    const fill = status === 'good'
      ? 'linear-gradient(90deg, rgba(39,199,122,.88), rgba(138,184,255,.82))'
      : status === 'warn'
        ? 'linear-gradient(90deg, rgba(239,159,39,.9), rgba(245,199,90,.82))'
        : 'linear-gradient(90deg, rgba(224,82,82,.92), rgba(255,140,140,.82))';

    return `
      <div class="machine-item ${index === 0 ? 'top-risk' : ''}">
        <div class="machine-head">
          <div class="machine-left">
            <div class="machine-rank">${index + 1}</div>
            <div class="machine-name">${item.label}</div>
          </div>
          <div class="machine-pct" style="color:${color}">${formatPct(item.pct_non_conforme)}</div>
        </div>
        <div class="machine-bar" aria-label="${item.label}">
          <div class="machine-fill" style="width:${Math.min(item.pct_non_conforme, 100)}%; background:${fill}"></div>
        </div>
        <div class="machine-meta">
          <div>Prod.<strong>${formatNumber(item.total_produced)}</strong></div>
          <div>N.Conf.<strong>${formatNumber(item.total_non_conforme)} · ${formatPct(item.pct_non_conforme)}</strong></div>
          <div>Conf.<strong>${formatNumber(item.total_produced - item.total_non_conforme)}</strong></div>
        </div>
      </div>
    `;
  }).join('');

  const worstEl = document.getElementById('machine-worst-bottom');
  if (ranked.length) {
    worstEl.hidden = false;
    worstEl.style.color = getStatusColor(getQualityStatus(ranked[0].pct_non_conforme));
    worstEl.textContent = `Maior taxa de não conforme: ${ranked[0].label} (${formatPct(ranked[0].pct_non_conforme)})`;
  } else {
    worstEl.hidden = true;
  }
}

function renderCompositionChart(current) {
  const ctx = document.getElementById('chart-composition').getContext('2d');
  const conforme = Math.max(current.total_produced - current.total_non_conforme, 0);
  const total = conforme + current.total_repair + current.total_second_quality;
  const pctConforme = total > 0 ? (conforme / total) * 100 : 0;
  const conformeColor = getStatusColor(getYieldStatus(pctConforme));

  if (compositionChart) compositionChart.destroy();
  compositionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Conforme', 'Reparo', 'Segunda Qualidade'],
      datasets: [{
        data: [conforme, current.total_repair, current.total_second_quality],
        backgroundColor: [conformeColor, '#EF9F27', '#e05252'],
        borderColor: '#0d2040',
        borderWidth: 2,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 12,
            color: '#c8d8ea',
            font: { family: "'Inter', system-ui, sans-serif", weight: '500', size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const chartTotal = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = chartTotal > 0 ? (ctx.parsed / chartTotal) * 100 : 0;
              return ` ${ctx.label}: ${formatNumber(ctx.parsed)} (${formatPct(pct)})`;
            },
          },
        },
      },
    },
  });
}

function renderDailyChart(days) {
  const ctx = document.getElementById('chart-daily').getContext('2d');
  const highlightsEl = document.getElementById('daily-highlights');
  const labels = days.map(item => String(item.day).padStart(2, '0'));
  const produced = days.map(item => item.total_produced);
  const pctNonConforme = days.map(item => item.pct_non_conforme);
  const nonConformeVolume = days.map(item => item.total_non_conforme);
  const avgNonConforme = pctNonConforme.reduce((sum, value) => sum + value, 0) / (pctNonConforme.length || 1);
  const lineColor = getStatusColor(getQualityStatus(avgNonConforme));
  const validDays = days.filter(item => item.total_produced > 0);
  const bestDay = validDays.reduce((best, item) => (!best || item.total_produced > best.total_produced ? item : best), null);
  const worstQualityDay = validDays.reduce((worst, item) => (!worst || item.pct_non_conforme > worst.pct_non_conforme ? item : worst), null);
  const avgProduced = validDays.length
    ? validDays.reduce((sum, item) => sum + item.total_produced, 0) / validDays.length
    : 0;

  highlightsEl.innerHTML = `
    <div class="trend-chip ${bestDay ? 'good' : 'warn'}">
      <div class="trend-chip-label">Media por dia ativo</div>
      <div class="trend-chip-value">${formatNumber(Math.round(avgProduced))}</div>
      <div class="trend-chip-sub">produção média nos dias com registro</div>
    </div>
    <div class="trend-chip ${bestDay ? 'good' : 'warn'}">
      <div class="trend-chip-label">Melhor dia</div>
      <div class="trend-chip-value">${bestDay ? labels[bestDay.day - 1] : '--'}</div>
      <div class="trend-chip-sub">${bestDay ? `${formatNumber(bestDay.total_produced)} peças produzidas` : 'sem dados no período'}</div>
    </div>
    <div class="trend-chip ${worstQualityDay ? getQualityStatus(worstQualityDay.pct_non_conforme) : 'warn'}">
      <div class="trend-chip-label">Maior não conforme</div>
      <div class="trend-chip-value">${worstQualityDay ? formatPct(worstQualityDay.pct_non_conforme) : '--'}</div>
      <div class="trend-chip-sub">${worstQualityDay ? `dia ${String(worstQualityDay.day).padStart(2, '0')}` : 'sem dados no período'}</div>
    </div>
  `;

  const producedGradient = ctx.createLinearGradient(0, 0, 0, 320);
  producedGradient.addColorStop(0, 'rgba(138, 184, 255, 0.95)');
  producedGradient.addColorStop(1, 'rgba(39, 199, 122, 0.42)');

  const lineFillGradient = ctx.createLinearGradient(0, 0, 0, 320);
  lineFillGradient.addColorStop(0, `${lineColor}44`);
  lineFillGradient.addColorStop(1, `${lineColor}05`);

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Produzido no dia',
          data: produced,
          backgroundColor: producedGradient,
          borderColor: 'rgba(138, 184, 255, 0.65)',
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: 'Não Conforme em volume',
          data: nonConformeVolume,
          backgroundColor: 'rgba(224, 82, 82, 0.34)',
          borderColor: 'rgba(224, 82, 82, 0.58)',
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: '% Não Conforme',
          data: pctNonConforme,
          borderColor: lineColor,
          backgroundColor: lineFillGradient,
          fill: true,
          pointBackgroundColor: lineColor,
          pointBorderColor: '#0d2040',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: .38,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Pecas produzidas',
            color: '#6888a8',
          },
          ticks: { callback: value => formatNumber(value) },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: '% não conforme',
            color: '#6888a8',
          },
          ticks: { callback: value => formatPct(value) },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 14,
            color: '#c8d8ea',
            font: { family: "'Inter', system-ui, sans-serif", weight: '500', size: 11 },
          },
        },
        tooltip: {
          displayColors: true,
          callbacks: {
            label: (ctx) => (
              ctx.dataset.yAxisID === 'y1'
                ? ` ${ctx.dataset.label}: ${formatPct(ctx.parsed.y)}`
                : ` ${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)}`
            ),
          },
        },
      },
    },
  });
}

async function loadDaily() {
  const msgEl = document.getElementById('daily-msg');
  const highlightsEl = document.getElementById('daily-highlights');
  msgEl.hidden = true;
  try {
    const data = await fetchJSON(`/analytics/qualidade_diaria?year=${state.year}&month=${state.month}`);
    if (!data.days.length || data.days.every(item => item.total_produced === 0)) {
      if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
      highlightsEl.innerHTML = '';
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Sem produção diária registrada no período.';
      return;
    }
    renderDailyChart(data.days);
  } catch (err) {
    if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
    highlightsEl.innerHTML = '';
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar o ritmo diário (${escapeHTML(err.message)}).`;
  }
}

function renderYieldChart(machines) {
  const listEl = document.getElementById('yield-list-bottom');
  const ranked = machines
    .filter(item => item.total_produced > 0)
    .map(item => ({
      label: item.label,
      totalProduced: item.total_produced,
      totalConforme: item.total_produced - item.total_non_conforme,
      totalNonConforme: item.total_non_conforme,
      pctConforme: ((item.total_produced - item.total_non_conforme) / item.total_produced) * 100,
      pctNonConforme: (item.total_non_conforme / item.total_produced) * 100,
      status: getYieldStatus(((item.total_produced - item.total_non_conforme) / item.total_produced) * 100),
    }))
    .sort((a, b) => b.pctConforme - a.pctConforme);

  listEl.innerHTML = ranked.map((item, index) => {
    const pctConforme = Number(item.pctConforme.toFixed(2));
    const pctNaoConforme = Number(item.pctNonConforme.toFixed(2));
    const pctColor = item.status === 'good' ? '#8df0b2' : item.status === 'warn' ? '#ffd48a' : '#ff9c9c';

    return `
      <div class="yield-item ${index === 0 ? 'top-quality' : ''}">
        <div class="yield-head">
          <div class="yield-left">
            <div class="yield-rank">${index + 1}</div>
            <div class="yield-name">${item.label}</div>
          </div>
          <div class="yield-pct" style="color:${pctColor}">${formatPct(pctConforme)} conforme</div>
        </div>
        <div class="yield-bar" aria-label="${item.label}">
          <div class="yield-good" style="width:${pctConforme}%"></div>
          <div class="yield-bad" style="width:${pctNaoConforme}%"></div>
        </div>
        <div class="yield-meta">
          <div>Produzido<strong>${formatNumber(item.totalProduced)}</strong></div>
          <div>Conforme<strong>${formatNumber(item.totalConforme)} · ${formatPct(pctConforme)}</strong></div>
          <div>Não Conforme<strong>${formatNumber(item.totalNonConforme)} · ${formatPct(pctNaoConforme)}</strong></div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadYield() {
  const msgEl = document.getElementById('yield-msg-bottom');
  const listEl = document.getElementById('yield-list-bottom');
  msgEl.hidden = true;
  try {
    const data = await fetchJSON(`/analytics/qualidade_por_maquina?year=${state.year}&month=${state.month}`);
    if (!data.machines.length || data.machines.every(item => item.total_produced === 0)) {
      listEl.innerHTML = '';
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Sem dados suficientes para montar a composição de qualidade por máquina.';
      return;
    }
    renderYieldChart(data.machines);
    msgEl.hidden = false;
    msgEl.className = 'msg';
    msgEl.textContent = 'Cada barra mostra quanto da produção da máquina saiu conforme e quanto virou não conforme no mês.';
  } catch (err) {
    listEl.innerHTML = '';
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar o aproveitamento (${escapeHTML(err.message)}).`;
  }
}

async function loadMachines() {
  const msgEl = document.getElementById('machine-msg-bottom');
  const worstEl = document.getElementById('machine-worst-bottom');
  const listEl = document.getElementById('machine-list-bottom');
  msgEl.hidden = true;

  try {
    const data = await fetchJSON(`/analytics/qualidade_por_maquina?year=${state.year}&month=${state.month}`);
    if (!data.machines.length || data.machines.every(item => item.total_produced === 0)) {
      listEl.innerHTML = '';
      worstEl.hidden = true;
      msgEl.hidden = false;
      msgEl.className = 'msg';
      msgEl.textContent = 'Sem dados suficientes para montar o ranking de não conforme por máquina.';
      return;
    }

    renderMachineChart(data.machines);
  } catch (err) {
    listEl.innerHTML = '';
    worstEl.hidden = true;
    msgEl.hidden = false;
    msgEl.className = 'msg msg-error';
    msgEl.textContent = `Não foi possível carregar por máquina (${escapeHTML(err.message)}).`;
  }
}

async function loadKPIs() {
  const kpiRow = document.getElementById('kpi-row');
  kpiRow.innerHTML = '<div class="msg">Carregando indicadores...</div>';

  try {
    const [current, comparison, trend] = await Promise.all([
      fetchJSON(`/analytics/qualidade?year=${state.year}&month=${state.month}`),
      fetchJSON(`/analytics/qualidade_comparativo?year=${state.year}&month=${state.month}`),
      fetchJSON(`/analytics/qualidade_evolucao?year=${state.year}&month=${state.month}`),
    ]);

    renderKPIs(current, comparison, trend);
  } catch (err) {
    kpiRow.innerHTML = `<div class="msg msg-error">Não foi possível carregar os indicadores (${escapeHTML(err.message)}).</div>`;
  }
}

function renderKPIs(current, comparison, trend) {
  const kpiRow = document.getElementById('kpi-row');
  const months = (trend?.months || []).filter((item) => item.total_produced > 0);
  const baselineMonths = months.length > 1 ? months.slice(0, -1) : months;
  const conformidade = current.total_produced > 0
    ? ((current.total_produced - current.total_non_conforme) / current.total_produced) * 100
    : 0;

  function averageOf(selector) {
    if (!baselineMonths.length) return 0;
    return baselineMonths.reduce((sum, item) => sum + selector(item), 0) / baselineMonths.length;
  }

  function buildAverageTrend(currentValue, averageValue, direction, formatter, warnThresholdPct) {
    const safeAverage = averageValue > 0 ? averageValue : Math.max(currentValue, 1);
    const deltaPct = ((currentValue - averageValue) / safeAverage) * 100;
    const absDeltaPct = Math.abs(deltaPct);

    if (absDeltaPct <= warnThresholdPct) {
      return {
        arrow: '—',
        color: '#ffd48a',
        border: '#EF9F27',
        sub: `na média mensal (${formatter(averageValue)})`,
      };
    }

    const improved = direction === 'up_better' ? currentValue > averageValue : currentValue < averageValue;
    return {
      arrow: currentValue > averageValue ? '▲' : '▼',
      color: improved ? '#8df0b2' : '#ff9c9c',
      border: improved ? '#27C77A' : '#e05252',
      sub: `${deltaPct > 0 ? '+' : ''}${deltaPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% vs média (${formatter(averageValue)})`,
    };
  }

  const avgProduced = averageOf((item) => item.total_produced);
  const avgRepair = averageOf((item) => item.total_repair);
  const avgSecond = averageOf((item) => item.total_second_quality);
  const avgNonConforme = averageOf((item) => item.total_non_conforme);
  const avgPctNonConforme = averageOf((item) => item.pct_non_conforme);
  const avgConformidade = averageOf((item) => (
    item.total_produced > 0
      ? ((item.total_produced - item.total_non_conforme) / item.total_produced) * 100
      : 0
  ));

  const producedTrend = buildAverageTrend(current.total_produced, avgProduced, 'up_better', (value) => formatNumber(Math.round(value)), 6);
  const repairTrend = buildAverageTrend(current.total_repair, avgRepair, 'down_better', (value) => formatNumber(Math.round(value)), 10);
  const secondTrend = buildAverageTrend(current.total_second_quality, avgSecond, 'down_better', (value) => formatNumber(Math.round(value)), 10);
  const nonConformeTrend = buildAverageTrend(current.total_non_conforme, avgNonConforme, 'down_better', (value) => formatNumber(Math.round(value)), 10);
  const conformidadeTrend = buildAverageTrend(conformidade, avgConformidade, 'up_better', (value) => formatPct(value), 2);

  const tiles = [
    {
      label: 'Produzido',
      value: `${producedTrend.arrow} ${formatNumber(current.total_produced)}`,
      sub: producedTrend.sub,
      color: producedTrend.color,
      border: producedTrend.border,
    },
    {
      label: 'Reparo',
      value: `${repairTrend.arrow} ${formatNumber(current.total_repair)}`,
      sub: `${formatPct(current.pct_repair)} · ${repairTrend.sub}`,
      color: repairTrend.color,
      border: repairTrend.border,
    },
    {
      label: 'Segunda Qualidade',
      value: `${secondTrend.arrow} ${formatNumber(current.total_second_quality)}`,
      sub: `${formatPct(current.pct_second_quality)} · ${secondTrend.sub}`,
      color: secondTrend.color,
      border: secondTrend.border,
    },
    {
      label: 'Não Conforme',
      value: `${nonConformeTrend.arrow} ${formatNumber(current.total_non_conforme)}`,
      sub: `${formatPct(current.pct_non_conforme)} · ${nonConformeTrend.sub}`,
      color: nonConformeTrend.color,
      border: nonConformeTrend.border,
    },
    {
      label: 'Conformidade',
      value: `${conformidadeTrend.arrow} ${formatPct(conformidade)}`,
      sub: conformidadeTrend.sub,
      color: conformidadeTrend.color,
      border: conformidadeTrend.border,
    },
  ];

  kpiRow.innerHTML = tiles.map((tile) => `
    <div class="kpi" style="border-color:${tile.border}55; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${tile.border}14;">
      <div class="kpi-label">${tile.label}</div>
      <div class="kpi-value" style="color:${tile.color};">${tile.value}</div>
      <div class="kpi-sub">${tile.sub}</div>
    </div>
  `).join('') + `
    <div class="kpi" style="border-color:${nonConformeTrend.border}55; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 30px ${nonConformeTrend.border}14;">
      <div class="kpi-label">Referência</div>
      <div class="kpi-value" style="color:${nonConformeTrend.color};">${formatPct(avgPctNonConforme)}</div>
      <div class="kpi-sub">média mensal de não conforme</div>
    </div>
  `;
}

function renderMachineChart(machines) {
  const listEl = document.getElementById('machine-list-bottom');
  const ranked = [...machines]
    .filter((item) => item.total_produced > 0)
    .sort((a, b) => b.pct_non_conforme - a.pct_non_conforme);

  listEl.innerHTML = ranked.map((item, index) => {
    const produced = item.total_produced || 0;
    const repair = item.total_repair || 0;
    const second = item.total_second_quality || 0;
    const nonConforme = item.total_non_conforme || 0;
    const conforme = Math.max(produced - nonConforme, 0);
    const pctNc = produced ? (nonConforme / produced) * 100 : 0;
    const pctConforme = produced ? (conforme / produced) * 100 : 0;
    const pctRepair = produced ? (repair / produced) * 100 : 0;
    const pctSecond = produced ? (second / produced) * 100 : 0;
    const status = getQualityStatus(pctNc);
    const color = status === 'good' ? '#8df0b2' : status === 'warn' ? '#ffd48a' : '#ff9c9c';
    const statusLabel = status === 'good' ? 'Controlado' : status === 'warn' ? 'Atenção' : 'Crítico';
    const fill = status === 'good'
      ? 'linear-gradient(90deg, rgba(39,199,122,.88), rgba(138,184,255,.82))'
      : status === 'warn'
        ? 'linear-gradient(90deg, rgba(239,159,39,.9), rgba(245,199,90,.82))'
        : 'linear-gradient(90deg, rgba(224,82,82,.92), rgba(255,140,140,.82))';

    return `
      <div class="machine-item ${index === 0 ? 'top-risk' : ''}">
        <div class="machine-head">
          <div class="machine-left">
            <div class="machine-rank">${index + 1}</div>
            <div>
              <div class="machine-name">${item.label}</div>
              <div class="machine-mini" style="color:${color}">${statusLabel} · ${formatPct(pctNc)} não conforme</div>
            </div>
          </div>
          <div class="machine-pct">${formatNumber(produced)}</div>
        </div>
        <div class="machine-bar" aria-label="${item.label}">
          <div class="machine-fill" style="width:${Math.min(pctNc, 100)}%; background:${fill}"></div>
        </div>
        <div class="machine-mini">Taxa de perda no período</div>
        <div class="machine-stack" aria-label="Composição da qualidade da máquina ${item.label}">
          <div class="stack-good" style="width:${pctConforme}%"></div>
          <div class="stack-repair" style="width:${pctRepair}%"></div>
          <div class="stack-second" style="width:${pctSecond}%"></div>
        </div>
        <div class="machine-mini">Verde conforme, amarelo reparo, vermelho segunda qualidade</div>
        <div class="machine-meta">
          <div>Produzido<strong>${formatNumber(produced)}</strong></div>
          <div>Conforme<strong>${formatPct(pctConforme)} · ${formatNumber(conforme)}</strong></div>
          <div>Reparo<strong>${formatPct(pctRepair)} · ${formatNumber(repair)}</strong></div>
          <div>2ª Qualidade<strong>${formatPct(pctSecond)} · ${formatNumber(second)}</strong></div>
        </div>
      </div>
    `;
  }).join('');

  const worstEl = document.getElementById('machine-worst-bottom');
  if (ranked.length) {
    worstEl.hidden = false;
    worstEl.style.color = getStatusColor(getQualityStatus(ranked[0].pct_non_conforme));
    worstEl.textContent = `Maior perda no período: ${ranked[0].label} com ${formatPct(ranked[0].pct_non_conforme)} de não conforme.`;
  } else {
    worstEl.hidden = true;
  }

  const msgEl = document.getElementById('machine-msg-bottom');
  msgEl.hidden = false;
  msgEl.className = 'msg';
  msgEl.textContent = 'Cada card mostra a taxa de não conforme da maquina e, logo abaixo, a composicao da producao entre conforme, reparo e segunda qualidade.';
}

function renderMachineChart(machines) {
  const listEl = document.getElementById('machine-list-bottom');
  const worstEl = document.getElementById('machine-worst-bottom');
  const msgEl = document.getElementById('machine-msg-bottom');
  const ranked = [...machines]
    .filter((item) => item.total_produced > 0)
    .sort((a, b) => b.pct_non_conforme - a.pct_non_conforme);

  function renderMachineCard(item, index, tone) {
    const produced = item.total_produced || 0;
    const repair = item.total_repair || 0;
    const second = item.total_second_quality || 0;
    const nonConforme = item.total_non_conforme || 0;
    const conforme = Math.max(produced - nonConforme, 0);
    const pctNc = produced ? (nonConforme / produced) * 100 : 0;
    const pctConforme = produced ? (conforme / produced) * 100 : 0;
    const pctRepair = produced ? (repair / produced) * 100 : 0;
    const pctSecond = produced ? (second / produced) * 100 : 0;
    const status = tone === 'best' ? 'good' : getQualityStatus(pctNc);
    const color = status === 'good' ? '#8df0b2' : status === 'warn' ? '#ffd48a' : '#ff9c9c';
    const statusLabel = tone === 'best'
      ? 'Melhor desempenho'
      : status === 'good' ? 'Controlado' : status === 'warn' ? 'Atenção' : 'Crítico';
    const fill = status === 'good'
      ? 'linear-gradient(90deg, rgba(39,199,122,.88), rgba(138,184,255,.82))'
      : status === 'warn'
        ? 'linear-gradient(90deg, rgba(239,159,39,.9), rgba(245,199,90,.82))'
        : 'linear-gradient(90deg, rgba(224,82,82,.92), rgba(255,140,140,.82))';

    return `
      <div class="machine-item ${tone === 'worst' && index === 0 ? 'top-risk' : ''}">
        <div class="machine-head">
          <div class="machine-left">
            <div class="machine-rank">${index + 1}</div>
            <div class="machine-name">${escapeHTML(item.label)}</div>
          </div>
          <div class="machine-pct">${formatNumber(produced)}</div>
        </div>
        <div class="machine-summary">
          <div class="machine-status" style="color:${color}; border-color:${color}33;">${statusLabel}</div>
          <div class="machine-nc">${formatPct(pctNc)} não conforme</div>
        </div>
        <div class="machine-bars">
          <div class="machine-bar" aria-label="${escapeHTML(item.label)}">
            <div class="machine-fill" style="width:${Math.min(pctNc, 100)}%; background:${fill}"></div>
          </div>
          <div class="machine-stack" aria-label="Composição da qualidade da máquina ${escapeHTML(item.label)}">
            <div class="stack-good" style="width:${pctConforme}%"></div>
            <div class="stack-repair" style="width:${pctRepair}%"></div>
            <div class="stack-second" style="width:${pctSecond}%"></div>
          </div>
        </div>
        <div class="machine-stats">
          <div class="machine-stat">
            <div class="machine-stat-label">Conforme</div>
            <strong>${formatPct(pctConforme)}</strong>
            <span>${formatNumber(conforme)}</span>
          </div>
          <div class="machine-stat">
            <div class="machine-stat-label">Reparo</div>
            <strong>${formatPct(pctRepair)}</strong>
            <span>${formatNumber(repair)}</span>
          </div>
          <div class="machine-stat">
            <div class="machine-stat-label">2ª Qualidade</div>
            <strong>${formatPct(pctSecond)}</strong>
            <span>${formatNumber(second)}</span>
          </div>
        </div>
      </div>
    `;
  }

  const limit = Math.min(3, ranked.length);
  const worstList = ranked.slice(0, limit);
  const bestList = [...ranked].reverse().slice(0, limit);

  listEl.innerHTML = `
    <div class="machine-table">
      <section class="machine-column">
        <div class="machine-column-title">Piores</div>
        <div class="machine-column-list">
          ${worstList.map((item, index) => renderMachineCard(item, index, 'worst')).join('')}
        </div>
      </section>
      <section class="machine-column">
        <div class="machine-column-title">Melhores</div>
        <div class="machine-column-list">
          ${bestList.map((item, index) => renderMachineCard(item, index, 'best')).join('')}
        </div>
      </section>
    </div>
  `;

  worstEl.hidden = true;
  msgEl.hidden = true;
}

function updatePeriodLabel() {
  document.getElementById('period-label').textContent = `${MESES[state.month - 1]} ${state.year}`;
  const effLabel = document.getElementById('eff-period-label');
  if (effLabel) effLabel.textContent = `${MESES[state.month - 1]} ${state.year}`;
  const perfLabel = document.getElementById('perf-period-label');
  if (perfLabel) perfLabel.textContent = `${MESES[state.month - 1]} ${state.year}`;
  const prevLabel = document.getElementById('prev-period-label');
  if (prevLabel) prevLabel.textContent = `${MESES[state.month - 1]} ${state.year}`;
}

function getEfficiencyStatus(pct) {
  const value = Number(pct) || 0;
  if (value >= 100) return 'good';
  if (value >= 92) return 'warn';
  return 'bad';
}

function getEfficiencyColor(pct) {
  const status = getEfficiencyStatus(pct);
  if (status === 'good') return '#27C77A';
  if (status === 'warn') return '#EF9F27';
  return '#e05252';
}

function getQualityTone(pct) {
  const value = Number(pct) || 0;
  if (value >= 98) return '#27C77A';
  if (value >= 95) return '#EF9F27';
  return '#e05252';
}

function summarizeEfficiency(summary) {
  const shifts = summary.machines || [];
  const plannedMinutes = shifts.reduce((sum, item) => {
    const shiftMinutes = item.shift === 2 ? 435 : 525;
    return sum + (summary.business_days * shiftMinutes);
  }, 0);
  const totalDowntime = shifts.reduce((sum, item) => sum + (item.total_downtime || 0), 0);
  const totalProduced = shifts.reduce((sum, item) => sum + (item.total_produced || 0), 0);
  const totalMeta = shifts.reduce((sum, item) => sum + (item.meta1 || 0), 0);
  const availability = plannedMinutes > 0 ? ((plannedMinutes - totalDowntime) / plannedMinutes) * 100 : 0;
  const globalEfficiency = totalMeta > 0 ? (totalProduced / totalMeta) * 100 : 0;
  const productiveMinutes = Math.max(plannedMinutes - totalDowntime, 0);
  const piecesPerHour = productiveMinutes > 0 ? totalProduced / (productiveMinutes / 60) : 0;

  const byMachine = new Map();
  shifts.forEach((item) => {
    const entry = byMachine.get(item.machine_id) || {
      machineId: item.machine_id,
      label: item.label,
      totalProduced: 0,
      meta1: 0,
      totalDowntime: 0,
      shifts: 0,
    };
    entry.totalProduced += item.total_produced || 0;
    entry.meta1 += item.meta1 || 0;
    entry.totalDowntime += item.total_downtime || 0;
    entry.shifts += 1;
    byMachine.set(item.machine_id, entry);
  });

  const machines = [...byMachine.values()].map((item) => ({
    ...item,
    pctMeta: item.meta1 > 0 ? (item.totalProduced / item.meta1) * 100 : 0,
    saldo: item.totalProduced - item.meta1,
    downtimeHours: item.totalDowntime / 60,
  }));

  const rankedByEfficiency = [...machines].sort((a, b) => b.pctMeta - a.pctMeta);
  const rankedByDowntime = [...machines].sort((a, b) => b.totalDowntime - a.totalDowntime);

  return {
    shifts,
    machines,
    totalProduced,
    totalMeta,
    totalDowntime,
    plannedMinutes,
    productiveMinutes,
    availability,
    globalEfficiency,
    piecesPerHour,
    rankedByEfficiency,
    rankedByDowntime,
  };
}

function getPreviousMonthPeriods(year, month, count = 3) {
  const periods = [];
  let currentYear = year;
  let currentMonth = month;

  for (let i = 0; i < count; i += 1) {
    currentMonth -= 1;
    if (currentMonth === 0) {
      currentMonth = 12;
      currentYear -= 1;
    }
    periods.push({ year: currentYear, month: currentMonth });
  }

  return periods;
}

function buildEfficiencyBaseline(currentSummary, historicalSummaries) {
  const validSummaries = historicalSummaries.filter((summary) => summary?.machines?.length);
  if (!validSummaries.length) {
    return null;
  }

  const currentTotal = (currentSummary.machines || []).reduce((sum, item) => sum + (item.total_produced || 0), 0);
  const historicalTotals = validSummaries.map((summary) =>
    (summary.machines || []).reduce((sum, item) => sum + (item.total_produced || 0), 0)
  );
  const averageTotal = historicalTotals.reduce((sum, total) => sum + total, 0) / historicalTotals.length;
  const pct = averageTotal > 0 ? (currentTotal / averageTotal) * 100 : 0;

  return {
    pct,
    averageTotal,
    sampleSize: historicalTotals.length,
  };
}

function renderEfficiencyKPIs(data) {
  const row = document.getElementById('eff-kpi-row');
  const downtimeHours = data.totalDowntime / 60;
  const availabilityColor = getEfficiencyColor(data.availability);
  const efficiencyBase = data.globalEfficiencyBaseline;
  const efficiencyPct = efficiencyBase?.pct ?? data.globalEfficiency;
  const efficiencyColor = getEfficiencyColor(efficiencyPct);
  const efficiencySub = efficiencyBase
    ? `${formatNumber(data.totalProduced)} vs média de ${formatNumber(Math.round(efficiencyBase.averageTotal))} (${efficiencyBase.sampleSize} ${efficiencyBase.sampleSize === 1 ? 'mês' : 'meses'})`
    : `${formatNumber(data.totalProduced)} de ${formatNumber(data.totalMeta)} da meta`;

  const items = [
    {
      label: 'Eficiência global',
      value: formatPct(efficiencyPct),
      sub: efficiencySub,
      color: efficiencyColor,
    },
    {
      label: 'Disponibilidade',
      value: formatPct(data.availability),
      sub: `${downtimeHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h de parada no mês`,
      color: availabilityColor,
    },
    {
      label: 'Peças por hora útil',
      value: Math.round(data.piecesPerHour).toLocaleString('pt-BR'),
      sub: 'ritmo médio sem tempo parado',
      color: '#8ab8ff',
    },
    {
      label: 'Máquinas ativas',
      value: String(data.machines.length),
      sub: `${data.shifts.length} turnos com meta calculada`,
      color: '#d7e2ec',
    },
  ];

  row.innerHTML = items.map((item) => `
    <div class="eff-kpi">
      <div class="eff-kpi-label">${item.label}</div>
      <div class="eff-kpi-value" style="color:${item.color}">${item.value}</div>
      <div class="eff-kpi-sub">${item.sub}</div>
    </div>
  `).join('');
}

function renderEfficiencyMachineList(data) {
  const listEl = document.getElementById('eff-machine-list');
  const msgEl = document.getElementById('eff-machine-msg');

  listEl.innerHTML = data.rankedByEfficiency.map((item) => {
    const color = getEfficiencyColor(item.pctMeta);
    const status = getEfficiencyStatus(item.pctMeta);
    const label = status === 'good' ? 'Acima da meta' : status === 'warn' ? 'Próximo da meta' : 'Abaixo da meta';

    return `
      <div class="eff-machine-row">
        <div class="eff-machine-name">
          <div class="eff-machine-title">${escapeHTML(item.label)}</div>
          <div class="eff-machine-sub">${label}</div>
        </div>
        <div class="eff-progress">
          <div class="eff-progress-value" style="color:${color}">${formatPct(item.pctMeta)}</div>
          <div class="eff-progress-bar">
            <div class="eff-progress-fill" style="width:${Math.min(item.pctMeta, 100)}%; background:${color}"></div>
          </div>
        </div>
        <div class="eff-machine-side">
          <strong>${formatNumber(item.saldo)}</strong>
          <span>saldo vs meta</span>
        </div>
      </div>
    `;
  }).join('');

  msgEl.hidden = true;
}

function renderEfficiencyTables(data) {
  const bestEl = document.getElementById('eff-best-list');
  const downEl = document.getElementById('eff-downtime-list');
  const msgEl = document.getElementById('eff-side-msg');

  bestEl.innerHTML = data.rankedByEfficiency.slice(0, 4).map((item) => `
    <div class="eff-mini-row">
      <div class="eff-mini-name">${escapeHTML(item.label)}</div>
      <div class="eff-mini-value">${formatPct(item.pctMeta)}</div>
    </div>
  `).join('');

  downEl.innerHTML = data.rankedByDowntime.slice(0, 4).map((item) => `
    <div class="eff-mini-row">
      <div class="eff-mini-name">${escapeHTML(item.label)}</div>
      <div class="eff-mini-value">${item.downtimeHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</div>
    </div>
  `).join('');

  msgEl.hidden = true;
}

function renderEfficiencyTurnChart(data) {
  const msgEl = document.getElementById('eff-turn-msg');
  const ctx = document.getElementById('chart-efficiency-turn').getContext('2d');
  const labels = data.shifts.map((item) => `${item.label} · T${item.shift}`);
  const produced = data.shifts.map((item) => item.total_produced || 0);
  const meta = data.shifts.map((item) => item.meta1 || 0);

  if (efficiencyTurnChart) efficiencyTurnChart.destroy();
  efficiencyTurnChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Produzido',
          data: produced,
          backgroundColor: '#8ab8ff',
          borderRadius: 6,
        },
        {
          label: 'Meta',
          data: meta,
          type: 'line',
          borderColor: '#27C77A',
          borderWidth: 2,
          pointBackgroundColor: '#27C77A',
          pointRadius: 3,
          tension: .25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: {
        x: {
          ticks: { maxRotation: 0, minRotation: 0, autoSkip: false, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => formatNumber(value) },
        },
      },
    },
  });
  msgEl.hidden = true;
}

function renderEfficiencyDowntimeChart(data) {
  const msgEl = document.getElementById('eff-downtime-msg');
  const summaryEl = document.getElementById('eff-downtime-summary');
  const rankEl = document.getElementById('eff-downtime-rank');
  const ctx = document.getElementById('chart-efficiency-downtime').getContext('2d');
  const ranked = [...data.rankedByDowntime].sort((a, b) => b.totalDowntime - a.totalDowntime);
  const labels = ranked.map((item) => item.label);
  const hours = ranked.map((item) => Number(item.downtimeHours.toFixed(1)));
  const leader = ranked[0];
  const totalHours = data.totalDowntime / 60;
  const averageHours = ranked.length ? totalHours / ranked.length : 0;
  const rankMarkup = ranked.slice(0, 5).map((item, index) => {
    const share = totalHours > 0 ? (item.downtimeHours / totalHours) * 100 : 0;
    const gap = item.downtimeHours - averageHours;
    const gapClass = gap >= 0 ? 'is-high' : 'is-low';
    const gapLabel = `${gap >= 0 ? '+' : ''}${gap.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h vs media`;

    return `
      <div class="eff-downtime-rank-row">
        <div class="eff-downtime-rank-pos">${index + 1}</div>
        <div class="eff-downtime-rank-machine">
          <strong>${escapeHTML(item.label)}</strong>
          <span>${share.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}% do total de paradas</span>
        </div>
        <div class="eff-downtime-rank-value">${item.downtimeHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</div>
        <div class="eff-downtime-rank-gap ${gapClass}">${gapLabel}</div>
      </div>
    `;
  }).join('');

  summaryEl.innerHTML = leader ? `
    <div class="eff-downtime-highlight">
      <div class="eff-downtime-kicker">Maior impacto no periodo</div>
      <div class="eff-downtime-machine">${escapeHTML(leader.label)}</div>
      <div class="eff-downtime-text">${leader.downtimeHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h acumuladas, ${ranked.length > 1 ? `liderando o ranking de ${ranked.length} maquinas.` : 'unica maquina com registros no periodo.'}</div>
    </div>
    <div class="eff-downtime-stat-stack">
      <div class="eff-downtime-stat">
        <div class="eff-downtime-stat-label">Total no mes</div>
        <div class="eff-downtime-stat-value">${totalHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</div>
        <div class="eff-downtime-stat-sub">Soma de todas as paradas registradas.</div>
      </div>
      <div class="eff-downtime-stat">
        <div class="eff-downtime-stat-label">Media por maquina</div>
        <div class="eff-downtime-stat-value">${averageHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</div>
        <div class="eff-downtime-stat-sub">Base para comparar concentracao das perdas.</div>
      </div>
    </div>
  ` : '';
  rankEl.innerHTML = leader ? `
    <div class="eff-downtime-rank-head">
      <div class="eff-downtime-rank-title">Ranking vs media geral</div>
      <div class="eff-downtime-rank-sub">Top ${Math.min(ranked.length, 5)} maquinas com mais parada no periodo</div>
    </div>
    <div class="eff-downtime-rank-list">${rankMarkup}</div>
  ` : '';
  rankEl.hidden = !leader;

  if (efficiencyDowntimeChart) efficiencyDowntimeChart.destroy();
  efficiencyDowntimeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Horas paradas',
        data: hours,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: chartCtx, chartArea } = chart;
          if (!chartArea) return '#e05252';
          const gradient = chartCtx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          gradient.addColorStop(0, '#7d2028');
          gradient.addColorStop(.55, '#cf4952');
          gradient.addColorStop(1, '#ff8f85');
          return gradient;
        },
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 18,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.raw.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h paradas`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grace: '8%',
          ticks: {
            callback: (value) => `${value} h`,
            font: { size: 10 },
          },
          grid: {
            color: 'rgba(136,160,184,.12)',
            drawBorder: false,
          },
        },
        y: {
          ticks: {
            font: { size: 11, weight: '600' },
            color: '#dce6f0',
          },
          grid: { display: false },
        },
      },
    },
  });
  msgEl.hidden = true;
}

function summarizePerformance(summary, entries) {
  const shiftMap = new Map([
    [1, { shift: 1, label: 'Turno 1', produced: 0, meta: 0, downtime: 0, repair: 0, second: 0 }],
    [2, { shift: 2, label: 'Turno 2', produced: 0, meta: 0, downtime: 0, repair: 0, second: 0 }],
  ]);

  (summary.machines || []).forEach((item) => {
    const shift = shiftMap.get(item.shift);
    if (!shift) return;
    shift.produced += item.total_produced || 0;
    shift.meta += item.meta1 || 0;
    shift.downtime += item.total_downtime || 0;
    shift.repair += item.repair_qty || 0;
    shift.second += item.second_quality_qty || 0;
  });

  const shifts = [...shiftMap.values()].map((item) => {
    const nonConforme = item.repair + item.second;
    const pctMeta = item.meta > 0 ? (item.produced / item.meta) * 100 : 0;
    const qualityPct = item.produced > 0 ? ((item.produced - nonConforme) / item.produced) * 100 : 0;
    return {
      ...item,
      nonConforme,
      pctMeta,
      qualityPct,
      downtimeHours: item.downtime / 60,
      saldo: item.produced - item.meta,
    };
  });

  const dayMap = new Map();
  (entries || []).forEach((item) => {
    const rawDate = item.entry_date ? String(item.entry_date).slice(8, 10) : '--';
    const row = dayMap.get(rawDate) || {
      day: rawDate,
      t1: { produced: 0, repair: 0, second: 0 },
      t2: { produced: 0, repair: 0, second: 0 },
    };
    const bucket = item.shift === 2 ? row.t2 : row.t1;
    bucket.produced += item.quantity || 0;
    bucket.repair += item.repair_qty || 0;
    bucket.second += item.second_quality_qty || 0;
    dayMap.set(rawDate, row);
  });

  const daily = [...dayMap.values()].sort((a, b) => Number(a.day) - Number(b.day));
  const comparativeGap = Math.abs((shifts[0]?.pctMeta || 0) - (shifts[1]?.pctMeta || 0));
  const betterShift = [...shifts].sort((a, b) => b.pctMeta - a.pctMeta)[0] || null;
  const strongestDays = daily
    .map((item) => {
      const bestTurn = item.t1.produced >= item.t2.produced ? 'Turno 1' : 'Turno 2';
      const bestValue = Math.max(item.t1.produced, item.t2.produced);
      return { day: item.day, bestTurn, bestValue };
    })
    .sort((a, b) => b.bestValue - a.bestValue)
    .slice(0, 5);

  return {
    shifts,
    daily,
    comparativeGap,
    betterShift,
    strongestDays,
  };
}

function renderPerformanceKPIs(data) {
  const row = document.getElementById('perf-kpi-row');
  const shift1 = data.shifts.find((item) => item.shift === 1) || null;
  const shift2 = data.shifts.find((item) => item.shift === 2) || null;
  const bestColor = data.betterShift ? getEfficiencyColor(data.betterShift.pctMeta) : '#d7e2ec';

  const items = [
    {
      label: 'Melhor turno',
      value: data.betterShift ? data.betterShift.label : '—',
      sub: data.betterShift ? `${formatPct(data.betterShift.pctMeta)} da meta no mês` : 'Sem base para comparação',
      color: bestColor,
    },
    {
      label: 'Diferença entre turnos',
      value: formatPct(data.comparativeGap),
      sub: 'distância de performance no período',
      color: data.comparativeGap >= 8 ? '#EF9F27' : '#8ab8ff',
    },
    {
      label: 'Qualidade Turno 1',
      value: formatPct(shift1?.qualityPct || 0),
      sub: `${formatNumber(shift1?.produced || 0)} peças produzidas`,
      color: getQualityTone(shift1?.qualityPct || 0),
    },
    {
      label: 'Qualidade Turno 2',
      value: formatPct(shift2?.qualityPct || 0),
      sub: `${formatNumber(shift2?.produced || 0)} peças produzidas`,
      color: getQualityTone(shift2?.qualityPct || 0),
    },
  ];

  row.innerHTML = items.map((item) => `
    <div class="perf-kpi">
      <div class="perf-kpi-label">${item.label}</div>
      <div class="perf-kpi-value" style="color:${item.color}">${item.value}</div>
      <div class="perf-kpi-sub">${item.sub}</div>
    </div>
  `).join('');
}

function renderPerformanceTurnCard(targetId, turn) {
  const el = document.getElementById(targetId);
  const statusColor = getEfficiencyColor(turn.pctMeta);
  const statusLabel = turn.pctMeta >= 100 ? 'Acima da meta' : turn.pctMeta >= 92 ? 'Ritmo atento' : 'Abaixo do esperado';

  el.innerHTML = `
    <article class="perf-turn-card">
      <div class="perf-turn-head">
        <div>
          <div class="perf-turn-title">${escapeHTML(turn.label)}</div>
          <div class="perf-turn-sub">${statusLabel}</div>
        </div>
        <div class="perf-turn-badge" style="color:${statusColor}; border-color:${statusColor}55">${formatPct(turn.pctMeta)}</div>
      </div>

      <div class="perf-turn-metrics">
        <div class="perf-turn-metric">
          <span>Produzido</span>
          <strong>${formatNumber(turn.produced)}</strong>
        </div>
        <div class="perf-turn-metric">
          <span>Meta</span>
          <strong>${formatNumber(turn.meta)}</strong>
        </div>
        <div class="perf-turn-metric">
          <span>Qualidade</span>
          <strong style="color:${getQualityTone(turn.qualityPct)}">${formatPct(turn.qualityPct)}</strong>
        </div>
        <div class="perf-turn-metric">
          <span>Paradas</span>
          <strong>${turn.downtimeHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</strong>
        </div>
      </div>

      <div class="perf-turn-bar">
        <div class="perf-turn-bar-fill" style="width:${Math.min(turn.pctMeta, 100)}%; background:${statusColor}"></div>
      </div>

      <div class="perf-turn-footer">
        <span>Não conforme: ${formatNumber(turn.nonConforme)} peças</span>
        <span>Saldo: ${formatNumber(turn.saldo)}</span>
      </div>
    </article>
  `;
}

function renderPerformanceDailyChart(data) {
  const msgEl = document.getElementById('perf-daily-msg');
  const ctx = document.getElementById('chart-performance-daily').getContext('2d');
  const labels = data.daily.map((item) => item.day);
  const t1 = data.daily.map((item) => item.t1.produced);
  const t2 = data.daily.map((item) => item.t2.produced);

  if (performanceDailyChart) performanceDailyChart.destroy();
  performanceDailyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Turno 1',
          data: t1,
          borderColor: '#8ab8ff',
          backgroundColor: 'rgba(138,184,255,.16)',
          pointBackgroundColor: '#8ab8ff',
          pointRadius: 2.5,
          tension: .3,
          fill: true,
        },
        {
          label: 'Turno 2',
          data: t2,
          borderColor: '#27C77A',
          backgroundColor: 'rgba(39,199,122,.12)',
          pointBackgroundColor: '#27C77A',
          pointRadius: 2.5,
          tension: .3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, minRotation: 0 },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => formatNumber(value) },
          grid: { color: 'rgba(136,160,184,.12)' },
        },
      },
    },
  });
  msgEl.hidden = true;
}

function renderPerformanceQualityChart(data) {
  const msgEl = document.getElementById('perf-quality-msg');
  const ctx = document.getElementById('chart-performance-quality').getContext('2d');
  const labels = data.shifts.map((item) => item.label);
  const quality = data.shifts.map((item) => Number(item.qualityPct.toFixed(2)));
  const downtime = data.shifts.map((item) => Number(item.downtimeHours.toFixed(1)));

  if (performanceQualityChart) performanceQualityChart.destroy();
  performanceQualityChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Paradas (h)',
          data: downtime,
          backgroundColor: ['rgba(138,184,255,.55)', 'rgba(39,199,122,.55)'],
          borderRadius: 8,
          yAxisID: 'y1',
        },
        {
          type: 'line',
          label: 'Qualidade (%)',
          data: quality,
          borderColor: '#f3f6fb',
          pointBackgroundColor: quality.map((value) => getQualityTone(value)),
          pointRadius: 4,
          borderWidth: 2,
          tension: .25,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: {
        x: {
          grid: { display: false },
        },
        y: {
          position: 'left',
          min: Math.max(0, Math.min(...quality, 90) - 2),
          max: 100,
          ticks: { callback: (value) => `${value}%` },
          grid: { color: 'rgba(136,160,184,.12)' },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          ticks: { callback: (value) => `${value} h` },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
  msgEl.hidden = true;
}

function renderPerformanceDays(data) {
  const listEl = document.getElementById('perf-days');
  listEl.innerHTML = data.strongestDays.map((item, index) => `
    <div class="perf-day-row">
      <div class="perf-day-rank">${index + 1}</div>
      <div class="perf-day-copy">
        <strong>Dia ${item.day}</strong>
        <span>${item.bestTurn} liderou o volume no dia</span>
      </div>
      <div class="perf-day-value">${formatNumber(item.bestValue)}</div>
    </div>
  `).join('');
}

async function loadPerformanceAll() {
  const kpiRow = document.getElementById('perf-kpi-row');
  const turn1El = document.getElementById('perf-turn-1');
  const turn2El = document.getElementById('perf-turn-2');
  const daysEl = document.getElementById('perf-days');
  const dailyMsg = document.getElementById('perf-daily-msg');
  const qualityMsg = document.getElementById('perf-quality-msg');
  const daysMsg = document.getElementById('perf-days-msg');

  try {
    const [summary, entries] = await Promise.all([
      fetchJSON(`/api/summary?year=${state.year}&month=${state.month}`),
      fetchJSON(`/api/entries/${state.year}/${state.month}`),
    ]);

    if (!summary.machines?.length) {
      if (performanceDailyChart) {
        performanceDailyChart.destroy();
        performanceDailyChart = null;
      }
      if (performanceQualityChart) {
        performanceQualityChart.destroy();
        performanceQualityChart = null;
      }
      kpiRow.innerHTML = '<div class="msg">Sem dados suficientes para performance por turno no período.</div>';
      turn1El.innerHTML = '';
      turn2El.innerHTML = '';
      daysEl.innerHTML = '';
      dailyMsg.hidden = true;
      qualityMsg.hidden = true;
      daysMsg.hidden = true;
      return;
    }

    const data = summarizePerformance(summary, entries);
    renderPerformanceKPIs(data);

    const shift1 = data.shifts.find((item) => item.shift === 1) || data.shifts[0];
    const shift2 = data.shifts.find((item) => item.shift === 2) || data.shifts[1];
    if (shift1) renderPerformanceTurnCard('perf-turn-1', shift1);
    if (shift2) renderPerformanceTurnCard('perf-turn-2', shift2);

    if (data.daily.length) {
      renderPerformanceDailyChart(data);
      dailyMsg.hidden = true;
    } else {
      if (performanceDailyChart) {
        performanceDailyChart.destroy();
        performanceDailyChart = null;
      }
      dailyMsg.hidden = false;
      dailyMsg.textContent = 'Sem histórico diário para comparar os turnos neste período.';
    }

    renderPerformanceQualityChart(data);
    qualityMsg.hidden = true;
    renderPerformanceDays(data);
    daysMsg.hidden = !data.strongestDays.length;
    if (!data.strongestDays.length) {
      daysMsg.textContent = 'Sem dias suficientes para destacar o ranking do período.';
    }
  } catch (err) {
    if (performanceDailyChart) {
      performanceDailyChart.destroy();
      performanceDailyChart = null;
    }
    if (performanceQualityChart) {
      performanceQualityChart.destroy();
      performanceQualityChart = null;
    }
    kpiRow.innerHTML = `<div class="msg msg-error">Não foi possível carregar a performance por turno (${escapeHTML(err.message)}).</div>`;
    turn1El.innerHTML = '';
    turn2El.innerHTML = '';
    daysEl.innerHTML = '';
    dailyMsg.hidden = true;
    qualityMsg.hidden = true;
    daysMsg.hidden = true;
  }
}

function formatDatePt(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function getYesterdayIso() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMachineShortLabel(machineId) {
  return `MÁQ. ${machineId}`;
}

function getReferencePreviousDay(entries) {
  const dates = [...new Set((entries || []).map((item) => String(item.entry_date)).filter(Boolean))].sort();
  if (!dates.length) return null;

  const today = new Date();
  const isCurrentPeriod = state.year === today.getFullYear() && state.month === (today.getMonth() + 1);
  if (isCurrentPeriod) {
    const yesterdayIso = getYesterdayIso();
    const previousDates = dates.filter((date) => date <= yesterdayIso);
    return previousDates[previousDates.length - 1] || null;
  }

  return dates[dates.length - 1];
}

function summarizePreviousDay(entries, referenceDate) {
  const monthDayMap = new Map();
  (entries || []).forEach((item) => {
    const key = String(item.entry_date);
    const bucket = monthDayMap.get(key) || { produced: 0, nonConforme: 0 };
    bucket.produced += item.quantity || 0;
    bucket.nonConforme += (item.repair_qty || 0) + (item.second_quality_qty || 0);
    monthDayMap.set(key, bucket);
  });

  const activeDays = [...monthDayMap.values()];
  const averageProduced = activeDays.length
    ? activeDays.reduce((sum, item) => sum + item.produced, 0) / activeDays.length
    : 0;
  const averageNonConformePct = activeDays.length
    ? activeDays.reduce((sum, item) => sum + (item.produced > 0 ? (item.nonConforme / item.produced) * 100 : 0), 0) / activeDays.length
    : 0;

  const dayEntries = (entries || []).filter((item) => String(item.entry_date) === referenceDate);
  const totalProduced = dayEntries.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalRepair = dayEntries.reduce((sum, item) => sum + (item.repair_qty || 0), 0);
  const totalSecond = dayEntries.reduce((sum, item) => sum + (item.second_quality_qty || 0), 0);
  const totalNonConforme = totalRepair + totalSecond;
  const totalConforme = Math.max(totalProduced - totalNonConforme, 0);
  const qualityPct = totalProduced > 0 ? (totalConforme / totalProduced) * 100 : 0;
  const nonConformePct = totalProduced > 0 ? (totalNonConforme / totalProduced) * 100 : 0;

  const shiftMap = new Map([
    [1, { shift: 1, label: 'Turno 1', produced: 0, repair: 0, second: 0 }],
    [2, { shift: 2, label: 'Turno 2', produced: 0, repair: 0, second: 0 }],
  ]);
  const machineMap = new Map();

  dayEntries.forEach((item) => {
    const shift = shiftMap.get(item.shift) || shiftMap.get(1);
    shift.produced += item.quantity || 0;
    shift.repair += item.repair_qty || 0;
    shift.second += item.second_quality_qty || 0;

    const machine = machineMap.get(item.machine_id) || {
      machineId: item.machine_id,
      label: getMachineShortLabel(item.machine_id),
      produced: 0,
      repair: 0,
      second: 0,
    };
    machine.produced += item.quantity || 0;
    machine.repair += item.repair_qty || 0;
    machine.second += item.second_quality_qty || 0;
    machineMap.set(item.machine_id, machine);
  });

  const shifts = [...shiftMap.values()].map((item) => {
    const nonConforme = item.repair + item.second;
    const quality = item.produced > 0 ? ((item.produced - nonConforme) / item.produced) * 100 : 0;
    return { ...item, nonConforme, quality };
  });

  const machines = [...machineMap.values()].map((item) => {
    const nonConforme = item.repair + item.second;
    const quality = item.produced > 0 ? ((item.produced - nonConforme) / item.produced) * 100 : 0;
    const nonConformePctByProduced = item.produced > 0 ? (nonConforme / item.produced) * 100 : 0;
    return { ...item, nonConforme, quality, nonConformePctByProduced };
  });

  const bestMachines = [...machines]
    .sort((a, b) => (b.quality - a.quality) || (b.produced - a.produced))
    .slice(0, 4);
  const worstMachines = [...machines]
    .sort((a, b) => (b.nonConformePctByProduced - a.nonConformePctByProduced) || (b.nonConforme - a.nonConforme))
    .slice(0, 4);
  const topMachine = [...machines].sort((a, b) => b.produced - a.produced)[0] || null;

  return {
    referenceDate,
    totalProduced,
    totalRepair,
    totalSecond,
    totalNonConforme,
    totalConforme,
    qualityPct,
    nonConformePct,
    averageProduced,
    averageNonConformePct,
    shifts,
    machines,
    bestMachines,
    worstMachines,
    topMachine,
  };
}

function getPreviousDayDeltaColor(current, baseline, higherIsBetter = true) {
  if (!baseline) return '#8ab8ff';
  const better = higherIsBetter ? current >= baseline : current <= baseline;
  return better ? '#27C77A' : '#e05252';
}

function getPreviousDayRisk(data) {
  if (data.nonConformePct >= 4) {
    return { label: 'Crítico', color: '#e05252', sub: 'não conforme acima do padrão do dia' };
  }
  if (data.nonConformePct >= 2) {
    return { label: 'Atenção', color: '#EF9F27', sub: 'perdas pedem leitura do detalhe por máquina' };
  }
  return { label: 'Controlado', color: '#27C77A', sub: 'qualidade sob controle no fechamento do dia' };
}

function renderPreviousDaySummary(data) {
  const bestShift = [...data.shifts].sort((a, b) => b.quality - a.quality || b.produced - a.produced)[0] || null;
  const risk = getPreviousDayRisk(data);
  const titleEl = document.getElementById('prev-summary-title');
  const textEl = document.getElementById('prev-summary-text');
  const shiftEl = document.getElementById('prev-summary-shift');
  const shiftSubEl = document.getElementById('prev-summary-shift-sub');
  const machineEl = document.getElementById('prev-summary-machines');
  const machineSubEl = document.getElementById('prev-summary-machines-sub');
  const riskEl = document.getElementById('prev-summary-risk');
  const riskSubEl = document.getElementById('prev-summary-risk-sub');

  titleEl.textContent = `Fechamento de ${formatDatePt(data.referenceDate)}`;
  textEl.textContent = `${formatNumber(data.totalProduced)} peças registradas no dia, com ${formatPct(data.qualityPct)} de conformidade geral e ${formatPct(data.nonConformePct)} de não conforme.`;
  shiftEl.textContent = bestShift ? bestShift.label : '—';
  shiftEl.style.color = bestShift ? getQualityTone(bestShift.quality) : '#f3f7fa';
  shiftSubEl.textContent = bestShift
    ? `${formatPct(bestShift.quality)} de conformidade com ${formatNumber(bestShift.produced)} peças`
    : 'Sem comparação disponível';
  machineEl.textContent = String(data.machines.length);
  machineSubEl.textContent = data.topMachine
    ? `${data.topMachine.label} liderou o volume com ${formatNumber(data.topMachine.produced)} peças`
    : 'Sem registros processados';
  riskEl.textContent = risk.label;
  riskEl.style.color = risk.color;
  riskSubEl.textContent = risk.sub;
}

function resetPreviousDaySummary() {
  document.getElementById('prev-summary-title').textContent = 'Aguardando consolidado';
  document.getElementById('prev-summary-text').textContent = 'O módulo vai resumir o último dia útil com produção registrada.';
  document.getElementById('prev-summary-shift').textContent = '—';
  document.getElementById('prev-summary-shift').style.color = '#f3f7fa';
  document.getElementById('prev-summary-shift-sub').textContent = 'Sem comparação disponível';
  document.getElementById('prev-summary-machines').textContent = '—';
  document.getElementById('prev-summary-machines-sub').textContent = 'Sem registros processados';
  document.getElementById('prev-summary-risk').textContent = '—';
  document.getElementById('prev-summary-risk').style.color = '#f3f7fa';
  document.getElementById('prev-summary-risk-sub').textContent = 'Sem leitura de risco';
}

function setPreviousDayReportOpen(isOpen) {
  const modal = document.getElementById('prev-report-modal');
  if (!modal) return;
  modal.hidden = !isOpen;
  document.body.classList.toggle('prev-report-open', isOpen);
}

function buildPreviousDayReportMarkup(data) {
  const risk = getPreviousDayRisk(data);
  const bestShift = [...data.shifts].sort((a, b) => b.quality - a.quality || b.produced - a.produced)[0] || null;
  const volumeList = [...data.machines].sort((a, b) => b.produced - a.produced).slice(0, 4);
  const alertList = [...data.machines]
    .sort((a, b) => (b.nonConformePctByProduced - a.nonConformePctByProduced) || (b.nonConforme - a.nonConforme))
    .slice(0, 4);
  const generatedAt = new Date().toLocaleString('pt-BR');
  const riskClass = risk.label === 'Crítico' ? 'bad' : risk.label === 'Atenção' ? 'warn' : 'good';
  const bestMachine = volumeList[0] || null;
  const maxProduced = Math.max(...data.machines.map((item) => item.produced), 1);
  const maxNonConforme = Math.max(...data.machines.map((item) => item.nonConforme), 1);
  const averageProducedPct = data.averageProduced > 0 ? Math.min((data.totalProduced / data.averageProduced) * 100, 140) : 0;
  const qualityFillClass = data.qualityPct >= 98 ? 'good' : data.qualityPct >= 95 ? 'warn' : 'bad';
  const ncFillClass = data.nonConformePct >= 4 ? 'bad' : data.nonConformePct >= 2 ? 'warn' : 'good';
  const compositionRows = [
    {
      key: 'conforme',
      label: 'Conforme',
      value: data.totalConforme,
      pct: data.totalProduced > 0 ? (data.totalConforme / data.totalProduced) * 100 : 0,
    },
    {
      key: 'reparo',
      label: 'Reparo',
      value: data.totalRepair,
      pct: data.totalProduced > 0 ? (data.totalRepair / data.totalProduced) * 100 : 0,
    },
    {
      key: 'segunda',
      label: 'Segunda qualidade',
      value: data.totalSecond,
      pct: data.totalProduced > 0 ? (data.totalSecond / data.totalProduced) * 100 : 0,
    },
  ];

  return `
    <article class="prev-print-sheet">
      <header class="prev-print-header">
        <div class="prev-print-brand">
          <div class="prev-print-brand-kicker">Painel Analítico</div>
          <div class="prev-print-brand-title">Relatório do Dia Anterior</div>
          <div class="prev-print-brand-text">Consolidado operacional para conferência, impressão e acompanhamento do fechamento diário de produção e qualidade.</div>
        </div>
        <div class="prev-print-meta">
          <div class="prev-print-meta-row">
            <span>Data base</span>
            <strong>${formatDatePt(data.referenceDate)}</strong>
          </div>
          <div class="prev-print-meta-row">
            <span>Risco</span>
            <strong style="color:${risk.color}">${risk.label}</strong>
          </div>
          <div class="prev-print-meta-row">
            <span>Emitido em</span>
            <strong>${generatedAt}</strong>
          </div>
        </div>
      </header>

      <section class="prev-print-overview">
        <div class="prev-print-highlight">
          <div class="prev-print-highlight-kicker">Leitura rápida</div>
          <div class="prev-print-highlight-title">${formatPct(data.qualityPct)} de conformidade no fechamento</div>
          <div class="prev-print-highlight-text">
            ${formatNumber(data.totalProduced)} peças registradas no dia. ${bestShift ? `${escapeHTML(bestShift.label)} liderou os turnos com ${formatPct(bestShift.quality)} de conformidade.` : 'Sem destaque de turno suficiente para comparação.'} ${bestMachine ? `${escapeHTML(bestMachine.label)} puxou o maior volume do dia com ${formatNumber(bestMachine.produced)} peças.` : ''}
          </div>
        </div>
        <div class="prev-print-status-stack">
          <div class="prev-print-status-card ${riskClass}">
            <div class="prev-print-status-label">Risco do dia</div>
            <div class="prev-print-status-value" style="color:${risk.color}">${risk.label}</div>
            <div class="prev-print-status-sub">${risk.sub}</div>
          </div>
          <div class="prev-print-status-card ${data.totalProduced >= data.averageProduced ? 'good' : 'warn'}">
            <div class="prev-print-status-label">Ritmo x média mensal</div>
            <div class="prev-print-status-value">${data.totalProduced >= data.averageProduced ? 'Acima da média' : 'Abaixo da média'}</div>
            <div class="prev-print-status-sub">Dia fechou com ${formatNumber(data.totalProduced)} peças versus média de ${formatNumber(Math.round(data.averageProduced || 0))}.</div>
          </div>
        </div>
      </section>

      <section class="prev-print-block">
        <h4>Resumo do fechamento</h4>
        <div class="prev-print-grid">
          <div class="prev-print-metric">
            <span>Produzido</span>
            <strong>${formatNumber(data.totalProduced)}</strong>
            <div class="prev-print-metric-bar">
              <div class="prev-print-metric-track">
                <div class="prev-print-metric-fill ${data.totalProduced >= data.averageProduced ? 'good' : 'warn'}" style="width:${averageProducedPct}%"></div>
              </div>
              <div class="prev-print-metric-note">Média mensal: ${formatNumber(Math.round(data.averageProduced || 0))}</div>
            </div>
          </div>
          <div class="prev-print-metric">
            <span>Conformidade</span>
            <strong>${formatPct(data.qualityPct)}</strong>
            <div class="prev-print-metric-bar">
              <div class="prev-print-metric-track">
                <div class="prev-print-metric-fill ${qualityFillClass}" style="width:${Math.min(data.qualityPct, 100)}%"></div>
              </div>
              <div class="prev-print-metric-note">${formatNumber(data.totalConforme)} peças conformes</div>
            </div>
          </div>
          <div class="prev-print-metric">
            <span>Não conforme</span>
            <strong>${formatPct(data.nonConformePct)}</strong>
            <div class="prev-print-metric-bar">
              <div class="prev-print-metric-track">
                <div class="prev-print-metric-fill ${ncFillClass}" style="width:${Math.min(data.nonConformePct * 8, 100)}%"></div>
              </div>
              <div class="prev-print-metric-note">${formatNumber(data.totalNonConforme)} peças fora do padrão</div>
            </div>
          </div>
          <div class="prev-print-metric">
            <span>Melhor turno</span>
            <strong>${bestShift ? escapeHTML(bestShift.label) : '—'}</strong>
            <div class="prev-print-metric-bar">
              <div class="prev-print-metric-track">
                <div class="prev-print-metric-fill good" style="width:${bestShift ? Math.min(bestShift.quality, 100) : 0}%"></div>
              </div>
              <div class="prev-print-metric-note">${bestShift ? `${formatPct(bestShift.quality)} de conformidade` : 'Sem comparação disponível'}</div>
            </div>
          </div>
          <div class="prev-print-metric">
            <span>Risco do dia</span>
            <strong style="color:${risk.color}">${risk.label}</strong>
            <div class="prev-print-metric-bar">
              <div class="prev-print-metric-track">
                <div class="prev-print-metric-fill ${riskClass}" style="width:${risk.label === 'Crítico' ? 100 : risk.label === 'Atenção' ? 62 : 28}%"></div>
              </div>
              <div class="prev-print-metric-note">${risk.sub}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="prev-print-block">
        <h4>Turnos do dia</h4>
        <div class="prev-print-turn-cards">
          ${data.shifts.map((shift) => `
            <div class="prev-print-turn-card">
              <div class="prev-print-turn-card-head">
                <strong>${escapeHTML(shift.label)}</strong>
                <span style="color:${getQualityTone(shift.quality)}">${formatPct(shift.quality)}</span>
              </div>
              <div class="prev-print-turn-card-grid">
                <div class="prev-print-turn-mini">
                  <label>Produzido</label>
                  <b>${formatNumber(shift.produced)}</b>
                </div>
                <div class="prev-print-turn-mini">
                  <label>Conforme</label>
                  <b>${formatPct(shift.quality)}</b>
                </div>
                <div class="prev-print-turn-mini">
                  <label>Não conf.</label>
                  <b>${formatNumber(shift.nonConforme)}</b>
                </div>
              </div>
              <div class="prev-print-turn-bars">
                <div class="prev-print-turn-bar-row">
                  <span>Volume</span>
                  <div class="prev-print-turn-bar-track">
                    <div class="prev-print-turn-bar-fill" style="width:${data.totalProduced > 0 ? (shift.produced / data.totalProduced) * 100 : 0}%; background:#8ab8ff"></div>
                  </div>
                  <strong>${data.totalProduced > 0 ? formatPct((shift.produced / data.totalProduced) * 100) : '0,00%'}</strong>
                </div>
                <div class="prev-print-turn-bar-row">
                  <span>Qualidade</span>
                  <div class="prev-print-turn-bar-track">
                    <div class="prev-print-turn-bar-fill" style="width:${Math.min(shift.quality, 100)}%; background:${getQualityTone(shift.quality)}"></div>
                  </div>
                  <strong>${formatPct(shift.quality)}</strong>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="prev-print-block">
        <h4>Composição do fechamento</h4>
        <div class="prev-print-composition">
          <div class="prev-print-stack">
            ${compositionRows.map((row) => `
              <div class="prev-print-stack-segment ${row.key}" style="width:${Math.max(row.pct, row.value > 0 ? 1.6 : 0)}%"></div>
            `).join('')}
          </div>
          <div class="prev-print-legend">
            ${compositionRows.map((row) => `
              <div class="prev-print-legend-row">
                <div class="prev-print-dot ${row.key}"></div>
                <strong>${row.label}</strong>
                <span>${formatPct(row.pct)} · ${formatNumber(row.value)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <section class="prev-print-block">
        <h4>Máquinas do dia</h4>
        <div class="prev-print-machine-summary">
          <div class="prev-print-summary-chip">
            <span>Máquina líder em volume</span>
            <strong>${bestMachine ? `${escapeHTML(bestMachine.label)} · ${formatNumber(bestMachine.produced)} peças` : 'Sem destaque'}</strong>
          </div>
          <div class="prev-print-summary-chip">
            <span>Maior ponto de atenção</span>
            <strong>${alertList[0] ? `${escapeHTML(alertList[0].label)} · ${formatPct(alertList[0].nonConformePctByProduced)} não conforme` : 'Sem ponto crítico'}</strong>
          </div>
        </div>
        <div class="prev-print-split">
          <div class="prev-print-column">
            <div class="prev-print-column-title">Maiores volumes</div>
            <div class="prev-print-list">
            ${volumeList.map((item, index) => `
              <div class="prev-print-item">
                <div class="prev-print-rank">${index + 1}</div>
                <div>
                  <strong>${escapeHTML(item.label)}</strong>
                  <span>${formatPct(item.quality)} de conformidade</span>
                  <div class="prev-print-machine-bar">
                    <div class="prev-print-machine-track">
                      <div class="prev-print-machine-fill" style="width:${(item.produced / maxProduced) * 100}%"></div>
                    </div>
                  </div>
                </div>
                <div class="prev-print-value">
                  <strong>${formatNumber(item.produced)}</strong>
                  <span>${formatPct((item.produced / maxProduced) * 100)} do líder</span>
                </div>
              </div>
            `).join('')}
            </div>
          </div>
          <div class="prev-print-column">
            <div class="prev-print-column-title">Maiores perdas</div>
            <div class="prev-print-list">
            ${alertList.map((item, index) => `
              <div class="prev-print-item">
                <div class="prev-print-rank">${index + 1}</div>
                <div>
                  <strong>${escapeHTML(item.label)}</strong>
                  <span>${formatPct(item.nonConformePctByProduced)} não conforme</span>
                  <div class="prev-print-machine-bar">
                    <div class="prev-print-machine-track">
                      <div class="prev-print-machine-fill risk" style="width:${(item.nonConforme / maxNonConforme) * 100}%"></div>
                    </div>
                  </div>
                </div>
                <div class="prev-print-value">
                  <strong>${formatNumber(item.nonConforme)}</strong>
                  <span>${formatPct((item.nonConforme / maxNonConforme) * 100)} do topo de perda</span>
                </div>
              </div>
            `).join('')}
            </div>
          </div>
        </div>
      </section>

      <footer class="prev-print-footer">
        <div class="prev-print-note">
          Documento gerado a partir do módulo de indicadores do dia anterior, com base no último dia válido do período selecionado.
        </div>
        <div class="prev-print-signature">
          <div class="prev-print-signature-line"></div>
          <span>Responsável pela conferência</span>
        </div>
      </footer>
    </article>
  `;
}

function renderPreviousDayReportPreview() {
  const previewEl = document.getElementById('prev-report-preview');
  const rootEl = document.getElementById('print-previous-day-root');
  const subEl = document.getElementById('prev-report-sub');

  if (!previousDayReportData) {
    previewEl.innerHTML = '<div class="msg">Carregue os indicadores do dia anterior para gerar a prévia do relatório.</div>';
    rootEl.innerHTML = '';
    subEl.textContent = 'Gere a prévia para revisar antes de imprimir.';
    return;
  }

  const markup = buildPreviousDayReportMarkup(previousDayReportData);
  previewEl.innerHTML = markup;
  rootEl.innerHTML = markup;
  subEl.textContent = `Prévia pronta para impressão com base em ${formatDatePt(previousDayReportData.referenceDate)}.`;
}

function printPreviousDayReport() {
  if (!previousDayReportData) return;
  renderPreviousDayReportPreview();
  document.body.classList.add('print-previous-day-report');
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove('print-previous-day-report');
  }, 150);
}

function initPreviousDayReportActions() {
  const previewBtn = document.getElementById('prev-preview-btn');
  const closeBtn = document.getElementById('prev-close-preview-btn');
  const printBtn = document.getElementById('prev-print-btn');
  const modal = document.getElementById('prev-report-modal');
  const panel = document.getElementById('prev-report-panel');
  if (!previewBtn || !closeBtn || !printBtn) return;

  previewBtn.addEventListener('click', () => {
    renderPreviousDayReportPreview();
    setPreviousDayReportOpen(true);
  });
  closeBtn.addEventListener('click', () => {
    setPreviousDayReportOpen(false);
  });
  printBtn.addEventListener('click', () => {
    printPreviousDayReport();
  });
  if (modal && panel) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        setPreviousDayReportOpen(false);
      }
    });
    panel.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setPreviousDayReportOpen(false);
    }
  });
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-previous-day-report');
  });
}

function renderPreviousDayMetrics(data) {
  const row = document.getElementById('prev-metrics');
  const items = [
    {
      label: 'Produzido',
      value: formatNumber(data.totalProduced),
      sub: `média do mês: ${formatNumber(Math.round(data.averageProduced || 0))}`,
      color: getPreviousDayDeltaColor(data.totalProduced, data.averageProduced, true),
    },
    {
      label: 'Conformidade',
      value: formatPct(data.qualityPct),
      sub: `${formatNumber(data.totalConforme)} peças conformes`,
      color: getQualityTone(data.qualityPct),
    },
    {
      label: 'Não Conforme',
      value: formatPct(data.nonConformePct),
      sub: `${formatNumber(data.totalNonConforme)} peças fora do padrão`,
      color: getPreviousDayDeltaColor(data.nonConformePct, data.averageNonConformePct, false),
    },
  ];

  row.innerHTML = items.map((item) => `
    <div class="prev-metric">
      <div class="prev-metric-label">${item.label}</div>
      <div class="prev-metric-value" style="color:${item.color}">${item.value}</div>
      <div class="prev-metric-sub">${item.sub}</div>
    </div>
  `).join('');
}

function renderPreviousDayTurns(data) {
  const listEl = document.getElementById('prev-turn-table');
  const msgEl = document.getElementById('prev-turn-msg');
  listEl.innerHTML = data.shifts.map((shift) => {
    const share = data.totalProduced > 0 ? (shift.produced / data.totalProduced) * 100 : 0;
    const qualityColor = getQualityTone(shift.quality);
    return `
      <div class="prev-turn-item">
        <div class="prev-turn-name">
          <strong>${shift.label}</strong>
          <span>${formatPct(share)} do volume do dia</span>
        </div>
        <div class="prev-turn-cell"><strong>${formatNumber(shift.produced)}</strong></div>
        <div class="prev-turn-cell" style="color:${qualityColor}"><strong>${formatPct(shift.quality)}</strong></div>
        <div class="prev-turn-cell">${formatNumber(shift.nonConforme)}</div>
      </div>
    `;
  }).join('');
  msgEl.hidden = true;
}

function renderPreviousDayCompositionChart(data) {
  const ctx = document.getElementById('chart-previous-day-composition').getContext('2d');
  const msgEl = document.getElementById('prev-composition-msg');
  const mixEl = document.getElementById('prev-mix-list');
  const rows = [
    { label: 'Conforme', value: data.totalConforme, pct: data.totalProduced > 0 ? (data.totalConforme / data.totalProduced) * 100 : 0, color: '#27C77A' },
    { label: 'Reparo', value: data.totalRepair, pct: data.totalProduced > 0 ? (data.totalRepair / data.totalProduced) * 100 : 0, color: '#EF9F27' },
    { label: 'Segunda Qualidade', value: data.totalSecond, pct: data.totalProduced > 0 ? (data.totalSecond / data.totalProduced) * 100 : 0, color: '#e05252' },
  ];
  if (previousDayCompositionChart) previousDayCompositionChart.destroy();
  previousDayCompositionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Fechamento'],
      datasets: rows.map((row) => ({
        label: row.label,
        data: [row.value],
        backgroundColor: row.color,
        borderRadius: 6,
        stack: 'day',
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatNumber(context.raw)}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: (value) => formatNumber(value) },
          grid: { color: 'rgba(136,160,184,.12)' },
        },
      },
    },
  });
  mixEl.innerHTML = rows.map((row) => `
    <div class="prev-mix-row">
      <div class="prev-mix-copy">
        <strong style="color:${row.color}">${row.label}</strong>
        <span>${formatPct(row.pct)} do total do dia</span>
      </div>
      <div class="prev-mix-value">${formatNumber(row.value)}</div>
    </div>
  `).join('');
  msgEl.hidden = true;
}

function renderPreviousDayMachineLists(data) {
  const volumeEl = document.getElementById('prev-volume-list');
  const alertEl = document.getElementById('prev-alert-list');
  const volumeList = [...data.machines].sort((a, b) => b.produced - a.produced).slice(0, 5);
  const alertList = [...data.machines]
    .sort((a, b) => (b.nonConformePctByProduced - a.nonConformePctByProduced) || (b.nonConforme - a.nonConforme))
    .slice(0, 5);

  function getMachineRiskPill(item) {
    if (item.nonConformePctByProduced >= 4) {
      return { cls: 'bad', label: `${formatPct(item.nonConformePctByProduced)} não conf.` };
    }
    if (item.nonConformePctByProduced >= 2) {
      return { cls: 'warn', label: `${formatPct(item.nonConformePctByProduced)} não conf.` };
    }
    return { cls: 'good', label: `${formatPct(item.nonConformePctByProduced)} não conf.` };
  }

  volumeEl.innerHTML = volumeList.map((item, index) => `
    <div class="prev-machine-row">
      <div class="prev-machine-rank">${index + 1}</div>
      <div class="prev-machine-copy">
        <strong>${escapeHTML(item.label)}</strong>
        <span>Maior volume do dia com ${formatPct(item.quality)} de conformidade</span>
        <div class="prev-machine-meta">
          <span class="prev-machine-pill ${getMachineRiskPill(item).cls}">${getMachineRiskPill(item).label}</span>
          <span class="prev-machine-pill">${formatNumber(item.nonConforme)} peças perdidas</span>
        </div>
      </div>
      <div class="prev-machine-value">
        <strong>${formatNumber(item.produced)}</strong>
        <span>produzidas</span>
      </div>
    </div>
  `).join('');

  alertEl.innerHTML = alertList.map((item, index) => `
    <div class="prev-machine-row is-risk">
      <div class="prev-machine-rank">${index + 1}</div>
      <div class="prev-machine-copy">
        <strong>${escapeHTML(item.label)}</strong>
        <span>Concentrou mais perdas no fechamento do dia</span>
        <div class="prev-machine-meta">
          <span class="prev-machine-pill ${getMachineRiskPill(item).cls}">${getMachineRiskPill(item).label}</span>
          <span class="prev-machine-pill">${formatPct(item.quality)} conformidade</span>
        </div>
      </div>
      <div class="prev-machine-value">
        <strong>${formatNumber(item.nonConforme)}</strong>
        <span>não conformes</span>
      </div>
    </div>
  `).join('');
}

function renderPreviousDayMachineChart(data) {
  const ctx = document.getElementById('chart-previous-day-machines').getContext('2d');
  const msgEl = document.getElementById('prev-machine-chart-msg');
  const ranked = [...data.machines].sort((a, b) => b.produced - a.produced);
  if (previousDayMachineChart) previousDayMachineChart.destroy();
  previousDayMachineChart = new Chart(ctx, {
    data: {
      labels: ranked.map((item) => item.label),
      datasets: [
        {
          type: 'bar',
          label: 'Produzido',
          data: ranked.map((item) => item.produced),
          backgroundColor: 'rgba(138,184,255,.72)',
          borderColor: 'rgba(138,184,255,.95)',
          borderWidth: 1,
          borderRadius: 8,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Não conforme (%)',
          data: ranked.map((item) => Number(item.nonConformePctByProduced.toFixed(2))),
          borderColor: '#e05252',
          backgroundColor: 'rgba(224,82,82,.18)',
          pointBackgroundColor: ranked.map((item) => getPreviousDayRisk({ nonConformePct: item.nonConformePctByProduced }).color),
          pointRadius: 4,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: .28,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.dataset.yAxisID === 'y1') {
                return `${context.dataset.label}: ${context.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
              }
              return `${context.dataset.label}: ${formatNumber(context.raw)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => formatNumber(value) },
          grid: { color: 'rgba(136,160,184,.12)' },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          max: 12,
          ticks: { callback: (value) => `${value}%` },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
  msgEl.hidden = true;
}

async function loadPreviousDayAll() {
  const metricsRow = document.getElementById('prev-metrics');
  const refNote = document.getElementById('prev-ref-note');
  const turnList = document.getElementById('prev-turn-table');
  const volumeList = document.getElementById('prev-volume-list');
  const alertList = document.getElementById('prev-alert-list');
  const mixList = document.getElementById('prev-mix-list');

  try {
    const entries = await fetchJSON(`/api/entries/${state.year}/${state.month}`);
    const referenceDate = getReferencePreviousDay(entries);

    if (!referenceDate) {
      if (previousDayCompositionChart) {
        previousDayCompositionChart.destroy();
        previousDayCompositionChart = null;
      }
      if (previousDayMachineChart) {
        previousDayMachineChart.destroy();
        previousDayMachineChart = null;
      }
      previousDayReportData = null;
      resetPreviousDaySummary();
      renderPreviousDayReportPreview();
      setPreviousDayReportOpen(false);
      metricsRow.innerHTML = '<div class="msg">Sem dados suficientes para montar o consolidado do dia anterior neste período.</div>';
      refNote.textContent = '';
      turnList.innerHTML = '';
      volumeList.innerHTML = '';
      alertList.innerHTML = '';
      mixList.innerHTML = '';
      return;
    }

    const data = summarizePreviousDay(entries, referenceDate);
    const yesterdayIso = getYesterdayIso();
    const today = new Date();
    const isCurrentPeriod = state.year === today.getFullYear() && state.month === (today.getMonth() + 1);
    refNote.textContent = isCurrentPeriod
      ? (referenceDate === yesterdayIso
          ? `Base real de ontem: ${formatDatePt(referenceDate)}.`
          : `Sem registro em ontem; exibindo o último dia com dados: ${formatDatePt(referenceDate)}.`)
      : `Último dia com dados do período selecionado: ${formatDatePt(referenceDate)}.`;

    previousDayReportData = data;
    renderPreviousDaySummary(data);
    renderPreviousDayMetrics(data);
    renderPreviousDayTurns(data);
    renderPreviousDayCompositionChart(data);
    renderPreviousDayMachineLists(data);
    renderPreviousDayMachineChart(data);
    renderPreviousDayReportPreview();
  } catch (err) {
    if (previousDayCompositionChart) {
      previousDayCompositionChart.destroy();
      previousDayCompositionChart = null;
    }
    if (previousDayMachineChart) {
      previousDayMachineChart.destroy();
      previousDayMachineChart = null;
    }
    previousDayReportData = null;
    resetPreviousDaySummary();
    renderPreviousDayReportPreview();
    setPreviousDayReportOpen(false);
    metricsRow.innerHTML = `<div class="msg msg-error">Não foi possível carregar os indicadores do dia anterior (${escapeHTML(err.message)}).</div>`;
    refNote.textContent = '';
    turnList.innerHTML = '';
    volumeList.innerHTML = '';
    alertList.innerHTML = '';
    mixList.innerHTML = '';
  }
}

async function loadEfficiencyAll() {
  try {
    const summary = await fetchJSON(`/api/summary?year=${state.year}&month=${state.month}`);
    if (!summary.machines?.length) {
      document.getElementById('eff-kpi-row').innerHTML = '<div class="msg">Sem dados suficientes para eficiência no período.</div>';
      document.getElementById('eff-machine-list').innerHTML = '';
      document.getElementById('eff-best-list').innerHTML = '';
      document.getElementById('eff-downtime-list').innerHTML = '';
      return;
    }

    const data = summarizeEfficiency(summary);
    const previousPeriods = getPreviousMonthPeriods(state.year, state.month, 3);
    const historicalResults = await Promise.allSettled(
      previousPeriods.map((period) => fetchJSON(`/api/summary?year=${period.year}&month=${period.month}`))
    );
    const historicalSummaries = historicalResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    data.globalEfficiencyBaseline = buildEfficiencyBaseline(summary, historicalSummaries);

    renderEfficiencyKPIs(data);
    renderEfficiencyMachineList(data);
    renderEfficiencyTables(data);
    renderEfficiencyTurnChart(data);
    renderEfficiencyDowntimeChart(data);
  } catch (err) {
    document.getElementById('eff-kpi-row').innerHTML = `<div class="msg msg-error">Não foi possível carregar a eficiência (${escapeHTML(err.message)}).</div>`;
    document.getElementById('eff-machine-list').innerHTML = '';
    document.getElementById('eff-best-list').innerHTML = '';
    document.getElementById('eff-downtime-list').innerHTML = '';
  }
}

async function loadAll() {
  updatePeriodLabel();
  if (state.module === 'quality') {
    await Promise.allSettled([loadKPIs(), loadTrend(), loadMachines(), loadComposition(), loadDaily()]);
    return;
  }
  if (state.module === 'efficiency') {
    await loadEfficiencyAll();
    return;
  }
  if (state.module === 'performance') {
    await loadPerformanceAll();
    return;
  }
  if (state.module === 'previous-day') {
    await loadPreviousDayAll();
  }
}

/*  Tema — mesma lógica e mesma chave de localStorage do dashboard TV  */
function toggleTheme() {
  const root = document.documentElement;
  const btn  = document.getElementById('theme-btn');
  const isLight = root.classList.toggle('light');
  btn.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('pantex-theme', isLight ? 'light' : 'dark');
}

(function () {
  if (localStorage.getItem('pantex-theme') === 'light') {
    document.documentElement.classList.add('light');
    document.getElementById('theme-btn').textContent = '☀️';
  }
})();

populateSelectors();
initPreviousDayReportActions();
renderModuleRail();
syncModuleView();
loadAll();

