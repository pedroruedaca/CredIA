"use client";

/**
 * "Personalizar": a case-view layout as a canvas of module tiles, in the same rows they will be drawn in (full width,
 * or two half-width modules side by side). Drag a tile by its handle (mouse, touch or keyboard: focus the handle,
 * Space, arrows, Space), or use the arrow buttons; switch full/half width; remove; add from the catalogue.
 * «Para revisar» can be moved but not removed. Where it is saved is chosen among `targets` (this case, its template,
 * the whole team); `resets` are the "go back to…" links for layouts saved before.
 */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Columns2, GripVertical, Plus, RectangleHorizontal, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetLayout, saveLayout, type LayoutTarget } from "@/app/casos/layout-actions";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  addModule,
  availableModules,
  DEFAULT_LAYOUT,
  MODULE_SPECS,
  KPI_TILE_GROUPS,
  maxKpiTiles,
  moduleKey,
  moduleTitle,
  MODULE_SETTINGS,
  moduleSettings,
  moveModule,
  removeModule,
  sameLayout,
  setModuleSettings,
  setModuleWidth,
  SUMMARY_FACT_IDS,
  type KpiTileId,
  type Layout,
  type ModuleId,
  type LayoutModule,
  type ModuleSettings,
  type PeriodChoice,
  type SummaryFactId,
} from "@/lib/case-view/modules";
import { KPI_TILE_GROUP_LABEL, KPI_TILE_LABEL, PERIOD_CHOICE_LABEL, SUMMARY_FACT_LABEL } from "@/content/case-view.es";
import { KPI_TILE_EXPLAIN } from "@/content/kpi-explain.es";

const SETTINGS_HINT: Partial<Record<ModuleId, string>> = {
  summary: "Elige qué cifras dice la frase.",
  kpis: "Elige qué indicadores se muestran (cinco a todo el ancho, tres a media anchura).",
  pnl: "Elige el periodo: el del caso, el cierre o el año en curso.",
  balance: "Elige el periodo: el del caso, el cierre o el año en curso.",
  review: "Elige si se ven también las comprobaciones superadas.",
};

const NO_DATA = "Sin datos en este caso";

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-soft-control hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent sm:size-9";

export interface SaveOption {
  target: LayoutTarget;
  label: string;
  hint: string;
}

export function LayoutEditor({
  initial,
  back,
  title,
  intro,
  targets,
  resets,
  tilesWithData,
}: {
  initial: Layout;
  /** Where to go after saving or cancelling. */
  back: string;
  title: string;
  intro: string;
  /** Where it can be saved; the first is preselected. */
  targets: SaveOption[];
  resets: { target: LayoutTarget; label: string }[];
  /**
   * Opened from a case: the KPI tiles that case has data for. The others are still offered (the layout may be saved
   * for the template or the team) but marked «Sin datos en este caso». Absent (template designer): nothing marked.
   */
  tilesWithData?: readonly string[];
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(initial);
  const [targetIndex, setTargetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  // Saving to another target is a change even when the modules are the same.
  const dirty = !sameLayout(layout, initial) || targetIndex !== 0;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const keys = layout.modules.map(moduleKey);
    setLayout(moveModule(layout, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))));
  };
  const save = () =>
    startSave(async () => {
      setError(null);
      const r = await saveLayout(targets[targetIndex].target, layout);
      if (!r.ok) return setError(r.message);
      router.push(back);
      router.refresh();
    });
  const reset = (target: LayoutTarget) =>
    startSave(async () => {
      setError(null);
      const r = await resetLayout(target);
      if (!r.ok) return setError(r.message);
      router.push(back);
      router.refresh();
    });
  const available = availableModules(layout);

  return (
    <section aria-labelledby="personalizar" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h2 id="personalizar" className="heading-section">{title}</h2>
          <p className="mt-1 max-w-[640px] text-[15px] text-ink-2">{intro}</p>
        </div>
        {targets.length > 1 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[13px] font-medium text-ink-2">Guardar para</legend>
            {targets.map((t, i) => (
              <label key={i} className="-mx-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-row px-3 py-2 hover:bg-soft">
                <input type="radio" name="layout-target" className="mt-1 size-4 accent-[#0E5A61]" checked={i === targetIndex} onChange={() => setTargetIndex(i)} />
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium">{t.label}</span>
                  <span className="text-[13px] text-muted">{t.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving || !dirty}>{saving ? "Guardando…" : "Guardar diseño"}</Button>
          <ButtonLink href={back} variant="secondary" size="sm">Cancelar</ButtonLink>
        </div>
      </div>
      {error && <ErrorLine message={error} />}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={layout.modules.map(moduleKey)} strategy={rectSortingStrategy}>
          <ol aria-label="Módulos del panel, en orden" className="grid gap-3 md:grid-cols-2">
            {layout.modules.map((m, i) => (
              <Tile
                key={moduleKey(m)}
                module={m}
                index={i}
                count={layout.modules.length}
                onMove={(to) => setLayout(moveModule(layout, i, to))}
                onWidth={(w) => setLayout(setModuleWidth(layout, moduleKey(m), w))}
                onRemove={() => setLayout(removeModule(layout, moduleKey(m)))}
                onSettings={(patch) => setLayout(setModuleSettings(layout, moduleKey(m), patch))}
                tilesWithData={tilesWithData}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {available.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Añadir módulo</h3>
          <ul className="flex flex-col gap-1">
            {available.map((s) => (
              <li key={s.id} className="-mx-4 flex items-center gap-3 rounded-row px-4 py-2.5 hover:bg-soft">
                <span className="flex min-w-0 grow flex-col">
                  <span className="text-[15px] font-medium">{s.title}</span>
                  <span className="text-[13px] text-muted">{s.description}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => setLayout(addModule(layout, s.id))}>
                  <Plus size={15} strokeWidth={2} aria-hidden /> {layout.modules.some((m) => m.id === s.id) ? "Añadir otro" : "Añadir"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <Button variant="link" size="sm" onClick={() => setLayout(DEFAULT_LAYOUT)} disabled={saving || sameLayout(layout, DEFAULT_LAYOUT)}>
          Volver al diseño original
        </Button>
        {resets.map((r) => (
          <span key={r.label} className="contents">
            <span aria-hidden>·</span>
            <Button variant="link" size="sm" onClick={() => reset(r.target)} disabled={saving}>{r.label}</Button>
          </span>
        ))}
      </div>
    </section>
  );
}

function Tile({
  module: m,
  index,
  count,
  onMove,
  onWidth,
  onRemove,
  onSettings,
  tilesWithData,
}: {
  module: LayoutModule;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onWidth: (w: "full" | "half") => void;
  onRemove: () => void;
  onSettings: (patch: ModuleSettings) => void;
  tilesWithData?: readonly string[];
}) {
  const spec = { ...MODULE_SPECS[m.id], title: moduleTitle(m) };
  const [open, setOpen] = useState(false);
  const hasSettings = !!MODULE_SETTINGS[m.id];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: moduleKey(m) });
  const canHalf = spec.widths.includes("half");
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        "flex min-h-[88px] flex-col gap-2 rounded-row bg-soft px-3 py-3 motion-reduce:transition-none",
        m.width === "full" && "md:col-span-2",
        isDragging && "relative z-10 shadow-float",
      )}
    >
      <div className="flex items-start gap-2">
      <Tooltip label="Arrastrar para mover" hint="Con el teclado: Espacio, flechas y Espacio para soltar.">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={cx(iconButton, "cursor-grab active:cursor-grabbing")}
          aria-label={`Mover ${spec.title} (posición ${index + 1} de ${count})`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} strokeWidth={1.8} aria-hidden />
        </button>
      </Tooltip>
      <span className="flex min-w-0 grow flex-col gap-0.5 pt-2 sm:pt-1.5">
        <span className="text-[15px] font-medium">{spec.title}</span>
        <span className="text-[13px] text-muted">{spec.description}</span>
        {!spec.removable && <span className="text-[13px] text-muted">Siempre visible.</span>}
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end">
        {hasSettings && (
          <Tooltip label="Ajustes del módulo" hint={SETTINGS_HINT[m.id] ?? "Cambia lo que muestra este módulo."}>
            <button
              type="button"
              className={cx(iconButton, open && "bg-soft-control text-ink")}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`Ajustes de ${spec.title}`}
            >
              <SlidersHorizontal size={16} strokeWidth={1.8} aria-hidden />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Subir" hint={index === 0 ? "Ya es el primero." : "También puedes arrastrarlo por el asa."}>
          <button type="button" className={iconButton} onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Subir ${spec.title}`}>
            <ArrowUp size={16} strokeWidth={1.8} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip label="Bajar" hint={index === count - 1 ? "Ya es el último." : "También puedes arrastrarlo por el asa."}>
          <button type="button" className={iconButton} onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={`Bajar ${spec.title}`}>
            <ArrowDown size={16} strokeWidth={1.8} aria-hidden />
          </button>
        </Tooltip>
        {canHalf && (
          <Tooltip
            className="hidden md:inline-flex"
            label={m.width === "full" ? "Media anchura" : "Todo el ancho"}
            hint={m.width === "full" ? "Comparte fila con el módulo de al lado si también es de media anchura." : "Ocupa la fila entera."}
          >
            <button
              type="button"
              className={iconButton}
              onClick={() => onWidth(m.width === "full" ? "half" : "full")}
              aria-label={m.width === "full" ? `Poner ${spec.title} a media anchura` : `Poner ${spec.title} a todo el ancho`}
            >
              {m.width === "full" ? <Columns2 size={16} strokeWidth={1.8} aria-hidden /> : <RectangleHorizontal size={16} strokeWidth={1.8} aria-hidden />}
            </button>
          </Tooltip>
        )}
        <Tooltip
          label={spec.removable ? "Quitar del panel" : "No se puede quitar"}
          hint={spec.removable ? "Puedes volver a ponerlo con «Añadir módulo»." : "Siempre está en el panel; sí puedes moverlo."}
        >
          <button
            type="button"
            className={iconButton}
            onClick={onRemove}
            disabled={!spec.removable}
            aria-label={spec.removable ? `Quitar ${spec.title}` : `${spec.title} no se puede quitar`}
          >
            <X size={16} strokeWidth={1.8} aria-hidden />
          </button>
        </Tooltip>
      </span>
      </div>
      {hasSettings && open && <ModuleSettingsPanel module={m} title={spec.title} onChange={onSettings} tilesWithData={tilesWithData} />}
    </li>
  );
}

const segment = (on: boolean) =>
  cx("min-h-9 rounded-full px-3 text-[13px] font-medium transition-colors", on ? "bg-surface text-ink shadow-tile" : "text-ink-2 hover:text-ink");

/** The settings a module takes, edited inside its tile. */
function ModuleSettingsPanel({
  module: m,
  title,
  onChange,
  tilesWithData,
}: {
  module: LayoutModule;
  title: string;
  onChange: (patch: ModuleSettings) => void;
  tilesWithData?: readonly string[];
}) {
  const keys = MODULE_SETTINGS[m.id] ?? [];
  const o = moduleSettings(m);
  return (
    <div role="group" aria-label={`Ajustes de ${title}`} className="ml-12 flex flex-col gap-4 border-t border-hairline pt-3 sm:ml-10">
      {keys.includes("facts") && <FactsSetting facts={o.facts} onChange={(facts) => onChange({ facts })} />}
      {keys.includes("tiles") && <TilesSetting tiles={o.tiles} max={maxKpiTiles(m.width)} withData={tilesWithData} onChange={(tiles) => onChange({ tiles })} />}
      {keys.includes("period") && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Periodo</span>
          <div role="group" aria-label={`Periodo de ${title}`} className="flex w-fit flex-wrap gap-1 rounded-full bg-soft-control p-1">
            {(Object.keys(PERIOD_CHOICE_LABEL) as PeriodChoice[]).map((p) => (
              <button key={p} type="button" aria-pressed={o.period === p} onClick={() => onChange({ period: p })} className={segment(o.period === p)}>
                {PERIOD_CHOICE_LABEL[p]}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-muted">
            {o.period === "base" ? "El ejercicio cerrado si lo hay; si no, el año en curso." : "Si el caso no tiene ese periodo, el módulo no se muestra."}
          </span>
        </div>
      )}
      {keys.includes("showPassed") && (
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-[15px]">
          <input type="checkbox" className="size-4 accent-[#0E5A61]" checked={o.showPassed} onChange={(e) => onChange({ showPassed: e.target.checked })} />
          Mostrar las verificaciones correctas
        </label>
      )}
    </div>
  );
}

/** «Resumen»: the figures the sentence states (at least one; the sentence order is fixed). */
function FactsSetting({ facts, onChange }: { facts: SummaryFactId[]; onChange: (facts: SummaryFactId[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-[13px] font-medium text-ink-2">Cifras que dice la frase</legend>
      <div className="grid sm:grid-cols-2">
        {SUMMARY_FACT_IDS.map((f) => {
          const on = facts.includes(f);
          return (
            <label key={f} className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                className="size-4 accent-[#0E5A61]"
                checked={on}
                disabled={on && facts.length === 1}
                onChange={() => onChange(on ? facts.filter((x) => x !== f) : SUMMARY_FACT_IDS.filter((x) => x === f || facts.includes(x)))}
              />
              {SUMMARY_FACT_LABEL[f]}
            </label>
          );
        })}
      </div>
      <span className="text-[13px] text-muted">Las que el caso no tenga se omiten. La frase indica siempre de qué documentos sale el ejercicio.</span>
    </fieldset>
  );
}

/**
 * «Indicadores»: the tiles shown, in order (up to `max`: 5 at full width, 3 at half), and the ones that can be added.
 * `withData` (from a case): tiles outside it are marked «Sin datos en este caso».
 */
function TilesSetting({ tiles, max, withData, onChange }: { tiles: KpiTileId[]; max: number; withData?: readonly string[]; onChange: (tiles: KpiTileId[]) => void }) {
  const noData = (t: KpiTileId) => !!withData && !withData.includes(t);
  const move = (i: number, to: number) => {
    const next = [...tiles];
    const [t] = next.splice(i, 1);
    next.splice(to, 0, t);
    onChange(next);
  };
  const groups = KPI_TILE_GROUPS.map((g) => ({ ...g, rest: g.tiles.filter((t) => !tiles.includes(t)) })).filter((g) => g.rest.length > 0);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-ink-2">Indicadores que se muestran, en orden (máximo {max}{max < 5 ? " a media anchura" : ""})</span>
      <ol aria-label="Indicadores elegidos" className="flex flex-col">
        {tiles.map((t, i) => (
          <li key={t} className="flex min-h-11 items-center gap-1">
            <span className="w-6 font-mono text-[13px] text-muted">{i + 1}</span>
            <span className="flex grow flex-col text-[15px]">
              {KPI_TILE_LABEL[t]}
              {noData(t) && <span className="text-[13px] text-muted">{NO_DATA}</span>}
            </span>
            <button type="button" className={iconButton} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Subir ${KPI_TILE_LABEL[t]}`}>
              <ArrowUp size={15} strokeWidth={1.8} aria-hidden />
            </button>
            <button type="button" className={iconButton} onClick={() => move(i, i + 1)} disabled={i === tiles.length - 1} aria-label={`Bajar ${KPI_TILE_LABEL[t]}`}>
              <ArrowDown size={15} strokeWidth={1.8} aria-hidden />
            </button>
            <button type="button" className={iconButton} onClick={() => onChange(tiles.filter((x) => x !== t))} disabled={tiles.length === 1} aria-label={`Quitar ${KPI_TILE_LABEL[t]}`}>
              <X size={15} strokeWidth={1.8} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {groups.map((g) => (
        <div key={g.id} role="group" aria-label={KPI_TILE_GROUP_LABEL[g.id]} className="flex flex-col gap-1.5 pt-1">
          <span className="text-[13px] text-muted">
            {KPI_TILE_GROUP_LABEL[g.id]}
            {withData && g.tiles.every(noData) && ` · ${NO_DATA.toLowerCase()}`}
          </span>
          <div className="flex flex-wrap gap-2">
            {g.rest.map((t) => (
              <Tooltip key={t} label={KPI_TILE_LABEL[t]} hint={KPI_TILE_EXPLAIN[t]}>
              <button
                type="button"
                disabled={tiles.length >= max}
                onClick={() => onChange([...tiles, t])}
                className={cx(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-soft-control px-3 text-left text-[13px] font-medium hover:bg-track/70 disabled:cursor-not-allowed disabled:opacity-45",
                  noData(t) ? "text-muted" : "text-ink",
                )}
                aria-label={`Añadir ${KPI_TILE_LABEL[t]}${noData(t) ? ` (${NO_DATA.toLowerCase()})` : ""}`}
              >
                <Plus size={14} strokeWidth={2} aria-hidden /> {KPI_TILE_LABEL[t]}
              </button>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
      {groups.some((g) => g.rest.some(noData) && !g.tiles.every(noData)) && <span className="text-[13px] text-muted">En gris, los que no tienen datos en este caso.</span>}
      {tiles.length >= max && <span className="text-[13px] text-muted">Quita uno para añadir otro.</span>}
      {withData && tiles.every(noData) ? (
        <span className="text-[13px] text-muted">Ninguno tiene datos en este caso: aquí el módulo no se mostrará (en otros casos, sí).</span>
      ) : (
        <span className="text-[13px] text-muted">Un indicador sin datos en el caso no se muestra: los de los extractos necesitan ficheros Norma 43.</span>
      )}
    </div>
  );
}
