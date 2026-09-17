import { type Status, type TodoRecord } from "../core/types";

/** A draggable card. `id` must be stable + unique for svelte-dnd-action. */
export interface Card {
  id: string;
  todo: TodoRecord;
}

export interface Column {
  status: Status;
  label: string;
  cards: Card[];
}

/** The imperative handle a mounted `Board` exposes to its host view. */
export interface BoardInstance {
  setData(columns: Column[]): void;
  isDragging(): boolean;
}
