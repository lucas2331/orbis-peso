import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Calendar,
  Scale,
  Target,
  History,
  Plus,
  Save,
  X,
  Trash2,
  TrendingDown,
  Trophy,
  Gauge,
  BarChart3,
  Sparkles,
  Download,
  Upload,
} from "lucide-react";
import "./App.css";

const WEIGHTS_API_URL = "/api/pesos";
const CONFIG_API_URL = "/api/config";
const WINDOWS = [7, 10, 15, 20, 30];

function today() {
  return new Date().toISOString().split("T")[0];
}

function toDate(date) {
  return new Date(`${date}T12:00:00`);
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatKg(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value)} kg`;
}

function formatDeltaKg(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value > 0) return `-${formatNumber(Math.abs(value))} kg`;
  if (value < 0) return `+${formatNumber(Math.abs(value))} kg`;
  return `${formatNumber(0)} kg`;
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(toDate(date));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(toDate(date));
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(toDate(date));
}

function getMonthKey(date) {
  return date.slice(0, 7);
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((toDate(end) - toDate(start)) / 86400000));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildAnalytics(entries, goal) {
  const sorted = [...entries].sort((a, b) => toDate(a.date) - toDate(b.date));

  if (!sorted.length) {
    return {
      sorted,
      first: null,
      last: null,
      current: null,
      initial: null,
      totalLost: null,
      weeklyAverage: null,
      remaining: null,
      progress: 0,
      currentMonthLost: null,
      monthlyLosses: [],
      averageWindows: WINDOWS.map((days) => ({ days, value: null })),
      bestMonth: null,
      biggestDrop: null,
      lowestWeight: null,
      chartDomain: ["auto", "auto"],
      showGoalLine: false,
      days: 0,
      longestDropStreak: { count: 0, label: "Sem sequência suficiente" },
      currentVsPreviousMonth: { label: "Sem mês anterior para comparar" },
      last30DaysLoss: { value: null, label: "Dados insuficientes" },
      goalProjection: { days: null, months: null, label: "Ritmo insuficiente para projetar" },
      bestWindow: { days: null, value: null, label: "Dados insuficientes" },
      currentMonthAverage: { monthLabel: null, value: null, label: "Sem dados" },
      trend: { type: "stable", value: 0, label: "Estabilidade" },
    };
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const current = last.weight;
  const initial = first.weight;
  const days = daysBetween(first.date, last.date);
  const totalLost = initial - current;
  const dailyAverage = totalLost / days;
  const weeklyAverage = dailyAverage * 7;
  const goalNumber = Number(goal);
  const remaining = goalNumber ? current - goalNumber : null;

  const progress =
    goalNumber && initial > goalNumber
      ? clamp(((initial - current) / (initial - goalNumber)) * 100, 0, 100)
      : 0;

  const monthlyMap = new Map();

  sorted.forEach((entry) => {
    const key = getMonthKey(entry.date);

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, []);
    }

    monthlyMap.get(key).push(entry);
  });

  const monthlyLosses = Array.from(monthlyMap.entries()).map(([key, values]) => {
    const monthFirst = values[0];
    const monthLast = values[values.length - 1];

    return {
      key,
      label: formatMonthLabel(`${key}-01`),
      value: monthFirst.weight - monthLast.weight,
      first: monthFirst,
      last: monthLast,
    };
  });

  const currentMonthKey = getMonthKey(last.date);
  const currentMonthLost =
    monthlyLosses.find((item) => item.key === currentMonthKey)?.value ?? null;

  const bestMonth = monthlyLosses.reduce((best, item) => {
    if (!best) return item;
    return item.value > best.value ? item : best;
  }, null);

  let biggestDrop = null;

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const currentEntry = sorted[i];
    const value = previous.weight - currentEntry.weight;

    if (!biggestDrop || value > biggestDrop.value) {
      biggestDrop = {
        value,
        from: previous,
        to: currentEntry,
      };
    }
  }

  const lowestWeight = sorted.reduce((lowest, entry) => {
    if (!lowest) return entry;
    return entry.weight < lowest.weight ? entry : lowest;
  }, null);

  const averageWindows = WINDOWS.map((windowDays) => ({
    days: windowDays,
    value: dailyAverage * windowDays,
  }));

  const weights = sorted.map((item) => item.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const padding = Math.max(1, (maxWeight - minWeight) * 0.12);

  const chartDomain = [
    Math.floor((minWeight - padding) * 10) / 10,
    Math.ceil((maxWeight + padding) * 10) / 10,
  ];

  const showGoalLine =
    goalNumber &&
    goalNumber >= chartDomain[0] &&
    goalNumber <= chartDomain[1];

  let longestDropStreak = { count: 0, label: "Sem sequência suficiente" };
  {
    let currentStreak = 0;
    let maxStreak = 0;

    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].weight < sorted[i - 1].weight) {
        currentStreak += 1;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    if (maxStreak > 0) {
      longestDropStreak = {
        count: maxStreak,
        label: `${maxStreak} ${maxStreak === 1 ? "queda consecutiva" : "quedas consecutivas"}`,
      };
    }
  }

  let currentVsPreviousMonth = { label: "Sem mês anterior para comparar" };
  {
    if (monthlyLosses.length >= 2) {
      const current = monthlyLosses[monthlyLosses.length - 1];
      const previous = monthlyLosses[monthlyLosses.length - 2];
      const percent = Math.round(((current.value - previous.value) / previous.value) * 100);
      const direction = percent >= 0 ? "acima" : "abaixo";

      currentVsPreviousMonth = {
        currentLabel: current.label,
        previousLabel: previous.label,
        currentValue: current.value,
        previousValue: previous.value,
        percent: percent,
        label: `${Math.abs(percent)}% ${direction} do mês anterior`,
      };
    }
  }

  let last30DaysLoss = { value: null, label: "Dados insuficientes" };
  {
    const thirtyDaysAgo = toDate(last.date).getTime() - 30 * 86400000;
    let referenceEntry = first;

    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const entryTime = toDate(sorted[i].date).getTime();
      if (entryTime <= thirtyDaysAgo) {
        referenceEntry = sorted[i];
        break;
      }
    }

    const loss = referenceEntry.weight - current;
    if (loss > 0) {
      last30DaysLoss = {
        value: loss,
        label: `-${formatNumber(loss)} kg nos últimos 30 dias`,
      };
    }
  }

  let goalProjection = { days: null, months: null, label: "Ritmo insuficiente para projetar" };
  {
    if (remaining !== null && remaining > 0 && last30DaysLoss.value !== null && last30DaysLoss.value > 0) {
      const thirtyDaysAgo = toDate(last.date).getTime() - 30 * 86400000;
      let dayCount = 30;

      for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const entryTime = toDate(sorted[i].date).getTime();
        if (entryTime <= thirtyDaysAgo) {
          dayCount = Math.max(1, Math.round((toDate(last.date).getTime() - entryTime) / 86400000));
          break;
        }
      }

      const dailyRate = last30DaysLoss.value / dayCount;
      const daysToGoal = Math.ceil(remaining / dailyRate);
      const monthsToGoal = Math.round(daysToGoal / 30.44);

      goalProjection = {
        days: daysToGoal,
        months: monthsToGoal,
        label: `Meta em aproximadamente ${monthsToGoal} ${monthsToGoal === 1 ? "mês" : "meses"}`,
      };
    } else if (remaining !== null && remaining <= 0) {
      goalProjection = {
        days: 0,
        months: 0,
        label: "Meta já alcançada",
      };
    }
  }

  let bestWindow = { days: null, value: null, label: "Dados insuficientes" };
  {
    let bestLoss = null;
    let bestPeriod = null;

    for (const windowDays of WINDOWS) {
      for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const endEntry = sorted[i];
        const endTime = toDate(endEntry.date).getTime();
        const targetTime = endTime - windowDays * 86400000;

        let startEntry = null;
        let closestDistance = Infinity;

        for (let j = i - 1; j >= 0; j -= 1) {
          const entryTime = toDate(sorted[j].date).getTime();
          if (entryTime <= endTime) {
            const distance = Math.abs(endTime - entryTime - windowDays * 86400000);
            if (distance < closestDistance && entryTime <= targetTime) {
              startEntry = sorted[j];
              closestDistance = distance;
            }
          }
        }

        if (startEntry) {
          const loss = startEntry.weight - endEntry.weight;
          if (loss > 0 && (!bestLoss || loss > bestLoss)) {
            bestLoss = loss;
            bestPeriod = {
              days: windowDays,
              value: loss,
              from: startEntry.date,
              to: endEntry.date,
            };
          }
        }
      }
    }

    if (bestPeriod) {
      bestWindow = {
        ...bestPeriod,
        label: `${bestPeriod.days} dias · -${formatNumber(bestPeriod.value)} kg`,
      };
    }
  }

  let currentMonthAverage = { monthLabel: null, value: null, label: "Sem dados" };
  {
    const currentMonthData = monthlyLosses.find((item) => item.key === currentMonthKey);
    if (currentMonthData) {
      const monthEntries = sorted.filter((entry) => getMonthKey(entry.date) === currentMonthKey);
      if (monthEntries.length > 0) {
        const avgWeight = monthEntries.reduce((sum, entry) => sum + entry.weight, 0) / monthEntries.length;
        currentMonthAverage = {
          monthLabel: currentMonthData.label,
          value: avgWeight,
          label: `Média de ${currentMonthData.label}: ${formatNumber(avgWeight)} kg`,
        };
      }
    }
  }

  let trend = { type: "stable", value: 0, label: "Estabilidade" };
  {
    const recentCount = Math.min(5, sorted.length);
    if (recentCount >= 2) {
      const recentEntries = sorted.slice(sorted.length - recentCount);
      const delta = recentEntries[0].weight - recentEntries[recentCount - 1].weight;

      if (delta >= 2.0) {
        trend = { type: "strong_down", value: delta, label: "Forte queda" };
      } else if (delta >= 0.7) {
        trend = { type: "moderate_down", value: delta, label: "Queda moderada" };
      } else if (delta > -0.5 && delta < 0.7) {
        trend = { type: "stable", value: delta, label: "Estabilidade" };
      } else {
        trend = { type: "up_alert", value: delta, label: "Alerta de subida" };
      }
    }
  }

  return {
    sorted,
    first,
    last,
    current,
    initial,
    totalLost,
    weeklyAverage,
    remaining,
    progress,
    currentMonthLost,
    monthlyLosses,
    averageWindows,
    bestMonth,
    biggestDrop,
    lowestWeight,
    chartDomain,
    showGoalLine,
    days,
    longestDropStreak,
    currentVsPreviousMonth,
    last30DaysLoss,
    goalProjection,
    bestWindow,
    currentMonthAverage,
    trend,
  };
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("160");
  const [goalSaved, setGoalSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeView, setActiveView] = useState("chart");
  const [error, setError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const importInputRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setError("");

      const [weightsResponse, configResponse] = await Promise.all([
        fetch(WEIGHTS_API_URL),
        fetch(CONFIG_API_URL),
      ]);

      const weightsData = await weightsResponse.json();
      const configData = await configResponse.json();

      setEntries(Array.isArray(weightsData) ? weightsData : []);
      setGoal(String(configData.goal ?? 160));
    } catch {
      setError("Não foi possível conectar ao backend.");
      setEntries([]);
      setGoal("160");
    } finally {
      setLoading(false);
    }
  }

  const analytics = useMemo(() => buildAnalytics(entries, goal), [entries, goal]);

  const chartData = useMemo(() => {
    return analytics.sorted.map((item) => ({
      ...item,
      label: formatShortDate(item.date),
    }));
  }, [analytics.sorted]);

  const historyRows = useMemo(() => {
    return analytics.sorted
      .map((entry, index) => {
        const previous = analytics.sorted[index - 1];
        const delta = previous ? previous.weight - entry.weight : null;

        return {
          ...entry,
          delta,
        };
      })
      .reverse();
  }, [analytics.sorted]);

  async function handleSubmit(event) {
    event.preventDefault();

    const parsedWeight = Number(String(weight).replace(",", "."));

    if (!date || Number.isNaN(parsedWeight) || parsedWeight <= 0) return;

    try {
      setError("");

      const response = await fetch(WEIGHTS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date,
          weight: parsedWeight,
        }),
      });

      const updated = await response.json();

      setEntries(Array.isArray(updated) ? updated : []);
      setWeight("");
      setActiveView("chart");
    } catch {
      setError("Erro ao salvar o peso.");
    }
  }

  async function handleDelete(entryDate) {
    try {
      setError("");

      const response = await fetch(`${WEIGHTS_API_URL}/${entryDate}`, {
        method: "DELETE",
      });

      const updated = await response.json();

      setEntries(Array.isArray(updated) ? updated : []);
    } catch {
      setError("Erro ao remover o peso.");
    }
  }

  async function handleSaveGoal() {
    const parsedGoal = Number(String(goal).replace(",", "."));

    if (Number.isNaN(parsedGoal) || parsedGoal <= 0) return;

    try {
      setError("");

      const response = await fetch(CONFIG_API_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal: parsedGoal,
        }),
      });

      const updated = await response.json();

      setGoal(String(updated.goal));
      setGoalSaved(true);

      setTimeout(() => {
        setGoalSaved(false);
      }, 1800);
    } catch {
      setError("Erro ao salvar a meta.");
    }
  }

  function handleOpenImport() {
    importInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setImportStatus("");

      const text = await file.text();
      const backup = JSON.parse(text);

      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replace", backup })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Erro ao importar backup.");
      }

      setEntries(Array.isArray(result.weights) ? result.weights : []);
      setGoal(String(result.config?.goal ?? goal));
      setImportStatus("Backup importado com sucesso.");

      event.target.value = "";

      setTimeout(() => setImportStatus(""), 2500);
    } catch (error) {
      setImportStatus(error.message || "Erro ao importar backup.");
      event.target.value = "";
    }
  }

  function handleExportData() {
    window.open("/api/export", "_blank");
  }

  return (
    <main className="app">
      <section className="shell">
        <header className="topbar">
          <div className="brandArea">
            <div className="brandIcon">
              <Activity size={18} />
            </div>

            <div className="brandText">
              <strong>Orbis</strong>
              <span>Controle de peso</span>
            </div>
          </div>

          <div className="topMetrics">
            <div className="topMetric">
              <span>Peso atual</span>
              <strong>{formatKg(analytics.current)}</strong>
            </div>

            <div className="topMetric positive">
              <span>Total eliminado</span>
              <strong>{formatKg(analytics.totalLost)}</strong>
            </div>

            <div className="topMetric">
              <span>Progresso</span>
              <strong>{`${Math.round(analytics.progress)}%`}</strong>
            </div>
          </div>

          <div className="actionsArea">
            <div className="goalEditor">
              <span>Meta</span>

              <div className="goalValue">
                <input
                  type="number"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  onBlur={handleSaveGoal}
                />
                <small>kg</small>
              </div>

              <button type="button" onClick={handleSaveGoal}>
                <Save size={14} />
                {goalSaved ? "Salva" : "Salvar"}
              </button>
            </div>

            <button
              type="button"
              className="historyButton"
              onClick={() => setHistoryOpen(true)}
            >
              <History size={16} />
              Histórico
            </button>
          </div>
        </header>

        <section className="mainGrid">
          <aside
            className={`panel formPanel ${activeView === "register" ? "isMobileActive" : ""}`}
          >
            <div className="panelHeader">
              <div>
                <span>Novo registro</span>
                <h2>Adicionar peso</h2>
              </div>

              <Plus size={18} />
            </div>

            <form className="weightForm" onSubmit={handleSubmit}>
              <label>
                Data
                <div className="inputBox">
                  <Calendar size={16} />
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
              </label>

              <label>
                Peso
                <div className="inputBox">
                  <Scale size={16} />
                  <input
                    type="number"
                    step="0.001"
                    placeholder="176,200"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                </div>
              </label>

              <button type="submit">Salvar registro</button>
            </form>

            <div className="formFooter">
              <span>Última pesagem</span>
              <strong>
                {analytics.last ? formatFullDate(analytics.last.date) : "Nenhuma"}
              </strong>
            </div>

            {error && <div className="errorBox">{error}</div>}
          </aside>

          <section
            className={`panel chartPanel ${activeView === "chart" ? "isMobileActive" : ""}`}
          >
            <div className="chartHeader">
              <div>
                <span>Evolução</span>
                <h2>Trajetória do peso</h2>
              </div>

              <div className="chartBadge">
                <TrendingDown size={14} />
                Progresso
              </div>
            </div>

            <div className="chartCanvas">
              {loading ? (
                <div className="emptyState">
                  <Target size={34} />
                  <strong>Carregando dados</strong>
                  <span>Buscando registros salvos.</span>
                </div>
              ) : chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#89efbf" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#89efbf" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                    />

                    <XAxis
                      dataKey="label"
                      interval="preserveStartEnd"
                      minTickGap={24}
                      tick={{ fill: "#7f90a8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      width={44}
                      domain={analytics.chartDomain}
                      tick={{ fill: "#7f90a8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#101827",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 14,
                        color: "#fff",
                        boxShadow: "0 18px 40px rgba(0,0,0,.32)",
                      }}
                      labelStyle={{ color: "#89efbf", fontWeight: 800 }}
                      formatter={(value) => [formatKg(value), "Peso"]}
                    />

                    {analytics.showGoalLine && (
                      <ReferenceLine
                        y={Number(goal)}
                        stroke="#f2d57a"
                        strokeDasharray="6 6"
                      />
                    )}

                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="#89efbf"
                      strokeWidth={3}
                      fill="url(#weightGradient)"
                      dot={{
                        r: 4,
                        strokeWidth: 2,
                        fill: "#09111d",
                        stroke: "#89efbf",
                      }}
                      activeDot={{
                        r: 7,
                        fill: "#89efbf",
                        stroke: "#09111d",
                        strokeWidth: 3,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="emptyState">
                  <Target size={34} />
                  <strong>Nenhum peso registrado</strong>
                  <span>Adicione sua primeira pesagem para iniciar o gráfico.</span>
                </div>
              )}
            </div>
          </section>

          <aside
            className={`panel insightsPanel ${activeView === "summary" ? "isMobileActive" : ""}`}
          >
            <div className="panelHeader">
              <div>
                <span>Resumo inteligente</span>
                <h2>Insights</h2>
              </div>

              <Sparkles size={18} />
            </div>

            <div className="summaryHero">
              <div className="summaryMain">
                <span>Progresso até a meta</span>
                <strong>{`${Math.round(analytics.progress)}%`}</strong>
              </div>

              <div className="progressTrack">
                <div style={{ width: `${analytics.progress}%` }} />
              </div>
            </div>

            <div className="miniGrid">
              <div className="miniCard">
                <Gauge size={16} />
                <span>Semana média</span>
                <strong>{formatKg(analytics.weeklyAverage)}</strong>
              </div>

              <div className="miniCard">
                <BarChart3 size={16} />
                <span>Mês atual</span>
                <strong>{formatKg(analytics.currentMonthLost)}</strong>
              </div>

              <div className="miniCard">
                <Target size={16} />
                <span>Falta para meta</span>
                <strong>
                  {analytics.remaining !== null && analytics.remaining <= 0
                    ? "Meta batida"
                    : formatKg(analytics.remaining)}
                </strong>
              </div>

              <div className="miniCard">
                <Trophy size={16} />
                <span>Menor peso</span>
                <strong>{formatKg(analytics.lowestWeight?.weight)}</strong>
              </div>
            </div>

            <div className="sectionBlock">
              <div className="subHeader">
                <span>Highlights</span>
              </div>

              <div className="highlightList">
                <div>
                  <span>Maior sequência de queda</span>
                  <strong>{analytics.longestDropStreak.label}</strong>
                </div>

                <div>
                  <span>Maior queda entre registros</span>
                  <strong>
                    {analytics.biggestDrop
                      ? `${formatKg(analytics.biggestDrop.value)} · ${formatShortDate(
                          analytics.biggestDrop.to.date
                        )}`
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>Melhor janela</span>
                  <strong>{analytics.bestWindow.label}</strong>
                </div>

                <div>
                  <span>Melhor mês</span>
                  <strong>
                    {analytics.bestMonth
                      ? `${analytics.bestMonth.label} · ${formatKg(analytics.bestMonth.value)}`
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>Peso médio mensal</span>
                  <strong>{analytics.currentMonthAverage.label}</strong>
                </div>

                <div>
                  <span>Tendência atual</span>
                  <strong>{analytics.trend.label}</strong>
                </div>
              </div>
            </div>

            <div className="sectionBlock">
              <div className="subHeader">
                <span>Ritmo e projeção</span>
              </div>

              <div className="highlightList">
                <div>
                  <span>Últimos 30 dias</span>
                  <strong>{analytics.last30DaysLoss.label}</strong>
                </div>

                <div>
                  <span>Mês atual vs anterior</span>
                  <strong>{analytics.currentVsPreviousMonth.label}</strong>
                </div>

                <div>
                  <span>Projeção até a meta</span>
                  <strong>{analytics.goalProjection.label}</strong>
                </div>
              </div>
            </div>

            <div className="sectionBlock">
              <div className="subHeader">
                <span>Médias por janela</span>
              </div>

              <div className="averageGrid">
                {analytics.averageWindows.map((item) => (
                  <div className="averageCard" key={item.days}>
                    <span>{`${item.days} dias`}</span>
                    <strong>{formatKg(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="sectionBlock monthlySection">
              <div className="subHeader">
                <span>Perda por mês</span>
              </div>

              <div className="monthlyList">
                {analytics.monthlyLosses
                  .slice()
                  .reverse()
                  .map((month) => (
                    <div key={month.key}>
                      <span>{month.label}</span>
                      <strong>{formatKg(month.value)}</strong>
                    </div>
                  ))}
              </div>
            </div>
          </aside>
        </section>

        <nav className="mobileTabs">
          <button
            type="button"
            className={activeView === "summary" ? "active" : ""}
            onClick={() => setActiveView("summary")}
          >
            <Sparkles size={17} />
            Resumo
          </button>

          <button
            type="button"
            className={activeView === "chart" ? "active" : ""}
            onClick={() => setActiveView("chart")}
          >
            <TrendingDown size={17} />
            Gráfico
          </button>

          <button
            type="button"
            className={activeView === "register" ? "active" : ""}
            onClick={() => setActiveView("register")}
          >
            <Plus size={17} />
            Registrar
          </button>

          <button type="button" onClick={() => setHistoryOpen(true)}>
            <History size={17} />
            Histórico
          </button>
        </nav>
      </section>

      {historyOpen && (
        <div className="modalOverlay">
          <section className="historyModal">
            <header className="historyHeader">
              <div>
                <span>Registros salvos</span>
                <h2>Histórico de pesagens</h2>
              </div>

              <div className="historyActions">
                <button type="button" className="importButton" onClick={handleOpenImport}>
                  <Upload size={15} />
                  Importar backup
                </button>

                <button type="button" className="exportButton" onClick={handleExportData}>
                  <Download size={15} />
                  Exportar dados
                </button>

                <button type="button" className="closeButton" onClick={() => setHistoryOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </header>

            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hiddenFileInput"
              onChange={handleImportFile}
            />

            {importStatus && <div className="importStatus">{importStatus}</div>}

            <div className="historyTable">
              <div className="historyTableHead">
                <span>Data</span>
                <span>Peso</span>
                <span>Variação</span>
                <span></span>
              </div>

              <div className="historyTableBody">
                {historyRows.map((entry) => (
                  <div className="historyRow" key={entry.date}>
                    <span>{formatFullDate(entry.date)}</span>
                    <strong>{formatKg(entry.weight)}</strong>
                    <em>{entry.delta === null ? "Início" : formatDeltaKg(entry.delta)}</em>

                    <button type="button" onClick={() => handleDelete(entry.date)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}