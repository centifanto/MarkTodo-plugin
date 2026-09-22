<script lang="ts">
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { icon } from "./icon";
  import { formatTitle } from "./format";
  import { friendlyDate } from "./dates";
  import { STATUS_ICONS, PRIORITY_ICONS, PROJECT_ICON } from "./iconMaps";
  import { statusOf, type Status, type TodoRecord } from "../core/types";
  import { localIsoDate } from "../core/dates";
  import { type Card, type Column } from "./boardTypes";

  let {
    dragDisabled = false,
    showProject = false,
    shown = {},
    onShowMore,
    onMove,
    onReorder,
    onCardMenu,
    onOpenTodo,
    onReveal,
    onAdd,
  }: {
    dragDisabled?: boolean;
    /** Name each card's project (Todos — not a project's own board). */
    showProject?: boolean;
    /** Columns already opened past the cap, by status (remembered). */
    shown?: Record<string, number>;
    onShowMore?: (shown: Record<string, number>) => void;
    onMove?: (card: Card, toStatus: Status) => void;
    /** A card dropped at a new position in its own column. */
    onReorder?: (card: Card, anchor: Card, position: "before" | "after") => void;
    onCardMenu?: (card: Card, event: MouseEvent) => void;
    /** `anchor` is the clicked row / card, so the editor can open over it. */
    onOpenTodo?: (todo: TodoRecord, anchor?: Element) => void;
    onReveal?: (todo: TodoRecord) => void;
    /**
     * When set, each column head gets a "+" that adds a todo with its status.
     * `anchor` is the "+" itself, so the capture dialog opens over it.
     */
    onAdd?: (status: Status, anchor?: Element) => void;
  } = $props();

  // Seeded imperatively by the host via setData() right after mount, then
  // reconciled on index changes — never via reactive props, so a background
  // update can't yank the card under the pointer mid-drag.
  let columns = $state<Column[]>([]);
  let dragging = $state(false);

  const flipDurationMs = 160;

  /**
   * A column draws at most this many cards before it stops, the same cap the
   * list uses (TodoList.svelte) and for the same reason: a vault's whole Done
   * pile is thousands of card components nobody scrolls to.
   */
  const SECTION_CAP = 20;
  // svelte-ignore state_referenced_locally
  let expanded = $state<Record<string, number>>({ ...shown });
  /**
   * The VISIBLE cards per column — what the drop zones hold and what the DOM
   * draws, which svelte-dnd-action requires to be the same list. `columns` stays
   * whole, so a head still counts every card in its status.
   */
  let zones = $state<Card[][]>([]);

  const limitOf = (column: Column): number => expanded[column.status] ?? SECTION_CAP;
  const visible = (column: Column): Card[] =>
    column.cards.length <= limitOf(column) ? column.cards : column.cards.slice(0, limitOf(column));
  const hiddenIn = (column: Column): number => Math.max(0, column.cards.length - limitOf(column));

  function showMore(ci: number): void {
    const column = columns[ci];
    expanded[column.status] = limitOf(column) + SECTION_CAP;
    zones[ci] = visible(column);
    onShowMore?.(expanded);
  }

  export function setData(next: Column[]): void {
    if (dragging) return;
    columns = next;
    zones = next.map(visible);
  }
  export function isDragging(): boolean {
    return dragging;
  }

  function handleConsider(ci: number, e: CustomEvent<DndEvent<Card>>): void {
    dragging = true;
    zones[ci] = e.detail.items;
  }

  function handleFinalize(ci: number, e: CustomEvent<DndEvent<Card>>): void {
    zones[ci] = e.detail.items;
    dragging = false;
    // Any card now here whose todo status differs just landed → persist (write-behind).
    const status = columns[ci].status;
    const cards = zones[ci];
    let moved = false;
    for (const card of cards) {
      if (statusOf(card.todo) !== status) {
        onMove?.(card, status);
        moved = true;
      }
    }
    // Same-column drop → persist the new position next to a neighbor. The
    // neighbours are the ones on screen, which is where the card was dropped.
    const idx = cards.findIndex((c) => c.id === e.detail.info.id);
    if (!moved && idx !== -1) {
      const card = cards[idx];
      const prev = cards[idx - 1];
      const next = cards[idx + 1];
      if (prev) onReorder?.(card, prev, "after");
      else if (next) onReorder?.(card, next, "before");
    }
  }

  function priorityIconOf(todo: TodoRecord): string | null {
    return todo.priority === "NONE" ? null : PRIORITY_ICONS[todo.priority];
  }

  const today = localIsoDate(new Date());
  const dueOf = (todo: TodoRecord, status: Status): string | null =>
    todo.due !== null && status !== "DONE" ? todo.due : null;
  const toneOf = (due: string): string => (due < today ? "is-overdue" : due === today ? "is-today" : "");
  const hasNote = (todo: TodoRecord): boolean => todo.note.trim() !== "";
</script>

<div class="marktodo-board">
  {#each columns as column, ci (column.status)}
    <div class="marktodo-column" class:is-phase-start={column.phase !== columns[ci - 1]?.phase}>
      <div class="marktodo-section-head marktodo-column-head is-{column.status.toLowerCase()}">
        <div class="marktodo-section-toggle">
          <span class="marktodo-section-bar"></span>
          <span class="marktodo-section-label">{column.label}</span>
          <span class="marktodo-section-count">{column.cards.length}</span>
        </div>
        {#if onAdd}
          <button
            class="marktodo-section-add clickable-icon"
            aria-label={`Add todo to ${column.label}`}
            title={`Add todo to ${column.label}`}
            onclick={(e) => onAdd?.(column.status, e.currentTarget)}
          ><span use:icon={"plus"}></span></button>
        {/if}
      </div>
      <div
        class="marktodo-column-body"
        use:dndzone={{
          items: zones[ci] ?? [],
          flipDurationMs,
          // Done reads newest-completed first here too, so its cards have no
          // position to drag them into. Dropping INTO Done still works.
          dragDisabled: dragDisabled || column.status === "DONE",
          type: "marktodo-board",
          dropTargetStyle: {},
        }}
        onconsider={(e) => handleConsider(ci, e)}
        onfinalize={(e) => handleFinalize(ci, e)}
      >
        {#each zones[ci] ?? [] as card (card.id)}
          {@const pIcon = priorityIconOf(card.todo)}
          {@const due = dueOf(card.todo, column.status)}
          {@const project = showProject ? card.todo.project : null}
          <div class="marktodo-card" class:is-done={column.status === "DONE"} animate:flip={{ duration: flipDurationMs }}>
            <span
              class="marktodo-status-icon is-{column.status.toLowerCase()}"
              role="button"
              tabindex="0"
              use:icon={STATUS_ICONS[column.status]}
              title={column.label}
              aria-label={column.label}
              onclick={(e) => onCardMenu?.(card, e)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }}
            ></span>
            <div class="marktodo-todo-body">
              <div class="marktodo-todo-line">
                <span
                  class="marktodo-card-title"
                  role="button"
                  tabindex="0"
                  onclick={(e) => onOpenTodo?.(card.todo, e.currentTarget.closest(".marktodo-card") ?? e.currentTarget)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenTodo?.(card.todo, e.currentTarget.closest(".marktodo-card") ?? e.currentTarget);
                    }
                  }}
                >{formatTitle(card.todo.displayText)}</span>
                {#if hasNote(card.todo)}
                  <span class="marktodo-line-icon marktodo-note-icon" use:icon={"sticky-note"} aria-label="Has a note"></span>
                {/if}
                {#if pIcon}
                  <span
                    class="marktodo-line-icon marktodo-priority is-{card.todo.priority.toLowerCase()}"
                    use:icon={pIcon}
                  ></span>
                {/if}
              </div>
              {#if due || project}
                <div class="marktodo-todo-meta">
                  {#if due}
                    <span class="marktodo-due-chip {toneOf(due)}">
                      <span class="marktodo-meta-icon" use:icon={"calendar"}></span>{friendlyDate(due, today)}
                    </span>
                  {/if}
                  {#if project}
                    <span class="marktodo-todo-project">
                      <span class="marktodo-meta-icon" use:icon={PROJECT_ICON}></span>{project}
                    </span>
                  {/if}
                </div>
              {/if}
            </div>
            {#if onReveal}
              <span
                class="marktodo-line-icon marktodo-reveal"
                role="button"
                tabindex="0"
                use:icon={"square-arrow-out-up-right"}
                title="Open in note"
                aria-label="Open in note"
                onclick={(e) => {
                  e.stopPropagation();
                  onReveal?.(card.todo);
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onReveal?.(card.todo);
                  }
                }}
              ></span>
            {/if}
          </div>
        {/each}
      </div>
      {#if hiddenIn(column) > 0}
        <button class="marktodo-show-more" onclick={() => showMore(ci)}>
          Show {Math.min(SECTION_CAP, hiddenIn(column))} more
          <span class="marktodo-show-more-rest">{hiddenIn(column)} left</span>
        </button>
      {/if}
    </div>
  {/each}
</div>
