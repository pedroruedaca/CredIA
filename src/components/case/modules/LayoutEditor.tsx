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
import { ArrowDown, ArrowUp, Columns2, GripVertical, Plus, RectangleHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetLayout, saveLayout, type LayoutTarget } from "@/app/casos/layout-actions";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import {
  addModule,
  availableModules,
  DEFAULT_LAYOUT,
  MODULE_SPECS,
  moveModule,
  removeModule,
  sameLayout,
  setModuleWidth,
  type Layout,
  type LayoutModule,
} from "@/lib/case-view/modules";

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
}: {
  initial: Layout;
  /** Where to go after saving or cancelling. */
  back: string;
  title: string;
  intro: string;
  /** Where it can be saved; the first is preselected. */
  targets: SaveOption[];
  resets: { target: LayoutTarget; label: string }[];
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
    const ids = layout.modules.map((m) => m.id);
    setLayout(moveModule(layout, ids.indexOf(active.id as LayoutModule["id"]), ids.indexOf(over.id as LayoutModule["id"])));
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
        <SortableContext items={layout.modules.map((m) => m.id)} strategy={rectSortingStrategy}>
          <ol aria-label="Módulos del panel, en orden" className="grid gap-3 md:grid-cols-2">
            {layout.modules.map((m, i) => (
              <Tile
                key={m.id}
                module={m}
                index={i}
                count={layout.modules.length}
                onMove={(to) => setLayout(moveModule(layout, i, to))}
                onWidth={(w) => setLayout(setModuleWidth(layout, m.id, w))}
                onRemove={() => setLayout(removeModule(layout, m.id))}
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
                  <Plus size={15} strokeWidth={2} aria-hidden /> Añadir
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

function Tile({ module: m, index, count, onMove, onWidth, onRemove }: { module: LayoutModule; index: number; count: number; onMove: (to: number) => void; onWidth: (w: "full" | "half") => void; onRemove: () => void }) {
  const spec = MODULE_SPECS[m.id];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const canHalf = spec.widths.includes("half");
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        "flex min-h-[88px] items-start gap-2 rounded-row bg-soft px-3 py-3 motion-reduce:transition-none",
        m.width === "full" && "md:col-span-2",
        isDragging && "relative z-10 shadow-float",
      )}
    >
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
      <span className="flex min-w-0 grow flex-col gap-0.5 pt-2 sm:pt-1.5">
        <span className="text-[15px] font-medium">{spec.title}</span>
        <span className="text-[13px] text-muted">{spec.description}</span>
        {!spec.removable && <span className="text-[13px] text-muted">Siempre visible.</span>}
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end">
        <button type="button" className={iconButton} onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Subir ${spec.title}`}>
          <ArrowUp size={16} strokeWidth={1.8} aria-hidden />
        </button>
        <button type="button" className={iconButton} onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={`Bajar ${spec.title}`}>
          <ArrowDown size={16} strokeWidth={1.8} aria-hidden />
        </button>
        {canHalf && (
          <button
            type="button"
            className={cx(iconButton, "hidden md:inline-flex")}
            onClick={() => onWidth(m.width === "full" ? "half" : "full")}
            aria-label={m.width === "full" ? `Poner ${spec.title} a media anchura` : `Poner ${spec.title} a todo el ancho`}
            title={m.width === "full" ? "Media anchura" : "Todo el ancho"}
          >
            {m.width === "full" ? <Columns2 size={16} strokeWidth={1.8} aria-hidden /> : <RectangleHorizontal size={16} strokeWidth={1.8} aria-hidden />}
          </button>
        )}
        <button
          type="button"
          className={iconButton}
          onClick={onRemove}
          disabled={!spec.removable}
          aria-label={spec.removable ? `Quitar ${spec.title}` : `${spec.title} no se puede quitar`}
          title={spec.removable ? "Quitar" : "No se puede quitar"}
        >
          <X size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </span>
    </li>
  );
}
