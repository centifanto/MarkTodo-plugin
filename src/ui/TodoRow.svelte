<script lang="ts">
  import { icon } from "./icon";
  import { formatTitle } from "./format";
  import { friendlyDate } from "./dates";
  import { STATUS_ICONS, PRIORITY_ICONS, PROJECT_ICON } from "./iconMaps";
  import { STATUS_LABELS, statusOf, type TodoRecord } from "../core/types";

  let {
    todo,
    today,
    showProject = false,
    onStatusClick,
    onOpenTodo,
    onReveal,
    onConvert,
  }: {
    todo: TodoRecord;
    /** Local `YYYY-MM-DD`, for the due chip's Today / Overdue tint. */
    today: string;
    showProject?: boolean;
    onStatusClick?: (todo: TodoRecord, event: MouseEvent) => void;
    /** `anchor` is the clicked row / card, so the editor can open over it. */
    onOpenTodo?: (todo: TodoRecord, anchor?: Element) => void;
    onReveal?: (todo: TodoRecord) => void;
    /** When set, unmanaged rows show a one-click Convert button (Inbox view). */
    onConvert?: (todo: TodoRecord) => void;
  } = $props();

  let status = $derived(statusOf(todo));
  let isDone = $derived(status === "DONE");
  // Narrow away NONE so PRIORITY_ICONS indexing type-checks.
  let priorityIcon = $derived(todo.priority === "NONE" ? null : PRIORITY_ICONS[todo.priority]);
  // As in the app, a noted todo shows a glyph AND its first line.
  let notePreview = $derived(todo.note.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "");
  // A done todo's due date is history, not a deadline — the app hides it too.
  let due = $derived(todo.due !== null && !isDone ? todo.due : null);
  let dueTone = $derived(due === null ? "" : due < today ? "is-overdue" : due === today ? "is-today" : "");
  let project = $derived(showProject ? todo.project : null);
</script>

<div class="marktodo-todo" class:is-done={isDone}>
  <span
    class="marktodo-status-icon is-{status.toLowerCase()}"
    role="button"
    tabindex="0"
    use:icon={STATUS_ICONS[status]}
    title={STATUS_LABELS[status]}
    aria-label={STATUS_LABELS[status]}
    onclick={(e) => onStatusClick?.(todo, e)}
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
        class="marktodo-title"
        role="button"
        tabindex="0"
        onclick={(e) => onOpenTodo?.(todo, e.currentTarget.closest(".marktodo-todo") ?? e.currentTarget)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenTodo?.(todo, e.currentTarget.closest(".marktodo-todo") ?? e.currentTarget);
          }
        }}
      >{formatTitle(todo.displayText)}</span>
      {#if notePreview}
        <span class="marktodo-line-icon marktodo-note-icon" use:icon={"sticky-note"} aria-label="Has a note"></span>
      {/if}
      {#if priorityIcon}
        <span
          class="marktodo-line-icon marktodo-priority is-{todo.priority.toLowerCase()}"
          use:icon={priorityIcon}
          title={todo.priority}
          aria-label={todo.priority}
        ></span>
      {/if}
    </div>
    {#if notePreview}
      <div class="marktodo-note-preview">{notePreview}</div>
    {/if}
    {#if due || project}
      <div class="marktodo-todo-meta">
        {#if due}
          <span class="marktodo-due-chip {dueTone}">
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
  {#if onConvert && todo.id === null}
    <button
      class="marktodo-convert"
      title="Convert to a managed todo"
      onclick={(e) => {
        e.stopPropagation();
        onConvert?.(todo);
      }}
    ><span class="marktodo-convert-icon" use:icon={"badge-check"}></span>Convert</button>
  {/if}
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
        onReveal?.(todo);
      }}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onReveal?.(todo);
        }
      }}
    ></span>
  {/if}
</div>
