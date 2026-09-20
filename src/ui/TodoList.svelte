<script lang="ts">
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import TodoRow from "./TodoRow.svelte";
  import { icon } from "./icon";
  import { PHASE_LABELS, statusOf, type Phase, type Status, type TodoRecord } from "../core/types";
  import { localIsoDate } from "../core/dates";
  import { type Card } from "./boardTypes";
  import { DEFAULT_COLLAPSED_STATUSES, isStatusCollapsed, toggleStatusSection } from "./statusSections";
  import { OVERDUE_KEY } from "./smartViews";

  interface Group {
    label: string;
    todos: TodoRecord[];
    /**
     * Stable section key. `OVERDUE_KEY` draws the band instead of an ordinary
     * heading — matched on the key, not on the word "Overdue", so the two
     * renderers agree without sharing a string of display text.
     */
    key?: string;
    /** A note group: the heading links to this file. */
    file?: string;
    status?: Status;
    /** A status group's phase — the first group of each run gets a phase heading. */
    phase?: Phase;
  }

  let {
    groups,
    total,
    emptyText = "No todos found.",
    showProject = false,
    collapsed = [],
    collapsedDefaults = DEFAULT_COLLAPSED_STATUSES,
    onToggleSection,
    onStatusClick,
    onOpenTodo,
    onReveal,
    onOpenNote,
    onConvert,
    onAdd,
    onMove,
    onReorder,
    onPullForward,
    dragDisabled = false,
  }: {
    groups: Group[];
    total: number;
    emptyText?: string;
    /** Name each todo's project under its title (Todos, Today — not a project's own list). */
    showProject?: boolean;
    /**
     * Status sections flipped away from their default fold (Done starts
     * folded). When `onToggleSection` is set, status headings fold on click.
     */
    collapsed?: string[];
    /**
     * Which statuses start folded on THIS surface — `collapsed` holds the flips
     * away from it. A project list folds Done; Today folds all but Doing.
     */
    collapsedDefaults?: readonly Status[];
    onToggleSection?: (toggled: string[]) => void;
    onStatusClick?: (todo: TodoRecord, event: MouseEvent) => void;
    /** `anchor` is the clicked row / card, so the editor can open over it. */
    onOpenTodo?: (todo: TodoRecord, anchor?: Element) => void;
    onReveal?: (todo: TodoRecord) => void;
    onOpenNote?: (file: string) => void;
    onConvert?: (todo: TodoRecord) => void;
    /**
     * When set, status groups get a "+" that adds a todo with that status.
     * `anchor` is the "+" itself, so the capture dialog opens over it.
     */
    onAdd?: (status: Status, anchor?: Element) => void;
    /**
     * Drag: when set, status groups are drop zones — dropping a
     * todo into another group changes its status (onMove), dropping it at a new
     * spot in its own group reorders it (onReorder).
     */
    onMove?: (todo: TodoRecord, toStatus: Status) => void;
    onReorder?: (todo: TodoRecord, anchor: TodoRecord, position: "before" | "after") => void;
    /**
     * When set, the overdue band gets a "Pull forward" button that re-dates the
     * todos IT is showing — only those, never every overdue todo in the vault.
     */
    onPullForward?: (todos: TodoRecord[]) => void;
    dragDisabled?: boolean;
  } = $props();

  const keyOf = (t: TodoRecord): string => t.id ?? `${t.file}:${t.line}`;
  const flipDurationMs = 160;
  const today = localIsoDate(new Date());

  // Drop-zone items per group. The view re-mounts this component on every index
  // change, so seeding once is enough (and a mid-drag update can't yank a card).
  // svelte-ignore state_referenced_locally
  let zones = $state<Card[][]>(groups.map((g) => g.todos.map((t) => ({ id: keyOf(t), todo: t }))));
  // svelte-ignore state_referenced_locally
  let toggled = $state<string[]>([...collapsed]);

  const isFolded = (group: Group): boolean =>
    onToggleSection !== undefined &&
    group.status !== undefined &&
    isStatusCollapsed(group.status, toggled, collapsedDefaults);

  /**
   * A phase heading goes above the FIRST status section of each phase — so a
   * focused list that shows only Active still says so, and a full list reads as
   * two halves rather than six equal sections.
   */
  const startsPhase = (gi: number): boolean =>
    groups[gi].phase !== undefined && groups[gi].phase !== groups[gi - 1]?.phase;

  function toggle(status: Status): void {
    toggled = toggleStatusSection(toggled, status);
    onToggleSection?.(toggled);
  }

  function consider(gi: number, e: CustomEvent<DndEvent<Card>>): void {
    zones[gi] = e.detail.items;
  }

  function finalize(gi: number, e: CustomEvent<DndEvent<Card>>): void {
    zones[gi] = e.detail.items;
    const status = groups[gi].status;
    if (!status) return;
    const cards = zones[gi];
    let moved = false;
    for (const card of cards) {
      if (statusOf(card.todo) !== status) {
        onMove?.(card.todo, status);
        moved = true;
      }
    }
    const idx = cards.findIndex((c) => c.id === e.detail.info.id);
    if (!moved && idx !== -1) {
      const prev = cards[idx - 1];
      const next = cards[idx + 1];
      if (prev) onReorder?.(cards[idx].todo, prev.todo, "after");
      else if (next) onReorder?.(cards[idx].todo, next.todo, "before");
    }
  }
</script>

{#if total === 0 && !groups.some((g) => g.status)}
  <div class="marktodo-empty">{emptyText}</div>
{:else}
  {#if total === 0}
    <div class="marktodo-empty">{emptyText}</div>
  {/if}
  {#each groups as group, gi (group.key ?? group.file ?? group.label)}
    {@const folded = isFolded(group)}
    {#if startsPhase(gi)}
      <div class="marktodo-phase-head">{PHASE_LABELS[group.phase!]}</div>
    {/if}
    <div class="marktodo-group" class:is-folded={folded}>
      {#if group.key === OVERDUE_KEY}
        <!-- A divider, not a group header: overdue is a state the list is
             warning you about, not one of the buckets it sorts into. -->
        <div class="marktodo-overdue-band">
          <span class="marktodo-overdue-label">{group.label}</span>
          <span class="marktodo-overdue-count">{group.todos.length}</span>
          {#if onPullForward}
            <button
              class="marktodo-overdue-pull"
              title="Set every overdue todo shown here to today"
              onclick={() => onPullForward?.(group.todos)}
            >Pull forward</button>
          {/if}
        </div>
      {:else if group.status}
        {@const status = group.status}
        <div class="marktodo-section-head is-{status.toLowerCase()}">
          <button
            class="marktodo-section-toggle"
            aria-expanded={!folded}
            disabled={onToggleSection === undefined}
            onclick={() => toggle(status)}
          >
            <span class="marktodo-section-bar"></span>
            <span class="marktodo-section-label">{group.label}</span>
            <span class="marktodo-section-count">{group.todos.length}</span>
            {#if onToggleSection}
              <span class="marktodo-section-chevron" use:icon={"chevron-down"}></span>
            {/if}
          </button>
          {#if onAdd}
            <button
              class="marktodo-section-add clickable-icon"
              aria-label={`Add todo to ${group.label}`}
              title={`Add todo to ${group.label}`}
              onclick={(e) => onAdd?.(status, e.currentTarget)}
            ><span use:icon={"plus"}></span></button>
          {/if}
        </div>
      {:else if group.label !== ""}
        <div class="marktodo-group-heading">
          {#if group.file && onOpenNote}
            <span
              class="marktodo-group-link"
              role="link"
              tabindex="0"
              title="Open note"
              onclick={() => onOpenNote?.(group.file!)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenNote?.(group.file!);
                }
              }}
            ><span class="marktodo-group-link-icon" use:icon={"file-text"}></span>{group.label}</span>
          {:else}
            <span class="marktodo-group-label">{group.label}</span>
          {/if}
          <span class="marktodo-group-count">{group.todos.length}</span>
        </div>
      {/if}
      {#if folded}
        <!-- folded: heading only -->
      {:else if onMove && group.status}
        <div
          class="marktodo-group-zone"
          use:dndzone={{
            items: zones[gi],
            flipDurationMs,
            dragDisabled,
            type: "marktodo-list",
            dropTargetStyle: {},
          }}
          onconsider={(e) => consider(gi, e)}
          onfinalize={(e) => finalize(gi, e)}
        >
          {#each zones[gi] as card (card.id)}
            <div animate:flip={{ duration: flipDurationMs }}>
              <TodoRow todo={card.todo} {today} {showProject} {onStatusClick} {onOpenTodo} {onReveal} {onConvert} />
            </div>
          {/each}
        </div>
      {:else}
        {#each group.todos as todo (keyOf(todo))}
          <TodoRow {todo} {today} {showProject} {onStatusClick} {onOpenTodo} {onReveal} {onConvert} />
        {/each}
      {/if}
    </div>
  {/each}
{/if}
