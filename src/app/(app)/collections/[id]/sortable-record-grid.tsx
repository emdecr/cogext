// ============================================================================
// SORTABLE RECORD GRID
// ============================================================================
//
// A drag-and-drop reorderable grid of records within a collection.
// Uses @dnd-kit — a modern React DnD library with good accessibility.
//
// How @dnd-kit works (teaching notes):
//
// 1. DndContext — the provider that manages drag state. It tracks which
//    item is being dragged, where the pointer is, and handles events.
//
// 2. SortableContext — tells dnd-kit which items are sortable and their
//    current order. We use rectSortingStrategy (for grids) instead of
//    verticalListSortingStrategy (for single-column lists).
//
// 3. useSortable() — a hook each draggable item uses. It returns:
//    - attributes: ARIA props for accessibility (role, tabindex, etc.)
//    - listeners: event handlers for drag start (onPointerDown, etc.)
//    - setNodeRef: ref to attach to the DOM element
//    - transform: CSS transform while dragging (x/y offset)
//    - transition: CSS transition for smooth animation
//
// 4. DragOverlay — renders a "ghost" copy of the item being dragged.
//    The original item gets a reduced opacity while its ghost follows
//    the cursor. This feels more polished than moving the actual element.
//
// The flow:
//   User grabs item → onDragStart fires → we track the active item
//   User moves over other items → dnd-kit reorders the array in real-time
//   User drops → onDragEnd fires → we persist the new order via server action
// ============================================================================

"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderCollectionRecords } from "@/lib/actions/collections";
import CollectionRecordCard from "./collection-record-card";

// Same type as in the collection detail page
type CollectionRecord = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  position: number;
  tags: { id: string; name: string; isAi: boolean }[];
};

type Props = {
  collectionId: string;
  initialRecords: CollectionRecord[];
};

export default function SortableRecordGrid({
  collectionId,
  initialRecords,
}: Props) {
  // Local state for the record order. We update this optimistically
  // during drag, then persist to the server on drop.
  const [records, setRecords] = useState(initialRecords);

  // Track which item is currently being dragged (for the DragOverlay).
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRecord = records.find((r) => r.id === activeId);

  // PointerSensor with an activation distance of 5px.
  // This prevents accidental drags when clicking — you need to move
  // the pointer at least 5px before a drag starts. Without this,
  // every click would initiate a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find the old and new indices
    const oldIndex = records.findIndex((r) => r.id === active.id);
    const newIndex = records.findIndex((r) => r.id === over.id);

    // Reorder the array optimistically (instant UI feedback)
    const reordered = arrayMove(records, oldIndex, newIndex);
    setRecords(reordered);

    // Persist the new order to the database.
    // Fire and forget — the UI is already updated.
    const orderedIds = reordered.map((r) => r.id);
    await reorderCollectionRecords(collectionId, orderedIds);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={records.map((r) => r.id)}
        strategy={rectSortingStrategy}
      >
        {/* CSS Grid — items flow left-to-right, top-to-bottom.
            This matches the logical order (position 0, 10, 20...) so
            drag-and-drop makes visual sense. Unlike CSS `columns` (which
            fills top-to-bottom per column), grid flows like reading order. */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {records.map((record) => (
            <SortableRecordItem
              key={record.id}
              record={record}
              collectionId={collectionId}
              isDragging={record.id === activeId}
            />
          ))}
        </div>
      </SortableContext>

      {/* DragOverlay — the "ghost" that follows the cursor.
          Renders outside the normal flow so it can float freely.
          Portal is handled by dnd-kit internally. */}
      <DragOverlay>
        {activeRecord ? (
          <div className="rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-900">
            <CollectionRecordCard
              record={activeRecord}
              collectionId={collectionId}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ============================================================================
// SORTABLE RECORD ITEM
// ============================================================================
// Wraps a CollectionRecordCard with dnd-kit's useSortable hook.
// This is the bridge between dnd-kit's drag system and our card component.

function SortableRecordItem({
  record,
  collectionId,
  isDragging,
}: {
  record: CollectionRecord;
  collectionId: string;
  isDragging: boolean;
}) {
  const {
    attributes,   // ARIA attributes for accessibility
    listeners,    // Event handlers for drag initiation
    setNodeRef,   // Ref to attach to the DOM element
    transform,    // Current drag offset (x, y)
    transition,   // CSS transition for smooth movement
  } = useSortable({ id: record.id });

  // Convert dnd-kit's transform object to a CSS transform string.
  // CSS.Transform.toString() turns { x: 10, y: 20, scaleX: 1, scaleY: 1 }
  // into "translate3d(10px, 20px, 0) scaleX(1) scaleY(1)".
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Reduce opacity when this item is being dragged (the DragOverlay
    // shows the "real" version following the cursor).
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-start gap-2">
        {/* Drag handle — a dedicated grab area so the whole card isn't
            the drag target. This lets users click the card normally
            (for the remove button, etc.) without initiating a drag. */}
        <button
          {...attributes}
          {...listeners}
          className="mt-3 flex-shrink-0 cursor-grab rounded p-1 text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:hover:text-gray-300"
          title="Drag to reorder"
        >
          {/* Six-dot grip icon (⠿) — universal drag handle indicator */}
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="7" cy="4" r="1.5" />
            <circle cx="13" cy="4" r="1.5" />
            <circle cx="7" cy="10" r="1.5" />
            <circle cx="13" cy="10" r="1.5" />
            <circle cx="7" cy="16" r="1.5" />
            <circle cx="13" cy="16" r="1.5" />
          </svg>
        </button>

        {/* The actual card */}
        <div className="flex-1">
          <CollectionRecordCard
            record={record}
            collectionId={collectionId}
          />
        </div>
      </div>
    </div>
  );
}
